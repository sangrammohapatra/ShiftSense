/**
 * routes/reports.js — ShiftSense employer report management API
 *
 * Mounted at: /api/v1/reports
 * All routes protected via verifyToken.
 *
 * GET  /           — list S3 report objects for this employer
 * POST /generate   — enqueue report job for current month
 * GET  /status/:jobId — poll Bull job status
 * GET  /download/:month — return 1-hour pre-signed S3 URL
 */

import { Router }  from "express";
import { query }   from "express-validator";
import AWS         from "aws-sdk";

import { verifyToken }   from "../middleware/auth.js";
import { Employer }      from "../models/index.js";
import { enqueueReport, reportQueue } from "../services/reportQueue.js";

const router = Router();
router.use(verifyToken);

// ─── Lazy S3 ──────────────────────────────────────────────────────────────────
let _s3 = null;
const getS3 = () => {
  if (!_s3) {
    _s3 = new AWS.S3({
      accessKeyId:     process.env.AWS_ACCESS_KEY,
      secretAccessKey: process.env.AWS_SECRET_KEY,
      region:          process.env.AWS_REGION || "ap-south-1",
    });
  }
  return _s3;
};

const BUCKET = () => process.env.AWS_BUCKET;

/** Returns "Month YYYY" label from "YYYY-MM" key */
const monthLabel = (key) => {
  const [yr, mo] = key.split("-");
  return new Date(Number(yr), Number(mo) - 1, 1)
    .toLocaleDateString("en-IN", { month: "long", year: "numeric" });
};

/** Returns "YYYY-MM" for the current month */
const currentMonthKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

// ─── GET / — list employer's reports ─────────────────────────────────────────
/**
 * Lists all PDF objects under reports/{employerId}/ in S3.
 * Returns them sorted newest-first with a pre-signed URL (1h expiry) each.
 */
router.get("/", async (req, res) => {
  const employerId = req.employer.id;

  try {
    const prefix  = `reports/${employerId}/`;
    const objects = await getS3().listObjectsV2({
      Bucket: BUCKET(),
      Prefix: prefix,
    }).promise();

    const reports = (objects.Contents ?? [])
      .filter((obj) => obj.Key.endsWith(".pdf"))
      .sort((a, b) => b.LastModified - a.LastModified)
      .map((obj) => {
        // Extract "YYYY-MM" from key "reports/{id}/YYYY-MM.pdf"
        const monthKey = obj.Key.replace(prefix, "").replace(".pdf", "");
        const signedUrl = getS3().getSignedUrl("getObject", {
          Bucket:  BUCKET(),
          Key:     obj.Key,
          Expires: 3600, // 1 hour
        });

        return {
          key:       obj.Key,
          month_key: monthKey,
          month:     monthLabel(monthKey),
          size_kb:   Math.round(obj.Size / 1024),
          generated: obj.LastModified,
          url:       signedUrl,
        };
      });

    return res.status(200).json({ success: true, data: { reports } });
  } catch (err) {
    // S3 NoSuchBucket or credential error
    console.error("[GET /reports]", err.message);
    return res.status(200).json({
      success: true,
      data: { reports: [] },  // graceful empty — don't 500 if S3 not yet configured
    });
  }
});

// ─── POST /generate — trigger manual report generation ───────────────────────
/**
 * Adds a report job to the Bull queue for the current calendar month.
 * Returns the job ID so the client can poll /status/:jobId.
 */
router.post("/generate", async (req, res) => {
  const employerId = req.employer.id;

  try {
    // Verify employer exists
    const employer = await Employer.findById(employerId).lean();
    if (!employer) {
      return res.status(404).json({
        success: false,
        message: "Employer account not found.",
        errors:  [],
      });
    }

    const job = await enqueueReport(employerId, {
      jobId: `${employerId}-${currentMonthKey()}`, // idempotent — same month won't re-queue
    });

    return res.status(202).json({
      success: true,
      data: {
        job_id:    job.id,
        month_key: currentMonthKey(),
        message:   "Report generation started. You'll receive an email when it's ready.",
      },
    });
  } catch (err) {
    // Bull throws "Job already exists" when a duplicate jobId is added
    // The exact message varies by Bull version — check for common variants
    const isAlreadyQueued = err.message?.includes("already") || err.message?.includes("duplicate") || err.code === "ERR_JOB_EXISTS";
    if (isAlreadyQueued) {
      return res.status(202).json({
        success: true,
        data: {
          message: "Report for this month is already being generated.",
        },
      });
    }
    console.error("[POST /reports/generate]", err.message);
    return res.status(500).json({
      success: false,
      message: "Failed to start report generation.",
      errors:  [],
    });
  }
});

// ─── GET /status/:jobId — poll job progress ───────────────────────────────────
/**
 * Returns the current state and progress of a Bull job.
 * States: waiting | active | completed | failed | delayed
 */
router.get("/status/:jobId", async (req, res) => {
  const { jobId } = req.params;

  try {
    const job = await reportQueue.getJob(jobId);

    if (!job) {
      return res.status(404).json({
        success: false,
        message: "Job not found.",
        errors:  [],
      });
    }

    const state    = await job.getState();
    const progress = job._progress ?? 0;
    const result   = job.returnvalue ?? null;
    const failReason = job.failedReason ?? null;

    return res.status(200).json({
      success: true,
      data: {
        job_id:     job.id,
        state,
        progress,
        result,
        fail_reason: failReason,
      },
    });
  } catch (err) {
    console.error("[GET /reports/status/:jobId]", err.message);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch job status.",
      errors:  [],
    });
  }
});

// ─── GET /download/:month — signed S3 download URL ───────────────────────────
/**
 * Generates a fresh 1-hour pre-signed URL for a specific month's report.
 * month param format: "YYYY-MM"
 */
router.get("/download/:month", async (req, res) => {
  const { month }  = req.params;
  const employerId = req.employer.id;

  if (!/^\d{4}-\d{2}$/.test(month)) {
    return res.status(400).json({
      success: false,
      message: "month must be in YYYY-MM format (e.g. 2025-06).",
      errors:  [],
    });
  }

  const s3Key = `reports/${employerId}/${month}.pdf`;

  try {
    // Check object exists before signing
    await getS3().headObject({ Bucket: BUCKET(), Key: s3Key }).promise();

    const signedUrl = getS3().getSignedUrl("getObject", {
      Bucket:  BUCKET(),
      Key:     s3Key,
      Expires: 3600,
    });

    return res.status(200).json({
      success: true,
      data: {
        url:       signedUrl,
        month_key: month,
        month:     monthLabel(month),
        expires_in: 3600,
      },
    });
  } catch (err) {
    if (err.code === "NotFound" || err.code === "NoSuchKey") {
      return res.status(404).json({
        success: false,
        message: `No report found for ${monthLabel(month)}.`,
        errors:  [],
      });
    }
    console.error("[GET /reports/download/:month]", err.message);
    return res.status(500).json({
      success: false,
      message: "Failed to generate download link.",
      errors:  [],
    });
  }
});

export default router;
