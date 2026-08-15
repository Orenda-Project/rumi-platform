/**
 * openai.service.js#detectIntent / _fallbackIntentDetection — the "quiz"
 * category. Added as defense-in-depth alongside isQuizIntent() (the real,
 * deterministic gate checked earlier in text-message.handler.js): before
 * this fix, the LLM prompt only recognized {lesson_plan, presentation,
 * video, general} — "quiz" was not a legal output at all, and the prompt's
 * own few-shot examples explicitly taught "topic + grade" phrasing (which a
 * quiz request like "quiz on X for grade Y" also matches) to map to
 * lesson_plan. See tests/quiz/quiz-intent-detector.test.js for the primary
 * regex-based gate this backs up.
 */

let createChatCompletion;

function loadService() {
  jest.resetModules();
  createChatCompletion = jest.fn();
  jest.doMock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
  // openai.service.js requires bot-helpers.js (for getConversationHistory),
  // which requires the real config/supabase.js -> @supabase/supabase-js — a
  // bot/-only dependency CI installs AFTER root `npm test` runs (see
  // CLAUDE.md's "TDD" note). Mocking supabase here, same as every other
  // suite that touches bot-helpers.js, keeps this test from needing that
  // package installed at all.
  jest.doMock('../../bot/shared/config/supabase', () => ({ from: jest.fn() }));
  jest.doMock('../../bot/shared/services/llm-client', () => ({
    getClient: () => ({ chat: { completions: { create: createChatCompletion } } }),
  }));
  // eslint-disable-next-line global-require
  return require('../../bot/shared/services/openai.service');
}

afterEach(() => jest.resetModules());

describe('detectIntent — quiz category', () => {
  it('returns {type: "quiz"} when the LLM classifies the message as quiz', async () => {
    const OpenAIService = loadService();
    createChatCompletion.mockResolvedValue({ choices: [{ message: { content: 'quiz' } }] });

    const result = await OpenAIService.detectIntent('create a quiz on operating systems for grade 12');
    expect(result).toEqual({ type: 'quiz', message: 'create a quiz on operating systems for grade 12' });
  });

  it('falls back to keyword detection (still recognizing quiz) when the LLM call throws', async () => {
    const OpenAIService = loadService();
    createChatCompletion.mockRejectedValue(new Error('rate limited'));

    const result = await OpenAIService.detectIntent('quiz banao on fractions');
    expect(result.type).toBe('quiz');
  });
});

describe('_fallbackIntentDetection — quiz keyword', () => {
  it('recognizes "quiz" ahead of the lesson-plan keyword list', () => {
    const OpenAIService = loadService();
    expect(OpenAIService._fallbackIntentDetection('create a quiz on operating systems for grade 12').type).toBe('quiz');
  });

  it('recognizes the Urdu "کوئز" keyword', () => {
    const OpenAIService = loadService();
    expect(OpenAIService._fallbackIntentDetection('کوئز بنائیں').type).toBe('quiz');
  });

  it('still falls back to lesson_plan for a message with no quiz keyword', () => {
    const OpenAIService = loadService();
    expect(OpenAIService._fallbackIntentDetection('lesson plan on photosynthesis').type).toBe('lesson_plan');
  });
});
