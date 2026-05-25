'use strict';
// Adaptive difficulty engine — sliding window algorithm
// Pure functions: no DB, no external dependencies

const WINDOW_SIZE = 3;
const MIN_QUESTIONS = 5;
const MAX_QUESTIONS = 10;

/**
 * Compute next difficulty level based on last-N answers.
 *
 * Rules:
 * - 3/3 correct in window → increase by 1 (ceiling: 5)
 * - 0-1/3 correct in window → decrease by 1 (floor: 1)
 * - 2/3 correct → stay the same
 * - Window not yet full (< 3 answers) → no change
 *
 * @param {number} currentDifficulty - Current difficulty (1-5)
 * @param {boolean[]} windowAnswers   - Recent answers (up to last 3), true=correct
 * @returns {number} New difficulty level (1-5)
 */
function computeNextDifficulty(currentDifficulty, windowAnswers) {
  // Only use last 3 answers
  const window = windowAnswers.slice(-WINDOW_SIZE);

  // Not enough data — no change
  if (window.length < WINDOW_SIZE) return currentDifficulty;

  const correctCount = window.filter(Boolean).length;

  if (correctCount === WINDOW_SIZE) {
    // All 3 correct → go up
    return Math.min(5, currentDifficulty + 1);
  } else if (correctCount <= 1) {
    // 0 or 1 correct → go down
    return Math.max(1, currentDifficulty - 1);
  }
  // 2/3 correct → stay
  return currentDifficulty;
}

/**
 * Determine whether the quiz should end.
 *
 * Stopping conditions (all require at least MIN_QUESTIONS first):
 * - 'mastery':       difficulty=5 AND 3/3 correct in window
 * - 'floor':         difficulty=1 AND 0/3 correct in window
 * - 'max_questions': totalAnswered >= MAX_QUESTIONS
 *
 * @param {number}    difficultyLevel - Current difficulty (1-5)
 * @param {boolean[]} windowAnswers   - Recent answers (up to last 3)
 * @param {number}    totalAnswered   - Total questions answered so far
 * @returns {{ end: boolean, reason: 'mastery'|'floor'|'max_questions'|null }}
 */
function shouldEndQuiz(difficultyLevel, windowAnswers, totalAnswered) {
  const window = windowAnswers.slice(-WINDOW_SIZE);
  const correctCount = window.filter(Boolean).length;

  // Hard stop — max questions reached (no minimum check needed)
  if (totalAnswered >= MAX_QUESTIONS) {
    return { end: true, reason: 'max_questions' };
  }

  // Haven't reached minimum — never end early
  if (totalAnswered < MIN_QUESTIONS) {
    return { end: false, reason: null };
  }

  // Mastery ceiling: level 5, full window, all correct
  if (difficultyLevel === 5 && window.length === WINDOW_SIZE && correctCount === WINDOW_SIZE) {
    return { end: true, reason: 'mastery' };
  }

  // Floor: level 1, full window, all wrong
  if (difficultyLevel === 1 && window.length === WINDOW_SIZE && correctCount === 0) {
    return { end: true, reason: 'floor' };
  }

  return { end: false, reason: null };
}

module.exports = { computeNextDifficulty, shouldEndQuiz };
