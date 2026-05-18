/**
 * services/nlpParser.js — Gemini AI shift message parser
 *
 * Calls Google Gemini API to extract structured shift data from the
 * free-text WhatsApp messages workers send. Workers write naturally in Hindi,
 * English, or a mix ("shift 9 baje se 6 baje tak construction") and this
 * service normalises that into a structured object the rules engine can use.
 *
 * The system prompt is tightly constrained to return ONLY a JSON object —
 * no preamble, no markdown fences, no explanation. The response is parsed
 * safely and validated before being returned to the caller.
 *
 * Return shape:
 *   Success: { success: true,  data: { shift_date, start_hour, end_hour, occupation, state, claimed_amount } }
 *   Failure: { success: false, reason: string }
 * Parses worker shift messages into structured fields.
 *
 * Strategy:
 * 1. Fast deterministic parser for common shift formats.
 * 2. Gemini structured-output fallback for free-form messages.
 * 3. Robust JSON extraction + validation before returning.
 */

const GEMINI_MODEL = "gemini-2.5-flash";

// ─── System prompt ────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are a shift log parser for Indian informal workers who communicate via WhatsApp.
Workers write messages in Hindi, English, or a mix of both (Hinglish).
Your job is to extract shift details from their message.

Return ONLY a valid JSON object with exactly these fields:
{
  "shift_date": "YYYY-MM-DD",
  "start_hour": <integer 0-23 or null>,
  "end_hour": <integer 0-23 or null>,
  "occupation": "<string from: construction, security, domestic, factory, driver> or null",
  "state": "<2-letter Indian state code> or null",
  "claimed_amount": <number or null>
}

Rules:
- shift_date: default to today's date (IST) if not mentioned. "kal" = yesterday. "aaj" = today.
- start_hour / end_hour: convert to 24-hour integers. "9am" → 9, "6pm" → 18, "raat 10 baje" → 22.
  If time is genuinely ambiguous (e.g. just "morning" with no hour), return null.
- end_hour may exceed 23 for overnight shifts (e.g. shift ends at 2am next day → 26).
- occupation: infer from message or worker context. null if truly unclear.
- state: only set if explicitly mentioned in the message. null otherwise.
- claimed_amount: amount the worker says they received/got/was paid/take-home for that shift. Use a number only when explicitly mentioned. Otherwise null.
- Never add any explanation, markdown, or text outside the JSON object.
- Never return partial JSON. If you cannot parse anything useful, return:
  {"shift_date":null,"start_hour":null,"end_hour":null,"occupation":null,"state":null,"claimed_amount":null}`;

const GEMINI_RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    shift_date: {
      type: ["string", "null"],
      format: "date",
      description: "Shift date in YYYY-MM-DD format, or null.",
    },
    start_hour: {
      type: ["integer", "null"],
      minimum: 0,
      maximum: 23,
      description: "Shift start hour in 24-hour format, or null.",
    },
    end_hour: {
      type: ["integer", "null"],
      minimum: 0,
      maximum: 47,
      description: "Shift end hour in 24-hour format, or null.",
    },
    occupation: {
      type: ["string", "null"],
      enum: ["construction", "security", "domestic", "factory", "driver", null],
      description: "Occupation category, or null.",
    },
    state: {
      type: ["string", "null"],
      description: "2-letter Indian state code if explicitly mentioned, else null.",
    },
    claimed_amount: {
      type: ["number", "null"],
      minimum: 0,
      description: "Amount worker says they received for the shift, or null.",
    },
  },
  required: ["shift_date", "start_hour", "end_hour", "occupation", "state", "claimed_amount"],
  propertyOrdering: ["shift_date", "start_hour", "end_hour", "occupation", "state", "claimed_amount"],
};

const OCCUPATION_KEYWORDS = {
  construction: ["construction", "mason", "labour", "labor", "site", "civil"],
  security: ["security", "guard", "watchman", "chowkidar"],
  domestic: ["domestic", "maid", "household", "housekeeping", "cleaning", "sweeper"],
  factory: ["factory", "manufacturing", "machine", "operator", "plant"],
  driver: ["driver", "driving", "truck", "tempo", "cab", "vehicle"],
};

const TIME_RANGE_REGEX =
  /(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:to|till|tak|se|-|–|—)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i;

const todayIST = () => {
  const now = new Date();
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  return ist.toISOString().slice(0, 10);
};

const shiftDateByOffset = (days) => {
  const now = new Date();
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  ist.setUTCDate(ist.getUTCDate() + days);
  return ist.toISOString().slice(0, 10);
};

const parseIsoDate = (year, month, day) => {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) {
    return null;
  }

  const date = new Date(Date.UTC(y, m - 1, d));
  if (
    date.getUTCFullYear() !== y ||
    date.getUTCMonth() !== m - 1 ||
    date.getUTCDate() !== d
  ) {
    return null;
  }

  return date.toISOString().slice(0, 10);
};

const parseDateFromText = (text) => {
  const iso = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) return parseIsoDate(iso[1], iso[2], iso[3]);

  const dmy = text.match(/\b(\d{2})[\/.-](\d{2})[\/.-](\d{4})\b/);
  if (dmy) return parseIsoDate(dmy[3], dmy[2], dmy[1]);

  if (/\bkal\b/i.test(text)) return shiftDateByOffset(-1);
  if (/\baaj\b/i.test(text) || /\btoday\b/i.test(text)) return todayIST();

  return null;
};

const CLAIMED_AMOUNT_PATTERNS = [
  /\b(?:got|received|paid|payment|take\s*home|takehome|salary|wage|earned|mila|mili|milaa)\s*(?:rs\.?\s*)?(\d{2,6})(?:\.\d{1,2})?\b/i,
  /\b(?:rs\.?\s*)?(\d{2,6})(?:\.\d{1,2})?\s*(?:rupees|rs|paid|payment|take\s*home|takehome|salary|wage|earned|mila|mili|milaa)\b/i,
];

const parseClaimedAmountFromText = (text) => {
  const normalized = String(text || "").replace(/,/g, "");

  for (const pattern of CLAIMED_AMOUNT_PATTERNS) {
    const match = normalized.match(pattern);
    if (!match) continue;

    const value = Number(match[1]);
    if (Number.isFinite(value) && value >= 0) {
      return value;
    }
  }

  return null;
};

const inferOccupation = (text) => {
  const lower = text.toLowerCase();
  for (const [occupation, keywords] of Object.entries(OCCUPATION_KEYWORDS)) {
    if (keywords.some((keyword) => lower.includes(keyword))) {
      return occupation;
    }
  }
  return null;
};

const parseHour = (hourText, meridiem) => {
  let hour = Number(hourText);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return null;

  if (meridiem) {
    const suffix = meridiem.toLowerCase();
    if (suffix === "am") {
      if (hour === 12) hour = 0;
    } else if (suffix === "pm") {
      if (hour < 12) hour += 12;
    }
  }

  return hour;
};

const quickParseShiftMessage = (rawText) => {
  const normalized = String(rawText || "")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();

  const match = normalized.match(TIME_RANGE_REGEX);
  if (!match) return null;

  const startHour = parseHour(match[1], match[3] || match[6] || null);
  let endHour = parseHour(match[4], match[6] || match[3] || null);

  if (startHour === null || endHour === null) return null;
  if (endHour < startHour) endHour += 24;

  return {
    shift_date: parseDateFromText(normalized) || todayIST(),
    start_hour: startHour,
    end_hour: endHour,
    occupation: inferOccupation(normalized),
    state: null,
    claimed_amount: parseClaimedAmountFromText(normalized),
  };
};

const validateParsed = (obj) => {
  const issues = [];

  if (typeof obj !== "object" || obj === null) return ["root"];

  for (const field of ["start_hour", "end_hour"]) {
    if (obj[field] !== null) {
      if (!Number.isInteger(obj[field]) || obj[field] < 0 || obj[field] > 47) {
        issues.push(field);
      }
    }
  }

  const validOcc = ["construction", "security", "domestic", "factory", "driver", null];
  if (!validOcc.includes(obj.occupation)) issues.push("occupation");

  if (
    obj.state !== null &&
    !/^[A-Z]{2}$/.test(String(obj.state).toUpperCase())
  ) {
    issues.push("state");
  }

  if (
    obj.shift_date !== null &&
    !/^\d{4}-\d{2}-\d{2}$/.test(String(obj.shift_date))
  ) {
    issues.push("shift_date");
  }

  if (
    obj.claimed_amount !== null &&
    (!Number.isFinite(obj.claimed_amount) || obj.claimed_amount < 0)
  ) {
    issues.push("claimed_amount");
  }

  return issues;
};

const stripCodeFences = (text) =>
  String(text)
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

const extractJsonObject = (text) => {
  const input = stripCodeFences(text);
  const start = input.indexOf("{");
  if (start === -1) return input;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < input.length; i++) {
    const char = input[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === "{") depth++;
    if (char === "}") {
      depth--;
      if (depth === 0) {
        return input.slice(start, i + 1);
      }
    }
  }

  return input;
};

const parseJsonSafely = (rawContent) => {
  const candidates = [
    stripCodeFences(rawContent),
    extractJsonObject(rawContent),
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // try next candidate
    }
  }

  return null;
};

const callGemini = async (systemPrompt, userMessage) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set.");

  // Use generateContent (non-streaming) — simpler to parse for JSON responses
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

  const body = {
    system_instruction: {
      parts: [{ text: systemPrompt }],
    },
    contents: [
      {
        role: "user",
        parts: [{ text: userMessage }],
      },
    ],
    generationConfig: {
      temperature: 0,
      maxOutputTokens: 320,
      responseFormat: {
        text: {
          mimeType: "application/json",
          schema: GEMINI_RESPONSE_SCHEMA,
        },
      },
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const candidate = data?.candidates?.[0];
  const parts = candidate?.content?.parts ?? [];
  const text = parts
    .map((part) => part?.text ?? "")
    .join("")
    .trim();

  return {
    text,
    finishReason: candidate?.finishReason ?? null,
  };
};

export const parseShiftMessage = async (
  rawText,
  workerState,
  workerOccupation,
) => {
  const today = todayIST();

  const quickParsed = quickParseShiftMessage(rawText);
  if (quickParsed) {
    if (!quickParsed.occupation && workerOccupation) {
      quickParsed.occupation = workerOccupation;
    }
    if (!quickParsed.state && workerState) {
      quickParsed.state = workerState.toUpperCase();
    }

    const ambiguous =
      quickParsed.start_hour === null || quickParsed.end_hour === null;

    console.log(
      `[NLPParser] Parsed locally: ${JSON.stringify(quickParsed)} | ambiguous=${ambiguous}`,
    );

    return {
      success: true,
      ambiguous,
      data: quickParsed,
    };
  }

  const userMessage =
    `Today's date (IST): ${today}\n` +
    `Worker's registered state: ${workerState}\n` +
    `Worker's registered occupation: ${workerOccupation}\n\n` +
    `Worker's message: "${rawText}"`;

  try {
    const geminiResponse = await callGemini(SYSTEM_PROMPT, userMessage);
    const parsed = parseJsonSafely(geminiResponse.text);

    if (!parsed) {
      console.error(
        `[NLPParser] JSON parse failed. finishReason=${geminiResponse.finishReason} raw="${geminiResponse.text.slice(0, 400)}"`,
      );
      return {
        success: false,
        reason:
          "Could not understand your shift message. Please rephrase and try again.",
      };
    }

    // Validate shape
    const issues = validateParsed(parsed);
    if (issues.includes("root")) {
      return {
        success: false,
        reason: "Unexpected response format from AI parser.",
      };
    }

    // Apply defaults from worker profile
    if (!parsed.state && workerState) parsed.state = workerState.toUpperCase();
    if (!parsed.occupation && workerOccupation)
      parsed.occupation = workerOccupation;
    if (typeof parsed.claimed_amount === "undefined") parsed.claimed_amount = null;

    // Fallback date
    if (!parsed.shift_date) parsed.shift_date = today;

    // Detect ambiguity — hours are the critical fields
    const ambiguous = parsed.start_hour === null || parsed.end_hour === null;

    console.log(
      `[NLPParser] Parsed: ${JSON.stringify(parsed)} | ambiguous=${ambiguous}`,
    );

    return {
      success: true,
      ambiguous,
      data: parsed,
    };
  } catch (err) {
    console.error(`[NLPParser] Gemini API error: ${err.message}`);
    return {
      success: false,
      reason: "AI parsing service temporarily unavailable. Please try again.",
    };
  }
};
