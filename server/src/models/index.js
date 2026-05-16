/**
 * models/index.js — barrel export for all Mongoose models
 *
 * Import from here in services and routes:
 *   import { Worker, ShiftLog, WageRule } from "../models/index.js";
 */

export { default as Worker } from "./Worker.js";
export { default as Employer } from "./Employer.js";
export { default as ShiftLog } from "./ShiftLog.js";
export { default as WageRule } from "./WageRule.js";
export { default as DisputeLetter } from "./DisputeLetter.js";
export { default as EmployerWorker } from "./EmployerWorker.js";

// Re-export shared enum constants so services don't import from individual models
export { OCCUPATION_ENUM, LANGUAGE_ENUM } from "./Worker.js";
