/**
 * The cap gates on paths that hold only the account id (limits/daily-caps.js
 * allowOrExplainForUserId): a lesson plan from a textbook photo (pic-to-LP)
 * and a class quiz (/quiz → quiz-orchestrator). Mocked at the boundary: the
 * database (the users row), the messaging facade, Redis (absent), the logger,
 * and what each path would have started (Gamma/Kie.ai hand-off, quiz generation).
 */

const FROM = '15550100051';

function load(account) {
  jest.resetModules();
  const sb = {
    from: jest.fn((table) => {
      if (table !== 'users') throw new Error(`unexpected table ${table}`);
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: account, error: null }) }) }) };
    }),
  };
  jest.doMock('../../bot/shared/config/supabase', () => sb);
  jest.doMock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
  jest.doMock('../../bot/shared/services/cache/railway-redis.service', () => ({ isAvailable: () => false, redis: null }));
  const WA = { sendMessage: jest.fn().mockResolvedValue(true) };
  jest.doMock('../../bot/shared/services/whatsapp.service', () => WA);
  const Kie = { enqueueAndAck: jest.fn().mockResolvedValue(true) };
  jest.doMock('../../bot/shared/services/pic-to-lp/kieai-handoff.service', () => Kie);
  const QuizGen = { generateAndStore: jest.fn().mockResolvedValue('q-1') };
  jest.doMock('../../bot/shared/services/quiz/quiz-generation.service', () => QuizGen);
  jest.doMock('../../bot/shared/services/quiz/quiz-delivery.service', () => ({ deliverQuiz: jest.fn().mockResolvedValue(true) }));
  return { WA, Kie, QuizGen, sb };
}

const saved = {};
const KEYS = ['DAILY_LESSON_PLAN_CAP_UNREGISTERED', 'DAILY_QUIZ_CAP_UNREGISTERED', 'PIC_LP_FORCE_KIEAI'];
beforeEach(() => { for (const k of KEYS) { saved[k] = process.env[k]; delete process.env[k]; } process.env.PIC_LP_FORCE_KIEAI = 'true'; });
afterEach(() => { for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } jest.resetModules(); });

describe('pic-to-LP (lp-handoff generateAndDeliver)', () => {
  const session = { id: 's-1', user_id: 'u-1' };
  it('unregistered, cap 0: refused with the registration message; nothing handed off', async () => {
    process.env.DAILY_LESSON_PLAN_CAP_UNREGISTERED = '0';
    const { WA, Kie } = load({ id: 'u-1', registration_completed: false });
    const LpHandoff = require('../../bot/shared/services/pic-to-lp/lp-handoff.service');
    await LpHandoff.generateAndDeliver({ session, formData: { topic: 'Plants' }, from: FROM });
    expect(Kie.enqueueAndAck).not.toHaveBeenCalled();
    expect(WA.sendMessage).toHaveBeenCalledWith(FROM, expect.stringMatching(/Lesson plans are available once you finish registering/));
  });

  it('registered: handed off as before', async () => {
    process.env.DAILY_LESSON_PLAN_CAP_UNREGISTERED = '0';
    const { Kie } = load({ id: 'u-1', registration_completed: true });
    const LpHandoff = require('../../bot/shared/services/pic-to-lp/lp-handoff.service');
    await LpHandoff.generateAndDeliver({ session, formData: { topic: 'Plants' }, from: FROM });
    expect(Kie.enqueueAndAck).toHaveBeenCalledTimes(1);
  });

  it('no cap set: not even a users read', async () => {
    const { Kie, sb } = load({ id: 'u-1', registration_completed: false });
    const LpHandoff = require('../../bot/shared/services/pic-to-lp/lp-handoff.service');
    await LpHandoff.generateAndDeliver({ session, formData: { topic: 'Plants' }, from: FROM });
    expect(sb.from).not.toHaveBeenCalledWith('users');
    expect(Kie.enqueueAndAck).toHaveBeenCalledTimes(1);
  });
});

describe('class quiz (QuizOrchestrator._generateAndDeliver)', () => {
  it('unregistered over DAILY_QUIZ_CAP_UNREGISTERED: told, not generated', async () => {
    process.env.DAILY_QUIZ_CAP_UNREGISTERED = '1';
    const { WA, QuizGen } = load({ id: 'u-1', registration_completed: false });
    const Q = require('../../bot/shared/services/quiz/quiz-orchestrator.service');
    await Q._generateAndDeliver({ id: 'u-1' }, FROM, 'Fractions', 'c-1', null, 'en');
    await Q._generateAndDeliver({ id: 'u-1' }, FROM, 'Fractions', 'c-1', null, 'en');
    expect(QuizGen.generateAndStore).toHaveBeenCalledTimes(1);
    expect(WA.sendMessage).toHaveBeenLastCalledWith(FROM, expect.stringMatching(/made 1 quiz today, the daily limit before registration/));
  });
});
