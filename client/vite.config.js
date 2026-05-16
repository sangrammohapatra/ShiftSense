/**
 * vite.config.js — ShiftSense client build configuration
 *
 * Proxy rule: any request to /api/v1/* in the browser is forwarded to
 * http://localhost:5000 during development, avoiding CORS preflight issues.
 * In production, Nginx (or your reverse proxy) handles this routing.
 */

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],

  resolve: {
    alias: {
      // Allows clean absolute imports: import X from "@/components/X"
      "@": path.resolve(__dirname, "./src"),
    },
  },

  server: {
    port: 5173,
    proxy: {
      "/api/v1": {
        target: "http://localhost:5000",
        changeOrigin: true,
        // Do not rewrite the path — the server expects the full /api/v1 prefix
        rewrite: (path) => path,
      },
    },
  },

  build: {
    outDir: "dist",
    sourcemap: true,
  },
});
