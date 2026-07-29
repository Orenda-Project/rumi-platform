'use strict';
/**
 * Region gate — video quizzes are enabled per-region via region_features
 * (seeded ON for region='pakistan' only, because the corpus belongs to the
 * Taleemabad Pakistani-curriculum video library).
 *
 * Two entry points are gated and both are asserted here:
 *  - offerAfterVideo: a region with the flag off must see the video exactly
 *    as before (no offer, standalone survey untouched).
 *  - beginFromCode:   an old share link must stop admitting children when the
 *    flag is off — minting time does not grandfather delivery time.
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
jest.mock('../../bot/shared/services/region-features.service', () => ({
  isVideoQuizzesEnabled: jest.fn(),
}));

const { isVideoQuizzesEnabled } = require('../../bot/shared/services/region-features.service');
const supabase = require('../../bot/shared/config/supabase');
const WhatsAppService = require('../../bot/shared/services/whatsapp.service');
const vq = require('../../bot/shared/services/quiz/video-quiz.service');
const share = require('../../bot/shared/services/quiz/video-quiz-share.service');

beforeEach(() => jest.clearAllMocks());

describe('region gate — offerAfterVideo', () => {
  test('flag OFF: returns false without even looking up the quiz', async () => {
    isVideoQuizzesEnabled.mockResolvedValue(false);
    const offered = await vq.offerAfterVideo({
      userId: 'u1', phone: '15550100000',
      video: { id: 'v1', clean_title: 'Adjectives' },
    });
    expect(offered).toBe(false);
    // The quiz lookup must not run — the gate sits in front of the DB.
    expect(supabase.from).not.toHaveBeenCalled();
  });

  test('flag ON: proceeds to the quiz lookup', async () => {
    isVideoQuizzesEnabled.mockResolvedValue(true);
    const maybeSingle = jest.fn().mockResolvedValue({ data: null, error: null });
    const eq2 = jest.fn(() => ({ maybeSingle }));
    const eq1 = jest.fn(() => ({ eq: eq2 }));
    supabase.from.mockReturnValue({ select: jest.fn(() => ({ eq: eq1 })) });
    const offered = await vq.offerAfterVideo({
      userId: 'u1', phone: '15550100000',
      video: { id: 'v1', clean_title: 'Adjectives' },
    });
    expect(offered).toBe(false); // no quiz row for this video
    expect(supabase.from).toHaveBeenCalledWith('quizzes');
  });
});

describe('region gate — beginFromCode', () => {
  test('flag OFF: an existing share code no longer admits a child', async () => {
    isVideoQuizzesEnabled.mockResolvedValue(false);
    const handled = await share.beginFromCode('15550100001', 'K7RM2');
    expect(handled).toBe(false);
    expect(WhatsAppService.sendMessage).not.toHaveBeenCalled();
    expect(supabase.from).not.toHaveBeenCalled();
  });
});
