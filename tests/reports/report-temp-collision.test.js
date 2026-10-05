/**
 * Two people, one report name, one upload each — and each gets THEIR report.
 *
 * A report send writes the generated PDF to a temp path and hands the PATH to the
 * channel's sendDocument; the Meta driver opens a read stream that is consumed only
 * when the HTTP upload body goes out. A path that two concurrent sends can share —
 * `quiz-report-<quizId>.pdf` when the same quiz's report is generated for two
 * people, `report_<sessionId>_<ms>.pdf` when the same session's report is sent twice
 * in one millisecond, `lesson_plan_<topic>.pdf` when two teachers ask for the same
 * topic, `Fluency_Only_Student_<date>.pdf` when two teachers' reading reports for a
 * "Student" land on the same day, `Grade5_Science_Plants_LessonPlan.pdf` when two
 * teachers send the same textbook lesson — lets the second write overwrite the first,
 * so the first person is sent the second person's document, with no error anywhere; or
 * one send's cleanup removes the other's file before it is read.
 *
 * Each case runs the REAL service through the messaging facade into the Meta driver
 * (so the real fs.createReadStream runs). Only the boundaries are faked: the
 * database (in-memory), the PDF renderer / Gamma download (bytes per person), and
 * the Graph API, whose media upload waits 200 ms (DNS/TLS) before reading the stream.
 */

// The real Meta driver, chosen explicitly (see tests/whatsapp/send-image-from-url.test.js).
process.env.CHANNEL_DRIVER = 'meta';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { makeFakeDb } = require('../coaching/fidelity/_fake-db');

// One temp root of this test's own, so parallel jest workers never see each other's files.
const REAL_TMP = os.tmpdir();
const mockRoot = fs.mkdtempSync(path.join(REAL_TMP, 'report-collision-'));
const mockTempDir = path.join(mockRoot, 'temp'); // constants.TEMP_DIR
const OS_TMP = path.join(mockRoot, 'os-tmp'); // what os.tmpdir() returns to the services
const WORKER_TMP = path.join(mockRoot, 'worker-tmp'); // process.env.TEMP_DIR (lesson-plan worker)
for (const d of [mockTempDir, OS_TMP, WORKER_TMP]) fs.mkdirSync(d, { recursive: true });
process.env.TEMP_DIR = WORKER_TMP;

let mockDb;
let mockR2Configured = true;
jest.mock('../../bot/shared/config/supabase', () => new Proxy({}, { get: (_t, k) => mockDb[k] }));
jest.mock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn(), logError: jest.fn(), logWarn: jest.fn() }));
jest.mock('../../bot/shared/utils/constants', () => {
  const real = jest.requireActual('../../bot/shared/utils/constants');
  return { ...real, WHATSAPP_TOKEN: 'test-token', PHONE_NUMBER_ID: 'test-phone-id', TEMP_DIR: mockTempDir };
});
jest.mock('../../bot/shared/storage/r2', () => ({
  uploadReportPDF: jest.fn(async () => 'https://storage.example/report.pdf'),
  uploadVoiceDebrief: jest.fn(),
  uploadImageWithRetry: jest.fn(),
  isR2Configured: () => mockR2Configured,
  getSignedUrl: jest.fn(),
  downloadFromR2: jest.fn(),
  extractKeyFromUrl: jest.fn(),
}));
// The PDF renderer is a browser; its output here is the HTML it was given, which
// carries the teacher's name — so each teacher's bytes are their own.
jest.mock('../../bot/shared/utils/html-to-pdf', () => ({
  htmlToPdf: jest.fn(async (html) => Buffer.from(`%PDF-1.4\n${html}`)),
  htmlToImage: jest.fn(),
}));
jest.mock('pdfkit', () => function FakePDF() {}, { virtual: true });
jest.mock('jsonrepair', () => ({ jsonrepair: (s) => s }), { virtual: true });
jest.mock('pdf-parse', () => jest.fn(async () => ({ text: '' })), { virtual: true });
// The model client is the network: every completion is a one-line message.
jest.mock('../../bot/shared/services/llm-client', () => ({
  getClient: () => ({ chat: { completions: { create: async () => ({ choices: [{ message: { content: 'The assessment is complete.' } }] }) } } }),
}));
// The reading report renderer: its bytes name the teacher it was rendered for.
jest.mock('../../bot/shared/services/reading/report.service', () => ({
  generateReadingAssessmentReport: jest.fn(async (d) => Buffer.from(`%PDF-1.4 reading report for ${d.studentIdentifier}, teacher ${d.teacherName}`)),
}));
// Pic-to-LP collaborators that are not under test; Gamma is the network.
jest.mock('../../bot/shared/services/limits/daily-caps', () => ({ allowOrExplainForUserId: jest.fn(async () => true) }));
jest.mock('../../bot/shared/services/lesson-plan-availability', () => ({
  lessonPlansAvailable: () => true, explainIfUnavailable: jest.fn(),
}));
jest.mock('../../bot/shared/services/pic-to-lp/pic-lp-session.service', () => ({ updateStatus: jest.fn() }));
jest.mock('../../bot/shared/services/lesson-plan-prompts.service', () => ({
  buildChapterPrompt: (_subject, _grade, content) => content,
}), { virtual: true });
jest.mock('../../bot/shared/services/pic-to-lp/gamma-client.service', () => ({
  // The plan Gamma makes is the one for the pages in the prompt.
  generate: jest.fn(async ({ prompt }) => ({
    success: true, pdfUrl: `https://cdn.example/${/pages of (teacher-\w)/.exec(prompt)[1]}.pdf`,
  })),
  SUPPORTED_LANGUAGES: ['en'],
}));
jest.mock('../../bot/shared/utils/structured-logger', () => ({ logEvent: jest.fn() }));
// Lesson-plan worker collaborators that are not under test.
jest.mock('../../bot/shared/services/lesson-plan-queue.service', () => ({
  getRequest: jest.fn(async () => null), markProcessing: jest.fn(), markCompleted: jest.fn(), markFailed: jest.fn(),
}));
jest.mock('../../bot/shared/services/feature-linker.service', () => ({ suggestNext: jest.fn() }));
jest.mock('../../bot/shared/services/feature-registration.service', () => ({ checkAndTriggerRegistration: jest.fn() }));
jest.mock('../../bot/shared/database/bot-helpers', () => ({ storeLessonPlan: jest.fn(async () => ({ id: 'lp-1' })) }));
// Gamma is the network: each teacher's request comes back with its own PDF URL.
// downloadPDF stays REAL — it is the code that writes the temp file.
jest.mock('../../bot/shared/services/content.service', () => {
  const real = jest.requireActual('../../bot/shared/services/content.service');
  real.generateLessonPlan = jest.fn(async (topic, fullMessage) => ({
    gammaUrl: `https://gamma.example/${fullMessage}`,
    pdfUrl: `https://cdn.example/${fullMessage}.pdf`,
  }));
  return real;
});
// The multipart body: keep what was appended so the faked upload can read the stream
// the way the real form-data does — when the request body is written, not before.
jest.mock('form-data', () => class RecordingFormData {
  constructor() { this.parts = []; }
  append(name, value, options) { this.parts.push({ name, value, options }); }
  getHeaders() { return { 'content-type': 'multipart/form-data; boundary=x' }; }
});

const axios = require('axios'); // mapped stub — the network boundary
const QuizReportService = require('../../bot/shared/services/quiz/quiz-report.service');
const ReportGeneratorService = require('../../bot/shared/services/coaching/report-generator.service');
const LessonPlanWorker = require('../../bot/workers/lesson-plan-generation.worker');
const AnalysisService = require('../../bot/shared/services/reading/analysis.service');
const LpHandoff = require('../../bot/shared/services/pic-to-lp/lp-handoff.service');
const r2 = require('../../bot/shared/storage/r2');

const A = '15550100301';
const B = '15550100302';
const sha12 = (buf) => crypto.createHash('sha256').update(buf).digest('hex').slice(0, 12);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** What each recipient was actually sent: bytes read off the upload stream, joined to `to` by media id. */
let uploads;
let sends;

function fakeGraphApi({ uploadDelayMs = 200 } = {}) {
  uploads = new Map();
  sends = [];
  let n = 0;
  axios.post.mockReset();
  axios.post.mockImplementation(async (url, body) => {
    if (/\/media$/.test(url)) {
      const id = `media-${++n}`;
      await sleep(uploadDelayMs); // connect to graph.facebook.com before the body is streamed
      const file = body.parts.find((p) => p.name === 'file').value;
      const chunks = [];
      for await (const chunk of file) chunks.push(chunk);
      uploads.set(id, Buffer.concat(chunks));
      return { status: 200, data: { id } };
    }
    if (/\/messages$/.test(url)) {
      sends.push({ to: body.to, mediaId: body.document && body.document.id, filename: body.document && body.document.filename });
      return { status: 200, data: { messages: [{ id: `wamid.${sends.length}` }] } };
    }
    return { status: 200, data: {} };
  });
}

const received = () => Object.fromEntries(
  sends.filter((s) => s.mediaId).map((s) => [s.to, uploads.get(s.mediaId)]),
);
/** Every file left under a directory, recursively. */
const leftIn = (dir) => fs.readdirSync(dir, { recursive: true })
  .filter((f) => fs.statSync(path.join(dir, String(f))).isFile());

beforeEach(() => {
  jest.clearAllMocks();
  fakeGraphApi();
  jest.spyOn(os, 'tmpdir').mockReturnValue(OS_TMP);
});

afterEach(() => {
  jest.restoreAllMocks();
});

afterAll(() => {
  delete process.env.CHANNEL_DRIVER;
  delete process.env.TEMP_DIR;
  try { fs.rmSync(mockRoot, { recursive: true, force: true }); } catch { /* best effort */ }
});

describe('quiz report: the same quiz\'s report generated for two teachers at once', () => {
  beforeEach(() => {
    mockDb = makeFakeDb({
      quizzes: [{ id: 'quiz-77', teacher_id: 'teacher-1', list_id: null, topic: 'Fractions', grade: '5', subject: 'Maths', status: 'sent' }],
      quiz_sessions: [],
      users: [
        { id: 'teacher-1', phone_number: A, first_name: 'Avery' },
        { id: 'teacher-2', phone_number: B, first_name: 'Blair' },
      ],
    });
  });

  it('sends each teacher the PDF rendered for them', async () => {
    await Promise.all([
      QuizReportService.generateReport('quiz-77', { teacherPhone: A }),
      QuizReportService.generateReport('quiz-77', { teacherPhone: B }),
    ]);

    expect(sends).toHaveLength(2);
    expect(sends.map((s) => s.filename)).toEqual(['Quiz_Fractions.pdf', 'Quiz_Fractions.pdf']);
    // Whose name is on the PDF each teacher received.
    const whose = (buf) => {
      const s = buf ? buf.toString() : '';
      return [s.includes('Avery') && 'Avery', s.includes('Blair') && 'Blair'].filter(Boolean).join('+') || 'nobody';
    };
    const got = received();
    expect({ [A]: whose(got[A]), [B]: whose(got[B]) }).toEqual({ [A]: 'Avery', [B]: 'Blair' });
  });

  it('leaves nothing behind in the temp directory', async () => {
    await Promise.all([
      QuizReportService.generateReport('quiz-77', { teacherPhone: A }),
      QuizReportService.generateReport('quiz-77', { teacherPhone: B }),
    ]);
    expect(fs.readdirSync(OS_TMP)).toEqual([]);
  });
});

describe('coaching report: the same session\'s PDF sent twice in the same millisecond', () => {
  const pdfA = Buffer.from('%PDF-1.4 report for the first recipient');
  const pdfB = Buffer.from('%PDF-1.4 report for the second recipient, rendered differently');

  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(1790000000000);
  });

  it('sends each recipient the buffer they were given', async () => {
    const results = await Promise.allSettled([
      ReportGeneratorService.sendPDFReport(A, 'coach-session-9', pdfA, 'Avery', '2026-09-14T09:00:00Z'),
      ReportGeneratorService.sendPDFReport(B, 'coach-session-9', pdfB, 'Avery', '2026-09-14T09:00:00Z'),
    ]);
    expect(results.map((r) => r.status)).toEqual(['fulfilled', 'fulfilled']);

    const docs = sends.filter((s) => s.mediaId);
    expect(docs).toHaveLength(2);
    expect(docs.map((s) => s.filename)).toEqual([
      'Classroom Observation_Avery_14092026.pdf', 'Classroom Observation_Avery_14092026.pdf',
    ]);
    const got = received();
    expect(sha12(got[A])).toBe(sha12(pdfA));
    expect(sha12(got[B])).toBe(sha12(pdfB));
  });

  it('leaves nothing behind in the temp directory', async () => {
    await Promise.allSettled([
      ReportGeneratorService.sendPDFReport(A, 'coach-session-9', pdfA, 'Avery'),
      ReportGeneratorService.sendPDFReport(B, 'coach-session-9', pdfB, 'Avery'),
    ]);
    expect(leftIn(mockTempDir)).toEqual([]);
    expect(fs.readdirSync(mockTempDir)).toEqual([]);
  });
});

describe('lesson plan: two teachers ask for the same topic at once (display-name file)', () => {
  const PDF = {
    'https://cdn.example/teacher-a.pdf': Buffer.from('%PDF-1.4 plan written for the first teacher'),
    'https://cdn.example/teacher-b.pdf': Buffer.from('%PDF-1.4 plan written for the second teacher, longer'),
  };

  beforeEach(() => {
    mockDb = makeFakeDb({});
    axios.get.mockReset();
    axios.get.mockImplementation(async (url) => ({ status: 200, data: PDF[url] }));
  });

  const job = (phone, who) => LessonPlanWorker.process({
    requestId: `req-${who}`, userId: `user-${who}`, phoneNumber: phone,
    topic: 'Photosynthesis', fullMessage: who, language: 'en',
  });

  it('sends each teacher the plan Gamma made for them', async () => {
    await Promise.all([job(A, 'teacher-a'), job(B, 'teacher-b')]);

    const docs = sends.filter((s) => s.mediaId);
    expect(docs).toHaveLength(2);
    expect(docs.map((s) => s.filename)).toEqual(['lesson_plan_Photosynthesis.pdf', 'lesson_plan_Photosynthesis.pdf']);
    const got = received();
    expect(sha12(got[A])).toBe(sha12(PDF['https://cdn.example/teacher-a.pdf']));
    expect(sha12(got[B])).toBe(sha12(PDF['https://cdn.example/teacher-b.pdf']));
  });

  it('leaves nothing behind in the temp directory', async () => {
    await Promise.all([job(A, 'teacher-a'), job(B, 'teacher-b')]);
    expect(fs.readdirSync(WORKER_TMP)).toEqual([]);
  });
});

describe('reading report, no object storage: two teachers, a "Student" each, the same day', () => {
  const assessmentFor = (who) => ({
    id: `assessment-${who}`, user_id: `user-${who}`, student_identifier: null, created_at: '2026-09-14T09:00:00Z',
    language: 'en', grade_level: 3, passage_type: 'sentences', passage_text: 'The kite flew.',
    wcpm: 42, accuracy_percentage: 90, comprehension_score: null,
  });

  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(1790000000000);
    mockR2Configured = false;
    mockDb = makeFakeDb({
      users: [{ id: 'user-a', first_name: 'Avery' }, { id: 'user-b', first_name: 'Blair' }],
      reading_assessments: [assessmentFor('a'), assessmentFor('b')],
    });
    // The report travels as a file:// URL. The storage read is the boundary: like the
    // drivers that serve file:// URLs, it reads the file at the path it is given —
    // after a moment, as a real download would.
    r2.extractKeyFromUrl.mockImplementation((url) => url);
    r2.downloadFromR2.mockImplementation(async (url) => {
      await sleep(50);
      return fs.readFileSync(url.slice('file://'.length));
    });
    // Voice feedback is a later, optional step this case does not cover.
    jest.spyOn(AnalysisService, 'generateVoiceFeedback').mockResolvedValue(null);
  });

  afterEach(() => {
    mockR2Configured = true;
    r2.extractKeyFromUrl.mockReset();
    r2.downloadFromR2.mockReset();
  });

  const both = () => Promise.allSettled([
    AnalysisService.generateAndSendFluencyReport(assessmentFor('a'), A, 'en'),
    AnalysisService.generateAndSendFluencyReport(assessmentFor('b'), B, 'en'),
  ]);

  it('sends each teacher the report rendered for their own student', async () => {
    const results = await both();
    expect(results.map((r) => r.status)).toEqual(['fulfilled', 'fulfilled']);

    const docs = sends.filter((s) => s.mediaId);
    expect(docs.map((s) => s.filename)).toEqual(['Reading_Assessment_Report.pdf', 'Reading_Assessment_Report.pdf']);
    const got = received();
    expect({ [A]: String(got[A]), [B]: String(got[B]) }).toEqual({
      [A]: '%PDF-1.4 reading report for Student, teacher Avery',
      [B]: '%PDF-1.4 reading report for Student, teacher Blair',
    });
  });

  it('leaves nothing behind in the temp directory', async () => {
    await both();
    expect(fs.readdirSync(mockTempDir)).toEqual([]);
  });
});

describe('pic-to-LP: two teachers photograph the same lesson at once (form-named file)', () => {
  const PDF = {
    'https://cdn.example/teacher-a.pdf': Buffer.from('%PDF-1.4 plan from the first teacher\'s pages'),
    'https://cdn.example/teacher-b.pdf': Buffer.from('%PDF-1.4 plan from the second teacher\'s pages, longer'),
  };
  const formData = { grade: '5', subject: 'Science', topic: 'Plants', language: 'en', lesson_plan_format: 'detailed' };
  const handoff = (phone, who, form = formData) => LpHandoff.generateAndDeliver({
    session: { id: `session-${who}`, user_id: `user-${who}`, pages: ['p1'], detected: { ocr_text: `pages of ${who}` } },
    formData: form,
    from: phone,
  });

  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(1790000000000);
    mockDb = makeFakeDb({});
    axios.get.mockReset();
    axios.get.mockImplementation(async (url) => ({ status: 200, data: PDF[url] }));
  });

  it('sends each teacher the plan made from their own pages', async () => {
    const results = await Promise.all([handoff(A, 'teacher-a'), handoff(B, 'teacher-b')]);
    expect(results.map((r) => r.success)).toEqual([true, true]);

    const docs = sends.filter((s) => s.mediaId);
    expect(docs.map((s) => s.filename)).toEqual(['Grade5_Science_Plants_LessonPlan.pdf', 'Grade5_Science_Plants_LessonPlan.pdf']);
    const got = received();
    expect(sha12(got[A])).toBe(sha12(PDF['https://cdn.example/teacher-a.pdf']));
    expect(sha12(got[B])).toBe(sha12(PDF['https://cdn.example/teacher-b.pdf']));
  });

  it('leaves nothing behind in the temp directory', async () => {
    await Promise.all([handoff(A, 'teacher-a'), handoff(B, 'teacher-b')]);
    expect(fs.readdirSync(mockTempDir)).toEqual([]);
  });
});
