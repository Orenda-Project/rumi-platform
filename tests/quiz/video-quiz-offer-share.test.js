'use strict';
/**
 * bd-2336 — a teacher who wants to set the quiz as homework should not have to
 * sit through fifteen questions first.
 *
 * Before this, "Share with class" only appeared AFTER she completed a solo run.
 * The offer now carries a third choice that mints the class link straight away.
 *
 * Two things are easy to get wrong here and both are asserted:
 *  - WhatsApp allows at most THREE reply buttons, and truncates titles over 20
 *    characters SILENTLY. A fourth button, or a long title, fails in the field
 *    and nowhere else.
 *  - Taking the share path must NOT start a solo session. If it did, the teacher
 *    would be sent question 1 while also being handed the link.
 */

jest.mock('../../bot/shared/config/supabase', () => ({ from: jest.fn() }));
jest.mock('../../bot/shared/services/cache/railway-redis.service', () => ({
  get: jest.fn(), set: jest.fn().mockResolvedValue(true), delete: jest.fn(),
}));
jest.mock('../../bot/shared/services/whatsapp.service', () => ({
  sendMessage: jest.fn().mockResolvedValue(true),
  sendInteractiveButtons: jest.fn().mockResolvedValue(true),
}));
jest.mock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
jest.mock('../../bot/shared/utils/structured-logger', () => ({ logEvent: jest.fn() }));

const redisService = require('../../bot/shared/services/cache/railway-redis.service');
const WhatsAppService = require('../../bot/shared/services/whatsapp.service');
const share = require('../../bot/shared/services/quiz/video-quiz-share.service');
const vq = require('../../bot/shared/services/quiz/video-quiz.service');

const BUTTON_TITLE_MAX = 20;

beforeEach(() => {
  jest.clearAllMocks();
  // The share-path tests spy on deliverClassLink; without restoring, the spy
  // leaks into the last describe and it asserts against a stub of itself.
  jest.restoreAllMocks();
});

describe('bd-2336 — the offer gives her a way out of taking it herself', () => {
  test('an offer with a share choice still fits inside WhatsApp limits', () => {
    for (const language of ['en', 'ur']) {
      const t = vq.offerStrings(language);
      const titles = [t.yes, t.no, t.share];
      expect(titles.filter(Boolean)).toHaveLength(3);   // never a 4th button
      for (const title of titles) {
        expect(title.length).toBeLessThanOrEqual(BUTTON_TITLE_MAX);
      }
    }
  });

  test('every offered language has the share option, not just English', () => {
    // A missing key here degrades an Urdu teacher to an English button, the
    // partial-locale-map failure this project keeps re-learning.
    expect(vq.offerStrings('ur').share).toBeTruthy();
    expect(vq.offerStrings('ur').share).not.toBe(vq.offerStrings('en').share);
  });
});

describe('bd-2336 — taking the share path hands over the link, not a quiz', () => {
  const offer = {
    userId: 'u1', quizId: 'q1', videoId: 'v1', language: 'en', deliveryId: 'd1',
  };

  beforeEach(() => {
    redisService.get.mockResolvedValue(offer);
    supabaseStub();
  });

  function supabaseStub() {
    const supabase = require('../../bot/shared/config/supabase');
    supabase.from.mockImplementation(() => {
      const chain = {
        select: () => chain, eq: () => chain, insert: () => chain,
        update: () => chain, single: async () => ({ data: null }),
        maybeSingle: async () => ({ data: { first_name: 'Ayesha', last_name: 'K' } }),
      };
      return chain;
    });
  }

  test('the share button is recognised as ours', async () => {
    jest.spyOn(share, 'deliverClassLink').mockResolvedValue(true);
    const handled = await vq.handleOfferButton(vq.OFFER_SHARE, '923001234567');
    expect(handled).toBe(true);
  });

  test('it delivers the class link without starting a solo session', async () => {
    const deliver = jest.spyOn(share, 'deliverClassLink').mockResolvedValue(true);
    const start = jest.spyOn(vq, 'startSession');

    await vq.handleOfferButton(vq.OFFER_SHARE, '923001234567');

    expect(deliver).toHaveBeenCalledWith(expect.objectContaining({
      quizId: 'q1', videoId: 'v1', userId: 'u1',
    }), '923001234567');
    expect(start).not.toHaveBeenCalled();
  });
});

describe('bd-2336 — the link message is the same one either way', () => {
  test('deliverClassLink sends a forwardable message carrying the code', async () => {
    const supabase = require('../../bot/shared/config/supabase');
    supabase.from.mockImplementation((table) => {
      const chain = {
        select: () => chain, eq: () => chain, update: () => chain,
        insert: () => ({ select: () => ({ single: async () => ({
          data: { code: 'K7RM2', teacher_name: 'Ayesha K', topic: 'Who Is Outside' },
          error: null,
        }) }) }),
        maybeSingle: async () => ({
          data: table === 'users'
            ? { first_name: 'Ayesha', last_name: 'K' }
            : { topic: 'Who Is Outside' },
        }),
      };
      return chain;
    });

    await share.deliverClassLink(
      { quizId: 'q1', videoId: 'v1', userId: 'u1', language: 'en' },
      '923001234567');

    const bodies = WhatsAppService.sendMessage.mock.calls.map((c) => c[1]);
    // One message must be forwardable on its own and carry the join code.
    expect(bodies.some((b) => /QUIZ-K7RM2/.test(b))).toBe(true);
    // And she is told when to expect results, so the silence until then is not
    // read as the feature failing.
    expect(bodies.some((b) => /report/i.test(b))).toBe(true);
  });
});
