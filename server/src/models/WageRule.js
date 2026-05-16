/**
 * models/WageRule.js — ShiftSense WageRule model
 *
 * Stores state-specific minimum daily wage rates scraped from official
 * government labour portals via the Puppeteer scraper service.
 *
 * Query pattern used by the wage calculation service:
 *   db.wagerules.find({ state, occupation })
 *     .sort({ effective_from: -1 })
 *     .limit(1)
 *
 * The compound index below makes this O(log n) regardless of collection size.
 * effective_from is stored in descending order so the most recent rule is
 * always the first hit — avoiding a collection scan + in-memory sort.
 */

import mongoose from "mongoose";
import { OCCUPATION_ENUM } from "./Worker.js";

const { Schema, model } = mongoose;

// ─── Schema ───────────────────────────────────────────────────────────────────
const WageRuleSchema = new Schema(
  {
    // ISO 3166-2:IN two-letter state code e.g. "MH", "DL", "KA"
    state: {
      type: String,
      required: [true, "state is required."],
      uppercase: true,
      trim: true,
      match: [/^[A-Z]{2}$/, "State must be a 2-letter ISO code (e.g. MH)."],
    },

    occupation: {
      type: String,
      required: [true, "occupation is required."],
      enum: {
        values: OCCUPATION_ENUM,
        message: `Occupation must be one of: ${OCCUPATION_ENUM.join(", ")}.`,
      },
    },

    // Minimum wage in ₹ per day as notified by the state government
    daily_rate: {
      type: Number,
      required: [true, "daily_rate is required."],
      min: [1, "daily_rate must be greater than 0."],
    },

    // Date from which this rate is legally effective
    effective_from: {
      type: Date,
      required: [true, "effective_from is required."],
    },

    // Government gazette / notification reference number for audit trail
    notification_ref: {
      type: String,
      trim: true,
      maxlength: [200, "notification_ref must not exceed 200 characters."],
    },

    created_at: {
      type: Date,
      default: Date.now,
      immutable: true,
    },
  },
  {
    versionKey: false,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// ─── Indexes ──────────────────────────────────────────────────────────────────

/**
 * Compound index: state ASC, occupation ASC, effective_from DESC
 *
 * This index satisfies the "latest wage rule for a given state + occupation"
 * query in a single index scan with no additional sort step.
 * MongoDB uses the index prefix (state, occupation) for filtering, then
 * walks the descending effective_from to return the newest rule first.
 */
WageRuleSchema.index(
  { state: 1, occupation: 1, effective_from: -1 },
  {
    name: "idx_wage_rule_lookup",
    // background: true is the default in Mongoose 7+ for non-unique indexes
  },
);

// ─── Static method — fetch the currently applicable rate ─────────────────────
/**
 * Returns the single most-recent WageRule for a given state + occupation,
 * effective on or before today.
 *
 * @param {string} state       2-letter state code
 * @param {string} occupation  One of OCCUPATION_ENUM
 * @returns {Promise<WageRule|null>}
 */
WageRuleSchema.statics.findCurrent = async function (state, occupation) {
  return this.findOne({
    state: state.toUpperCase(),
    occupation,
    effective_from: { $lte: new Date() },
  }).sort({ effective_from: -1 });
};

export default model("WageRule", WageRuleSchema);
