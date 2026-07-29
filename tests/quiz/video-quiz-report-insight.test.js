'use strict';
/**
 * bd-2335 — the class report should tell a teacher what to reteach tomorrow,
 * with the evidence attached.
 *
 * The video-quiz corpus is unusually well placed for this: 9,150 of its
 * questions carry a written explanation for EACH wrong option, authored against
 * that question. So when a class clusters on one wrong answer we can say not
 * just "16 of 22 missed this" but WHICH wrong answer they chose and WHY that
 * particular mistake happens.
 *
 * Two things are asserted here, and they are the whole point:
 *   - the analysis surfaces the distractor the class actually clustered on;
 *   - the guidance the teacher reads is grounded in that specific evidence,
 *     not a generic "revise the topic" that any quiz could have produced.
 */

jest.mock('../../bot/shared/config/supabase', () => ({ from: jest.fn() }));
jest.mock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
jest.mock('../../bot/shared/utils/structured-logger', () => ({ logEvent: jest.fn() }));

const supabase = require('../../bot/shared/config/supabase');
const report = require('../../bot/shared/services/quiz/video-quiz-report.service');

const QUESTION = {
  id: 'q1',
  question_text: 'A leaf has veins that run parallel to each other. Which group does this clue suggest?',
  option_a: 'Dicot', option_b: 'Rose plant only', option_c: 'Monocot', option_d: null,
  correct_option: 'C',
  option_feedback: {
    correct: 'Nice! Parallel leaf veins point to a monocot.',
    wrong: {
      0: 'A) Good try. You flipped the vein rule: dicots usually have non-parallel veins.',
      1: 'B) Nice try. Rose is just one example, not the group for all parallel-vein leaves.',
    },
  },
};

/** sessions -> answers -> questions, in the order the service reads them. */
function stubChain({ sessions, answers, questions }) {
  supabase.from.mockImplementation((table) => {
    const result = table === 'quiz_sessions' ? sessions
      : table === 'quiz_answers' ? answers
        : table === 'quiz_questions' ? questions : [];
    const chain = {
      select: () => chain,
      eq: () => chain,
      in: () => chain,
      then: (resolve) => resolve({ data: result, error: null }),
    };
    return chain;
  });
}

beforeEach(() => jest.clearAllMocks());

describe('bd-2335 — the report knows which wrong answer the class chose', () => {
  beforeEach(() => {
    stubChain({
      sessions: [{ id: 's1' }, { id: 's2' }, { id: 's3' }, { id: 's4' }],
      answers: [
        // Three of four picked A — a real cluster, not scatter.
        { question_id: 'q1', is_correct: false, selected_option: 'A' },
        { question_id: 'q1', is_correct: false, selected_option: 'A' },
        { question_id: 'q1', is_correct: false, selected_option: 'A' },
        { question_id: 'q1', is_correct: true, selected_option: 'C' },
      ],
      questions: [QUESTION],
    });
  });

  test('it names the distractor the class clustered on', async () => {
    const [hardest] = await report.hardestQuestions('sc-1');
    expect(hardest.wrong).toBe(3);
    expect(hardest.total).toBe(4);
    expect(hardest.top_wrong_option).toBe('A');
    expect(hardest.top_wrong_text).toBe('Dicot');
  });

  test('it carries the written reason that wrong answer happens', async () => {
    const [hardest] = await report.hardestQuestions('sc-1');
    // This sentence was authored against THIS question, for THIS wrong option.
    // It is the difference between "16 missed it" and "16 flipped the rule".
    expect(hardest.misconception).toMatch(/flipped the vein rule/i);
  });

  test('it says what the right answer was, so the teacher need not look it up', async () => {
    const [hardest] = await report.hardestQuestions('sc-1');
    expect(hardest.correct_text).toBe('Monocot');
  });
});

describe('bd-2335 — scattered wrong answers are not reported as a pattern', () => {
  test('no single distractor dominating means no misconception is claimed', async () => {
    stubChain({
      sessions: [{ id: 's1' }, { id: 's2' }, { id: 's3' }, { id: 's4' }],
      answers: [
        { question_id: 'q1', is_correct: false, selected_option: 'A' },
        { question_id: 'q1', is_correct: false, selected_option: 'B' },
        { question_id: 'q1', is_correct: true, selected_option: 'C' },
        { question_id: 'q1', is_correct: true, selected_option: 'C' },
      ],
      questions: [QUESTION],
    });
    const [hardest] = await report.hardestQuestions('sc-1');
    expect(hardest.wrong).toBe(2);
    // One A and one B is a coin toss, not a shared misunderstanding. Claiming a
    // pattern here would send the teacher to reteach the wrong thing.
    expect(hardest.top_wrong_option).toBeNull();
    expect(hardest.misconception).toBeNull();
  });
});

describe('bd-2335 — the guidance is rooted in the evidence, not generic', () => {
  test('the prompt carries the question, the chosen distractor and its reason', () => {
    const prompt = report.buildGuidancePrompt({
      topic: 'Monocots and Dicots',
      grade: '6',
      average: 58,
      finished: 22,
      started: 26,
      hardest: [{
        question_text: QUESTION.question_text,
        wrong: 16, total: 22,
        top_wrong_text: 'Dicot',
        correct_text: 'Monocot',
        misconception: 'You flipped the vein rule: dicots usually have non-parallel veins.',
      }],
    });

    expect(prompt).toContain('parallel to each other');   // the actual question
    expect(prompt).toContain('Dicot');                    // what they picked
    expect(prompt).toContain('flipped the vein rule');    // why that happens
    // A prompt that only knows the average can only produce a generic tip.
    expect(prompt).toMatch(/16 of 22/);
  });

  test('it forbids the textbook openers the cheaper model reached for', () => {
    // Observed, not imagined: run against real corpus data, gpt-4o-mini opened
    // with "In tomorrow's lesson, focus on clarifying the misconception that…",
    // read the scores back, and proposed "categorise various foods" for a quiz
    // full of dal and rice. Each of those is now named and banned.
    const prompt = report.buildGuidancePrompt({
      topic: 'A Balanced Diet', grade: '3', average: 54, finished: 21, started: 24,
      hardest: [{
        question_text: 'Which two food groups should be the greatest amount?',
        wrong: 15, total: 21, top_wrong_text: 'Meat and dairy',
        correct_text: 'Pulses and cereals',
        misconception: 'You made meat and dairy the main foods.',
      }],
    });
    expect(prompt).toMatch(/In tomorrow's lesson/);   // named as forbidden
    expect(prompt).toMatch(/misconception/);          // banned as a WORD to use
    expect(prompt).toMatch(/various examples/);       // banned as a cop-out
    expect(prompt).toMatch(/Do not repeat any score/);
  });

  test('with nothing missed, no guidance is requested at all', () => {
    const prompt = report.buildGuidancePrompt({
      topic: 'Monocots and Dicots', average: 96, finished: 22, started: 22, hardest: [],
    });
    expect(prompt).toBeNull();
  });
});
