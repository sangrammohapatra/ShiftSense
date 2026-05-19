/**
 * config/redis.js — ioredis client for ShiftSense
 *
 * Bull v4 is very strict about which ioredis options each connection type
 * is allowed to have:
 *
 *   "client"     → can have maxRetriesPerRequest: null
 *   "subscriber" → must NOT have maxRetriesPerRequest OR enableReadyCheck
 *   "bclient"    → must NOT have maxRetriesPerRequest OR enableReadyCheck
 *
 * The bullClientFactory below handles this correctly per type.
 */

import Redis from "ioredis";

const MAX_RETRY_ATTEMPTS = 10;

const retryStrategy = (times) => {
  if (times > MAX_RETRY_ATTEMPTS) {
    console.error(`[Redis] Failed to connect after ${MAX_RETRY_ATTEMPTS} attempts.`);
    process.exit(1);
  }
  const delay = Math.min(200 * 2 ** (times - 1), 30_000);
  console.warn(`[Redis] Reconnect attempt #${times} in ${delay}ms…`);
  return delay;
};

export const redisUrl = process.env.REDIS_URL || "redis://127.0.0.1:6379";

// ── Main shared client (caching, conversation state) ──────────────────────────
export const redisClient = new Redis(redisUrl, {
  retryStrategy,
  enableOfflineQueue: false,
  connectionName: "shiftsense-main",
});

redisClient.on("connect", () => console.log("[Redis] Client connected."));
redisClient.on("ready",   () => console.log("[Redis] Client ready."));
redisClient.on("error",   (err) => console.error(`[Redis] Error: ${err.message}`));
redisClient.on("close",   () => console.warn("[Redis] Connection closed."));

// ── Bull.js createClient factory ──────────────────────────────────────────────
/**
 * Bull calls this with type = "client" | "subscriber" | "bclient"
 *
 * Rules enforced by Bull v4:
 *   - subscriber and bclient: must NOT have enableReadyCheck or maxRetriesPerRequest
 *   - client: must have maxRetriesPerRequest: null
 *
 * @param {"client"|"subscriber"|"bclient"} type
 * @returns {Redis}
 */
export const bullClientFactory = (type) => {
  if (type === "client") {
    // Regular command client — needs maxRetriesPerRequest: null for Bull
    return new Redis(redisUrl, {
      retryStrategy,
      enableOfflineQueue: false,
      maxRetriesPerRequest: null,
      connectionName: "shiftsense-bull-client",
    });
  }

  // subscriber and bclient — must have NO enableReadyCheck or maxRetriesPerRequest
  // ioredis sets enableReadyCheck: true by default, so we must explicitly set false
  return new Redis(redisUrl, {
    retryStrategy,
    enableOfflineQueue: false,
    enableReadyCheck: false,
    connectionName: `shiftsense-bull-${type}`,
  });
};

/**
 * Bull.js createClient factory.
 *
 * Bull v4 internally creates THREE Redis connections and has strict rules
 * about which ioredis options each type is allowed to have:
 *
 *   "client"              → maxRetriesPerRequest: null   (required)
 *   "subscriber"          → must NOT have maxRetriesPerRequest or enableReadyCheck
 *   "bclient" (blocking)  → must NOT have maxRetriesPerRequest or enableReadyCheck
 *
 * Passing a plain URL string to new Bull("queue", url) bypasses this entirely
 * and uses Bull's own ioredis instance — which silently breaks subscriber and
 * bclient connections, causing jobs to be enqueued but never processed (the
 * symptom: /generate returns 202 but nothing appears in logs).
 *
 * Pass this as: new Bull("queue", { createClient: bullClientFactory })
 *
 * @param {"client"|"subscriber"|"bclient"} type
 * @returns {Redis}
 */
export const bullClientFactory = (type) => {
  const base = {
    retryStrategy,
    enableOfflineQueue: false,
    connectionName: `shiftsense-bull-${type}`,
  };

  if (type === "client") {
    // client connection: Bull needs maxRetriesPerRequest: null here
    return new Redis(redisUrl, { ...base, maxRetriesPerRequest: null });
  }

  // subscriber and bclient: must NOT have maxRetriesPerRequest or enableReadyCheck
  // (ioredis throws "Cannot use maxRetriesPerRequest in subscriber mode")
  return new Redis(redisUrl, {
    ...base,
    enableReadyCheck: false,
    // maxRetriesPerRequest intentionally omitted
  });
};