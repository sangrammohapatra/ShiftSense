/**
 * pages/Reports.jsx — Employer monthly reports page
 *
 * - Lists all generated PDF reports (from S3 via /api/v1/reports)
 * - "Generate Report" button → POST /api/v1/reports/generate
 * - Polls /api/v1/reports/status/:jobId every 5s while generating
 * - Download button per report (1-hour signed S3 URL)
 */

import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  LinearProgress,
  Paper,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import { useMutation, useQuery } from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Download,
  FileText,
  Loader2,
  RefreshCw,
  Zap,
} from "lucide-react";

import api from "@/api/axios";
import Layout from "@/components/Layout";

const fetchReports = async () => {
  const response = await api.get("/reports");
  return response.data.data;
};

const generateReport = async () => {
  const response = await api.post("/reports/generate");
  return response.data.data;
};

const pollJobStatus = async (jobId) => {
  const response = await api.get(`/reports/status/${jobId}`);
  return response.data.data;
};

const formatDate = (value) =>
  new Date(value).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

const JOB_STATE_UI = {
  waiting: {
    color: "text.secondary",
    icon: Clock,
    label: "Waiting in queue",
  },
  active: {
    color: "primary.main",
    icon: Loader2,
    label: "Generating PDF",
  },
  completed: {
    color: "success.main",
    icon: CheckCircle2,
    label: "Complete",
  },
  failed: {
    color: "error.main",
    icon: AlertTriangle,
    label: "Generation failed",
  },
  delayed: {
    color: "warning.main",
    icon: Clock,
    label: "Delayed",
  },
};

const JobStatus = ({ jobId, onComplete }) => {
  const theme = useTheme();
  const [state, setState] = useState({ state: "waiting", progress: 0 });
  const intervalRef = useRef(null);
  const doneRef = useRef(false);

  useEffect(() => {
    if (!jobId || doneRef.current) {
      return undefined;
    }

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
        // Keep polling quietly. The next attempt may recover.
      }
    };

    poll();
    intervalRef.current = setInterval(poll, 5000);

    return () => clearInterval(intervalRef.current);
  }, [jobId, onComplete]);

  const ui = JOB_STATE_UI[state.state] ?? JOB_STATE_UI.waiting;
  const StatusIcon = ui.icon;

  return (
    <Paper
      sx={{
        p: 2.5,
        borderRadius: 1,
        borderColor: alpha(theme.palette.primary.main, 0.16),
        bgcolor: alpha(theme.palette.primary.main, 0.06),
      }}
    >
      <Stack direction="row" spacing={2} alignItems="flex-start">
        <Box sx={{ color: ui.color, pt: 0.25 }}>
          <StatusIcon size={18} />
        </Box>
        <Box sx={{ flex: 1 }}>
          <Typography variant="subtitle2" sx={{ color: ui.color, fontWeight: 700 }}>
            {ui.label}
          </Typography>
          {state.state === "active" ? (
            <Box sx={{ mt: 1.5 }}>
              <LinearProgress
                variant="determinate"
                value={state.progress}
                sx={{
                  height: 8,
                  borderRadius: 10,
                  bgcolor: alpha(theme.palette.common.white, 0.06),
                }}
              />
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: "block" }}>
                {state.progress}% complete
              </Typography>
            </Box>
          ) : null}
          {state.failReason ? (
            <Typography variant="caption" sx={{ color: "error.main", mt: 1, display: "block" }}>
              {state.failReason}
            </Typography>
          ) : null}
        </Box>
      </Stack>
    </Paper>
  );
};

const ReportRow = ({ report, onDownload }) => (
  <TableRow hover>
    <TableCell>
      <Stack direction="row" spacing={1.5} alignItems="center">
        <Box
          sx={{
            width: 42,
            height: 42,
            borderRadius: 1,
            display: "grid",
            placeItems: "center",
            bgcolor: alpha("#f0a500", 0.12),
            color: "primary.main",
            flexShrink: 0,
          }}
        >
          <FileText size={18} />
        </Box>
        <Box>
          <Typography sx={{ fontFamily: '"IBM Plex Mono", monospace', fontWeight: 700 }}>
            {report.month}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {report.size_kb} KB · Generated {formatDate(report.generated)}
          </Typography>
        </Box>
      </Stack>
    </TableCell>
    <TableCell>
      <Chip
        label={report.month_key}
        size="small"
        variant="outlined"
        sx={{ borderRadius: 10, fontFamily: '"IBM Plex Mono", monospace' }}
      />
    </TableCell>
    <TableCell>
      <Chip
        label="Ready"
        size="small"
        color="success"
        sx={{ borderRadius: 10 }}
      />
    </TableCell>
    <TableCell align="right">
      <Button
        onClick={onDownload}
        variant="contained"
        size="small"
        startIcon={<Download size={14} />}
        sx={{ borderRadius: 10 }}
      >
        Download PDF
      </Button>
    </TableCell>
  </TableRow>
);

const Reports = () => {
  const theme = useTheme();
  const [activeJobId, setActiveJobId] = useState(null);
  const [downloadingKey, setDownloadingKey] = useState(null);

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["reports"],
    queryFn: fetchReports,
    staleTime: 60_000,
  });

  const generateMutation = useMutation({
    mutationFn: generateReport,
    onSuccess: (response) => {
      if (response.job_id) {
        setActiveJobId(response.job_id);
        toast.success("Report generation started! You will get an email when it is ready.", {
          duration: 6000,
        });
        return;
      }

      toast(response.message ?? "Report already generating.", { icon: "ℹ️" });
    },
    onError: (mutationError) => {
      toast.error(mutationError.message || "Failed to start report generation.");
    },
  });

  const reports = data?.reports ?? [];

  const handleJobComplete = () => {
    setActiveJobId(null);
    refetch();
    toast.success("Report ready! Click Download to get your PDF.", {
      duration: 8000,
    });
  };

  const handleDownload = async (monthKey) => {
    setDownloadingKey(monthKey);

    try {
      const response = await api.get(`/reports/download/${monthKey}`);
      window.open(response.data.data.url, "_blank");
    } catch (downloadError) {
      toast.error(downloadError.message || "Failed to get download link.");
    } finally {
      setDownloadingKey(null);
    }
  };

  return (
    <Layout>
      <Box sx={{ maxWidth: 1180, mx: "auto", px: { xs: 2, md: 3 }, py: { xs: 3, md: 4 } }}>
        <Stack spacing={3}>
          <Stack
            direction={{ xs: "column", md: "row" }}
            spacing={2}
            justifyContent="space-between"
            alignItems={{ xs: "flex-start", md: "center" }}
          >
            <Box>
              <Typography variant="h4">Reports</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Monthly payroll compliance reports, auto-generated on the first day
                of each month.
              </Typography>
            </Box>

            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
              <Button
                onClick={() => refetch()}
                variant="outlined"
                startIcon={isFetching ? <CircularProgress size={16} color="inherit" /> : <RefreshCw size={16} />}
                sx={{ borderRadius: 10 }}
              >
                Refresh
              </Button>
              <Button
                onClick={() => generateMutation.mutate()}
                disabled={generateMutation.isPending || Boolean(activeJobId)}
                variant="contained"
                startIcon={
                  generateMutation.isPending || activeJobId ? (
                    <CircularProgress size={16} color="inherit" />
                  ) : (
                    <Zap size={16} />
                  )
                }
                sx={{ borderRadius: 10 }}
              >
                {generateMutation.isPending || activeJobId ? "Generating" : "Generate Now"}
              </Button>
            </Stack>
          </Stack>

          <Paper
            sx={{
              p: 2.5,
              borderRadius: 1,
              bgcolor: alpha(theme.palette.primary.main, 0.06),
              borderColor: alpha(theme.palette.primary.main, 0.16),
            }}
          >
            <Stack direction="row" spacing={1.5} alignItems="flex-start">
              <FileText size={16} color={theme.palette.primary.main} />
              <Typography variant="body2" color="text.secondary">
                Reports include the full wage compliance breakdown for all linked
                workers: shifts logged, gross wages owed, EPF and ESI deductions,
                shortfalls, and open disputes. They are auto-generated on the 1st
                of each month at 06:00 IST and emailed to you.
              </Typography>
            </Stack>
          </Paper>

          {activeJobId ? <JobStatus jobId={activeJobId} onComplete={handleJobComplete} /> : null}

          {isError ? (
            <Alert severity="error" icon={<AlertTriangle size={18} />} sx={{ borderRadius: 1 }}>
              {error?.message ?? "Failed to load reports."}
            </Alert>
          ) : null}

          <TableContainer component={Paper} sx={{ borderRadius: 1, overflow: "hidden" }}>
            <Box sx={{ px: 3, py: 2.5, borderBottom: "1px solid", borderColor: "divider" }}>
              <Typography variant="overline" color="text.secondary">
                Generated Reports {!isLoading ? `(${reports.length})` : ""}
              </Typography>
            </Box>

            {isLoading ? (
              <Stack spacing={2} sx={{ p: 3 }}>
                {[0, 1, 2].map((row) => (
                  <Stack key={row} direction="row" spacing={2} alignItems="center">
                    <Skeleton variant="rounded" width={42} height={42} />
                    <Box sx={{ flex: 1 }}>
                      <Skeleton variant="text" width={160} />
                      <Skeleton variant="text" width={240} />
                    </Box>
                    <Skeleton variant="rounded" width={132} height={36} />
                  </Stack>
                ))}
              </Stack>
            ) : reports.length === 0 ? (
              <Box sx={{ py: 8, px: 3, textAlign: "center" }}>
                <Box sx={{ color: "text.secondary", mb: 2 }}>
                  <FileText size={40} />
                </Box>
                <Typography variant="h6">No reports yet</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  Reports are auto-generated on the first of each month. Click
                  Generate Now to create one immediately.
                </Typography>
              </Box>
            ) : (
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Report</TableCell>
                    <TableCell>Period</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell align="right">Action</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {reports.map((report) => (
                    <ReportRow
                      key={report.key}
                      report={report}
                      onDownload={() => handleDownload(report.month_key)}
                      downloading={downloadingKey === report.month_key}
                    />
                  ))}
                </TableBody>
              </Table>
            )}
          </TableContainer>

          {downloadingKey ? (
            <Typography variant="caption" sx={{ textAlign: "center", color: "text.secondary" }}>
              Fetching secure download link for {downloadingKey}...
            </Typography>
          ) : (
            <Typography variant="caption" sx={{ textAlign: "center", color: "text.secondary" }}>
              Download links expire after one hour. Reports are stored securely in AWS S3.
            </Typography>
          )}
        </Stack>
      </Box>
    </Layout>
  );
};

export default Reports;
