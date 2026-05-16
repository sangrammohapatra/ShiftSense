/**
 * services/rulesEngine.js — ShiftSense statutory wage rules engine
 *
 * Implements Indian labour law calculations for a single shift:
 *
 *   Regular pay   — Minimum Wages Act, 1948 §12
 *   Overtime pay  — Factories Act, 1948 §59 (double rate beyond 8 hours/day)
 *   EPF           — EPF & Miscellaneous Provisions Act, 1952 §6
 *                   12% employer share if monthly wages ≤ ₹15,000
 *   ESI           — Employees' State Insurance Act, 1948 §40
 *                   0.75% employee contribution if monthly wages ≤ ₹21,000
 *
 * All monetary values are rounded to 2 decimal places.
 * Monthly thresholds are approximated using 26 working days/month —
 * the standard assumption used by Indian labour courts.
 */

import { WageRule } from "../models/index.js";

// ─── Constants ─────────────────────────────────────────────────────────────────
const STANDARD_HOURS_PER_DAY = 8; // Factories Act standard day
const WORKING_DAYS_PER_MONTH = 26; // Indian labour law convention
const OT_MULTIPLIER = 2; // Factories Act §59 — double rate
const EPF_RATE = 0.12; // 12%
const ESI_RATE = 0.0075; // 0.75%
const EPF_MONTHLY_CEILING = 15_000; // ₹15,000/month
const ESI_MONTHLY_CEILING = 21_000; // ₹21,000/month
const DISPUTE_THRESHOLD = 50; // ₹50 shortfall triggers dispute letter

// Law section references — included in every entitlement breakdown
const LAW_CITATIONS = {
  minWage: "Minimum Wages Act, 1948 — Section 12",
  overtime: "Factories Act, 1948 — Section 59 (double rate beyond 8 hours/day)",
  epf: "EPF & Miscellaneous Provisions Act, 1952 — Section 6",
  esi: "Employees' State Insurance Act, 1948 — Section 40",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const round2 = (n) => Math.round(n * 100) / 100;

// ─── getMinWage ────────────────────────────────────────────────────────────────
/**
 * Fetches the currently applicable minimum daily wage for a state + occupation.
 * Uses the WageRule.findCurrent() static which sorts by effective_from DESC.
 *
 * @param {string} state       2-letter state code
 * @param {string} occupation  One of OCCUPATION_ENUM
 * @returns {Promise<{ daily_rate: number, notification_ref: string } | null>}
 */
export const getMinWage = async (state, occupation) => {
  const rule = await WageRule.findCurrent(state, occupation);
  if (!rule) {
    console.warn(
      `[RulesEngine] No WageRule found for state=${state} occupation=${occupation}`,
    );
    return null;
  }
  return rule;
};

// ─── calculateEntitlement ─────────────────────────────────────────────────────
/**
 * Calculates the full statutory entitlement for a single shift.
 *
 * @param {object} shiftData
 *   @param {number} shiftData.start_hour         0-23
 *   @param {number} shiftData.end_hour           0-47 (overnight allowed)
 *   @param {string} shiftData.state              2-letter state code
 *   @param {string} shiftData.occupation
 * @param {object} worker
 *   @param {number|null} worker.claimed_daily_wage  Employer's stated daily wage
 *
 * @returns {Promise<{
 *   hours_worked:    number,
 *   ot_hours:        number,
 *   min_wage_applied: number,
 *   regular_pay:     number,
 *   ot_pay:          number,
 *   gross_owed:      number,
 *   epf_applicable:  boolean,
 *   epf_deduction:   number,
 *   esi_applicable:  boolean,
 *   esi_deduction:   number,
 *   net_owed:        number,
 *   claimed_amount:  number,
 *   shortfall:       number,
 *   dispute_triggered: boolean,
 *   law_sections:    string[],
 *   notification_ref: string | null,
 *   error?:          string,
 * }>}
 */
export const calculateEntitlement = async (shiftData, worker) => {
  const { start_hour, end_hour, state, occupation } = shiftData;

  // ── Step 1: fetch minimum wage ────────────────────────────────────────────
  const wageRule = await getMinWage(state, occupation);

  // Fallback: if no rule exists, we cannot calculate — return a safe error object
  if (!wageRule) {
    return {
      error:
        `No minimum wage data found for ${state} / ${occupation}. ` +
        `The scraper may not have run yet for this state.`,
    };
  }

  const minWage = wageRule.daily_rate; // ₹/day

  // ── Step 2: hours worked ──────────────────────────────────────────────────
  const hoursWorked = round2(end_hour - start_hour);
  const otHours = round2(Math.max(0, hoursWorked - STANDARD_HOURS_PER_DAY));
  const regularHrs = Math.min(hoursWorked, STANDARD_HOURS_PER_DAY);

  // ── Step 3: pay calculation ───────────────────────────────────────────────
  // Hourly rate derived from minimum daily wage
  const hourlyRate = minWage / STANDARD_HOURS_PER_DAY;
  const regularPay = round2(hourlyRate * regularHrs);
  const otPay = round2(hourlyRate * otHours * OT_MULTIPLIER);
  const grossOwed = round2(regularPay + otPay);

  // ── Step 4: EPF — 12% if projected monthly wage ≤ ₹15,000 ───────────────
  // Monthly projection: gross per day × 26 working days
  const monthlyGross = round2(grossOwed * WORKING_DAYS_PER_MONTH);
  const epfApplicable = monthlyGross <= EPF_MONTHLY_CEILING;
  const epfDeduction = epfApplicable ? round2(grossOwed * EPF_RATE) : 0;

  // ── Step 5: ESI — 0.75% employee share if monthly gross ≤ ₹21,000 ────────
  const esiApplicable = monthlyGross <= ESI_MONTHLY_CEILING;
  const esiDeduction = esiApplicable ? round2(grossOwed * ESI_RATE) : 0;

  // ── Step 6: net take-home ─────────────────────────────────────────────────
  const netOwed = round2(grossOwed - epfDeduction - esiDeduction);

  // ── Step 7: shortfall vs employer's claimed wage ──────────────────────────
  // Use employer's claimed_daily_wage as the baseline if set; otherwise 0
  const claimedAmount = round2(worker.claimed_daily_wage ?? 0);
  const shortfall = round2(grossOwed - claimedAmount);
  const disputeTriggered = shortfall > DISPUTE_THRESHOLD;

  // ── Step 8: build citations list ─────────────────────────────────────────
  const lawSections = [LAW_CITATIONS.minWage];
  if (otHours > 0) lawSections.push(LAW_CITATIONS.overtime);
  if (epfApplicable) lawSections.push(LAW_CITATIONS.epf);
  if (esiApplicable) lawSections.push(LAW_CITATIONS.esi);

  return {
    hours_worked: hoursWorked,
    ot_hours: otHours,
    min_wage_applied: minWage,
    regular_pay: regularPay,
    ot_pay: otPay,
    gross_owed: grossOwed,
    epf_applicable: epfApplicable,
    epf_deduction: epfDeduction,
    esi_applicable: esiApplicable,
    esi_deduction: esiDeduction,
    net_owed: netOwed,
    claimed_amount: claimedAmount,
    shortfall,
    dispute_triggered: disputeTriggered,
    law_sections: lawSections,
    notification_ref: wageRule.notification_ref ?? null,
  };
};

/**
 * Builds the human-readable entitlement breakdown message (bilingual).
 * Exported so the webhook handler can call it after saving the ShiftLog.
 *
 * @param {object} entitlement  Return value of calculateEntitlement()
 * @param {string} workerName
 * @param {string} shiftDate    "YYYY-MM-DD"
 * @returns {string}            WhatsApp-formatted message
 */
export const buildEntitlementMessage = (entitlement, workerName, shiftDate) => {
  const {
    hours_worked,
    ot_hours,
    min_wage_applied,
    regular_pay,
    ot_pay,
    gross_owed,
    epf_applicable,
    epf_deduction,
    esi_applicable,
    esi_deduction,
    net_owed,
    claimed_amount,
    shortfall,
    dispute_triggered,
    notification_ref,
  } = entitlement;

  const fmt = (n) => `₹${n.toFixed(2)}`;

  // Format date as "15 Jan 2025"
  const dateStr = new Date(shiftDate).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  let msg =
    `✅ *शिफ्ट लॉग हो गई / Shift Logged* — ${dateStr}\n` +
    `नमस्ते ${workerName}! 👷\n\n` +
    `📋 *आपका हिसाब / Your Entitlement:*\n` +
    `━━━━━━━━━━━━━━━━━\n` +
    `⏱ घंटे / Hours worked: *${hours_worked}h*\n`;

  if (ot_hours > 0) {
    msg += `⚡ ओवरटाइम / Overtime: *${ot_hours}h* (2× rate)\n`;
  }

  msg +=
    `💰 न्यूनतम वेतन / Min wage: *${fmt(min_wage_applied)}/day*\n` +
    `━━━━━━━━━━━━━━━━━\n` +
    `Regular pay:     ${fmt(regular_pay)}\n`;

  if (ot_hours > 0) {
    msg += `OT pay (2×):     ${fmt(ot_pay)}\n`;
  }

  msg += `*Gross owed:     ${fmt(gross_owed)}*\n`;

  if (epf_applicable) {
    msg += `EPF (12%):      -${fmt(epf_deduction)}\n`;
  }
  if (esi_applicable) {
    msg += `ESI (0.75%):    -${fmt(esi_deduction)}\n`;
  }

  msg += `━━━━━━━━━━━━━━━━━\n` + `🏠 *Net take-home: ${fmt(net_owed)}*\n\n`;

  if (claimed_amount > 0) {
    msg +=
      `मालिक का दावा / Employer claimed: ${fmt(claimed_amount)}\n` +
      `अंतर / Difference: *${fmt(shortfall)}*\n\n`;
  }

  if (notification_ref) {
    msg += `📄 Wage ref: ${notification_ref}\n`;
  }

  if (dispute_triggered) {
    msg +=
      `\n⚠️ *कम वेतन मिला है! / Underpayment detected!*\n` +
      `आपको ${fmt(shortfall)} कम मिले हैं।\n` +
      `You are owed ${fmt(shortfall)} more than claimed.\n\n` +
      `👉 कानूनी नोटिस के लिए / For a legal notice:\n` +
      `Reply *DISPUTE* to generate your formal wage dispute letter.\n` +
      `(Minimum Wages Act 1948 §12)`;
  } else {
    msg += `✅ वेतन सही लग रहा है। / Wage appears compliant.`;
  }

  return msg;
};
