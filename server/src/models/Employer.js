/**
 * models/Employer.js — ShiftSense Employer model
 *
 * Represents a business owner who accesses ShiftSense via the React dashboard.
 * Password is stored as a bcrypt hash — never in plaintext.
 * worker_count is a denormalised counter kept in sync by the EmployerWorker
 * service rather than computed via aggregation on every request.
 */

import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const { Schema, model } = mongoose;

const PLAN_ENUM = ["free", "pro"];

// ─── Schema ───────────────────────────────────────────────────────────────────
const EmployerSchema = new Schema(
  {
    company_name: {
      type: String,
      required: [true, "Company name is required."],
      trim: true,
      maxlength: [150, "Company name must not exceed 150 characters."],
    },

    contact_name: {
      type: String,
      required: [true, "Contact name is required."],
      trim: true,
      maxlength: [100, "Contact name must not exceed 100 characters."],
    },

    email: {
      type: String,
      required: [true, "Email is required."],
      unique: true,
      lowercase: true,
      trim: true,
      match: [
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        "Please provide a valid email address.",
      ],
    },

    // Always store bcrypt hash, never raw password
    password: {
      type: String,
      required: [true, "Password is required."],
      minlength: [8, "Password must be at least 8 characters."],
      // Exclude from query results by default — call .select("+password") when needed
      select: false,
    },

    phone: {
      type: String,
      trim: true,
      match: [
        /^\+?[1-9]\d{7,14}$/,
        "Phone number must be a valid E.164 number.",
      ],
    },

    // GSTIN format: 2-digit state code + 10-char PAN + 3 chars e.g. 27AAPFU0939F1ZV
    gst_number: {
      type: String,
      trim: true,
      uppercase: true,
      match: [
        /^\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}[Z]{1}[A-Z\d]{1}$/,
        "GST number format is invalid.",
      ],
    },

    // ISO 3166-2:IN two-letter state code — determines which wage rules apply
    state: {
      type: String,
      uppercase: true,
      trim: true,
      match: [/^[A-Z]{2}$/, "State must be a 2-letter ISO code (e.g. MH)."],
    },

    plan: {
      type: String,
      enum: {
        values: PLAN_ENUM,
        message: `Plan must be one of: ${PLAN_ENUM.join(", ")}.`,
      },
      default: "free",
    },

    // Denormalised count — incremented/decremented by EmployerWorker service
    worker_count: {
      type: Number,
      default: 0,
      min: [0, "worker_count cannot be negative."],
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
// email unique index created by `unique: true` above.
EmployerSchema.index({ state: 1 });

// ─── Pre-save hook — hash password only when it has been modified ─────────────
EmployerSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();

  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (err) {
    next(err);
  }
});

// ─── Instance method — verify candidate password against stored hash ───────────
/**
 * @param {string} candidatePassword  Plaintext password from login request
 * @returns {Promise<boolean>}
 */
EmployerSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// ─── Virtual — human-readable plan label ─────────────────────────────────────
EmployerSchema.virtual("plan_label").get(function () {
  return this.plan === "pro" ? "Pro Plan" : "Free Plan";
});

export default model("Employer", EmployerSchema);
