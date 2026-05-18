/**
 * pages/ProfilePage.jsx — Employer profile view + edit
 *
 * Flow:
 *  - On mount: GET /api/v1/auth/me via react-query (cached, refetched on focus)
 *  - Display company info in a structured read-only card
 *  - "Edit" button toggles an inline form pre-filled with current values
 *  - PATCH /api/v1/auth/me on save → invalidate query → exit edit mode
 *  - Plan badge + worker_count displayed prominently
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
  Typography,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import toast from "react-hot-toast";
import {
  Building2,
  CheckCircle2,
  FileText,
  Mail,
  MapPin,
  Pencil,
  Phone,
  User,
  Users,
  X,
} from "lucide-react";

import api from "@/api/axios";
import Layout from "@/components/Layout";
import FormField from "@/components/ui/FormField";
import { INDIAN_STATES } from "@/constants/india";

const fetchProfile = async () => {
  const response = await api.get("/auth/me");
  return response.data.data.employer;
};

const ReadOnlyRow = ({ icon: Icon, label, value, divider = true }) => (
  <Stack
    direction="row"
    spacing={1.5}
    alignItems="flex-start"
    sx={{
      py: 2,
      borderBottom: divider ? "1px solid" : "none",
      borderColor: "divider",
    }}
  >
    <Box sx={{ color: "text.secondary", pt: 0.25 }}>
      <Icon size={16} />
    </Box>
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="overline" sx={{ color: "text.secondary" }}>
        {label}
      </Typography>
      <Typography variant="body1" sx={{ fontWeight: 600, wordBreak: "break-word" }}>
        {value || "—"}
      </Typography>
    </Box>
  </Stack>
);

const PlanBadge = ({ plan }) => {
  const isPro = String(plan).toLowerCase() === "pro";

  return (
    <Chip
      size="small"
      label={isPro ? "PRO" : "FREE"}
      color={isPro ? "primary" : "default"}
      sx={{
        borderRadius: 10,
        fontFamily: '"IBM Plex Mono", monospace',
        fontWeight: 700,
      }}
    />
  );
};

// ─── Edit form ────────────────────────────────────────────────────────────────
const EditForm = ({ employer, onCancel, onSaved }) => {
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting, isDirty },
  } = useForm({
    defaultValues: {
      company_name: employer.company_name || "",
      contact_name: employer.contact_name || "",
      phone: employer.phone || "",
      gst_number: employer.gst_number || "",
      state: employer.state || "",
    },
  });

  const onSubmit = async (data) => {
    const payload = Object.fromEntries(Object.entries(data).filter(([, value]) => value !== ""));

    try {
      await api.patch("/auth/me", payload);
      await queryClient.invalidateQueries({ queryKey: ["profile"] });
      toast.success("Profile updated.");
      onSaved();
    } catch (error) {
      toast.error(error.message || "Update failed. Please try again.");
    }
  };

  return (
    <Stack component="form" spacing={2} onSubmit={handleSubmit(onSubmit)} noValidate>
      <Grid container spacing={2}>
        <Grid item xs={12} sm={6}>
          <FormField
            label="Company name"
            id="edit_company_name"
            error={errors.company_name?.message}
            reg={register("company_name", {
              required: "Company name is required.",
              maxLength: { value: 150, message: "Max 150 characters." },
            })}
          />
        </Grid>
        <Grid item xs={12} sm={6}>
          <FormField
            label="Contact name"
            id="edit_contact_name"
            error={errors.contact_name?.message}
            reg={register("contact_name", {
              required: "Contact name is required.",
              maxLength: { value: 100, message: "Max 100 characters." },
            })}
          />
        </Grid>
      </Grid>

      <Grid container spacing={2}>
        <Grid item xs={12} sm={6}>
          <FormField
            label="Phone"
            id="edit_phone"
            type="tel"
            error={errors.phone?.message}
            reg={register("phone", {
              pattern: {
                value: /^\+?[1-9]\d{7,14}$/,
                message: "Enter a valid phone number.",
              },
            })}
          />
        </Grid>
        <Grid item xs={12} sm={6}>
          <FormField
            label="State"
            id="edit_state"
            select
            error={errors.state?.message}
            reg={register("state")}
          >
            <MenuItem value="">Select state</MenuItem>
            {INDIAN_STATES.map((state) => (
              <MenuItem key={state.code} value={state.code}>
                {state.code} - {state.name}
              </MenuItem>
            ))}
          </FormField>
        </Grid>
      </Grid>

      <FormField
        label="GST number (optional)"
        id="edit_gst_number"
        placeholder="27AAPFU0939F1ZV"
        error={errors.gst_number?.message}
        reg={register("gst_number", {
          pattern: {
            value: /^\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}[Z]{1}[A-Z\d]{1}$/,
            message: "Enter a valid 15-character GSTIN.",
          },
          setValueAs: (value) => value?.toUpperCase() || "",
        })}
        inputProps={{ style: { textTransform: "uppercase", letterSpacing: "0.08em" } }}
      />

      <Typography variant="caption" color="text.secondary">
        Email and password can only be changed via account settings.
      </Typography>

      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
        <Button
          type="submit"
          disabled={isSubmitting || !isDirty}
          variant="contained"
          startIcon={<CheckCircle2 size={16} />}
          sx={{ flex: 1, borderRadius: 10, minHeight: 48 }}
        >
          Save Changes
        </Button>
        <Button
          type="button"
          disabled={isSubmitting}
          variant="outlined"
          color="inherit"
          startIcon={<X size={16} />}
          onClick={onCancel}
          sx={{ borderRadius: 10, minHeight: 48 }}
        >
          Cancel
        </Button>
      </Stack>
    </Stack>
  );
};

// ─── Skeleton loader ──────────────────────────────────────────────────────────
const ProfileSkeleton = () => (
  <Stack spacing={2}>
    {[0, 1, 2, 3, 4].map((item) => (
      <Stack
        key={item}
        direction="row"
        spacing={2}
        alignItems="center"
        sx={{ py: 1.5, borderBottom: "1px solid", borderColor: "divider" }}
      >
        <Skeleton variant="circular" width={18} height={18} />
        <Box sx={{ flex: 1 }}>
          <Skeleton variant="text" width={90} />
          <Skeleton variant="text" width="50%" height={30} />
        </Box>
      </Stack>
    ))}
  </Stack>
);

// ─── Main page ────────────────────────────────────────────────────────────────
const ProfilePage = () => {
  const theme = useTheme();
  const [editMode, setEditMode] = useState(false);

  const { data: employer, isLoading, isError, error } = useQuery({
    queryKey: ["profile"],
    queryFn: fetchProfile,
  });

  const stateName = employer
    ? INDIAN_STATES.find((state) => state.code === employer.state)?.name ?? employer.state
    : null;

  if (isError) {
    return (
      <Layout>
        <Box sx={{ maxWidth: 720, mx: "auto", px: 3, py: 5 }}>
          <Alert severity="error" sx={{ borderRadius: 1 }}>
            {error?.message || "Failed to load profile."}
          </Alert>
        </Box>
      </Layout>
    );
  }

  return (
    <Layout>
      <Box sx={{ maxWidth: 980, mx: "auto", px: { xs: 2, md: 3 }, py: { xs: 3, md: 4 } }}>
        <Stack spacing={3}>
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={2}
            justifyContent="space-between"
            alignItems={{ xs: "flex-start", sm: "center" }}
          >
            <Box>
              <Typography variant="h4">Company Profile</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Manage your account information and billing plan.
              </Typography>
            </Box>

            {!isLoading && !editMode ? (
              <Button
                onClick={() => setEditMode(true)}
                variant="outlined"
                startIcon={<Pencil size={16} />}
                sx={{ borderRadius: 10 }}
              >
                Edit Profile
              </Button>
            ) : null}
          </Stack>

          {!isLoading && employer ? (
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <Paper
                  sx={{
                    p: 2.5,
                    borderRadius: 1,
                    borderColor:
                      employer.plan === "pro"
                        ? alpha(theme.palette.primary.main, 0.28)
                        : "divider",
                  }}
                >
                  <Typography variant="overline" color="text.secondary">
                    Current plan
                  </Typography>
                  <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mt: 1.5 }}>
                    <PlanBadge plan={employer.plan} />
                  </Stack>
                </Paper>
              </Grid>

              <Grid item xs={12} sm={6}>
                <Paper sx={{ p: 2.5, borderRadius: 1 }}>
                  <Typography variant="overline" color="text.secondary">
                    Linked workers
                  </Typography>
                  <Stack direction="row" alignItems="center" spacing={1.25} sx={{ mt: 1.5 }}>
                    <Users size={18} color={theme.palette.primary.main} />
                    <Typography variant="h4">{employer.worker_count ?? 0}</Typography>
                  </Stack>
                </Paper>
              </Grid>
            </Grid>
          ) : null}

          <Paper sx={{ p: { xs: 2.5, md: 3 }, borderRadius: 1 }}>
            {isLoading ? (
              <ProfileSkeleton />
            ) : editMode ? (
              <Stack spacing={2.5}>
                <Typography variant="overline" color="primary.main">
                  Editing profile
                </Typography>
                <EditForm
                  employer={employer}
                  onCancel={() => setEditMode(false)}
                  onSaved={() => setEditMode(false)}
                />
              </Stack>
            ) : (
              <Box>
                <ReadOnlyRow icon={Building2} label="Company name" value={employer.company_name} />
                <ReadOnlyRow icon={User} label="Contact name" value={employer.contact_name} />
                <ReadOnlyRow icon={Mail} label="Email address" value={employer.email} />
                <ReadOnlyRow icon={Phone} label="Phone" value={employer.phone} />
                <ReadOnlyRow icon={MapPin} label="State" value={stateName} />
                <ReadOnlyRow icon={FileText} label="GST number" value={employer.gst_number} />
                <ReadOnlyRow
                  icon={Building2}
                  label="Member since"
                  divider={false}
                  value={
                    employer.created_at
                      ? new Date(employer.created_at).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        })
                      : "—"
                  }
                />
              </Box>
            )}
          </Paper>
        </Stack>
      </Box>
    </Layout>
  );
};

export default ProfilePage;
