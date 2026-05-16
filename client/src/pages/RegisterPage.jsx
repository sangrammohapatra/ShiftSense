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
  const setAuth = useAuthStore((s) => s.setAuth);

  const [showPwd, setShowPwd] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

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

  // ── Submit ──────────────────────────────────────────────────────────────────
  const onSubmit = async (data) => {
    // Strip confirm_password — server doesn't expect it
    const { confirm_password, ...payload } = data;
    // Remove empty optional fields so the server doesn't receive ""
    if (!payload.gst_number) delete payload.gst_number;

    try {
      const res = await api.post("/auth/register", payload);
      const { employer, token } = res.data.data;
      setAuth(employer, token);
      toast.success("Account created! Welcome to ShiftSense.");
      navigate("/dashboard", { replace: true });
    } catch (err) {
      // Map server field-level errors back onto the form when available
      const serverErrors = err.response?.data?.errors || [];
      if (serverErrors.length > 0) {
        serverErrors.forEach(({ field, message }) => {
          setError(field, { type: "server", message });
        });
        toast.error("Please fix the highlighted fields.");
      } else {
        toast.error(err.message || "Registration failed. Please try again.");
      }
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <AuthShell>
      <div className="mb-6">
        <h1
          className="text-xl font-semibold mb-1"
          style={{
            fontFamily: "var(--font-display)",
            color: "var(--text-primary)",
          }}
        >
          Register Company
        </h1>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Create your employer account to manage wage compliance.
        </p>
      </div>

      <div className="mb-6 h-px" style={{ background: "var(--border)" }} />

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        {/* Row: Company + Contact */}
        <div className="grid grid-cols-2 gap-3">
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
        </div>

        {/* Email */}
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

        {/* Row: Password + Confirm */}
        <div className="grid grid-cols-2 gap-3">
          <FormField
            label="Password"
            id="password"
            type={showPwd ? "text" : "password"}
            placeholder="Min 8 chars"
            error={errors.password?.message}
            reg={register("password", {
              required: "Password is required.",
              minLength: { value: 8, message: "Min 8 characters." },
            })}
          >
            <button
              type="button"
              onClick={() => setShowPwd((v) => !v)}
              tabIndex={-1}
              style={{ color: "var(--text-muted)" }}
              aria-label={showPwd ? "Hide" : "Show"}
            >
              {showPwd ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </FormField>

          <FormField
            label="Confirm password"
            id="confirm_password"
            type={showConfirm ? "text" : "password"}
            placeholder="Repeat password"
            error={errors.confirm_password?.message}
            reg={register("confirm_password", {
              required: "Please confirm your password.",
              validate: (v) => v === passwordValue || "Passwords do not match.",
            })}
          >
            <button
              type="button"
              onClick={() => setShowConfirm((v) => !v)}
              tabIndex={-1}
              style={{ color: "var(--text-muted)" }}
              aria-label={showConfirm ? "Hide" : "Show"}
            >
              {showConfirm ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </FormField>
        </div>

        {/* Row: Phone + State */}
        <div className="grid grid-cols-2 gap-3">
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

          {/* State dropdown — custom styled to match design */}
          <div>
            <label htmlFor="state" className="ss-label">
              State
            </label>
            <select
              id="state"
              className={`ss-input ${errors.state ? "error" : ""}`}
              style={{ cursor: "pointer" }}
              {...register("state", { required: "State is required." })}
            >
              <option value="">Select state</option>
              {INDIAN_STATES.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.code} — {s.name}
                </option>
              ))}
            </select>
            {errors.state && (
              <p className="ss-field-error">{errors.state.message}</p>
            )}
          </div>
        </div>

        {/* GST (optional) */}
        <div>
          <FormField
            label="GST number (optional)"
            id="gst_number"
            placeholder="27AAPFU0939F1ZV"
            error={errors.gst_number?.message}
            reg={register("gst_number", {
              pattern: {
                value: /^\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}[Z]{1}[A-Z\d]{1}$/,
                message: "Enter a valid 15-character GSTIN.",
              },
              setValueAs: (v) => v.toUpperCase(),
            })}
            className="uppercase tracking-widest"
          />
          <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
            Required for GST-registered businesses. Leave blank if not
            applicable.
          </p>
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={isSubmitting}
          className="ss-btn w-full mt-2"
          style={{ letterSpacing: "0.1em" }}
        >
          {isSubmitting ? (
            <>
              <Loader2 size={15} className="animate-spin" /> Creating account…
            </>
          ) : (
            "Create Account"
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
        Already registered?{" "}
        <Link
          to="/login"
          className="font-medium"
          style={{ color: "var(--accent)" }}
        >
          Log in →
        </Link>
      </p>
    </AuthShell>
  );
};

export default RegisterPage;
