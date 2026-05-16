/**
 * middleware/auth.js — ShiftSense JWT verification middleware
 *
 * Extracts the Bearer token from the Authorization header, verifies it
 * against JWT_SECRET, and attaches the decoded payload to req.employer.
 *
 * Decoded payload shape (mirrors what auth.routes.js signs):
 *   { id, email, company_name, plan, iat, exp }
 *
 * Usage:
 *   import { verifyToken } from "../middleware/auth.js";
 *   router.get("/me", verifyToken, meHandler);
 */

import jwt from "jsonwebtoken";

/**
 * Sends a standardised 401 response.
 * Kept as a helper to avoid repeating the error shape in every branch.
 *
 * @param {import("express").Response} res
 * @param {string} message
 */
const unauthorized = (res, message) =>
  res.status(401).json({ success: false, message, errors: [] });

/**
 * Express middleware — verify JWT and attach decoded payload to req.employer.
 *
 * @type {import("express").RequestHandler}
 */
export const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;

  // Header must be present and follow the "Bearer <token>" format
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return unauthorized(res, "Access denied. No token provided.");
  }

  const token = authHeader.split(" ")[1];

  if (!token) {
    return unauthorized(res, "Access denied. Malformed Authorization header.");
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // Attach the decoded payload so downstream handlers can read employer info
    // without hitting the database on every request.
    req.employer = decoded;
    next();
  } catch (err) {
    // Distinguish between expired tokens and outright invalid ones so the
    // client can show a "session expired" message vs a generic auth error.
    if (err.name === "TokenExpiredError") {
      return unauthorized(res, "Session expired. Please log in again.");
    }
    return unauthorized(res, "Invalid token. Please log in again.");
  }
};
