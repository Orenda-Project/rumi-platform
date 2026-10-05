/**
 * Two people, one report name, one upload each — and each gets THEIR report.
 *
 * A report send writes the generated PDF to a temp path and hands the PATH to the
 * channel's sendDocument; the Meta driver opens a read stream that is consumed only
 * when the HTTP upload body goes out. A path that two concurrent sends can share —
 * `quiz-report-<quizId>.pdf` when the same quiz's report is generated for two
 * people, `report_<sessionId>_<ms>.pdf` when the same session's report is sent twice
 * in one millisecond, `lesson_plan_<topic>.pdf` when two teachers ask for the same
 * topic — lets the second write overwrite the first, so the first person is sent the
 * second person's document, with no error anywhere; or one send's cleanup removes the
 * other's file before it is read.
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
  isR2Configured: () => true,
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
