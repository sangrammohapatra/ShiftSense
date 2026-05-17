/**
 * pages/RegisterPage.jsx — Employer registration
 *
 * Flow:
 *  1. Client-side validation via react-hook-form
 *  2. POST /api/v1/auth/register
 *  3. On success → auto-login (setAuth) → navigate /dashboard
 *  4. Server-side field errors mapped back onto form fields
 */

import { useState } from "react";
import {
  Button,
  Divider,
  Grid,
  IconButton,
  Link as MuiLink,
  MenuItem,
  Stack,
  Typography,
} from "@mui/material";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { Eye, EyeOff, Loader2 } from "lucide-react";

import api from "@/api/axios";
import useAuthStore from "@/store/authStore";
import AuthShell from "@/components/ui/AuthShell";
import FormField from "@/components/ui/FormField";
import { INDIAN_STATES } from "@/constants/india";

const RegisterPage = () => {
  const navigate = useNavigate();
  const setAuth = useAuthStore((state) => state.setAuth);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({
    defaultValues: {
      company_name: "",
      contact_name: "",
      email: "",
      password: "",
      confirm_password: "",
      phone: "",
      state: "",
      gst_number: "",
    },
  });

  const passwordValue = watch("password");

  const onSubmit = async (formData) => {
    const { confirm_password, ...payload } = formData;

    if (!payload.gst_number) {
      delete payload.gst_number;
    }

    try {
      const response = await api.post("/auth/register", payload);
      const { employer, token } = response.data.data;
      setAuth(employer, token);
      toast.success("Account created! Welcome to ShiftSense.");
      navigate("/dashboard", { replace: true });
    } catch (error) {
      const serverErrors = error.response?.data?.errors || [];

      if (serverErrors.length > 0) {
        serverErrors.forEach(({ field, message }) => {
          setError(field, { type: "server", message });
        });
        toast.error("Please fix the highlighted fields.");
        return;
      }

      toast.error(error.message || "Registration failed. Please try again.");
    }
  };

  return (
    <AuthShell>
      <Stack spacing={3}>
        <Stack spacing={1}>
          <Typography variant="h5">Register Company</Typography>
          <Typography variant="body2" color="text.secondary">
            Create your employer account to manage wage compliance.
          </Typography>
        </Stack>

        <Divider />

        <Stack
          component="form"
          spacing={2}
          onSubmit={handleSubmit(onSubmit)}
          noValidate
        >
          <Grid container spacing={2}>
            <Grid item xs={12} md={12} sm={6}>
              <FormField
                label="Company name"
                id="company_name"
                placeholder="Acme Builders Pvt Ltd"
                error={errors.company_name?.message}
                reg={register("company_name", {
                  required: "Company name is required.",
                  maxLength: { value: 150, message: "Max 150 characters." },
                })}
              />
            </Grid>
            <Grid item xs={12} md={12} sm={6}>
              <FormField
                label="Contact name"
                id="contact_name"
                placeholder="Your full name"
                error={errors.contact_name?.message}
                reg={register("contact_name", {
                  required: "Contact name is required.",
                  maxLength: { value: 100, message: "Max 100 characters." },
                })}
              />
            </Grid>
            <Grid item xs={12} md={12} sm={6}>
              <FormField
                label="Email address"
                id="email"
                type="email"
                placeholder="you@company.com"
                error={errors.email?.message}
                reg={register("email", {
                  required: "Email is required.",
                  pattern: {
                    value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                    message: "Enter a valid email address.",
                  },
                })}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormField
                label="Password"
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="Minimum 8 characters"
                error={errors.password?.message}
                reg={register("password", {
                  required: "Password is required.",
                  minLength: { value: 8, message: "Min 8 characters." },
                })}
                endAdornment={
                  <IconButton
                    onClick={() => setShowPassword((value) => !value)}
                    edge="end"
                    tabIndex={-1}
                    aria-label={
                      showPassword ? "Hide password" : "Show password"
                    }
                    sx={{ color: "text.secondary" }}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </IconButton>
                }
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormField
                label="Confirm password"
                id="confirm_password"
                type={showConfirmPassword ? "text" : "password"}
                placeholder="Repeat password"
                error={errors.confirm_password?.message}
                reg={register("confirm_password", {
                  required: "Please confirm your password.",
                  validate: (value) =>
                    value === passwordValue || "Passwords do not match.",
                })}
                endAdornment={
                  <IconButton
                    onClick={() => setShowConfirmPassword((value) => !value)}
                    edge="end"
                    tabIndex={-1}
                    aria-label={
                      showConfirmPassword
                        ? "Hide confirm password"
                        : "Show confirm password"
                    }
                    sx={{ color: "text.secondary" }}
                  >
                    {showConfirmPassword ? (
                      <EyeOff size={18} />
                    ) : (
                      <Eye size={18} />
                    )}
                  </IconButton>
                }
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormField
                label="Phone number"
                id="phone"
                type="tel"
                placeholder="+919876543210"
                error={errors.phone?.message}
                reg={register("phone", {
                  required: "Phone is required.",
                  pattern: {
                    value: /^\+?[1-9]\d{7,14}$/,
                    message: "Enter a valid number.",
                  },
                })}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormField
                label="State"
                id="state"
                select
                error={errors.state?.message}
                reg={register("state", { required: "State is required." })}
              >
                <MenuItem value="">Select state</MenuItem>
                {INDIAN_STATES.map((state) => (
                  <MenuItem key={state.code} value={state.code}>
                    {state.code} - {state.name}
                  </MenuItem>
                ))}
              </FormField>
            </Grid>
            <Grid item xs={12} md={12} sm={6}>
              <FormField
                label="GST number (optional)"
                id="gst_number"
                placeholder="27AAPFU0939F1ZV"
                error={errors.gst_number?.message}
                reg={register("gst_number", {
                  pattern: {
                    value:
                      /^\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}[Z]{1}[A-Z\d]{1}$/,
                    message: "Enter a valid 15-character GSTIN.",
                  },
                  setValueAs: (value) => value.toUpperCase(),
                })}
                inputProps={{
                  style: {
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                  },
                }}
                helperText="Required for GST-registered businesses. Leave blank if not applicable."
              />
            </Grid>
          </Grid>
          <Button
            type="submit"
            disabled={isSubmitting}
            variant="contained"
            size="large"
            sx={{ mt: 1, borderRadius: 10, minHeight: 52 }}
            startIcon={isSubmitting ? <Loader2 size={16} /> : null}
          >
            {isSubmitting ? "Creating account" : "Create Account"}
          </Button>
        </Stack>

        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ textAlign: "center" }}
        >
          Already registered?{" "}
          <MuiLink
            component={Link}
            to="/login"
            underline="hover"
            sx={{
              color: "primary.main",
              fontFamily: '"IBM Plex Mono", monospace',
              fontWeight: 600,
            }}
          >
            Log in
          </MuiLink>
        </Typography>
      </Stack>
    </AuthShell>
  );
};

export default RegisterPage;
