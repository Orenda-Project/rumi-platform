'use strict';
/**
 * Every Rumi command works as the bare word, on every channel — EXECUTED
 * through the real handleTextMessage.
 *
 * Element (the Matrix client) treats anything starting with "/" as one of its
 * own client commands, so on Matrix nobody can type "/quiz". For each command
 * in command-words.js this sends the slash form, records everything Rumi did
 * (each outbound send, each destination service it reached), then sends the
 * bare word and expects the very same trace — and a marker proving the trace
 * is that command's own handler, not general chat.
 *
 * Only the network/DB boundary (supabase, redis, the messaging facade, the
 * LLM) and the far end of each command (the service a command hands off to,
 * each with its own suite) are mocked; the routing in between is real.
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

// The messaging facade: every outbound call is recorded in one trace.
const mockTrace = [];
const record = (name, result) => (...args) => { mockTrace.push([name, args]); return Promise.resolve(result); };
jest.mock('../../bot/shared/services/whatsapp.service', () => ({
  sendMessage: record('wa.sendMessage', true),
  sendInteractiveButtons: record('wa.sendInteractiveButtons', true),
  sendInteractiveMessage: record('wa.sendInteractiveMessage', true),
  sendLanguageSelectionList: record('wa.sendLanguageSelectionList', true),
  // A Flow-capable channel: the picker/form is "sent".
  sendFlow: record('wa.sendFlow', true),
  sendDocument: record('wa.sendDocument', true),
  sendTypingIndicator: jest.fn(),
  markAsRead: jest.fn(),
  startContinuousTypingIndicator: () => ({ stop: jest.fn() }),
}));

const mockDetectIntent = jest.fn(async () => { mockTrace.push(['llm.detectIntent', []]); return { type: 'general' }; });
jest.mock('../../bot/shared/services/openai.service', () => ({
  detectIntent: (...a) => mockDetectIntent(...a),
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
jest.mock('../../bot/shared/services/feature-registration.service', () => ({
  isPendingName: jest.fn().mockResolvedValue(false),
  checkAndTriggerRegistration: jest.fn(),
  sendNameQuestion: jest.fn(),
  countUserFeatures: jest.fn().mockResolvedValue(0),
}));
jest.mock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn(), logError: jest.fn() }));
jest.mock('../../bot/shared/services/region-features.service', () => ({
  isVideoQuizzesEnabled: jest.fn(async () => true),
  getRegionFeatures: jest.fn(async () => ({})),
  isCurriculumLpEnabled: jest.fn(async () => false),
  isPicLpEnabled: jest.fn(async () => false),
}));

// Quiz state: nothing in flight.
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
jest.mock('../../bot/shared/services/quiz/quiz-follow-up.service', () => ({
  getAwaitingState: jest.fn().mockResolvedValue(null),
}));
jest.mock('../../bot/shared/services/quiz/transcript-quiz-offer.service', () => ({
  enabled: jest.fn(() => process.env.TRANSCRIPT_QUIZ_ENABLED === 'true'),
}));
// The lesson-quiz door itself (pure) is real; the list service's IO is not.
jest.mock('../../bot/shared/services/quiz/transcript-quiz-list.service', () => ({
  isQuizCommand: (t) => jest.requireActual('../../bot/shared/services/quiz/quiz-menu-request').isQuizMenuRequest(t),
  consumeTopicReply: jest.fn().mockResolvedValue(false),
}));

// ── the far end of each command ──
jest.mock('../../bot/shared/services/menu.service', () => ({
  sendMenu: record('menu.sendMenu', true),
  _handleLessonPlanningChoice: jest.fn(),
  _handleMediaLibraryChoice: jest.fn(),
  _handleClassroomCoachingChoice: jest.fn(),
  checkAwaitingLessonPlanTopic: jest.fn().mockResolvedValue(false),
  clearAwaitingLessonPlanTopic: jest.fn(),
  handleMenuChoice: jest.fn().mockResolvedValue(false),
}));
jest.mock('../../bot/shared/handlers/portal-command.handler', () => ({
  handlePortalCommand: record('portal.handlePortalCommand', ''),
}));
jest.mock('../../bot/shared/services/feature-intro.service', () => ({
  sendFirstUseIntroIfNeeded: record('featureIntro.sendFirstUseIntroIfNeeded', false),
}));
jest.mock('../../bot/shared/services/quiz/quiz-orchestrator.service', () => ({
  initiateQuizRequest: record('quiz.initiateQuizRequest', true),
  handleTopicReply: jest.fn(),
}));
jest.mock('../../bot/shared/services/quiz/quiz-menu-entry.service', () => ({
  openQuizMenu: record('quiz.openQuizMenu', true),
}));
jest.mock('../../bot/shared/services/quiz/providers/topic.provider', () => ({
  startTopicQuiz: record('quiz.startTopicQuiz', true),
}));
jest.mock('../../bot/shared/services/testpaper/testpaper-orchestrator.service', () => ({
  start: record('testpaper.start', true),
  showMyPapers: record('testpaper.showMyPapers', true),
  handleText: jest.fn().mockResolvedValue(false),
}));
jest.mock('../../bot/shared/services/exam-checker', () => ({
  ExamCheckerOrchestrator: {
    getSessionState: jest.fn().mockResolvedValue({ active: false }),
    process: (...args) => { mockTrace.push(['exam.process', args]); return Promise.resolve({ text: 'Send the exam photos.' }); },
  },
  ExamSessionService: {},
}));
jest.mock('../../bot/shared/services/attendance-entry.service', () => {
  const detector = jest.requireActual('../../bot/shared/services/attendance-detector.service');
  return {
    handleInSession: jest.fn().mockResolvedValue(false),
    // The real trigger's decision (the detector), its session start recorded.
    handleTrigger: jest.fn(async ({ user, messageBody }) => {
      if (!user?.id || !detector.detectAttendanceIntent(messageBody).detected) return false;
      mockTrace.push(['attendance.handleTrigger', [messageBody.trim().toLowerCase().replace(/^\//, '').replace(/[.!]+$/, '')]]);
      return true;
    }),
  };
});

const PHONE = '15550001234';
const MATRIX = 'matrix:@teacher:example.org';
const TEACHER = {
  id: 'u-teacher', phone_number: PHONE, first_name: 'Sam', name: 'Sam', preferred_language: 'en',
  registration_completed: true, role: 'teacher',
};

let handler;
const ENV_KEYS = ['TRANSCRIPT_QUIZ_ENABLED', 'OBSERVE_ENABLED', 'HOMEWORK_FLOW_ID', 'EDIT_CLASS_FLOW_ID', 'STATUS_FLOW_ID'];
const savedEnv = {};

beforeAll(() => {
  ENV_KEYS.forEach((k) => { savedEnv[k] = process.env[k]; });
  handler = require('../../bot/shared/handlers/text-message.handler');
  // Flow tokens carry Date.now(); a fixed clock makes two runs comparable.
  jest.spyOn(Date, 'now').mockReturnValue(1555000000000);
});

beforeEach(() => {
  mockTrace.length = 0;
  ENV_KEYS.forEach((k) => delete process.env[k]);
  process.env.OBSERVE_ENABLED = 'true';
});

afterAll(() => {
  ENV_KEYS.forEach((k) => {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  });
});

/** Runs one message through the real handler and returns what Rumi did. */
async function trace(from, body) {
  mockTrace.length = 0;
  global.__TEST_USER__ = { ...TEACHER };
  await handler.handleTextMessage({ id: 'wamid.test', text: { body } }, from, body, { ...TEACHER });
  await new Promise((r) => setImmediate(r));
  return JSON.parse(JSON.stringify(mockTrace));
}

const reached = (name, matcher) => (t) => {
  const hit = t.find(([n, args]) => n === name && (!matcher || matcher(args)));
  if (!hit) throw new Error(`expected ${name} in the trace, got ${JSON.stringify(t.map(([n]) => n))}`);
};
const said = (rx) => reached('wa.sendMessage', (args) => rx.test(String(args[1])));

// [slash form, bare form, marker that it reached THAT command]
const TABLE = [
  ['/menu', 'menu', reached('menu.sendMenu')],
  ['/register', 'register', said(/already registered/)],
  ['/language', 'language', reached('wa.sendLanguageSelectionList')],
  ['/settings', 'settings', reached('wa.sendFlow', (a) => /settings/i.test(JSON.stringify(a)))],
  ['/status', 'status', said(/running/i)],
  ['/portal', 'portal', reached('portal.handlePortalCommand')],
  ['/quiz', 'quiz', reached('quiz.initiateQuizRequest')],
  ['/video', 'video', reached('wa.sendFlow', (a) => a[1].flowKind === 'student-videos')],
  ['/reading test', 'reading test', reached('featureIntro.sendFirstUseIntroIfNeeded')],
  ['/readingtest', 'readingtest', reached('featureIntro.sendFirstUseIntroIfNeeded')],
  ['/testpaper', 'testpaper', reached('testpaper.start')],
  ['/test paper', 'test paper', reached('testpaper.start')],
  ['/mypapers', 'mypapers', reached('testpaper.showMyPapers')],
  ['/my papers', 'my papers', reached('testpaper.showMyPapers')],
  ['/homework', 'homework', said(/Homework is not available/)],
  ['/editclass', 'editclass', said(/class editing is not available/)],
  ['/addclass', 'addclass', reached('wa.sendFlow', (a) => a[1].flowKind === 'class-setup')],
  ['/attendance', 'attendance', reached('attendance.handleTrigger')],
  ['/observe', 'observe', said(/is for the people who visit classrooms/)],
  ['/checkexam', 'checkexam', reached('exam.process')],
];

describe('every command: the bare word reaches the same handler as the slash form', () => {
  test('the table covers every word in command-words.js', () => {
    const { COMMAND_WORDS } = require('../../bot/shared/services/messaging/command-words');
    expect(TABLE.map(([, bare]) => bare).sort()).toEqual([...COMMAND_WORDS].sort());
  });

  describe.each([['WhatsApp', PHONE], ['Matrix', MATRIX]])('on %s', (_channel, from) => {
    test.each(TABLE)('%s / %s', async (slash, bare, marker) => {
      const viaSlash = await trace(from, slash);
      marker(viaSlash);
      expect(viaSlash.map(([n]) => n)).not.toContain('llm.detectIntent');

      const viaBare = await trace(from, bare);
      expect(viaBare).toEqual(viaSlash);

      // Capitalised, with a full stop, as a phone keyboard types it.
      const typed = `${bare[0].toUpperCase()}${bare.slice(1)}.`;
      expect(await trace(from, typed)).toEqual(viaSlash);
    });
  });
});

describe('the lesson quiz door (TRANSCRIPT_QUIZ_ENABLED=true)', () => {
  beforeEach(() => { process.env.TRANSCRIPT_QUIZ_ENABLED = 'true'; });

  test('"quiz" opens the quiz menu as "/quiz" does', async () => {
    const viaSlash = await trace(MATRIX, '/quiz');
    reached('quiz.openQuizMenu')(viaSlash);
    expect(await trace(MATRIX, 'quiz')).toEqual(viaSlash);
  });

  test('on Matrix, "quiz fractions" starts a topic quiz as "/quiz fractions" does', async () => {
    const viaSlash = await trace(MATRIX, '/quiz fractions');
    reached('quiz.startTopicQuiz', (a) => a[2] === 'fractions')(viaSlash);
    expect(await trace(MATRIX, 'quiz fractions')).toEqual(viaSlash);
  });

  test('on WhatsApp, "quiz fractions" is left as it is today (the slash form is typeable there)', async () => {
    const t = await trace(PHONE, 'quiz fractions');
    expect(t.map(([n]) => n)).not.toContain('quiz.startTopicQuiz');
  });
});

describe('with the lesson quiz off, "quiz <topic>" on Matrix reaches the classic quiz with its topic', () => {
  test('"quiz fractions" → initiateQuizRequest(..., "fractions")', async () => {
    const t = await trace(MATRIX, 'quiz fractions');
    reached('quiz.initiateQuizRequest', (a) => a[4] === 'fractions')(t);
  });
});

describe('ordinary text is not a command', () => {
  test('"menu items for lunch" is chat, not the menu', async () => {
    const t = await trace(MATRIX, 'menu items for lunch');
    expect(t.map(([n]) => n)).not.toContain('menu.sendMenu');
  });
});
