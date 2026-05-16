/**
 * models/ShiftLog.js — ShiftSense ShiftLog model
 *
 * Records a single shift logged by a worker via WhatsApp.
 * All monetary fields are in Indian Rupees (₹), stored as Numbers
 * with 2 decimal precision (enforced in the wage-calculation service).
 *
 * The compound index on worker_id + shift_date speeds up:
 *   - Duplicate-shift detection (same worker, same day)
 *   - Worker shift history queries (sorted by date)
 */

import mongoose from "mongoose";
import { OCCUPATION_ENUM } from "./Worker.js";

const { Schema, model } = mongoose;

const STATUS_ENUM = ["logged", "disputed", "resolved"];

// ─── Schema ───────────────────────────────────────────────────────────────────
const ShiftLogSchema = new Schema(
  {
    worker_id: {
      type: Schema.Types.ObjectId,
      ref: "Worker",
      required: [true, "worker_id is required."],
    },

    // Populated when a worker has been linked to an employer at log time
    employer_id: {
      type: Schema.Types.ObjectId,
      ref: "Employer",
      default: null,
    },

    // Date only — time is captured via start_hour / end_hour
    // Stored as a Date with time zeroed to midnight UTC for consistent querying
    shift_date: {
      type: Date,
      required: [true, "shift_date is required."],
    },

    // Hours as decimals: 9.0 = 9:00 AM, 20.5 = 8:30 PM
    start_hour: {
      type: Number,
      required: [true, "start_hour is required."],
      min: [0, "start_hour must be ≥ 0."],
      max: [23.99, "start_hour must be < 24."],
    },

    end_hour: {
      type: Number,
      required: [true, "end_hour is required."],
      min: [0, "end_hour must be ≥ 0."],
      max: [47.99, "end_hour can extend past midnight (max 47.99)."],
    },

    // Total hours worked (end_hour - start_hour), computed by wage service
    hours_worked: {
      type: Number,
      required: [true, "hours_worked is required."],
      min: [0, "hours_worked cannot be negative."],
    },

    // Hours beyond the standard daily limit (typically 8 h under Factories Act)
    ot_hours: {
      type: Number,
      default: 0,
      min: [0, "ot_hours cannot be negative."],
    },

    // 2-letter state code — snapshot at log time (worker state may change)
    state: {
      type: String,
      required: [true, "state is required."],
      uppercase: true,
      trim: true,
      match: [/^[A-Z]{2}$/, "State must be a 2-letter ISO code."],
    },

    occupation: {
      type: String,
      required: [true, "occupation is required."],
      enum: {
        values: OCCUPATION_ENUM,
        message: `Occupation must be one of: ${OCCUPATION_ENUM.join(", ")}.`,
      },
    },

    // The WageRule daily_rate applied when calculating this shift
    min_wage_applied: {
      type: Number,
      required: [true, "min_wage_applied is required."],
      min: [0, "min_wage_applied cannot be negative."],
    },

    // ── Monetary outputs (all in ₹, 2 decimal places) ──────────────────────

    // Total owed before deductions (base + OT premium)
    gross_owed: {
      type: Number,
      required: [true, "gross_owed is required."],
      min: [0, "gross_owed cannot be negative."],
    },

    // EPF: 12 % of gross_owed if gross_owed ≤ ₹15,000 / month (daily equivalent applied)
    epf_deduction: {
      type: Number,
      default: 0,
      min: [0, "epf_deduction cannot be negative."],
    },

    // ESI: 0.75 % of gross_owed if gross_owed ≤ ₹21,000 / month (daily equivalent applied)
    esi_deduction: {
      type: Number,
      default: 0,
      min: [0, "esi_deduction cannot be negative."],
    },

    // Take-home after statutory deductions
    net_owed: {
      type: Number,
      required: [true, "net_owed is required."],
      min: [0, "net_owed cannot be negative."],
    },

    // What the employer actually claimed to pay (0 if not supplied by worker)
    claimed_amount: {
      type: Number,
      default: 0,
      min: [0, "claimed_amount cannot be negative."],
    },

    // gross_owed - claimed_amount; triggers dispute letter if > ₹50
    shortfall: {
      type: Number,
      default: 0,
    },

    status: {
      type: String,
      enum: {
        values: STATUS_ENUM,
        message: `Status must be one of: ${STATUS_ENUM.join(", ")}.`,
      },
      default: "logged",
    },

    // The verbatim WhatsApp message the worker sent — preserved for audit trail
    raw_message: {
      type: String,
      trim: true,
      maxlength: [500, "raw_message must not exceed 500 characters."],
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

// Primary query pattern: fetch all shifts for a worker ordered by date
ShiftLogSchema.index({ worker_id: 1, shift_date: -1 });

// Employer dashboard: all shifts across an employer's workforce by date
ShiftLogSchema.index({ employer_id: 1, shift_date: -1 });

// Dispute alert queries: filter by status across the collection
ShiftLogSchema.index({ status: 1 });

// ─── Virtual — whether this shift qualifies for a dispute letter ───────────────
ShiftLogSchema.virtual("is_disputed").get(function () {
  return this.shortfall > 50;
});

export default model("ShiftLog", ShiftLogSchema);
