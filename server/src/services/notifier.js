/**
 * services/notifier.js — ShiftSense WhatsApp notification service
 *
 * Wraps Twilio's Messages API for WhatsApp delivery.
 * All outbound messages are sent from the Twilio Sandbox / approved sender
 * configured in TWILIO_WHATSAPP_FROM (e.g. "whatsapp:+14155238886").
 *
 * India-specific note:
 *   Recipient numbers must be prefixed "whatsapp:+91" for Indian mobile numbers.
 *   The `to` parameter accepted by sendWhatsApp() should be the raw 10-digit
 *   Indian number; this function handles the prefix internally.
 *
 * Usage:
 *   import { sendWhatsApp } from "../services/notifier.js";
 *   await sendWhatsApp("9876543210", "Hello from ShiftSense!");
 */

import twilio from "twilio";

// ─── Lazy-initialised Twilio client ───────────────────────────────────────────
// Initialised once on first call rather than at module load time so that
// unit tests can set env vars before the client is constructed.
let _client = null;

const getClient = () => {
  if (!_client) {
    const sid = process.env.TWILIO_SID;
    const token = process.env.TWILIO_TOKEN;

    if (!sid || !token) {
      throw new Error(
        "TWILIO_SID and TWILIO_TOKEN must be set in environment variables.",
      );
    }

    _client = twilio(sid, token);
  }
  return _client;
};

/**
 * Sends a WhatsApp message to an Indian mobile number.
 *
 * @param {string} to       10-digit Indian mobile number (without country code or prefix)
 * @param {string} message  Message body (plain text; max ~1600 chars for WhatsApp)
 * @returns {Promise<string|null>} Twilio message SID on success, null on failure
 */
export const sendWhatsApp = async (to, message) => {
  // Normalise: strip any existing prefix, ensure +91 is applied once
  const digits = to.replace(/\D/g, "").replace(/^91/, ""); // bare 10-digit number
  const toAddr = `whatsapp:+91${digits}`;
  const fromAddr = process.env.TWILIO_WHATSAPP_FROM;

  if (!fromAddr) {
    console.error(
      "[Notifier] TWILIO_WHATSAPP_FROM is not set. Message not sent.",
    );
    return null;
  }

  try {
    const msg = await getClient().messages.create({
      from: fromAddr,
      to: toAddr,
      body: message,
    });

    console.log(`[Notifier] WhatsApp sent → ${toAddr} | SID: ${msg.sid}`);
    return msg.sid;
  } catch (err) {
    // Log granularly but never throw — a notification failure must not crash
    // the webhook handler or prevent the Worker document from being created.
    console.error(
      `[Notifier] Failed to send WhatsApp to ${toAddr}: ${err.message}`,
      { code: err.code, status: err.status },
    );
    return null;
  }
};
