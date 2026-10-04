'use strict';
/**
 * The coaching report PDF's URL is stored, but never logged.
 *
 * Here the bucket is public: `https://pub-….r2.dev/<key>` opens without any
 * signature, so even the object path must not reach a log line. generateReport
 * runs for real; the LLM passes, rendering, storage and messaging are faked
 * at their boundaries (same seams as fidelity/report-sends-fidelity-line).
 */
const { makeFakeDb } = require('./fidelity/_fake-db');

const PUBLIC = 'https://pub-abc123.r2.dev/coaching-reports/teacher-55aa/session-8812.pdf';

let mockDb;
jest.mock('../../bot/shared/config/supabase', () => new Proxy({}, { get: (_t, k) => mockDb[k] }));
jest.mock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn(), logWarn: jest.fn() }));
jest.mock('../../bot/shared/storage/r2', () => ({
  uploadVoiceDebrief: jest.fn(), uploadReportPDF: jest.fn(async () => PUBLIC), uploadImageWithRetry: jest.fn(),
}));
jest.mock('../../bot/shared/services/whatsapp.service', () => ({
  sendMessage: jest.fn(async () => true), sendDocument: jest.fn(async () => true), sendAudioFromUrl: jest.fn(async () => true),
  sendImageFromUrl: jest.fn(async () => true), sendInteractiveButtons: jest.fn(async () => true),
}));
jest.mock('../../bot/shared/services/feature-linker.service', () => ({ suggestNext: jest.fn() }));
// PDFKit is a bot-only dependency (not installed for the root suite); the report renderer is not under test here.
jest.mock('pdfkit', () => function FakePDF() {}, { virtual: true });
jest.mock('jsonrepair', () => ({ jsonrepair: (s) => s }), { virtual: true });
jest.mock('dotenv', () => ({ config: () => ({}) }), { virtual: true });

const { logToFile } = require('../../bot/shared/utils/logger');
const GPT5MiniService = require('../../bot/shared/services/gpt5-mini.service');
const PDFReportService = require('../../bot/shared/services/pdf-report.service');
const ReportGeneratorService = require('../../bot/shared/services/coaching/report-generator.service');

describe('ReportGeneratorService.generateReport — the report URL stays out of the logs', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(GPT5MiniService, 'enhanceAnalysisWithReflections').mockImplementation(async (a) => a);
    jest.spyOn(GPT5MiniService, 'inferLessonTopic').mockResolvedValue('N/A');
    jest.spyOn(GPT5MiniService, 'inferLessonSubject').mockResolvedValue('N/A');
    jest.spyOn(PDFReportService, 'generateClassroomObservationReport').mockResolvedValue(Buffer.from('%PDF-1.4'));
    jest.spyOn(ReportGeneratorService, 'generateAndSendVoiceDebrief').mockResolvedValue();
    mockDb = makeFakeDb({
      coaching_sessions: [{
        id: 's1', user_id: 'teacher-55aa', status: 'generating_report', created_at: '2026-10-01T09:00:00Z',
        transcript_text: '[00:10] x', analysis_data: { framework: 'oecd', scores: {} }, conversation_state: { questions: [] },
        users: { phone_number: '15550001111', first_name: 'Sam', last_name: 'Teacher', preferred_language: 'en' },
      }],
    });
  });
  afterEach(() => jest.restoreAllMocks());

  test('the session row gets the full public URL; no log line carries it or its path', async () => {
    await ReportGeneratorService.generateReport('s1', { from: 'matrix:@t:local' });

    const stored = mockDb.writes.find((w) => w.table === 'coaching_sessions' && w.patch && 'report_pdf_url' in w.patch);
    expect(stored.patch.report_pdf_url).toBe(PUBLIC);

    const text = JSON.stringify(logToFile.mock.calls);
    expect(text).not.toContain(PUBLIC);
    expect(text).not.toContain('/coaching-reports/teacher-55aa/session-8812.pdf');
    expect(text).not.toContain('session-8812');
    expect(text).toContain('Report PDF uploaded to R2');
    expect(text).toContain('pub-abc123.r2.dev#sha256:');
  });
});
