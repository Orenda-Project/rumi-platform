/**
 * Lesson plans on a deployment that cannot make them (no GAMMA_API_KEY):
 * the teacher is told so and nothing is queued, on the paths not covered by
 * expensive-job-caps.test.js (typed requests) or
 * voice-lesson-plan-unavailable.test.js (voice notes): the next-topic lesson
 * plan after a quiz report (quiz-follow-up.service.js) and a lesson plan from
 * a textbook photo whose backend is Gamma (pic-to-lp/lp-handoff.service.js).
 * Mocked at the boundary: Redis, the database, the messaging facade, the
 * queue, the Kie.ai hand-off and the logger.
 */

const FROM = '15550100071';
const USER_ID = '00000000-0000-4000-8000-0000000000e1';

const KEYS = ['GAMMA_API_KEY', 'KIE_API_KEY', 'KIE_API_KEY_PIC_LP', 'PIC_LP_FORCE_GAMMA', 'PIC_LP_FORCE_KIEAI',
  'DAILY_LESSON_PLAN_CAP_UNREGISTERED', 'DAILY_LESSON_PLAN_CAP_REGISTERED', 'DAILY_LESSON_PLAN_CAP_TOTAL'];
const saved = {};
beforeEach(() => { for (const k of KEYS) { saved[k] = process.env[k]; delete process.env[k]; } });
afterEach(() => { for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } jest.resetModules(); });

let redis;
function load({ awaiting = null } = {}) {
  jest.resetModules();
  jest.doMock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
  jest.doMock('../../bot/shared/config/supabase', () => ({ from: jest.fn(() => { throw new Error('no database in this test'); }) }));
  redis = {
    get: jest.fn(async (key) => (awaiting && !key.endsWith(':options') ? JSON.stringify(awaiting) : null)),
    del: jest.fn(async () => 1),
  };
  jest.doMock('../../bot/shared/services/cache/railway-redis.service', () => ({
    isAvailable: () => false, redis, setexWithCeiling: jest.fn(async () => true),
  }));
  const WA = { sendMessage: jest.fn().mockResolvedValue(true), sendInteractiveButtons: jest.fn().mockResolvedValue(true) };
  jest.doMock('../../bot/shared/services/whatsapp.service', () => WA);
  const Queue = { createAndQueue: jest.fn().mockResolvedValue('lp-req-1') };
  jest.doMock('../../bot/shared/services/lesson-plan-queue.service', () => Queue);
  jest.doMock('../../bot/shared/services/quiz/quiz-insight.service', () => ({}));
  const Kie = { enqueueAndAck: jest.fn().mockResolvedValue(true) };
  jest.doMock('../../bot/shared/services/pic-to-lp/kieai-handoff.service', () => Kie);
  require('../../bot/shared/config/feature-availability').overrides.load(process.env);
  return { WA, Queue, Kie };
}
const unavailable = /Lesson plans aren.t available on this service yet/;

describe('the next-topic lesson plan after a quiz report (handleNextTopicReply)', () => {
  const awaiting = { kind: 'next_topic_bridge', priorTopic: 'Fractions', priorGrade: '4', priorSubject: 'maths' };

  it('with no GAMMA_API_KEY: told lesson plans are not available here, nothing queued, no longer waiting for a topic', async () => {
    const { WA, Queue } = load({ awaiting });
    const FollowUp = require('../../bot/shared/services/quiz/quiz-follow-up.service');
    expect(await FollowUp.handleNextTopicReply(USER_ID, FROM, 'en', 'Decimals')).toBe(true);
    expect(Queue.createAndQueue).not.toHaveBeenCalled();
    expect(WA.sendMessage.mock.calls.map((c) => c[1])).toEqual([expect.stringMatching(unavailable)]);
    expect(redis.del).toHaveBeenCalledWith(`quiz:awaiting_next_topic:${USER_ID}`);
  });

  it('with GAMMA_API_KEY: the plan is queued as before', async () => {
    process.env.GAMMA_API_KEY = 'test-gamma-key';
    const { WA, Queue } = load({ awaiting });
    const FollowUp = require('../../bot/shared/services/quiz/quiz-follow-up.service');
    await FollowUp.handleNextTopicReply(USER_ID, FROM, 'en', 'Decimals');
    expect(Queue.createAndQueue).toHaveBeenCalledWith(expect.objectContaining({ userId: USER_ID, topic: 'Decimals', contentType: 'lesson_plan' }));
    expect(WA.sendMessage).not.toHaveBeenCalledWith(FROM, expect.stringMatching(unavailable));
  });
});

describe('a lesson plan from a textbook photo on the Gamma backend (lp-handoff generateAndDeliver)', () => {
  const session = { id: 's-1', user_id: USER_ID };
  const formData = { topic: 'Plants', language: 'en' };

  it('no GAMMA_API_KEY and no Kie.ai key: told lesson plans are not available here, nothing started', async () => {
    process.env.PIC_LP_FORCE_GAMMA = 'true';
    const { WA, Kie } = load();
    const LpHandoff = require('../../bot/shared/services/pic-to-lp/lp-handoff.service');
    expect(await LpHandoff.generateAndDeliver({ session, formData, from: FROM })).toBeNull();
    expect(Kie.enqueueAndAck).not.toHaveBeenCalled();
    expect(WA.sendMessage.mock.calls.map((c) => c[1])).toEqual([expect.stringMatching(unavailable)]);
  });

  it('no GAMMA_API_KEY but a Kie.ai key: the plan goes to Kie.ai instead of a Gamma call that would fail', async () => {
    process.env.PIC_LP_FORCE_GAMMA = 'true';
    process.env.KIE_API_KEY_PIC_LP = 'test-kie-key';
    const { WA, Kie } = load();
    const LpHandoff = require('../../bot/shared/services/pic-to-lp/lp-handoff.service');
    await LpHandoff.generateAndDeliver({ session, formData, from: FROM });
    expect(Kie.enqueueAndAck).toHaveBeenCalledTimes(1);
    expect(WA.sendMessage).not.toHaveBeenCalledWith(FROM, expect.stringMatching(unavailable));
  });
});

describe('lessonPlansAvailable', () => {
  it('follows GAMMA_API_KEY', () => {
    const { lessonPlansAvailable } = require('../../bot/shared/services/lesson-plan-availability');
    expect(lessonPlansAvailable({})).toBe(false);
    expect(lessonPlansAvailable({ GAMMA_API_KEY: 'k' })).toBe(true);
  });
});
