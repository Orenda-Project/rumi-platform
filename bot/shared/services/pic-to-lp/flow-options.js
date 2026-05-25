/**
 * Pic-LP Flow Options
 *
 * Shared dropdown source arrays for the pic-LP confirmation Flow. Both the
 * completion-handler (sends Flow with navigateData) and the Flow endpoint
 * (returns these on INIT/BACK) need the same arrays — keep them here so they
 * can't drift.
 */

function buildGrades() {
  return Array.from({ length: 10 }, (_, i) => ({
    id: String(i + 1),
    title: `Class ${i + 1}`,
  }));
}

// Generic, region-agnostic subject list. The platform is deployed worldwide,
// so the default dropdown uses broadly-applicable primary-school subjects.
// IDs use title-case English (matches the downstream LP prompt subject string).
// Deployments that want a region-specific list can extend buildSubjects().
const DEFAULT_SUBJECTS = [
  { id: 'Math',                  title: 'Math' },
  { id: 'English',               title: 'English' },
  { id: 'Science',               title: 'Science' },
  { id: 'Social Studies',        title: 'Social Studies' },
  { id: 'Languages',             title: 'Languages' },
  { id: 'Religious Education',   title: 'Religious Education' },
  { id: 'General Knowledge',     title: 'General Knowledge' },
  { id: 'Other',                 title: 'Other' },
];

/**
 * @param {string} [region] - ignored; the generic default list is returned.
 *   Kept in the signature for caller compatibility.
 */
function buildSubjects(region) {
  return DEFAULT_SUBJECTS.slice();
}

function buildLanguages() {
  return [
    { id: 'en', title: 'English' },
    { id: 'ur', title: 'Urdu' },
    { id: 'sd', title: 'Sindhi' },
    { id: 'sw', title: 'Kiswahili' },
    // gpt-image-2 renders Arabic Naskh natively — the kieai-prompt-builder
    // treats 'ar' like 'ur' for bilingual layout but skips the
    // "NOT Devanagari NOT Hindi" rule (Arabic is naturally Naskh).
    { id: 'ar', title: 'Arabic' },
  ];
}

// Lesson-plan format options for the teacher-controlled toggle.
// 'concise' → Kie.ai 2-page (~90s English, ~4 min others) — the default path.
// 'detailed' → Gamma 7-page (~5 min, complete teacher guide format) — OPTIONAL
//   legacy arm. Only offered when GAMMA_API_KEY is configured AND the standalone
//   lesson-plan-prompts service is present, since the Detailed path routes
//   through Gamma. Clones without Gamma see only the Concise option (no
//   misleading choice), and the Kie.ai path serves every request.
//
// `description` renders as a small subtitle under each radio option in the
// WhatsApp Flow — Meta does NOT support `helper-text` on RadioButtonsGroup,
// so per-option descriptions are how we surface the timing/length tradeoff.
function buildLessonPlanFormats() {
  const formats = [
    { id: 'concise', title: 'Concise', description: '2 pages, ~90 sec' },
  ];
  if (process.env.GAMMA_API_KEY) {
    formats.push({ id: 'detailed', title: 'Detailed', description: '7 pages, ~5 min — complete teacher guide' });
  }
  return formats;
}

const DEFAULT_LP_FORMAT = 'concise';

module.exports = {
  buildGrades,
  buildSubjects,
  buildLanguages,
  buildLessonPlanFormats,
  DEFAULT_LP_FORMAT,
  DEFAULT_SUBJECTS,
};
