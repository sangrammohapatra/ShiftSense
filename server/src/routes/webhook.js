/**
 * routes/webhook.js — ShiftSense WhatsApp inbound webhook
 *
 * Mounted at: /api/v1/webhook
 * Twilio calls POST /api/v1/webhook/whatsapp for every inbound WhatsApp message.
 *
 * Security:
 *   Twilio signature validation middleware is applied ONLY to the WhatsApp
 *   endpoint. The raw urlencoded body is required for signature verification,
 *   so this router uses its own scoped urlencoded parser — not the global
 *   express.json() middleware.
 *
 * Message routing:
 *   Unregistered phone  → registration state machine (multi-turn)
 *   Registered worker
 *     └─ "DISPUTE"      → dispute letter trigger (implemented in next step)
 *     └─ shift message  → NLP parse → rules engine → ShiftLog save → reply
 *     └─ pending confirm→ re-use stored pending_shift from Redis state
 *
 * Registration state machine steps:
 *   AWAIT_NAME → AWAIT_STATE → AWAIT_OCCUPATION → AWAIT_AADHAAR → COMPLETE
 *
 * Shift logging state:
 *   AWAIT_SHIFT_CONFIRM — set when Claude returns ambiguous parse (null hours)
 */

import { Router } from "express";
import twilio from "twilio";
import express from "express";
import mongoose from "mongoose";

import { sendWhatsApp } from "../services/notifier.js";
import {
  getState,
  setState,
  clearState,
  STEPS,
} from "../services/conversationState.js";
import { parseShiftMessage } from "../services/nlpParser.js";
import {
  calculateEntitlement,
  buildEntitlementMessage,
} from "../services/rulesEngine.js";
import { Worker, ShiftLog, Employer, DisputeLetter } from "../models/index.js";
import { OCCUPATION_ENUM } from "../models/Worker.js";
import {
  generateDisputeLetter,
  getAccessibleDisputeLetterUrl,
} from "../services/disputeGenerator.js";

const router = Router();

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** True if the message looks like a shift entry */
const isShiftMessage = (text) =>
  /^shift\b/i.test(text) ||
  /\d{1,2}\s*(am|pm|baje|:)/i.test(text) ||
  /\b(se|to|from|–|-)\s*\d{1,2}\s*(am|pm|baje)/i.test(text);

/** True if the message is a dispute trigger */
const isDisputeMessage = (text) => /^dispute$/i.test(text.trim());

// ─── Valid Indian state codes ──────────────────────────────────────────────────
const VALID_STATE_CODES = new Set([
  "AN",
  "AP",
  "AR",
  "AS",
  "BR",
  "CH",
  "CT",
  "DD",
  "DL",
  "GA",
  "GJ",
  "HR",
  "HP",
  "JK",
  "JH",
  "KA",
  "KL",
  "LA",
  "LD",
  "MP",
  "MH",
  "MN",
  "ML",
  "MZ",
  "NL",
  "OD",
  "PY",
  "PB",
  "RJ",
  "SK",
  "TN",
  "TG",
  "TR",
  "UP",
  "UT",
  "WB",
]);

// ─── Occupation menu ───────────────────────────────────────────────────────────
const OCCUPATION_MENU = OCCUPATION_ENUM.map((o, i) => `${i + 1}. ${o}`).join(
  "\n",
);
const numberToOccupation = (n) => OCCUPATION_ENUM[parseInt(n, 10) - 1] ?? null;

// ─── Bilingual message templates ──────────────────────────────────────────────
const MSG = {
  welcome: (name) =>
    `नमस्ते ${name}! 👋 Welcome to ShiftSense.\n\n` +
    `आपका रजिस्ट्रेशन हो गया है!\n` +
    `Your registration is complete! ✅\n\n` +
    `शिफ्ट लॉग करने के लिए भेजें / To log a shift, send:\n` +
    `_shift 9am-6pm construction_`,

  askName:
    `🙏 ShiftSense में आपका स्वागत है!\n` +
    `Welcome to ShiftSense — Wage Intelligence for Workers.\n\n` +
    `आपका नाम क्या है? / What is your full name?`,

  askState: (name) =>
    `धन्यवाद ${name}! 🙏\n\n` +
    `आप किस राज्य में काम करते हैं?\n` +
    `Which state do you work in?\n` +
    `कृपया 2-अक्षर का कोड भेजें:\n` +
    `(e.g. MH = Maharashtra, DL = Delhi, KA = Karnataka, UP = Uttar Pradesh)`,

  invalidState:
    `❌ अमान्य राज्य कोड। / Invalid state code.\n\n` +
    `सही कोड भेजें जैसे: MH, DL, KA, UP, GJ, RJ, TN\n` +
    `Send a valid 2-letter state code.`,

  askOccupation:
    `आप किस काम में हैं? / What is your occupation?\n\n` +
    `नंबर भेजें / Reply with the number:\n` +
    OCCUPATION_MENU,

  invalidOccupation:
    `❌ कृपया 1 से ${OCCUPATION_ENUM.length} के बीच नंबर भेजें।\n` +
    `Please reply with a number between 1 and ${OCCUPATION_ENUM.length}.\n\n` +
    OCCUPATION_MENU,

  askAadhaar:
    `अच्छा! 👍\n\n` +
    `आधार कार्ड के आखिरी 4 अंक / Last 4 digits of Aadhaar:\n` +
    `_(पहचान के लिए केवल — only for identity)_`,

  invalidAadhaar:
    `❌ सिर्फ 4 अंक भेजें। / Please send exactly 4 digits.\n` +
    `उदाहरण / Example: 5678`,

  askClarify: (rawText) =>
    `🤔 समझ नहीं आया / Couldn't understand your shift timing.\n\n` +
    `"${rawText}"\n\n` +
    `कृपया इस तरह भेजें / Please resend like:\n` +
    `_shift 9am-6pm_\n` +
    `_shift 8:00-17:00_\n` +
    `_shift 9 baje se 6 baje tak_`,

  shiftParseError:
    `⚠️ शिफ्ट समझ नहीं आई। / Could not parse your shift.\n\n` +
    `कृपया इस तरह भेजें / Please send like:\n` +
    `_shift 9am-6pm construction_\n` +
    `_shift 8:00-17:00_`,

  noWageData: (state, occupation) =>
    `⚠️ ${state} / ${occupation} के लिए वेतन डेटा नहीं मिला।\n` +
    `Wage data not found for ${state} / ${occupation}.\n` +
    `Please contact your employer or try again later.`,

  shiftAlreadyLogged: (date) =>
    `⚠️ इस तारीख की शिफ्ट पहले से लॉग है / Shift already logged for ${date}.\n` +
    `एक दिन में सिर्फ एक शिफ्ट / Only one shift per day is allowed.`,

  disputeReady: (url) =>
    `📄 *आपका विवाद पत्र तैयार है! / Your Dispute Letter is Ready!* ✅\n\n` +
    `PDF Link:\n${url}\n\n` +
    `📋 *अगले कदम / Next Steps:*\n` +
    `1. ऊपर दिए लिंक से PDF डाउनलोड करें।\n` +
    `Download the PDF from the link above.\n` +
    `2. प्रिंट करें और नियोक्ता को दें।\n` +
    `Print it and hand it to your employer.\n` +
    `3. 15 दिन में जवाब न मिले तो:\n` +
    `If no response in 15 days:\n` +
    `👉 जिला श्रम आयुक्त कार्यालय में शिकायत दर्ज करें।\n` +
    `File a complaint at the District Labour Commissioner office.`,

  disputeNoShift:
    `⚠️ कोई योग्य शिफ्ट नहीं मिली। / No eligible shift found.\n\n` +
    `Dispute letters are generated for shifts where shortfall > Rs.50.\n` +
    `पहले अपनी शिफ्ट लॉग करें। / Please log your shift first.`,

  disputeError:
    `⚠️ Dispute letter generation failed. Please try again later.\n` +
    `कृपया बाद में फिर कोशिश करें।`,

  errorRetry:
    `⚠️ कुछ गलत हो गया। / Something went wrong.\n` +
    `कृपया फिर कोशिश करें। / Please try again.`,

  unknownMessage:
    `नमस्ते! 👋 ShiftSense पर आपका स्वागत है।\n\n` +
    `शिफ्ट लॉग करने के लिए भेजें:\n` +
    `_shift 9am-6pm construction_\n\n` +
    `मदद के लिए / For help, send: *help*`,
};

// ─── Phone normalisation ───────────────────────────────────────────────────────
// Returns full E.164 format: +919XXXXXXXXX
const normalisePhone = (raw) => {
  const digits = raw.replace(/^whatsapp:/i, "").replace(/\D/g, "");
  const last10 = digits.slice(-10);
  return `+91${last10}`; // always return full E.164
};

// ─── Twilio signature validation ──────────────────────────────────────────────
const validateTwilioSignature = (req, res, next) => {
  if (process.env.SKIP_TWILIO_VALIDATION === "true") {
    console.warn(
      "[Webhook] ⚠️  Twilio signature validation SKIPPED (dev mode).",
    );
    return next();
  }

  const authToken = process.env.TWILIO_TOKEN;
  const baseUrl = process.env.WEBHOOK_BASE_URL;

  if (!authToken || !baseUrl) {
    console.error(
      "[Webhook] TWILIO_TOKEN or WEBHOOK_BASE_URL not set — rejecting.",
    );
    return res.status(403).send("Forbidden");
  }

  const fullUrl = `${baseUrl}/api/v1/webhook/whatsapp`;
  const signature = req.headers["x-twilio-signature"] || "";
  const isValid = twilio.validateRequest(
    authToken,
    signature,
    fullUrl,
    req.body,
  );

  if (!isValid) {
    console.warn("[Webhook] Invalid Twilio signature — rejected.");
    return res.status(403).send("Forbidden");
  }
  next();
};

// ─── Registration state machine ───────────────────────────────────────────────
const handleRegistration = async (phone, body, state) => {
  const text = body.trim();

  if (!state) {
    await setState(phone, { step: STEPS.AWAIT_NAME, data: {} });
    await sendWhatsApp(phone, MSG.askName);
    return;
  }

  const { step, data } = state;

  if (step === STEPS.AWAIT_NAME) {
    const name = text.replace(/[^a-zA-Z\u0900-\u097F\s]/g, "").trim();
    if (name.length < 2) {
      await sendWhatsApp(
        phone,
        `❌ पूरा नाम भेजें / Please send your full name.`,
      );
      return;
    }
    await setState(phone, { step: STEPS.AWAIT_STATE, data: { name } });
    await sendWhatsApp(phone, MSG.askState(name));
    return;
  }

  if (step === STEPS.AWAIT_STATE) {
    const code = text.toUpperCase().trim();
    if (!VALID_STATE_CODES.has(code)) {
      await sendWhatsApp(phone, MSG.invalidState);
      return;
    }
    await setState(phone, {
      step: STEPS.AWAIT_OCCUPATION,
      data: { ...data, state: code },
    });
    await sendWhatsApp(phone, MSG.askOccupation);
    return;
  }

  if (step === STEPS.AWAIT_OCCUPATION) {
    const occupation = numberToOccupation(text.trim());
    if (!occupation) {
      await sendWhatsApp(phone, MSG.invalidOccupation);
      return;
    }
    await setState(phone, {
      step: STEPS.AWAIT_AADHAAR,
      data: { ...data, occupation },
    });
    await sendWhatsApp(phone, MSG.askAadhaar);
    return;
  }

  if (step === STEPS.AWAIT_AADHAAR) {
    if (!/^\d{4}$/.test(text.trim())) {
      await sendWhatsApp(phone, MSG.invalidAadhaar);
      return;
    }
    const { name, state: workerState, occupation } = data;
    try {
      await Worker.create({
        phone_number: phone,
        name,
        state: workerState,
        occupation,
        aadhaar_last4: text.trim(),
        is_verified: true,
        registered_at: new Date(),
      });
      await clearState(phone);
      await sendWhatsApp(phone, MSG.welcome(name));
      console.log(
        `[Webhook] Worker registered: +91${phone} (${name}, ${workerState})`,
      );
    } catch (err) {
      if (err.code === 11000) {
        await clearState(phone);
        await sendWhatsApp(
          phone,
          `✅ आप पहले से रजिस्टर्ड हैं! / You are already registered!`,
        );
      } else {
        console.error(
          `[Webhook] Worker creation failed for +91${phone}: ${err.message}`,
        );
        await sendWhatsApp(phone, MSG.errorRetry);
      }
    }
    return;
  }

  // Unknown step — reset
  console.warn(
    `[Webhook] Unknown registration step "${step}" for ${phone} — resetting.`,
  );
  await clearState(phone);
  await setState(phone, { step: STEPS.AWAIT_NAME, data: {} });
  await sendWhatsApp(phone, MSG.askName);
};

// ─── Shift processing ─────────────────────────────────────────────────────────
/**
 * Core shift handler for registered workers.
 * Handles both fresh shift messages and clarification replies
 * (AWAIT_SHIFT_CONFIRM state).
 *
 * @param {string} phone
 * @param {string} rawText
 * @param {object} worker   Mongoose Worker document
 * @param {object|null} convState  Redis conversation state
 */
const handleShift = async (phone, rawText, worker, convState) => {
  let parsedData = null;

  // ── Case 1: Waiting for clarification on a previous ambiguous parse ─────────
  if (convState?.step === STEPS.AWAIT_SHIFT_CONFIRM) {
    // Worker is replying to a clarification prompt — retry parse with combined text
    const originalRaw = convState.data?.raw_message ?? "";
    const combined = `${originalRaw} ${rawText}`.trim();

    const parseResult = await parseShiftMessage(
      combined,
      worker.state,
      worker.occupation,
    );

    if (!parseResult.success || parseResult.ambiguous) {
      // Still ambiguous after clarification — give up gracefully
      await clearState(phone);
      await sendWhatsApp(phone, MSG.shiftParseError);
      return;
    }

    parsedData = parseResult.data;
    await clearState(phone); // Clear the AWAIT_SHIFT_CONFIRM state
  }

  // ── Case 2: Fresh shift message ───────────────────────────────────────────
  if (!parsedData) {
    const parseResult = await parseShiftMessage(
      rawText,
      worker.state,
      worker.occupation,
    );

    if (!parseResult.success) {
      await sendWhatsApp(phone, MSG.shiftParseError);
      return;
    }

    if (parseResult.ambiguous) {
      // Save raw message in state so next reply can be appended to it
      await setState(phone, {
        step: STEPS.AWAIT_SHIFT_CONFIRM,
        data: { raw_message: rawText },
      });
      await sendWhatsApp(phone, MSG.askClarify(rawText));
      return;
    }

    parsedData = parseResult.data;
  }

  const { shift_date, start_hour, end_hour, occupation, state } = parsedData;

  // Use worker's profile values as fallback for occupation and state
  const effectiveOccupation = occupation || worker.occupation;
  const effectiveState = state || worker.state;

  // ── Duplicate shift guard ─────────────────────────────────────────────────
  // Normalise shift_date to midnight UTC for consistent DB comparison
  const shiftDateObj = new Date(`${shift_date}T00:00:00.000Z`);
  const nextDayObj = new Date(shiftDateObj.getTime() + 86_400_000);

  const existingShift = await ShiftLog.findOne({
    worker_id: worker._id,
    shift_date: { $gte: shiftDateObj, $lt: nextDayObj },
  });

  if (existingShift) {
    await sendWhatsApp(phone, MSG.shiftAlreadyLogged(shift_date));
    return;
  }

  // ── Calculate entitlement ─────────────────────────────────────────────────
  const entitlement = await calculateEntitlement(
    {
      start_hour,
      end_hour,
      state: effectiveState,
      occupation: effectiveOccupation,
    },
    worker,
  );

  if (entitlement.error) {
    await sendWhatsApp(
      phone,
      MSG.noWageData(effectiveState, effectiveOccupation),
    );
    return;
  }

  // ── Save ShiftLog ─────────────────────────────────────────────────────────
  const shiftLog = await ShiftLog.create({
    worker_id: worker._id,
    employer_id: worker.employer_id ?? null,
    shift_date: shiftDateObj,
    start_hour,
    end_hour,
    hours_worked: entitlement.hours_worked,
    ot_hours: entitlement.ot_hours,
    state: effectiveState,
    occupation: effectiveOccupation,
    min_wage_applied: entitlement.min_wage_applied,
    gross_owed: entitlement.gross_owed,
    epf_deduction: entitlement.epf_deduction,
    esi_deduction: entitlement.esi_deduction,
    net_owed: entitlement.net_owed,
    claimed_amount: entitlement.claimed_amount,
    shortfall: entitlement.shortfall,
    status: "logged",
    raw_message: rawText.slice(0, 500),
  });

  console.log(
    `[Webhook] ShiftLog saved: ${shiftLog._id} | worker=${worker._id} | ` +
      `${shift_date} | gross=₹${entitlement.gross_owed} | shortfall=₹${entitlement.shortfall}`,
  );

  // ── Send entitlement reply ─────────────────────────────────────────────────
  const reply = buildEntitlementMessage(entitlement, worker.name, shift_date);
  await sendWhatsApp(phone, reply);
};

// ─── Dispute letter handler ───────────────────────────────────────────────────
/**
 * Finds the most recent underpaid ShiftLog for this worker, generates the
 * PDF dispute letter, updates the ShiftLog status, and sends the PDF URL.
 *
 * Eligibility:
 *   - shortfall > 50
 *   - status: "logged" or "disputed"
 *   - Sorted by shift_date DESC — most recent qualifying shift
 *
 * @param {string} phone   Normalised 10-digit number
 * @param {object} worker  Mongoose Worker document
 */
const handleDispute = async (phone, worker) => {
  // 1. Find the most recent qualifying shift
  const shiftLog = await ShiftLog.findOne({
    worker_id: worker._id,
    status: { $in: ["logged", "disputed"] },
    shortfall: { $gt: 50 },
  }).sort({ shift_date: -1 });

  if (!shiftLog) {
    await sendWhatsApp(phone, MSG.disputeNoShift);
    return;
  }

  // 2. Optionally fetch linked employer for richer letter header
  let employer = null;
  if (worker.employer_id) {
    employer = await Employer.findById(worker.employer_id).lean();
  }

  try {
    const existingLetter = await DisputeLetter.findOne({
      shift_id: shiftLog._id,
    }).lean();

    if (existingLetter?.pdf_s3_url) {
      const disputeUrl = await getAccessibleDisputeLetterUrl(
        existingLetter.pdf_s3_url,
      );

      await ShiftLog.findByIdAndUpdate(shiftLog._id, {
        $set: { status: "disputed" },
      });

      console.log(
        `[Webhook] Reusing dispute letter for worker=${worker._id} ` +
          `shift=${shiftLog._id} shortfall=Rs.${shiftLog.shortfall}`,
      );

      await sendWhatsApp(phone, MSG.disputeReady(disputeUrl));
      return;
    }

    // 3. Generate PDF + upload to S3 + persist DisputeLetter record
    const s3Url = await generateDisputeLetter(shiftLog, worker, employer);

    // 4. Mark the ShiftLog as disputed
    await ShiftLog.findByIdAndUpdate(shiftLog._id, {
      $set: { status: "disputed" },
    });

    console.log(
      `[Webhook] Dispute letter generated for worker=${worker._id} ` +
        `shift=${shiftLog._id} shortfall=Rs.${shiftLog.shortfall}`,
    );

    // 5. Reply with the PDF link and instructions
    await sendWhatsApp(phone, MSG.disputeReady(s3Url));
  } catch (err) {
    console.error(
      `[Webhook] Dispute generation failed for +91${phone}: ${err.message}`,
    );
    await sendWhatsApp(phone, MSG.disputeError);
  }
};

// ─── POST /whatsapp — main entry point ───────────────────────────────────────
router.post(
  "/whatsapp",
  express.urlencoded({ extended: false }), // scoped here — before sig check
  validateTwilioSignature,
  async (req, res) => {
    // Respond 200 TwiML immediately — Twilio retries on timeout (>15s)
    res
      .status(200)
      .set("Content-Type", "text/xml")
      .send("<Response></Response>");

    const rawFrom = req.body.From || "";
    const rawBody = (req.body.Body || "").trim();

    if (!rawFrom) {
      console.warn("[Webhook] No From field — skipping.");
      return;
    }

    const phone = normalisePhone(rawFrom);
    if (!/^\+91\d{10}$/.test(phone)) {
      console.warn(
        `[Webhook] Could not normalise phone "${rawFrom}" — skipping.`,
      );
      return;
    }

    console.log(`[Webhook] Inbound +91${phone}: "${rawBody}"`);

    try {
      const worker = await Worker.findOne({ phone_number: phone });

      // ── Unregistered — run registration flow ─────────────────────────────
      if (!worker) {
        const convState = await getState(phone);
        await handleRegistration(phone, rawBody, convState);
        return;
      }

      // ── Registered ───────────────────────────────────────────────────────
      const convState = await getState(phone);

      // DISPUTE trigger
      if (isDisputeMessage(rawBody)) {
        await handleDispute(phone, worker);
        return;
      }

      // Shift message or pending clarification
      if (
        isShiftMessage(rawBody) ||
        convState?.step === STEPS.AWAIT_SHIFT_CONFIRM
      ) {
        await handleShift(phone, rawBody, worker, convState);
        return;
      }

      // Unrecognised message from registered worker
      await sendWhatsApp(phone, MSG.unknownMessage);
    } catch (err) {
      console.error(
        `[Webhook] Fatal error for +91${phone}: ${err.message}`,
        err.stack,
      );
      try {
        await sendWhatsApp(phone, MSG.errorRetry);
      } catch (_) {
        /* swallow */
      }
    }
  },
);

export default router;
