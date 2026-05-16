/**
 * pages/WorkerDetail.jsx — Individual worker detail view
 *
 * Three-section layout:
 *   1. Profile card — name, phone, state, occupation, claimed_daily_wage (inline editable)
 *   2. Shift history table — date, hours, OT, gross, claimed, shortfall, status
 *   3. Month summary strip — total shortfall this month in red
 */

import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import toast from "react-hot-toast";
import {
  ArrowLeft,
  Pencil,
  X,
  CheckCircle2,
  Loader2,
  Phone,
  MapPin,
  Briefcase,
  CalendarDays,
  TrendingDown,
  AlertTriangle,
  Clock,
} from "lucide-react";

import api from "@/api/axios";
import Layout from "@/components/Layout";
import FormField from "@/components/ui/FormField";
import { INDIAN_STATES } from "@/constants/india";
import { OCCUPATION_ENUM } from "@/constants/occupations";

// ─── API ──────────────────────────────────────────────────────────────────────
const fetchWorkerDetail = async (workerId) => {
  const res = await api.get(`/workers/${workerId}`);
  return res.data.data;
};

const fetchShifts = async (workerId, month) => {
  const params = month ? { month } : {};
  const res = await api.get(`/workers/shifts/${workerId}`, { params });
  return res.data.data;
};

const patchWorker = async ({ workerId, updates }) => {
  const res = await api.patch(`/workers/${workerId}`, updates);
  return res.data.data;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmtDate = (d) =>
  new Date(d).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

const fmtCurrency = (n) =>
  `₹${Number(n ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

const STATUS_STYLES = {
  logged: { bg: "rgba(88,166,255,0.1)", color: "#58a6ff", label: "Logged" },
  disputed: { bg: "rgba(248,81,73,0.1)", color: "#f85149", label: "Disputed" },
  resolved: { bg: "rgba(63,185,80,0.1)", color: "#3fb950", label: "Resolved" },
};

const StatusBadge = ({ status }) => {
  const s = STATUS_STYLES[status] ?? STATUS_STYLES.logged;
  return (
    <span
      className="text-xs font-bold px-2 py-0.5 uppercase tracking-wider"
      style={{
        background: s.bg,
        color: s.color,
        borderRadius: "var(--radius-sm)",
        fontFamily: "var(--font-display)",
      }}
    >
      {s.label}
    </span>
  );
};

const Skeleton = ({ w = "w-full", h = "h-4" }) => (
  <div
    className={`${w} ${h} rounded animate-pulse`}
    style={{ background: "var(--bg-elevated)" }}
  />
);

// ─── Profile stat pill ────────────────────────────────────────────────────────
const InfoPill = ({ icon: Icon, label, value }) => (
  <div
    className="flex items-center gap-2 px-3 py-2"
    style={{
      background: "var(--bg-elevated)",
      borderRadius: "var(--radius)",
      minWidth: 0,
    }}
  >
    <Icon size={12} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
    <div className="min-w-0">
      <p
        className="text-xs uppercase tracking-widest"
        style={{
          color: "var(--text-muted)",
          fontFamily: "var(--font-display)",
        }}
      >
        {label}
      </p>
      <p
        className="text-sm font-medium truncate"
        style={{
          color: "var(--text-primary)",
          fontFamily: "var(--font-display)",
        }}
      >
        {value || "—"}
      </p>
    </div>
  </div>
);

// ─── Inline edit form ─────────────────────────────────────────────────────────
const EditProfileForm = ({ worker, workerId, onSaved, onCancel }) => {
  const queryClient = useQueryClient();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting, isDirty },
  } = useForm({
    defaultValues: {
      name: worker.name ?? "",
      state: worker.state ?? "",
      occupation: worker.occupation ?? "",
      claimed_daily_wage: worker.claimed_daily_wage ?? "",
    },
  });

  const mutation = useMutation({
    mutationFn: (updates) => patchWorker({ workerId, updates }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["worker-detail", workerId] });
      toast.success("Worker profile updated.");
      onSaved();
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <form
      onSubmit={handleSubmit(mutation.mutate)}
      noValidate
      className="space-y-4"
    >
      <div className="grid grid-cols-2 gap-3">
        <FormField
          label="Name"
          id="ew_name"
          error={errors.name?.message}
          reg={register("name", {
            required: "Name is required.",
            maxLength: { value: 100, message: "Max 100 chars." },
          })}
        />

        {/* State */}
        <div>
          <label htmlFor="ew_state" className="ss-label">
            State
          </label>
          <select
            id="ew_state"
            className={`ss-input ${errors.state ? "error" : ""}`}
            style={{ cursor: "pointer" }}
            {...register("state")}
          >
            <option value="">Select state</option>
            {INDIAN_STATES.map((s) => (
              <option key={s.code} value={s.code}>
                {s.code} — {s.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* Occupation */}
        <div>
          <label htmlFor="ew_occ" className="ss-label">
            Occupation
          </label>
          <select
            id="ew_occ"
            className="ss-input"
            style={{ cursor: "pointer" }}
            {...register("occupation")}
          >
            <option value="">Select occupation</option>
            {OCCUPATION_ENUM.map((o) => (
              <option key={o} value={o} className="capitalize">
                {o}
              </option>
            ))}
          </select>
        </div>

        <FormField
          label="Claimed daily wage (₹)"
          id="ew_wage"
          type="number"
          placeholder="e.g. 500"
          error={errors.claimed_daily_wage?.message}
          reg={register("claimed_daily_wage", {
            min: { value: 0, message: "Must be ≥ 0." },
            valueAsNumber: true,
          })}
        />
      </div>

      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={!isDirty || isSubmitting || mutation.isPending}
          className="ss-btn flex-1"
        >
          {isSubmitting || mutation.isPending ? (
            <>
              <Loader2 size={14} className="animate-spin" /> Saving…
            </>
          ) : (
            <>
              <CheckCircle2 size={14} /> Save Changes
            </>
          )}
        </button>
        <button type="button" onClick={onCancel} className="ss-btn-ghost">
          <X size={14} /> Cancel
        </button>
      </div>
    </form>
  );
};

// ─── Page ─────────────────────────────────────────────────────────────────────
const WorkerDetail = () => {
  const { id: workerId } = useParams();
  const navigate = useNavigate();
  const [editMode, setEditMode] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(""); // "YYYY-MM" or ""

  // Worker profile query
  const { data: detailData, isLoading: detailLoading } = useQuery({
    queryKey: ["worker-detail", workerId],
    queryFn: () => fetchWorkerDetail(workerId),
    enabled: !!workerId,
  });

  // Shifts query
  const { data: shiftData, isLoading: shiftsLoading } = useQuery({
    queryKey: ["worker-shifts", workerId, selectedMonth],
    queryFn: () => fetchShifts(workerId, selectedMonth),
    enabled: !!workerId,
  });

  const worker = detailData?.worker;
  const shifts = shiftData?.shifts ?? [];

  // Generate last 6 month options for filter
  const monthOptions = Array.from({ length: 6 }, (_, i) => {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("en-IN", {
      month: "long",
      year: "numeric",
    });
    return { val, label };
  });

  const monthlyShortfall = shiftData?.monthly_shortfall ?? 0;

  return (
    <Layout>
      <div className="p-6 max-w-5xl mx-auto space-y-5">
        {/* ── Back + header ─────────────────────────────────────────────────── */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/workers")}
            className="p-2 rounded transition-colors"
            style={{
              background: "var(--bg-elevated)",
              border: "none",
              cursor: "pointer",
              color: "var(--text-secondary)",
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.color = "var(--text-primary)")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.color = "var(--text-secondary)")
            }
          >
            <ArrowLeft size={16} />
          </button>
          <div>
            {detailLoading ? (
              <Skeleton w="w-40" h="h-6" />
            ) : (
              <h1
                className="text-xl font-bold"
                style={{
                  fontFamily: "var(--font-display)",
                  color: "var(--text-primary)",
                }}
              >
                {worker?.name ?? "Worker"}
              </h1>
            )}
            <p
              className="text-xs mt-0.5"
              style={{ color: "var(--text-secondary)" }}
            >
              Worker detail · ID: {workerId?.slice(-8).toUpperCase()}
            </p>
          </div>
        </div>

        {/* ── Monthly shortfall alert ───────────────────────────────────────── */}
        {!detailLoading && monthlyShortfall > 0 && (
          <div
            className="flex items-center gap-3 px-4 py-3"
            style={{
              background: "rgba(248,81,73,0.08)",
              border: "1px solid rgba(248,81,73,0.25)",
              borderRadius: "var(--radius)",
            }}
          >
            <AlertTriangle
              size={15}
              style={{ color: "#f85149", flexShrink: 0 }}
            />
            <p
              className="text-sm"
              style={{ color: "#f85149", fontFamily: "var(--font-display)" }}
            >
              <strong>
                Shortfall this month: {fmtCurrency(monthlyShortfall)}
              </strong>{" "}
              — Wages below statutory minimum detected.
            </p>
          </div>
        )}

        {/* ── Profile card ─────────────────────────────────────────────────── */}
        <div className="ss-card p-5">
          <div className="flex items-center justify-between mb-4">
            <p
              className="text-xs uppercase tracking-widest"
              style={{
                color: "var(--text-muted)",
                fontFamily: "var(--font-display)",
              }}
            >
              Worker Profile
            </p>
            {!editMode && (
              <button
                onClick={() => setEditMode(true)}
                className="ss-btn-ghost flex items-center gap-1.5 text-xs"
              >
                <Pencil size={12} /> Edit
              </button>
            )}
          </div>

          {detailLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} h="h-14" />
              ))}
            </div>
          ) : editMode ? (
            <EditProfileForm
              worker={worker}
              workerId={workerId}
              onSaved={() => setEditMode(false)}
              onCancel={() => setEditMode(false)}
            />
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <InfoPill
                icon={Phone}
                label="Phone"
                value={worker?.phone_number}
              />
              <InfoPill icon={MapPin} label="State" value={worker?.state} />
              <InfoPill
                icon={Briefcase}
                label="Occupation"
                value={worker?.occupation}
              />
              <InfoPill
                icon={TrendingDown}
                label="Claimed/Day"
                value={
                  worker?.claimed_daily_wage
                    ? `₹${worker.claimed_daily_wage}`
                    : "Not set"
                }
              />
            </div>
          )}
        </div>

        {/* ── Month selector + stats strip ──────────────────────────────────── */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <div
              className="flex items-center gap-2 text-sm"
              style={{ color: "var(--text-secondary)" }}
            >
              <CalendarDays size={14} />
              <span style={{ fontFamily: "var(--font-display)" }}>
                {selectedMonth
                  ? `${shiftData?.total ?? 0} shifts in selected month`
                  : `${shiftData?.total ?? 0} shifts (last 90 days)`}
              </span>
            </div>
            {shiftData?.monthly_gross > 0 && (
              <span
                className="text-xs px-2 py-1"
                style={{
                  background: "rgba(240,165,0,0.1)",
                  color: "var(--accent)",
                  borderRadius: "var(--radius-sm)",
                  fontFamily: "var(--font-display)",
                }}
              >
                Gross this month: {fmtCurrency(shiftData.monthly_gross)}
              </span>
            )}
          </div>

          {/* Month picker */}
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="ss-input text-xs w-44"
            style={{ cursor: "pointer" }}
          >
            <option value="">Last 90 days</option>
            {monthOptions.map((m) => (
              <option key={m.val} value={m.val}>
                {m.label}
              </option>
            ))}
          </select>
        </div>

        {/* ── Shifts table ─────────────────────────────────────────────────── */}
        <div className="ss-card overflow-hidden">
          <div
            className="px-5 py-3"
            style={{ borderBottom: "1px solid var(--border)" }}
          >
            <p
              className="text-xs uppercase tracking-widest font-medium"
              style={{
                color: "var(--text-secondary)",
                fontFamily: "var(--font-display)",
              }}
            >
              Shift History
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  {[
                    "Date",
                    "Hours",
                    "OT hrs",
                    "Gross Owed",
                    "Claimed",
                    "Shortfall",
                    "Status",
                  ].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-2.5 text-left text-xs uppercase tracking-widest whitespace-nowrap"
                      style={{
                        color: "var(--text-muted)",
                        fontFamily: "var(--font-display)",
                        fontWeight: 500,
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shiftsLoading ? (
                  [...Array(5)].map((_, i) => (
                    <tr
                      key={i}
                      style={{ borderBottom: "1px solid var(--border)" }}
                    >
                      {[...Array(7)].map((_, j) => (
                        <td key={j} className="px-4 py-3">
                          <Skeleton w="w-16" h="h-3" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : shifts.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-4 py-10 text-center text-sm"
                      style={{ color: "var(--text-muted)" }}
                    >
                      No shifts found for the selected period.
                    </td>
                  </tr>
                ) : (
                  shifts.map((s, i) => (
                    <tr
                      key={s._id}
                      style={{
                        borderBottom:
                          i < shifts.length - 1
                            ? "1px solid var(--border)"
                            : "none",
                      }}
                    >
                      <td
                        className="px-4 py-3 text-xs whitespace-nowrap"
                        style={{
                          color: "var(--text-secondary)",
                          fontFamily: "var(--font-display)",
                        }}
                      >
                        {fmtDate(s.shift_date)}
                      </td>
                      <td
                        className="px-4 py-3 text-xs"
                        style={{
                          color: "var(--text-primary)",
                          fontFamily: "var(--font-display)",
                        }}
                      >
                        <span className="flex items-center gap-1">
                          <Clock
                            size={10}
                            style={{ color: "var(--text-muted)" }}
                          />
                          {s.hours_worked}h
                        </span>
                      </td>
                      <td
                        className="px-4 py-3 text-xs"
                        style={{
                          color:
                            s.ot_hours > 0
                              ? "var(--accent)"
                              : "var(--text-muted)",
                          fontFamily: "var(--font-display)",
                        }}
                      >
                        {s.ot_hours > 0 ? `+${s.ot_hours}h` : "—"}
                      </td>
                      <td
                        className="px-4 py-3 text-xs font-medium"
                        style={{
                          color: "var(--text-primary)",
                          fontFamily: "var(--font-display)",
                        }}
                      >
                        {fmtCurrency(s.gross_owed)}
                      </td>
                      <td
                        className="px-4 py-3 text-xs"
                        style={{
                          color:
                            s.claimed_amount > 0
                              ? "var(--text-secondary)"
                              : "var(--text-muted)",
                          fontFamily: "var(--font-display)",
                        }}
                      >
                        {s.claimed_amount > 0
                          ? fmtCurrency(s.claimed_amount)
                          : "—"}
                      </td>
                      <td
                        className="px-4 py-3 text-xs font-bold"
                        style={{
                          color:
                            s.shortfall > 50
                              ? "#f85149"
                              : s.shortfall > 0
                                ? "var(--accent)"
                                : "var(--text-muted)",
                          fontFamily: "var(--font-display)",
                        }}
                      >
                        {s.shortfall > 0 ? fmtCurrency(s.shortfall) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={s.status} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default WorkerDetail;
