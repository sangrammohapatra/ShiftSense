/**
 * routes/auth.js — ShiftSense employer authentication routes
 *
 * Mounted at:  /api/v1/auth
 *
 * POST   /register  — create employer account, return JWT
 * POST   /login     — verify credentials, return JWT
 * GET    /me        — return authenticated employer's profile (protected)
 * PATCH  /me        — update safe profile fields (protected)
 *
 * All handlers follow the response envelope:
 *   Success:  { success: true,  data: { ... } }
 *   Failure:  { success: false, message: "...", errors: [] }
 */

import { Router } from "express";
import jwt from "jsonwebtoken";
import { body, validationResult } from "express-validator";

import { Employer } from "../models/index.js";
import { verifyToken } from "../middleware/auth.js";

const router = Router();

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Signs a JWT for the given employer document.
 * The payload is intentionally minimal — no sensitive fields.
 *
 * @param {import("mongoose").Document} employer
 * @returns {string} Signed JWT
 */
const signToken = (employer) =>
  jwt.sign(
    {
      id: employer._id,
      email: employer.email,
      company_name: employer.company_name,
      plan: employer.plan,
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "7d" },
  );

/**
 * Converts express-validator errors into the standard errors array format
 * and sends a 422 response.
 *
 * @param {import("express").Response} res
 * @param {import("express-validator").Result} result
 */
const sendValidationErrors = (res, result) =>
  res.status(422).json({
    success: false,
    message: "Validation failed. Please check the fields below.",
    errors: result.array().map((e) => ({ field: e.path, message: e.msg })),
  });

/**
 * Strips the password field from an employer document before sending it
 * in a response. Mongoose's `select: false` already excludes it from most
 * queries, but this acts as a safety net for queries that use +password.
 *
 * @param {import("mongoose").Document} employer
 * @returns {Object} Plain employer object without the password key
 */
const sanitizeEmployer = (employer) => {
  const obj = employer.toObject();
  delete obj.password;
  return obj;
};

// ─── Validation rule sets ─────────────────────────────────────────────────────

const registerRules = [
  body("company_name")
    .trim()
    .notEmpty()
    .withMessage("Company name is required.")
    .isLength({ max: 150 })
    .withMessage("Company name must not exceed 150 characters."),

  body("contact_name")
    .trim()
    .notEmpty()
    .withMessage("Contact name is required.")
    .isLength({ max: 100 })
    .withMessage("Contact name must not exceed 100 characters."),

  body("email")
    .trim()
    .notEmpty()
    .withMessage("Email is required.")
    .isEmail()
    .withMessage("Please provide a valid email address.")
    .normalizeEmail(),

  body("password")
    .notEmpty()
    .withMessage("Password is required.")
    .isLength({ min: 8 })
    .withMessage("Password must be at least 8 characters."),

  body("phone")
    .trim()
    .notEmpty()
    .withMessage("Phone number is required.")
    .matches(/^\+?[1-9]\d{7,14}$/)
    .withMessage("Please provide a valid phone number."),

  body("state")
    .trim()
    .notEmpty()
    .withMessage("State is required.")
    .isLength({ min: 2, max: 2 })
    .withMessage("State must be a 2-letter code.")
    .isAlpha()
    .withMessage("State must contain only letters.")
    .toUpperCase(),
];

const loginRules = [
  body("email")
    .trim()
    .notEmpty()
    .withMessage("Email is required.")
    .isEmail()
    .withMessage("Please provide a valid email address.")
    .normalizeEmail(),

  body("password").notEmpty().withMessage("Password is required."),
];

const updateProfileRules = [
  body("company_name")
    .optional()
    .trim()
    .isLength({ min: 1, max: 150 })
    .withMessage("Company name must be 1–150 characters."),

  body("contact_name")
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage("Contact name must be 1–100 characters."),

  body("phone")
    .optional()
    .trim()
    .matches(/^\+?[1-9]\d{7,14}$/)
    .withMessage("Please provide a valid phone number."),

  body("gst_number")
    .optional()
    .trim()
    .toUpperCase()
    .matches(/^\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}[Z]{1}[A-Z\d]{1}$/)
    .withMessage("GST number format is invalid (e.g. 27AAPFU0939F1ZV)."),

  body("state")
    .optional()
    .trim()
    .isLength({ min: 2, max: 2 })
    .withMessage("State must be a 2-letter code.")
    .isAlpha()
    .withMessage("State must contain only letters.")
    .toUpperCase(),

  // Explicitly block disallowed fields with a clear error message
  body("email")
    .not()
    .exists()
    .withMessage("Email cannot be changed via this endpoint."),

  body("password")
    .not()
    .exists()
    .withMessage("Password cannot be changed via this endpoint."),
];

// ─── POST /register ───────────────────────────────────────────────────────────

router.post("/register", registerRules, async (req, res) => {
  // 1. Validate input
  const result = validationResult(req);
  if (!result.isEmpty()) return sendValidationErrors(res, result);

  const { company_name, contact_name, email, password, phone, state } =
    req.body;

  try {
    // 2. Check for duplicate email
    const existing = await Employer.findOne({ email });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: "An account with this email already exists.",
        errors: [{ field: "email", message: "Email is already registered." }],
      });
    }

    // 3. Create employer — password hashing handled by Employer pre-save hook
    const employer = await Employer.create({
      company_name,
      contact_name,
      email,
      password, // raw; bcrypt hook fires on save
      phone,
      state,
    });

    // 4. Sign token and respond
    const token = signToken(employer);

    return res.status(201).json({
      success: true,
      data: {
        token,
        employer: sanitizeEmployer(employer),
      },
    });
  } catch (err) {
    console.error("[POST /auth/register]", err.message);
    return res.status(500).json({
      success: false,
      message: "Registration failed. Please try again.",
      errors: [],
    });
  }
});

// ─── POST /login ──────────────────────────────────────────────────────────────

router.post("/login", loginRules, async (req, res) => {
  // 1. Validate input
  const result = validationResult(req);
  if (!result.isEmpty()) return sendValidationErrors(res, result);

  const { email, password } = req.body;

  try {
    // 2. Fetch employer WITH password (field has select: false on the model)
    const employer = await Employer.findOne({ email }).select("+password");

    // Use a generic message for both "not found" and "wrong password" to
    // avoid leaking whether a given email is registered (enumeration attack).
    const authError = () =>
      res.status(401).json({
        success: false,
        message: "Invalid email or password.",
        errors: [],
      });

    if (!employer) return authError();

    // 3. Compare plaintext password against bcrypt hash
    const isMatch = await employer.comparePassword(password);
    if (!isMatch) return authError();

    // 4. Sign token and respond
    const token = signToken(employer);

    return res.status(200).json({
      success: true,
      data: {
        token,
        employer: sanitizeEmployer(employer),
      },
    });
  } catch (err) {
    console.error("[POST /auth/login]", err.message);
    return res.status(500).json({
      success: false,
      message: "Login failed. Please try again.",
      errors: [],
    });
  }
});

// ─── GET /me ──────────────────────────────────────────────────────────────────

router.get("/me", verifyToken, async (req, res) => {
  try {
    // req.employer.id is set by verifyToken from the JWT payload
    const employer = await Employer.findById(req.employer.id);

    if (!employer) {
      // JWT valid but employer deleted from DB — treat as unauthorised
      return res.status(401).json({
        success: false,
        message: "Account not found. Please log in again.",
        errors: [],
      });
    }

    return res.status(200).json({
      success: true,
      data: { employer: sanitizeEmployer(employer) },
    });
  } catch (err) {
    console.error("[GET /auth/me]", err.message);
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve profile. Please try again.",
      errors: [],
    });
  }
});

// ─── PATCH /me ────────────────────────────────────────────────────────────────

router.patch("/me", verifyToken, updateProfileRules, async (req, res) => {
  // 1. Validate (including blocking email/password fields)
  const result = validationResult(req);
  if (!result.isEmpty()) return sendValidationErrors(res, result);

  // 2. Build update object from only the allowed fields
  const ALLOWED_FIELDS = [
    "company_name",
    "contact_name",
    "phone",
    "gst_number",
    "state",
  ];
  const updates = {};

  for (const field of ALLOWED_FIELDS) {
    // Only include fields the client actually sent — avoid overwriting with undefined
    if (req.body[field] !== undefined) {
      updates[field] = req.body[field];
    }
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({
      success: false,
      message: "No updatable fields were provided.",
      errors: [],
    });
  }

  try {
    const employer = await Employer.findByIdAndUpdate(
      req.employer.id,
      { $set: updates },
      {
        new: true, // return the updated document
        runValidators: true, // enforce schema-level constraints on update
      },
    );

    if (!employer) {
      return res.status(404).json({
        success: false,
        message: "Account not found.",
        errors: [],
      });
    }

    return res.status(200).json({
      success: true,
      data: { employer: sanitizeEmployer(employer) },
    });
  } catch (err) {
    console.error("[PATCH /auth/me]", err.message);
    return res.status(500).json({
      success: false,
      message: "Profile update failed. Please try again.",
      errors: [],
    });
  }
});

export default router;
