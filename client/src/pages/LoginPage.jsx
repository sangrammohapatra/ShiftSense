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
import { useForm } from "react-hook-form";
import { Link, useNavigate, useLocation } from "react-router-dom";
import toast from "react-hot-toast";
import { Eye, EyeOff, Loader2 } from "lucide-react";

import api from "@/api/axios";
import useAuthStore from "@/store/authStore";
import AuthShell from "@/components/ui/AuthShell";
import FormField from "@/components/ui/FormField";

const LoginPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const setAuth = useAuthStore((s) => s.setAuth);

  const [showPwd, setShowPwd] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ defaultValues: { email: "", password: "" } });

  // ── Submit ──────────────────────────────────────────────────────────────────
  const onSubmit = async (data) => {
    try {
      const res = await api.post("/auth/login", data);
      const { employer, token } = res.data.data;
      setAuth(employer, token);
      toast.success(`Welcome back, ${employer.contact_name.split(" ")[0]}!`);
      const from = location.state?.from?.pathname || "/dashboard";
      navigate(from, { replace: true });
    } catch (err) {
      toast.error(err.message || "Login failed. Please try again.");
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <AuthShell>
      <div className="mb-8">
        <h1
          className="text-xl font-semibold mb-1"
          style={{
            fontFamily: "var(--font-display)",
            color: "var(--text-primary)",
          }}
        >
          Employer Login
        </h1>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Access your workforce compliance dashboard.
        </p>
      </div>

      <div className="mb-6 h-px" style={{ background: "var(--border)" }} />

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
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
          type={showPwd ? "text" : "password"}
          placeholder="••••••••"
          error={errors.password?.message}
          reg={register("password", {
            required: "Password is required.",
            minLength: {
              value: 8,
              message: "Password must be at least 8 characters.",
            },
          })}
        >
          <button
            type="button"
            onClick={() => setShowPwd((v) => !v)}
            className="p-1 rounded transition-colors"
            style={{ color: "var(--text-muted)" }}
            tabIndex={-1}
            aria-label={showPwd ? "Hide password" : "Show password"}
          >
            {showPwd ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </FormField>

        <button
          type="submit"
          disabled={isSubmitting}
          className="ss-btn w-full mt-2"
          style={{ letterSpacing: "0.1em" }}
        >
          {isSubmitting ? (
            <>
              <Loader2 size={15} className="animate-spin" /> Verifying…
            </>
          ) : (
            "Log In"
          )}
        </button>
      </form>

      <p
        className="mt-6 text-center text-xs"
        style={{
          color: "var(--text-secondary)",
          fontFamily: "var(--font-display)",
        }}
      >
        No account?{" "}
        <Link
          to="/register"
          className="font-medium transition-colors"
          style={{ color: "var(--accent)" }}
        >
          Register your company →
        </Link>
      </p>
    </AuthShell>
  );
};

export default LoginPage;
