/**
 * config/redis.js — ioredis client + Bull connection factory
 *
 * Bull v4 validates the ioredis instance OPTIONS after construction via
 * queue.js:318. It checks the live options object on the instance, not just
 * what you passed — ioredis sets maxRetriesPerRequest = 0 as a default when
 * you omit it, and Bull rejects anything !== null for subscriber/bclient.
 *
 * The only values that satisfy Bull's check:
 *   client:              maxRetriesPerRequest: null,  enableReadyCheck: false
 *   subscriber/bclient:  maxRetriesPerRequest: null,  enableReadyCheck: false
 *
 * Yes — null on ALL three, and enableReadyCheck: false on ALL three.
 * This is counterintuitive but confirmed by Bull's source and issue #1873.
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
 * ALL THREE must have:
 *   maxRetriesPerRequest: null        (not 0, not undefined — exactly null)
 *   enableReadyCheck:     false       (ioredis default is true; Bull rejects it)
 *
 * Bull's validation at queue.js:318 reads opts directly off the ioredis
 * instance after construction. If maxRetriesPerRequest is not null (including
 * the ioredis default of 0) or enableReadyCheck is not false, it throws:
 *   "Using a redis instance with enableReadyCheck or maxRetriesPerRequest
 *    for bclient/subscriber is not permitted."
 *
 * @param {"client"|"subscriber"|"bclient"} type
 * @returns {import("ioredis").Redis}
 */
export const bullClientFactory = (type) =>
  new Redis(redisUrl, {
    retryStrategy,
    enableOfflineQueue:   false,
    enableReadyCheck:     false,   // MUST be false for all three types
    maxRetriesPerRequest: null,    // MUST be null (not 0) for all three types
    connectionName:       `shiftsense-bull-${type}`,
  });