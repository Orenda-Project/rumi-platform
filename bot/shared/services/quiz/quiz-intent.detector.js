'use strict';
/**
 * Deterministic regex priors for "the user is asking for a quiz".
 *
 * Two-tier intent detection:
 *   Tier 1 — these regex priors. Cheap, deterministic, no LLM call.
 *            Catches the unambiguous "Quiz on X", "Create a quiz", etc.
 * Tier 2 — OpenAIService.detectIntent (extended in too) for
 *            anything that doesn't match a prior. Returns one of
 *            { lesson_plan, presentation, video, quiz, general }.
 *
 * The priors are intentionally narrow — false positives push teachers
 * into the wrong feature. The LLM is the recall engine; these regexes
 * are the precision engine.
 *
 * Negative dominance: if the message contains "lesson plan" anywhere,
 * we treat it as a lesson-plan request even if "quiz" appears too.
 * Catches "create a lesson plan that ends with a quiz" — the head noun
 * is the LP, the quiz is incidental.
 */

// "Quiz" as the head noun of the message: starts with the word "Quiz"
// at message head, optionally followed by punctuation/whitespace then a
// preposition/topic. Captures:
//   - multi-line Urdu pattern "Quiz\nاسلامیات\nجماعت نہم\n…"
//   - header-style "Quiz: fractions for grade 4"
//   - "Quiz on photosynthesis grade 5"
//   - "Quiz for class 6 maths"
// `\bquiz\b` ensures we don't match "Quizzes are fun" (the word boundary
// fails after "z" because "e" follows — quiz word does not end here).
const QUIZ_HEAD_REGEX = /^\s*quiz\b/i;

// English: create / make / generate / write / build / design / prepare
// + (optional modifier text, up to 40 chars / 4 words) + "quiz".
//
// Matches: "Create a quiz on X", "Generate 5 question quiz on fractions",
//          "Make me a quiz on photosynthesis", "Build a quiz for class 6",
//          "Create addition quiz of 2 digit numbers", "Write 5 quiz of maths".
//
// Non-greedy modifier captures noun phrases like "addition quiz",
// "5 quiz", "small geography quiz". Capped at ~40 chars to avoid
// stretching across unrelated sentences.
const QUIZ_VERB_REGEX = /\b(create|make|generate|write|build|design|prepare)\b[\s\w\-]{0,40}\bquiz\b/i;

// "Quiz me/us/the class/the students" — the "Quiz X on Y" idiom.
const QUIZ_ME_REGEX = /\bquiz\s+(me|us|the\s+(class|students))\b/i;

// Roman Urdu: "quiz banao", "quiz banadijiye", "quiz banayen".
// Urdu script: "کوئز بنائیں" (quiz banao). The bot already accepts
// Urdu/Roman Urdu inputs in other detectors; we mirror that here.
const QUIZ_BANAO_REGEX = /(\bquiz\s+bana[aoyei]+\w*\b)|(کوئز\s*بنا[ئویںے]+\w*)/i;

// Negative override: head noun is "lesson plan", not quiz.
const LP_HEAD_REGEX = /\blesson\s+plan\b/i;

/**
 * Returns true if the message looks like a request to create or send a quiz.
 *
 * @param {string} text
 * @returns {boolean}
 */
function isQuizIntent(text) {
  if (!text || typeof text !== 'string') return false;
  if (LP_HEAD_REGEX.test(text)) return false;
  return (
    QUIZ_HEAD_REGEX.test(text) ||
    QUIZ_VERB_REGEX.test(text) ||
    QUIZ_ME_REGEX.test(text) ||
    QUIZ_BANAO_REGEX.test(text)
  );
}

module.exports = {
  isQuizIntent,
  // Exported for tests + downstream consumers that want fine-grained checks
  _QUIZ_HEAD_REGEX: QUIZ_HEAD_REGEX,
  _QUIZ_VERB_REGEX: QUIZ_VERB_REGEX,
  _QUIZ_ME_REGEX: QUIZ_ME_REGEX,
  _QUIZ_BANAO_REGEX: QUIZ_BANAO_REGEX,
  _LP_HEAD_REGEX: LP_HEAD_REGEX
};
