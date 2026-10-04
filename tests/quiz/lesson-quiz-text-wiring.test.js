'use strict';
/**
 * The lesson quiz's doors in the text handler, EXECUTED through the real
 * handleTextMessage. Only the network boundary (supabase, redis, the messaging
 * facade, the LLM) and the quiz services this file wires against are mocked —
 * those services are their own suites; what is under test here is which one a
 * message reaches, and in what order.
 *
 *   - a share code joins even when a stale quiz state is on the phone
 *   - a child with a class quiz running can TYPE an answer ("b", "A C") or
 *     STOP, before any generic chat sees the text (on Baileys / Matrix the
 *     question is numbered text, and a typed letter never matches a pending
 *     menu)
 *   - /quiz opens the lesson-quiz menu when TRANSCRIPT_QUIZ_ENABLED=true, and
 *     the classic orchestrator exactly as before when it is not
 *   - /quiz <topic> starts a topic quiz when the flag is on
 */

// Bot-only packages, mocked virtually — the root suite can run before `bot/ npm ci`.
// gpt5-mini.service (reached through the real route) needs jsonrepair, a bot-only
// dependency the root suite runs without.
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
}));

const mockWa = {
  sendMessage: jest.fn().mockResolvedValue(true),
  sendInteractiveButtons: jest.fn().mockResolvedValue(true),
  sendInteractiveMessage: jest.fn().mockResolvedValue(true),
  sendFlow: jest.fn().mockResolvedValue(false),
};
jest.mock('../../bot/shared/services/whatsapp.service', () => ({
  sendMessage: (...a) => mockWa.sendMessage(...a),
  sendInteractiveButtons: (...a) => mockWa.sendInteractiveButtons(...a),
  sendInteractiveMessage: (...a) => mockWa.sendInteractiveMessage(...a),
  sendFlow: (...a) => mockWa.sendFlow(...a),
  sendTypingIndicator: jest.fn(),
  markAsRead: jest.fn(),
  startContinuousTypingIndicator: () => ({ stop: jest.fn() }),
}));

const mockDetectIntent = jest.fn().mockResolvedValue({ type: 'general' });
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
}));
jest.mock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn(), logError: jest.fn() }));

// ── the quiz services this file wires against (adapted in their own slices) ──
const mockQuizSession = {
  getPostQuizState: jest.fn().mockResolvedValue(null),
  getActiveState: jest.fn().mockResolvedValue(null),
  handlePostQuizChat: jest.fn(),
  endPostQuizChat: jest.fn(),
  startQuizFromInvite: jest.fn(),
  endSession: jest.fn(),
  handleAnswer: jest.fn(),
};
jest.mock('../../bot/shared/services/quiz/quiz-session.service', () => mockQuizSession);

const mockVq = {
  answerTypedLetter: jest.fn().mockResolvedValue(false),
  stopTyped: jest.fn().mockResolvedValue(false),
};
jest.mock('../../bot/shared/services/quiz/video-quiz.service', () => mockVq);

const mockShare = {
  parseShareCode: jest.fn((text) => {
    const m = /\bQUIZ-([A-Z0-9]{6})\b/i.exec(String(text || ''));
    return m ? m[1].toUpperCase() : null;
  }),
  beginFromCode: jest.fn().mockResolvedValue(true),
  beginFromCodeLocked: jest.fn().mockResolvedValue(true),
  consumeJoinReply: jest.fn().mockResolvedValue(false),
};
jest.mock('../../bot/shared/services/quiz/video-quiz-share.service', () => mockShare);

// Video quizzes on for this region: the share code is acked and joined without
// a lookup in the handler (the region-off case has its own suite,
// video-quiz-share-code-region-gate).
jest.mock('../../bot/shared/services/region-features.service', () => ({
  isVideoQuizzesEnabled: jest.fn(async () => true),
  getRegionFeatures: jest.fn(async () => ({ video_quizzes_enabled: true })),
  isCurriculumLpEnabled: jest.fn(async () => false),
  isPicLpEnabled: jest.fn(async () => false),
}));

const mockOffer = { enabled: jest.fn(() => process.env.TRANSCRIPT_QUIZ_ENABLED === 'true') };
jest.mock('../../bot/shared/services/quiz/transcript-quiz-offer.service', () => mockOffer);

const mockList = {
  isQuizCommand: jest.fn((t) => /^\/quiz(\s|$)/i.test(String(t).trim()) || String(t).trim().toLowerCase() === 'quiz'),
  consumeTopicReply: jest.fn().mockResolvedValue(false),
};
jest.mock('../../bot/shared/services/quiz/transcript-quiz-list.service', () => mockList);

const mockMenu = { openQuizMenu: jest.fn().mockResolvedValue(true) };
jest.mock('../../bot/shared/services/quiz/quiz-menu-entry.service', () => mockMenu);

const mockTopic = { startTopicQuiz: jest.fn().mockResolvedValue(true) };
jest.mock('../../bot/shared/services/quiz/providers/topic.provider', () => mockTopic);

const mockOrchestrator = { initiateQuizRequest: jest.fn().mockResolvedValue(true), handleTopicReply: jest.fn() };
jest.mock('../../bot/shared/services/quiz/quiz-orchestrator.service', () => mockOrchestrator);

jest.mock('../../bot/shared/services/quiz/quiz-follow-up.service', () => ({
  getAwaitingState: jest.fn().mockResolvedValue(null),
}));

const TEACHER_PHONE = '15550001111';
const CHILD_PHONE = '15550002222';
const TEACHER = { id: 'u-teacher', phone_number: TEACHER_PHONE, name: 'T', preferred_language: 'en', registration_completed: true };
const CHILD = { id: 'u-child', phone_number: CHILD_PHONE, name: null, preferred_language: 'en' };

let handler;
const savedFlag = process.env.TRANSCRIPT_QUIZ_ENABLED;

beforeAll(() => {
  handler = require('../../bot/shared/handlers/text-message.handler');
});

beforeEach(() => {
  jest.clearAllMocks();
  // clearAllMocks keeps queued mockResolvedValueOnce values: a step a test
  // short-circuits past would hand its value to the next test.
  mockQuizSession.getPostQuizState.mockReset().mockResolvedValue(null);
  mockQuizSession.getActiveState.mockReset().mockResolvedValue(null);
  mockVq.answerTypedLetter.mockReset().mockResolvedValue(false);
  mockVq.stopTyped.mockReset().mockResolvedValue(false);
  mockList.consumeTopicReply.mockReset().mockResolvedValue(false);
  delete process.env.TRANSCRIPT_QUIZ_ENABLED;
});

afterAll(() => {
  if (savedFlag === undefined) delete process.env.TRANSCRIPT_QUIZ_ENABLED;
  else process.env.TRANSCRIPT_QUIZ_ENABLED = savedFlag;
});

async function say(user, body) {
  global.__TEST_USER__ = user;
  await handler.handleTextMessage({ id: 'wamid.test' }, user.phone_number, body, user);
  // Let anything the handler deferred with setImmediate run.
  await new Promise((r) => setImmediate(r));
}

describe('share code', () => {
  test('a QUIZ-<code> joins even when a stale post-quiz chat state is on the phone', async () => {
    mockQuizSession.getPostQuizState.mockResolvedValueOnce({ quizId: 'old' });
    mockQuizSession.getActiveState.mockResolvedValueOnce({ currentQuestionId: 'q1' });

    await say(CHILD, 'QUIZ-ABC234');

    expect(mockShare.beginFromCodeLocked).toHaveBeenCalledWith(CHILD_PHONE, 'ABC234');
    expect(mockQuizSession.handlePostQuizChat).not.toHaveBeenCalled();
    expect(mockQuizSession.handleAnswer).not.toHaveBeenCalled();
  });

  test('a code joins even when a stale adaptive-quiz session is waiting on a question', async () => {
    mockQuizSession.getActiveState.mockResolvedValue({ currentQuestionId: 'q1' });
    await say(CHILD, 'QUIZ-XYZ789');
    expect(mockShare.beginFromCodeLocked).toHaveBeenCalledWith(CHILD_PHONE, 'XYZ789');
    expect(mockWa.sendMessage).not.toHaveBeenCalledWith(CHILD_PHONE, expect.stringMatching(/Tap one of the answer buttons/));
  });
});

describe('typed answers during a class quiz', () => {
  test('"A C" reaches VideoQuizService.answerTypedLetter before generic chat', async () => {
    mockVq.answerTypedLetter.mockResolvedValueOnce(true);
    await say(CHILD, 'A C');
    expect(mockVq.answerTypedLetter).toHaveBeenCalledWith(CHILD_PHONE, 'A C');
    expect(mockDetectIntent).not.toHaveBeenCalled();
    expect(mockQuizSession.getActiveState).not.toHaveBeenCalled();
  });

  test('a single lower-case "b" reaches answerTypedLetter', async () => {
    mockVq.answerTypedLetter.mockResolvedValueOnce(true);
    await say(CHILD, 'b');
    expect(mockVq.answerTypedLetter).toHaveBeenCalledWith(CHILD_PHONE, 'b');
    expect(mockDetectIntent).not.toHaveBeenCalled();
  });

  test('"stop" reaches VideoQuizService.stopTyped and goes no further', async () => {
    mockVq.stopTyped.mockResolvedValueOnce(true);
    await say(CHILD, 'stop');
    expect(mockVq.stopTyped).toHaveBeenCalledWith(CHILD_PHONE, 'stop');
    expect(mockVq.answerTypedLetter).not.toHaveBeenCalled();
    expect(mockQuizSession.endSession).not.toHaveBeenCalled();
    expect(mockDetectIntent).not.toHaveBeenCalled();
  });

  test('with no class quiz running, the adaptive (parent) quiz still takes its typed letter', async () => {
    mockQuizSession.getActiveState.mockResolvedValueOnce({ currentQuestionId: 'q1' });
    await say(CHILD, 'a');
    expect(mockVq.answerTypedLetter).toHaveBeenCalled();
    expect(mockQuizSession.handleAnswer).toHaveBeenCalledWith(CHILD_PHONE, 'a', { currentQuestionId: 'q1' });
  });

  test('a throwing typed-answer step does not swallow the message for the steps after it', async () => {
    mockVq.answerTypedLetter.mockRejectedValueOnce(new Error('boom'));
    mockQuizSession.getActiveState.mockResolvedValueOnce({ currentQuestionId: 'q1' });
    await say(CHILD, 'c');
    expect(mockQuizSession.handleAnswer).toHaveBeenCalledWith(CHILD_PHONE, 'c', { currentQuestionId: 'q1' });
  });
});

describe('/quiz', () => {
  test('TRANSCRIPT_QUIZ_ENABLED=true: /quiz opens QuizMenuEntry.openQuizMenu, not the classic orchestrator', async () => {
    process.env.TRANSCRIPT_QUIZ_ENABLED = 'true';
    await say(TEACHER, '/quiz');
    expect(mockMenu.openQuizMenu).toHaveBeenCalledWith(expect.objectContaining({
      user: TEACHER, from: TEACHER_PHONE, language: 'en', sessionId: 'sess-1', trigger: 'text',
    }));
    expect(mockOrchestrator.initiateQuizRequest).not.toHaveBeenCalled();
  });

  test('TRANSCRIPT_QUIZ_ENABLED=true: a bare "quiz" opens the menu too', async () => {
    process.env.TRANSCRIPT_QUIZ_ENABLED = 'true';
    await say(TEACHER, 'quiz');
    expect(mockMenu.openQuizMenu).toHaveBeenCalledTimes(1);
    expect(mockOrchestrator.initiateQuizRequest).not.toHaveBeenCalled();
  });

  test('TRANSCRIPT_QUIZ_ENABLED=true: /quiz <topic> starts a topic quiz', async () => {
    process.env.TRANSCRIPT_QUIZ_ENABLED = 'true';
    await say(TEACHER, '/quiz fractions of a whole');
    expect(mockTopic.startTopicQuiz).toHaveBeenCalledWith(TEACHER, TEACHER_PHONE, 'fractions of a whole', 'en');
    expect(mockMenu.openQuizMenu).not.toHaveBeenCalled();
    expect(mockOrchestrator.initiateQuizRequest).not.toHaveBeenCalled();
  });

  test('flag off: /quiz reaches QuizOrchestrator.initiateQuizRequest exactly as before', async () => {
    await say(TEACHER, '/quiz');
    expect(mockOrchestrator.initiateQuizRequest).toHaveBeenCalledWith(TEACHER, TEACHER_PHONE, 'sess-1', 'en', null);
    expect(mockMenu.openQuizMenu).not.toHaveBeenCalled();
    expect(mockTopic.startTopicQuiz).not.toHaveBeenCalled();
  });

  test('flag off: /quiz <topic> hands the topic to the classic orchestrator', async () => {
    await say(TEACHER, '/quiz fractions');
    expect(mockOrchestrator.initiateQuizRequest).toHaveBeenCalledWith(TEACHER, TEACHER_PHONE, 'sess-1', 'en', 'fractions');
    expect(mockTopic.startTopicQuiz).not.toHaveBeenCalled();
  });

  // This used to assert the opposite: with the flag off, a bare "quiz" was not
  // the command. Every command now works as the bare word on every channel —
  // Element (Matrix) eats "/quiz" as its own client command, so there the bare
  // word is the only way to ask — so a bare "quiz" is /quiz, flag or no flag.
  test('flag off: a bare "quiz" is the /quiz command too, on the classic path', async () => {
    await say(TEACHER, 'quiz');
    expect(mockOrchestrator.initiateQuizRequest).toHaveBeenCalledWith(TEACHER, TEACHER_PHONE, 'sess-1', 'en', null);
    expect(mockMenu.openQuizMenu).not.toHaveBeenCalled();
  });

  test('flag on: the "type the topic" reply is offered to the list service first', async () => {
    process.env.TRANSCRIPT_QUIZ_ENABLED = 'true';
    mockList.consumeTopicReply.mockResolvedValueOnce(true);
    await say(TEACHER, 'the water cycle');
    expect(mockList.consumeTopicReply).toHaveBeenCalledWith(TEACHER_PHONE, 'the water cycle', TEACHER);
    expect(mockDetectIntent).not.toHaveBeenCalled();
  });
});

describe('no full phone number in the logs (review F-N7)', () => {
  // The log lines this release added; main's own lines are out of scope here.
  const line = (rx) => JSON.stringify(require('../../bot/shared/utils/logger').logToFile.mock.calls
    .filter((c) => rx.test(String(c[0]))));

  test('a failed join logs the last 4 digits, never the number', async () => {
    mockShare.beginFromCodeLocked.mockRejectedValueOnce(new Error('db down'));
    await say(CHILD, 'QUIZ-ABC234');
    await new Promise((r) => setImmediate(r));
    const l = line(/video-quiz join failed/);
    expect(l).toMatch(/db down/);
    expect(l).not.toContain(CHILD_PHONE);
    expect(l).toContain(CHILD_PHONE.slice(-4));
  });

  test('a join detail consumed logs the last 4 digits, never the number', async () => {
    mockShare.consumeJoinReply.mockResolvedValueOnce(true);
    await say(CHILD, 'Child Example');
    const l = line(/join detail/);
    expect(l).toContain(CHILD_PHONE.slice(-4));
    expect(l).not.toContain(CHILD_PHONE);
  });

  test('/quiz logs the last 4 digits, never the number', async () => {
    await say(TEACHER, '/quiz');
    const l = line(/\/quiz command detected/);
    expect(l).toContain(TEACHER_PHONE.slice(-4));
    expect(l).not.toContain(TEACHER_PHONE);
  });
});
