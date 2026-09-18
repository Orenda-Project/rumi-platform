/**
 * Writing feedback — the state machine.
 *
 *   awaiting_photo → awaiting_age → awaiting_parent_confirm → done
 *
 * The one rule this feature cannot get wrong: nothing reaches the child until
 * the parent has confirmed. So these tests assert the persisted `status` at
 * every hop, and that `confirmed_at` is written ONLY on the confirm step —
 * a state machine that skipped straight to `done` would still send a message,
 * which is exactly the unvalidated-automation failure mode the feature exists
 * to avoid.
 *
 * Timeout behaviour matches the other multi-step features (exam checker's 24h
 * session TTL): a session left untouched past the window is cancelled, not
 * resumed, so a stale row can never swallow tomorrow's photo.
 */

const { createFakeSupabase, createFakeRedis } = require('./fake-supabase');

// `mock`-prefixed so Jest allows the module factories below to close over them.
const mockSupabase = createFakeSupabase();
const mockRedis = createFakeRedis();
const mockSent = [];

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

jest.mock('../../bot/shared/services/exam-checker/ocr.service', () => ({
  extractSingle: async () => ({
    rawText: 'On Eid I woke up early. My ami give me new clothes. We go to my nana house and eat delicious sheer khurma. It was the best day.',
    confidence: 0.6,
    provider: 'mistral',
    questions: [],
  }),
}));

jest.mock('../../bot/shared/services/llm-client', () => ({
  getDefaultModel: () => 'test-model',
  getClient: () => ({
    chat: {
      completions: {
        create: async ({ messages }) => {
          const isScript = messages[0].content.includes('How to say it')
            || messages[0].content.includes('script for HOW');
          if (isScript) {
            return { choices: [{ message: { content: 'Tell him you loved the sheer khurma detail. Then ask if you can look at one line together.' } }] };
          }
          return {
            choices: [{
              message: {
                content: JSON.stringify({
                  praise: 'You used "delicious" — that is a strong, specific word.',
                  edits: [
                    { what: 'My ami give me', why: 'It already happened, so the verb looks back too.', better: 'My ami gave me' },
                    { what: 'We go to my nana house', why: 'The house belongs to nana, so it needs an apostrophe.', better: "We went to my nana's house" },
                  ],
                }),
              },
            }],
          };
        },
      },
    },
  }),
}));

const WritingFeedbackService = require('../../bot/shared/services/writing-feedback.service');
const WritingFeedbackHandler = require('../../bot/shared/handlers/writing-feedback.handler');

const USER = { id: 'user-1' };
const FROM = '923001234567';

const textMessage = (body) => ({ id: `m-${Math.random()}`, text: { body } });
const imageMessage = (caption) => ({
  id: `m-${Math.random()}`,
  image: { id: 'img-1', mime_type: 'image/jpeg', caption },
});

/** The single persisted session row (there is only ever one live per user). */
const row = () => mockSupabase.__rows().slice(-1)[0];

describe('Writing feedback — state machine', () => {
  beforeEach(() => {
    mockSupabase.__reset();
    mockRedis.__store.clear();
    mockSent.length = 0;
    process.env.MISTRAL_API_KEY = 'test-mistral-key';
  });

  it('opens at awaiting_photo and asks for the photo', async () => {
    const result = await WritingFeedbackHandler.handleWritingText(textMessage('/writing'), FROM, USER);

    expect(result).toEqual({ handled: true });
    expect(row().status).toBe(WritingFeedbackService.STATES.AWAITING_PHOTO);
    expect(mockSent[0].text).toMatch(/photo/i);
  });

  it('walks photo → age → parent confirm → done, and only then stamps confirmed_at', async () => {
    await WritingFeedbackHandler.handleWritingText(textMessage('/writing'), FROM, USER);
    expect(row().status).toBe('awaiting_photo');

    // Photo → the OCR text is persisted and we move to the age question.
    await WritingFeedbackHandler.handleWritingImage(imageMessage(''), FROM, USER);
    expect(row().status).toBe('awaiting_age');
    expect(row().ocr_text).toMatch(/sheer khurma/);
    expect(row().ocr_confidence).toBe(0.6);
    expect(mockSent.slice(-1)[0].text).toMatch(/how old/i);

    // Age → the draft goes to the PARENT, and the session waits on her.
    await WritingFeedbackHandler.handleWritingText(textMessage('9'), FROM, USER);
    expect(row().status).toBe('awaiting_parent_confirm');
    expect(row().child_age).toBe(9);
    expect(row().ai_draft.edits).toHaveLength(2);
    expect(row().confirmed_at).toBeFalsy();

    const draftMessage = mockSent.slice(-1)[0].text;
    expect(draftMessage).toMatch(/read this before they do/i);
    expect(draftMessage).toMatch(/\*send\*/);

    // Nothing has been scripted for the child yet.
    expect(mockSent.some((m) => /How to say it/.test(m.text))).toBe(false);

    // Confirm → the script + final feedback, and only now `done`.
    await WritingFeedbackHandler.handleWritingText(textMessage('send'), FROM, USER);
    expect(row().status).toBe('done');
    expect(row().confirmed_at).toBeTruthy();
    expect(mockSent.slice(-1)[0].text).toMatch(/How to say it/);
  });

  it('records the parent edit count and the parent_final version she approved', async () => {
    await WritingFeedbackHandler.handleWritingText(textMessage('/writing'), FROM, USER);
    await WritingFeedbackHandler.handleWritingImage(imageMessage(''), FROM, USER);
    await WritingFeedbackHandler.handleWritingText(textMessage('9'), FROM, USER);

    await WritingFeedbackHandler.handleWritingText(textMessage('drop 2'), FROM, USER);
    expect(row().status).toBe('awaiting_parent_confirm');
    expect(row().edits_count).toBe(1);
    expect(row().parent_final.edits).toHaveLength(1);
    // The AI's own draft is preserved untouched — it is the other half of the
    // accuracy signal.
    expect(row().ai_draft.edits).toHaveLength(2);

    await WritingFeedbackHandler.handleWritingText(textMessage('send'), FROM, USER);
    expect(row().status).toBe('done');
    expect(row().parent_final.edits).toHaveLength(1);
  });

  it('re-asks rather than advancing when the age reply has no usable number', async () => {
    await WritingFeedbackHandler.handleWritingText(textMessage('/writing'), FROM, USER);
    await WritingFeedbackHandler.handleWritingImage(imageMessage(''), FROM, USER);

    await WritingFeedbackHandler.handleWritingText(textMessage('not sure really'), FROM, USER);

    expect(row().status).toBe('awaiting_age');
    expect(mockSent.slice(-1)[0].text).toMatch(/how old/i);
  });

  it('accepts a typed paragraph while awaiting the photo (the low-confidence escape route)', async () => {
    await WritingFeedbackHandler.handleWritingText(textMessage('/writing'), FROM, USER);

    const typed = 'On Eid I woke up early and my ami gave me new clothes to wear all day.';
    await WritingFeedbackHandler.handleWritingText(textMessage(typed), FROM, USER);

    expect(row().status).toBe('awaiting_age');
    expect(row().ocr_text).toBe(typed);
    expect(row().ocr_provider).toBe('parent_typed');
    expect(row().ocr_confidence).toBe(1);
  });

  it('cancels on "cancel" and stops asking', async () => {
    await WritingFeedbackHandler.handleWritingText(textMessage('/writing'), FROM, USER);
    await WritingFeedbackHandler.handleWritingText(textMessage('cancel'), FROM, USER);

    expect(row().status).toBe(WritingFeedbackService.STATES.CANCELLED);
    expect(await WritingFeedbackService.getActiveSession(USER.id)).toBeNull();
  });

  it('never swallows another feature\'s slash command mid-flow', async () => {
    await WritingFeedbackHandler.handleWritingText(textMessage('/writing'), FROM, USER);
    const result = await WritingFeedbackHandler.handleWritingText(textMessage('/menu'), FROM, USER);

    expect(result).toBeNull();
    expect(row().status).toBe('awaiting_photo');
  });

  it('returns null for an unrelated message when no session is open', async () => {
    const result = await WritingFeedbackHandler.handleWritingText(
      textMessage('how do I teach fractions?'),
      FROM,
      USER
    );
    expect(result).toBeNull();
    expect(mockSupabase.__rows()).toHaveLength(0);
  });

  describe('timeout', () => {
    it('treats a session untouched past the window as expired', () => {
      const stale = new Date(Date.now() - WritingFeedbackService.SESSION_TIMEOUT_MS - 1000).toISOString();
      const fresh = new Date().toISOString();

      expect(WritingFeedbackService.isExpired({ updated_at: stale })).toBe(true);
      expect(WritingFeedbackService.isExpired({ updated_at: fresh })).toBe(false);
    });

    it('uses the same 24h window as the other multi-step features', () => {
      expect(WritingFeedbackService.SESSION_TIMEOUT_MS).toBe(60 * 60 * 24 * 1000);
    });

    it('cancels an expired session instead of resuming it', async () => {
      await WritingFeedbackHandler.handleWritingText(textMessage('/writing'), FROM, USER);
      const id = row().id;

      // Age the row past the window, both in the DB and the cache.
      const stale = new Date(Date.now() - WritingFeedbackService.SESSION_TIMEOUT_MS - 1000).toISOString();
      mockSupabase.__patch(id, { updated_at: stale });
      mockRedis.__store.clear();

      expect(await WritingFeedbackService.getActiveSession(USER.id)).toBeNull();
      expect(mockSupabase.__rows().find((r) => r.id === id).status).toBe('cancelled');
    });
  });

  describe('phone handling', () => {
    it('stores a hash, never the parent\'s number', async () => {
      await WritingFeedbackHandler.handleWritingText(textMessage('/writing'), FROM, USER);

      expect(row().phone_hash).toHaveLength(64);
      expect(row().phone_hash).not.toContain(FROM);
      expect(JSON.stringify(row())).not.toContain(FROM);
    });

    it('hashes deterministically so sessions group per parent', () => {
      expect(WritingFeedbackService.hashPhone(FROM)).toBe(WritingFeedbackService.hashPhone(FROM));
      expect(WritingFeedbackService.hashPhone(FROM)).not.toBe(WritingFeedbackService.hashPhone('923009999999'));
    });
  });
});
