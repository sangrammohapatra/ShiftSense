/**
 * models/Worker.js — ShiftSense Worker model
 *
 * Represents an informal-sector worker who interacts exclusively via WhatsApp.
 * Uniqueness is enforced on phone_number; aadhaar_last4 is a secondary
 * disambiguation aid (not used as a unique key alone).
 */

import mongoose from "mongoose";

const { Schema, model } = mongoose;

// ─── Sub-schema / enum constants (exported for reuse in services) ─────────────
export const OCCUPATION_ENUM = [
  "construction",
  "security",
  "domestic",
  "factory",
  "driver",
];

export const LANGUAGE_ENUM = ["en", "hi"];

// ─── Schema ───────────────────────────────────────────────────────────────────
const WorkerSchema = new Schema(
  {
    // Primary identifier — WhatsApp sender number in E.164 format e.g. +919876543210
    phone_number: {
      type: String,
      required: [true, "Phone number is required."],
      unique: true,
      trim: true,
      match: [
        /^\+?[1-9]\d{7,14}$/,
        "Phone number must be a valid E.164 number.",
      ],
    },

    name: {
      type: String,
      trim: true,
      maxlength: [100, "Name must not exceed 100 characters."],
    },

    // ISO 3166-2:IN two-letter state code e.g. "MH", "DL", "KA"
    state: {
      type: String,
      uppercase: true,
      trim: true,
      match: [/^[A-Z]{2}$/, "State must be a 2-letter ISO code (e.g. MH)."],
    },

    occupation: {
      type: String,
      enum: {
        values: OCCUPATION_ENUM,
        message: `Occupation must be one of: ${OCCUPATION_ENUM.join(", ")}.`,
      },
    },

    language: {
      type: String,
      enum: {
        values: LANGUAGE_ENUM,
        message: `Language must be one of: ${LANGUAGE_ENUM.join(", ")}.`,
      },
      default: "en",
    },

    // Last 4 digits of Aadhaar — stored only for de-duplication, never full number
    aadhaar_last4: {
      type: String,
      trim: true,
      match: [/^\d{4}$/, "aadhaar_last4 must be exactly 4 digits."],
    },

    // Set to true once name + state + occupation + aadhaar_last4 are all present
    is_verified: {
      type: Boolean,
      default: false,
    },

    // Daily wage (₹) the employer claims to pay this worker.
    // Set by the employer via PATCH /api/v1/workers/:id.
    // Used as the default claimed_amount when a worker omits it from their
    // WhatsApp shift message, and displayed on the employer dashboard.
    claimed_daily_wage: {
      type: Number,
      default: null,
      min: [0, "claimed_daily_wage cannot be negative."],
    },

    // Optional back-reference to an Employer who linked this worker
    employer_id: {
      type: Schema.Types.ObjectId,
      ref: "Employer",
      default: null,
    },

    registered_at: {
      type: Date,
      default: Date.now,
      immutable: true, // never change after first write
    },

    // Managed by the pre-save hook below
    updated_at: {
      type: Date,
      default: Date.now,
    },
  },
  {
    // Disable Mongoose's automatic __v field — we track changes via updated_at
    versionKey: false,
    // Ensure virtual fields appear when converting to JSON (e.g. in API responses)
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// ─── Indexes ──────────────────────────────────────────────────────────────────
// phone_number unique index is created by the `unique: true` field option above.
// Additional sparse index for employer lookups on the worker list.
WorkerSchema.index({ employer_id: 1 });

// ─── Pre-save hook — stamp updated_at on every save ──────────────────────────
WorkerSchema.pre("save", function (next) {
  this.updated_at = new Date();
  next();
});

// ─── Virtual — full registration completeness check ───────────────────────────
WorkerSchema.virtual("is_profile_complete").get(function () {
  return !!(this.name && this.state && this.occupation && this.aadhaar_last4);
});

export default model("Worker", WorkerSchema);
