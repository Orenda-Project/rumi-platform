/**
 * The exam checker's vision engine: two calls to one vision model.
 *
 *   Call A reads the page — the student's answers copied exactly, with a box
 *   around each one — and is NEVER shown the marking scheme. A model that reads
 *   and grades in one pass quietly corrects a wrong answer ("2x3=5" becomes 6)
 *   and then marks it right; keeping the scheme out of the read keeps the copy
 *   honest.
 *   Call B grades the copied text against the scheme, may abstain on a question
 *   it cannot mark from the page, and writes feed-up / feed-back / feed-forward.
 *
 * A page whose answers come back mostly low-confidence is read once more on a
 * stronger model. Each call is a model-registry job, so a deployment moves a
 * model with an env var, not a code change.
 */

const mockCreate = jest.fn();
const mockGetClientForModel = jest.fn();
let mockProvider = 'openrouter';

jest.mock('../../bot/shared/services/llm-client', () => ({
  getClient: () => ({ chat: { completions: { create: mockCreate } } }),
  getClientForModel: (...args) => mockGetClientForModel(...args),
  getProviderInfo: () => ({ provider: mockProvider }),
}));

jest.mock('../../bot/shared/config/supabase', () => ({ from: () => ({}) }));

const mockDownloadFromR2 = jest.fn();
jest.mock('../../bot/shared/storage/r2', () => ({
  isR2Configured: () => true,
  downloadFromR2: (...args) => mockDownloadFromR2(...args),
  extractKeyFromUrl: (url) => url.split('.r2.cloudflarestorage.com/')[1],
}));

const registry = require('../../bot/shared/config/model-registry');

function reply(obj) {
  return { choices: [{ message: { content: JSON.stringify(obj) } }], usage: { total_tokens: 10 } };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockProvider = 'openrouter';
  mockGetClientForModel.mockImplementation((model, { job } = {}) => ({
    client: { chat: { completions: { create: mockCreate } } },
    model: model || registry.resolveModelForJob(job, {}, {}).model,
    job,
  }));
});

describe('model registry — the exam checker jobs', () => {
  it('reads and grades on Gemini 3.5 Flash and escalates hard pages to Gemini 2.5 Pro by default', () => {
    expect(registry.resolveModelForJob('exam.read', {}, {}).model).toBe('google/gemini-3.5-flash');
    expect(registry.resolveModelForJob('exam.grade', {}, {}).model).toBe('google/gemini-3.5-flash');
    expect(registry.resolveModelForJob('exam.readHard', {}, {}).model).toBe('google/gemini-2.5-pro');
  });

  it('lets a deployment move each model with an env var', () => {
    const env = { EXAM_CHECKER_MODEL: 'google/gemini-3.8-flash', EXAM_CHECKER_HARD_MODEL: 'google/gemini-3.1-pro-preview' };
    expect(registry.resolveModelForJob('exam.read', {}, env).model).toBe('google/gemini-3.8-flash');
    expect(registry.resolveModelForJob('exam.grade', {}, env).model).toBe('google/gemini-3.8-flash');
    expect(registry.resolveModelForJob('exam.readHard', {}, env).model).toBe('google/gemini-3.1-pro-preview');
  });

  it('falls back to an OpenAI vision model on LLM_PROVIDER=openai', () => {
    const env = { LLM_PROVIDER: 'openai' };
    expect(registry.resolveModelForJob('exam.read', {}, env).model).toBe('gpt-4.1');
    expect(registry.resolveModelForJob('exam.readHard', {}, env).model).toBe('gpt-4.1');
    expect(registry.resolveModelForJob('exam.grade', {}, env).model).toBe('gpt-4.1');
  });
});

describe('exam-vision — Call A (read the page)', () => {
  const examVision = () => require('../../bot/shared/services/exam-checker/exam-vision.service');

  it('never shows the model a marking scheme or any grading concept', () => {
    const { CALL_A_SYS } = examVision();
    expect(CALL_A_SYS).toMatch(/Transcribe EXACTLY/);
    expect(CALL_A_SYS).toMatch(/"2x3=5", transcribe "5", never "6"/);
    expect(CALL_A_SYS).not.toMatch(/marking scheme/i);
    expect(CALL_A_SYS).not.toMatch(/expected_answer|awarded|verdict/);
  });

  it('sends the image with the read prompt on the exam.read job, at temperature 0, as JSON, with no SDK retries', async () => {
    mockCreate.mockResolvedValueOnce(reply({
      page_meta: { student_name: 'Ayesha', grade: '3', subject: 'Maths' },
      items: [{ question_id: 'q1', question_text: '2x3', answer_text_verbatim: '5', box_2d: [100, 200, 150, 400], script: 'en', confidence: 0.9 }],
    }));
    const page = await examVision().readPage('data:image/png;base64,AAAA');

    expect(mockGetClientForModel).toHaveBeenCalledWith(null, { job: 'exam.read' });
    const [params, options] = mockCreate.mock.calls[0];
    expect(params.model).toBe('google/gemini-3.5-flash');
    expect(params.temperature).toBe(0);
    expect(params.response_format).toEqual({ type: 'json_object' });
    expect(params.messages[0]).toEqual({ role: 'system', content: examVision().CALL_A_SYS });
    const userParts = params.messages[1].content;
    expect(userParts).toEqual(expect.arrayContaining([{ type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } }]));
    expect(JSON.stringify(params.messages)).not.toMatch(/marking scheme/i);
    expect(options).toEqual(expect.objectContaining({ maxRetries: 0 }));
    expect(options.timeout).toBeGreaterThan(0);

    expect(page.page_meta.student_name).toBe('Ayesha');
    expect(page.items[0].answer_text_verbatim).toBe('5');
    expect(page._model).toBe('google/gemini-3.5-flash');
  });

  it('asks OpenRouter for its fastest provider, and leaves that field off on direct OpenAI', async () => {
    mockCreate.mockResolvedValue(reply({ page_meta: {}, items: [] }));
    await examVision().readPage('https://example.org/p.png');
    expect(mockCreate.mock.calls[0][0].provider).toEqual({ sort: 'throughput', allow_fallbacks: true });

    mockProvider = 'openai';
    await examVision().readPage('https://example.org/p.png');
    expect(mockCreate.mock.calls[1][0]).not.toHaveProperty('provider');
  });

  it('throws on a reply that is not JSON, so the worker can tell the teacher', async () => {
    mockCreate.mockResolvedValueOnce({ choices: [{ message: { content: 'Sorry, I cannot read this.' } }] });
    await expect(examVision().readPage('https://example.org/p.png')).rejects.toThrow(/failed to parse JSON/);
  });
});

describe('exam-vision — escalating a hard page', () => {
  const examVision = () => require('../../bot/shared/services/exam-checker/exam-vision.service');
  const item = (confidence) => ({ question_id: 'q', answer_text_verbatim: 'x', confidence });

  it('reads once when most answers are confident', async () => {
    mockCreate.mockResolvedValueOnce(reply({ page_meta: {}, items: [item(0.9), item(0.9), item(0.9), item(0.5)] }));
    const page = await examVision().readPageWithEscalation('https://example.org/p.png');
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(page._model).toBe('google/gemini-3.5-flash');
  });

  it('reads again on the exam.readHard job when more than a quarter of answers are below 0.6', async () => {
    mockCreate
      .mockResolvedValueOnce(reply({ page_meta: {}, items: [item(0.3), item(0.4), item(0.9), item(0.9)] }))
      .mockResolvedValueOnce(reply({ page_meta: {}, items: [item(0.9), item(0.9), item(0.9), item(0.9)] }));
    const page = await examVision().readPageWithEscalation('https://example.org/p.png');
    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(mockGetClientForModel).toHaveBeenLastCalledWith(null, { job: 'exam.readHard' });
    expect(mockCreate.mock.calls[1][0].model).toBe('google/gemini-2.5-pro');
    expect(page._model).toBe('google/gemini-2.5-pro');
  });

  it('needs at least two low-confidence answers before it escalates a short page', async () => {
    mockCreate.mockResolvedValueOnce(reply({ page_meta: {}, items: [item(0.3), item(0.9)] }));
    await examVision().readPageWithEscalation('https://example.org/p.png');
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });
});

describe('exam-vision — Call B (grade the copied answers)', () => {
  const examVision = () => require('../../bot/shared/services/exam-checker/exam-vision.service');

  it('reasons before it grades, may abstain, and never invents fractional marks', () => {
    const { CALL_B_SYS } = examVision();
    expect(CALL_B_SYS).toMatch(/GRADEABLE\?/);
    expect(CALL_B_SYS).toMatch(/verdict="cannot_grade", awarded_marks=0, max_marks=0/);
    expect(CALL_B_SYS).toMatch(/DO NOT copy the student's response into expected_answer/);
    expect(CALL_B_SYS).toMatch(/NEVER invent fractional weights/);
    expect(CALL_B_SYS).toMatch(/feedback_up.*feedback_back.*feedback_forward/s);
  });

  it('sends the scheme and only the copied text (no boxes, no image) on the exam.grade job', async () => {
    mockCreate.mockResolvedValueOnce(reply({ items: [{ question_id: 'Q1', verdict: 'wrong', awarded_marks: 0, max_marks: 1 }], total_awarded: 0, total_max: 1 }));
    const scheme = { questions: [{ id: 'Q1', answer: '6', marks: 1 }] };
    const out = await examVision().gradeAnswers(
      [{ question_id: 'Q1', question_text: '2x3', answer_text_verbatim: '5', box_2d: [1, 2, 3, 4] }],
      scheme,
      { grade: '3', subject: 'Maths' },
    );

    expect(mockGetClientForModel).toHaveBeenCalledWith(null, { job: 'exam.grade' });
    const [params] = mockCreate.mock.calls[0];
    expect(params.messages[0]).toEqual({ role: 'system', content: examVision().CALL_B_SYS });
    const user = params.messages[1].content;
    expect(typeof user).toBe('string');
    expect(user).toContain('grade 3, subject Maths');
    expect(user).toContain(JSON.stringify(scheme));
    expect(user).toContain('"answer_text_verbatim": "5"');
    expect(user).not.toContain('box_2d');
    expect(out.items[0].verdict).toBe('wrong');
    expect(out._model).toBe('google/gemini-3.5-flash');
  });
});

describe('OCRService — an adapter over the vision engine', () => {
  const OCRService = () => require('../../bot/shared/services/exam-checker/ocr.service');

  it('maps a read page into the OCR shape, keeping each answer box and script, and drops the name header', async () => {
    mockCreate.mockResolvedValueOnce(reply({
      page_meta: { student_name: 'Bilal', grade: '4', subject: 'Urdu' },
      items: [
        { question_id: 'student_name_ur', question_text: 'نام', answer_text_verbatim: 'بلال', box_2d: [0, 0, 10, 10], script: 'ur', confidence: 0.9 },
        { question_id: 'q1', question_text: 'Capital of Pakistan', answer_text_verbatim: 'Lahore', box_2d: [100, 200, 150, 600], script: 'en', confidence: 0.8 },
      ],
    }));
    const page = await OCRService().extractSingle('https://example.org/page.jpg');

    expect(page.studentName).toBe('Bilal');
    expect(page.questions).toHaveLength(1);
    expect(page.questions[0]).toEqual(expect.objectContaining({
      number: 'q1', questionText: 'Capital of Pakistan', studentAnswer: 'Lahore', box_2d: [100, 200, 150, 600], script: 'en',
    }));
    expect(page.provider).toBe('gemini-3.5-flash');
    expect(page.metadata.engine).toBe('google/gemini-3.5-flash');
  });

  it('sends a private R2 image as inline data, since the model cannot fetch it', async () => {
    mockDownloadFromR2.mockResolvedValueOnce(Buffer.from('img'));
    mockCreate.mockResolvedValueOnce(reply({ page_meta: {}, items: [] }));
    await OCRService().extractSingle('https://acct.r2.cloudflarestorage.com/exams/s1/p1.png');

    expect(mockDownloadFromR2).toHaveBeenCalledWith('exams/s1/p1.png');
    const sent = JSON.stringify(mockCreate.mock.calls[0][0].messages);
    expect(sent).toContain(`data:image/png;base64,${Buffer.from('img').toString('base64')}`);
  });

  it('no longer carries the Mistral, Chandra or Surya code paths', () => {
    const src = require('fs').readFileSync(require.resolve('../../bot/shared/services/exam-checker/ocr.service'), 'utf8');
    expect(src).not.toMatch(/mistral|chandra|surya/i);
  });
});

describe('GradingService.gradeStudent — one Call B per student', () => {
  const GradingService = () => require('../../bot/shared/services/exam-checker/grading.service');

  const session = {
    id: 's1',
    grade: '3',
    subject: 'Maths',
    ocr_results: {
      pages: [{
        pageNumber: 1,
        questions: [
          { number: 'q1', studentAnswer: '5', box_2d: [100, 200, 150, 500], script: 'en' },
          { number: 'q2', studentAnswer: '12', box_2d: [300, 200, 350, 500], script: 'en' },
          { number: 'q3', studentAnswer: 'cat', box_2d: [500, 200, 550, 500], script: 'en' },
        ],
      }],
    },
  };
  const student = { name: 'Ayesha', pageNumbers: [1] };
  const scheme = { questions: [{ id: 'Q1', answer: '6', marks: 2 }, { id: 'Q2', answer: '12', marks: 2 }, { id: 'Q3', marks: 1 }] };

  it('grades every question in one call, matching q1/Q1 ids, and sums the per-question marks itself', async () => {
    mockCreate.mockResolvedValueOnce(reply({
      items: [
        { question_id: 'Q1', expected_answer: '6', verdict: 'wrong', awarded_marks: 0, max_marks: 2, feedback_up: 'up', feedback_back: 'back', feedback_forward: 'forward' },
        { question_id: 'Q2', expected_answer: '12', verdict: 'correct', awarded_marks: 2, max_marks: 2 },
        { question_id: 'Q3', verdict: 'cannot_grade', awarded_marks: 0, max_marks: 0, feedback_back: 'needs the teacher to read the word aloud' },
      ],
      // The model's own totals are wrong on purpose: they must be ignored.
      total_awarded: 0,
      total_max: 9,
    }));

    const result = await GradingService().gradeStudent(session, student, scheme);

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const user = mockCreate.mock.calls[0][0].messages[1].content;
    expect(user).toContain('"answer_text_verbatim": "5"');
    expect(user).toContain('"answer_text_verbatim": "12"');

    expect(result.marksAwarded).toBe(2);
    expect(result.totalMarks).toBe(4); // cannot_grade drops out of the total
    expect(result.percentage).toBe(50);
    expect(result.cannotGradeCount).toBe(1);

    const [q1, q2, q3] = result.questionResults;
    expect(q1).toEqual(expect.objectContaining({
      questionId: 'Q1', studentAnswer: '5', expectedAnswer: '6', marksAwarded: 0, maxMarks: 2, verdict: 'wrong', pageNumber: 1,
      feedback: 'forward', structuredFeedback: { feedUp: 'up', feedBack: 'back', feedForward: 'forward' },
    }));
    expect(q2).toEqual(expect.objectContaining({ marksAwarded: 2, maxMarks: 2, isCorrect: true }));
    expect(q3).toEqual(expect.objectContaining({ cannotGrade: true, marksAwarded: 0, maxMarks: 0 }));
  });

  it('turns each answer box into the 0-1 position the annotator draws the mark at', async () => {
    mockCreate.mockResolvedValueOnce(reply({ items: [{ question_id: 'Q1', verdict: 'correct', awarded_marks: 2, max_marks: 2 }] }));
    const result = await GradingService().gradeStudent(session, student, { questions: [{ id: 'Q1', marks: 2 }] });
    // box_2d is [ymin, xmin, ymax, xmax] on a 0-1000 grid.
    expect(result.questionResults[0].bbox).toEqual({ x: 0.5, y: 0.1 });
  });

  it('caps a mark the model over-awards at the question maximum', async () => {
    mockCreate.mockResolvedValueOnce(reply({ items: [{ question_id: 'Q1', verdict: 'correct', awarded_marks: 5, max_marks: 2 }] }));
    const result = await GradingService().gradeStudent(session, student, { questions: [{ id: 'Q1', marks: 2 }] });
    expect(result.questionResults[0].marksAwarded).toBe(2);
  });
});
