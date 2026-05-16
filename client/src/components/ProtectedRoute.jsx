/**
 * components/ProtectedRoute.jsx — Auth gate for employer-only pages
 *
 * Reads isAuthenticated from the Zustand auth store. If the employer is not
 * logged in, redirects to /login while preserving the originally requested
 * URL in location state so LoginPage can redirect back after successful auth.
 *
 * Usage:
 *   <Route element={<ProtectedRoute />}>
 *     <Route path="/dashboard" element={<Dashboard />} />
 *   </Route>
 */

import { Navigate, Outlet, useLocation } from "react-router-dom";
import useAuthStore from "@/store/authStore";

const ProtectedRoute = () => {
  const isAuthenticated = useAuthStore((state) =>
    !!(state.employer && state.token)
  );
  const location = useLocation();

  if (!isAuthenticated) {
    // Pass current location so LoginPage can redirect back after login
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Render the matched child route
  return <Outlet />;
};

export default ProtectedRoute;
