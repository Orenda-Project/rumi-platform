/**
 * Writing feedback must not regress the exam checker.
 *
 * Both features start from "a parent/teacher sends a photo of handwriting",
 * and they share the same OCR service — so the routing is the one place this
 * feature could break something that already works. The image handler's gates
 * fall through in order, so "unchanged" means two separate things, and both
 * are asserted here:
 *
 *   1. ORDER — the exam-checker gate still runs BEFORE the writing gate (and
 *      the writing gate before pic-to-LP). A source-level route-contract check,
 *      because unit tests mock the gates and cannot see their order
 *      (pre-merge-checklist Class A).
 *   2. CLAIM — the writing gate returns null for every input the exam checker
 *      wants, so nothing is stolen even if the order were ever reshuffled.
 */

const fs = require('fs');
const path = require('path');

const { createFakeSupabase, createFakeRedis } = require('./fake-supabase');

const ROOT = path.resolve(__dirname, '../..');
const IMAGE_HANDLER = path.join(ROOT, 'bot/shared/handlers/image-message.handler.js');
const TEXT_HANDLER = path.join(ROOT, 'bot/shared/handlers/text-message.handler.js');

const mockSupabase = createFakeSupabase();
const mockRedis = createFakeRedis();
const mockSent = [];

jest.mock('../../bot/shared/config/supabase', () => mockSupabase);
jest.mock('../../bot/shared/services/cache/railway-redis.service', () => mockRedis);
jest.mock('../../bot/shared/services/whatsapp.service', () => ({
  startContinuousTypingIndicator: () => ({ stop: () => {} }),
  sendMessage: async (to, text) => { mockSent.push({ to, text }); return true; },
  downloadMedia: async () => Buffer.from('fake-image'),
  sendInteractiveMessage: async () => true,
  sendInteractiveButtons: async () => true,
  sendFlow: async () => true,
}));
jest.mock('../../bot/shared/storage/r2', () => ({
  uploadImageWithRetry: async () => 'https://r2.example/writing/sample.jpg',
}));
jest.mock('../../bot/shared/services/exam-checker/ocr.service', () => ({
  extractSingle: async () => ({ rawText: 'x', confidence: 0.1, provider: 'mistral' }),
}));
jest.mock('../../bot/shared/services/llm-client', () => ({
  getDefaultModel: () => 'test-model',
  getClient: () => ({ chat: { completions: { create: async () => { throw new Error('not expected'); } } } }),
}));

// The exam-checker barrel is stubbed so its handler's detection functions can
// be exercised without dragging in the grading/annotation/PDF stack.
jest.mock('../../bot/shared/services/exam-checker', () => ({
  ExamCheckerOrchestrator: {
    getSessionState: async () => ({ active: false, sessionId: null }),
    process: async () => ({ text: 'ok' }),
    cancelSession: async () => ({ text: 'cancelled' }),
  },
  ExamSessionService: {},
}));

const ExamCheckerHandler = require('../../bot/shared/handlers/exam-checker.handler');
const WritingFeedbackService = require('../../bot/shared/services/writing-feedback.service');
const WritingFeedbackHandler = require('../../bot/shared/handlers/writing-feedback.handler');

const USER = { id: 'user-1' };
const FROM = '923001234567';
const imageMessage = (caption) => ({ id: 'm-1', image: { id: 'img-1', mime_type: 'image/jpeg', caption } });

describe('Exam-checker routing is unchanged', () => {
  beforeEach(() => {
    mockSupabase.__reset();
    mockRedis.__store.clear();
    mockSent.length = 0;
    process.env.MISTRAL_API_KEY = 'test-mistral-key';
  });

  describe('gate order in the image handler (route contract)', () => {
    const source = () => fs.readFileSync(IMAGE_HANDLER, 'utf-8');

    it('still routes coaching → exam checker → writing feedback → pic-to-LP', () => {
      const src = source();
      const coaching = src.indexOf("'awaiting_photo'");
      const exam = src.indexOf('ExamCheckerHandler.handleExamImage');
      const writing = src.indexOf('WritingFeedbackHandler.handleWritingImage');
      const picLp = src.indexOf('tryPicLpRoute');

      expect(coaching).toBeGreaterThan(-1);
      expect(exam).toBeGreaterThan(-1);
      expect(writing).toBeGreaterThan(-1);
      expect(picLp).toBeGreaterThan(-1);

      expect(coaching).toBeLessThan(exam);
      expect(exam).toBeLessThan(writing);
      expect(writing).toBeLessThan(picLp);
    });

    it('leaves the exam-checker gate wired exactly as before — one call, one handled-check', () => {
      const src = source();
      expect(src.match(/ExamCheckerHandler\.handleExamImage/g)).toHaveLength(1);
      expect(src).toContain("require('./exam-checker.handler')");
      expect(src).toContain("logToFile('✅ Image handled by Exam Checker'");
    });

    it('routes writing feedback after the exam checker in the text handler too', () => {
      const src = fs.readFileSync(TEXT_HANDLER, 'utf-8');
      const exam = src.indexOf('ExamCheckerHandler.handleExamText');
      const writing = src.indexOf('WritingFeedbackHandler.handleWritingText');

      expect(exam).toBeGreaterThan(-1);
      expect(writing).toBeGreaterThan(-1);
      expect(exam).toBeLessThan(writing);
      expect(src.match(/ExamCheckerHandler\.handleExamText/g)).toHaveLength(1);
    });
  });

  describe('the two keyword sets do not overlap', () => {
    it('no exam trigger reads as a writing trigger', () => {
      for (const keyword of ExamCheckerHandler.EXAM_CHECK_KEYWORDS) {
        expect(WritingFeedbackService.shouldTriggerWritingFeedback(keyword)).toBe(false);
        expect(WritingFeedbackService.captionMarksWriting(keyword)).toBe(false);
      }
    });

    it('no writing trigger reads as an exam trigger', () => {
      const writingPhrases = [
        '/writing',
        "check my child's writing",
        'writing feedback',
        'check this paragraph',
        'essay',
        'paragraph',
        'writing',
      ];
      for (const phrase of writingPhrases) {
        expect(ExamCheckerHandler.shouldTriggerExamChecker(phrase)).toBe(false);
      }
    });
  });

  describe('the writing gate never claims an exam-checker image', () => {
    it.each(['check papers', 'grade papers', 'mark exams', 'check exam', '/exam'])(
      'returns null for a photo captioned %p',
      async (caption) => {
        const result = await WritingFeedbackHandler.handleWritingImage(imageMessage(caption), FROM, USER);
        expect(result).toBeNull();
        expect(mockSupabase.__rows()).toHaveLength(0);
        expect(mockSent).toHaveLength(0);
      }
    );

    it('returns null for an uncaptioned photo when no writing session is open', async () => {
      const result = await WritingFeedbackHandler.handleWritingImage(imageMessage(''), FROM, USER);
      expect(result).toBeNull();
    });

    it('returns null for a textbook-page photo, leaving pic-to-LP its input', async () => {
      const result = await WritingFeedbackHandler.handleWritingImage(
        imageMessage('make a lesson plan from this'),
        FROM,
        USER
      );
      expect(result).toBeNull();
    });

    it('returns null for an exam-shaped text message', async () => {
      expect(
        await WritingFeedbackHandler.handleWritingText({ id: 'm', text: { body: 'check exams' } }, FROM, USER)
      ).toBeNull();
      expect(
        await WritingFeedbackHandler.handleWritingText({ id: 'm', text: { body: '/exam' } }, FROM, USER)
      ).toBeNull();
    });

    it('does claim a photo whose caption names writing', async () => {
      const result = await WritingFeedbackHandler.handleWritingImage(
        imageMessage("here's my son's writing"),
        FROM,
        USER
      );
      expect(result).toEqual({ handled: true });
    });
  });

  describe('the shared OCR service is reused, not forked', () => {
    it('writing feedback calls the exam checker\'s own OCR module', () => {
      const src = fs.readFileSync(
        path.join(ROOT, 'bot/shared/services/writing-feedback.service.js'),
        'utf-8'
      );
      expect(src).toContain("require('./exam-checker/ocr.service')");
      // No second OCR implementation, and no direct provider call.
      expect(src).not.toMatch(/api\.mistral\.ai/);
      expect(src).not.toMatch(/require\('axios'\)/);
    });

    it('does not modify the exam checker\'s OCR service', () => {
      const ocrSource = fs.readFileSync(
        path.join(ROOT, 'bot/shared/services/exam-checker/ocr.service.js'),
        'utf-8'
      );
      // No writing-feedback awareness leaked into it — the reuse is one-way.
      expect(ocrSource).not.toMatch(/writing-feedback|writingFeedback|writing_feedback/i);
    });
  });
});
