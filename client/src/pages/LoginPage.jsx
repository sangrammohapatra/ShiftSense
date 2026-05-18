/**
 * pages/LoginPage.jsx — Employer login
 *
 * Flow:
 *  1. Validate email + password via react-hook-form
 *  2. POST /api/v1/auth/login
 *  3. On success → setAuth() in Zustand → navigate to /dashboard
 *     (or back to the originally requested page via location.state.from)
 *  4. On error → react-hot-toast with the server's message
 */

import { useState } from "react";
import {
  Button,
  CircularProgress,
  Divider,
  IconButton,
  Link as MuiLink,
  Stack,
  Typography,
} from "@mui/material";
import { useForm } from "react-hook-form";
import { Link, useLocation, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { Eye, EyeOff } from "lucide-react";

import api from "@/api/axios";
import AuthShell from "@/components/ui/AuthShell";
import FormField from "@/components/ui/FormField";
import useAuthStore from "@/store/authStore";

const LoginPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const setAuth = useAuthStore((state) => state.setAuth);
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const onSubmit = async (formData) => {
    try {
      const response = await api.post("/auth/login", formData);
      const { employer, token } = response.data.data;
      setAuth(employer, token);
      toast.success(`Welcome back, ${employer.contact_name.split(" ")[0]}!`);
      const from = location.state?.from?.pathname || "/dashboard";
      navigate(from, { replace: true });
    } catch (error) {
      toast.error(error.message || "Login failed. Please try again.");
    }
  };

  return (
    <AuthShell>
      <Stack spacing={3}>
        <Stack spacing={1}>
          <Typography variant="h5">Employer Login</Typography>
          <Typography variant="body2" color="text.secondary">
            Access your workforce compliance dashboard.
          </Typography>
        </Stack>

        <Divider />

        <Stack
          component="form"
          spacing={2}
          onSubmit={handleSubmit(onSubmit)}
          noValidate
        >
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

          <FormField
            label="Password"
            id="password"
            type={showPassword ? "text" : "password"}
            placeholder="Enter your password"
            error={errors.password?.message}
            reg={register("password", {
              required: "Password is required.",
              minLength: {
                value: 8,
                message: "Password must be at least 8 characters.",
              },
            })}
            endAdornment={
              <IconButton
                onClick={() => setShowPassword((value) => !value)}
                edge="end"
                tabIndex={-1}
                aria-label={showPassword ? "Hide password" : "Show password"}
                sx={{ color: "text.secondary" }}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </IconButton>
            }
          />

          <Button
            type="submit"
            disabled={isSubmitting}
            variant="contained"
            size="large"
            sx={{ mt: 1, borderRadius: 10, minHeight: 52 }}
            startIcon={
              isSubmitting ? <CircularProgress size={16} color="inherit" /> : null
            }
          >
            {isSubmitting ? "Verifying" : "Log In"}
          </Button>
        </Stack>

        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ textAlign: "center" }}
        >
          No account?{" "}
          <MuiLink
            component={Link}
            to="/register"
            underline="hover"
            sx={{
              color: "primary.main",
              fontFamily: '"IBM Plex Mono", monospace',
              fontWeight: 600,
            }}
          >
            Register your company
          </MuiLink>
        </Typography>
      </Stack>
    </AuthShell>
  );
};

export default LoginPage;
