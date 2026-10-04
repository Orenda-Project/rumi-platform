'use strict';
/**
 * The quiz report PDF's URL is stored and used, but never logged.
 *
 * The R2 upload returns a presigned URL — whoever holds it opens the
 * teacher's report. QuizReportService.generateReport runs for real; the
 * database, the PDF renderer, the upload and messaging are faked at their
 * boundaries, and every log line is captured.
 */
const { makeFakeDb } = require('../coaching/fidelity/_fake-db');

const SIGNED = 'https://acc123.r2.cloudflarestorage.com/rumi-bucket/reports/teacher-7f3a/quiz-91c2.pdf'
  + '?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AKIAEXAMPLE%2F20261004&X-Amz-Signature=abc123def456';

let mockDb;
jest.mock('../../bot/shared/config/supabase', () => new Proxy({}, { get: (_t, k) => mockDb[k] }));
jest.mock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
jest.mock('../../bot/shared/storage/r2', () => ({ uploadReportPDF: jest.fn(async () => SIGNED) }));
jest.mock('../../bot/shared/utils/html-to-pdf', () => ({ htmlToPdf: jest.fn(async () => Buffer.from('%PDF-1.4')) }));
jest.mock('../../bot/shared/services/whatsapp.service', () => ({
  sendMessage: jest.fn(async () => true), sendDocument: jest.fn(async () => true),
  sendInteractiveButtons: jest.fn(async () => true),
}));

const { logToFile } = require('../../bot/shared/utils/logger');
const WhatsAppService = require('../../bot/shared/services/whatsapp.service');
const QuizReportService = require('../../bot/shared/services/quiz/quiz-report.service');

function logged() {
  return JSON.stringify(logToFile.mock.calls);
}

describe('QuizReportService.generateReport — the report URL stays out of the logs', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    mockDb = makeFakeDb({
      quizzes: [{ id: 'q1', teacher_id: 'teacher-7f3a', list_id: null, topic: 'Fractions', grade: '5', subject: 'Maths', status: 'sent' }],
      quiz_sessions: [{ id: 'qs1', quiz_id: 'q1', student_id: 'st1', status: 'completed', total_questions_answered: 5, correct_answers: 4, mastery_percentage: 80, mastery_level: 'proficient', students: { student_name: 'Ada' } }],
      users: [{ id: 'teacher-7f3a', phone_number: '15550001111', first_name: 'Sam' }],
    });
  });
  afterEach(() => jest.useRealTimers());

  test('the database row gets the full URL; no log line carries the URL, its signature or its key', async () => {
    const run = QuizReportService.generateReport('q1', { teacherPhone: '+15550001111', language: 'en' });
    await jest.runAllTimersAsync();
    await run;

    // Behaviour unchanged: the PDF went out and the full URL was stored.
    expect(WhatsAppService.sendDocument).toHaveBeenCalled();
    const stored = mockDb.writes.find((w) => w.table === 'quizzes' && w.op === 'update');
    expect(stored.patch.report_pdf_url).toBe(SIGNED);

    // No log line carries anything that opens the file…
    const text = logged();
    expect(text).not.toContain(SIGNED);
    expect(text).not.toContain('X-Amz-Signature');
    expect(text).not.toContain('abc123def456');
    expect(text).not.toContain('/rumi-bucket/reports/teacher-7f3a/quiz-91c2.pdf');
    expect(text).not.toContain('quiz-91c2');
    // …while the PDF-sent line still identifies it.
    expect(text).toContain('Quiz report PDF sent');
    expect(text).toContain('acc123.r2.cloudflarestorage.com#sha256:');
  });
});
