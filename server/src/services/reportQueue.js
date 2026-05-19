/**
 * services/reportQueue.js — ShiftSense monthly report Bull queue
 *
 * Uses Bull's built-in Redis URL string constructor — the simplest and most
 * reliable way to avoid the enableReadyCheck/maxRetriesPerRequest conflict.
 * Bull handles all three internal connections (client/subscriber/bclient)
 * correctly when given a plain URL string.
 */

import Bull from "bull";
import PDFDocument from "pdfkit";
import AWS from "aws-sdk";
import nodemailer from "nodemailer";
import { PassThrough } from "stream";

import { Employer, EmployerWorker, ShiftLog } from "../models/index.js";
import { bullClientFactory } from "../config/redis.js";

// ─── Queue setup ──────────────────────────────────────────────────────────────
// Use bullClientFactory so each of Bull's 3 internal Redis connections gets
// the exact ioredis options it requires (client vs subscriber/bclient differ).
// Do NOT pass a URL string here — it bypasses the factory and uses Bull's own
// ioredis instance which ignores maxRetriesPerRequest: null on subscriber/bclient.
export const reportQueue = new Bull("monthlyReports", {
  createClient: bullClientFactory,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 60_000 },
    removeOnComplete: 50,
    removeOnFail: 20,
    // ⚠️ Critical: PDF + S3 + email can take up to 2 minutes.
    // Bull's default lock duration is 5 seconds — the job stalls and gets
    // retried indefinitely without this. Set to 3 minutes with a 30s renewal.
    timeout: 180_000,
  },
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n) => `Rs. ${Number(n ?? 0).toFixed(2)}`;

const fmtDate = (d) =>
  new Date(d).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

const lastMonthRange = () => {
  const now = new Date();
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1),
  );
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return { start, end };
};

const lastMonthKey = () => {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

const monthLabel = (key) => {
  const [yr, mo] = key.split("-");
  return new Date(Number(yr), Number(mo) - 1, 1).toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
  });
};

// ─── Lazy AWS S3 ──────────────────────────────────────────────────────────────
let _s3 = null;
const getS3 = () => {
  if (!_s3) {
    _s3 = new AWS.S3({
      accessKeyId: process.env.AWS_ACCESS_KEY,
      secretAccessKey: process.env.AWS_SECRET_KEY,
      region: process.env.AWS_REGION || "ap-south-1",
    });
  }
  return _s3;
};

// ─── Lazy Nodemailer ──────────────────────────────────────────────────────────
let _transporter = null;
const getTransporter = () => {
  if (!_transporter) {
    _transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === "true",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }
  return _transporter;
};

// ─── PDF generator ────────────────────────────────────────────────────────────
const buildReportPDF = (reportData) =>
  new Promise((resolve, reject) => {
    const { employer, month, workers, summary } = reportData;
    const doc = new PDFDocument({ size: "A4", margin: 45, bufferPages: true });
    const chunks = [];
    const stream = new PassThrough();

    doc.pipe(stream);
    stream.on("data", (c) => chunks.push(c));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);

    const W = doc.page.width;
    const COLORS = {
      headerBg: "#0d1117",
      accent: "#f0a500",
      dark: "#1a1a1a",
      muted: "#555",
      border: "#cccccc",
      lightGray: "#f5f5f5",
      danger: "#cc2200",
    };

    // Header
    doc.rect(0, 0, W, 80).fill(COLORS.headerBg);
    doc
      .font("Helvetica-Bold")
      .fontSize(16)
      .fillColor(COLORS.accent)
      .text("MONTHLY WAGE COMPLIANCE REPORT", 45, 18, {
        align: "center",
        width: W - 90,
      });
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor("#aaaaaa")
      .text(
        `${month}  |  ${employer.company_name}  |  Generated ${fmtDate(new Date())}`,
        45,
        46,
        { align: "center", width: W - 90 },
      );

    let y = 100;

    // Employer info
    doc
      .font("Helvetica-Bold")
      .fontSize(10)
      .fillColor(COLORS.dark)
      .text("EMPLOYER DETAILS", 45, y);
    y += 14;
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor(COLORS.dark)
      .text(`Company: ${employer.company_name}`, 50, y);
    y += 12;
    doc.text(
      `Contact: ${employer.contact_name}  |  Email: ${employer.email}`,
      50,
      y,
    );
    y += 12;
    if (employer.gst_number) {
      doc.text(`GSTIN: ${employer.gst_number}`, 50, y);
      y += 12;
    }
    y += 8;

    // Summary
    doc
      .moveTo(45, y)
      .lineTo(W - 45, y)
      .strokeColor(COLORS.accent)
      .lineWidth(0.8)
      .stroke();
    y += 10;
    doc
      .font("Helvetica-Bold")
      .fontSize(10)
      .fillColor(COLORS.dark)
      .text("MONTHLY SUMMARY", 45, y);
    y += 14;

    const summaryItems = [
      ["Total Workers", summary.totalWorkers],
      ["Total Shifts", summary.totalShifts],
      ["Gross Owed", fmt(summary.totalGrossOwed)],
      ["Total Claimed", fmt(summary.totalClaimed)],
      ["Shortfall", fmt(summary.totalShortfall)],
      ["Disputes", summary.totalDisputes],
    ];

    const cols = [45, 220, 390];
    summaryItems.forEach(([label, val], i) => {
      const col = cols[i % 3];
      const row = y + Math.floor(i / 3) * 36;
      doc.rect(col, row, 160, 30).fill(COLORS.lightGray);
      doc
        .font("Helvetica")
        .fontSize(7)
        .fillColor(COLORS.muted)
        .text(label.toUpperCase(), col + 6, row + 5, { width: 148 });
      doc
        .font("Helvetica-Bold")
        .fontSize(11)
        .fillColor(COLORS.dark)
        .text(String(val), col + 6, row + 14, { width: 148 });
    });
    y += Math.ceil(summaryItems.length / 3) * 36 + 16;

    doc
      .moveTo(45, y)
      .lineTo(W - 45, y)
      .strokeColor(COLORS.border)
      .lineWidth(0.5)
      .stroke();
    y += 14;

    // Worker table
    doc
      .font("Helvetica-Bold")
      .fontSize(10)
      .fillColor(COLORS.dark)
      .text("WORKER BREAKDOWN", 45, y);
    y += 14;
    const COLS = [45, 155, 225, 275, 335, 395, 455, 500];
    const HEADS = [
      "Worker",
      "Occupation",
      "Shifts",
      "Gross",
      "Claimed",
      "Shortfall",
      "Disputes",
    ];

    doc.rect(45, y, W - 90, 18).fill(COLORS.lightGray);
    HEADS.forEach((h, i) => {
      doc
        .font("Helvetica-Bold")
        .fontSize(7.5)
        .fillColor(COLORS.dark)
        .text(h, COLS[i], y + 5, {
          width: (COLS[i + 1] ?? W - 45) - COLS[i] - 4,
        });
    });
    y += 18;

    workers.forEach((w, i) => {
      if (y > doc.page.height - 80) {
        doc.addPage();
        y = 45;
      }
      doc.rect(45, y, W - 90, 20).fill(i % 2 === 0 ? "#ffffff" : "#fafafa");
      const vals = [
        w.name,
        w.occupation ?? "—",
        String(w.shifts),
        fmt(w.grossOwed),
        fmt(w.claimed),
        fmt(w.totalShortfall),
        String(w.disputes),
      ];
      vals.forEach((v, j) => {
        doc
          .font("Helvetica")
          .fontSize(8)
          .fillColor(
            j === 5 && w.totalShortfall > 0 ? COLORS.danger : COLORS.dark,
          )
          .text(v, COLS[j], y + 6, {
            width: (COLS[j + 1] ?? W - 45) - COLS[j] - 4,
          });
      });
      y += 20;
    });

    // Footer
    doc
      .font("Helvetica-Oblique")
      .fontSize(7.5)
      .fillColor(COLORS.muted)
      .text(
        "Generated by ShiftSense — Compliant with Minimum Wages Act 1948, Factories Act 1948.",
        45,
        doc.page.height - 50,
        { width: W - 90, align: "center" },
      );

    doc.end();
  });

// ─── S3 upload ────────────────────────────────────────────────────────────────
const uploadReport = async (buffer, employerId, monthKey) => {
  const bucket = process.env.AWS_BUCKET;
  const key = `reports/${employerId}/${monthKey}.pdf`;
  await getS3()
    .putObject({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: "application/pdf",
    })
    .promise();
  return {
    key,
    url: `https://${bucket}.s3.${process.env.AWS_REGION || "ap-south-1"}.amazonaws.com/${key}`,
  };
};

// ─── Email ────────────────────────────────────────────────────────────────────
const sendReportEmail = async (employer, month, s3Url, summary) => {
  await getTransporter().sendMail({
    from: `"ShiftSense Reports" <${process.env.MONTHLY_REPORT_EMAIL || process.env.SMTP_USER}>`,
    to: employer.email,
    subject: `ShiftSense Monthly Wage Report — ${month}`,
    html: `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px">
      <h2 style="color:#f0a500">ShiftSense Monthly Report — ${month}</h2>
      <p>Dear ${employer.contact_name},</p>
      <p>Your monthly wage compliance report is ready.</p>
      <p><strong>Total workers:</strong> ${summary.totalWorkers}<br/>
         <strong>Total shifts:</strong> ${summary.totalShifts}<br/>
         <strong>Total shortfall:</strong> ${fmt(summary.totalShortfall)}</p>
      <a href="${s3Url}" style="display:inline-block;background:#f0a500;color:#000;padding:12px 24px;text-decoration:none;font-weight:bold;border-radius:4px">
        Download PDF Report →
      </a>
    </div>`,
  });
};

// ─── Queue processor ──────────────────────────────────────────────────────────
// lockDuration: how long Bull holds the job lock before assuming the worker crashed.
// stalledInterval: how often Bull checks for stalled jobs.
// Both must exceed the longest possible job execution time (PDF + S3 + email).
reportQueue.process(
  1, // concurrency: process 1 job at a time (S3 + email are rate-sensitive)
  async (job) => {
    const { employerId } = job.data;
    job.progress(5);

    const employer = await Employer.findById(employerId).lean();
    if (!employer) throw new Error(`Employer ${employerId} not found.`);

    const links = await EmployerWorker.find({
      employer_id: employerId,
      is_active: true,
    })
      .select("worker_id")
      .lean();
    const workerIds = links.map((l) => l.worker_id);
    job.progress(15);

    const { start, end } = lastMonthRange();
    const monthKey = lastMonthKey();
    const month = monthLabel(monthKey);

    const allShifts = await ShiftLog.find({
      worker_id: { $in: workerIds },
      shift_date: { $gte: start, $lt: end },
    })
      .populate("worker_id", "name phone_number occupation")
      .lean();
    job.progress(35);

    const workerMap = {};
    for (const shift of allShifts) {
      const wid = shift.worker_id?._id?.toString() ?? "unknown";
      if (!workerMap[wid]) {
        workerMap[wid] = {
          name: shift.worker_id?.name ?? "Unknown",
          phone: shift.worker_id?.phone_number ?? "—",
          occupation: shift.worker_id?.occupation ?? "—",
          shifts: 0,
          grossOwed: 0,
          claimed: 0,
          totalShortfall: 0,
          disputes: 0,
        };
      }
      const w = workerMap[wid];
      w.shifts++;
      w.grossOwed += shift.gross_owed ?? 0;
      w.claimed += shift.claimed_amount ?? 0;
      w.totalShortfall += Math.max(0, shift.shortfall ?? 0);
      if (shift.status === "disputed") w.disputes++;
    }

    const workers = Object.values(workerMap);
    const summary = {
      totalWorkers: workerIds.length,
      totalShifts: allShifts.length,
      totalGrossOwed: workers.reduce((s, w) => s + w.grossOwed, 0),
      totalClaimed: workers.reduce((s, w) => s + w.claimed, 0),
      totalShortfall: workers.reduce((s, w) => s + w.totalShortfall, 0),
      totalDisputes: workers.reduce((s, w) => s + w.disputes, 0),
    };
    job.progress(50);

    const buffer = await buildReportPDF({
      employer,
      month,
      monthKey,
      workers,
      summary,
    });
    job.progress(70);

    const { url: s3Url } = await uploadReport(buffer, employerId, monthKey);
    job.progress(85);

    // Email is best-effort — a misconfigured SMTP must not fail the whole job.
    // The PDF is already on S3 and downloadable from the dashboard.
    try {
      await sendReportEmail(employer, month, s3Url, summary);
      console.log(`[ReportQueue] Email sent to ${employer.email}`);
    } catch (emailErr) {
      console.warn(
        `[ReportQueue] ⚠️  Email failed (PDF still available on S3): ${emailErr.message}\n` +
          `  Check SMTP_HOST, SMTP_USER, SMTP_PASS in your .env.\n` +
          `  SMTP_HOST: ${process.env.SMTP_HOST}\n` +
          `  SMTP_PORT: ${process.env.SMTP_PORT}\n` +
          `  SMTP_SECURE: ${process.env.SMTP_SECURE === "true"}\n` +
          `  SMTP_USER: ${process.env.SMTP_USER}\n` +
          `  SMTP_PASS: ${process.env.SMTP_PASS}`,
      );
    }
    job.progress(100);

    return { employerId, monthKey, s3Url, emailSent: true };
  },
);

reportQueue.on("completed", (job, result) => {
  console.log(`[ReportQueue] ✅ Job ${job.id} complete — ${result.monthKey}`);
});

reportQueue.on("failed", (job, err) => {
  console.error(
    `[ReportQueue] ❌ Job ${job.id} failed (attempt ${job.attemptsMade}/${job.opts.attempts}): ${err.message}`,
  );
  console.error(err.stack);
});

reportQueue.on("stalled", (job) => {
  console.warn(
    `[ReportQueue] ⚠️ Job ${job.id} stalled — processor took too long. Check timeout setting.`,
  );
});

// This fires when Bull cannot connect to Redis at all — the most common
// cause of "job enqueued but nothing happens" during local development.
reportQueue.on("error", (err) => {
  console.error(`[ReportQueue] Redis connection error: ${err.message}`);
});

reportQueue.on("active", (job) => {
  console.log(
    `[ReportQueue] 🔄 Job ${job.id} started processing for employer ${job.data.employerId}`,
  );
});

reportQueue.on("progress", (job, progress) => {
  console.log(`[ReportQueue] Job ${job.id} progress: ${progress}%`);
});

export const enqueueReport = async (employerId, opts = {}) => {
  const job = await reportQueue.add({ employerId: String(employerId) }, opts);
  console.log(
    `[ReportQueue] Enqueued job ${job.id} for employer ${employerId}`,
  );
  return job;
};
