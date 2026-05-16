/**
 * models/DisputeLetter.js — ShiftSense DisputeLetter model
 *
 * Created automatically by the dispute service whenever a ShiftLog's
 * shortfall exceeds ₹50. The generated PDF is uploaded to AWS S3 and
 * the URL is stored here. Status tracks the delivery lifecycle.
 *
 * Law sections cited in a typical letter:
 *   - Minimum Wages Act, 1948 — Section 12 (payment of minimum wages)
 *   - Factories Act, 1948 — Section 59 (overtime wages)
 *   - EPF & Miscellaneous Provisions Act, 1952 — Section 6
 *   - ESI Act, 1948 — Section 40
 */

import mongoose from "mongoose";

const { Schema, model } = mongoose;

const STATUS_ENUM = ["generated", "sent", "acknowledged"];

// ─── Schema ───────────────────────────────────────────────────────────────────
const DisputeLetterSchema = new Schema(
  {
    // The shift this letter relates to
    shift_id: {
      type: Schema.Types.ObjectId,
      ref: "ShiftLog",
      required: [true, "shift_id is required."],
    },

    worker_id: {
      type: Schema.Types.ObjectId,
      ref: "Worker",
      required: [true, "worker_id is required."],
    },

    // Null when worker is unlinked (no employer on record)
    employer_id: {
      type: Schema.Types.ObjectId,
      ref: "Employer",
      default: null,
    },

    // Pre-signed or public S3 URL to the generated PDF
    pdf_s3_url: {
      type: String,
      trim: true,
      match: [/^https?:\/\/.+/, "pdf_s3_url must be a valid HTTP(S) URL."],
    },

    // Statutory references cited in the letter body
    // e.g. ["Minimum Wages Act 1948 §12", "Factories Act 1948 §59"]
    law_sections: {
      type: [String],
      default: [],
      validate: {
        validator: (arr) =>
          arr.every((s) => typeof s === "string" && s.length <= 200),
        message: "Each law_section entry must be a string ≤ 200 characters.",
      },
    },

    // Total underpayment in ₹ (may span multiple shifts in future iterations)
    total_shortfall: {
      type: Number,
      required: [true, "total_shortfall is required."],
      min: [0, "total_shortfall cannot be negative."],
    },

    // Timestamp when the PDF was successfully generated and stored in S3
    generated_at: {
      type: Date,
      default: Date.now,
      immutable: true,
    },

    // Timestamp when the letter was delivered to the worker / employer
    delivered_at: {
      type: Date,
      default: null,
    },

    status: {
      type: String,
      enum: {
        values: STATUS_ENUM,
        message: `Status must be one of: ${STATUS_ENUM.join(", ")}.`,
      },
      default: "generated",
    },
  },
  {
    versionKey: false,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// ─── Indexes ──────────────────────────────────────────────────────────────────

// Employer dashboard dispute feed: all open letters for an employer
DisputeLetterSchema.index({ employer_id: 1, status: 1 });

// Worker dispute history
DisputeLetterSchema.index({ worker_id: 1, generated_at: -1 });

// One-to-one: each shift should produce at most one dispute letter
// (unique: true enforces this at DB level)
DisputeLetterSchema.index({ shift_id: 1 }, { unique: true });

// ─── Virtual — whether the letter is still unacknowledged ────────────────────
DisputeLetterSchema.virtual("is_pending").get(function () {
  return this.status !== "acknowledged";
});

export default model("DisputeLetter", DisputeLetterSchema);
