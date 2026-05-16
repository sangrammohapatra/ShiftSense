/**
 * middleware/validate.js — express-validator result middleware
 *
 * A thin wrapper that checks the result of express-validator rules and short-
 * circuits the request with a 422 response if any field failed validation.
 *
 * Usage (in any route file):
 *   import { body } from "express-validator";
 *   import validate  from "../middleware/validate.js";
 *
 *   router.post(
 *     "/example",
 *     [
 *       body("email").isEmail().withMessage("Invalid email."),
 *       body("name").notEmpty().withMessage("Name is required."),
 *     ],
 *     validate,           // ← short-circuits here if rules fail
 *     myController,       // ← only runs if validation passes
 *   );
 *
 * Why 422 (Unprocessable Entity) instead of 400 (Bad Request)?
 *   400 means the server couldn't parse the request syntax.
 *   422 means the syntax is fine but the semantic content is invalid — the
 *   correct HTTP status for field validation failures per RFC 4918.
 *   (Some APIs use 400 for both; ShiftSense uses 422 for field errors
 *    and 400 for structural errors like invalid ObjectId format.)
 *
 * Response shape:
 *   {
 *     success: false,
 *     message: "Validation failed. Please check the fields below.",
 *     errors: [{ field: "email", message: "Invalid email." }],
 *     code: "VALIDATION_ERROR"
 *   }
 */

import { validationResult } from "express-validator";

/**
 * Express middleware — validates the accumulated express-validator results.
 *
 * @type {import("express").RequestHandler}
 */
const validate = (req, res, next) => {
  const result = validationResult(req);

  if (result.isEmpty()) {
    // All rules passed — hand off to the next handler
    return next();
  }

  // Map express-validator errors into the standard ShiftSense error shape.
  // `e.path` is the field name (replaces the deprecated `e.param` in v7).
  const errors = result.array().map((e) => ({
    field:   e.path ?? e.param ?? "unknown",
    message: e.msg,
    // Include the rejected value in development for easier debugging
    ...(process.env.NODE_ENV !== "production" && { value: e.value }),
  }));

  return res.status(422).json({
    success: false,
    message: "Validation failed. Please check the fields below.",
    errors,
    code:    "VALIDATION_ERROR",
  });
};

export default validate;
