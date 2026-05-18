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
import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  Grid,
  IconButton,
  InputAdornment,
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
  TextField,
  Typography,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import {
  ChevronRight,
  Filter,
  Loader2,
  MapPin,
  Phone,
  Search,
  UserMinus,
  UserPlus,
  X,
} from "lucide-react";

import api from "@/api/axios";
import Layout from "@/components/Layout";
import FormField from "@/components/ui/FormField";
import { INDIAN_STATES } from "@/constants/india";
import { OCCUPATION_ENUM } from "@/constants/occupations";

const fetchWorkers = async (params) => {
  const response = await api.get("/workers", { params });
  return response.data.data;
};

const linkWorker = async (phoneNumber) => {
  const response = await api.post("/workers/link", { phone_number: phoneNumber });
  return response.data.data;
};

const unlinkWorker = async (workerId) => {
  const response = await api.delete(`/workers/unlink/${workerId}`);
  return response.data.data;
};

const OCCUPATION_COLORS = {
  construction: { bg: "rgba(88, 166, 255, 0.12)", color: "#8cc2ff" },
  security: { bg: "rgba(63, 185, 80, 0.12)", color: "#7ee787" },
  domestic: { bg: "rgba(240, 165, 0, 0.12)", color: "#ffd35f" },
  factory: { bg: "rgba(188, 140, 255, 0.12)", color: "#d5b6ff" },
  driver: { bg: "rgba(255, 123, 88, 0.12)", color: "#ffab91" },
};

const OccupationBadge = ({ occupation }) => {
  const style = OCCUPATION_COLORS[occupation] ?? {
    bg: "rgba(255,255,255,0.06)",
    color: "#98a6b7",
  };

  return (
    <Chip
      size="small"
      label={occupation ?? "—"}
      sx={{
        textTransform: "capitalize",
        borderRadius: 10,
        bgcolor: style.bg,
        color: style.color,
        fontFamily: '"IBM Plex Mono", monospace',
      }}
    />
  );
};

const LinkWorkerDialog = ({ open, onClose }) => {
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    defaultValues: {
      phone_number: "",
    },
  });

  const mutation = useMutation({
    mutationFn: (formData) => linkWorker(formData.phone_number),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ["workers"] });
      toast.success(`${response.worker?.name ?? "Worker"} linked successfully!`);
      onClose();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle sx={{ pr: 6 }}>
        <Typography variant="h6">Link a Worker</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          The worker must be registered on WhatsApp first. Enter their phone number
          to link them to your account.
        </Typography>
        <IconButton
          onClick={onClose}
          sx={{ position: "absolute", right: 16, top: 16, color: "text.secondary" }}
        >
          <X size={18} />
        </IconButton>
      </DialogTitle>
      <DialogContent>
        <Stack
          component="form"
          spacing={2}
          onSubmit={handleSubmit((formData) => mutation.mutate(formData))}
          noValidate
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
            helperText="Include the country code (+91 for India)."
          />

          <Button
            type="submit"
            disabled={isSubmitting || mutation.isPending}
            variant="contained"
            size="large"
            startIcon={
              isSubmitting || mutation.isPending ? (
                <Loader2 size={16} />
              ) : (
                <UserPlus size={16} />
              )
            }
            sx={{ borderRadius: 10, minHeight: 50 }}
          >
            {isSubmitting || mutation.isPending ? "Linking" : "Link Worker"}
          </Button>
        </Stack>
      </DialogContent>
    </Dialog>
  );
};

const UnlinkAction = ({ workerId, workerName, onStop }) => {
  const [confirming, setConfirming] = useState(false);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => unlinkWorker(workerId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workers"] });
      toast.success(`${workerName} unlinked.`);
      setConfirming(false);
    },
    onError: (error) => {
      toast.error(error.message);
      setConfirming(false);
    },
  });

  if (confirming) {
    return (
      <Stack direction="row" spacing={1} alignItems="center">
        <Typography variant="caption" color="text.secondary">
          Sure?
        </Typography>
        <Button
          size="small"
          color="error"
          variant="contained"
          onClick={(event) => {
            onStop(event);
            mutation.mutate();
          }}
          sx={{ minWidth: 0, borderRadius: 10, px: 1.5 }}
        >
          Yes
        </Button>
        <Button
          size="small"
          variant="outlined"
          color="inherit"
          onClick={(event) => {
            onStop(event);
            setConfirming(false);
          }}
          sx={{ minWidth: 0, borderRadius: 10, px: 1.5 }}
        >
          No
        </Button>
      </Stack>
    );
  }

  return (
    <Button
      size="small"
      variant="outlined"
      color="inherit"
      startIcon={<UserMinus size={14} />}
      onClick={(event) => {
        onStop(event);
        setConfirming(true);
      }}
      sx={{ borderRadius: 10 }}
    >
      Unlink
    </Button>
  );
};

// ─── Page ─────────────────────────────────────────────────────────────────────
const WorkerList = () => {
  const theme = useTheme();
  const navigate = useNavigate();
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [search, setSearch] = useState("");
  const [filterState, setFilterState] = useState("");
  const [filterOccupation, setFilterOccupation] = useState("");

  const queryParams = {};
  if (search) queryParams.search = search;
  if (filterState) queryParams.state = filterState;
  if (filterOccupation) queryParams.occupation = filterOccupation;

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["workers", queryParams],
    queryFn: () => fetchWorkers(queryParams),
    staleTime: 60_000,
  });

  const workers = data?.workers ?? [];

  return (
    <Layout>
      <Box sx={{ maxWidth: 1360, mx: "auto", px: { xs: 2, md: 3 }, py: { xs: 3, md: 4 } }}>
        <Stack spacing={3}>
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={2}
            justifyContent="space-between"
            alignItems={{ xs: "flex-start", sm: "center" }}
          >
            <Box>
              <Typography variant="h4">Workers</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                {isLoading ? "Loading..." : `${data?.count ?? 0} linked workers`}
              </Typography>
            </Box>
            <Button
              onClick={() => setShowLinkDialog(true)}
              variant="contained"
              startIcon={<UserPlus size={16} />}
              sx={{ borderRadius: 10 }}
            >
              Link Worker
            </Button>
          </Stack>

          <Paper sx={{ p: 2.5, borderRadius: 1 }}>
            <Grid container spacing={2} alignItems="center">
              <Grid item xs={12} md={5}>
                <TextField
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search by name"
                  fullWidth
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <Search size={16} color={theme.palette.text.secondary} />
                      </InputAdornment>
                    ),
                  }}
                />
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <TextField
                  select
                  fullWidth
                  label="State"
                  value={filterState}
                  onChange={(event) => setFilterState(event.target.value)}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <Filter size={16} color={theme.palette.text.secondary} />
                      </InputAdornment>
                    ),
                  }}
                >
                  <MenuItem value="">All states</MenuItem>
                  {INDIAN_STATES.map((state) => (
                    <MenuItem key={state.code} value={state.code}>
                      {state.code} - {state.name}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <TextField
                  select
                  fullWidth
                  label="Occupation"
                  value={filterOccupation}
                  onChange={(event) => setFilterOccupation(event.target.value)}
                >
                  <MenuItem value="">All occupations</MenuItem>
                  {OCCUPATION_ENUM.map((occupation) => (
                    <MenuItem key={occupation} value={occupation} sx={{ textTransform: "capitalize" }}>
                      {occupation}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid item xs={12} md={1}>
                <Button
                  fullWidth
                  variant="outlined"
                  color="inherit"
                  onClick={() => {
                    setSearch("");
                    setFilterState("");
                    setFilterOccupation("");
                  }}
                  disabled={!search && !filterState && !filterOccupation}
                  sx={{ borderRadius: 10, minHeight: 56 }}
                >
                  Clear
                </Button>
              </Grid>
            </Grid>
          </Paper>

          {isError ? (
            <Alert severity="error" sx={{ borderRadius: 1 }}>
              {error?.message ?? "Failed to load workers."}
            </Alert>
          ) : null}

          <TableContainer component={Paper} sx={{ borderRadius: 1, overflow: "hidden" }}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Phone</TableCell>
                  <TableCell>State</TableCell>
                  <TableCell>Occupation</TableCell>
                  <TableCell>Claimed Wage/Day</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {isLoading ? (
                  [0, 1, 2, 3].map((row) => (
                    <TableRow key={row}>
                      {[0, 1, 2, 3, 4, 5].map((cell) => (
                        <TableCell key={cell}>
                          <Skeleton variant="text" width={cell === 0 ? 160 : 100} />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : workers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} sx={{ py: 8, textAlign: "center", color: "text.secondary" }}>
                      {search || filterState || filterOccupation
                        ? "No workers match your filters."
                        : 'No workers linked yet. Click "Link Worker" to get started.'}
                    </TableCell>
                  </TableRow>
                ) : (
                  workers.map((worker) => (
                    <TableRow
                      key={worker._id}
                      hover
                      onClick={() => navigate(`/workers/${worker._id}`)}
                      sx={{
                        cursor: "pointer",
                        "& .MuiTableCell-root": {
                          borderColor: alpha(theme.palette.common.white, 0.06),
                        },
                      }}
                    >
                      <TableCell>
                        <Stack direction="row" spacing={1.5} alignItems="center">
                          <Avatar
                            sx={{
                              width: 34,
                              height: 34,
                              bgcolor: "primary.main",
                              color: "primary.contrastText",
                              fontFamily: '"IBM Plex Mono", monospace',
                            }}
                          >
                            {(worker.name ?? "?").charAt(0).toUpperCase()}
                          </Avatar>
                          <Box>
                            <Typography
                              sx={{
                                fontFamily: '"IBM Plex Mono", monospace',
                                fontWeight: 700,
                              }}
                            >
                              {worker.name ?? "—"}
                            </Typography>
                            {!worker.is_verified ? (
                              <Typography variant="caption" color="text.secondary">
                                Unverified
                              </Typography>
                            ) : null}
                          </Box>
                        </Stack>
                      </TableCell>
                      <TableCell>
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Phone size={14} color={theme.palette.text.secondary} />
                          <Typography variant="body2" color="text.secondary">
                            {worker.phone_number}
                          </Typography>
                        </Stack>
                      </TableCell>
                      <TableCell>
                        <Stack direction="row" spacing={1} alignItems="center">
                          <MapPin size={14} color={theme.palette.text.secondary} />
                          <Typography variant="body2" color="text.secondary">
                            {worker.state ?? "—"}
                          </Typography>
                        </Stack>
                      </TableCell>
                      <TableCell>
                        <OccupationBadge occupation={worker.occupation} />
                      </TableCell>
                      <TableCell>
                        <Typography
                          variant="body2"
                          sx={{
                            color: worker.claimed_daily_wage ? "text.primary" : "text.secondary",
                            fontFamily: '"IBM Plex Mono", monospace',
                          }}
                        >
                          {worker.claimed_daily_wage ? `₹${worker.claimed_daily_wage}/day` : "Not set"}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Stack direction="row" spacing={1} justifyContent="flex-end" alignItems="center">
                          <UnlinkAction
                            workerId={worker._id}
                            workerName={worker.name ?? "Worker"}
                            onStop={(event) => event.stopPropagation()}
                          />
                          <ChevronRight size={16} color={theme.palette.text.secondary} />
                        </Stack>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Stack>
      </Box>

      <LinkWorkerDialog open={showLinkDialog} onClose={() => setShowLinkDialog(false)} />
    </Layout>
  );
};

export default WorkerList;
