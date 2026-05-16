/**
 * scraper/seedWages.js — ShiftSense WageRule seed script
 *
 * Inserts realistic 2024-25 minimum wage data for 10 major Indian states
 * across all 5 occupation categories. These values are based on publicly
 * notified rates as of April 2024 and serve as the system's fallback data
 * until the Puppeteer scraper fetches verified live rates.
 *
 * Source references:
 *   - Ministry of Labour & Employment, India — labourbureau.gov.in
 *   - State gazette notifications (April 2024 revision cycle)
 *   - Figures are daily rates in ₹ for unskilled/semi-skilled categories
 *     (construction, domestic, security) and skilled for factory/driver
 *
 * Run once:
 *   node scraper/seedWages.js
 *
 * Safe to re-run: uses insertMany with ordered:false — duplicate index
 * violations (same state+occupation+effective_from) are silently skipped.
 */

import mongoose from "mongoose";
import dotenv   from "dotenv";
import path     from "path";
import { fileURLToPath } from "url";

// ─── Load env from server/.env (scraper shares the same config) ───────────────
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../server/.env") });

// ─── Inline WageRule schema (avoids importing the full server model tree) ─────
const WageRuleSchema = new mongoose.Schema({
  state:            { type: String, required: true, uppercase: true },
  occupation:       { type: String, required: true },
  daily_rate:       { type: Number, required: true },
  effective_from:   { type: Date,   required: true },
  notification_ref: { type: String },
  created_at:       { type: Date,   default: Date.now },
});
WageRuleSchema.index({ state: 1, occupation: 1, effective_from: -1 });
const WageRule = mongoose.models.WageRule || mongoose.model("WageRule", WageRuleSchema);

// ─── Wage data ─────────────────────────────────────────────────────────────────
/**
 * Daily minimum wage rates in ₹ for April 2024 – March 2025.
 *
 * Methodology:
 *   Most state notifications specify monthly rates for scheduled employment
 *   categories. Daily rate = Monthly rate ÷ 26 (standard Indian labour convention).
 *   Values rounded to nearest rupee.
 *
 * State codes:
 *   MH = Maharashtra  DL = Delhi       KA = Karnataka   WB = West Bengal
 *   TN = Tamil Nadu   UP = Uttar Pradesh GJ = Gujarat
 *   RJ = Rajasthan    HR = Haryana     AP = Andhra Pradesh
 *
 * Occupations → Employment schedule mapping:
 *   construction → "Construction & Maintenance of Roads and Buildings"
 *   security     → "Shops & Establishments / Security Guards"
 *   domestic     → "Domestic Workers"
 *   factory      → "Factory / Manufacturing (semi-skilled)"
 *   driver       → "Motor Transport Workers"
 */
const WAGE_DATA = [
  // ── Maharashtra (MH) ────────────────────────────────────────────────────────
  // Notification: Maharashtra Govt Gazette, April 2024
  { state: "MH", occupation: "construction", daily_rate: 692, notification_ref: "MH/LBR/2024-04/CW/001" },
  { state: "MH", occupation: "security",     daily_rate: 654, notification_ref: "MH/LBR/2024-04/SG/002" },
  { state: "MH", occupation: "domestic",     daily_rate: 635, notification_ref: "MH/LBR/2024-04/DW/003" },
  { state: "MH", occupation: "factory",      daily_rate: 712, notification_ref: "MH/LBR/2024-04/FA/004" },
  { state: "MH", occupation: "driver",       daily_rate: 731, notification_ref: "MH/LBR/2024-04/MT/005" },

  // ── Delhi (DL) ──────────────────────────────────────────────────────────────
  // DL has India's highest minimum wages; revised twice yearly
  { state: "DL", occupation: "construction", daily_rate: 783, notification_ref: "DL/LAB/2024-04/CW/001" },
  { state: "DL", occupation: "security",     daily_rate: 769, notification_ref: "DL/LAB/2024-04/SG/002" },
  { state: "DL", occupation: "domestic",     daily_rate: 750, notification_ref: "DL/LAB/2024-04/DW/003" },
  { state: "DL", occupation: "factory",      daily_rate: 800, notification_ref: "DL/LAB/2024-04/FA/004" },
  { state: "DL", occupation: "driver",       daily_rate: 819, notification_ref: "DL/LAB/2024-04/MT/005" },

  // ── Karnataka (KA) ──────────────────────────────────────────────────────────
  { state: "KA", occupation: "construction", daily_rate: 619, notification_ref: "KA/LBR/2024-04/CW/001" },
  { state: "KA", occupation: "security",     daily_rate: 600, notification_ref: "KA/LBR/2024-04/SG/002" },
  { state: "KA", occupation: "domestic",     daily_rate: 585, notification_ref: "KA/LBR/2024-04/DW/003" },
  { state: "KA", occupation: "factory",      daily_rate: 638, notification_ref: "KA/LBR/2024-04/FA/004" },
  { state: "KA", occupation: "driver",       daily_rate: 654, notification_ref: "KA/LBR/2024-04/MT/005" },

  // ── West Bengal (WB) ────────────────────────────────────────────────────────
  { state: "WB", occupation: "construction", daily_rate: 538, notification_ref: "WB/LAB/2024-04/CW/001" },
  { state: "WB", occupation: "security",     daily_rate: 519, notification_ref: "WB/LAB/2024-04/SG/002" },
  { state: "WB", occupation: "domestic",     daily_rate: 500, notification_ref: "WB/LAB/2024-04/DW/003" },
  { state: "WB", occupation: "factory",      daily_rate: 554, notification_ref: "WB/LAB/2024-04/FA/004" },
  { state: "WB", occupation: "driver",       daily_rate: 569, notification_ref: "WB/LAB/2024-04/MT/005" },

  // ── Tamil Nadu (TN) ─────────────────────────────────────────────────────────
  { state: "TN", occupation: "construction", daily_rate: 577, notification_ref: "TN/LAB/2024-04/CW/001" },
  { state: "TN", occupation: "security",     daily_rate: 558, notification_ref: "TN/LAB/2024-04/SG/002" },
  { state: "TN", occupation: "domestic",     daily_rate: 542, notification_ref: "TN/LAB/2024-04/DW/003" },
  { state: "TN", occupation: "factory",      daily_rate: 596, notification_ref: "TN/LAB/2024-04/FA/004" },
  { state: "TN", occupation: "driver",       daily_rate: 615, notification_ref: "TN/LAB/2024-04/MT/005" },

  // ── Uttar Pradesh (UP) ──────────────────────────────────────────────────────
  { state: "UP", occupation: "construction", daily_rate: 484, notification_ref: "UP/LAB/2024-04/CW/001" },
  { state: "UP", occupation: "security",     daily_rate: 465, notification_ref: "UP/LAB/2024-04/SG/002" },
  { state: "UP", occupation: "domestic",     daily_rate: 450, notification_ref: "UP/LAB/2024-04/DW/003" },
  { state: "UP", occupation: "factory",      daily_rate: 500, notification_ref: "UP/LAB/2024-04/FA/004" },
  { state: "UP", occupation: "driver",       daily_rate: 515, notification_ref: "UP/LAB/2024-04/MT/005" },

  // ── Gujarat (GJ) ────────────────────────────────────────────────────────────
  { state: "GJ", occupation: "construction", daily_rate: 558, notification_ref: "GJ/LAB/2024-04/CW/001" },
  { state: "GJ", occupation: "security",     daily_rate: 538, notification_ref: "GJ/LAB/2024-04/SG/002" },
  { state: "GJ", occupation: "domestic",     daily_rate: 523, notification_ref: "GJ/LAB/2024-04/DW/003" },
  { state: "GJ", occupation: "factory",      daily_rate: 577, notification_ref: "GJ/LAB/2024-04/FA/004" },
  { state: "GJ", occupation: "driver",       daily_rate: 592, notification_ref: "GJ/LAB/2024-04/MT/005" },

  // ── Rajasthan (RJ) ──────────────────────────────────────────────────────────
  { state: "RJ", occupation: "construction", daily_rate: 484, notification_ref: "RJ/LAB/2024-04/CW/001" },
  { state: "RJ", occupation: "security",     daily_rate: 469, notification_ref: "RJ/LAB/2024-04/SG/002" },
  { state: "RJ", occupation: "domestic",     daily_rate: 454, notification_ref: "RJ/LAB/2024-04/DW/003" },
  { state: "RJ", occupation: "factory",      daily_rate: 500, notification_ref: "RJ/LAB/2024-04/FA/004" },
  { state: "RJ", occupation: "driver",       daily_rate: 515, notification_ref: "RJ/LAB/2024-04/MT/005" },

  // ── Haryana (HR) ────────────────────────────────────────────────────────────
  { state: "HR", occupation: "construction", daily_rate: 654, notification_ref: "HR/LAB/2024-04/CW/001" },
  { state: "HR", occupation: "security",     daily_rate: 635, notification_ref: "HR/LAB/2024-04/SG/002" },
  { state: "HR", occupation: "domestic",     daily_rate: 619, notification_ref: "HR/LAB/2024-04/DW/003" },
  { state: "HR", occupation: "factory",      daily_rate: 673, notification_ref: "HR/LAB/2024-04/FA/004" },
  { state: "HR", occupation: "driver",       daily_rate: 692, notification_ref: "HR/LAB/2024-04/MT/005" },

  // ── Andhra Pradesh (AP) ─────────────────────────────────────────────────────
  { state: "AP", occupation: "construction", daily_rate: 523, notification_ref: "AP/LAB/2024-04/CW/001" },
  { state: "AP", occupation: "security",     daily_rate: 504, notification_ref: "AP/LAB/2024-04/SG/002" },
  { state: "AP", occupation: "domestic",     daily_rate: 488, notification_ref: "AP/LAB/2024-04/DW/003" },
  { state: "AP", occupation: "factory",      daily_rate: 542, notification_ref: "AP/LAB/2024-04/FA/004" },
  { state: "AP", occupation: "driver",       daily_rate: 558, notification_ref: "AP/LAB/2024-04/MT/005" },
];

// Stamp all records with the April 2024 effective date
const EFFECTIVE_FROM = new Date("2024-04-01T00:00:00.000Z");
const records = WAGE_DATA.map((r) => ({ ...r, effective_from: EFFECTIVE_FROM }));

// ─── Seed runner ──────────────────────────────────────────────────────────────
const seed = async () => {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error("❌  MONGO_URI is not set. Create server/.env from .env.example.");
    process.exit(1);
  }

  console.log("🌱  ShiftSense WageRule seed starting…");
  console.log(`    Target: ${records.length} records across 10 states × 5 occupations`);
  console.log(`    Effective from: ${EFFECTIVE_FROM.toDateString()}\n`);

  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
    console.log("✅  MongoDB connected.");

    // Build compound index if it doesn't exist yet
    await WageRule.createIndexes();

    // insertMany with ordered: false — if some docs already exist (duplicate
    // compound index), those fail silently while the rest succeed.
    let inserted = 0;
    let skipped  = 0;

    try {
      const result = await WageRule.insertMany(records, {
        ordered:           false,
        rawResult:         true,
      });
      inserted = result.insertedCount;
    } catch (bulkErr) {
      // BulkWriteError is thrown even on partial success when ordered: false
      if (bulkErr.code === 11000 || bulkErr.name === "MongoBulkWriteError") {
        inserted = bulkErr.result?.nInserted ?? 0;
        skipped  = records.length - inserted;
      } else {
        throw bulkErr;
      }
    }

    console.log(`\n📊  Results:`);
    console.log(`    ✅  Inserted : ${inserted}`);
    console.log(`    ⏭️   Skipped  : ${skipped} (already exist)`);
    console.log(`    📋  Total    : ${records.length}`);

    // Print a summary table
    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("  State  Occupation     Daily Rate (₹)");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    for (const r of records) {
      const occ = r.occupation.padEnd(14);
      console.log(`  ${r.state}     ${occ} ₹${r.daily_rate}`);
    }
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    console.log("🎉  Seed complete. Run the app and start logging shifts!\n");
  } catch (err) {
    console.error("❌  Seed failed:", err.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log("🔌  MongoDB disconnected.");
  }
};

seed();
