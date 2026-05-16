/**
 * server/src/cron/reportCron.js — Monthly report scheduler
 *
 * Fires on the 1st of every month at 06:00 IST.
 * Fetches all Employer documents and enqueues a report job for each.
 *
 * Staggered scheduling: jobs are added with a delay of (index × 30s) so the
 * Bull queue processes them one at a time without flooding S3 and email.
 *
 * This module is imported by app.js at startup and keeps the cron alive
 * as long as the server process runs. It requires no separate process.
 *
 * Cron expression: "0 6 1 * *"
 *   minute=0, hour=6, day-of-month=1, any month, any weekday
 * timezone: Asia/Kolkata (IST)
 */

import cron     from "node-cron";
import { Employer } from "../models/index.js";
import { enqueueReport } from "../services/reportQueue.js";

const SCHEDULE = "0 6 1 * *"; // 06:00 IST on the 1st

/**
 * Enqueues monthly reports for every employer in the database.
 * Staggered by 30s per employer to avoid burst load.
 */
const runMonthlyReportCron = async () => {
  const runAt = new Date().toISOString();
  console.log(`[ReportCron] ⏰  Triggered at ${runAt}`);

  try {
    const employers = await Employer.find({}).select("_id email company_name").lean();
    console.log(`[ReportCron] Found ${employers.length} employers to process.`);

    for (let i = 0; i < employers.length; i++) {
      const employer = employers[i];
      const delayMs  = i * 30_000; // stagger: 0s, 30s, 60s, …

      await enqueueReport(employer._id, { delay: delayMs });
      console.log(
        `[ReportCron] Enqueued ${employer.company_name} ` +
        `(starts in ${delayMs / 1000}s)`
      );
    }

    console.log(`[ReportCron] All ${employers.length} jobs enqueued.`);
  } catch (err) {
    console.error(`[ReportCron] ❌  Failed: ${err.message}`);
  }
};

/** Starts the cron scheduler. Call once from app.js after DB connects. */
export const startReportCron = () => {
  if (!cron.validate(SCHEDULE)) {
    console.error(`[ReportCron] Invalid cron expression: ${SCHEDULE}`);
    return;
  }

  cron.schedule(SCHEDULE, runMonthlyReportCron, {
    scheduled: true,
    timezone:  "Asia/Kolkata",
  });

  console.log(
    `[ReportCron] Scheduled — fires at 06:00 IST on the 1st of each month.`
  );
};
