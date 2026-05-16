/**
 * App.jsx — ShiftSense route tree
 *
 * Route structure:
 *   /login            → LoginPage        (public)
 *   /register         → RegisterPage     (public)
 *   /                 → redirect → /dashboard
 *   /dashboard        → Dashboard        (protected)
 *   /workers          → WorkerList       (protected)
 *   /workers/:id      → WorkerDetail     (protected)
 *   /reports          → Reports          (protected)
 *   *                 → 404 inline       (public)
 *
 * ProtectedRoute wraps all employer-only pages. If the Zustand store has no
 * token the user is redirected to /login; on success they are sent back to
 * the originally requested URL via location.state.from.
 */

import { Routes, Route, Navigate } from "react-router-dom";

// ── Guards ────────────────────────────────────────────────────────────────────
import ProtectedRoute from "@/components/ProtectedRoute";

// ── Public pages ──────────────────────────────────────────────────────────────
import LoginPage from "@/pages/LoginPage";
import RegisterPage from "@/pages/RegisterPage";

// ── Protected pages ───────────────────────────────────────────────────────────
import Dashboard from "@/pages/Dashboard";
import WorkerList from "@/pages/WorkerList";
import WorkerDetail from "@/pages/WorkerDetail";
import Reports from "@/pages/Reports";
import ProfilePage from "@/pages/ProfilePage";

const App = () => {
  return (
    <Routes>
      {/* ── Public ─────────────────────────────────────────────────────────── */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      {/* ── Root redirect ──────────────────────────────────────────────────── */}
      <Route path="/" element={<Navigate to="/dashboard" replace />} />

      {/* ── Protected (nested under ProtectedRoute) ─────────────────────────
          ProtectedRoute renders <Outlet /> when authenticated, otherwise
          redirects to /login with the original location in state.        */}
      <Route element={<ProtectedRoute />}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/workers" element={<WorkerList />} />
        <Route path="/workers/:id" element={<WorkerDetail />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/profile" element={<ProfilePage />} />
      </Route>

      {/* ── 404 fallback ───────────────────────────────────────────────────── */}
      <Route
        path="*"
        element={
          <div style={{ padding: "2rem", textAlign: "center" }}>
            <h2>404 — Page not found</h2>
            <a href="/dashboard">Go to Dashboard</a>
          </div>
        }
      />
    </Routes>
  );
};

export default App;
