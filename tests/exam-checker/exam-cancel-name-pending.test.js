'use strict';
/**
 * A cancel word ends an open exam session even while Rumi is waiting for the
 * teacher's name — EXECUTED through the real handleTextMessage.
 *
 * On Matrix a new teacher is offered registration (the name is pending), then
 * types "/exam" (a command passes the name capture) and gets the "0 images"
 * prompt. "منسوخ" was then read as the name ("Shall I call you منسوخ?") and
 * the exam session stayed open. A cancel word with an exam session open is
 * not the name; with no session open, the name capture is unchanged.
 *
 * Real: the text handler, the feature-registration service (its DB read is
 * spied), the exam-checker handler and orchestrator. Mocked: the boundaries
 * (supabase, redis, the messaging facade, the LLM, the user/session store)
 * and an in-memory exam session store in place of Supabase + Redis.
 */

jest.mock('jsonrepair', () => ({ jsonrepair: (s) => s }), { virtual: true });
const { mockBotDependency } = require('../_helpers/mock-bot-dependency');
mockBotDependency('aws-sdk', () => ({ config: { update: () => {} }, SQS: function SQS() {} }));
jest.mock('pdfkit', () => ({}), { virtual: true });
jest.mock('uuid', () => ({ v4: () => 'stub-uuid' }), { virtual: true });

jest.mock('../../bot/shared/config/supabase', () => {
  const chain = () => {
    const b = {
      select: () => b, eq: () => b, neq: () => b, in: () => b, is: () => b, not: () => b, gte: () => b,
      lte: () => b, order: () => b, limit: () => b, update: () => b, insert: () => b, upsert: () => b,
      delete: () => b, gt: () => b, lt: () => b, ilike: () => b, or: () => b, range: () => b,
      single: () => Promise.resolve({ data: null, error: null }),
      maybeSingle: () => Promise.resolve({ data: null, error: null }),
      then: (resolve) => resolve({ data: [], error: null }),
    };
    return b;
  };
  return { from: jest.fn(() => chain()), rpc: jest.fn().mockResolvedValue({ data: null, error: null }) };
});

jest.mock('../../bot/shared/services/cache/railway-redis.service', () => ({
  redis: { get: jest.fn().mockResolvedValue(null), set: jest.fn(), del: jest.fn() },
  isAvailable: () => true,
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue(true),
  setNX: jest.fn().mockResolvedValue(true),
  delete: jest.fn().mockResolvedValue(true),
  del: jest.fn().mockResolvedValue(true),
  getJSON: jest.fn().mockResolvedValue(null),
  setJSON: jest.fn().mockResolvedValue(true),
}));

jest.mock('../../bot/shared/services/whatsapp.service', () => ({
  sendMessage: jest.fn(async () => true),
  sendInteractiveButtons: jest.fn(async () => true),
  sendInteractiveMessage: jest.fn(async () => true),
  sendLanguageSelectionList: jest.fn(async () => true),
  sendFlow: jest.fn(async () => true),
  sendDocument: jest.fn(async () => true),
  sendTypingIndicator: jest.fn(),
  markAsRead: jest.fn(),
  startContinuousTypingIndicator: () => ({ stop: jest.fn() }),
}));

jest.mock('../../bot/shared/services/openai.service', () => ({
  detectIntent: jest.fn(async () => ({ type: 'general' })),
  getResponseWithFormat: jest.fn().mockResolvedValue('a warm answer'),
  generateResponse: jest.fn().mockResolvedValue('ok'),
  createChatCompletion: jest.fn().mockResolvedValue({ choices: [{ message: { content: 'ok' } }] }),
}));

jest.mock('../../bot/shared/database/bot-helpers', () => ({
  getOrCreateUser: jest.fn(async () => global.__TEST_USER__),
  getOrCreateUserByChannel: jest.fn(async () => global.__TEST_USER__),
  getOrCreateSession: jest.fn().mockResolvedValue('sess-1'),
  updateSessionType: jest.fn(),
  storeConversation: jest.fn(),
  storeLessonPlan: jest.fn(),
  getConversationHistory: jest.fn().mockResolvedValue([]),
}));
jest.mock('../../bot/shared/utils/language-cache', () => ({
  getUserLanguage: jest.fn().mockResolvedValue('en'),
  setUserLanguage: jest.fn(),
}));
jest.mock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn(), logError: jest.fn() }));
jest.mock('../../bot/shared/services/region-features.service', () => ({
  isVideoQuizzesEnabled: jest.fn(async () => true),
  getRegionFeatures: jest.fn(async () => ({})),
  isCurriculumLpEnabled: jest.fn(async () => false),
  isPicLpEnabled: jest.fn(async () => false),
}));
jest.mock('../../bot/shared/services/quiz/quiz-session.service', () => ({
  getPostQuizState: jest.fn().mockResolvedValue(null),
  getActiveState: jest.fn().mockResolvedValue(null),
}));
jest.mock('../../bot/shared/services/quiz/video-quiz.service', () => ({
  answerTypedLetter: jest.fn().mockResolvedValue(false),
  stopTyped: jest.fn().mockResolvedValue(false),
}));
jest.mock('../../bot/shared/services/quiz/video-quiz-share.service', () => ({
  parseShareCode: jest.fn(() => null),
  consumeJoinReply: jest.fn().mockResolvedValue(false),
}));
jest.mock('../../bot/shared/services/testpaper/testpaper-orchestrator.service', () => ({
  start: jest.fn(),
  showMyPapers: jest.fn(),
  handleText: jest.fn().mockResolvedValue(false),
}));

// In-memory exam session store: one row per user, same shape as exam_check_sessions.
const mockStore = { sessions: new Map() };
const mockActive = (userId) => {
  const s = mockStore.sessions.get(userId);
  return s && !['completed', 'cancelled', 'error'].includes(s.status) ? s : null;
};
const mockFindById = (id) => [...mockStore.sessions.values()].find((s) => s.id === id) || null;
jest.mock('../../bot/shared/services/exam-checker/exam-session.service', () => ({
  getActive: jest.fn(async (userId) => mockActive(userId)),
  getById: jest.fn(async (id) => mockFindById(id)),
  updateStatus: jest.fn(async (id, status) => {
    const s = mockFindById(id);
    s.status = status;
    return s;
  }),
  update: jest.fn(async (id, patch) => Object.assign(mockFindById(id), patch)),
}));

const WhatsAppService = require('../../bot/shared/services/whatsapp.service');
const FeatureRegistrationService = require('../../bot/shared/services/feature-registration.service');
const { EXAM_CANCEL_WORDS } = require('../../bot/shared/handlers/exam-checker.handler');
const { handleTextMessage } = require('../../bot/shared/handlers/text-message.handler');

const FROM = 'matrix:@+15550100001:example.org';
const NEW_TEACHER = {
  id: 'u-new-teacher', phone_number: null, first_name: null, name: null,
  preferred_language: 'en', registration_completed: false, role: 'teacher',
};

const openEmptyExamSession = () => {
  mockStore.sessions.set(NEW_TEACHER.id, {
    id: 'exam-session-open', user_id: NEW_TEACHER.id, status: 'collecting_images', original_images: [],
  });
};
const sent = () => WhatsAppService.sendMessage.mock.calls.map((c) => String(c[1]));

async function send(body) {
  global.__TEST_USER__ = { ...NEW_TEACHER };
  await handleTextMessage({ id: 'wamid.test', text: { body } }, FROM, body, { ...NEW_TEACHER });
  await new Promise((r) => setImmediate(r));
}

let nameResponseSpy;
beforeEach(() => {
  jest.clearAllMocks();
  mockStore.sessions.clear();
  jest.spyOn(FeatureRegistrationService, 'isPendingName').mockResolvedValue(true);
  nameResponseSpy = jest.spyOn(FeatureRegistrationService, 'handleNameResponse');
  // Name candidates fall back to memory; start each case with none.
  FeatureRegistrationService._clearNameCandidate(NEW_TEACHER.id);
});

afterEach(() => jest.restoreAllMocks());

describe('name pending on Matrix, an empty exam session open', () => {
  test.each(EXAM_CANCEL_WORDS)('"%s" cancels the exam session and is not taken as the name', async (word) => {
    openEmptyExamSession();

    await send(word);

    expect(mockStore.sessions.get(NEW_TEACHER.id).status).toBe('cancelled');
    expect(sent().join('\n')).toMatch(/Exam checking cancelled/);
    expect(sent().join('\n')).not.toMatch(/Shall I call you/);
    expect(nameResponseSpy).not.toHaveBeenCalled();
  });

  test('a name sent while the session is open is still the name reply', async () => {
    openEmptyExamSession();

    await send('Sadia');

    expect(nameResponseSpy).toHaveBeenCalled();
    expect(sent().join('\n')).toMatch(/Shall I call you Sadia\?/);
  });
});

describe('name pending on Matrix, no exam session open (unchanged)', () => {
  test('"منسوخ" goes to the name capture as before', async () => {
    await send('منسوخ');

    expect(nameResponseSpy).toHaveBeenCalledWith(
      NEW_TEACHER.id, 'منسوخ', FROM, 'en', 'text', { confirmBareWord: true }
    );
    expect(sent().join('\n')).not.toMatch(/Exam checking cancelled/);
  });

  test('an ordinary name goes to the name capture as before', async () => {
    await send('Sadia');

    expect(nameResponseSpy).toHaveBeenCalledWith(
      NEW_TEACHER.id, 'Sadia', FROM, 'en', 'text', { confirmBareWord: true }
    );
    expect(sent().join('\n')).toMatch(/Shall I call you Sadia\?/);
  });
});
