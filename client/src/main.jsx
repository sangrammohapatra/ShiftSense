/**
 * main.jsx — ShiftSense React 18 entry point
 *
 * Provider order (outer → inner):
 *   BrowserRouter  — gives all descendants access to routing context
 *   QueryClientProvider — React Query global cache & devtools
 *   Toaster        — react-hot-toast portal (renders outside the tree)
 *   App            — route definitions and page components
 */

import React from "react";
import ReactDOM from "react-dom/client";
import { CssBaseline, ThemeProvider } from "@mui/material";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "react-hot-toast";

import App from "./App.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import theme from "./theme.js";
import "./index.css";

// ─── React Query client ───────────────────────────────────────────────────────
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Don't re-fetch on window focus in development — reduces noise
      refetchOnWindowFocus: import.meta.env.PROD,
      // Retry failed requests once before showing an error
      retry: 1,
      // Data is considered fresh for 60 seconds
      staleTime: 60 * 1000,
    },
    mutations: {
      // Surface mutation errors to the nearest error boundary
      throwOnError: false,
    },
  },
});

// ─── Mount ────────────────────────────────────────────────────────────────────
ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider theme={theme}>
          <CssBaseline />
          <Toaster
            position="top-right"
            toastOptions={{
              duration: 4000,
              style: {
                borderRadius: "14px",
                fontSize: "14px",
                background: "#161b22",
                color: "#e6edf3",
                border: "1px solid rgba(255, 255, 255, 0.08)",
              },
            }}
          />
          <ErrorBoundary>
            <App />
          </ErrorBoundary>
        </ThemeProvider>
      </QueryClientProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
