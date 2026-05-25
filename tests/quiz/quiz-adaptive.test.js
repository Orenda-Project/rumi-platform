/**
 * quiz-adaptive — pure adaptive-difficulty engine.
 * No deps to mock (pure functions).
 */

const { computeNextDifficulty, shouldEndQuiz } = require('../../bot/shared/services/quiz/quiz-adaptive');

describe('computeNextDifficulty', () => {
  it('does not change difficulty until the window is full (< 3 answers)', () => {
    expect(computeNextDifficulty(3, [])).toBe(3);
    expect(computeNextDifficulty(3, [true])).toBe(3);
    expect(computeNextDifficulty(3, [true, true])).toBe(3);
  });

  it('increases by 1 when all 3 in the window are correct', () => {
    expect(computeNextDifficulty(3, [true, true, true])).toBe(4);
  });

  it('caps the increase at 5', () => {
    expect(computeNextDifficulty(5, [true, true, true])).toBe(5);
  });

  it('decreases by 1 when 0 or 1 of 3 are correct', () => {
    expect(computeNextDifficulty(3, [false, false, false])).toBe(2);
    expect(computeNextDifficulty(3, [true, false, false])).toBe(2);
  });

  it('floors the decrease at 1', () => {
    expect(computeNextDifficulty(1, [false, false, false])).toBe(1);
  });

  it('stays the same on 2/3 correct', () => {
    expect(computeNextDifficulty(3, [true, true, false])).toBe(3);
  });

  it('only considers the last 3 answers in a longer history', () => {
    // earlier wrongs ignored; last 3 are all correct → up
    expect(computeNextDifficulty(2, [false, false, true, true, true])).toBe(3);
  });
});

describe('shouldEndQuiz', () => {
  it('hard-stops at MAX_QUESTIONS (10) regardless of window', () => {
    expect(shouldEndQuiz(3, [true, false, true], 10)).toEqual({ end: true, reason: 'max_questions' });
  });

  it('never ends before the MIN_QUESTIONS (5) floor', () => {
    expect(shouldEndQuiz(5, [true, true, true], 3)).toEqual({ end: false, reason: null });
    expect(shouldEndQuiz(1, [false, false, false], 4)).toEqual({ end: false, reason: null });
  });

  it('ends on mastery: level 5 + full window all correct (after minimum)', () => {
    expect(shouldEndQuiz(5, [true, true, true], 6)).toEqual({ end: true, reason: 'mastery' });
  });

  it('does not end on mastery if not at level 5', () => {
    expect(shouldEndQuiz(4, [true, true, true], 6)).toEqual({ end: false, reason: null });
  });

  it('ends on floor: level 1 + full window all wrong (after minimum)', () => {
    expect(shouldEndQuiz(1, [false, false, false], 6)).toEqual({ end: true, reason: 'floor' });
  });

  it('does not end mid-range after the minimum', () => {
    expect(shouldEndQuiz(3, [true, true, false], 7)).toEqual({ end: false, reason: null });
  });
});
