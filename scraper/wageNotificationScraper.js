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

import puppeteer from "puppeteer";
import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../server/.env") });

const GEMINI_MODEL = "gemini-2.5-flash";

const WageRuleSchema = new mongoose.Schema({
  state: { type: String, required: true, uppercase: true },
  occupation: { type: String, required: true },
  daily_rate: { type: Number, required: true },
  effective_from: { type: Date, required: true },
  notification_ref: { type: String },
  created_at: { type: Date, default: Date.now },
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

const TARGET_STATES = ["MH", "DL", "KA", "WB", "TN", "UP", "GJ", "RJ", "HR", "AP", "OD"];
const OCCUPATIONS = ["construction", "security", "domestic", "factory", "driver"];

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
    url: "https://mahakamgar.maharashtra.gov.in/minimum-wages.htm",
    fallback_url: "https://labour.gov.in/sites/default/files/MW_MH.pdf",
    selector: "table.wage-table, .minimum-wage-table, table",
    notes: "Maharashtra Labour Dept",
  },
  DL: {
    url: "https://labour.delhi.gov.in/content/minimum-wages",
    fallback_url: "https://labour.gov.in/sites/default/files/MW_DL.pdf",
    selector: "table, .wages-table",
    notes: "Delhi Labour Dept",
  },
  KA: {
    url: "https://labour.karnataka.gov.in/english/Pages/MinimumWages.aspx",
    fallback_url: "https://labour.gov.in/sites/default/files/MW_KA.pdf",
    selector: "table, .min-wages",
    notes: "Karnataka Labour Dept",
  },
  WB: {
    url: "https://wblc.gov.in/minimum-wage",
    fallback_url: "https://labour.gov.in/sites/default/files/MW_WB.pdf",
    selector: "table, .wage-notification",
    notes: "West Bengal Labour Commissioner",
  },
  TN: {
    url: "https://labour.tn.gov.in/MinimumWages",
    fallback_url: "https://labour.gov.in/sites/default/files/MW_TN.pdf",
    selector: "table.table, #minimum-wages-table",
    notes: "Tamil Nadu Labour Dept",
  },
  UP: {
    url: "https://uplabour.gov.in/minimum-wages",
    fallback_url: "https://labour.gov.in/sites/default/files/MW_UP.pdf",
    selector: "table, .mw-table",
    notes: "UP Labour Dept",
  },
  GJ: {
    url: "https://labour.gujarat.gov.in/minimum-wages",
    fallback_url: "https://labour.gov.in/sites/default/files/MW_GJ.pdf",
    selector: "table, .wage-data",
    notes: "Gujarat Labour Dept",
  },
  RJ: {
    url: "https://labour.rajasthan.gov.in/MinimumWages.aspx",
    fallback_url: "https://labour.gov.in/sites/default/files/MW_RJ.pdf",
    selector: "table.min-wage, table",
    notes: "Rajasthan Labour Dept",
  },
  HR: {
    url: "https://hrylabour.gov.in/staticdocs/minimumwages",
    fallback_url: "https://labour.gov.in/sites/default/files/MW_HR.pdf",
    selector: "table, .wage-notification",
    notes: "Haryana Labour Dept",
  },
  AP: {
    url: "https://labour.ap.gov.in/APOLS/MinimumWages.aspx",
    fallback_url: "https://labour.gov.in/sites/default/files/MW_AP.pdf",
    selector: "table, .mw-list",
    notes: "Andhra Pradesh Labour Dept",
  },
  OD: {
    url: "https://labourdirectorate.odisha.gov.in/notifications-guidelines",
    fallback_url: null,
    selector: "table, tr, a",
    notes: "Odisha Labour Directorate notifications",
  },
};

const ODISHA_SKILL_MAP = {
  construction: "unskilled",
  domestic: "unskilled",
  security: "semi_skilled",
  factory: "skilled",
  driver: "highly_skilled",
};

const ODISHA_NOTIFICATION_PATTERNS = [
  /minimum wages with vda/i,
  /revised time-rated minimum wages/i,
  /vda\s*w\.?\s*e\.?\s*f/i,
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const tryNavigate = async (page, url, timeoutMs = 15_000) => {
  try {
    const response = await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: timeoutMs,
    });
    return response?.status() === 200;
  } catch {
    return false;
  }
};

const extractWageData = async (page) => {
  return page.evaluate(() => {
    const results = [];

    const OCC_KEYWORDS = {
      construction: ["construction", "building", "mason", "nirman", "civil work"],
      security: ["security", "guard", "watchman", "chowkidar"],
      domestic: ["domestic", "household", "ghar", "sweeper", "housekeeping"],
      factory: ["factory", "manufacturing", "industrial", "machine operator", "mill"],
      driver: ["driver", "transport", "motor", "vehicle", "chalak"],
    };

    // Rate sanity bounds — daily rates for Indian states (₹300–₹1200)
    const MIN_PLAUSIBLE = 300;
    const MAX_PLAUSIBLE = 1200;

    const tables = document.querySelectorAll("table");

    tables.forEach((table) => {
      const rows = table.querySelectorAll("tr");
      rows.forEach((row) => {
        const cells = Array.from(row.querySelectorAll("td, th"));
        const rowText = cells
          .map((cell) => cell.textContent.trim().toLowerCase())
          .join(" ");

        // Try to find which occupation this row relates to
        let matchedOcc = null;
        for (const [occupation, keywords] of Object.entries(OCC_KEYWORDS)) {
          if (keywords.some((keyword) => rowText.includes(keyword))) {
            matchedOcc = occupation;
            break;
          }
        }

        if (!matchedOcc) return;

        // Extract numeric values from the row — look for plausible daily rates
        const numbers = rowText.match(/\d+(\.\d+)?/g) || [];
        const rates = numbers
          .map(Number)
          .filter((value) => value >= MIN_PLAUSIBLE && value <= MAX_PLAUSIBLE);

        if (rates.length > 0) {
          // Take the first plausible number as the daily rate
          results.push({
            occupation: matchedOcc,
            daily_rate: Math.round(rates[0]),
            raw_text: rowText.slice(0, 200),
          });
        }
      });
    });

    return results;
  });
};

const parseNumericDate = (dateText) => {
  const match = String(dateText).match(/\b(\d{1,2})[./-](\d{1,2})[./-](\d{4})\b/);
  if (!match) return null;

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  if (!day || !month || !year) return null;

  return new Date(Date.UTC(year, month - 1, day));
};

const parseMonthNameDate = (dateText) => {
  const months = {
    january: 0,
    february: 1,
    march: 2,
    april: 3,
    may: 4,
    june: 5,
    july: 6,
    august: 7,
    september: 8,
    october: 9,
    november: 10,
    december: 11,
  };

  const match = String(dateText)
    .toLowerCase()
    .match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+),\s*(\d{4})\b/);

  if (!match) return null;

  const day = Number(match[1]);
  const month = months[match[2]];
  const year = Number(match[3]);

  if (!day || month === undefined || !year) return null;

  return new Date(Date.UTC(year, month, day));
};

const parseEffectiveDate = (text) => {
  return parseNumericDate(text) || parseMonthNameDate(text) || null;
};

const dateToIso = (date) => date.toISOString().slice(0, 10);

const stripCodeFences = (text) =>
  String(text)
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

const callGeminiWithPdf = async (pdfBuffer, prompt) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set. Odisha scraping requires Gemini.");
  }

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}` +
    `:generateContent?key=${apiKey}`;

  const body = {
    system_instruction: {
      parts: [{ text: prompt }],
    },
    contents: [
      {
        role: "user",
        parts: [
          { text: "Extract the Odisha minimum wage rates from this official PDF." },
          {
            inlineData: {
              mimeType: "application/pdf",
              data: pdfBuffer.toString("base64"),
            },
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0,
      maxOutputTokens: 300,
    },
  };

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini API error ${response.status}: ${errText}`);
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  return stripCodeFences(text);
};

const fetchPdfBuffer = async (url) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`PDF download failed with status ${response.status}`);
  }

  return Buffer.from(await response.arrayBuffer());
};

const extractOdishaNotification = async (page) => {
  const ok = await tryNavigate(page, STATE_CONFIG.OD.url, 20_000);
  if (!ok) {
    throw new Error("Odisha notifications page is unreachable.");
  }

  await sleep(1500);

  const notifications = await page.evaluate((patterns) => {
    const isRelevant = (text) =>
      patterns.some((pattern) => new RegExp(pattern, "i").test(text));

    const fromRows = Array.from(document.querySelectorAll("tr"))
      .map((row) => {
        const cells = Array.from(row.querySelectorAll("td, th"));
        const title =
          cells[1]?.textContent?.replace(/\s+/g, " ").trim() ||
          row.textContent?.replace(/\s+/g, " ").trim() ||
          "";
        const publishedDate =
          cells[3]?.textContent?.replace(/\s+/g, " ").trim() || "";
        const link =
          row.querySelector('a[href$=".pdf"]') ||
          row.querySelector('a[href*="/sites/default/files/"]');

        if (!title || !link || !isRelevant(title)) return null;

        return {
          title,
          pdf_url: link.href,
          published_date: publishedDate,
        };
      })
      .filter(Boolean);

    if (fromRows.length > 0) return fromRows;

    return Array.from(document.querySelectorAll('a[href$=".pdf"], a[href*="/sites/default/files/"]'))
      .map((link) => {
        const title = link.closest("tr")?.textContent?.replace(/\s+/g, " ").trim()
          || link.textContent?.replace(/\s+/g, " ").trim()
          || "";

        if (!title || !isRelevant(title)) return null;

        return {
          title,
          pdf_url: link.href,
          published_date: "",
        };
      })
      .filter(Boolean);
  }, ODISHA_NOTIFICATION_PATTERNS.map((pattern) => pattern.source));

  if (notifications.length === 0) {
    throw new Error("No Odisha wage notifications were found on the listing page.");
  }

  const ranked = notifications
    .map((item) => {
      const effectiveDate = parseEffectiveDate(item.title);
      const publishedDate = parseEffectiveDate(item.published_date);

      return {
        ...item,
        effectiveDate,
        publishedDate,
      };
    })
    .sort((a, b) => {
      const aTime = (a.effectiveDate || a.publishedDate || new Date(0)).getTime();
      const bTime = (b.effectiveDate || b.publishedDate || new Date(0)).getTime();
      return bTime - aTime;
    });

  const latest = ranked[0];
  if (!latest.effectiveDate) {
    throw new Error(
      `Could not determine Odisha effective date from notification title: "${latest.title}"`
    );
  }

  return latest;
};

const extractOdishaSkillRates = async (notification) => {
  const pdfBuffer = await fetchPdfBuffer(notification.pdf_url);

  const prompt = [
    "You are extracting structured data from an official Odisha labour PDF.",
    "Return ONLY valid JSON with this exact shape:",
    "{",
    '  "notification_ref": "string or null",',
    '  "unskilled": number or null,',
    '  "semi_skilled": number or null,',
    '  "skilled": number or null,',
    '  "highly_skilled": number or null',
    "}",
    "",
    "Rules:",
    "- Extract the daily minimum wage rates for the notification currently in force.",
    "- Use the final wage figures visible in the PDF, not draft or superseded values.",
    "- notification_ref should be the official notification number if visible.",
    "- Return integers where possible.",
    "- Do not include markdown or explanation.",
  ].join("\n");

  const rawJson = await callGeminiWithPdf(pdfBuffer, prompt);

  let parsed;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    throw new Error(`Gemini returned non-JSON Odisha output: ${rawJson.slice(0, 200)}`);
  }

  const keys = ["unskilled", "semi_skilled", "skilled", "highly_skilled"];
  for (const key of keys) {
    if (!Number.isFinite(parsed?.[key])) {
      throw new Error(`Gemini Odisha extraction is missing "${key}".`);
    }
  }

  return {
    notification_ref:
      String(parsed.notification_ref || "").trim() ||
      path.basename(new URL(notification.pdf_url).pathname),
    unskilled: Math.round(parsed.unskilled),
    semi_skilled: Math.round(parsed.semi_skilled),
    skilled: Math.round(parsed.skilled),
    highly_skilled: Math.round(parsed.highly_skilled),
  };
};

const buildOdishaOccupationRates = (rates, effectiveFrom, notificationRef) => {
  const skillRates = {
    unskilled: rates.unskilled,
    semi_skilled: rates.semi_skilled,
    skilled: rates.skilled,
    highly_skilled: rates.highly_skilled,
  };

  return OCCUPATIONS.map((occupation) => ({
    occupation,
    daily_rate: skillRates[ODISHA_SKILL_MAP[occupation]],
    effective_from: effectiveFrom,
    notification_ref: `ODISHA/${notificationRef}`,
  }));
};

const persistItems = async (state, items, result) => {
  for (const item of items) {
    const current = await WageRule.findCurrent(state, item.occupation);

    if (current) {
      if (item.effective_from <= current.effective_from) {
        result.skipped++;
        continue;
      }

      const pctChange = Math.abs(item.daily_rate - current.daily_rate) / current.daily_rate;
      if (pctChange > 0.4) {
        console.warn(
          `  [${state}/${item.occupation}] Suspicious rate change ` +
            `(${current.daily_rate} -> ${item.daily_rate}, ${(pctChange * 100).toFixed(1)}%). Skipped.`
        );
        result.skipped++;
        continue;
      }
    }

    await WageRule.create({
      state,
      occupation: item.occupation,
      daily_rate: item.daily_rate,
      effective_from: item.effective_from,
      notification_ref: item.notification_ref,
    });

    console.log(
      `  [${state}/${item.occupation}] Inserted Rs.${item.daily_rate}/day ` +
        `(effective ${dateToIso(item.effective_from)})`
    );
    result.inserted++;
  }
};

const scrapeOdisha = async (page, result) => {
  const notification = await extractOdishaNotification(page);
  const skillRates = await extractOdishaSkillRates(notification);
  const effectiveFrom = notification.effectiveDate;

  console.log(
    `  [OD] Latest notification: ${notification.title} (${dateToIso(effectiveFrom)})`
  );

  const items = buildOdishaOccupationRates(
    skillRates,
    effectiveFrom,
    skillRates.notification_ref
  );

  await persistItems("OD", items, result);
};

const scrapeGenericState = async (page, state, config, result) => {
  const primaryOk = await tryNavigate(page, config.url);
  if (!primaryOk) {
    console.log(`  [${state}] Primary URL failed, trying fallback...`);

    if (!config.fallback_url) {
      result.error = "Primary URL unreachable and no fallback is configured.";
      return;
    }

    const fallbackOk = await tryNavigate(page, config.fallback_url);
    if (!fallbackOk) {
      result.error = "Both primary and fallback URLs are unreachable.";
      return;
    }
  }

  await sleep(1500);

  const extracted = await extractWageData(page);
  if (extracted.length === 0) {
    result.error = "No wage data found in page tables.";
    return;
  }

  const now = new Date();
  const effectiveFrom = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const items = extracted.map((item) => ({
    occupation: item.occupation,
    daily_rate: item.daily_rate,
    effective_from: effectiveFrom,
    notification_ref: `SCRAPED/${state}/${effectiveFrom.toISOString().slice(0, 7)}`,
  }));

  await persistItems(state, items, result);
};

const scrapeState = async (browser, state) => {
  const config = STATE_CONFIG[state];
  const result = { state, inserted: 0, skipped: 0, error: null };

  let page;
  try {
    page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (compatible; ShiftSense-WageScraper/1.1; +https://shiftsense.in/scraper)"
    );
    // Block images and fonts — we only need text content
    await page.setRequestInterception(true);
    page.on("request", (request) => {
      if (["image", "font", "stylesheet", "media"].includes(request.resourceType())) {
        request.abort();
      } else {
        request.continue();
      }
    });

    if (state === "OD") {
      await scrapeOdisha(page, result);
    } else {
      await scrapeGenericState(page, state, config, result);
    }
  } catch (error) {
    result.error = error.message;
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
  console.log("\n==============================================================");
  console.log(`[Scraper] Starting wage scrape at ${new Date().toISOString()}`);
  console.log(`[Scraper] Target states: ${TARGET_STATES.join(", ")}`);
  console.log("==============================================================\n");

  let browser;
  const summary = { totalInserted: 0, totalSkipped: 0, errors: [] };

  try {
    browser = await puppeteer.launch({
      headless: "new",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage", // important in Docker/CI environments
        "--disable-gpu",
      ],
    });

    for (const state of TARGET_STATES) {
      console.log(`[Scraper] Processing ${state}...`);
      const result = await scrapeState(browser, state);

      summary.totalInserted += result.inserted;
      summary.totalSkipped += result.skipped;

      if (result.error) {
        console.warn(`  [${state}] Error: ${result.error}`);
        summary.errors.push(`${state}: ${result.error}`);
      } else {
        console.log(
          `  [${state}] Done. inserted=${result.inserted}, skipped=${result.skipped}`
        );
      }

      await sleep(3000);
    }
  } catch (error) {
    console.error("[Scraper] Fatal browser error:", error.message);
    summary.errors.push(`FATAL: ${error.message}`);
  } finally {
    if (browser) await browser.close().catch(() => {});
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log("\n==============================================================");
  console.log(`[Scraper] Run complete in ${elapsed}s`);
  console.log(`[Scraper] Total inserted : ${summary.totalInserted}`);
  console.log(`[Scraper] Total skipped  : ${summary.totalSkipped}`);
  console.log(`[Scraper] Errors         : ${summary.errors.length}`);
  if (summary.errors.length > 0) {
    summary.errors.forEach((error) => console.warn(`           - ${error}`));
  }
  console.log("==============================================================\n");

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

  mongoose
    .connect(uri)
    .then(() => runScraper())
    .then(() => mongoose.disconnect())
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
