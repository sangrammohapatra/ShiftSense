/**
 * api/axios.js — ShiftSense configured Axios instance
 *
 * All API calls in the app should import `api` from this file rather than
 * using raw `axios` — this ensures every request automatically carries the
 * JWT Authorization header and every 401 response triggers a clean logout.
 *
 * Why getState() instead of useAuthStore()?
 *   Zustand's hook form (useAuthStore) can only be called inside React
 *   components. Interceptors run outside the React tree, so we access the
 *   store via its static `getState()` method instead.
 */

import axios from "axios";
import useAuthStore from "@/store/authStore";

const resolveApiBaseUrl = () => {
  const rawValue = String(import.meta.env.VITE_API_BASE_URL ?? "").trim();

  // Ignore the placeholder example value if it accidentally made it into a build.
  if (!rawValue || /your-service-name\.onrender\.com/i.test(rawValue)) {
    return "/api/v1";
  }

  const withoutTrailingSlash = rawValue.replace(/\/+$/, "");

  if (/^https?:\/\//i.test(withoutTrailingSlash)) {
    return withoutTrailingSlash;
  }

  if (withoutTrailingSlash.startsWith("/")) {
    return withoutTrailingSlash;
  }

  return `/${withoutTrailingSlash.replace(/^\/+/, "")}`;
};

const api = axios.create({
  baseURL: resolveApiBaseUrl(),
  timeout: 15_000,
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
});

// ─── Request interceptor — attach JWT ────────────────────────────────────────
api.interceptors.request.use(
  (config) => {
    // Read token directly from Zustand store state (no hook required)
    const { token } = useAuthStore.getState();

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  },
  (error) => Promise.reject(error),
);

// ─── Response interceptor — handle 401 ───────────────────────────────────────
api.interceptors.response.use(
  // 2xx: pass through unchanged
  (response) => response,

  (error) => {
    const status = error.response?.status;

    if (status === 401) {
      // Token expired or invalid — wipe auth state and send to login
      // Import logout from the store's static API to avoid circular imports
      useAuthStore.getState().logout();

      // Redirect to login page without pushing to history
      // (window.location replaces current entry so the back button doesn't
      //  loop the user back to a protected page)
      window.location.replace("/login");
    }

    // Normalise error shape so callers can always do error.message
    const message =
      error.response?.data?.message ||
      error.message ||
      "An unexpected error occurred.";

    return Promise.reject(new Error(message));
  },
);

export default api;
