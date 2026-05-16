/**
 * config/db.js — MongoDB Atlas connection via Mongoose
 * Handles initial connection, graceful disconnect, and fatal error logging.
 */

import mongoose from "mongoose";

/**
 * Connects to MongoDB Atlas using MONGO_URI from environment.
 * Exits the process if the initial connection fails — no point running
 * without a database.
 */
export const connectDB = async () => {
  const uri = process.env.MONGO_URI;

  if (!uri) {
    throw new Error("MONGO_URI is not defined in environment variables.");
  }

  try {
    const conn = await mongoose.connect(uri, {
      // Mongoose 7+ ignores deprecated options; listed here for clarity
      serverSelectionTimeoutMS: 5000, // fail fast if Atlas unreachable
      socketTimeoutMS: 45000,
    });

    console.log(`[MongoDB] Connected: ${conn.connection.host}`);
  } catch (err) {
    console.error(`[MongoDB] Connection error: ${err.message}`);
    throw err; // bubble up to app.js bootstrap — it will exit
  }

  // ── Lifecycle event listeners ─────────────────────────────────────────────

  mongoose.connection.on("disconnected", () => {
    console.warn("[MongoDB] Disconnected. Mongoose will attempt to reconnect.");
  });

  mongoose.connection.on("reconnected", () => {
    console.log("[MongoDB] Reconnected successfully.");
  });

  mongoose.connection.on("error", (err) => {
    // Post-connect errors (network blip, Atlas failover, etc.)
    console.error(`[MongoDB] Runtime error: ${err.message}`);
  });

  // ── Graceful shutdown ─────────────────────────────────────────────────────
  const gracefulShutdown = async (signal) => {
    console.log(`[MongoDB] ${signal} received — closing connection.`);
    await mongoose.connection.close();
    process.exit(0);
  };

  process.on("SIGINT", () => gracefulShutdown("SIGINT"));
  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
};
