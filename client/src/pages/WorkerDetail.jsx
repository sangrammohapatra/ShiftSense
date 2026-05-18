/**
 * pages/WorkerDetail.jsx — Individual worker detail view
 *
 * Three-section layout:
 *   1. Profile card — name, phone, state, occupation, claimed_daily_wage (inline editable)
 *   2. Shift history table — date, hours, OT, gross, claimed, shortfall, status
 *   3. Month summary strip — total shortfall this month in red
 */

import { useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  Grid,
  MenuItem,
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
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import {
  AlertTriangle,
  ArrowLeft,
  Briefcase,
  CalendarDays,
  CheckCircle2,
  Clock,
  MapPin,
  Pencil,
  Phone,
  TrendingDown,
  X,
} from "lucide-react";

import api from "@/api/axios";
import Layout from "@/components/Layout";
import FormField from "@/components/ui/FormField";
import { INDIAN_STATES } from "@/constants/india";
import { OCCUPATION_ENUM } from "@/constants/occupations";

// ─── API ──────────────────────────────────────────────────────────────────────
const fetchWorkerDetail = async (workerId) => {
  const response = await api.get(`/workers/${workerId}`);
  return response.data.data;
};

const fetchShifts = async (workerId, month) => {
  const params = month ? { month } : {};
  const response = await api.get(`/workers/shifts/${workerId}`, { params });
  return response.data.data;
};

const patchWorker = async ({ workerId, updates }) => {
  const response = await api.patch(`/workers/${workerId}`, updates);
  return response.data.data;
};

const formatDate = (value) =>
  new Date(value).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

const formatCurrency = (value) =>
  `₹${Number(value ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

const STATUS_STYLES = {
  logged: { color: "#8cc2ff", bg: "rgba(88,166,255,0.14)", label: "Logged" },
  disputed: { color: "#ff938b", bg: "rgba(248,81,73,0.14)", label: "Disputed" },
  resolved: { color: "#7ee787", bg: "rgba(63,185,80,0.14)", label: "Resolved" },
};

const StatusBadge = ({ status }) => {
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.logged;

  return (
    <Chip
      size="small"
      label={style.label}
      sx={{
        borderRadius: 10,
        bgcolor: style.bg,
        color: style.color,
        fontFamily: '"IBM Plex Mono", monospace',
      }}
    />
  );
};

const InfoCard = ({ icon: Icon, label, value }) => (
  <Paper sx={{ p: 2, borderRadius: 1, bgcolor: "rgba(255,255,255,0.03)" }}>
    <Stack direction="row" spacing={1.25} alignItems="center">
      <Icon size={16} />
      <Box>
        <Typography variant="overline" color="text.secondary">
          {label}
        </Typography>
        <Typography sx={{ fontFamily: '"IBM Plex Mono", monospace', fontWeight: 700 }}>
          {value || "—"}
        </Typography>
      </Box>
    </Stack>
  </Paper>
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
    onError: (error) => toast.error(error.message),
  });

  return (
    <Stack
      component="form"
      spacing={2}
      onSubmit={handleSubmit((updates) => mutation.mutate(updates))}
      noValidate
    >
      <Grid container spacing={2}>
        <Grid item xs={12} sm={6}>
          <FormField
            label="Name"
            id="ew_name"
            error={errors.name?.message}
            reg={register("name", {
              required: "Name is required.",
              maxLength: { value: 100, message: "Max 100 chars." },
            })}
          />
        </Grid>
        <Grid item xs={12} sm={6}>
          <FormField label="State" id="ew_state" select reg={register("state")}>
            <MenuItem value="">Select state</MenuItem>
            {INDIAN_STATES.map((state) => (
              <MenuItem key={state.code} value={state.code}>
                {state.code} - {state.name}
              </MenuItem>
            ))}
          </FormField>
        </Grid>
      </Grid>

      <Grid container spacing={2}>
        <Grid item xs={12} sm={6}>
          <FormField label="Occupation" id="ew_occ" select reg={register("occupation")}>
            <MenuItem value="">Select occupation</MenuItem>
            {OCCUPATION_ENUM.map((occupation) => (
              <MenuItem
                key={occupation}
                value={occupation}
                sx={{ textTransform: "capitalize" }}
              >
                {occupation}
              </MenuItem>
            ))}
          </FormField>
        </Grid>
        <Grid item xs={12} sm={6}>
          <FormField
            label="Claimed daily wage (₹)"
            id="ew_wage"
            type="number"
            placeholder="e.g. 500"
            error={errors.claimed_daily_wage?.message}
            reg={register("claimed_daily_wage", {
              min: { value: 0, message: "Must be 0 or more." },
              valueAsNumber: true,
            })}
          />
        </Grid>
      </Grid>

      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
        <Button
          type="submit"
          disabled={!isDirty || isSubmitting || mutation.isPending}
          variant="contained"
          startIcon={<CheckCircle2 size={16} />}
          sx={{ flex: 1, borderRadius: 10 }}
        >
          Save Changes
        </Button>
        <Button
          type="button"
          onClick={onCancel}
          variant="outlined"
          color="inherit"
          startIcon={<X size={16} />}
          sx={{ borderRadius: 10 }}
        >
          Cancel
        </Button>
      </Stack>
    </Stack>
  );
};

const WorkerDetail = () => {
  const theme = useTheme();
  const { id: workerId } = useParams();
  const navigate = useNavigate();
  const [editMode, setEditMode] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState("");

  const { data: detailData, isLoading: detailLoading } = useQuery({
    queryKey: ["worker-detail", workerId],
    queryFn: () => fetchWorkerDetail(workerId),
    enabled: Boolean(workerId),
  });

  const { data: shiftData, isLoading: shiftsLoading } = useQuery({
    queryKey: ["worker-shifts", workerId, selectedMonth],
    queryFn: () => fetchShifts(workerId, selectedMonth),
    enabled: Boolean(workerId),
  });

  const worker = detailData?.worker;
  const shifts = shiftData?.shifts ?? [];

  const monthOptions = Array.from({ length: 6 }, (_, index) => {
    const date = new Date();
    date.setMonth(date.getMonth() - index);
    const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const label = date.toLocaleDateString("en-IN", {
      month: "long",
      year: "numeric",
    });

    return { value, label };
  });

  const monthlyShortfall = shiftData?.monthly_shortfall ?? 0;

  return (
    <Layout>
      <Box sx={{ maxWidth: 1220, mx: "auto", px: { xs: 2, md: 3 }, py: { xs: 3, md: 4 } }}>
        <Stack spacing={3}>
          <Stack direction="row" spacing={2} alignItems="center">
            <Button
              onClick={() => navigate("/workers")}
              variant="outlined"
              color="inherit"
              startIcon={<ArrowLeft size={16} />}
              sx={{ borderRadius: 10 }}
            >
              Back
            </Button>
            <Box>
              {detailLoading ? (
                <Skeleton variant="text" width={180} height={40} />
              ) : (
                <Typography variant="h4">{worker?.name ?? "Worker"}</Typography>
              )}
              <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: "block" }}>
                Worker detail · ID: {workerId?.slice(-8).toUpperCase()}
              </Typography>
            </Box>
          </Stack>

          {!detailLoading && monthlyShortfall > 0 ? (
            <Alert
              severity="error"
              icon={<AlertTriangle size={18} />}
              sx={{
                borderRadius: 1,
                bgcolor: alpha(theme.palette.error.main, 0.08),
              }}
            >
              Shortfall this month: {formatCurrency(monthlyShortfall)}. Wages below
              statutory minimum detected.
            </Alert>
          ) : null}

          <Paper sx={{ p: { xs: 2.5, md: 3 }, borderRadius: 1 }}>
            <Stack
              direction={{ xs: "column", sm: "row" }}
              spacing={2}
              justifyContent="space-between"
              alignItems={{ xs: "flex-start", sm: "center" }}
              sx={{ mb: 3 }}
            >
              <Typography variant="overline" color="text.secondary">
                Worker Profile
              </Typography>
              {!editMode ? (
                <Button
                  onClick={() => setEditMode(true)}
                  variant="outlined"
                  startIcon={<Pencil size={16} />}
                  sx={{ borderRadius: 10 }}
                >
                  Edit
                </Button>
              ) : null}
            </Stack>

            {detailLoading ? (
              <Grid container spacing={2}>
                {[0, 1, 2, 3].map((card) => (
                  <Grid key={card} item xs={12} sm={6} md={3}>
                    <Skeleton variant="rounded" height={88} />
                  </Grid>
                ))}
              </Grid>
            ) : editMode ? (
              <EditProfileForm
                worker={worker}
                workerId={workerId}
                onSaved={() => setEditMode(false)}
                onCancel={() => setEditMode(false)}
              />
            ) : (
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6} md={3}>
                  <InfoCard icon={Phone} label="Phone" value={worker?.phone_number} />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <InfoCard icon={MapPin} label="State" value={worker?.state} />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <InfoCard icon={Briefcase} label="Occupation" value={worker?.occupation} />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <InfoCard
                    icon={TrendingDown}
                    label="Claimed/Day"
                    value={worker?.claimed_daily_wage ? `₹${worker.claimed_daily_wage}` : "Not set"}
                  />
                </Grid>
              </Grid>
            )}
          </Paper>

          <Stack
            direction={{ xs: "column", md: "row" }}
            spacing={2}
            justifyContent="space-between"
            alignItems={{ xs: "flex-start", md: "center" }}
          >
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} alignItems={{ sm: "center" }}>
              <Stack direction="row" spacing={1} alignItems="center">
                <CalendarDays size={16} color={theme.palette.text.secondary} />
                <Typography variant="body2" color="text.secondary">
                  {selectedMonth
                    ? `${shiftData?.total ?? 0} shifts in selected month`
                    : `${shiftData?.total ?? 0} shifts in the last 90 days`}
                </Typography>
              </Stack>
              {shiftData?.monthly_gross > 0 ? (
                <Chip
                  label={`Gross this month: ${formatCurrency(shiftData.monthly_gross)}`}
                  variant="outlined"
                  sx={{ borderRadius: 10, color: "primary.main", borderColor: alpha(theme.palette.primary.main, 0.28) }}
                />
              ) : null}
            </Stack>

            <FormField
              label="Period"
              id="month_filter"
              select
              textFieldProps={{ sx: { minWidth: { xs: "100%", md: 240 } } }}
              reg={{
                name: "month_filter",
                value: selectedMonth,
                onChange: (event) => setSelectedMonth(event.target.value),
              }}
            >
              <MenuItem value="">Last 90 days</MenuItem>
              {monthOptions.map((month) => (
                <MenuItem key={month.value} value={month.value}>
                  {month.label}
                </MenuItem>
              ))}
            </FormField>
          </Stack>

          <TableContainer component={Paper} sx={{ borderRadius: 1, overflow: "hidden" }}>
            <Box sx={{ px: 3, py: 2.5, borderBottom: "1px solid", borderColor: "divider" }}>
              <Typography variant="overline" color="text.secondary">
                Shift History
              </Typography>
            </Box>

            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Date</TableCell>
                  <TableCell>Hours</TableCell>
                  <TableCell>OT hrs</TableCell>
                  <TableCell>Gross Owed</TableCell>
                  <TableCell>Claimed</TableCell>
                  <TableCell>Shortfall</TableCell>
                  <TableCell>Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {shiftsLoading ? (
                  [0, 1, 2, 3, 4].map((row) => (
                    <TableRow key={row}>
                      {[0, 1, 2, 3, 4, 5, 6].map((cell) => (
                        <TableCell key={cell}>
                          <Skeleton variant="text" width={90} />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : shifts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} sx={{ py: 8, textAlign: "center", color: "text.secondary" }}>
                      No shifts found for the selected period.
                    </TableCell>
                  </TableRow>
                ) : (
                  shifts.map((shift) => (
                    <TableRow key={shift._id} hover>
                      <TableCell sx={{ color: "text.secondary" }}>
                        {formatDate(shift.shift_date)}
                      </TableCell>
                      <TableCell>
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Clock size={14} color={theme.palette.text.secondary} />
                          <Typography variant="body2">{shift.hours_worked}h</Typography>
                        </Stack>
                      </TableCell>
                      <TableCell sx={{ color: shift.ot_hours > 0 ? "primary.main" : "text.secondary" }}>
                        {shift.ot_hours > 0 ? `+${shift.ot_hours}h` : "—"}
                      </TableCell>
                      <TableCell sx={{ fontFamily: '"IBM Plex Mono", monospace', fontWeight: 700 }}>
                        {formatCurrency(shift.gross_owed)}
                      </TableCell>
                      <TableCell sx={{ color: shift.claimed_amount > 0 ? "text.secondary" : "text.disabled" }}>
                        {shift.claimed_amount > 0 ? formatCurrency(shift.claimed_amount) : "—"}
                      </TableCell>
                      <TableCell
                        sx={{
                          fontFamily: '"IBM Plex Mono", monospace',
                          fontWeight: 700,
                          color:
                            shift.shortfall > 50
                              ? "error.main"
                              : shift.shortfall > 0
                                ? "warning.main"
                                : "text.secondary",
                        }}
                      >
                        {shift.shortfall > 0 ? formatCurrency(shift.shortfall) : "—"}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={shift.status} />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Stack>
      </Box>
    </Layout>
  );
};

export default WorkerDetail;
