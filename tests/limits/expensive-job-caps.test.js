/**
 * Daily caps on the expensive jobs for an account that has not finished
 * registration (limits/daily-caps.js), at the places those jobs start:
 *
 *   lesson plans  text-message.handler.js handleLessonPlanRequest (via the REAL handleTextMessage)
 *   coaching      coaching-session.service.js initiateSession (every recording sent for coaching)
 *
 * (Quizzes: tests/quiz/quiz-daily-cap.test.js.) Mocked at the boundary: the
 * database (in-memory), the messaging facade, the queue, Redis (absent: the
 * in-process counter runs), the LLM services and the logger.
 */

const { createFakeDb } = require('../testpaper/helpers/fake-db');

const FROM = '15550100041';
const UNREGISTERED = { id: '00000000-0000-4000-8000-0000000000d1', preferred_language: 'en', phone_number: FROM, registration_completed: false };
const REGISTERED = { ...UNREGISTERED, id: '00000000-0000-4000-8000-0000000000d2', registration_completed: true };

const ENV_KEYS = ['DAILY_LESSON_PLAN_CAP_UNREGISTERED', 'DAILY_COACHING_CAP_UNREGISTERED', 'OPENROUTER_API_KEY'];
const saved = {};
beforeEach(() => { for (const k of ENV_KEYS) { saved[k] = process.env[k]; delete process.env[k]; } });
afterEach(() => {
  for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  jest.resetModules();
});

function inert(explicit = {}) {
  return new Proxy(explicit, {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (typeof prop === 'symbol' || prop === 'then' || prop === '__esModule') return undefined;
      target[prop] = jest.fn().mockResolvedValue(null);
      return target[prop];
    },
  });
}

describe('lesson plans (handleTextMessage → handleLessonPlanRequest)', () => {
  let WA;
  let OpenAI;
  let Queue;
  let handleTextMessage;
  let db;

  function load(account) {
    jest.resetModules();
    process.env.OPENROUTER_API_KEY = 'test-key';
    db = createFakeDb({ users: [{ id: account.id }], lesson_plan_requests: [] });
    jest.doMock('../../bot/shared/config/supabase', () => db);
    jest.doMock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn(), LOGS_DIR: '/tmp' }));
    jest.doMock('../../bot/shared/services/cache/railway-redis.service', () => inert({
      isAvailable: () => false, set: jest.fn().mockResolvedValue(false), get: jest.fn().mockResolvedValue(null), delete: jest.fn().mockResolvedValue(true), redis: inert(),
    }));
    WA = inert({
      sendMessage: jest.fn().mockResolvedValue(true),
      sendSticker: jest.fn().mockResolvedValue(true),
      startContinuousTypingIndicator: jest.fn(() => ({ stop: jest.fn() })),
    });
    jest.doMock('../../bot/shared/services/whatsapp.service', () => WA);
    Queue = { queueJob: jest.fn().mockResolvedValue('job-1'), queueCoachingJob: jest.fn().mockResolvedValue('job-1') };
    jest.doMock('../../bot/shared/services/queue', () => Queue);
    OpenAI = inert({
      detectIntent: jest.fn().mockResolvedValue({ type: 'lesson_plan' }),
      extractTopic: jest.fn().mockResolvedValue('Adjectives'),
    });
    jest.doMock('../../bot/shared/services/openai.service', () => OpenAI);
    jest.doMock('../../bot/shared/services/gpt5-mini.service', () => inert());
    jest.doMock('../../bot/shared/services/exam-checker/annotation.service', () => inert());
    jest.doMock('../../bot/shared/services/portal-invite.service', () => inert());
    jest.doMock('../../bot/shared/services/pdf-report.service', () => inert());
    jest.doMock('../../bot/shared/services/llm-client', () => ({ getClient: () => inert() }));
    jest.doMock('../../bot/shared/utils/language-cache', () => inert({
      getUserLanguage: jest.fn().mockResolvedValue('en'), setUserLanguage: jest.fn(), setLanguageLock: jest.fn(),
    }));
    jest.doMock('../../bot/shared/database/bot-helpers', () => inert({
      getOrCreateUser: jest.fn().mockResolvedValue(account),
      getOrCreateSession: jest.fn().mockResolvedValue('session-1'),
    }));
    jest.doMock('../../bot/shared/services/feature-registration.service', () => inert({ isPendingName: jest.fn().mockResolvedValue(false) }));
    jest.doMock('../../bot/shared/services/quiz/quiz-session.service', () => inert());
    jest.doMock('../../bot/shared/services/quiz/video-quiz-share.service', () => inert({
      parseShareCode: jest.fn(() => null), consumeJoinReply: jest.fn().mockResolvedValue(false),
    }));
    jest.doMock('../../bot/shared/services/student-video-feedback.service', () => inert({ consumeReasonIfPending: jest.fn().mockResolvedValue(false) }));
    require('../../bot/shared/config/feature-availability').overrides.load(process.env);
    ({ handleTextMessage } = require('../../bot/shared/handlers/text-message.handler'));
  }

  // Phrased past the keyword shortcut, so the intent classifier routes it.
  const BODY = 'Help me teach adjectives to grade 3 tomorrow';
  const ask = (account, n) => handleTextMessage({ id: `wamid.lp-${n}`, from: FROM, type: 'text', text: { body: BODY } }, FROM, BODY, account);
  const queued = () => Queue.queueCoachingJob.mock.calls.filter((c) => c[1] === 'lesson_plan_generation').length;
  const texts = () => WA.sendMessage.mock.calls.map((c) => c[1]);

  it('an unregistered account past DAILY_LESSON_PLAN_CAP_UNREGISTERED is told so and nothing is queued or asked of a model', async () => {
    process.env.DAILY_LESSON_PLAN_CAP_UNREGISTERED = '1';
    load(UNREGISTERED);
    await ask(UNREGISTERED, 1);
    expect(queued()).toBe(1);
    await ask(UNREGISTERED, 2);
    expect(queued()).toBe(1);
    expect(OpenAI.extractTopic).toHaveBeenCalledTimes(1);
    expect(texts()[texts().length - 1]).toMatch(/made 1 lesson plan today, the daily limit before registration.*\/register/);
  });

  it('0 means no lesson plans until registration is finished', async () => {
    process.env.DAILY_LESSON_PLAN_CAP_UNREGISTERED = '0';
    load(UNREGISTERED);
    await ask(UNREGISTERED, 1);
    expect(queued()).toBe(0);
    expect(texts()).toEqual([expect.stringMatching(/available once you finish registering/)]);
  });

  it('a registered account is not capped by it', async () => {
    process.env.DAILY_LESSON_PLAN_CAP_UNREGISTERED = '1';
    load(REGISTERED);
    await ask(REGISTERED, 1);
    await ask(REGISTERED, 2);
    await ask(REGISTERED, 3);
    expect(queued()).toBe(3);
  });

  it('unset (the default) caps nobody', async () => {
    load(UNREGISTERED);
    for (let i = 0; i < 4; i += 1) await ask(UNREGISTERED, i);
    expect(queued()).toBe(4);
  });
});

describe('coaching (CoachingSessionService.initiateSession)', () => {
  function load(account) {
    jest.resetModules();
    const inserted = [];
    const supabase = {
      from(table) {
        if (table === 'users') return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: account, error: null }) }) }) };
        if (table === 'coaching_sessions') {
          return {
            insert: (row) => {
              inserted.push(row);
              return { select: () => ({ single: () => Promise.resolve({ data: { id: `cs-${inserted.length}`, ...row }, error: null }) }) };
            },
          };
        }
        throw new Error(`Unexpected table in test: ${table}`);
      },
    };
    jest.doMock('../../bot/shared/config/supabase', () => supabase);
    jest.doMock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
    jest.doMock('../../bot/shared/services/cache/railway-redis.service', () => ({ isAvailable: () => false }));
    const WA = { sendInteractiveButtons: jest.fn().mockResolvedValue(true), sendMessage: jest.fn().mockResolvedValue(true) };
    jest.doMock('../../bot/shared/services/whatsapp.service', () => WA);
    const CoachingSessionService = require('../../bot/shared/services/coaching/coaching-session.service');
    return { CoachingSessionService, inserted, WA };
  }

  it('DAILY_COACHING_CAP_UNREGISTERED=0: no session, no confirmation buttons, a clear message', async () => {
    process.env.DAILY_COACHING_CAP_UNREGISTERED = '0';
    const { CoachingSessionService, inserted, WA } = load(UNREGISTERED);
    const r = await CoachingSessionService.initiateSession(UNREGISTERED.id, 's-1', 'audio-1', FROM, 1500);
    expect(r).toBeNull();
    expect(inserted).toHaveLength(0);
    expect(WA.sendInteractiveButtons).not.toHaveBeenCalled();
    expect(WA.sendMessage).toHaveBeenCalledWith(FROM, expect.stringMatching(/Classroom coaching is available once you finish registering/));
  });

  it('a registered account starts its session as before', async () => {
    process.env.DAILY_COACHING_CAP_UNREGISTERED = '0';
    const { CoachingSessionService, inserted, WA } = load(REGISTERED);
    await CoachingSessionService.initiateSession(REGISTERED.id, 's-1', 'audio-1', FROM, 1500);
    expect(inserted).toHaveLength(1);
    expect(WA.sendInteractiveButtons).toHaveBeenCalledTimes(1);
  });
});
