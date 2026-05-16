/**
 * store/authStore.js — ShiftSense Zustand authentication store
 *
 * Persists token and employer profile to localStorage so the session
 * survives a page refresh. The axios interceptor reads `getState().token`
 * directly — no React hooks required — making it safe to call outside
 * of component trees (e.g. in the axios response interceptor).
 *
 * Shape:
 *   employer       — full employer object returned by /api/v1/auth/login
 *   token          — JWT string
 *   isAuthenticated — derived: true when both employer and token are set
 *   setAuth()      — called after successful login / register
 *   logout()       — clears state + localStorage
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

const useAuthStore = create(
  persist(
    (set, get) => ({
      // ── State ──────────────────────────────────────────────────────────────
      employer: null,
      token: null,

      // ── Derived ────────────────────────────────────────────────────────────
      /**
       * Returns true when a valid employer object and JWT token are both present.
       * Use this as the gate in ProtectedRoute.
       */
      get isAuthenticated() {
        const { employer, token } = get();
        return !!(employer && token);
      },

      // ── Actions ────────────────────────────────────────────────────────────

      /**
       * Stores employer profile and JWT after a successful auth response.
       *
       * @param {Object} employer  Employer object from API (without password)
       * @param {string} token     JWT string
       */
      setAuth: (employer, token) => {
        set({ employer, token });
      },

      /**
       * Clears all auth state and removes the persisted localStorage entry.
       * Called by the axios 401 interceptor and the manual logout button.
       */
      logout: () => {
        set({ employer: null, token: null });
      },
    }),
    {
      name: "shiftsense-auth",          // localStorage key
      storage: createJSONStorage(() => localStorage),
      // Only persist these two fields — derived values are recomputed on load
      partialize: (state) => ({
        employer: state.employer,
        token: state.token,
      }),
    }
  )
);

export default useAuthStore;
