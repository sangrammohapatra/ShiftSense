/**
 * routes/dashboard.js — ShiftSense employer dashboard stats API
 *
 * Mounted at: /api/v1/dashboard
 * All routes protected via verifyToken.
 *
 * GET /stats — aggregate metrics for the authenticated employer's workforce:
 *   - total_workers        Current active linked worker count
 *   - shifts_this_month    ShiftLogs created in the current calendar month
 *   - shortfall_this_month Sum of shortfall (₹) across all workers this month
 *   - open_disputes        ShiftLogs with status "disputed" (unresolved)
 *   - monthly_chart        Last 6 months: shift count + dispute count per month
 *   - recent_disputes      Last 5 disputed shifts with worker details
 */

import { Router }   from "express";
import mongoose     from "mongoose";

import { verifyToken }              from "../middleware/auth.js";
import { EmployerWorker, ShiftLog } from "../models/index.js";

const router = Router();
router.use(verifyToken);

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns a Date set to midnight UTC on the 1st of the current month */
const startOfCurrentMonth = () => {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
};

/** Returns start Date of a month N months ago (0 = current month) */
const startOfMonthOffset = (monthsAgo) => {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - monthsAgo, 1));
};

// ─── GET /stats ───────────────────────────────────────────────────────────────
router.get("/stats", async (req, res) => {
  const employerId = new mongoose.Types.ObjectId(req.employer.id);
  const monthStart = startOfCurrentMonth();

  try {
    // ── 1. Fetch active worker IDs for this employer ──────────────────────────
    const links = await EmployerWorker.find({
      employer_id: employerId,
      is_active:   true,
    }).select("worker_id").lean();

    const workerIds    = links.map((l) => l.worker_id);
    const totalWorkers = workerIds.length;

    // Early return if no workers — avoids empty $in queries
    if (totalWorkers === 0) {
      return res.status(200).json({
        success: true,
        data: {
          total_workers:        0,
          shifts_this_month:    0,
          shortfall_this_month: 0,
          open_disputes:        0,
          monthly_chart:        [],
          recent_disputes:      [],
        },
      });
    }

    // ── 2. This month's shift aggregation ─────────────────────────────────────
    const [monthStats] = await ShiftLog.aggregate([
      {
        $match: {
          worker_id:  { $in: workerIds },
          shift_date: { $gte: monthStart },
        },
      },
      {
        $group: {
          _id:                  null,
          shifts_this_month:    { $sum: 1 },
          shortfall_this_month: { $sum: { $max: ["$shortfall", 0] } },
        },
      },
    ]);

    // ── 3. Open disputes count ────────────────────────────────────────────────
    const openDisputes = await ShiftLog.countDocuments({
      worker_id: { $in: workerIds },
      status:    "disputed",
    });

    // ── 4. Monthly chart — last 6 months ──────────────────────────────────────
    // Build array of 6 month boundaries (newest first)
    const sixMonthsAgo = startOfMonthOffset(5); // start of 5 months ago

    const chartAgg = await ShiftLog.aggregate([
      {
        $match: {
          worker_id:  { $in: workerIds },
          shift_date: { $gte: sixMonthsAgo },
        },
      },
      {
        $group: {
          _id: {
            year:  { $year:  "$shift_date" },
            month: { $month: "$shift_date" },
          },
          shifts:   { $sum: 1 },
          disputes: {
            $sum: { $cond: [{ $eq: ["$status", "disputed"] }, 1, 0] },
          },
        },
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } },
    ]);

    // Normalise into a full 6-entry array (fill missing months with 0)
    const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun",
                         "Jul","Aug","Sep","Oct","Nov","Dec"];
    const chartMap = Object.fromEntries(
      chartAgg.map((e) => [`${e._id.year}-${e._id.month}`, e])
    );
    const monthlyChart = Array.from({ length: 6 }, (_, i) => {
      const d     = startOfMonthOffset(5 - i);
      const key   = `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}`;
      const entry = chartMap[key] ?? { shifts: 0, disputes: 0 };
      return {
        month:    MONTH_NAMES[d.getUTCMonth()],
        year:     d.getUTCFullYear(),
        shifts:   entry.shifts,
        disputes: entry.disputes,
      };
    });

    // ── 5. Recent disputes — last 5 with worker detail ────────────────────────
    const recentDisputes = await ShiftLog.find({
      worker_id: { $in: workerIds },
      status:    "disputed",
    })
      .sort({ shift_date: -1 })
      .limit(5)
      .populate("worker_id", "name phone_number occupation state")
      .lean();

    const formattedDisputes = recentDisputes.map((s) => ({
      shift_id:     s._id,
      shift_date:   s.shift_date,
      shortfall:    s.shortfall,
      status:       s.status,
      worker: {
        id:          s.worker_id?._id,
        name:        s.worker_id?.name ?? "Unknown",
        phone:       s.worker_id?.phone_number ?? "—",
        occupation:  s.worker_id?.occupation ?? "—",
        state:       s.worker_id?.state ?? "—",
      },
    }));

    // ── 6. Respond ────────────────────────────────────────────────────────────
    return res.status(200).json({
      success: true,
      data: {
        total_workers:        totalWorkers,
        shifts_this_month:    monthStats?.shifts_this_month    ?? 0,
        shortfall_this_month: monthStats?.shortfall_this_month ?? 0,
        open_disputes:        openDisputes,
        monthly_chart:        monthlyChart,
        recent_disputes:      formattedDisputes,
      },
    });
  } catch (err) {
    console.error("[GET /dashboard/stats]", err.message);
    return res.status(500).json({
      success: false,
      message: "Failed to load dashboard stats.",
      errors:  [],
    });
  }
});

export default router;
