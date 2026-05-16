/**
 * pages/Dashboard.jsx — ShiftSense employer dashboard
 *
 * Fetches /api/v1/dashboard/stats via react-query.
 * Renders:
 *   - 4 metric cards (workers, shifts, shortfall, disputes)
 *   - Recharts BarChart: 6-month shift vs dispute count
 *   - Recent disputes table (last 5)
 */

import { useQuery } from "@tanstack/react-query";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";
import {
  Users,
  CalendarDays,
  AlertTriangle,
  TrendingDown,
  RefreshCw,
  ArrowRight,
} from "lucide-react";
import { Link } from "react-router-dom";

import api from "@/api/axios";
import Layout from "@/components/Layout";
import useAuthStore from "@/store/authStore";

// ─── API ──────────────────────────────────────────────────────────────────────
const fetchStats = async () => {
  const res = await api.get("/dashboard/stats");
  return res.data.data;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmtCurrency = (n) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);

const fmtDate = (d) =>
  new Date(d).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

// ─── Skeleton ─────────────────────────────────────────────────────────────────
const Skeleton = ({ w = "w-full", h = "h-4" }) => (
  <div
    className={`${w} ${h} rounded animate-pulse`}
    style={{ background: "var(--bg-elevated)" }}
  />
);

// ─── Metric card ──────────────────────────────────────────────────────────────
const MetricCard = ({ label, value, icon: Icon, accent = false, loading }) => (
  <div
    className="ss-card p-5 flex flex-col gap-3"
    style={{
      borderColor: accent ? "var(--accent)" : "var(--border)",
      background: accent ? "rgba(240,165,0,0.04)" : "var(--bg-surface)",
    }}
  >
    <div className="flex items-center justify-between">
      <p
        className="text-xs uppercase tracking-widest"
        style={{
          color: "var(--text-muted)",
          fontFamily: "var(--font-display)",
        }}
      >
        {label}
      </p>
      <div
        className="w-7 h-7 flex items-center justify-center"
        style={{
          background: accent ? "var(--accent)" : "var(--bg-elevated)",
          borderRadius: "var(--radius-sm)",
        }}
      >
        <Icon
          size={13}
          style={{ color: accent ? "#000" : "var(--text-muted)" }}
        />
      </div>
    </div>

    {loading ? (
      <Skeleton h="h-8" w="w-24" />
    ) : (
      <p
        className="text-3xl font-bold leading-none"
        style={{
          fontFamily: "var(--font-display)",
          color: accent ? "var(--accent)" : "var(--text-primary)",
        }}
      >
        {value}
      </p>
    )}
  </div>
);

// ─── Custom chart tooltip ─────────────────────────────────────────────────────
const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="px-3 py-2 text-xs"
      style={{
        background: "var(--bg-elevated)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
        fontFamily: "var(--font-display)",
        color: "var(--text-primary)",
      }}
    >
      <p className="font-bold mb-1" style={{ color: "var(--accent)" }}>
        {label}
      </p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: {p.value}
        </p>
      ))}
    </div>
  );
};

// ─── Status badge ─────────────────────────────────────────────────────────────
const StatusBadge = ({ status }) => {
  const styles = {
    disputed: {
      bg: "rgba(248,81,73,0.12)",
      color: "#f85149",
      label: "Disputed",
    },
    resolved: {
      bg: "rgba(63,185,80,0.12)",
      color: "#3fb950",
      label: "Resolved",
    },
    logged: { bg: "rgba(88,166,255,0.12)", color: "#58a6ff", label: "Logged" },
  };
  const s = styles[status] ?? styles.logged;
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

// ─── Page ─────────────────────────────────────────────────────────────────────
const Dashboard = () => {
  const employer = useAuthStore((s) => s.employer);

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: fetchStats,
    staleTime: 2 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });

  return (
    <Layout>
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        {/* ── Page header ──────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between">
          <div>
            <h1
              className="text-xl font-bold"
              style={{
                fontFamily: "var(--font-display)",
                color: "var(--text-primary)",
              }}
            >
              Dashboard
            </h1>
            <p
              className="text-sm mt-0.5"
              style={{ color: "var(--text-secondary)" }}
            >
              {employer?.company_name ?? "—"} · Workforce Compliance Overview
            </p>
          </div>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="ss-btn-ghost flex items-center gap-2 text-xs"
            style={{ fontFamily: "var(--font-display)" }}
          >
            <RefreshCw size={12} className={isFetching ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>

        {/* ── Error banner ─────────────────────────────────────────────────── */}
        {isError && (
          <div
            className="px-4 py-3 text-sm flex items-center gap-2"
            style={{
              background: "rgba(248,81,73,0.1)",
              border: "1px solid rgba(248,81,73,0.3)",
              borderRadius: "var(--radius)",
              color: "#f85149",
            }}
          >
            <AlertTriangle size={14} />
            {error?.message ?? "Failed to load stats."}
          </div>
        )}

        {/* ── Metric cards ─────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            label="Total Workers"
            value={data?.total_workers ?? 0}
            icon={Users}
            loading={isLoading}
          />
          <MetricCard
            label="Shifts This Month"
            value={data?.shifts_this_month ?? 0}
            icon={CalendarDays}
            loading={isLoading}
          />
          <MetricCard
            label="Shortfall This Month"
            value={
              isLoading ? "—" : fmtCurrency(data?.shortfall_this_month ?? 0)
            }
            icon={TrendingDown}
            accent={!isLoading && (data?.shortfall_this_month ?? 0) > 0}
            loading={isLoading}
          />
          <MetricCard
            label="Open Disputes"
            value={data?.open_disputes ?? 0}
            icon={AlertTriangle}
            accent={!isLoading && (data?.open_disputes ?? 0) > 0}
            loading={isLoading}
          />
        </div>

        {/* ── Chart + quick links ───────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 ss-card p-5">
            <p
              className="text-xs uppercase tracking-widest font-medium mb-5"
              style={{
                color: "var(--text-secondary)",
                fontFamily: "var(--font-display)",
              }}
            >
              Shifts vs Disputes — Last 6 Months
            </p>

            {isLoading ? (
              <div className="h-52 flex items-end gap-3 px-4">
                {[40, 70, 55, 80, 60, 90].map((h, i) => (
                  <div
                    key={i}
                    className="flex-1 animate-pulse rounded-sm"
                    style={{
                      height: `${h}%`,
                      background: "var(--bg-elevated)",
                    }}
                  />
                ))}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={210}>
                <BarChart
                  data={data?.monthly_chart ?? []}
                  margin={{ top: 4, right: 8, left: -20, bottom: 0 }}
                  barGap={3}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="var(--border)"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="month"
                    tick={{
                      fill: "var(--text-muted)",
                      fontSize: 10,
                      fontFamily: "var(--font-display)",
                    }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{
                      fill: "var(--text-muted)",
                      fontSize: 10,
                      fontFamily: "var(--font-display)",
                    }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    content={<ChartTooltip />}
                    cursor={{ fill: "rgba(255,255,255,0.03)" }}
                  />
                  <Legend
                    wrapperStyle={{
                      fontSize: 10,
                      fontFamily: "var(--font-display)",
                      color: "var(--text-muted)",
                      paddingTop: 8,
                    }}
                  />
                  <Bar
                    dataKey="shifts"
                    name="Shifts"
                    fill="var(--accent)"
                    radius={[2, 2, 0, 0]}
                    maxBarSize={28}
                  />
                  <Bar
                    dataKey="disputes"
                    name="Disputes"
                    fill="#f85149"
                    radius={[2, 2, 0, 0]}
                    maxBarSize={28}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="ss-card p-5 flex flex-col gap-3">
            <p
              className="text-xs uppercase tracking-widest font-medium mb-2"
              style={{
                color: "var(--text-secondary)",
                fontFamily: "var(--font-display)",
              }}
            >
              Quick Access
            </p>
            {[
              {
                to: "/workers",
                label: "Manage Workers",
                sub: "Link or unlink workers",
              },
              {
                to: "/reports",
                label: "Download Reports",
                sub: "Monthly payroll sheets",
              },
              {
                to: "/profile",
                label: "Company Profile",
                sub: "Edit account settings",
              },
            ].map(({ to, label, sub }) => (
              <Link
                key={to}
                to={to}
                className="flex items-center justify-between px-3 py-3 transition-all duration-150"
                style={{
                  background: "var(--bg-elevated)",
                  borderRadius: "var(--radius)",
                  textDecoration: "none",
                  borderLeft: "2px solid transparent",
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.borderLeft = "2px solid var(--accent)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.borderLeft = "2px solid transparent")
                }
              >
                <div>
                  <p
                    className="text-sm font-medium"
                    style={{
                      color: "var(--text-primary)",
                      fontFamily: "var(--font-display)",
                    }}
                  >
                    {label}
                  </p>
                  <p
                    className="text-xs mt-0.5"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {sub}
                  </p>
                </div>
                <ArrowRight
                  size={14}
                  style={{ color: "var(--text-muted)", flexShrink: 0 }}
                />
              </Link>
            ))}
          </div>
        </div>

        {/* ── Recent disputes table ─────────────────────────────────────────── */}
        <div className="ss-card overflow-hidden">
          <div
            className="flex items-center justify-between px-5 py-4"
            style={{ borderBottom: "1px solid var(--border)" }}
          >
            <p
              className="text-xs uppercase tracking-widest font-medium"
              style={{
                color: "var(--text-secondary)",
                fontFamily: "var(--font-display)",
              }}
            >
              Recent Disputes
            </p>
            <Link
              to="/workers"
              className="text-xs flex items-center gap-1"
              style={{
                color: "var(--accent)",
                fontFamily: "var(--font-display)",
                textDecoration: "none",
              }}
            >
              View all <ArrowRight size={11} />
            </Link>
          </div>

          {isLoading ? (
            <div className="p-5 space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="flex gap-4">
                  <Skeleton w="w-32" />
                  <Skeleton w="w-24" />
                  <Skeleton w="w-20" />
                </div>
              ))}
            </div>
          ) : !data?.recent_disputes?.length ? (
            <div className="py-10 text-center">
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                No disputes found. Wages are compliant! ✅
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)" }}>
                    {[
                      "Worker",
                      "Date",
                      "Occupation",
                      "Shortfall",
                      "Status",
                    ].map((h) => (
                      <th
                        key={h}
                        className="px-5 py-3 text-left text-xs uppercase tracking-widest font-medium"
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
                  {data.recent_disputes.map((d, i) => (
                    <tr
                      key={d.shift_id}
                      style={{
                        borderBottom:
                          i < data.recent_disputes.length - 1
                            ? "1px solid var(--border)"
                            : "none",
                      }}
                    >
                      <td className="px-5 py-3">
                        <Link
                          to={`/workers/${d.worker.id}`}
                          style={{
                            color: "var(--text-primary)",
                            fontWeight: 500,
                            textDecoration: "none",
                            fontFamily: "var(--font-display)",
                          }}
                          onMouseEnter={(e) =>
                            (e.currentTarget.style.color = "var(--accent)")
                          }
                          onMouseLeave={(e) =>
                            (e.currentTarget.style.color =
                              "var(--text-primary)")
                          }
                        >
                          {d.worker.name}
                        </Link>
                        <p
                          className="text-xs mt-0.5"
                          style={{ color: "var(--text-muted)" }}
                        >
                          {d.worker.state}
                        </p>
                      </td>
                      <td
                        className="px-5 py-3 text-xs"
                        style={{
                          color: "var(--text-secondary)",
                          fontFamily: "var(--font-display)",
                        }}
                      >
                        {fmtDate(d.shift_date)}
                      </td>
                      <td
                        className="px-5 py-3 text-xs capitalize"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        {d.worker.occupation}
                      </td>
                      <td
                        className="px-5 py-3 text-sm font-bold"
                        style={{
                          color: "#f85149",
                          fontFamily: "var(--font-display)",
                        }}
                      >
                        {fmtCurrency(d.shortfall)}
                      </td>
                      <td className="px-5 py-3">
                        <StatusBadge status={d.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <p
          className="text-center text-xs pb-4"
          style={{
            color: "var(--text-muted)",
            fontFamily: "var(--font-display)",
          }}
        >
          Data governed by Minimum Wages Act 1948 · Factories Act 1948 · Payment
          of Wages Act 1936
        </p>
      </div>
    </Layout>
  );
};

export default Dashboard;
