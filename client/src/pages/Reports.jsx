/**
 * pages/Reports.jsx — Employer monthly reports page
 *
 * - Lists all generated PDF reports (from S3 via /api/v1/reports)
 * - "Generate Report" button → POST /api/v1/reports/generate
 * - Polls /api/v1/reports/status/:jobId every 5s while generating
 * - Download button per report (1-hour signed S3 URL)
 */

import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  FileText,
  Download,
  Loader2,
  RefreshCw,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Zap,
} from "lucide-react";

import api from "@/api/axios";
import Layout from "@/components/Layout";

// ─── API ──────────────────────────────────────────────────────────────────────
const fetchReports = async () => {
  const r = await api.get("/reports");
  return r.data.data;
};
const generateReport = async () => {
  const r = await api.post("/reports/generate");
  return r.data.data;
};
const pollJobStatus = async (jobId) => {
  const r = await api.get(`/reports/status/${jobId}`);
  return r.data.data;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmtDate = (d) =>
  new Date(d).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

// ─── Job status indicator ─────────────────────────────────────────────────────
const JOB_STATE_UI = {
  waiting: {
    color: "var(--text-muted)",
    Icon: Clock,
    label: "Waiting in queue…",
  },
  active: {
    color: "var(--accent)",
    Icon: Loader2,
    label: "Generating PDF…",
    spin: true,
  },
  completed: { color: "#3fb950", Icon: CheckCircle2, label: "Complete!" },
  failed: {
    color: "#f85149",
    Icon: AlertTriangle,
    label: "Generation failed.",
  },
  delayed: {
    color: "var(--text-muted)",
    Icon: Clock,
    label: "Delayed — will start soon…",
  },
};

const JobStatus = ({ jobId, progress, onComplete }) => {
  const [state, setState] = useState({ state: "waiting", progress: 0 });
  const intervalRef = useRef(null);
  const doneRef = useRef(false);

  useEffect(() => {
    if (!jobId || doneRef.current) return;

    const poll = async () => {
      try {
        const data = await pollJobStatus(jobId);
        setState({
          state: data.state,
          progress: data.progress ?? 0,
          failReason: data.fail_reason,
        });
        if (data.state === "completed") {
          doneRef.current = true;
          clearInterval(intervalRef.current);
          onComplete?.();
        }
        if (data.state === "failed") {
          doneRef.current = true;
          clearInterval(intervalRef.current);
        }
      } catch (_) {
        /* swallow — keep polling */
      }
    };

    poll();
    intervalRef.current = setInterval(poll, 5000);
    return () => clearInterval(intervalRef.current);
  }, [jobId]);

  const ui = JOB_STATE_UI[state.state] ?? JOB_STATE_UI.waiting;
  const { Icon } = ui;

  return (
    <div
      className="ss-card p-4 mb-5 flex items-center gap-4"
      style={{ borderColor: ui.color, background: `${ui.color}10` }}
    >
      <Icon
        size={18}
        style={{ color: ui.color, flexShrink: 0 }}
        className={ui.spin ? "animate-spin" : ""}
      />
      <div className="flex-1 min-w-0">
        <p
          className="text-sm font-medium"
          style={{ color: ui.color, fontFamily: "var(--font-display)" }}
        >
          {ui.label}
        </p>
        {state.state === "active" && state.progress > 0 && (
          <div
            className="mt-2 h-1.5 rounded-full overflow-hidden"
            style={{ background: "var(--bg-elevated)" }}
          >
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${state.progress}%`,
                background: "var(--accent)",
              }}
            />
          </div>
        )}
        {state.failReason && (
          <p className="text-xs mt-1" style={{ color: "#f85149" }}>
            {state.failReason}
          </p>
        )}
      </div>
      {state.state === "active" && (
        <span className="text-xs font-mono" style={{ color: ui.color }}>
          {state.progress}%
        </span>
      )}
    </div>
  );
};

// ─── Report row ───────────────────────────────────────────────────────────────
const ReportRow = ({ report, index, total }) => {
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const { data } = await api.get(`/reports/download/${report.month_key}`);
      window.open(data.data.url, "_blank");
    } catch (err) {
      toast.error(err.message || "Failed to get download link.");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <tr
      style={{
        borderBottom: index < total - 1 ? "1px solid var(--border)" : "none",
      }}
    >
      {/* Icon + Month */}
      <td className="px-5 py-4">
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 flex items-center justify-center flex-shrink-0"
            style={{
              background: "rgba(240,165,0,0.1)",
              borderRadius: "var(--radius)",
            }}
          >
            <FileText size={16} style={{ color: "var(--accent)" }} />
          </div>
          <div>
            <p
              className="font-semibold text-sm"
              style={{
                color: "var(--text-primary)",
                fontFamily: "var(--font-display)",
              }}
            >
              {report.month}
            </p>
            <p
              className="text-xs mt-0.5"
              style={{ color: "var(--text-muted)" }}
            >
              {report.size_kb} KB · Generated {fmtDate(report.generated)}
            </p>
          </div>
        </div>
      </td>

      {/* Month key */}
      <td className="px-5 py-4">
        <span
          className="text-xs font-mono px-2 py-1"
          style={{
            background: "var(--bg-elevated)",
            color: "var(--text-secondary)",
            borderRadius: "var(--radius-sm)",
          }}
        >
          {report.month_key}
        </span>
      </td>

      {/* Status */}
      <td className="px-5 py-4">
        <span
          className="text-xs font-bold px-2 py-0.5 uppercase tracking-wider"
          style={{
            background: "rgba(63,185,80,0.1)",
            color: "#3fb950",
            borderRadius: "var(--radius-sm)",
            fontFamily: "var(--font-display)",
          }}
        >
          ✓ Ready
        </span>
      </td>

      {/* Download */}
      <td className="px-5 py-4 text-right">
        <button
          onClick={handleDownload}
          disabled={downloading}
          className="ss-btn flex items-center gap-2 ml-auto"
          style={{ fontSize: "12px", padding: "6px 14px" }}
        >
          {downloading ? (
            <>
              <Loader2 size={12} className="animate-spin" /> Getting link…
            </>
          ) : (
            <>
              <Download size={12} /> Download PDF
            </>
          )}
        </button>
      </td>
    </tr>
  );
};

// ─── Page ─────────────────────────────────────────────────────────────────────
const Reports = () => {
  const [activeJobId, setActiveJobId] = useState(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["reports"],
    queryFn: fetchReports,
    staleTime: 60_000,
  });

  const generateMutation = useMutation({
    mutationFn: generateReport,
    onSuccess: (data) => {
      if (data.job_id) {
        setActiveJobId(data.job_id);
        toast.success(
          "Report generation started! You'll get an email when it's ready.",
          { duration: 6000 },
        );
      } else {
        toast(data.message ?? "Report already generating.", { icon: "ℹ️" });
      }
    },
    onError: (err) =>
      toast.error(err.message || "Failed to start report generation."),
  });

  const handleJobComplete = () => {
    setActiveJobId(null);
    refetch();
    toast.success("Report ready! Click Download to get your PDF.", {
      duration: 8000,
    });
  };

  const reports = data?.reports ?? [];

  return (
    <Layout>
      <div className="p-6 max-w-4xl mx-auto space-y-5">
        {/* ── Header ───────────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1
              className="text-xl font-bold"
              style={{
                fontFamily: "var(--font-display)",
                color: "var(--text-primary)",
              }}
            >
              Reports
            </h1>
            <p
              className="text-sm mt-0.5"
              style={{ color: "var(--text-secondary)" }}
            >
              Monthly payroll compliance reports · Auto-generated on the 1st of
              each month
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => refetch()}
              className="ss-btn-ghost flex items-center gap-2 text-xs"
              style={{ fontFamily: "var(--font-display)" }}
            >
              <RefreshCw size={12} /> Refresh
            </button>
            <button
              onClick={() => generateMutation.mutate()}
              disabled={generateMutation.isPending || !!activeJobId}
              className="ss-btn flex items-center gap-2"
            >
              {generateMutation.isPending || activeJobId ? (
                <>
                  <Loader2 size={14} className="animate-spin" /> Generating…
                </>
              ) : (
                <>
                  <Zap size={14} /> Generate Now
                </>
              )}
            </button>
          </div>
        </div>

        {/* ── Info strip ───────────────────────────────────────────────────── */}
        <div
          className="flex items-start gap-3 px-4 py-3"
          style={{
            background: "rgba(240,165,0,0.05)",
            border: "1px solid rgba(240,165,0,0.15)",
            borderRadius: "var(--radius)",
          }}
        >
          <FileText
            size={14}
            style={{ color: "var(--accent)", flexShrink: 0, marginTop: 2 }}
          />
          <p
            className="text-xs leading-relaxed"
            style={{ color: "var(--text-secondary)" }}
          >
            Reports include a full wage compliance breakdown for all linked
            workers — shifts logged, gross wages owed, EPF/ESI deductions,
            shortfalls, and open disputes. Auto-generated on the{" "}
            <strong>1st of each month at 06:00 IST</strong> and emailed to you.
          </p>
        </div>

        {/* ── Active job status ─────────────────────────────────────────────── */}
        {activeJobId && (
          <JobStatus jobId={activeJobId} onComplete={handleJobComplete} />
        )}

        {/* ── Error ────────────────────────────────────────────────────────── */}
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
            {error?.message ?? "Failed to load reports."}
          </div>
        )}

        {/* ── Reports table ─────────────────────────────────────────────────── */}
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
              Generated Reports
              {!isLoading && ` (${reports.length})`}
            </p>
          </div>

          {isLoading ? (
            <div className="p-5 space-y-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                  <div
                    className="w-9 h-9 rounded animate-pulse"
                    style={{ background: "var(--bg-elevated)" }}
                  />
                  <div className="flex-1 space-y-2">
                    <div
                      className="h-4 w-32 rounded animate-pulse"
                      style={{ background: "var(--bg-elevated)" }}
                    />
                    <div
                      className="h-3 w-48 rounded animate-pulse"
                      style={{ background: "var(--bg-elevated)" }}
                    />
                  </div>
                  <div
                    className="h-8 w-28 rounded animate-pulse"
                    style={{ background: "var(--bg-elevated)" }}
                  />
                </div>
              ))}
            </div>
          ) : reports.length === 0 ? (
            <div className="py-14 text-center px-4">
              <FileText
                size={36}
                className="mx-auto mb-3"
                style={{ color: "var(--text-muted)" }}
              />
              <p
                className="text-sm font-medium mb-1"
                style={{ color: "var(--text-primary)" }}
              >
                No reports yet
              </p>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                Reports are auto-generated on the 1st of each month. Click
                "Generate Now" to create one immediately.
              </p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  {["Report", "Period", "Status", ""].map((h) => (
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
                {reports.map((r, i) => (
                  <ReportRow
                    key={r.key}
                    report={r}
                    index={i}
                    total={reports.length}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>

        <p
          className="text-center text-xs pb-2"
          style={{
            color: "var(--text-muted)",
            fontFamily: "var(--font-display)",
          }}
        >
          Download links expire after 1 hour · Reports stored securely in AWS S3
        </p>
      </div>
    </Layout>
  );
};

export default Reports;
