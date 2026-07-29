/**
 * Student Video Feedback Service — bd-1598 follow-on tests.
 *
 * Mirrors tests/textbook-lp-v2/lp-feedback.test.js so the surveys are
 * tested with the same shape:
 *   - 👍 button tap inserts row with useful=true + snapshot
 *   - 👎 button tap inserts row with useful=false + arms Redis reason flag
 *   - Duplicate button tap is idempotent (no second insert)
 *   - Reason consumer UPDATEs existing row when text arrives within window
 *   - Reason consumer skips slash commands (returns false)
 *   - Reason consumer ignores when no pending flag
 *   - scheduleFeedbackPrompt emits the scheduled event and fires
 *     sendInteractiveButtons after the delay
 */

jest.mock('../bot/shared/config/supabase', () => ({ from: jest.fn() }));
jest.mock('../bot/shared/services/cache/railway-redis.service', () => ({
  set: jest.fn().mockResolvedValue(true),
  get: jest.fn(),
  delete: jest.fn().mockResolvedValue(true),
}));
jest.mock('../bot/shared/services/whatsapp.service', () => ({
  sendMessage: jest.fn().mockResolvedValue(true),
  sendInteractiveButtons: jest.fn().mockResolvedValue(true),
}));
jest.mock('../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
jest.mock('../bot/shared/utils/structured-logger', () => ({ logEvent: jest.fn() }));

const supabase = require('../bot/shared/config/supabase');
const redisService = require('../bot/shared/services/cache/railway-redis.service');
const WhatsAppService = require('../bot/shared/services/whatsapp.service');
const { logEvent } = require('../bot/shared/utils/structured-logger');
const StudentVideoFeedbackService = require('../bot/shared/services/student-video-feedback.service');

const flushPromises = () => new Promise(setImmediate);

// --- Helpers ----------------------------------------------------------------

function mockVideoLookup(row) {
  return {
    select: jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        maybeSingle: jest.fn().mockResolvedValue({ data: row, error: null }),
      }),
    }),
  };
}

function mockUserLookupByPhone(userRow) {
  return {
    select: jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        maybeSingle: jest.fn().mockResolvedValue({ data: userRow, error: null }),
      }),
    }),
  };
}

function mockFeedbackTable(existing = null, insertedId = 'fb-1') {
  return {
    select: jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          maybeSingle: jest.fn().mockResolvedValue({ data: existing, error: null }),
        }),
      }),
    }),
    insert: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        single: jest.fn().mockResolvedValue({ data: { id: insertedId }, error: null }),
      }),
    }),
    update: jest.fn().mockReturnValue({
      eq: jest.fn().mockResolvedValue({ data: null, error: null }),
    }),
  };
}

const VIDEO_ID = 'b5c6d7e8-1234-4abc-8def-abcdefabcdef';
const USER_ID  = '12345678-1234-4abc-8def-abcdefabcdef';
const PHONE    = '15550100000';

describe('StudentVideoFeedbackService', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  // ----- handleFeedbackButton ----------------------------------------------

  describe('handleFeedbackButton — 👍 yes path', () => {
    test('looks up video, inserts useful=true row with snapshot', async () => {
      const videoRow = { id: VIDEO_ID, grade: '4', subject: 'Science', clean_chapter: 'Plants', clean_title: 'Photosynthesis' };
      const userRow  = { id: USER_ID, preferred_language: 'en' };
      const feedbackTbl = mockFeedbackTable(null);
      supabase.from.mockImplementation((table) => {
        if (table === 'student_videos') return mockVideoLookup(videoRow);
        if (table === 'users') return mockUserLookupByPhone(userRow);
        if (table === 'student_video_feedback') return feedbackTbl;
        throw new Error('Unexpected supabase.from(' + table + ')');
      });

      const handled = await StudentVideoFeedbackService.handleFeedbackButton(
        `student_video_feedback_yes_${VIDEO_ID}`, PHONE
      );

      expect(handled).toBe(true);
      expect(feedbackTbl.insert).toHaveBeenCalledWith(expect.objectContaining({
        user_id: USER_ID,
        video_id: VIDEO_ID,
        useful: true,
        grade: '4',
        subject: 'Science',
        topic: 'Plants',
        subtopic: 'Photosynthesis',
      }));
      // No "what didn't work" prompt on 👍
      expect(redisService.set).not.toHaveBeenCalled();
      expect(WhatsAppService.sendMessage).toHaveBeenCalledWith(PHONE, expect.stringMatching(/glad it helped/i));
    });
  });

  describe('handleFeedbackButton — 👎 no path', () => {
    test('inserts useful=false and arms Redis reason flag (10-min)', async () => {
      const videoRow = { id: VIDEO_ID, grade: '5', subject: 'Maths', clean_chapter: 'Fractions', clean_title: 'Adding Fractions' };
      const userRow  = { id: USER_ID, preferred_language: 'ur' };
      const feedbackTbl = mockFeedbackTable(null, 'fb-2');
      supabase.from.mockImplementation((table) => {
        if (table === 'student_videos') return mockVideoLookup(videoRow);
        if (table === 'users') return mockUserLookupByPhone(userRow);
        if (table === 'student_video_feedback') return feedbackTbl;
        throw new Error('Unexpected supabase.from(' + table + ')');
      });

      const handled = await StudentVideoFeedbackService.handleFeedbackButton(
        `student_video_feedback_no_${VIDEO_ID}`, PHONE
      );

      expect(handled).toBe(true);
      expect(feedbackTbl.insert).toHaveBeenCalledWith(expect.objectContaining({
        user_id: USER_ID, video_id: VIDEO_ID, useful: false,
        grade: '5', subject: 'Maths', topic: 'Fractions', subtopic: 'Adding Fractions',
      }));
      expect(redisService.set).toHaveBeenCalledWith(
        `student_video_feedback_pending:${USER_ID}`,
        expect.objectContaining({ feedbackId: 'fb-2', polarity: 'disliked' }),
        StudentVideoFeedbackService.REASON_WINDOW_SECS
      );
      // Urdu ack copy when preferred_language='ur'
      expect(WhatsAppService.sendMessage).toHaveBeenCalledWith(PHONE, expect.stringMatching(/کیا چیز کام نہیں آئی/));
    });
  });

  describe('handleFeedbackButton — idempotency', () => {
    test('duplicate tap (same useful value) does NOT insert again', async () => {
      const videoRow = { id: VIDEO_ID, grade: '4', subject: 'Science', clean_chapter: 'Plants', clean_title: 'Roots' };
      const userRow  = { id: USER_ID, preferred_language: 'en' };
      const existing = { id: 'prev-1', useful: true };
      const feedbackTbl = mockFeedbackTable(existing);
      supabase.from.mockImplementation((table) => {
        if (table === 'student_videos') return mockVideoLookup(videoRow);
        if (table === 'users') return mockUserLookupByPhone(userRow);
        if (table === 'student_video_feedback') return feedbackTbl;
      });

      const handled = await StudentVideoFeedbackService.handleFeedbackButton(
        `student_video_feedback_yes_${VIDEO_ID}`, PHONE
      );

      expect(handled).toBe(true);
      expect(feedbackTbl.insert).not.toHaveBeenCalled();
      // useful didn't change — no UPDATE either
      expect(feedbackTbl.update).not.toHaveBeenCalled();
    });

    test('duplicate tap (toggled useful value) UPDATEs existing row', async () => {
      const videoRow = { id: VIDEO_ID, grade: '4', subject: 'Science', clean_chapter: 'Plants', clean_title: 'Roots' };
      const userRow  = { id: USER_ID, preferred_language: 'en' };
      const existing = { id: 'prev-1', useful: true };
      const feedbackTbl = mockFeedbackTable(existing);
      supabase.from.mockImplementation((table) => {
        if (table === 'student_videos') return mockVideoLookup(videoRow);
        if (table === 'users') return mockUserLookupByPhone(userRow);
        if (table === 'student_video_feedback') return feedbackTbl;
      });

      await StudentVideoFeedbackService.handleFeedbackButton(
        `student_video_feedback_no_${VIDEO_ID}`, PHONE
      );

      expect(feedbackTbl.update).toHaveBeenCalledWith({ useful: false });
    });
  });

  describe('handleFeedbackButton — non-matching button id', () => {
    test('returns false for unrelated button id (does NOT consume it)', async () => {
      const handled = await StudentVideoFeedbackService.handleFeedbackButton(
        'coaching_confirm_abc-123', PHONE
      );
      expect(handled).toBe(false);
      expect(supabase.from).not.toHaveBeenCalled();
    });
  });

  // ----- consumeReasonIfPending --------------------------------------------

  describe('consumeReasonIfPending', () => {
    test('with pending flag, UPDATEs row with reason and clears the flag', async () => {
      redisService.get.mockResolvedValueOnce({ feedbackId: 'fb-3', polarity: 'disliked' });
      const tbl = {
        update: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ data: null, error: null }),
        }),
      };
      supabase.from.mockImplementation((table) => {
        if (table === 'student_video_feedback') return tbl;
        if (table === 'users') return mockUserLookupByPhone({ preferred_language: 'en' });
      });

      const consumed = await StudentVideoFeedbackService.consumeReasonIfPending(
        USER_ID, PHONE, 'too long for my class'
      );

      expect(consumed).toBe(true);
      expect(tbl.update).toHaveBeenCalledWith(expect.objectContaining({
        reason_text: 'too long for my class',
        reason_language: 'en',
        reason_polarity: 'disliked',
      }));
      expect(redisService.delete).toHaveBeenCalledWith(`student_video_feedback_pending:${USER_ID}`);
    });

    test('skips slash commands (returns false, does NOT clear flag)', async () => {
      redisService.get.mockResolvedValueOnce({ feedbackId: 'fb-4', polarity: 'disliked' });
      const consumed = await StudentVideoFeedbackService.consumeReasonIfPending(
        USER_ID, PHONE, '/menu'
      );
      expect(consumed).toBe(false);
      expect(redisService.delete).not.toHaveBeenCalled();
    });

    test('returns false when no pending flag', async () => {
      redisService.get.mockResolvedValueOnce(null);
      const consumed = await StudentVideoFeedbackService.consumeReasonIfPending(
        USER_ID, PHONE, 'some text'
      );
      expect(consumed).toBe(false);
    });

    test('orphan path: feedbackId="__orphan__" logs reason event and acks', async () => {
      redisService.get.mockResolvedValueOnce({ feedbackId: '__orphan__', videoId: VIDEO_ID });
      supabase.from.mockImplementation((table) => {
        if (table === 'users') return mockUserLookupByPhone({ preferred_language: 'en' });
        throw new Error('orphan path should not touch student_video_feedback');
      });

      const consumed = await StudentVideoFeedbackService.consumeReasonIfPending(
        USER_ID, PHONE, 'video was too quiet'
      );

      expect(consumed).toBe(true);
      const orphanCall = logEvent.mock.calls.find(c => c[0] === 'student_video.feedback.reason_received_orphan');
      expect(orphanCall).toBeTruthy();
    });
  });

  // ----- scheduleFeedbackPrompt --------------------------------------------

  describe('scheduleFeedbackPrompt', () => {
    test('logs scheduled event immediately and fires sendInteractiveButtons after delay', (done) => {
      StudentVideoFeedbackService.scheduleFeedbackPrompt({
        videoId: VIDEO_ID,
        userId: USER_ID,
        phone: PHONE,
        context: { grade: '4', subject: 'Science', chapter: 'Plants', title: 'Roots', language: 'en' },
        delayMs: 30,
      });

      // Scheduled event fires synchronously
      expect(logEvent).toHaveBeenCalledWith(
        'student_video.feedback_prompt.scheduled',
        expect.objectContaining({ videoId: VIDEO_ID, delayMs: 30 })
      );

      // Buttons fire after the delay
      setTimeout(() => {
        try {
          expect(WhatsAppService.sendInteractiveButtons).toHaveBeenCalledWith(PHONE, expect.objectContaining({
            body: expect.stringMatching(/Did you like/i),
            buttons: expect.arrayContaining([
              expect.objectContaining({ id: `student_video_feedback_yes_${VIDEO_ID}` }),
              expect.objectContaining({ id: `student_video_feedback_no_${VIDEO_ID}` }),
            ]),
          }));
          done();
        } catch (err) {
          done(err);
        }
      }, 100);
    });

    test('missing required field is a no-op', () => {
      StudentVideoFeedbackService.scheduleFeedbackPrompt({ videoId: VIDEO_ID }); // no userId/phone
      expect(logEvent).not.toHaveBeenCalledWith(
        'student_video.feedback_prompt.scheduled', expect.anything()
      );
    });
  });
});
