/**
 * services/conversationState.js — Redis-backed per-user conversation state
 *
 * Each WhatsApp user has at most one active conversation state stored in Redis.
 * States expire after 10 minutes of inactivity — if a worker walks away mid-
 * registration, the next message restarts the flow cleanly.
 *
 * Redis key schema:  conv:{10-digit-phone}
 * Value:             JSON-serialised state object
 * TTL:               600 seconds (10 minutes), refreshed on every setState call
 *
 * ── Registration flow steps ────────────────────────────────────────────────────
 *   AWAIT_NAME        → bot asked for name, waiting for reply
 *   AWAIT_STATE       → bot asked for state, waiting for 2-letter code
 *   AWAIT_OCCUPATION  → bot asked for occupation, waiting for choice
 *   AWAIT_AADHAAR     → bot asked for Aadhaar last 4, waiting for 4 digits
 *   COMPLETE          → registration done (state cleared immediately after)
 *
 * ── Shift logging steps ────────────────────────────────────────────────────────
 *   AWAIT_SHIFT_CONFIRM → Claude returned ambiguous parse; waiting for confirmation
 *
 * State object shape:
 *   {
 *     step: string,        // one of the constants above
 *     data: {              // accumulated registration fields
 *       name?: string,
 *       state?: string,
 *       occupation?: string,
 *       aadhaar_last4?: string,
 *       // shift logging context
 *       pending_shift?: object,
 *     }
 *   }
 */

import { redisClient } from "../config/redis.js";

// ── Step name constants (exported so webhook route can reference them) ─────────
export const STEPS = {
  // Registration
  AWAIT_NAME: "AWAIT_NAME",
  AWAIT_STATE: "AWAIT_STATE",
  AWAIT_OCCUPATION: "AWAIT_OCCUPATION",
  AWAIT_AADHAAR: "AWAIT_AADHAAR",
  COMPLETE: "COMPLETE",
  // Shift logging
  AWAIT_SHIFT_CONFIRM: "AWAIT_SHIFT_CONFIRM",
};

/** TTL in seconds — 10 minutes */
const CONV_TTL = 600;

/**
 * Builds the Redis key for a given phone number.
 * @param {string} phone  10-digit number
 */
const key = (phone) => `conv:${phone}`;

/**
 * Retrieves the current conversation state for a phone number.
 *
 * @param {string} phone  10-digit Indian mobile number
 * @returns {Promise<{ step: string, data: object } | null>}
 */
export const getState = async (phone) => {
  try {
    const raw = await redisClient.get(key(phone));
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    console.error(`[ConvState] getState error for ${phone}: ${err.message}`);
    return null;
  }
};

/**
 * Saves (or overwrites) the conversation state for a phone number.
 * Resets the TTL on every call.
 *
 * @param {string} phone      10-digit Indian mobile number
 * @param {{ step: string, data: object }} stateObj
 * @returns {Promise<void>}
 */
export const setState = async (phone, stateObj) => {
  try {
    await redisClient.set(key(phone), JSON.stringify(stateObj), "EX", CONV_TTL);
  } catch (err) {
    console.error(`[ConvState] setState error for ${phone}: ${err.message}`);
  }
};

/**
 * Deletes the conversation state for a phone number.
 * Called when registration completes or a conversation is abandoned.
 *
 * @param {string} phone  10-digit Indian mobile number
 * @returns {Promise<void>}
 */
export const clearState = async (phone) => {
  try {
    await redisClient.del(key(phone));
  } catch (err) {
    console.error(`[ConvState] clearState error for ${phone}: ${err.message}`);
  }
};

/**
 * Merges new fields into the `data` bag of an existing state without
 * changing the step. Useful for accumulating partial registration data.
 *
 * @param {string} phone
 * @param {object} newData  Fields to merge into state.data
 * @returns {Promise<void>}
 */
export const mergeData = async (phone, newData) => {
  try {
    const current = (await getState(phone)) ?? {
      step: STEPS.AWAIT_NAME,
      data: {},
    };
    await setState(phone, {
      ...current,
      data: { ...current.data, ...newData },
    });
  } catch (err) {
    console.error(`[ConvState] mergeData error for ${phone}: ${err.message}`);
  }
};
