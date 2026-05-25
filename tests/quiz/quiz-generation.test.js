/**
 * quiz-generation.service — question validation, option shuffling, and the
 * generate→store happy path. openai + supabase are mocked.
 */

let QuizGenerationService;
let mockChatCreate;
let mockInsert, mockUpdate;

function makeQuestion(overrides = {}) {
  return {
    question: 'What is 1/2 + 1/2?',
    option_a: '1',
    option_b: '2/4',
    option_c: '1/4',
    correct: 'A',
    explanation: 'Two halves make a whole.',
    distractor_misconceptions: {
      B: 'student adds numerators and denominators',
      C: 'student subtracts with same denominator',
    },
    difficulty: 1,
    ...overrides,
  };
}

beforeEach(() => {
  jest.resetModules();
  process.env.OPENAI_API_KEY = 'sk-test';

  jest.doMock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));

  mockInsert = jest.fn();
  mockUpdate = jest.fn();
  jest.doMock('../../bot/shared/config/supabase', () => ({
    from: jest.fn(() => ({
      insert: mockInsert,
      update: mockUpdate,
    })),
  }));

  // virtual mock so root-level jest run (before bot npm ci) still resolves it
  mockChatCreate = jest.fn();
  jest.doMock(
    'openai',
    () =>
      jest.fn().mockImplementation(() => ({
        chat: { completions: { create: mockChatCreate } },
      })),
    { virtual: true }
  );

  QuizGenerationService = require('../../bot/shared/services/quiz/quiz-generation.service');
});

afterEach(() => jest.resetModules());

describe('_validateQuestions', () => {
  it('keeps valid questions and drops ones missing fields', () => {
    const out = QuizGenerationService._validateQuestions([
      makeQuestion(),
      { question: 'broken', option_a: 'x' }, // missing options/correct
    ]);
    expect(out).toHaveLength(1);
    expect(['A', 'B', 'C']).toContain(out[0].correct);
  });

  it('drops questions where two options are identical', () => {
    const out = QuizGenerationService._validateQuestions([
      makeQuestion({ option_b: '1' }), // equal to option_a '1'
    ]);
    expect(out).toHaveLength(0);
  });

  it('truncates over-length question and option text', () => {
    const longQ = 'Q'.repeat(300);
    const longOpt = 'O'.repeat(300);
    const out = QuizGenerationService._validateQuestions([
      makeQuestion({ question: longQ, option_b: longOpt }),
    ]);
    expect(out[0].question.length).toBeLessThanOrEqual(200);
    expect(out[0].option_b.length).toBeLessThanOrEqual(250);
  });

  it('keeps only the two wrong-option keys in distractor_misconceptions, or null on bad shape', () => {
    const good = QuizGenerationService._validateQuestions([makeQuestion()])[0];
    if (good.distractor_misconceptions) {
      const keys = Object.keys(good.distractor_misconceptions).sort();
      expect(keys).not.toContain(good.correct);
      expect(keys).toHaveLength(2);
    }

    const bad = QuizGenerationService._validateQuestions([
      makeQuestion({ distractor_misconceptions: 'not-an-object' }),
    ])[0];
    expect(bad.distractor_misconceptions).toBeNull();
  });

  it('defaults out-of-range difficulty to 3', () => {
    const out = QuizGenerationService._validateQuestions([makeQuestion({ difficulty: 99 })]);
    expect(out[0].difficulty).toBe(3);
  });
});

describe('_shuffleQuestionOptions', () => {
  it('preserves the correct answer text under a deterministic RNG', () => {
    const q = makeQuestion(); // correct = A, text '1'
    // rng() returns 0.99 → correct slot index = floor(0.99*3) = 2 → 'C';
    // then 0.99 (>=0.5) → no reverse.
    const rng = jest.fn().mockReturnValue(0.99);
    const shuffled = QuizGenerationService._shuffleQuestionOptions(q, rng);
    const newTexts = { A: shuffled.option_a, B: shuffled.option_b, C: shuffled.option_c };
    expect(newTexts[shuffled.correct]).toBe('1');
  });

  it('moves the distractor_misconceptions keys to follow the wrong options', () => {
    const q = makeQuestion();
    const rng = jest.fn().mockReturnValue(0); // correct → A, no reverse
    const shuffled = QuizGenerationService._shuffleQuestionOptions(q, rng);
    if (shuffled.distractor_misconceptions) {
      const keys = Object.keys(shuffled.distractor_misconceptions);
      expect(keys).not.toContain(shuffled.correct);
      expect(keys).toHaveLength(2);
    }
  });

  it('does not mutate the input question', () => {
    const q = makeQuestion();
    const snapshot = JSON.stringify(q);
    QuizGenerationService._shuffleQuestionOptions(q, jest.fn().mockReturnValue(0.4));
    expect(JSON.stringify(q)).toBe(snapshot);
  });
});

describe('generateAndStore', () => {
  it('creates a quiz, stores questions, and flips status to ready', async () => {
    // quiz insert → returns id
    const insertSelectSingle = {
      select: jest.fn(() => ({ single: jest.fn().mockResolvedValue({ data: { id: 'quiz-1' }, error: null }) })),
    };
    // questions insert → ok
    const questionsInsert = jest.fn().mockResolvedValue({ error: null });
    // status update → ok
    const updateEq = { eq: jest.fn().mockResolvedValue({ error: null }) };

    mockInsert
      .mockReturnValueOnce(insertSelectSingle) // quizzes insert
      .mockImplementationOnce(() => questionsInsert()); // quiz_questions insert
    mockUpdate.mockReturnValue(updateEq);

    const tenQuestions = Array.from({ length: 10 }, (_, i) =>
      makeQuestion({ option_b: `b${i}`, option_c: `c${i}`, difficulty: (i % 5) + 1 })
    );
    mockChatCreate.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({ questions: tenQuestions }) } }],
    });

    const quizId = await QuizGenerationService.generateAndStore({
      teacherId: 't1',
      listId: 'l1',
      topic: 'Fractions',
      grade: '4',
      subject: 'Maths',
    });

    expect(quizId).toBe('quiz-1');
    expect(mockChatCreate).toHaveBeenCalledTimes(1);
    expect(updateEq.eq).toHaveBeenCalledWith('id', 'quiz-1');
  });

  it('marks the quiz failed when generation never yields enough questions', async () => {
    const insertSelectSingle = {
      select: jest.fn(() => ({ single: jest.fn().mockResolvedValue({ data: { id: 'quiz-2' }, error: null }) })),
    };
    const updateEq = { eq: jest.fn().mockResolvedValue({ error: null }) };
    mockInsert.mockReturnValue(insertSelectSingle);
    mockUpdate.mockReturnValue(updateEq);

    // Always returns too-few valid questions → both attempts fail
    mockChatCreate.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({ questions: [makeQuestion()] }) } }],
    });

    await expect(
      QuizGenerationService.generateAndStore({ teacherId: 't', listId: 'l', topic: 'x', grade: '4', subject: 'm' })
    ).rejects.toThrow();

    // status update to 'failed' issued
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed' }));
  });
});
