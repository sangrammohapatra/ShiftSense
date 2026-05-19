/**
 * config/redis.js — ioredis client + Bull connection factory
 *
 * Bull v4 + ioredis compatibility rules (confirmed against Bull source):
 *
 *   ALL three connection types (client, subscriber, bclient) must have:
 *     maxRetriesPerRequest: null   — ioredis default is 0; Bull rejects non-null
 *     enableReadyCheck:     false  — ioredis default is true; Bull rejects true
 *
 *   enableOfflineQueue MUST be true (the default) for Bull connections.
 *   Bull issues CLIENT and other commands during worker startup before the
 *   TCP connection is fully established. With enableOfflineQueue: false those
 *   commands are immediately rejected with "Stream isn't writeable", crashing
 *   the worker before it can process any jobs.
 *
 *   Only the shared app client (redisClient) uses enableOfflineQueue: false
 *   because we want conversation-state reads to fail fast rather than queue.
 */

import Redis from "ioredis";

const MAX_RETRY_ATTEMPTS = 10;

const retryStrategy = (times) => {
  if (times > MAX_RETRY_ATTEMPTS) {
    console.error(`[Redis] Failed to connect after ${MAX_RETRY_ATTEMPTS} attempts. Exiting.`);
    process.exit(1);
  }
  const delay = Math.min(200 * 2 ** (times - 1), 30_000);
  console.warn(`[Redis] Reconnect attempt #${times} in ${delay}ms…`);
  return delay;
};

export const redisUrl = process.env.REDIS_URL || "redis://127.0.0.1:6379";

// ── Shared app client (conversation state, caching) ───────────────────────────
// enableOfflineQueue: false here is intentional — if Redis is down we want
// WhatsApp webhook handlers to fail fast and return an error reply, not queue
// commands indefinitely.
export const redisClient = new Redis(redisUrl, {
  retryStrategy,
  enableOfflineQueue:   false,
  enableReadyCheck:     false,
  maxRetriesPerRequest: null,
  connectionName:       "shiftsense-main",
});

redisClient.on("connect", () => console.log("[Redis] Client connected."));
redisClient.on("ready",   () => console.log("[Redis] Client ready."));
redisClient.on("error",   (err) => console.error(`[Redis] Error: ${err.message}`));
redisClient.on("close",   () => console.warn("[Redis] Connection closed."));

// ── Bull.js createClient factory ──────────────────────────────────────────────
/**
 * Bull calls this with type = "client" | "subscriber" | "bclient".
 *
 * Required for all three types:
 *   maxRetriesPerRequest: null   (Bull rejects the ioredis default of 0)
 *   enableReadyCheck:     false  (Bull rejects the ioredis default of true)
 *   enableOfflineQueue:   true   (Bull default — MUST NOT be false; Bull sends
 *                                 commands before the connection is ready)
 *
 * @param {"client"|"subscriber"|"bclient"} type
 * @returns {import("ioredis").Redis}
 */
export const bullClientFactory = (type) =>
  new Redis(redisUrl, {
    retryStrategy,
    enableReadyCheck:     false,
    maxRetriesPerRequest: null,
    // enableOfflineQueue intentionally omitted — defaults to true, which Bull needs
    connectionName:       `shiftsense-bull-${type}`,
  });