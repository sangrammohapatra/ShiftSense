/**
 * routes/workers.js — ShiftSense worker management API
 *
 * Mounted at: /api/v1/workers
 * All routes are employer-protected via verifyToken middleware.
 *
 * GET    /              list linked workers (filterable)
 * POST   /link          link an existing WhatsApp-registered worker
 * DELETE /unlink/:id    soft-unlink a worker
 * GET    /:workerId     single worker profile + recent shifts + monthly shortfall
 * PATCH  /:workerId     update limited worker fields on behalf of employer
 */

import { Router }            from "express";
import { body, query, param, validationResult } from "express-validator";
import mongoose              from "mongoose";

import { verifyToken }       from "../middleware/auth.js";
import {
  Worker,
  Employer,
  EmployerWorker,
  ShiftLog,
}                            from "../models/index.js";
import { OCCUPATION_ENUM }   from "../models/Worker.js";

const router = Router();

// All routes in this file require a valid employer JWT
router.use(verifyToken);

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Send the standard validation-error response (422) */
const sendValidationErrors = (res, result) =>
  res.status(422).json({
    success: false,
    message: "Validation failed. Please check the fields below.",
    errors: result.array().map((e) => ({ field: e.path, message: e.msg })),
  });

/** Return true if a string is a valid Mongoose ObjectId */
const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

/** Midnight UTC on the first day of the current month */
const startOfCurrentMonth = () => {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
};

// ─── GET / — list linked workers ──────────────────────────────────────────────
/**
 * Returns all workers currently linked (is_active = true) to the authenticated
 * employer, with optional filtering and free-text name search.
 *
 * Query params:
 *   state        {string}  — 2-letter code, e.g. "MH"
 *   occupation   {string}  — one of OCCUPATION_ENUM
 *   search       {string}  — partial case-insensitive match on worker name
 */
const listWorkersRules = [
  query("state")
    .optional()
    .isLength({ min: 2, max: 2 }).withMessage("state must be a 2-letter code.")
    .isAlpha().withMessage("state must contain only letters.")
    .toUpperCase(),

  query("occupation")
    .optional()
    .isIn(OCCUPATION_ENUM).withMessage(`occupation must be one of: ${OCCUPATION_ENUM.join(", ")}.`),

  query("search")
    .optional()
    .trim()
    .isLength({ max: 100 }).withMessage("search must not exceed 100 characters."),
];

router.get("/", listWorkersRules, async (req, res) => {
  const result = validationResult(req);
  if (!result.isEmpty()) return sendValidationErrors(res, result);

  const { state, occupation, search } = req.query;

  try {
    // Step 1: fetch all active EmployerWorker links for this employer
    const links = await EmployerWorker.find({
      employer_id: req.employer.id,
      is_active:   true,
    }).select("worker_id linked_at").lean();

    if (links.length === 0) {
      return res.status(200).json({ success: true, data: { workers: [] } });
    }

    const workerIds = links.map((l) => l.worker_id);

    // Step 2: build the Worker filter — only for linked worker IDs
    const workerFilter = { _id: { $in: workerIds } };
    if (state)      workerFilter.state      = state;
    if (occupation) workerFilter.occupation = occupation;
    if (search)     workerFilter.name       = { $regex: search, $options: "i" };

    // Step 3: fetch matching workers
    const workers = await Worker.find(workerFilter)
      .select("-__v")
      .lean();

    // Step 4: attach linked_at from EmployerWorker to each worker record
    const linkMap = Object.fromEntries(
      links.map((l) => [l.worker_id.toString(), l.linked_at])
    );
    const enriched = workers.map((w) => ({
      ...w,
      linked_at: linkMap[w._id.toString()] ?? null,
    }));

    return res.status(200).json({
      success: true,
      data: {
        count:   enriched.length,
        workers: enriched,
      },
    });
  } catch (err) {
    console.error("[GET /workers]", err.message);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch worker list.",
      errors: [],
    });
  }
});

// ─── POST /link — link a worker by phone number ───────────────────────────────
/**
 * The employer provides the worker's WhatsApp phone number.
 * The worker must have already self-registered via WhatsApp (Worker doc exists).
 * Prevents duplicate active links.
 * Side-effects on success:
 *   - Creates / reactivates EmployerWorker document
 *   - Sets Worker.employer_id to this employer (latest link wins)
 *   - Increments Employer.worker_count by 1
 */
const linkWorkerRules = [
  body("phone_number")
    .trim()
    .notEmpty().withMessage("phone_number is required.")
    .matches(/^\+?[1-9]\d{7,14}$/).withMessage("Provide a valid E.164 phone number."),
];

router.post("/link", linkWorkerRules, async (req, res) => {
  const result = validationResult(req);
  if (!result.isEmpty()) return sendValidationErrors(res, result);

  const { phone_number } = req.body;
  const employerId = req.employer.id;

  try {
    // 1. Find the worker by phone number
    const worker = await Worker.findOne({ phone_number });
    if (!worker) {
      return res.status(404).json({
        success: false,
        message: "Worker not registered on WhatsApp yet.",
        errors: [],
      });
    }

    // 2. Check for an existing active link between THIS employer and this worker
    const existingLink = await EmployerWorker.findOne({
      employer_id: employerId,
      worker_id:   worker._id,
      is_active:   true,
    });

    if (existingLink) {
      return res.status(409).json({
        success: false,
        message: "This worker is already linked to your account.",
        errors: [],
      });
    }

    // 3. Use the static linkWorker helper (handles create vs. reactivate)
    const { isNew } = await EmployerWorker.linkWorker(employerId, worker._id);

    // 4. Update the worker's back-reference (latest employer wins)
    await Worker.findByIdAndUpdate(worker._id, { employer_id: employerId });

    // 5. Increment worker_count only when creating a brand-new link
    if (isNew) {
      await Employer.findByIdAndUpdate(employerId, { $inc: { worker_count: 1 } });
    }

    // 6. Return the fresh worker document
    const updatedWorker = await Worker.findById(worker._id).lean();

    return res.status(201).json({
      success: true,
      data: { worker: updatedWorker },
    });
  } catch (err) {
    console.error("[POST /workers/link]", err.message);
    return res.status(500).json({
      success: false,
      message: "Failed to link worker.",
      errors: [],
    });
  }
});

// ─── DELETE /unlink/:workerId — soft-unlink a worker ─────────────────────────
/**
 * Sets EmployerWorker.is_active = false (soft delete — preserves audit trail).
 * Nulls out Worker.employer_id and decrements Employer.worker_count.
 */
router.delete("/unlink/:workerId", async (req, res) => {
  const { workerId } = req.params;
  const employerId   = req.employer.id;

  if (!isValidObjectId(workerId)) {
    return res.status(400).json({
      success: false,
      message: "Invalid workerId format.",
      errors: [],
    });
  }

  try {
    // Find the active link
    const link = await EmployerWorker.findOne({
      employer_id: employerId,
      worker_id:   workerId,
      is_active:   true,
    });

    if (!link) {
      return res.status(404).json({
        success: false,
        message: "No active link found for this worker.",
        errors: [],
      });
    }

    // Soft-delete: flip flag, do not delete the document
    link.is_active = false;
    await link.save();

    // Clear back-reference on the Worker document
    await Worker.findByIdAndUpdate(workerId, { employer_id: null });

    // Decrement employer's worker count (floor at 0 — defensive)
    await Employer.findByIdAndUpdate(employerId, {
      $inc: { worker_count: -1 },
    });

    return res.status(200).json({
      success: true,
      data: { message: "Worker unlinked successfully." },
    });
  } catch (err) {
    console.error("[DELETE /workers/unlink/:workerId]", err.message);
    return res.status(500).json({
      success: false,
      message: "Failed to unlink worker.",
      errors: [],
    });
  }
});

// ─── GET /:workerId — single worker profile + shifts ─────────────────────────
/**
 * Returns:
 *   worker       — full Worker document
 *   shifts       — last 30 ShiftLog entries (newest first)
 *   monthly_shortfall — sum of shortfall values for the current calendar month
 *
 * Only returns data for workers actively linked to the requesting employer.
 */
router.get("/:workerId", async (req, res) => {
  const { workerId } = req.params;
  const employerId   = req.employer.id;

  if (!isValidObjectId(workerId)) {
    return res.status(400).json({
      success: false,
      message: "Invalid workerId format.",
      errors: [],
    });
  }

  try {
    // 1. Verify the employer has an active link to this worker
    const link = await EmployerWorker.findOne({
      employer_id: employerId,
      worker_id:   workerId,
      is_active:   true,
    }).lean();

    if (!link) {
      return res.status(404).json({
        success: false,
        message: "Worker not found or not linked to your account.",
        errors: [],
      });
    }

    // 2. Fetch worker profile
    const worker = await Worker.findById(workerId).lean();
    if (!worker) {
      return res.status(404).json({
        success: false,
        message: "Worker record not found.",
        errors: [],
      });
    }

    // 3. Fetch last 30 shift logs (newest first)
    const shifts = await ShiftLog.find({ worker_id: workerId })
      .sort({ shift_date: -1 })
      .limit(30)
      .lean();

    // 4. Aggregate total shortfall for the current month
    const monthStart = startOfCurrentMonth();
    const [shortfallResult] = await ShiftLog.aggregate([
      {
        $match: {
          worker_id:  new mongoose.Types.ObjectId(workerId),
          shift_date: { $gte: monthStart },
          shortfall:  { $gt: 0 }, // only sum positive shortfalls (underpayments)
        },
      },
      {
        $group: {
          _id:               null,
          total_shortfall:   { $sum: "$shortfall" },
          disputed_shifts:   { $sum: { $cond: [{ $eq: ["$status", "disputed"] }, 1, 0] } },
        },
      },
    ]);

    return res.status(200).json({
      success: true,
      data: {
        worker,
        shifts,
        linked_at:         link.linked_at,
        monthly_shortfall: shortfallResult?.total_shortfall  ?? 0,
        disputed_shifts:   shortfallResult?.disputed_shifts  ?? 0,
      },
    });
  } catch (err) {
    console.error("[GET /workers/:workerId]", err.message);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch worker details.",
      errors: [],
    });
  }
});

// ─── PATCH /:workerId — employer updates limited worker fields ────────────────
/**
 * Employers may update fields that help with compliance tracking.
 * Sensitive identity fields (phone_number, aadhaar_last4, is_verified)
 * are not modifiable here — the worker controls those via WhatsApp.
 *
 * Allowed fields:
 *   name, state, occupation, claimed_daily_wage
 */
const updateWorkerRules = [
  param("workerId")
    .custom(isValidObjectId).withMessage("Invalid workerId format."),

  body("name")
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 }).withMessage("name must be 1–100 characters."),

  body("state")
    .optional()
    .trim()
    .isLength({ min: 2, max: 2 }).withMessage("state must be a 2-letter code.")
    .isAlpha().withMessage("state must contain only letters.")
    .toUpperCase(),

  body("occupation")
    .optional()
    .isIn(OCCUPATION_ENUM)
    .withMessage(`occupation must be one of: ${OCCUPATION_ENUM.join(", ")}.`),

  body("claimed_daily_wage")
    .optional()
    .isFloat({ min: 0 }).withMessage("claimed_daily_wage must be a non-negative number.")
    .toFloat(),

  // Block fields that employers must not change
  body("phone_number")
    .not().exists().withMessage("phone_number cannot be changed by an employer."),

  body("aadhaar_last4")
    .not().exists().withMessage("aadhaar_last4 cannot be changed by an employer."),

  body("is_verified")
    .not().exists().withMessage("is_verified cannot be set manually."),
];

router.patch("/:workerId", updateWorkerRules, async (req, res) => {
  const result = validationResult(req);
  if (!result.isEmpty()) return sendValidationErrors(res, result);

  const { workerId } = req.params;
  const employerId   = req.employer.id;

  try {
    // 1. Verify active link — employer can only edit their own workers
    const link = await EmployerWorker.findOne({
      employer_id: employerId,
      worker_id:   workerId,
      is_active:   true,
    }).lean();

    if (!link) {
      return res.status(404).json({
        success: false,
        message: "Worker not found or not linked to your account.",
        errors: [],
      });
    }

    // 2. Build update payload from allowed fields only
    const ALLOWED = ["name", "state", "occupation", "claimed_daily_wage"];
    const updates = {};
    for (const field of ALLOWED) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        message: "No updatable fields were provided.",
        errors: [],
      });
    }

    // 3. Apply update — Mongoose pre-save hook won't fire on findByIdAndUpdate,
    //    but updated_at is not in ALLOWED so we stamp it explicitly.
    updates.updated_at = new Date();

    const updatedWorker = await Worker.findByIdAndUpdate(
      workerId,
      { $set: updates },
      { new: true, runValidators: true }
    ).lean();

    return res.status(200).json({
      success: true,
      data: { worker: updatedWorker },
    });
  } catch (err) {
    console.error("[PATCH /workers/:workerId]", err.message);
    return res.status(500).json({
      success: false,
      message: "Failed to update worker.",
      errors: [],
    });
  }
});

// ─── GET /shifts/:workerId — paginated shift history ─────────────────────────
/**
 * Returns shift logs for a linked worker.
 *
 * Default: last 90 days, sorted shift_date DESC
 * With ?month=YYYY-MM: returns only that calendar month
 *
 * Query params:
 *   month  {string}  — "YYYY-MM" format, e.g. "2025-06"
 */
router.get("/shifts/:workerId", async (req, res) => {
  const { workerId } = req.params;
  const employerId   = req.employer.id;

  if (!isValidObjectId(workerId)) {
    return res.status(400).json({
      success: false,
      message: "Invalid workerId format.",
      errors:  [],
    });
  }

  // Validate optional ?month param
  const { month } = req.query;
  if (month && !/^\d{4}-\d{2}$/.test(month)) {
    return res.status(400).json({
      success: false,
      message: "month must be in YYYY-MM format (e.g. 2025-06).",
      errors:  [],
    });
  }

  try {
    // Verify employer has an active link to this worker
    const link = await EmployerWorker.findOne({
      employer_id: employerId,
      worker_id:   workerId,
      is_active:   true,
    }).lean();

    if (!link) {
      return res.status(404).json({
        success: false,
        message: "Worker not found or not linked to your account.",
        errors:  [],
      });
    }

    // Build date filter
    let dateFilter;
    if (month) {
      const [year, mon] = month.split("-").map(Number);
      const start = new Date(Date.UTC(year, mon - 1, 1));
      const end   = new Date(Date.UTC(year, mon, 1));   // first day of next month
      dateFilter = { $gte: start, $lt: end };
    } else {
      // Default: last 90 days
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
      dateFilter = { $gte: ninetyDaysAgo };
    }

    const shifts = await ShiftLog.find({
      worker_id:  workerId,
      shift_date: dateFilter,
    })
      .sort({ shift_date: -1 })
      .lean();

    // Monthly aggregate for summary strip
    const now        = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

    const [summary] = await ShiftLog.aggregate([
      {
        $match: {
          worker_id:  new mongoose.Types.ObjectId(workerId),
          shift_date: { $gte: monthStart },
        },
      },
      {
        $group: {
          _id:               null,
          monthly_shifts:    { $sum: 1 },
          monthly_shortfall: { $sum: { $max: ["$shortfall", 0] } },
          monthly_gross:     { $sum: "$gross_owed" },
        },
      },
    ]);

    return res.status(200).json({
      success: true,
      data: {
        shifts,
        total:             shifts.length,
        monthly_shifts:    summary?.monthly_shifts    ?? 0,
        monthly_shortfall: summary?.monthly_shortfall ?? 0,
        monthly_gross:     summary?.monthly_gross     ?? 0,
      },
    });
  } catch (err) {
    console.error("[GET /workers/shifts/:workerId]", err.message);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch shift history.",
      errors:  [],
    });
  }
});

export default router;
