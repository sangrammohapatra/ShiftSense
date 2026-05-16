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
import { useForm } from "react-hook-form";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  Building2,
  User,
  Mail,
  Phone,
  MapPin,
  FileText,
  Users,
  Pencil,
  X,
  Loader2,
  CheckCircle2,
} from "lucide-react";

import api from "@/api/axios";
import FormField from "@/components/ui/FormField";
import { INDIAN_STATES } from "@/constants/india";

// ─── Data fetcher ─────────────────────────────────────────────────────────────
const fetchProfile = async () => {
  const res = await api.get("/auth/me");
  return res.data.data.employer;
};

// ─── Sub-components ───────────────────────────────────────────────────────────

/** Single read-only info row */
const InfoRow = ({ icon: Icon, label, value }) => (
  <div
    className="flex items-start gap-3 py-3"
    style={{ borderBottom: "1px solid var(--border)" }}
  >
    <div
      className="mt-0.5 flex-shrink-0"
      style={{ color: "var(--text-muted)" }}
    >
      <Icon size={15} />
    </div>
    <div className="min-w-0 flex-1">
      <p
        className="text-xs mb-0.5 uppercase tracking-widest"
        style={{
          color: "var(--text-muted)",
          fontFamily: "var(--font-display)",
        }}
      >
        {label}
      </p>
      <p
        className="text-sm font-medium break-words"
        style={{ color: "var(--text-primary)" }}
      >
        {value || <span style={{ color: "var(--text-muted)" }}>—</span>}
      </p>
    </div>
  </div>
);

/** Plan badge */
const PlanBadge = ({ plan }) => {
  const isPro = plan === "pro";
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-bold tracking-widest uppercase"
      style={{
        fontFamily: "var(--font-display)",
        background: isPro ? "var(--accent)" : "var(--bg-elevated)",
        color: isPro ? "#000" : "var(--text-secondary)",
        border: isPro ? "none" : "1px solid var(--border)",
        borderRadius: "var(--radius-sm)",
      }}
    >
      {isPro ? "● PRO" : "FREE"}
    </span>
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
    // Only send fields that have values (don't overwrite with empty strings)
    const payload = Object.fromEntries(
      Object.entries(data).filter(([, v]) => v !== ""),
    );

    try {
      await api.patch("/auth/me", payload);
      // Invalidate the cached profile so the view re-fetches fresh data
      await queryClient.invalidateQueries({ queryKey: ["profile"] });
      toast.success("Profile updated.");
      onSaved();
    } catch (err) {
      toast.error(err.message || "Update failed. Please try again.");
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <FormField
          label="Company name"
          id="edit_company_name"
          error={errors.company_name?.message}
          reg={register("company_name", {
            required: "Company name is required.",
            maxLength: { value: 150, message: "Max 150 characters." },
          })}
        />
        <FormField
          label="Contact name"
          id="edit_contact_name"
          error={errors.contact_name?.message}
          reg={register("contact_name", {
            required: "Contact name is required.",
            maxLength: { value: 100, message: "Max 100 characters." },
          })}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
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

        {/* State dropdown */}
        <div>
          <label htmlFor="edit_state" className="ss-label">
            State
          </label>
          <select
            id="edit_state"
            className={`ss-input ${errors.state ? "error" : ""}`}
            style={{ cursor: "pointer" }}
            {...register("state")}
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

      <FormField
        label="GST number (optional)"
        id="edit_gst_number"
        placeholder="27AAPFU0939F1ZV"
        error={errors.gst_number?.message}
        className="uppercase tracking-widest"
        reg={register("gst_number", {
          pattern: {
            value: /^\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}[Z]{1}[A-Z\d]{1}$/,
            message: "Enter a valid 15-character GSTIN.",
          },
          setValueAs: (v) => v?.toUpperCase() || "",
        })}
      />

      {/* Note: email and password are changed via separate flows */}
      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
        Email and password can only be changed via account settings.
      </p>

      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={isSubmitting || !isDirty}
          className="ss-btn flex-1"
        >
          {isSubmitting ? (
            <>
              <Loader2 size={14} className="animate-spin" /> Saving…
            </>
          ) : (
            <>
              <CheckCircle2 size={14} /> Save Changes
            </>
          )}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={isSubmitting}
          className="ss-btn-ghost"
        >
          <X size={14} /> Cancel
        </button>
      </div>
    </form>
  );
};

// ─── Skeleton loader ──────────────────────────────────────────────────────────
const ProfileSkeleton = () => (
  <div className="space-y-4 animate-pulse">
    {[...Array(5)].map((_, i) => (
      <div
        key={i}
        className="flex gap-3 py-3"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <div
          className="w-4 h-4 rounded mt-0.5 flex-shrink-0"
          style={{ background: "var(--bg-elevated)" }}
        />
        <div className="flex-1 space-y-2">
          <div
            className="h-2 w-16 rounded"
            style={{ background: "var(--bg-elevated)" }}
          />
          <div
            className="h-3 w-40 rounded"
            style={{ background: "var(--bg-elevated)" }}
          />
        </div>
      </div>
    ))}
  </div>
);

// ─── Main page ────────────────────────────────────────────────────────────────
const ProfilePage = () => {
  const [editMode, setEditMode] = useState(false);

  const {
    data: employer,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["profile"],
    queryFn: fetchProfile,
  });

  // ── Error state ─────────────────────────────────────────────────────────────
  if (isError) {
    return (
      <div
        className="max-w-2xl mx-auto mt-12 ss-card p-8 text-center"
        style={{ color: "var(--danger)" }}
      >
        <p className="font-medium mb-1">Failed to load profile</p>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          {error?.message || "An unexpected error occurred."}
        </p>
      </div>
    );
  }

  // Resolve state name for display
  const stateName = employer
    ? (INDIAN_STATES.find((s) => s.code === employer.state)?.name ??
      employer.state)
    : null;

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      {/* Page header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1
            className="text-xl font-semibold"
            style={{
              fontFamily: "var(--font-display)",
              color: "var(--text-primary)",
            }}
          >
            Company Profile
          </h1>
          <p
            className="text-sm mt-0.5"
            style={{ color: "var(--text-secondary)" }}
          >
            Manage your account information and billing plan.
          </p>
        </div>

        {!isLoading && !editMode && (
          <button
            onClick={() => setEditMode(true)}
            className="ss-btn-ghost flex items-center gap-2"
          >
            <Pencil size={13} />
            Edit
          </button>
        )}
      </div>

      {/* Stats strip */}
      {!isLoading && employer && (
        <div className="grid grid-cols-2 gap-3 mb-6">
          {/* Plan */}
          <div
            className="ss-card p-4 flex flex-col gap-2"
            style={{
              borderColor:
                employer.plan === "pro" ? "var(--accent)" : "var(--border)",
            }}
          >
            <p
              className="text-xs uppercase tracking-widest"
              style={{
                color: "var(--text-muted)",
                fontFamily: "var(--font-display)",
              }}
            >
              Current plan
            </p>
            <div className="flex items-center gap-2">
              <PlanBadge plan={employer.plan} />
            </div>
          </div>

          {/* Workers */}
          <div className="ss-card p-4 flex flex-col gap-2">
            <p
              className="text-xs uppercase tracking-widest"
              style={{
                color: "var(--text-muted)",
                fontFamily: "var(--font-display)",
              }}
            >
              Linked workers
            </p>
            <div className="flex items-center gap-2">
              <Users size={16} style={{ color: "var(--accent)" }} />
              <span
                className="text-2xl font-bold"
                style={{
                  fontFamily: "var(--font-display)",
                  color: "var(--text-primary)",
                }}
              >
                {employer.worker_count ?? 0}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Main card */}
      <div className="ss-card p-6">
        {isLoading ? (
          <ProfileSkeleton />
        ) : editMode ? (
          <>
            <p
              className="text-xs uppercase tracking-widest mb-4 pb-3"
              style={{
                color: "var(--accent)",
                fontFamily: "var(--font-display)",
                borderBottom: "1px solid var(--border)",
              }}
            >
              ● Editing profile
            </p>
            <EditForm
              employer={employer}
              onCancel={() => setEditMode(false)}
              onSaved={() => setEditMode(false)}
            />
          </>
        ) : (
          <>
            <InfoRow
              icon={Building2}
              label="Company name"
              value={employer.company_name}
            />
            <InfoRow
              icon={User}
              label="Contact name"
              value={employer.contact_name}
            />
            <InfoRow icon={Mail} label="Email address" value={employer.email} />
            <InfoRow icon={Phone} label="Phone" value={employer.phone} />
            <InfoRow icon={MapPin} label="State" value={stateName} />
            <InfoRow
              icon={FileText}
              label="GST number"
              value={employer.gst_number}
            />
            {/* Last row — no bottom border */}
            <div className="flex items-start gap-3 pt-3">
              <div
                className="mt-0.5 flex-shrink-0"
                style={{ color: "var(--text-muted)" }}
              >
                <Building2 size={15} />
              </div>
              <div>
                <p
                  className="text-xs mb-0.5 uppercase tracking-widest"
                  style={{
                    color: "var(--text-muted)",
                    fontFamily: "var(--font-display)",
                  }}
                >
                  Member since
                </p>
                <p
                  className="text-sm font-medium"
                  style={{ color: "var(--text-primary)" }}
                >
                  {employer.created_at
                    ? new Date(employer.created_at).toLocaleDateString(
                        "en-IN",
                        {
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        },
                      )
                    : "—"}
                </p>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ProfilePage;
