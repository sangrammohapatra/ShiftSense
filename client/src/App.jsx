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

import { Box, Button, Stack, Typography } from "@mui/material";
import { Link, Navigate, Route, Routes } from "react-router-dom";

import ProtectedRoute from "@/components/ProtectedRoute";
import Dashboard from "@/pages/Dashboard";
import LoginPage from "@/pages/LoginPage";
import ProfilePage from "@/pages/ProfilePage";
import RegisterPage from "@/pages/RegisterPage";
import Reports from "@/pages/Reports";
import WorkerDetail from "@/pages/WorkerDetail";
import WorkerList from "@/pages/WorkerList";

const NotFoundPage = () => (
  <Box
    sx={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      px: 2,
    }}
  >
    <Stack spacing={2} alignItems="center" textAlign="center">
      <Typography variant="h3">404</Typography>
      <Typography variant="body1" color="text.secondary">
        Page not found.
      </Typography>
      <Button component={Link} to="/dashboard" variant="contained" sx={{ borderRadius: 10 }}>
        Go to Dashboard
      </Button>
    </Stack>
  </Box>
);

const App = () => {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/" element={<Navigate to="/dashboard" replace />} />

      <Route element={<ProtectedRoute />}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/workers" element={<WorkerList />} />
        <Route path="/workers/:id" element={<WorkerDetail />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/profile" element={<ProfilePage />} />
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
};

export default App;
