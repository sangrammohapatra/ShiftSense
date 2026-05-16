/**
 * scraper/cron.js — ShiftSense monthly wage scraper scheduler
 *
 * Schedules runScraper() to execute on the 1st of every month at 02:00 AM IST.
 * IST is UTC+5:30, so 02:00 IST = 20:30 UTC of the previous day.
 * node-cron schedules in server local time by default; if the server is in IST
 * (most Indian VPS/EC2 instances), "0 2 1 * *" works directly.
 * If server TZ is UTC, use "30 20 L * *" (20:30 UTC on the last day) or
 * set TZ=Asia/Kolkata in the process environment.
 *
 * The cron expression "0 2 1 * *" means:
 *   minute=0, hour=2, day-of-month=1, any month, any weekday
 *
 * Run:
 *   TZ=Asia/Kolkata node scraper/cron.js
 *
 * Keep-alive: this process should be managed by PM2, systemd, or Docker
 * to ensure it restarts on server reboots.
 */

import cron     from "node-cron";
import mongoose from "mongoose";
import dotenv   from "dotenv";
import path     from "path";
import { fileURLToPath } from "url";

import { runScraper } from "./wageNotificationScraper.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../server/.env") });

// ─── MongoDB connection helpers ───────────────────────────────────────────────
const dbConnect = async () => {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error("MONGO_URI is not set.");
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10_000 });
  console.log("[Cron] MongoDB connected.");
};

const dbDisconnect = async () => {
  await mongoose.disconnect();
  console.log("[Cron] MongoDB disconnected.");
};

// ─── Scheduled job ────────────────────────────────────────────────────────────
/**
 * Connects to DB, runs the scraper, disconnects, logs result.
 * Wrapped in try/finally so disconnect always fires even on scraper error.
 */
const runJob = async () => {
  const startedAt = new Date().toISOString();
  console.log(`\n[Cron] ⏰  Scheduled job triggered at ${startedAt}`);

  try {
    await dbConnect();
    const summary = await runScraper();

    console.log("[Cron] Job completed successfully.");
    console.log(`[Cron] Summary: inserted=${summary.totalInserted} ` +
                `skipped=${summary.totalSkipped} errors=${summary.errors.length}`);

    if (summary.errors.length > 0) {
      console.warn("[Cron] Some states had errors — check logs above for details.");
    }
  } catch (err) {
    console.error(`[Cron] ❌  Job failed: ${err.message}`);
  } finally {
    await dbDisconnect().catch((e) =>
      console.error("[Cron] Disconnect error:", e.message)
    );
  }
};

// ─── Schedule: 1st of every month at 02:00 (server local time) ───────────────
// Set TZ=Asia/Kolkata in your environment so this fires at 02:00 IST
const SCHEDULE = "0 2 1 * *";

const validate = cron.validate(SCHEDULE);
if (!validate) {
  console.error(`[Cron] Invalid cron expression: "${SCHEDULE}"`);
  process.exit(1);
}

const job = cron.schedule(SCHEDULE, runJob, {
  scheduled: true,
  timezone:  "Asia/Kolkata", // explicit IST — overrides server TZ env
});

// ─── Startup log ──────────────────────────────────────────────────────────────
const now        = new Date();
const nextMonth  = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 20, 30));

console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("  ShiftSense Wage Scraper — Monthly Cron Scheduler");
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log(`  Schedule  : ${SCHEDULE} (02:00 IST on the 1st of each month)`);
console.log(`  Next run  : ${nextMonth.toISOString()} (approx.)`);
console.log(`  Process   : PID ${process.pid}`);
console.log(`  MongoDB   : ${process.env.MONGO_URI ? "configured ✅" : "NOT SET ❌"}`);
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
console.log("[Cron] Scheduler running. Waiting for next trigger…");

// ─── Graceful shutdown ────────────────────────────────────────────────────────
const shutdown = async (signal) => {
  console.log(`\n[Cron] ${signal} received — stopping scheduler.`);
  job.stop();
  await dbDisconnect().catch(() => {});
  process.exit(0);
};

process.on("SIGINT",  () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

// ─── Optional: run immediately on startup (for testing) ──────────────────────
// Uncomment to trigger a scrape run when the cron process starts:
// console.log("[Cron] Running initial scrape on startup…");
// runJob();
