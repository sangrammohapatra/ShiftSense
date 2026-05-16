/**
 * pages/WorkerList.jsx — Employer worker roster
 *
 * Features:
 *   - Searchable/filterable table (name, state, occupation)
 *   - "Link Worker" modal → POST /api/v1/workers/link
 *   - "Unlink" per row with inline confirmation
 *   - Click row → navigate to /workers/:id
 *   - Columns: Name, Phone, State, Occupation, Status
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { useForm } from "react-hook-form";
import {
  UserPlus,
  UserMinus,
  Search,
  X,
  Loader2,
  ChevronRight,
  Filter,
  Phone,
  MapPin,
  Briefcase,
} from "lucide-react";

import api from "@/api/axios";
import Layout from "@/components/Layout";
import FormField from "@/components/ui/FormField";
import { INDIAN_STATES } from "@/constants/india";
import { OCCUPATION_ENUM } from "@/constants/occupations";

// ─── API helpers ──────────────────────────────────────────────────────────────
const fetchWorkers = async (params) => {
  const res = await api.get("/workers", { params });
  return res.data.data;
};

const linkWorker = async (phone_number) => {
  const res = await api.post("/workers/link", { phone_number });
  return res.data.data;
};

const unlinkWorker = async (workerId) => {
  const res = await api.delete(`/workers/unlink/${workerId}`);
  return res.data.data;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const OCC_COLORS = {
  construction: { bg: "rgba(88,166,255,0.12)", color: "#58a6ff" },
  security: { bg: "rgba(63,185,80,0.12)", color: "#3fb950" },
  domestic: { bg: "rgba(240,165,0,0.12)", color: "#f0a500" },
  factory: { bg: "rgba(188,140,255,0.12)", color: "#bc8cff" },
  driver: { bg: "rgba(255,123,88,0.12)", color: "#ff7b58" },
};

const OccBadge = ({ occ }) => {
  const style = OCC_COLORS[occ] ?? {
    bg: "var(--bg-elevated)",
    color: "var(--text-muted)",
  };
  return (
    <span
      className="text-xs font-medium px-2 py-0.5 capitalize"
      style={{
        background: style.bg,
        color: style.color,
        borderRadius: "var(--radius-sm)",
        fontFamily: "var(--font-display)",
      }}
    >
      {occ ?? "—"}
    </span>
  );
};

const Skeleton = () => (
  <tr>
    {[...Array(6)].map((_, i) => (
      <td key={i} className="px-4 py-3">
        <div
          className="h-4 rounded animate-pulse"
          style={{
            background: "var(--bg-elevated)",
            width: `${60 + i * 10}px`,
          }}
        />
      </td>
    ))}
  </tr>
);

// ─── Link Worker Modal ────────────────────────────────────────────────────────
const LinkWorkerModal = ({ onClose, onLinked }) => {
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    defaultValues: { phone_number: "" },
  });

  const mutation = useMutation({
    mutationFn: (data) => linkWorker(data.phone_number),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["workers"] });
      toast.success(`${data.worker?.name ?? "Worker"} linked successfully!`);
      onLinked?.();
      onClose();
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
    >
      <div
        className="ss-card w-full max-w-md p-6 relative"
        style={{ boxShadow: "0 24px 64px rgba(0,0,0,0.5)" }}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded transition-colors"
          style={{
            color: "var(--text-muted)",
            background: "var(--bg-elevated)",
            border: "none",
            cursor: "pointer",
          }}
        >
          <X size={15} />
        </button>

        <h2
          className="text-base font-bold mb-1"
          style={{
            fontFamily: "var(--font-display)",
            color: "var(--text-primary)",
          }}
        >
          Link a Worker
        </h2>
        <p className="text-xs mb-5" style={{ color: "var(--text-secondary)" }}>
          The worker must be registered on WhatsApp first. Enter their phone
          number to link them to your account.
        </p>

        <div className="h-px mb-5" style={{ background: "var(--border)" }} />

        <form
          onSubmit={handleSubmit(mutation.mutate)}
          noValidate
          className="space-y-4"
        >
          <FormField
            label="Worker WhatsApp number"
            id="phone_number"
            type="tel"
            placeholder="+919876543210"
            error={errors.phone_number?.message}
            reg={register("phone_number", {
              required: "Phone number is required.",
              pattern: {
                value: /^\+?[1-9]\d{7,14}$/,
                message: "Enter a valid phone number (e.g. +919876543210).",
              },
            })}
          />
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            Include the country code (+91 for India).
          </p>

          <button
            type="submit"
            disabled={isSubmitting || mutation.isPending}
            className="ss-btn w-full"
          >
            {isSubmitting || mutation.isPending ? (
              <>
                <Loader2 size={14} className="animate-spin" /> Linking…
              </>
            ) : (
              <>
                <UserPlus size={14} /> Link Worker
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};

// ─── Unlink confirmation ──────────────────────────────────────────────────────
const UnlinkButton = ({ workerId, workerName }) => {
  const [confirming, setConfirming] = useState(false);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => unlinkWorker(workerId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workers"] });
      toast.success(`${workerName} unlinked.`);
      setConfirming(false);
    },
    onError: (err) => {
      toast.error(err.message);
      setConfirming(false);
    },
  });

  if (confirming) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
          Sure?
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            mutation.mutate();
          }}
          disabled={mutation.isPending}
          className="text-xs px-2 py-1 font-bold transition-colors"
          style={{
            background: "rgba(248,81,73,0.15)",
            color: "#f85149",
            border: "none",
            borderRadius: "var(--radius-sm)",
            cursor: "pointer",
            fontFamily: "var(--font-display)",
          }}
        >
          {mutation.isPending ? (
            <Loader2 size={10} className="animate-spin" />
          ) : (
            "Yes"
          )}
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setConfirming(false);
          }}
          className="text-xs px-2 py-1"
          style={{
            color: "var(--text-muted)",
            background: "var(--bg-elevated)",
            border: "none",
            borderRadius: "var(--radius-sm)",
            cursor: "pointer",
          }}
        >
          No
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        setConfirming(true);
      }}
      className="flex items-center gap-1 text-xs px-2.5 py-1.5 transition-all duration-150"
      style={{
        color: "var(--text-muted)",
        background: "transparent",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-sm)",
        cursor: "pointer",
        fontFamily: "var(--font-display)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "#f85149";
        e.currentTarget.style.color = "#f85149";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "var(--border)";
        e.currentTarget.style.color = "var(--text-muted)";
      }}
    >
      <UserMinus size={11} /> Unlink
    </button>
  );
};

// ─── Page ─────────────────────────────────────────────────────────────────────
const WorkerList = () => {
  const navigate = useNavigate();
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [search, setSearch] = useState("");
  const [filterState, setFilterState] = useState("");
  const [filterOcc, setFilterOcc] = useState("");

  const queryParams = {};
  if (search) queryParams.search = search;
  if (filterState) queryParams.state = filterState;
  if (filterOcc) queryParams.occupation = filterOcc;

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["workers", queryParams],
    queryFn: () => fetchWorkers(queryParams),
    staleTime: 60_000,
  });

  const workers = data?.workers ?? [];

  return (
    <Layout>
      <div className="p-6 max-w-7xl mx-auto space-y-5">
        {/* ── Header ───────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1
              className="text-xl font-bold"
              style={{
                fontFamily: "var(--font-display)",
                color: "var(--text-primary)",
              }}
            >
              Workers
            </h1>
            <p
              className="text-sm mt-0.5"
              style={{ color: "var(--text-secondary)" }}
            >
              {isLoading ? "Loading…" : `${data?.count ?? 0} linked workers`}
            </p>
          </div>
          <button
            onClick={() => setShowLinkModal(true)}
            className="ss-btn flex items-center gap-2"
          >
            <UserPlus size={14} /> Link Worker
          </button>
        </div>

        {/* ── Filters ──────────────────────────────────────────────────────── */}
        <div className="flex flex-wrap gap-3 items-center">
          {/* Search */}
          <div className="relative flex-1 min-w-48">
            <Search
              size={13}
              className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ color: "var(--text-muted)" }}
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name…"
              className="ss-input pl-8 text-sm"
            />
          </div>

          {/* State filter */}
          <div className="flex items-center gap-2">
            <Filter size={12} style={{ color: "var(--text-muted)" }} />
            <select
              value={filterState}
              onChange={(e) => setFilterState(e.target.value)}
              className="ss-input text-xs w-40"
              style={{ cursor: "pointer" }}
            >
              <option value="">All States</option>
              {INDIAN_STATES.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.code} — {s.name}
                </option>
              ))}
            </select>
          </div>

          {/* Occupation filter */}
          <select
            value={filterOcc}
            onChange={(e) => setFilterOcc(e.target.value)}
            className="ss-input text-xs w-40"
            style={{ cursor: "pointer" }}
          >
            <option value="">All Occupations</option>
            {OCCUPATION_ENUM.map((o) => (
              <option key={o} value={o} className="capitalize">
                {o}
              </option>
            ))}
          </select>

          {/* Clear filters */}
          {(search || filterState || filterOcc) && (
            <button
              onClick={() => {
                setSearch("");
                setFilterState("");
                setFilterOcc("");
              }}
              className="flex items-center gap-1 text-xs px-2.5 py-1.5"
              style={{
                color: "var(--text-muted)",
                background: "var(--bg-elevated)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                cursor: "pointer",
                fontFamily: "var(--font-display)",
              }}
            >
              <X size={11} /> Clear
            </button>
          )}
        </div>

        {/* ── Error ────────────────────────────────────────────────────────── */}
        {isError && (
          <div
            className="px-4 py-3 text-sm"
            style={{
              background: "rgba(248,81,73,0.1)",
              border: "1px solid rgba(248,81,73,0.3)",
              borderRadius: "var(--radius)",
              color: "#f85149",
            }}
          >
            {error?.message ?? "Failed to load workers."}
          </div>
        )}

        {/* ── Table ────────────────────────────────────────────────────────── */}
        <div className="ss-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  {[
                    "Name",
                    "Phone",
                    "State",
                    "Occupation",
                    "Claimed Wage/Day",
                    "",
                  ].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left text-xs uppercase tracking-widest font-medium whitespace-nowrap"
                      style={{
                        color: "var(--text-muted)",
                        fontFamily: "var(--font-display)",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  [...Array(4)].map((_, i) => <Skeleton key={i} />)
                ) : workers.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-12 text-center text-sm"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {search || filterState || filterOcc
                        ? "No workers match your filters."
                        : 'No workers linked yet. Click "Link Worker" to get started.'}
                    </td>
                  </tr>
                ) : (
                  workers.map((w, i) => (
                    <tr
                      key={w._id}
                      onClick={() => navigate(`/workers/${w._id}`)}
                      className="transition-colors duration-100 cursor-pointer"
                      style={{
                        borderBottom:
                          i < workers.length - 1
                            ? "1px solid var(--border)"
                            : "none",
                      }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.background =
                          "rgba(255,255,255,0.02)")
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.background = "transparent")
                      }
                    >
                      {/* Name */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-7 h-7 flex-shrink-0 flex items-center justify-center text-xs font-bold"
                            style={{
                              background: "var(--accent)",
                              color: "#000",
                              borderRadius: "var(--radius-sm)",
                              fontFamily: "var(--font-display)",
                            }}
                          >
                            {(w.name ?? "?")[0].toUpperCase()}
                          </div>
                          <div>
                            <p
                              className="font-medium"
                              style={{
                                color: "var(--text-primary)",
                                fontFamily: "var(--font-display)",
                              }}
                            >
                              {w.name ?? "—"}
                            </p>
                            {!w.is_verified && (
                              <span
                                className="text-xs"
                                style={{ color: "var(--text-muted)" }}
                              >
                                Unverified
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Phone */}
                      <td className="px-4 py-3">
                        <span
                          className="flex items-center gap-1.5 text-xs"
                          style={{
                            color: "var(--text-secondary)",
                            fontFamily: "var(--font-display)",
                          }}
                        >
                          <Phone
                            size={10}
                            style={{ color: "var(--text-muted)" }}
                          />
                          {w.phone_number}
                        </span>
                      </td>

                      {/* State */}
                      <td className="px-4 py-3">
                        <span
                          className="flex items-center gap-1.5 text-xs"
                          style={{
                            color: "var(--text-secondary)",
                            fontFamily: "var(--font-display)",
                          }}
                        >
                          <MapPin
                            size={10}
                            style={{ color: "var(--text-muted)" }}
                          />
                          {w.state ?? "—"}
                        </span>
                      </td>

                      {/* Occupation */}
                      <td className="px-4 py-3">
                        <OccBadge occ={w.occupation} />
                      </td>

                      {/* Claimed daily wage */}
                      <td
                        className="px-4 py-3 text-xs"
                        style={{
                          color: w.claimed_daily_wage
                            ? "var(--text-primary)"
                            : "var(--text-muted)",
                          fontFamily: "var(--font-display)",
                        }}
                      >
                        {w.claimed_daily_wage
                          ? `₹${w.claimed_daily_wage}/day`
                          : "Not set"}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 justify-end">
                          <UnlinkButton
                            workerId={w._id}
                            workerName={w.name ?? "Worker"}
                          />
                          <ChevronRight
                            size={14}
                            style={{ color: "var(--text-muted)" }}
                          />
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {showLinkModal && (
        <LinkWorkerModal onClose={() => setShowLinkModal(false)} />
      )}
    </Layout>
  );
};

export default WorkerList;
