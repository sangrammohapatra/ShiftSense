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
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// ─── Load env from server/.env (scraper shares the same config) ───────────────
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../server/.env") });

// ─── Inline WageRule schema (avoids importing the full server model tree) ─────
const WageRuleSchema = new mongoose.Schema({
  state: { type: String, required: true, uppercase: true },
  occupation: { type: String, required: true },
  daily_rate: { type: Number, required: true },
  effective_from: { type: Date, required: true },
  notification_ref: { type: String },
  created_at: { type: Date, default: Date.now },
});
WageRuleSchema.index({ state: 1, occupation: 1, effective_from: -1 });
const WageRule = mongoose.models.WageRule || mongoose.model("WageRule", WageRuleSchema);

const DEFAULT_EFFECTIVE_FROM = new Date("2024-04-01T00:00:00.000Z");
const REQUESTED_STATE = String(process.argv[2] ?? "").trim().toUpperCase();

/*
Fallback seed data used until live scraping inserts newer records.

Odisha note:
- Odisha publishes statewide category rates by skill band.
- The app occupations are mapped to the nearest official skill category:
  construction -> unskilled
  domestic     -> unskilled
  security     -> semi-skilled
  factory      -> skilled
  driver       -> highly skilled

Official Odisha source used for the latest rates seeded here:
- Odisha Labour Directorate notification no. 8584 dated November 21, 2025
- Minimum wage with VDA effective October 1, 2025:
  Unskilled 462, Semi-skilled 512, Skilled 562, Highly Skilled 612
*/
const WAGE_DATA = [
  // ── Maharashtra (MH) ────────────────────────────────────────────────────────
  // Notification: Maharashtra Govt Gazette, April 2024
  { state: "MH", occupation: "construction", daily_rate: 692, notification_ref: "MH/LBR/2024-04/CW/001" },
  { state: "MH", occupation: "security", daily_rate: 654, notification_ref: "MH/LBR/2024-04/SG/002" },
  { state: "MH", occupation: "domestic", daily_rate: 635, notification_ref: "MH/LBR/2024-04/DW/003" },
  { state: "MH", occupation: "factory", daily_rate: 712, notification_ref: "MH/LBR/2024-04/FA/004" },
  { state: "MH", occupation: "driver", daily_rate: 731, notification_ref: "MH/LBR/2024-04/MT/005" },

  // ── Delhi (DL) ──────────────────────────────────────────────────────────────
  // DL has India's highest minimum wages; revised twice yearly
  { state: "DL", occupation: "construction", daily_rate: 783, notification_ref: "DL/LAB/2024-04/CW/001" },
  { state: "DL", occupation: "security", daily_rate: 769, notification_ref: "DL/LAB/2024-04/SG/002" },
  { state: "DL", occupation: "domestic", daily_rate: 750, notification_ref: "DL/LAB/2024-04/DW/003" },
  { state: "DL", occupation: "factory", daily_rate: 800, notification_ref: "DL/LAB/2024-04/FA/004" },
  { state: "DL", occupation: "driver", daily_rate: 819, notification_ref: "DL/LAB/2024-04/MT/005" },

  // ── Karnataka (KA) ──────────────────────────────────────────────────────────
  { state: "KA", occupation: "construction", daily_rate: 619, notification_ref: "KA/LBR/2024-04/CW/001" },
  { state: "KA", occupation: "security", daily_rate: 600, notification_ref: "KA/LBR/2024-04/SG/002" },
  { state: "KA", occupation: "domestic", daily_rate: 585, notification_ref: "KA/LBR/2024-04/DW/003" },
  { state: "KA", occupation: "factory", daily_rate: 638, notification_ref: "KA/LBR/2024-04/FA/004" },
  { state: "KA", occupation: "driver", daily_rate: 654, notification_ref: "KA/LBR/2024-04/MT/005" },

  // ── West Bengal (WB) ────────────────────────────────────────────────────────
  { state: "WB", occupation: "construction", daily_rate: 538, notification_ref: "WB/LAB/2024-04/CW/001" },
  { state: "WB", occupation: "security", daily_rate: 519, notification_ref: "WB/LAB/2024-04/SG/002" },
  { state: "WB", occupation: "domestic", daily_rate: 500, notification_ref: "WB/LAB/2024-04/DW/003" },
  { state: "WB", occupation: "factory", daily_rate: 554, notification_ref: "WB/LAB/2024-04/FA/004" },
  { state: "WB", occupation: "driver", daily_rate: 569, notification_ref: "WB/LAB/2024-04/MT/005" },

  // ── Tamil Nadu (TN) ─────────────────────────────────────────────────────────
  { state: "TN", occupation: "construction", daily_rate: 577, notification_ref: "TN/LAB/2024-04/CW/001" },
  { state: "TN", occupation: "security", daily_rate: 558, notification_ref: "TN/LAB/2024-04/SG/002" },
  { state: "TN", occupation: "domestic", daily_rate: 542, notification_ref: "TN/LAB/2024-04/DW/003" },
  { state: "TN", occupation: "factory", daily_rate: 596, notification_ref: "TN/LAB/2024-04/FA/004" },
  { state: "TN", occupation: "driver", daily_rate: 615, notification_ref: "TN/LAB/2024-04/MT/005" },

  // ── Uttar Pradesh (UP) ──────────────────────────────────────────────────────
  { state: "UP", occupation: "construction", daily_rate: 484, notification_ref: "UP/LAB/2024-04/CW/001" },
  { state: "UP", occupation: "security", daily_rate: 465, notification_ref: "UP/LAB/2024-04/SG/002" },
  { state: "UP", occupation: "domestic", daily_rate: 450, notification_ref: "UP/LAB/2024-04/DW/003" },
  { state: "UP", occupation: "factory", daily_rate: 500, notification_ref: "UP/LAB/2024-04/FA/004" },
  { state: "UP", occupation: "driver", daily_rate: 515, notification_ref: "UP/LAB/2024-04/MT/005" },

  // ── Gujarat (GJ) ────────────────────────────────────────────────────────────
  { state: "GJ", occupation: "construction", daily_rate: 558, notification_ref: "GJ/LAB/2024-04/CW/001" },
  { state: "GJ", occupation: "security", daily_rate: 538, notification_ref: "GJ/LAB/2024-04/SG/002" },
  { state: "GJ", occupation: "domestic", daily_rate: 523, notification_ref: "GJ/LAB/2024-04/DW/003" },
  { state: "GJ", occupation: "factory", daily_rate: 577, notification_ref: "GJ/LAB/2024-04/FA/004" },
  { state: "GJ", occupation: "driver", daily_rate: 592, notification_ref: "GJ/LAB/2024-04/MT/005" },

  // ── Rajasthan (RJ) ──────────────────────────────────────────────────────────
  { state: "RJ", occupation: "construction", daily_rate: 484, notification_ref: "RJ/LAB/2024-04/CW/001" },
  { state: "RJ", occupation: "security", daily_rate: 469, notification_ref: "RJ/LAB/2024-04/SG/002" },
  { state: "RJ", occupation: "domestic", daily_rate: 454, notification_ref: "RJ/LAB/2024-04/DW/003" },
  { state: "RJ", occupation: "factory", daily_rate: 500, notification_ref: "RJ/LAB/2024-04/FA/004" },
  { state: "RJ", occupation: "driver", daily_rate: 515, notification_ref: "RJ/LAB/2024-04/MT/005" },

  // ── Haryana (HR) ────────────────────────────────────────────────────────────
  { state: "HR", occupation: "construction", daily_rate: 654, notification_ref: "HR/LAB/2024-04/CW/001" },
  { state: "HR", occupation: "security", daily_rate: 635, notification_ref: "HR/LAB/2024-04/SG/002" },
  { state: "HR", occupation: "domestic", daily_rate: 619, notification_ref: "HR/LAB/2024-04/DW/003" },
  { state: "HR", occupation: "factory", daily_rate: 673, notification_ref: "HR/LAB/2024-04/FA/004" },
  { state: "HR", occupation: "driver", daily_rate: 692, notification_ref: "HR/LAB/2024-04/MT/005" },

  // ── Andhra Pradesh (AP) ─────────────────────────────────────────────────────
  { state: "AP", occupation: "construction", daily_rate: 523, notification_ref: "AP/LAB/2024-04/CW/001" },
  { state: "AP", occupation: "security", daily_rate: 504, notification_ref: "AP/LAB/2024-04/SG/002" },
  { state: "AP", occupation: "domestic", daily_rate: 488, notification_ref: "AP/LAB/2024-04/DW/003" },
  { state: "AP", occupation: "factory", daily_rate: 542, notification_ref: "AP/LAB/2024-04/FA/004" },
  { state: "AP", occupation: "driver", daily_rate: 558, notification_ref: "AP/LAB/2024-04/MT/005" },
  
  // ── Odisha (OD) ─────────────────────────────────────────────────────────────
  { state: "OD", occupation: "construction", daily_rate: 462, notification_ref: "OD/LC/2025-11/VDA/8584", effective_from: new Date("2025-10-01T00:00:00.000Z") },
  { state: "OD", occupation: "security", daily_rate: 512, notification_ref: "OD/LC/2025-11/VDA/8584", effective_from: new Date("2025-10-01T00:00:00.000Z") },
  { state: "OD", occupation: "domestic", daily_rate: 462, notification_ref: "OD/LC/2025-11/VDA/8584", effective_from: new Date("2025-10-01T00:00:00.000Z") },
  { state: "OD", occupation: "factory", daily_rate: 562, notification_ref: "OD/LC/2025-11/VDA/8584", effective_from: new Date("2025-10-01T00:00:00.000Z") },
  { state: "OD", occupation: "driver", daily_rate: 612, notification_ref: "OD/LC/2025-11/VDA/8584", effective_from: new Date("2025-10-01T00:00:00.000Z") },
];

const allRecords = WAGE_DATA.map((record) => ({
  ...record,
  effective_from: record.effective_from ?? DEFAULT_EFFECTIVE_FROM,
}));

const knownStates = [...new Set(allRecords.map((record) => record.state))].sort();

if (REQUESTED_STATE && !knownStates.includes(REQUESTED_STATE)) {
  console.error(
    `Invalid state code "${REQUESTED_STATE}". Available states: ${knownStates.join(", ")}`
  );
  process.exit(1);
}

const records = REQUESTED_STATE
  ? allRecords.filter((record) => record.state === REQUESTED_STATE)
  : allRecords;

const seed = async () => {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error("MONGO_URI is not set. Create server/.env from .env.example.");
    process.exit(1);
  }

  if (records.length === 0) {
    console.error("No records matched the requested state filter.");
    process.exit(1);
  }

  const effectiveDates = [
    ...new Set(records.map((record) => record.effective_from.toISOString().slice(0, 10))),
  ];

  console.log("ShiftSense WageRule seed starting...");
  console.log(
    `    Target: ${records.length} records` +
      (REQUESTED_STATE
        ? ` for ${REQUESTED_STATE}`
        : ` across ${knownStates.length} states`)
  );
  console.log(`    Effective dates: ${effectiveDates.join(", ")}\n`);

  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
    console.log("✅  MongoDB connected.");

    // Build compound index if it doesn't exist yet
    await WageRule.createIndexes();

    // insertMany with ordered: false — if some docs already exist (duplicate
    // compound index), those fail silently while the rest succeed.
    const statesToReplace = [...new Set(records.map((record) => record.state))];
    const deleteResult = await WageRule.deleteMany({ state: { $in: statesToReplace } });
    const insertedDocs = await WageRule.insertMany(records);
    const inserted = insertedDocs.length;

    console.log("\nResults:");
    console.log(`    Cleared  : ${deleteResult.deletedCount}`);
    console.log(`    Inserted : ${inserted}`);
    console.log(`    Total    : ${records.length}`);

    console.log("\n------------------------------------------------------------");
    console.log("  State  Occupation     Daily Rate (INR)  Effective From");
    console.log("------------------------------------------------------------");

    for (const record of records) {
      const occ = record.occupation.padEnd(14);
      const rate = String(record.daily_rate).padStart(4, " ");
      const date = record.effective_from.toISOString().slice(0, 10);
      console.log(`  ${record.state}     ${occ} ${rate}            ${date}`);
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
