/**
 * app.js — ShiftSense Express application entry point
 * Bootstraps middleware, mounts routes, and starts the HTTP + Socket.io server
 */
import 'dotenv/config'; // Load .env variables into process.env
import express from "express";
import http from "http";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { Server as SocketIOServer } from "socket.io";
import dotenv from "dotenv";

import { connectDB } from "./config/db.js";
import { redisClient } from "./config/redis.js";

// ─── Load env vars ────────────────────────────────────────────────────────────
// dotenv.config();

const app = express();
const httpServer = http.createServer(app);

// ─── Socket.io setup ─────────────────────────────────────────────────────────
export const io = new SocketIOServer(httpServer, {
  cors: {
    origin: process.env.CLIENT_ORIGIN || "http://localhost:5173",
    methods: ["GET", "POST"],
  },
});

io.on("connection", (socket) => {
  console.log(`[Socket.io] Client connected: ${socket.id}`);
  socket.on("disconnect", () => {
    console.log(`[Socket.io] Client disconnected: ${socket.id}`);
  });
});

// ─── Security middleware ──────────────────────────────────────────────────────
app.use(helmet());

app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN || "http://localhost:5173",
    credentials: true,
  }),
);

// ─── Body parsers ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: true, limit: "10kb" }));

// ─── Global rate limiter ──────────────────────────────────────────────────────
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // max 100 requests per window per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many requests. Please try again after 15 minutes.",
  },
});

app.use(globalLimiter);

// ─── Health check ─────────────────────────────────────────────────────────────
app.get("/health", (req, res) => {
  res.status(200).json({
    success: true,
    service: "ShiftSense API",
    timestamp: new Date().toISOString(),
    uptime: `${Math.floor(process.uptime())}s`,
  });
});

// ─── API routes (v1) ──────────────────────────────────────────────────────────
import authRoutes from "./routes/auth.js";
import workerRoutes from "./routes/workers.js";
import webhookRoutes from "./routes/webhook.js";
import reportRoutes from "./routes/reports.js";
import dashboardRoutes from "./routes/dashboard.js";
import { startReportCron } from "./cron/reportCron.js";
import errorHandler from "./middleware/errorHandler.js";

app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/workers", workerRoutes);
// Webhook route uses its own urlencoded parser — must NOT be wrapped
// in the global express.json() body parser (breaks Twilio sig validation)
app.use("/api/v1/webhook", webhookRoutes);
app.use("/api/v1/dashboard", dashboardRoutes);
app.use("/api/v1/reports", reportRoutes);

// 404 catch-all — must come after all route registrations
app.use("/api/v1", (req, res) => {
  res
    .status(404)
    .json({ success: false, message: "Route not found.", errors: [] });
});

// ─── Global error handler ─────────────────────────────────────────────────────
// Must be last — Express identifies 4-arg middleware as error handlers
app.use(errorHandler);

// ─── Bootstrap ───────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;

(async () => {
  try {
    await connectDB();
    // Redis client is initialized on import; verify connection
    await redisClient.ping();
    console.log("[Redis] Connection verified.");

    startReportCron();

    httpServer.listen(PORT, () => {
      console.log(`[Server] ShiftSense API running on port ${PORT}`);
    });
  } catch (err) {
    console.error("[Startup] Fatal error:", err.message);
    process.exit(1);
  }
})();

export default app;
