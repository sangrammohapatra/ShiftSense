/**
 * services/nlpParser.js — Claude AI shift message parser
 *
 * Calls the Anthropic Claude API to extract structured shift data from the
 * free-text WhatsApp messages workers send. Workers write naturally in Hindi,
 * English, or a mix ("shift 9 baje se 6 baje tak construction") and this
 * service normalises that into a structured object the rules engine can use.
 *
 * The system prompt is tightly constrained to return ONLY a JSON object —
 * no preamble, no markdown fences, no explanation. The response is parsed
 * safely and validated before being returned to the caller.
 *
 * Return shape:
 *   Success: { success: true,  data: { shift_date, start_hour, end_hour, occupation, state } }
 *   Failure: { success: false, reason: string }
 *
 * "Ambiguous" means one or more of start_hour / end_hour came back null —
 * the caller is responsible for asking a clarifying question and retrying.
 */

import Anthropic from "@anthropic-ai/sdk";

// ─── Lazy client (same pattern as notifier.js) ────────────────────────────────
let _client = null;
const getClient = () => {
  if (!_client) {
    const apiKey = process.env.CLAUDE_API_KEY;
    if (!apiKey) throw new Error("CLAUDE_API_KEY is not set.");
    _client = new Anthropic({ apiKey });
  }
  return _client;
};

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
  "state": "<2-letter Indian state code> or null"
}

Rules:
- shift_date: default to today's date (IST) if not mentioned. "kal" = yesterday. "aaj" = today.
- start_hour / end_hour: convert to 24-hour integers. "9am" → 9, "6pm" → 18, "raat 10 baje" → 22.
  If time is genuinely ambiguous (e.g. just "morning" with no hour), return null.
- end_hour may exceed 23 for overnight shifts (e.g. shift ends at 2am next day → 26).
- occupation: infer from message or worker context. null if truly unclear.
- state: only set if explicitly mentioned in the message. null otherwise.
- Never add any explanation, markdown, or text outside the JSON object.
- Never return partial JSON. If you cannot parse anything useful, return:
  {"shift_date":null,"start_hour":null,"end_hour":null,"occupation":null,"state":null}`;

// ─── Today's date in IST (UTC+5:30) ──────────────────────────────────────────
const todayIST = () => {
  const now = new Date();
  // Add 5h 30m to UTC to get IST
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  return ist.toISOString().slice(0, 10); // "YYYY-MM-DD"
};

/**
 * Validates that the parsed JSON from Claude has the expected shape.
 * Returns an array of missing/invalid field names (empty = valid).
 *
 * @param {object} obj
 * @returns {string[]} Array of invalid field names
 */
const validateParsed = (obj) => {
  const issues = [];

  if (typeof obj !== "object" || obj === null) return ["root"];

  // start_hour and end_hour must be integers 0-47 OR null
  for (const field of ["start_hour", "end_hour"]) {
    if (obj[field] !== null) {
      if (!Number.isInteger(obj[field]) || obj[field] < 0 || obj[field] > 47) {
        issues.push(field);
      }
    }
  }

  // occupation must be a valid enum value or null
  const VALID_OCC = [
    "construction",
    "security",
    "domestic",
    "factory",
    "driver",
    null,
  ];
  if (!VALID_OCC.includes(obj.occupation)) issues.push("occupation");

  // state must be 2-letter string or null
  if (
    obj.state !== null &&
    !/^[A-Z]{2}$/.test(String(obj.state).toUpperCase())
  ) {
    issues.push("state");
  }

  return issues;
};

/**
 * Parses a raw WhatsApp shift message using Claude AI.
 *
 * @param {string} rawText          The worker's WhatsApp message
 * @param {string} workerState      The worker's registered state (2-letter code)
 * @param {string} workerOccupation The worker's registered occupation
 * @returns {Promise<{ success: boolean, data?: object, reason?: string, ambiguous?: boolean }>}
 */
export const parseShiftMessage = async (
  rawText,
  workerState,
  workerOccupation,
) => {
  const today = todayIST();

  // Enrich the user message with worker context so Claude can fill defaults
  const userMessage =
    `Today's date (IST): ${today}\n` +
    `Worker's registered state: ${workerState}\n` +
    `Worker's registered occupation: ${workerOccupation}\n\n` +
    `Worker's message: "${rawText}"`;

  try {
    const response = await getClient().messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 256, // JSON response is tiny — keep token budget low
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    });

    // Extract text content from the response
    const rawContent = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("")
      .trim();

    // Strip markdown fences if Claude includes them despite instructions
    const jsonString = rawContent
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    let parsed;
    try {
      parsed = JSON.parse(jsonString);
    } catch (parseErr) {
      console.error(
        `[NLPParser] JSON parse failed. Raw Claude output: "${rawContent}"`,
      );
      return {
        success: false,
        reason:
          "Claude returned non-JSON output. Please rephrase your shift message.",
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

    // Apply defaults: fill null state from worker profile
    if (!parsed.state && workerState) parsed.state = workerState.toUpperCase();
    if (!parsed.occupation && workerOccupation)
      parsed.occupation = workerOccupation;

    // Use today as fallback if Claude returned null for date
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
    console.error(`[NLPParser] Claude API error: ${err.message}`);
    return {
      success: false,
      reason: "AI parsing service temporarily unavailable. Please try again.",
    };
  }
};
