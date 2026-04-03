/**
 * Centralized scoring constants for classroom coaching reports.
 * Ensures every consumer (GPT analysis, reports, portals) uses the same totals.
 *
 * OECD constants are exported directly for backward compatibility.
 * Multi-framework helpers delegate to framework-registry for other frameworks.
 */

// ─── OECD-specific constants (backward compat) ───────────────────────

const CLASSROOM_MARKS_BASE = 103; // Existing rubric without lesson plan criteria
const LP_CRITERIA_MARKS = 14;     // Additional marks unlocked when LP is available
const CLASSROOM_MARKS_WITH_LP = CLASSROOM_MARKS_BASE + LP_CRITERIA_MARKS;
const DEBRIEF_MARKS = 15;
const PRIOR_FEEDBACK_MARKS = 5;

// ─── Multi-framework helpers ─────────────────────────────────────────

/**
 * Get max marks for any registered framework.
 * @param {string} frameworkKey - Framework key (oecd, hots, teach, fico)
 * @returns {number} Max marks for that framework
 */
function getFrameworkMaxMarks(frameworkKey) {
  const { getFramework } = require('../services/coaching/frameworks/framework-registry');
  return getFramework(frameworkKey).maxMarks;
}

/**
 * Get display name for any registered framework.
 * @param {string} frameworkKey - Framework key
 * @returns {string} Display name
 */
function getFrameworkDisplayName(frameworkKey) {
  const { getFramework } = require('../services/coaching/frameworks/framework-registry');
  return getFramework(frameworkKey).displayName;
}

module.exports = {
  // OECD constants (backward compat)
  CLASSROOM_MARKS_BASE,
  LP_CRITERIA_MARKS,
  CLASSROOM_MARKS_WITH_LP,
  DEBRIEF_MARKS,
  PRIOR_FEEDBACK_MARKS,
  // Multi-framework
  getFrameworkMaxMarks,
  getFrameworkDisplayName,
};
