/**
 * models/EmployerWorker.js — ShiftSense EmployerWorker junction model
 *
 * A many-to-many join between Employer and Worker — though in practice
 * a worker is typically linked to one employer at a time (is_active = true).
 *
 * The unique compound index on (employer_id, worker_id) prevents the same
 * worker being linked to the same employer twice. To re-link after removal,
 * set is_active = true on the existing document rather than creating a new one.
 *
 * When a worker is linked:
 *   1. Create or reactivate an EmployerWorker document
 *   2. Set Worker.employer_id to this employer
 *   3. Increment Employer.worker_count
 *
 * When a worker is unlinked (is_active → false):
 *   1. Null out Worker.employer_id
 *   2. Decrement Employer.worker_count
 */

import mongoose from "mongoose";

const { Schema, model } = mongoose;

// ─── Schema ───────────────────────────────────────────────────────────────────
const EmployerWorkerSchema = new Schema(
  {
    employer_id: {
      type: Schema.Types.ObjectId,
      ref: "Employer",
      required: [true, "employer_id is required."],
    },

    worker_id: {
      type: Schema.Types.ObjectId,
      ref: "Worker",
      required: [true, "worker_id is required."],
    },

    // Timestamp of the most recent link action (reset on reactivation)
    linked_at: {
      type: Date,
      default: Date.now,
    },

    // Soft-delete flag — set to false when employer removes a worker
    is_active: {
      type: Boolean,
      default: true,
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
 * Primary unique constraint — prevents duplicate links.
 * Also serves as the lookup index for "is worker X linked to employer Y?".
 */
EmployerWorkerSchema.index(
  { employer_id: 1, worker_id: 1 },
  { unique: true, name: "idx_employer_worker_unique" },
);

// Dashboard query: all active workers for a given employer
EmployerWorkerSchema.index({ employer_id: 1, is_active: 1 });

// Reverse lookup: which employers has a worker been linked to?
EmployerWorkerSchema.index({ worker_id: 1 });

// ─── Static method — safe upsert helper ───────────────────────────────────────
/**
 * Links a worker to an employer, or reactivates an existing (inactive) link.
 * Returns the upserted document and a boolean indicating whether it was new.
 *
 * @param {ObjectId|string} employer_id
 * @param {ObjectId|string} worker_id
 * @returns {Promise<{ doc: EmployerWorker, isNew: boolean }>}
 */
EmployerWorkerSchema.statics.linkWorker = async function (
  employer_id,
  worker_id,
) {
  const existing = await this.findOne({ employer_id, worker_id });

  if (existing) {
    if (existing.is_active) {
      // Already linked — idempotent, return as-is
      return { doc: existing, isNew: false };
    }
    // Reactivate a previously removed link
    existing.is_active = true;
    existing.linked_at = new Date();
    await existing.save();
    return { doc: existing, isNew: false };
  }

  // Brand-new link
  const doc = await this.create({ employer_id, worker_id });
  return { doc, isNew: true };
};

export default model("EmployerWorker", EmployerWorkerSchema);
