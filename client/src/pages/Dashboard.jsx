/**
 * pages/Dashboard.jsx — ShiftSense employer dashboard
 *
 * Fetches /api/v1/dashboard/stats via react-query.
 * Renders:
 *   - 4 metric cards (workers, shifts, shortfall, disputes)
 *   - Recharts BarChart: 6-month shift vs dispute count
 *   - Recent disputes table (last 5)
 */

import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Grid,
  Link as MuiLink,
  List,
  ListItemButton,
  ListItemText,
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
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  RefreshCw,
  TrendingDown,
  Users,
} from "lucide-react";
import { Link as RouterLink } from "react-router-dom";

import api from "@/api/axios";
import Layout from "@/components/Layout";
import useAuthStore from "@/store/authStore";

const fetchStats = async () => {
  const response = await api.get("/dashboard/stats");
  return response.data.data;
};

const formatCurrency = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);

const formatDate = (value) =>
  new Date(value).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

const statusToChipProps = (status) => {
  const lookup = {
    disputed: {
      label: "Disputed",
      sx: {
        bgcolor: "rgba(248, 81, 73, 0.14)",
        color: "#ff938b",
      },
    },
    resolved: {
      label: "Resolved",
      sx: {
        bgcolor: "rgba(63, 185, 80, 0.14)",
        color: "#7ee787",
      },
    },
    logged: {
      label: "Logged",
      sx: {
        bgcolor: "rgba(88, 166, 255, 0.14)",
        color: "#8cc2ff",
      },
    },
  };

  return lookup[status] ?? lookup.logged;
};

const MetricCard = ({
  icon: Icon,
  label,
  value,
  accent = false,
  loading = false,
}) => {
  const theme = useTheme();

  return (
    <Paper
      sx={{
        p: 3,
        height: "100%",
        borderRadius: 1,
        background:
          accent && !loading
            ? `linear-gradient(180deg, ${alpha(
                theme.palette.primary.main,
                0.12,
              )} 0%, ${alpha(theme.palette.background.paper, 0.96)} 100%)`
            : theme.palette.background.paper,
        borderColor: accent
          ? alpha(theme.palette.primary.main, 0.28)
          : "divider",
      }}
    >
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="flex-start"
      >
        <Box>
          <Typography variant="overline" sx={{ color: "text.secondary" }}>
            {label}
          </Typography>
          {loading ? (
            <Skeleton
              variant="rounded"
              width={144}
              height={40}
              sx={{ mt: 1.5, borderRadius: 2 }}
            />
          ) : (
            <Typography
              variant="h4"
              sx={{
                mt: 1.5,
                color: accent ? "primary.main" : "text.primary",
              }}
            >
              {value}
            </Typography>
          )}
        </Box>

        <Box
          sx={{
            width: 46,
            height: 46,
            borderRadius: 1,
            display: "grid",
            placeItems: "center",
            bgcolor: accent
              ? alpha(theme.palette.primary.main, 0.18)
              : alpha(theme.palette.common.white, 0.05),
            color: accent ? "primary.main" : "text.secondary",
          }}
        >
          <Icon size={18} />
        </Box>
      </Stack>
    </Paper>
  );
};

const ChartTooltip = ({ active, payload, label }) => {
  const theme = useTheme();

  if (!active || !payload?.length) {
    return null;
  }

  return (
    <Paper
      sx={{
        px: 1.75,
        py: 1.25,
        borderRadius: 1,
        bgcolor: alpha(theme.palette.background.paper, 0.94),
        borderColor: alpha(theme.palette.common.white, 0.1),
      }}
    >
      <Typography variant="overline" sx={{ color: "primary.main" }}>
        {label}
      </Typography>
      {payload.map((entry) => (
        <Typography
          key={entry.name}
          variant="body2"
          sx={{ color: entry.color, fontFamily: '"IBM Plex Mono", monospace' }}
        >
          {entry.name}: {entry.value}
        </Typography>
      ))}
    </Paper>
  );
};

// ─── Page ─────────────────────────────────────────────────────────────────────
const Dashboard = () => {
  const theme = useTheme();
  const employer = useAuthStore((state) => state.employer);

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: fetchStats,
    staleTime: 2 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });

  const quickLinks = [
    {
      to: "/workers",
      label: "Manage Workers",
      sublabel: "Link, review, or update workforce records.",
    },
    {
      to: "/reports",
      label: "Download Reports",
      sublabel: "Generate monthly compliance and payroll exports.",
    },
    {
      to: "/profile",
      label: "Company Profile",
      sublabel: "Maintain contact details and account settings.",
    },
  ];

  return (
    <Layout>
      <Box
        sx={{
          maxWidth: 1440,
          mx: "auto",
          px: { xs: 2, sm: 3, lg: 4 },
          pt: { xs: 3, md: 4 },
        }}
      >
        <Paper
          sx={{
            mb: 3,
            p: { xs: 3, md: 4 },
            borderRadius: 1,
            background: `linear-gradient(135deg, ${alpha(
              theme.palette.primary.main,
              0.16,
            )} 0%, ${alpha(theme.palette.info.main, 0.12)} 42%, ${alpha(
              theme.palette.background.paper,
              0.96,
            )} 100%)`,
          }}
        >
          <Stack
            direction={{ xs: "column", md: "row" }}
            spacing={2}
            justifyContent="space-between"
            alignItems={{ xs: "flex-start", md: "center" }}
          >
            <Box sx={{ maxWidth: 760 }}>
              <Typography variant="overline" sx={{ color: "primary.main" }}>
                Workforce Compliance Overview
              </Typography>
              <Typography variant="h3" sx={{ mt: 0.75 }}>
                Dashboard
              </Typography>
              <Typography
                variant="body1"
                sx={{ mt: 1.25, color: "text.secondary" }}
              >
                {employer?.company_name ?? "Your company"} has a live view of
                wage risk, dispute activity, and reporting readiness across the
                last six months.
              </Typography>
            </Box>

            <Button
              onClick={() => refetch()}
              disabled={isFetching}
              variant="contained"
              color="primary"
              startIcon={
                isFetching ? (
                  <CircularProgress size={14} color="inherit" />
                ) : (
                  <RefreshCw size={16} />
                )
              }
              sx={{ minWidth: 164, borderRadius: 10, px: 2.5, py: 1.25 }}
            >
              {isFetching ? "Refreshing" : "Refresh data"}
            </Button>
          </Stack>
        </Paper>

        {isError ? (
          <Alert
            severity="error"
            icon={<AlertTriangle size={18} />}
            sx={{
              mb: 3,
              borderRadius: 1,
              bgcolor: "rgba(248, 81, 73, 0.12)",
              color: "text.primary",
              "& .MuiAlert-icon": {
                color: "error.main",
              },
            }}
          >
            {error?.message ?? "Failed to load dashboard statistics."}
          </Alert>
        ) : null}

        <Grid container spacing={3}>
          <Grid item xs={12} sm={6} lg={3}>
            <MetricCard
              label="Total Workers"
              value={data?.total_workers ?? 0}
              icon={Users}
              loading={isLoading}
            />
          </Grid>
          <Grid item xs={12} sm={6} lg={3}>
            <MetricCard
              label="Shifts This Month"
              value={data?.shifts_this_month ?? 0}
              icon={CalendarDays}
              loading={isLoading}
            />
          </Grid>
          <Grid item xs={12} sm={6} lg={3}>
            <MetricCard
              label="Shortfall This Month"
              value={formatCurrency(data?.shortfall_this_month ?? 0)}
              icon={TrendingDown}
              accent={!isLoading && (data?.shortfall_this_month ?? 0) > 0}
              loading={isLoading}
            />
          </Grid>
          <Grid item xs={12} sm={6} lg={3}>
            <MetricCard
              label="Open Disputes"
              value={data?.open_disputes ?? 0}
              icon={AlertTriangle}
              accent={!isLoading && (data?.open_disputes ?? 0) > 0}
              loading={isLoading}
            />
          </Grid>

          <Grid item xs={12} xl={8}>
            <Paper
              sx={{ p: { xs: 2.5, md: 3 }, borderRadius: 1, height: "100%" }}
            >
              <Stack
                direction={{ xs: "column", sm: "row" }}
                spacing={1.5}
                justifyContent="space-between"
                alignItems={{ xs: "flex-start", sm: "center" }}
                sx={{ mb: 3 }}
              >
                <Box>
                  <Typography
                    variant="overline"
                    sx={{ color: "text.secondary" }}
                  >
                    Operational Trends
                  </Typography>
                  <Typography variant="h5" sx={{ mt: 0.5 }}>
                    Shifts vs disputes
                  </Typography>
                </Box>
                <Chip
                  label="Last 6 months"
                  variant="outlined"
                  sx={{
                    borderRadius: 10,
                    borderColor: alpha(theme.palette.primary.main, 0.3),
                    color: "primary.main",
                  }}
                />
              </Stack>

              {isLoading ? (
                <Stack
                  direction="row"
                  spacing={1.5}
                  alignItems="flex-end"
                  sx={{ height: 280, pt: 4 }}
                >
                  {[42, 68, 54, 86, 61, 96].map((height, index) => (
                    <Skeleton
                      key={index}
                      variant="rounded"
                      width="100%"
                      height={`${height}%`}
                      sx={{ flex: 1, borderRadius: 1, transform: "none" }}
                    />
                  ))}
                </Stack>
              ) : (
                <Box sx={{ height: 300 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={data?.monthly_chart ?? []}
                      margin={{ top: 8, right: 8, left: -20, bottom: 0 }}
                      barGap={8}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke={alpha(theme.palette.common.white, 0.08)}
                        vertical={false}
                      />
                      <XAxis
                        dataKey="month"
                        tick={{
                          fill: theme.palette.text.secondary,
                          fontSize: 11,
                          fontFamily: "IBM Plex Mono, monospace",
                        }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        allowDecimals={false}
                        tick={{
                          fill: theme.palette.text.secondary,
                          fontSize: 11,
                          fontFamily: "IBM Plex Mono, monospace",
                        }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        content={<ChartTooltip />}
                        cursor={{
                          fill: alpha(theme.palette.primary.main, 0.08),
                        }}
                      />
                      <Legend
                        wrapperStyle={{
                          fontFamily: "IBM Plex Mono, monospace",
                          fontSize: 11,
                          paddingTop: 12,
                          color: theme.palette.text.secondary,
                        }}
                      />
                      <Bar
                        dataKey="shifts"
                        name="Shifts"
                        fill={theme.palette.primary.main}
                        radius={[10, 10, 0, 0]}
                        maxBarSize={32}
                      />
                      <Bar
                        dataKey="disputes"
                        name="Disputes"
                        fill={theme.palette.error.main}
                        radius={[10, 10, 0, 0]}
                        maxBarSize={32}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </Box>
              )}
            </Paper>
          </Grid>

          <Grid item xs={12} xl={4}>
            <Paper
              sx={{ p: { xs: 2.5, md: 3 }, borderRadius: 1, height: "100%" }}
            >
              <Typography variant="overline" sx={{ color: "text.secondary" }}>
                Quick Access
              </Typography>
              <Typography variant="h5" sx={{ mt: 0.5, mb: 2 }}>
                Common actions
              </Typography>
              <List sx={{ p: 0 }}>
                {quickLinks.map((item) => (
                  <ListItemButton
                    key={item.to}
                    component={RouterLink}
                    to={item.to}
                    sx={{
                      px: 2,
                      py: 1.75,
                      mb: 1.25,
                      border: `1px solid ${alpha(theme.palette.common.white, 0.08)}`,
                      bgcolor: alpha(theme.palette.common.white, 0.02),
                    }}
                  >
                    <ListItemText
                      primary={item.label}
                      secondary={item.sublabel}
                      primaryTypographyProps={{
                        fontWeight: 700,
                        fontFamily: '"IBM Plex Mono", monospace',
                      }}
                      secondaryTypographyProps={{
                        sx: { mt: 0.5, color: "text.secondary" },
                      }}
                    />
                    <ArrowRight size={16} />
                  </ListItemButton>
                ))}
              </List>
            </Paper>
          </Grid>

          <Grid item xs={12}>
            <TableContainer
              component={Paper}
              sx={{ borderRadius: 1, overflow: "hidden" }}
            >
              <Stack
                direction={{ xs: "column", sm: "row" }}
                spacing={1}
                justifyContent="space-between"
                alignItems={{ xs: "flex-start", sm: "center" }}
                sx={{ px: 3, py: 2.5 }}
              >
                <Box>
                  <Typography
                    variant="overline"
                    sx={{ color: "text.secondary" }}
                  >
                    Recent Disputes
                  </Typography>
                  <Typography variant="h5" sx={{ mt: 0.5 }}>
                    Latest flagged shifts
                  </Typography>
                </Box>
                <MuiLink
                  component={RouterLink}
                  to="/workers"
                  underline="none"
                  sx={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 0.75,
                    color: "primary.main",
                    fontFamily: '"IBM Plex Mono", monospace',
                    fontWeight: 600,
                  }}
                >
                  View all workers
                  <ArrowRight size={14} />
                </MuiLink>
              </Stack>

              {isLoading ? (
                <Box sx={{ px: 3, pb: 3 }}>
                  {[0, 1, 2].map((row) => (
                    <Stack
                      key={row}
                      direction="row"
                      spacing={2}
                      sx={{ py: 1.5 }}
                    >
                      <Skeleton variant="rounded" width="26%" height={44} />
                      <Skeleton variant="rounded" width="16%" height={44} />
                      <Skeleton variant="rounded" width="18%" height={44} />
                      <Skeleton variant="rounded" width="16%" height={44} />
                      <Skeleton variant="rounded" width="14%" height={44} />
                    </Stack>
                  ))}
                </Box>
              ) : !data?.recent_disputes?.length ? (
                <Box sx={{ px: 3, pb: 4 }}>
                  <Alert
                    severity="success"
                    sx={{
                      borderRadius: 1,
                      bgcolor: alpha(theme.palette.success.main, 0.1),
                      color: "text.primary",
                      "& .MuiAlert-icon": { color: "success.main" },
                    }}
                  >
                    No disputes found. Wage records look compliant right now.
                  </Alert>
                </Box>
              ) : (
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>Worker</TableCell>
                      <TableCell>Date</TableCell>
                      <TableCell>Occupation</TableCell>
                      <TableCell>Shortfall</TableCell>
                      <TableCell>Status</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {data.recent_disputes.map((dispute) => {
                      const chipProps = statusToChipProps(dispute.status);

                      return (
                        <TableRow
                          key={dispute.shift_id}
                          hover
                          sx={{
                            "& .MuiTableCell-root": {
                              borderColor: alpha(
                                theme.palette.common.white,
                                0.06,
                              ),
                            },
                          }}
                        >
                          <TableCell>
                            <MuiLink
                              component={RouterLink}
                              to={`/workers/${dispute.worker.id}`}
                              underline="none"
                              sx={{
                                color: "text.primary",
                                fontWeight: 700,
                                fontFamily: '"IBM Plex Mono", monospace',
                                "&:hover": {
                                  color: "primary.main",
                                },
                              }}
                            >
                              {dispute.worker.name}
                            </MuiLink>
                            <Typography
                              variant="body2"
                              sx={{ color: "text.secondary", mt: 0.5 }}
                            >
                              {dispute.worker.state}
                            </Typography>
                          </TableCell>
                          <TableCell sx={{ color: "text.secondary" }}>
                            {formatDate(dispute.shift_date)}
                          </TableCell>
                          <TableCell
                            sx={{
                              color: "text.secondary",
                              textTransform: "capitalize",
                            }}
                          >
                            {dispute.worker.occupation}
                          </TableCell>
                          <TableCell
                            sx={{
                              color: "error.main",
                              fontWeight: 700,
                              fontFamily: '"IBM Plex Mono", monospace',
                            }}
                          >
                            {formatCurrency(dispute.shortfall)}
                          </TableCell>
                          <TableCell>
                            <Chip
                              size="small"
                              label={chipProps.label}
                              sx={{
                                borderRadius: 10,
                                ...chipProps.sx,
                              }}
                            />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </TableContainer>
          </Grid>
        </Grid>

        <Typography
          variant="caption"
          sx={{
            display: "block",
            textAlign: "center",
            mt: 3,
            color: "text.secondary",
            pb: 1,
          }}
        >
          Data governed by Minimum Wages Act 1948, Factories Act 1948, and the
          Payment of Wages Act 1936.
        </Typography>
      </Box>
    </Layout>
  );
};

export default Dashboard;
