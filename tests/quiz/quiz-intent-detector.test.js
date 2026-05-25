/**
 * quiz-intent.detector — deterministic regex priors for quiz intent.
 * No deps to mock.
 */

const { isQuizIntent } = require('../../bot/shared/services/quiz/quiz-intent.detector');

describe('isQuizIntent — positive matches', () => {
  it('matches head-noun "Quiz on X"', () => {
    expect(isQuizIntent('Quiz on photosynthesis grade 5')).toBe(true);
  });

  it('matches header-style "Quiz: ..."', () => {
    expect(isQuizIntent('Quiz: fractions for grade 4')).toBe(true);
  });

  it('matches verb forms (create/make/generate/build/write)', () => {
    expect(isQuizIntent('Create a quiz on fractions')).toBe(true);
    expect(isQuizIntent('Make me a quiz on photosynthesis')).toBe(true);
    expect(isQuizIntent('Generate 5 question quiz on fractions')).toBe(true);
    expect(isQuizIntent('Build a quiz for class 6')).toBe(true);
  });

  it('matches the "quiz me / quiz the class" idiom', () => {
    expect(isQuizIntent('Quiz me on capital cities')).toBe(true);
    expect(isQuizIntent('Quiz the students on chapter 3')).toBe(true);
  });

  it('matches Roman Urdu "quiz banao"', () => {
    expect(isQuizIntent('quiz banao maths ka')).toBe(true);
    expect(isQuizIntent('5 question quiz banayen')).toBe(true);
  });
});

describe('isQuizIntent — negative dominance + non-matches', () => {
  it('treats "lesson plan ... quiz" as a lesson-plan request, not a quiz', () => {
    expect(isQuizIntent('create a lesson plan that ends with a quiz')).toBe(false);
  });

  it('does not match incidental mentions of the word quizzes', () => {
    expect(isQuizIntent('Quizzes are fun but I want a lesson plan')).toBe(false);
  });

  it('does not match unrelated requests', () => {
    expect(isQuizIntent('Make a presentation on the water cycle')).toBe(false);
    expect(isQuizIntent('How do I take attendance?')).toBe(false);
  });

  it('handles empty / non-string input safely', () => {
    expect(isQuizIntent('')).toBe(false);
    expect(isQuizIntent(null)).toBe(false);
    expect(isQuizIntent(undefined)).toBe(false);
    expect(isQuizIntent(42)).toBe(false);
  });
});
