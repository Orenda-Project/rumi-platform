/**
 * text-message.handler.js resolves a channel identity itself when it is handed
 * no user (the inbound lookup failed, as it can when a brand-new account's first
 * messages race each other). It must split "mtx:<digits>" at the colon, as
 * channel-registry.js does: slicing by the driver name's length ("matrix:") cut
 * the first three digits off and created a second, wrong account
 * ("5100001" for "mtx:1555100001") during the public-limits burst on the rig.
 */

const { createFakeDb } = require('../testpaper/helpers/fake-db');

const FROM = 'mtx:1555100001';
const ACCOUNT = { id: '00000000-0000-4000-8000-0000000000e1', preferred_language: 'en', phone_number: '1555100001', registration_completed: true };

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

afterEach(() => jest.resetModules());

describe('handleTextMessage with no user, on Matrix', () => {
  let WA;
  let OpenAI;
  let Queue;
  let handleTextMessage;
  let db;
  let Helpers;

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
      detectIntent: jest.fn().mockResolvedValue({ type: 'general' }),
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
    Helpers = inert({
      getOrCreateUser: jest.fn().mockResolvedValue(account),
      getOrCreateUserByChannel: jest.fn().mockResolvedValue(account),
      getOrCreateSession: jest.fn().mockResolvedValue('session-1'),
    });
    jest.doMock('../../bot/shared/database/bot-helpers', () => Helpers);
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
  it('looks the account up as ("matrix", "1555100001"), the whole number', async () => {
    load(ACCOUNT);
    await handleTextMessage({ id: 'wamid.mx-1', from: FROM, type: 'text', text: { body: 'Hello' } }, FROM, 'Hello', null);
    expect(Helpers.getOrCreateUserByChannel).toHaveBeenCalledWith('matrix', '1555100001');
    expect(Helpers.getOrCreateUser).not.toHaveBeenCalled();
  });
});
