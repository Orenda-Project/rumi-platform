/**
 * Centralized scoring constants for classroom coaching reports.
 * Ensures every consumer (GPT analysis, reports, portals) uses the same totals.
 */

require('dotenv').config();

const CLASSROOM_MARKS_BASE = 48; // HOTS COT: 16 indicators × 3 max marks each
const LP_CRITERIA_MARKS = 0;     // HOTS framework has no LP-specific bonus criteria
const CLASSROOM_MARKS_WITH_LP = CLASSROOM_MARKS_BASE + LP_CRITERIA_MARKS;
const DEBRIEF_MARKS = 15;
const PRIOR_FEEDBACK_MARKS = 5;

module.exports = {
  CLASSROOM_MARKS_BASE,
  LP_CRITERIA_MARKS,
  CLASSROOM_MARKS_WITH_LP,
  DEBRIEF_MARKS,
  PRIOR_FEEDBACK_MARKS,
};

