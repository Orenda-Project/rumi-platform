/**
 * The exam-checker conversation from "confirm the questions" to the results,
 * driven through the orchestrator against an in-memory session row.
 *
 * Three bugs kept a teacher from ever reaching a grade:
 *   1. "✅ Yes, correct" on the question list was ignored: the step re-sent the
 *      same prompt for ANY message, so every message — the button, "hi" —
 *      looped. The list itself was never shown either: only the button body
 *      ("Confirm or edit the questions.") reached the teacher.
 *   2. After an answer was saved, the next prompt was built from the session
 *      as it was BEFORE the save, so Q1 was asked again and the teacher's next
 *      reply was filed under Q2.
 *   3. Results were delivered from the session as it was before grading, so
 *      delivery saw no grades and no marked pages.
 */

jest.mock('pdfkit', () => ({}), { virtual: true });
jest.mock('canvas', () => ({ registerFont: () => {}, loadImage: jest.fn(), createCanvas: jest.fn() }), { virtual: true });
jest.mock('../../bot/shared/config/supabase', () => ({ from: jest.fn() }));
jest.mock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
jest.mock('../../bot/shared/config/branding', () => ({ portalUrl: () => null }));

const mockRow = {};
const clone = (v) => JSON.parse(JSON.stringify(v));
jest.mock('../../bot/shared/services/exam-checker/exam-session.service', () => ({
  // Every read hands out a fresh copy, as a database read does: a caller that
  // keeps using an old copy does not see later writes.
  getOrCreate: jest.fn(async () => clone(mockRow)),
  getById: jest.fn(async () => clone(mockRow)),
  updateStatus: jest.fn(async (id, status) => { mockRow.status = status; return clone(mockRow); }),
  update: jest.fn(async (id, patch) => { Object.assign(mockRow, clone(patch)); return clone(mockRow); }),
  addAnswer: jest.fn(async (id, questionId, answer) => {
    const scheme = mockRow.marking_scheme || { questions: [], totalMarks: 0 };
    scheme.questions = scheme.questions.filter((q) => q.id !== questionId);
    scheme.questions.push({ id: questionId, answer: answer.answer, marks: 1, type: 'short' });
    scheme.totalMarks = scheme.questions.length;
    mockRow.marking_scheme = scheme;
  }),
}));

const mockGradeBatch = jest.fn();
jest.mock('../../bot/shared/services/exam-checker/grading.service', () => ({ gradeBatch: (...a) => mockGradeBatch(...a) }));
const mockAnnotateBatch = jest.fn();
jest.mock('../../bot/shared/services/exam-checker/annotation.service', () => ({ annotateBatch: (...a) => mockAnnotateBatch(...a) }));
const mockSendResults = jest.fn(async () => {});
jest.mock('../../bot/shared/services/exam-checker/delivery.service', () => ({ sendResults: (...a) => mockSendResults(...a) }));

const { ExamCheckerOrchestrator, SESSION_STATES } = require('../../bot/shared/services/exam-checker/exam-checker.orchestrator');

const USER = 'user-1';
const button = (buttonId) => ({ type: 'button', buttonId });
const textMsg = (text) => ({ type: 'text', text });
const say = (msg) => ExamCheckerOrchestrator.process(msg, USER, '15550001111');
const shown = (r) => [r.text, r.interactive?.body?.text].filter(Boolean).join('\n');

beforeEach(() => {
  jest.clearAllMocks();
  for (const k of Object.keys(mockRow)) delete mockRow[k];
  Object.assign(mockRow, {
    id: 'exam-1',
    user_id: USER,
    status: SESSION_STATES.DETECTING_QUESTIONS,
    confirmed_students: [{ name: 'Ayesha', pageNumbers: [1] }],
    detected_questions: [
      { id: 'Q1', type: 'short_answer', text: '۲ × ۴ = ؟' },
      { id: 'Q2', type: 'short_answer', text: 'پاکستان کا دارالحکومت' },
    ],
    marking_scheme: null,
  });
});

describe('confirming the questions', () => {
  it('shows the detected questions in the message the teacher actually receives', async () => {
    const r = await say(textMsg('hi'));
    expect(r.interactive.body.text).toContain('۲ × ۴ = ؟');
    expect(r.interactive.body.text).toContain('پاکستان کا دارالحکومت');
    expect(mockRow.status).toBe(SESSION_STATES.DETECTING_QUESTIONS);
  });

  it('"✅ Yes, correct" moves on to the answer key and asks for Q1', async () => {
    const r = await say(button('ech_questions_correct'));
    expect(mockRow.status).toBe(SESSION_STATES.COLLECTING_ANSWERS);
    expect(shown(r)).toMatch(/^Q1:/m);
  });

  it('"✏️ Edit Qs" says how to correct the list instead of repeating the question', async () => {
    const r = await say(button('ech_questions_edit'));
    expect(shown(r)).not.toMatch(/Confirm or edit the questions/);
    expect(shown(r)).toMatch(/\/cancel/);
  });
});

describe('right after the papers are read', () => {
  it('lists the questions it just found, not the empty list it started with', async () => {
    jest.isolateModules(() => {});
    const OCRService = require('../../bot/shared/services/exam-checker/ocr.service');
    const QuestionDetectorService = require('../../bot/shared/services/exam-checker/question-detector.service');
    jest.spyOn(OCRService, 'extractBatch').mockResolvedValue({ pages: [], provider: 'gemini-3.5-flash', averageConfidence: 0.98 });
    jest.spyOn(QuestionDetectorService, 'analyze').mockResolvedValue({
      students: [{ name: 'Ayesha', pageNumbers: [1] }],
      questions: [{ id: 'Q1', type: 'short_answer', text: 'دن کا متضاد' }],
    });
    delete process.env.EXAM_CHECKER_STUDENTS_FLOW_ID;
    Object.assign(mockRow, {
      status: SESSION_STATES.COLLECTING_IMAGES,
      detected_questions: null,
      confirmed_students: null,
      original_images: [{ url: 'file:///tmp/exam_checker/images/u/p.jpg', pageNumber: 1 }],
    });

    const r = await say(button('ech_process_now'));

    expect(mockRow.status).toBe(SESSION_STATES.DETECTING_QUESTIONS);
    // Grading reads each student's answers from the saved page readings.
    expect(mockRow.ocr_results).toEqual({ pages: [], provider: 'gemini-3.5-flash', averageConfidence: 0.98 });
    expect(r.interactive.body.text).toContain('I found 1 question');
    expect(r.interactive.body.text).toContain('دن کا متضاد');
  });
});

describe('collecting the answer key', () => {
  it('asks Q2 after Q1 is answered, files each answer under its own question, then shows the scheme', async () => {
    await say(button('ech_questions_correct'));

    const afterQ1 = await say(textMsg('۸'));
    expect(shown(afterQ1)).toMatch(/^Q2:/m);

    const afterQ2 = await say(textMsg('اسلام آباد'));
    expect(mockRow.marking_scheme.questions).toEqual([
      expect.objectContaining({ id: 'Q1', answer: '۸' }),
      expect.objectContaining({ id: 'Q2', answer: 'اسلام آباد' }),
    ]);
    expect(mockRow.status).toBe(SESSION_STATES.CONFIRMING_SCHEME);
    // With buttons, only the interactive body reaches the teacher.
    expect(afterQ2.interactive.body.text).toContain('اسلام آباد');
    expect(afterQ2.interactive.action.buttons.map((b) => b.reply.id)).toContain('ech_start_grading');
  });
});

describe('editing the answer key', () => {
  it('"✏️ Edit scheme" starts the answer key again from Q1 instead of repeating the summary', async () => {
    mockRow.status = SESSION_STATES.CONFIRMING_SCHEME;
    mockRow.marking_scheme = { questions: [{ id: 'Q1', answer: '7', marks: 1 }, { id: 'Q2', answer: 'x', marks: 1 }], totalMarks: 2 };

    const r = await say(button('ech_edit_scheme'));

    expect(mockRow.status).toBe(SESSION_STATES.COLLECTING_ANSWERS);
    expect(mockRow.marking_scheme).toBeNull();
    expect(shown(r)).toMatch(/^Q1:/m);
  });
});

describe('grading and delivery', () => {
  it('delivers the grades and marked pages it just produced', async () => {
    mockRow.status = SESSION_STATES.CONFIRMING_SCHEME;
    mockRow.marking_scheme = { questions: [{ id: 'Q1', answer: '۸', marks: 1 }], totalMarks: 1 };
    const results = { successful: [{ student: { name: 'Ayesha' }, percentage: 0 }], failed: [], summary: { averagePercentage: 0 } };
    const pages = [{ student: 'Ayesha', images: ['file:///tmp/exam_checker/exams/exam-1/a.png'] }];
    mockGradeBatch.mockResolvedValue(results);
    mockAnnotateBatch.mockResolvedValue(pages);

    const r = await say(button('ech_start_grading'));

    expect(mockSendResults).toHaveBeenCalledTimes(1);
    const delivered = mockSendResults.mock.calls[0][0];
    expect(delivered.grading_results).toEqual(results);
    expect(delivered.annotated_images).toEqual(pages);
    expect(r.text).toMatch(/Done! Graded 1 exam/);
    expect(mockRow.status).toBe(SESSION_STATES.COMPLETED);
  });
});
