/**
 * services/disputeGenerator.js — ShiftSense dispute letter PDF generator
 *
 * Generates a formal wage dispute notice PDF entirely in memory using PDFKit,
 * uploads it to AWS S3, and creates a DisputeLetter document in MongoDB.
 *
 * The PDF is never written to disk — it is streamed into a Buffer via a
 * PassThrough pipe, then uploaded directly to S3.
 *
 * S3 key schema: disputes/{workerId}/{YYYY-MM-DD}.pdf
 *
 * Legal citations included in every letter:
 *   - Minimum Wages Act, 1948 — Section 12 (right to minimum wages)
 *   - Factories Act, 1948 — Section 59 (double rate for overtime)
 *   - Payment of Wages Act, 1936 — Section 5 (timely payment obligation)
 *
 * Usage:
 *   const url = await generateDisputeLetter(shiftLog, worker, employer);
 */

import PDFDocument from "pdfkit";
import AWS from "aws-sdk";
import { PassThrough } from "stream";
import { DisputeLetter } from "../models/index.js";

// ─── AWS S3 client (lazy init) ────────────────────────────────────────────────
let _s3 = null;
const getS3 = () => {
  if (!_s3) {
    _s3 = new AWS.S3({
      accessKeyId: process.env.AWS_ACCESS_KEY,
      secretAccessKey: process.env.AWS_SECRET_KEY,
      region: process.env.AWS_REGION || "ap-southeast-2",
    });
  }
  return _s3;
};

const S3_REGION = process.env.AWS_REGION || "ap-southeast-2";
const DISPUTE_URL_TTL_SECONDS = Number(
  process.env.DISPUTE_PDF_URL_TTL_SECONDS || 60 * 60 * 24 * 7,
);

// ─── Design constants ─────────────────────────────────────────────────────────
const COLORS = {
  headerBg: "#1a1a2e",
  accent: "#f0a500",
  dark: "#1a1a1a",
  muted: "#555555",
  lightGray: "#f5f5f5",
  border: "#cccccc",
  danger: "#cc2200",
};

const FONTS = {
  normal: "Helvetica",
  bold: "Helvetica-Bold",
  oblique: "Helvetica-Oblique",
};

const LAW_SECTIONS = [
  "Minimum Wages Act, 1948 — Section 12: Every employer shall pay to every employee wages at a rate not less than the minimum rate of wages fixed by the appropriate government.",
  "Factories Act, 1948 — Section 59: Where a worker works in a factory for more than nine hours in any day or more than forty-eight hours in any week, he shall be entitled to wages for the extra hours at twice the ordinary rate of wages.",
  "Payment of Wages Act, 1936 — Section 5: All wages shall be paid on a working day within the prescribed time period. Failure to do so renders the employer liable for penalty under Section 20.",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n) => `Rs. ${Number(n).toFixed(2)}`;
const yesNo = (bool) => (bool ? "Applicable" : "Not Applicable");
const PAGE_CONTENT_START_Y = 50;
const PAGE_BOTTOM_RESERVE = 90;

/**
 * Formats a JS Date or ISO string as "15 January 2025"
 * @param {Date|string} d
 */
const fmtDate = (d) =>
  new Date(d).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

/**
 * Draws a horizontal rule across the page width.
 * @param {PDFDocument} doc
 * @param {number} y       Y position
 * @param {string} color
 */
const hRule = (doc, y, color = COLORS.border) => {
  doc.moveTo(50, y).lineTo(545, y).strokeColor(color).lineWidth(0.5).stroke();
};

const ensureSpace = (doc, y, requiredHeight) => {
  const maxY = doc.page.height - PAGE_BOTTOM_RESERVE;
  if (y + requiredHeight <= maxY) return y;

  doc.addPage();
  return PAGE_CONTENT_START_Y;
};

/**
 * Draws a two-column key-value row.
 * @param {PDFDocument} doc
 * @param {number} y
 * @param {string} label
 * @param {string} value
 * @param {object} opts    — { bold, valueColor }
 * @returns {number}       New Y position after the row
 */
const kvRow = (doc, y, label, value, opts = {}) => {
  const { bold = false, valueColor = COLORS.dark } = opts;
  const valueText = String(value);
  const labelHeight = doc.heightOfString(label, { width: 200 });
  const valueHeight = doc.heightOfString(valueText, { width: 280 });
  const rowHeight = Math.max(labelHeight, valueHeight, 12) + 6;

  y = ensureSpace(doc, y, rowHeight);

  doc
    .font(FONTS.normal)
    .fontSize(9)
    .fillColor(COLORS.muted)
    .text(label, 55, y, { width: 200 });
  doc
    .font(bold ? FONTS.bold : FONTS.normal)
    .fontSize(9)
    .fillColor(valueColor)
    .text(valueText, 260, y, { width: 280 });
  return y + rowHeight;
};

// ─── PDF builder ──────────────────────────────────────────────────────────────
/**
 * Builds the full dispute letter PDF and resolves with a Buffer.
 *
 * @param {object} shiftLog   Mongoose ShiftLog document (lean or not)
 * @param {object} worker     Mongoose Worker document
 * @param {object|null} employer  Mongoose Employer document or null
 * @returns {Promise<Buffer>}
 */
const buildPDFBuffer = (shiftLog, worker, employer) =>
  new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50, bufferPages: true });
    const chunks = [];
    const stream = new PassThrough();

    doc.pipe(stream);
    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);

    const W = doc.page.width; // 595.28
    const today = new Date();

    // ── 1. Header banner ──────────────────────────────────────────────────────
    doc.rect(0, 0, W, 90).fill(COLORS.headerBg);

    doc
      .font(FONTS.bold)
      .fontSize(18)
      .fillColor(COLORS.accent)
      .text("WAGE DISPUTE NOTICE", 50, 22, { align: "center", width: W - 100 });

    doc
      .font(FONTS.normal)
      .fontSize(9)
      .fillColor("#aaaaaa")
      .text(
        `Generated by ShiftSense  |  Date: ${fmtDate(today)}  |  Ref: SHF-${shiftLog._id.toString().slice(-8).toUpperCase()}`,
        50,
        52,
        { align: "center", width: W - 100 },
      );

    // ── 2. Parties ─────────────────────────────────────────────────────────────
    let y = 110;

    doc
      .font(FONTS.bold)
      .fontSize(10)
      .fillColor(COLORS.dark)
      .text("FROM (Worker / श्रमिक)", 50, y);
    y += 16;
    doc
      .font(FONTS.normal)
      .fontSize(9)
      .fillColor(COLORS.dark)
      .text(`Name: ${worker.name || "—"}`, 55, y);
    y += 14;
    doc.text(`Phone: +91${worker.phone_number.replace(/^\+91/, "")}`, 55, y);
    y += 14;
    doc.text(`State: ${worker.state || "—"}`, 55, y);
    y += 14;
    doc.text(`Occupation: ${worker.occupation || "—"}`, 55, y);
    y += 20;

    hRule(doc, y);
    y += 12;

    doc
      .font(FONTS.bold)
      .fontSize(10)
      .fillColor(COLORS.dark)
      .text("TO (Employer / नियोक्ता)", 50, y);
    y += 16;

    if (employer) {
      doc
        .font(FONTS.normal)
        .fontSize(9)
        .fillColor(COLORS.dark)
        .text(`Company: ${employer.company_name}`, 55, y);
      y += 14;
      doc.text(`Contact: ${employer.contact_name}`, 55, y);
      y += 14;
      doc.text(`Email: ${employer.email}`, 55, y);
      y += 14;
      if (employer.gst_number) {
        doc.text(`GSTIN: ${employer.gst_number}`, 55, y);
        y += 14;
      }
    } else {
      doc
        .font(FONTS.oblique)
        .fontSize(9)
        .fillColor(COLORS.muted)
        .text("To Whom It May Concern / संबंधित नियोक्ता", 55, y);
      y += 14;
    }

    y += 10;
    hRule(doc, y, COLORS.accent);
    y += 16;

    // ── 3. Subject line ────────────────────────────────────────────────────────
    doc
      .font(FONTS.bold)
      .fontSize(11)
      .fillColor(COLORS.danger)
      .text(
        `SUBJECT: Notice of Wage Shortfall for Shift dated ${fmtDate(shiftLog.shift_date)}`,
        50,
        y,
        { width: W - 100 },
      );
    y += 28;

    // Opening paragraph
    doc
      .font(FONTS.normal)
      .fontSize(9)
      .fillColor(COLORS.dark)
      .text(
        `I, ${worker.name || "the undersigned worker"}, hereby formally notify you of a wage shortfall ` +
          `identified for the shift performed on ${fmtDate(shiftLog.shift_date)}. ` +
          `This notice is issued under the provisions of the Minimum Wages Act, 1948 and related labour statutes. ` +
          `The details of the discrepancy are set out below.`,
        50,
        y,
        { width: W - 100, lineGap: 3 },
      );
    y += 55;

    // ── 4. Shift details table ─────────────────────────────────────────────────
    doc
      .font(FONTS.bold)
      .fontSize(10)
      .fillColor(COLORS.dark)
      .text("SHIFT DETAILS", 50, y);
    y += 14;

    // Table header
    doc.rect(50, y, 495, 18).fill(COLORS.lightGray);
    y += 4;
    doc
      .font(FONTS.bold)
      .fontSize(8.5)
      .fillColor(COLORS.dark)
      .text("Field", 55, y)
      .text("Value", 260, y);
    y += 18;

    hRule(doc, y);
    y += 6;

    // Rows
    y = kvRow(doc, y, "Shift Date", fmtDate(shiftLog.shift_date));
    y = kvRow(doc, y, "Start Time", `${shiftLog.start_hour}:00`);
    y = kvRow(doc, y, "End Time", `${shiftLog.end_hour}:00`);
    y = kvRow(doc, y, "Hours Worked", `${shiftLog.hours_worked} hours`);
    y = kvRow(doc, y, "Overtime Hours", `${shiftLog.ot_hours} hours`);
    y = kvRow(doc, y, "State", shiftLog.state);
    y = kvRow(doc, y, "Occupation", shiftLog.occupation);

    y += 8;
    hRule(doc, y);
    y += 16;

    // ── 5. Wage calculation table ─────────────────────────────────────────────
    doc
      .font(FONTS.bold)
      .fontSize(10)
      .fillColor(COLORS.dark)
      .text("WAGE CALCULATION (Amount in Indian Rupees)", 50, y);
    y += 14;

    doc.rect(50, y, 495, 18).fill(COLORS.lightGray);
    y += 4;
    doc
      .font(FONTS.bold)
      .fontSize(8.5)
      .fillColor(COLORS.dark)
      .text("Component", 55, y)
      .text("Calculation", 200, y)
      .text("Amount", 450, y);
    y += 18;

    hRule(doc, y);
    y += 6;

    // Minimum wage row
    const hourlyRate = (shiftLog.min_wage_applied / 8).toFixed(2);
    const regularHrs = Math.min(shiftLog.hours_worked, 8);
    const regularPay = (hourlyRate * regularHrs).toFixed(2);

    y = kvRow(
      doc,
      y,
      "State Min. Wage",
      `${fmt(shiftLog.min_wage_applied)}/day (${hourlyRate}/hr)`,
      {},
    );
    y = kvRow(
      doc,
      y,
      "Regular Pay",
      `${hourlyRate} × ${regularHrs}h = ${fmt(regularPay)}`,
    );

    if (shiftLog.ot_hours > 0) {
      const otPay = (hourlyRate * shiftLog.ot_hours * 2).toFixed(2);
      y = kvRow(
        doc,
        y,
        "Overtime Pay (2×)",
        `${hourlyRate} × ${shiftLog.ot_hours}h × 2 = ${fmt(otPay)}`,
      );
    }

    y += 4;
    // Gross owed — highlighted
    doc.rect(50, y - 2, 495, 20).fill("#fff8e6");
    y = kvRow(doc, y, "GROSS AMOUNT OWED", fmt(shiftLog.gross_owed), {
      bold: true,
      valueColor: COLORS.dark,
    });

    y += 4;
    hRule(doc, y);
    y += 10;

    // ── 6. Deductions table ────────────────────────────────────────────────────
    doc
      .font(FONTS.bold)
      .fontSize(10)
      .fillColor(COLORS.dark)
      .text("STATUTORY DEDUCTIONS", 50, y);
    y += 14;

    doc.rect(50, y, 495, 18).fill(COLORS.lightGray);
    y += 4;
    doc
      .font(FONTS.bold)
      .fontSize(8.5)
      .fillColor(COLORS.dark)
      .text("Deduction", 55, y)
      .text("Rate", 200, y)
      .text("Status", 300, y)
      .text("Amount", 450, y);
    y += 18;
    hRule(doc, y);
    y += 6;

    y = kvRow(
      doc,
      y,
      "EPF (Employee Provident Fund)",
      `12% — EPF Act 1952 §6 | ${yesNo(shiftLog.epf_deduction > 0)} | ${fmt(shiftLog.epf_deduction)}`,
    );
    y = kvRow(
      doc,
      y,
      "ESI (Employee State Insurance)",
      `0.75% — ESI Act 1948 §40 | ${yesNo(shiftLog.esi_deduction > 0)} | ${fmt(shiftLog.esi_deduction)}`,
    );

    y += 4;
    hRule(doc, y);
    y += 6;
    doc.rect(50, y - 2, 495, 20).fill("#f0f8f0");
    y = kvRow(doc, y, "NET AMOUNT DUE TO WORKER", fmt(shiftLog.net_owed), {
      bold: true,
      valueColor: "#1a6b2a",
    });

    y += 10;
    hRule(doc, y);
    y += 14;

    // ── 7. Claimed vs owed comparison ─────────────────────────────────────────
    y = ensureSpace(doc, y, 110);
    doc
      .font(FONTS.bold)
      .fontSize(10)
      .fillColor(COLORS.dark)
      .text("WAGE COMPARISON", 50, y);
    y += 14;

    y = kvRow(doc, y, "Amount Owed (Calculated)", fmt(shiftLog.gross_owed));
    y = kvRow(
      doc,
      y,
      "Amount Claimed by Employer",
      fmt(shiftLog.claimed_amount),
    );

    y += 4;
    // Shortfall row — bold red highlight
    doc.rect(50, y - 2, 495, 22).fill("#fff0f0");
    doc
      .font(FONTS.bold)
      .fontSize(10)
      .fillColor(COLORS.danger)
      .text("SHORTFALL AMOUNT:", 55, y)
      .text(fmt(shiftLog.shortfall), 260, y);
    y += 26;

    hRule(doc, y, COLORS.danger);
    y += 16;

    // ── 8. Legal citations ─────────────────────────────────────────────────────
    y = ensureSpace(doc, y, 140);
    doc
      .font(FONTS.bold)
      .fontSize(10)
      .fillColor(COLORS.dark)
      .text("APPLICABLE LEGAL PROVISIONS", 50, y);
    y += 14;

    for (let i = 0; i < LAW_SECTIONS.length; i++) {
      const lawHeight =
        doc.heightOfString(LAW_SECTIONS[i], { width: 470, lineGap: 2 }) + 12;
      y = ensureSpace(doc, y, lawHeight);

      doc
        .font(FONTS.bold)
        .fontSize(8)
        .fillColor(COLORS.accent)
        .text(`${i + 1}.`, 55, y);
      doc
        .font(FONTS.normal)
        .fontSize(8)
        .fillColor(COLORS.dark)
        .text(LAW_SECTIONS[i], 70, y, { width: 470, lineGap: 2 });
      y += lawHeight;
    }

    y += 6;
    hRule(doc, y);
    y += 14;

    // ── 9. Demand paragraph ────────────────────────────────────────────────────
    y = ensureSpace(doc, y, 150);
    doc
      .font(FONTS.bold)
      .fontSize(9.5)
      .fillColor(COLORS.dark)
      .text("DEMAND", 50, y);
    y += 14;

    const demandText =
      `You are hereby demanded to pay the shortfall amount of ${fmt(shiftLog.shortfall)} ` +
      `within fifteen (15) days of receiving this notice. ` +
      `Failure to comply may result in a complaint being filed with the ` +
      `Labour Commissioner under Section 20 of the Payment of Wages Act, 1936, ` +
      `and Section 22 of the Minimum Wages Act, 1948.`;

    doc
      .font(FONTS.normal)
      .fontSize(9)
      .fillColor(COLORS.dark)
      .text(
        demandText,
        50,
        y,
        { width: W - 100, lineGap: 3 },
      );
    y += doc.heightOfString(demandText, { width: W - 100, lineGap: 3 }) + 12;

    // Worker signature block
    y = ensureSpace(doc, y, 60);
    doc
      .font(FONTS.normal)
      .fontSize(9)
      .fillColor(COLORS.muted)
      .text("Worker's Name:", 50, y)
      .font(FONTS.bold)
      .fillColor(COLORS.dark)
      .text(worker.name || "—", 150, y);
    y += 16;
    doc
      .font(FONTS.normal)
      .fillColor(COLORS.muted)
      .text("Phone:", 50, y)
      .font(FONTS.bold)
      .fillColor(COLORS.dark)
      .text(`+91${worker.phone_number.replace(/^\+91/, "")}`, 150, y);
    y += 16;
    doc
      .font(FONTS.normal)
      .fillColor(COLORS.muted)
      .text("Date of Notice:", 50, y)
      .font(FONTS.bold)
      .fillColor(COLORS.dark)
      .text(fmtDate(today), 150, y);

    // ── 10. Footer ─────────────────────────────────────────────────────────────
    const footerY = doc.page.height - 60;
    doc.rect(0, footerY - 8, W, 68).fill(COLORS.lightGray);

    hRule(doc, footerY - 8, COLORS.accent);

    doc
      .font(FONTS.oblique)
      .fontSize(7.5)
      .fillColor(COLORS.muted)
      .text(
        "This notice is generated by ShiftSense (www.shiftsense.in) on behalf of the worker. " +
          "ShiftSense is a wage intelligence platform for India's informal workforce. " +
          "If this dispute is unresolved within 30 days, the worker may escalate to the District Labour Commissioner.",
        50,
        footerY,
        { width: W - 100, lineGap: 2, align: "center" },
      );

    doc.end();
  });

// ─── S3 uploader ──────────────────────────────────────────────────────────────
/**
 * Uploads a Buffer to S3 and returns both the canonical object URL and
 * a signed download URL for private buckets.
 *
 * @param {Buffer} buffer
 * @param {string} key       S3 object key
 * @returns {Promise<{ key: string, objectUrl: string, signedUrl: string }>}
 */
const buildObjectUrl = (bucket, key) =>
  `https://${bucket}.s3.${S3_REGION}.amazonaws.com/${key}`;

const buildSignedUrl = async (bucket, key) =>
  getS3().getSignedUrlPromise("getObject", {
    Bucket: bucket,
    Key: key,
    Expires: DISPUTE_URL_TTL_SECONDS,
    ResponseContentType: "application/pdf",
    ResponseContentDisposition: `inline; filename="${key.split("/").pop()}"`,
  });

const extractS3KeyFromUrl = (url, bucket) => {
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== `${bucket}.s3.${S3_REGION}.amazonaws.com`) {
      return null;
    }

    return decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
  } catch {
    return null;
  }
};

export const getAccessibleDisputeLetterUrl = async (storedUrl) => {
  const bucket = process.env.AWS_BUCKET;
  if (!bucket || !storedUrl) return storedUrl;

  const key = extractS3KeyFromUrl(storedUrl, bucket);
  if (!key) return storedUrl;

  return buildSignedUrl(bucket, key);
};

const uploadToS3 = async (buffer, key) => {
  const bucket = process.env.AWS_BUCKET;
  if (!bucket) throw new Error("AWS_BUCKET environment variable is not set.");

  await getS3()
    .putObject({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: "application/pdf",
      // ACL removed — use bucket policy or pre-signed URLs for access control
      // ACL: "public-read",
    })
    .promise();

  return {
    key,
    objectUrl: buildObjectUrl(bucket, key),
    signedUrl: await buildSignedUrl(bucket, key),
  };
};

// ─── Main export ──────────────────────────────────────────────────────────────
/**
 * Generates a wage dispute letter PDF, uploads it to S3, creates a
 * DisputeLetter MongoDB document, and returns a signed S3 URL.
 *
 * @param {object} shiftLog   Mongoose ShiftLog document
 * @param {object} worker     Mongoose Worker document
 * @param {object|null} employer  Mongoose Employer document or null
 * @returns {Promise<string>} Signed S3 URL of the generated PDF
 */
export const generateDisputeLetter = async (
  shiftLog,
  worker,
  employer = null,
) => {
  // 1. Build PDF buffer in memory
  const buffer = await buildPDFBuffer(shiftLog, worker, employer);

  // 2. Compute S3 key — one PDF per worker per shift date
  const dateStr = new Date(shiftLog.shift_date).toISOString().slice(0, 10);
  const s3Key = `disputes/${worker._id}/${dateStr}-${shiftLog._id}.pdf`;

  // 3. Upload to S3
  const { objectUrl, signedUrl } = await uploadToS3(buffer, s3Key);
  console.log(`[DisputeGenerator] PDF uploaded → ${objectUrl}`);

  // 4. Persist DisputeLetter record in MongoDB
  // Use upsert on shift_id to prevent duplicates if called twice
  await DisputeLetter.findOneAndUpdate(
    { shift_id: shiftLog._id },
    {
      $setOnInsert: {
        shift_id: shiftLog._id,
        worker_id: worker._id,
        employer_id: employer?._id ?? null,
      },
      $set: {
        pdf_s3_url: objectUrl,
        law_sections: LAW_SECTIONS,
        total_shortfall: shiftLog.shortfall,
        generated_at: new Date(),
        status: "generated",
      },
    },
    { upsert: true, new: true },
  );

  return signedUrl;
};
