/**
 * Centralized scoring constants for classroom coaching reports.
 * Ensures every consumer (GPT analysis, reports, portals) uses the same totals.
 */

require('dotenv').config();

const CLASSROOM_MARKS_BASE = 103; // Existing rubric without lesson plan criteria
const LP_CRITERIA_MARKS = 14;     // Additional marks unlocked when LP is available
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

