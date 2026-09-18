/**
 * Writing feedback — the OCR path, which is the riskiest part of this feature.
 *
 * Children's handwriting is the hardest input the exam-checker OCR service has
 * ever been pointed at, so a weak read has to be a first-class outcome, not an
 * exception: we ask the parent to type the paragraph instead of drafting
 * feedback on a guess. Feedback built on a misread sentence is worse than no
 * feedback — she would take it to her child and be wrong in front of them.
 *
 * The threshold (0.55) is pinned to OCRService._calculateConfidence's arithmetic:
 * with no student name, no roll number and no detected questions — i.e. a plain
 * paragraph — a clean read tops out at 0.60 (0.50 base + 0.10 for >100 chars)
 * and a thin read sits at 0.50. If that formula changes, this test is where it
 * should be noticed.
 */

const { createFakeSupabase, createFakeRedis } = require('./fake-supabase');

const mockSupabase = createFakeSupabase();
const mockRedis = createFakeRedis();
const mockSent = [];
let mockOcrResult = null;

jest.mock('../../bot/shared/config/supabase', () => mockSupabase);
jest.mock('../../bot/shared/services/cache/railway-redis.service', () => mockRedis);

jest.mock('../../bot/shared/services/whatsapp.service', () => ({
  startContinuousTypingIndicator: () => ({ stop: () => {} }),
  sendMessage: async (to, text) => { mockSent.push({ to, text }); return true; },
  downloadMedia: async () => Buffer.from('fake-image'),
}));

jest.mock('../../bot/shared/storage/r2', () => ({
  uploadImageWithRetry: async () => 'https://r2.example/writing/sample.jpg',
}));

const mockOcrCalls = [];
jest.mock('../../bot/shared/services/exam-checker/ocr.service', () => ({
  extractSingle: async (url, includeBoundingBoxes) => {
    mockOcrCalls.push({ url, includeBoundingBoxes });
    return mockOcrResult;
  },
}));

jest.mock('../../bot/shared/services/llm-client', () => ({
  getDefaultModel: () => 'test-model',
  getClient: () => ({ chat: { completions: { create: async () => { throw new Error('should not be called'); } } } }),
}));

const WritingFeedbackService = require('../../bot/shared/services/writing-feedback.service');
const WritingFeedbackHandler = require('../../bot/shared/handlers/writing-feedback.handler');

const GOOD_PARAGRAPH =
  'On Eid I woke up early. My ami give me new clothes. We go to my nana house and eat delicious sheer khurma. It was the best day.';

const USER = { id: 'user-1' };
const FROM = '923001234567';
const imageMessage = () => ({ id: 'm-1', image: { id: 'img-1', mime_type: 'image/jpeg', caption: '' } });
const row = () => mockSupabase.__rows().slice(-1)[0];

describe('Writing feedback — OCR confidence', () => {
  beforeEach(() => {
    mockSupabase.__reset();
    mockRedis.__store.clear();
    mockSent.length = 0;
    mockOcrCalls.length = 0;
    process.env.MISTRAL_API_KEY = 'test-mistral-key';
  });

  describe('the threshold', () => {
    it('sits at 0.55 — between a clean paragraph read (0.60) and a thin one (0.50)', () => {
      expect(WritingFeedbackService.LOW_CONFIDENCE_THRESHOLD).toBe(0.55);
      expect(WritingFeedbackService.LOW_CONFIDENCE_THRESHOLD).toBeLessThan(0.6);
      expect(WritingFeedbackService.LOW_CONFIDENCE_THRESHOLD).toBeGreaterThan(0.5);
    });
  });

  describe('extractText', () => {
    it('skips Surya bounding boxes — nothing here annotates the image', async () => {
      mockOcrResult = { rawText: GOOD_PARAGRAPH, confidence: 0.6, provider: 'mistral' };
      await WritingFeedbackService.extractText('https://r2.example/x.jpg');
      expect(mockOcrCalls[0].includeBoundingBoxes).toBe(false);
    });

    it('accepts a clean read at the exam-OCR ceiling for a plain paragraph', async () => {
      mockOcrResult = { rawText: GOOD_PARAGRAPH, confidence: 0.6, provider: 'mistral' };
      const result = await WritingFeedbackService.extractText('https://r2.example/x.jpg');

      expect(result.lowConfidence).toBe(false);
      expect(result.text).toBe(GOOD_PARAGRAPH);
      expect(result.provider).toBe('mistral');
    });

    it("accepts Chandra's fallback score", async () => {
      mockOcrResult = { rawText: GOOD_PARAGRAPH, confidence: 0.7, provider: 'chandra' };
      expect((await WritingFeedbackService.extractText('u')).lowConfidence).toBe(false);
    });

    it('flags a thin read below the threshold', async () => {
      mockOcrResult = { rawText: GOOD_PARAGRAPH, confidence: 0.5, provider: 'mistral' };
      expect((await WritingFeedbackService.extractText('u')).lowConfidence).toBe(true);
    });

    it('flags a confident-looking score with too little text — substance is checked separately', async () => {
      mockOcrResult = { rawText: 'On Eid I', confidence: 0.95, provider: 'mistral' };
      const result = await WritingFeedbackService.extractText('u');
      expect(result.lowConfidence).toBe(true);
    });

    it('flags empty text even at a perfect score', async () => {
      mockOcrResult = { rawText: '   ', confidence: 1, provider: 'mistral' };
      expect((await WritingFeedbackService.extractText('u')).lowConfidence).toBe(true);
    });

    it('flags a missing confidence value rather than assuming the best', async () => {
      mockOcrResult = { rawText: GOOD_PARAGRAPH, provider: 'mistral' };
      const result = await WritingFeedbackService.extractText('u');
      expect(result.confidence).toBe(0);
      expect(result.lowConfidence).toBe(true);
    });
  });

  describe('the low-confidence branch, end to end', () => {
    it('asks the parent to type the paragraph and does NOT draft feedback', async () => {
      mockOcrResult = { rawText: 'On E?d I w', confidence: 0.5, provider: 'mistral' };

      await WritingFeedbackHandler.handleWritingText({ id: 'm-0', text: { body: '/writing' } }, FROM, USER);
      const result = await WritingFeedbackHandler.handleWritingImage(imageMessage(), FROM, USER);

      expect(result).toEqual({ handled: true });
      expect(mockSent.slice(-1)[0].text).toContain("I couldn't read the handwriting well enough");
      expect(mockSent.slice(-1)[0].text).toMatch(/type the paragraph/i);

      // Still awaiting the photo (or a typed paragraph) — never advanced, and
      // the draft (which would have thrown in this suite's LLM mock) never ran.
      expect(row().status).toBe(WritingFeedbackService.STATES.AWAITING_PHOTO);
      expect(row().ai_draft).toBeFalsy();
    });

    it('logs the weak read anyway — the OCR path is what this pilot is measuring', async () => {
      mockOcrResult = { rawText: 'On E?d I w', confidence: 0.42, provider: 'chandra' };

      await WritingFeedbackHandler.handleWritingText({ id: 'm-0', text: { body: '/writing' } }, FROM, USER);
      await WritingFeedbackHandler.handleWritingImage(imageMessage(), FROM, USER);

      expect(row().ocr_confidence).toBe(0.42);
      expect(row().ocr_provider).toBe('chandra');
      expect(row().ocr_text).toBe('On E?d I w');
      expect(row().image_url).toBe('https://r2.example/writing/sample.jpg');
    });

    it('lets her recover by typing the paragraph, from the same session', async () => {
      mockOcrResult = { rawText: 'On E?d I w', confidence: 0.5, provider: 'mistral' };
      await WritingFeedbackHandler.handleWritingText({ id: 'm-0', text: { body: '/writing' } }, FROM, USER);
      await WritingFeedbackHandler.handleWritingImage(imageMessage(), FROM, USER);
      const sessionId = row().id;

      await WritingFeedbackHandler.handleWritingText(
        { id: 'm-2', text: { body: GOOD_PARAGRAPH } },
        FROM,
        USER
      );

      expect(row().id).toBe(sessionId);
      expect(row().status).toBe(WritingFeedbackService.STATES.AWAITING_AGE);
      expect(row().ocr_text).toBe(GOOD_PARAGRAPH);
    });
  });

  describe('feature gating', () => {
    it('is on iff the exam-checker OCR key is present — no new credential', () => {
      expect(WritingFeedbackService.isAvailable({ MISTRAL_API_KEY: 'k' })).toBe(true);
      expect(WritingFeedbackService.isAvailable({ CHANDRA_API_KEY: 'k' })).toBe(true);
      expect(WritingFeedbackService.isAvailable({})).toBe(false);
      expect(WritingFeedbackService.isAvailable({ MISTRAL_API_KEY: '' })).toBe(false);
      // Template placeholders don't count as configured.
      expect(WritingFeedbackService.isAvailable({ MISTRAL_API_KEY: 'CHANGEME' })).toBe(false);
    });

    it('is registered in feature-availability so `doctor` reports it', () => {
      const { FEATURES } = require('../../bot/shared/config/feature-availability');
      const entry = FEATURES.find((f) => /writing feedback/i.test(f.name));
      expect(entry).toBeDefined();
      // Same disjunction shape as the exam checker: Mistral OR Chandra.
      expect(entry.keysAny).toEqual(['MISTRAL_API_KEY', 'CHANDRA_API_KEY']);
      expect(entry.keys).toBeUndefined();
    });

    it('says so honestly when no OCR key is configured, instead of pretending', async () => {
      delete process.env.MISTRAL_API_KEY;
      delete process.env.CHANDRA_API_KEY;

      const result = await WritingFeedbackHandler.handleWritingText(
        { id: 'm-0', text: { body: '/writing' } },
        FROM,
        USER
      );

      expect(result).toEqual({ handled: true });
      expect(mockSent.slice(-1)[0].text).toMatch(/can't read handwriting on this setup yet/i);
      expect(mockSent.slice(-1)[0].text).toMatch(/type the paragraph/i);
      // And no session was opened on a promise it can't keep.
      expect(mockSupabase.__rows()).toHaveLength(0);
    });
  });
});
