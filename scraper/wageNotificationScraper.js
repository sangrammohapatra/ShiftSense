/**
 * scraper/wageNotificationScraper.js — ShiftSense live wage scraper
 *
 * Attempts to scrape updated minimum wage notifications from the Indian
 * Ministry of Labour & Employment portal (labour.gov.in) and state labour
 * department pages. Inserts new WageRule documents when a rate newer than
 * the current DB record is found.
 *
 * Design principles:
 *   - Non-destructive: never deletes existing WageRule records (full history kept)
 *   - Defensive: every state scrape is wrapped in try/catch so one failure
 *     doesn't abort the entire run
 *   - Idempotent: only inserts when effective_from is newer than DB record
 *   - Honest: logs clearly when scraping succeeds, partially succeeds, or fails
 *
 * Reality of Indian government portals:
 *   labour.gov.in is frequently unavailable, uses Flash/PDF tables, or
 *   restructures pages without notice. This scraper implements a best-effort
 *   strategy: attempt the live portal, fall back gracefully, and log clearly.
 *   Production deployments should treat this as a supplement to manual updates,
 *   not a fully automated replacement.
 *
 * Export:
 *   runScraper() — called by cron.js
 */

import puppeteer  from "puppeteer";
import mongoose   from "mongoose";
import dotenv     from "dotenv";
import path       from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../server/.env") });

// ─── Inline WageRule schema ────────────────────────────────────────────────────
const WageRuleSchema = new mongoose.Schema({
  state:            { type: String, required: true, uppercase: true },
  occupation:       { type: String, required: true },
  daily_rate:       { type: Number, required: true },
  effective_from:   { type: Date,   required: true },
  notification_ref: { type: String },
  created_at:       { type: Date,   default: Date.now },
});
WageRuleSchema.index({ state: 1, occupation: 1, effective_from: -1 });
WageRuleSchema.statics.findCurrent = async function (state, occupation) {
  return this.findOne({
    state: state.toUpperCase(),
    occupation,
    effective_from: { $lte: new Date() },
  }).sort({ effective_from: -1 });
};
const WageRule = mongoose.models.WageRule || mongoose.model("WageRule", WageRuleSchema);

// ─── Target states & scrape config ────────────────────────────────────────────
const TARGET_STATES = ["MH", "DL", "KA", "WB", "TN", "UP", "GJ", "RJ", "HR", "AP"];
const OCCUPATIONS   = ["construction", "security", "domestic", "factory", "driver"];

/**
 * State-specific scraping configuration.
 * Each entry defines where to look and how to interpret what's found.
 *
 * url: primary target page
 * fallback_url: secondary attempt if primary 404s or times out
 * selector: CSS selector for the wage data table/section
 * notes: human-readable explanation of the data source
 */
const STATE_CONFIG = {
  MH: {
    url:          "https://mahakamgar.maharashtra.gov.in/minimum-wages.htm",
    fallback_url: "https://labour.gov.in/sites/default/files/MW_MH.pdf",
    selector:     "table.wage-table, .minimum-wage-table, table",
    notes:        "Maharashtra Labour Dept — revised April and October",
  },
  DL: {
    url:          "https://labour.delhi.gov.in/content/minimum-wages",
    fallback_url: "https://labour.gov.in/sites/default/files/MW_DL.pdf",
    selector:     "table, .wages-table",
    notes:        "Delhi Labour Dept — revised April and October",
  },
  KA: {
    url:          "https://labour.karnataka.gov.in/english/Pages/MinimumWages.aspx",
    fallback_url: "https://labour.gov.in/sites/default/files/MW_KA.pdf",
    selector:     "table, .min-wages",
    notes:        "Karnataka Labour Dept — annual revision",
  },
  WB: {
    url:          "https://wblc.gov.in/minimum-wage",
    fallback_url: "https://labour.gov.in/sites/default/files/MW_WB.pdf",
    selector:     "table, .wage-notification",
    notes:        "West Bengal Labour Commissioner — biannual revision",
  },
  TN: {
    url:          "https://labour.tn.gov.in/MinimumWages",
    fallback_url: "https://labour.gov.in/sites/default/files/MW_TN.pdf",
    selector:     "table.table, #minimum-wages-table",
    notes:        "Tamil Nadu Labour Dept — April revision",
  },
  UP: {
    url:          "https://uplabour.gov.in/minimum-wages",
    fallback_url: "https://labour.gov.in/sites/default/files/MW_UP.pdf",
    selector:     "table, .mw-table",
    notes:        "UP Labour Dept — biannual revision",
  },
  GJ: {
    url:          "https://labour.gujarat.gov.in/minimum-wages",
    fallback_url: "https://labour.gov.in/sites/default/files/MW_GJ.pdf",
    selector:     "table, .wage-data",
    notes:        "Gujarat Labour Dept — April revision",
  },
  RJ: {
    url:          "https://labour.rajasthan.gov.in/MinimumWages.aspx",
    fallback_url: "https://labour.gov.in/sites/default/files/MW_RJ.pdf",
    selector:     "table.min-wage, table",
    notes:        "Rajasthan Labour Dept — annual revision",
  },
  HR: {
    url:          "https://hrylabour.gov.in/staticdocs/minimumwages",
    fallback_url: "https://labour.gov.in/sites/default/files/MW_HR.pdf",
    selector:     "table, .wage-notification",
    notes:        "Haryana Labour Dept — biannual revision",
  },
  AP: {
    url:          "https://labour.ap.gov.in/APOLS/MinimumWages.aspx",
    fallback_url: "https://labour.gov.in/sites/default/files/MW_AP.pdf",
    selector:     "table, .mw-list",
    notes:        "Andhra Pradesh Labour Dept — April revision",
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Sleep for ms milliseconds — used for polite crawl delays */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Attempts to navigate Puppeteer to a URL with a timeout.
 * Returns true if navigation succeeded (HTTP 200), false otherwise.
 *
 * @param {import("puppeteer").Page} page
 * @param {string} url
 * @param {number} timeoutMs
 */
const tryNavigate = async (page, url, timeoutMs = 15_000) => {
  try {
    const response = await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout:   timeoutMs,
    });
    return response?.status() === 200;
  } catch {
    return false;
  }
};

/**
 * Attempts to extract wage table data from the current Puppeteer page.
 * Looks for <table> elements with numeric cells that could be daily rates.
 *
 * Returns an array of { occupation, daily_rate, raw_text } objects found,
 * or an empty array if nothing parseable was found.
 *
 * This is necessarily heuristic — government page structures vary widely.
 *
 * @param {import("puppeteer").Page} page
 * @param {string} state
 * @returns {Promise<Array<{ occupation: string, daily_rate: number, raw_text: string }>>}
 */
const extractWageData = async (page, state) => {
  return page.evaluate((occupations) => {
    const results = [];

    // Keyword maps for occupation detection in table row text
    const OCC_KEYWORDS = {
      construction: ["construction", "building", "mason", "nirman", "civil work"],
      security:     ["security", "guard", "watchman", "chowkidar"],
      domestic:     ["domestic", "household", "ghar", "sweeper", "housekeeping"],
      factory:      ["factory", "manufacturing", "industrial", "machine operator", "mill"],
      driver:       ["driver", "transport", "motor", "vehicle", "chalak"],
    };

    // Rate sanity bounds — daily rates for Indian states (₹300–₹1200)
    const MIN_PLAUSIBLE = 300;
    const MAX_PLAUSIBLE = 1200;

    const tables = document.querySelectorAll("table");

    tables.forEach((table) => {
      const rows = table.querySelectorAll("tr");
      rows.forEach((row) => {
        const cells    = Array.from(row.querySelectorAll("td, th"));
        const rowText  = cells.map((c) => c.textContent.trim().toLowerCase()).join(" ");

        // Try to find which occupation this row relates to
        let matchedOcc = null;
        for (const [occ, keywords] of Object.entries(OCC_KEYWORDS)) {
          if (keywords.some((kw) => rowText.includes(kw))) {
            matchedOcc = occ;
            break;
          }
        }

        if (!matchedOcc) return;

        // Extract numeric values from the row — look for plausible daily rates
        const numbers = rowText.match(/\d+(\.\d+)?/g) || [];
        const rates   = numbers
          .map(Number)
          .filter((n) => n >= MIN_PLAUSIBLE && n <= MAX_PLAUSIBLE);

        if (rates.length > 0) {
          // Take the first plausible number as the daily rate
          results.push({
            occupation: matchedOcc,
            daily_rate: Math.round(rates[0]),
            raw_text:   rowText.slice(0, 200),
          });
        }
      });
    });

    return results;
  }, OCCUPATIONS);
};

// ─── Per-state scrape function ─────────────────────────────────────────────────
/**
 * Scrapes the minimum wage portal for one state.
 * Compares found rates against current DB values.
 * Only inserts if a genuinely newer effective date is found.
 *
 * @param {import("puppeteer").Browser} browser
 * @param {string} state  2-letter code
 * @returns {Promise<{ state, inserted: number, skipped: number, error: string|null }>}
 */
const scrapeState = async (browser, state) => {
  const config = STATE_CONFIG[state];
  const result = { state, inserted: 0, skipped: 0, error: null };

  let page;
  try {
    page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (compatible; ShiftSense-WageScraper/1.0; +https://shiftsense.in/scraper)"
    );
    // Block images and fonts — we only need text content
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      if (["image", "font", "stylesheet", "media"].includes(req.resourceType())) {
        req.abort();
      } else {
        req.continue();
      }
    });

    // Attempt primary URL, fall back to secondary
    const primaryOk = await tryNavigate(page, config.url);
    if (!primaryOk) {
      console.log(`  [${state}] Primary URL failed — trying fallback…`);
      const fallbackOk = await tryNavigate(page, config.fallback_url);
      if (!fallbackOk) {
        result.error = "Both primary and fallback URLs unreachable.";
        return result;
      }
    }

    // Short wait for any lazy-loaded content
    await sleep(1500);

    // Extract wage data from page tables
    const extracted = await extractWageData(page, state);

    if (extracted.length === 0) {
      console.log(`  [${state}] ⚠️  No parseable wage data found on page.`);
      result.error = "No wage data found in page tables.";
      return result;
    }

    // Determine a reasonable effective date — use the 1st of current month
    // (scrapers run monthly; the data found likely reflects current rates)
    const now           = new Date();
    const effectiveFrom = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

    for (const item of extracted) {
      // Compare with current DB record
      const current = await WageRule.findCurrent(state, item.occupation);

      if (current) {
        // Only insert if the scraped effective date is newer
        if (effectiveFrom <= current.effective_from) {
          result.skipped++;
          continue;
        }

        // Sanity-check: reject suspiciously large changes (>40% swing)
        const pctChange = Math.abs(item.daily_rate - current.daily_rate) / current.daily_rate;
        if (pctChange > 0.40) {
          console.warn(
            `  [${state}/${item.occupation}] ⚠️  Suspicious rate change ` +
            `(${current.daily_rate} → ${item.daily_rate}, ${(pctChange * 100).toFixed(1)}%). Skipped.`
          );
          result.skipped++;
          continue;
        }
      }

      // Insert new WageRule — do not touch old records
      await WageRule.create({
        state,
        occupation:       item.occupation,
        daily_rate:       item.daily_rate,
        effective_from:   effectiveFrom,
        notification_ref: `SCRAPED/${state}/${effectiveFrom.toISOString().slice(0, 7)}`,
      });

      console.log(
        `  [${state}/${item.occupation}] ✅  Inserted ₹${item.daily_rate}/day ` +
        `(effective ${effectiveFrom.toISOString().slice(0, 10)})`
      );
      result.inserted++;
    }
  } catch (err) {
    result.error = err.message;
  } finally {
    if (page) await page.close().catch(() => {});
  }

  return result;
};

// ─── Main runScraper export ────────────────────────────────────────────────────
/**
 * Launches Puppeteer, scrapes all target states sequentially (to avoid
 * hammering government servers), logs results, and returns a summary.
 *
 * @returns {Promise<{ totalInserted: number, totalSkipped: number, errors: string[] }>}
 */
export const runScraper = async () => {
  const startTime = Date.now();
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`[Scraper] Starting wage scrape — ${new Date().toISOString()}`);
  console.log(`[Scraper] Target states: ${TARGET_STATES.join(", ")}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  let browser;
  const summary = { totalInserted: 0, totalSkipped: 0, errors: [] };

  try {
    browser = await puppeteer.launch({
      headless:   "new",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage", // important in Docker/CI environments
        "--disable-gpu",
      ],
    });

    for (const state of TARGET_STATES) {
      console.log(`[Scraper] Processing ${state}…`);
      const result = await scrapeState(browser, state);

      summary.totalInserted += result.inserted;
      summary.totalSkipped  += result.skipped;

      if (result.error) {
        console.warn(`  [${state}] ❌  Error: ${result.error}`);
        summary.errors.push(`${state}: ${result.error}`);
      } else {
        console.log(
          `  [${state}] Done — inserted: ${result.inserted}, skipped: ${result.skipped}`
        );
      }

      // Polite delay between states — government portals rate-limit aggressively
      await sleep(3000);
    }
  } catch (err) {
    console.error("[Scraper] Fatal browser error:", err.message);
    summary.errors.push(`FATAL: ${err.message}`);
  } finally {
    if (browser) await browser.close().catch(() => {});
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`[Scraper] Run complete in ${elapsed}s`);
  console.log(`[Scraper] Total inserted : ${summary.totalInserted}`);
  console.log(`[Scraper] Total skipped  : ${summary.totalSkipped}`);
  console.log(`[Scraper] Errors         : ${summary.errors.length}`);
  if (summary.errors.length > 0) {
    summary.errors.forEach((e) => console.warn(`           ⚠️  ${e}`));
  }
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  return summary;
};

// ─── Standalone execution ─────────────────────────────────────────────────────
// Run directly: node scraper/wageNotificationScraper.js
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error("MONGO_URI not set.");
    process.exit(1);
  }
  mongoose.connect(uri)
    .then(() => runScraper())
    .then(() => mongoose.disconnect())
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
