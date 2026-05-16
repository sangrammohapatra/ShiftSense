/**
 * middleware/errorHandler.js — ShiftSense global Express error handler
 *
 * Must be registered as the LAST middleware in app.js (4-argument signature).
 * Catches all errors passed via next(err) from route handlers and middleware.
 *
 * Error type mapping:
 *   Mongoose ValidationError → 400 Bad Request
 *   Mongoose CastError       → 400 Bad Request (invalid ObjectId)
 *   MongoDB duplicate key    → 409 Conflict
 *   JWT TokenExpiredError    → 401 Unauthorized
 *   JWT JsonWebTokenError    → 401 Unauthorized
 *   Everything else          → 500 Internal Server Error
 *
 * Stack traces are never exposed in production (NODE_ENV === "production").
 * The consistent response shape matches all other API responses:
 *   { success: false, message: string, errors: [], code: string }
 *
 * Error codes let the client take action without string-matching messages:
 *   VALIDATION_ERROR | INVALID_ID | DUPLICATE_KEY |
 *   TOKEN_EXPIRED | INVALID_TOKEN | INTERNAL_ERROR
 */

/**
 * Extracts a user-friendly message and structured errors array from a
 * Mongoose ValidationError. Each path gets its own entry in the array.
 *
 * @param {import("mongoose").Error.ValidationError} err
 * @returns {{ message: string, errors: Array<{field: string, message: string}> }}
 */
const handleValidationError = (err) => {
  const errors = Object.values(err.errors).map((e) => ({
    field:   e.path,
    message: e.message,
  }));
  return {
    message: "Validation failed. Please check the fields below.",
    errors,
  };
};

/**
 * Extracts a friendly message from a MongoDB duplicate key error (code 11000).
 * Attempts to name the duplicated field for better UX.
 *
 * @param {Error & { keyValue?: object }} err
 * @returns {{ message: string, errors: Array<{field: string, message: string}> }}
 */
const handleDuplicateKey = (err) => {
  const field  = err.keyValue ? Object.keys(err.keyValue)[0] : "field";
  const value  = err.keyValue ? Object.values(err.keyValue)[0] : "";
  return {
    message: `A record with this ${field} already exists.`,
    errors:  [{ field, message: `"${value}" is already in use.` }],
  };
};

/**
 * Global Express error-handling middleware.
 * The 4-argument signature is required — Express identifies error handlers
 * by arity. Do not remove the unused `next` parameter.
 *
 * @type {import("express").ErrorRequestHandler}
 */
// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  const isProd = process.env.NODE_ENV === "production";

  // Always log the full error server-side for observability
  if (!isProd || err.statusCode >= 500 || !err.statusCode) {
    console.error(
      `[ErrorHandler] ${req.method} ${req.originalUrl} → ${err.name}: ${err.message}`,
      isProd ? "" : (err.stack ?? "")
    );
  }

  // ── Mongoose ValidationError ───────────────────────────────────────────────
  if (err.name === "ValidationError") {
    const { message, errors } = handleValidationError(err);
    return res.status(400).json({
      success: false,
      message,
      errors,
      code: "VALIDATION_ERROR",
    });
  }

  // ── Mongoose CastError (invalid ObjectId format) ───────────────────────────
  if (err.name === "CastError" && err.kind === "ObjectId") {
    return res.status(400).json({
      success: false,
      message: `Invalid ID format: "${err.value}" is not a valid resource ID.`,
      errors:  [{ field: err.path, message: "Must be a valid 24-character hexadecimal ID." }],
      code:    "INVALID_ID",
    });
  }

  // ── MongoDB duplicate key (unique index violation) ─────────────────────────
  if (err.code === 11000 || err.name === "MongoBulkWriteError") {
    const { message, errors } = handleDuplicateKey(err);
    return res.status(409).json({
      success: false,
      message,
      errors,
      code: "DUPLICATE_KEY",
    });
  }

  // ── JWT TokenExpiredError ──────────────────────────────────────────────────
  if (err.name === "TokenExpiredError") {
    return res.status(401).json({
      success: false,
      message: "Your session has expired. Please log in again.",
      errors:  [],
      code:    "TOKEN_EXPIRED",
    });
  }

  // ── JWT JsonWebTokenError (malformed/invalid token) ────────────────────────
  if (err.name === "JsonWebTokenError") {
    return res.status(401).json({
      success: false,
      message: "Invalid authentication token. Please log in again.",
      errors:  [],
      code:    "INVALID_TOKEN",
    });
  }

  // ── Express body-parser payload too large ──────────────────────────────────
  if (err.type === "entity.too.large") {
    return res.status(413).json({
      success: false,
      message: "Request body too large. Maximum allowed size is 10KB.",
      errors:  [],
      code:    "PAYLOAD_TOO_LARGE",
    });
  }

  // ── Known operational error (thrown with a status code by route handlers) ──
  // e.g. const err = new Error("Not found"); err.statusCode = 404; next(err);
  if (err.statusCode && err.statusCode < 500) {
    return res.status(err.statusCode).json({
      success: false,
      message: err.message || "An error occurred.",
      errors:  err.errors ?? [],
      code:    err.code   ?? "CLIENT_ERROR",
    });
  }

  // ── Generic / unexpected server error ──────────────────────────────────────
  return res.status(500).json({
    success: false,
    // Never expose internal error details in production
    message: isProd
      ? "An unexpected error occurred. Please try again later."
      : err.message || "Internal server error.",
    errors:  [],
    code:    "INTERNAL_ERROR",
    // Include stack only in development for debugging
    ...(isProd ? {} : { stack: err.stack }),
  });
};

export default errorHandler;
