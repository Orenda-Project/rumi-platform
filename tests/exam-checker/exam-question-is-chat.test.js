'use strict';
/**
 * A teacher's question stays a question, and an answer stays an answer —
 * EXECUTED through the real handleTextMessage and the real orchestrator.
 *
 * A trigger phrase used to open an exam session wherever it appeared, so
 * "How do I grade papers fairly?" got "You have 0 images" and was neither
 * answered nor stored. Now a phrase (not a command) opens a session only when
 * the message is short and is not a question. And while Rumi is collecting
 * the answer key, a bare "Stop" or "Cancel" can be the answer itself (what
 * does a red octagonal sign say?), so only "/cancel" ends the session there.
 *
 * Real: the text handler, the exam-checker handler and orchestrator. Mocked:
 * the boundaries (supabase, redis, the messaging facade, the LLM, the
 * user/session store) and an in-memory exam session store in place of
 * Supabase + Redis.
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
const mockStore = { sessions: new Map(), nextId: 1 };
const mockActive = (userId) => {
  const s = mockStore.sessions.get(userId);
  return s && !['completed', 'cancelled', 'error'].includes(s.status) ? s : null;
};
const mockFindById = (id) => [...mockStore.sessions.values()].find((s) => s.id === id) || null;
jest.mock('../../bot/shared/services/exam-checker/exam-session.service', () => ({
  getActive: jest.fn(async (userId) => mockActive(userId)),
  getOrCreate: jest.fn(async (userId, from) => {
    const existing = mockActive(userId);
    if (existing) return existing;
    const created = {
      id: `exam-session-${mockStore.nextId++}`,
      user_id: userId,
      status: 'collecting_images',
      original_images: [],
      recipient_identifier: from || null,
    };
    mockStore.sessions.set(userId, created);
    return created;
  }),
  getById: jest.fn(async (id) => mockFindById(id)),
  updateStatus: jest.fn(async (id, status) => {
    const s = mockFindById(id);
    s.status = status;
    return s;
  }),
  update: jest.fn(async (id, patch) => Object.assign(mockFindById(id), patch)),
  addAnswer: jest.fn(async (id, questionId, answer) => {
    const s = mockFindById(id);
    const scheme = s.marking_scheme || { questions: [], totalMarks: 0 };
    scheme.questions.push({ id: questionId, answer: answer.answer, marks: 1 });
    scheme.totalMarks += 1;
    s.marking_scheme = scheme;
  }),
}));

const WhatsAppService = require('../../bot/shared/services/whatsapp.service');
const OpenAIService = require('../../bot/shared/services/openai.service');
const BotHelpers = require('../../bot/shared/database/bot-helpers');
const FeatureRegistrationService = require('../../bot/shared/services/feature-registration.service');
const { handleTextMessage } = require('../../bot/shared/handlers/text-message.handler');

const FROM = '15550100002';
const TEACHER = {
  id: 'u-teacher', phone_number: FROM, first_name: 'Asha', name: 'Asha',
  preferred_language: 'en', registration_completed: true, role: 'teacher',
};

const session = () => mockStore.sessions.get(TEACHER.id);
const sent = () => [
  ...WhatsAppService.sendMessage.mock.calls.map((c) => String(c[1])),
  ...WhatsAppService.sendInteractiveMessage.mock.calls.map((c) => JSON.stringify(c[1])),
].join('\n');
const storedRoles = () => BotHelpers.storeConversation.mock.calls.map((c) => c[1]);

async function send(body) {
  global.__TEST_USER__ = { ...TEACHER };
  await handleTextMessage({ id: 'wamid.test', text: { body } }, FROM, body, { ...TEACHER });
  await new Promise((r) => setImmediate(r));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockStore.sessions.clear();
  mockStore.nextId = 1;
  delete process.env.EXAM_CHECKER_ENABLED;
  jest.spyOn(FeatureRegistrationService, 'isPendingName').mockResolvedValue(false);
});

afterEach(() => jest.restoreAllMocks());

describe('S1: a question that mentions exams is ordinary chat', () => {
  test.each([
    'How do I grade papers fairly?',
    'I need to check papers tonight, how to stay focused?',
    'My exam check is next week, tips?',
    'کل امتحان چیک ہوگا؟ تیاری کیسے کروں',
    'Can you help me mark exams for my class of forty children this week',
  ])('"%s" is answered and stored once, and opens no session', async (body) => {
    await send(body);

    expect(session()).toBeUndefined();
    expect(sent()).not.toMatch(/0 images/);
    expect(OpenAIService.getResponseWithFormat).toHaveBeenCalledTimes(1);
    expect(storedRoles()).toEqual(['user', 'assistant']);
    expect(BotHelpers.storeConversation.mock.calls[0][2]).toBe(body);
  });
});

describe('S1: a short request still opens a session', () => {
  test.each([
    'check exams',
    'Check my papers please',
    'please grade papers for class 5',
    'امتحان چیک کرو',
    'تصحيح امتحان',
    '/exam',
    '/exam can you check these for me?',
  ])('"%s" opens a session', async (body) => {
    await send(body);

    expect(session().status).toBe('collecting_images');
    expect(OpenAIService.getResponseWithFormat).not.toHaveBeenCalled();
  });
});

describe('N1: a command with punctuation after it', () => {
  test.each(['/exam.', '/exam!', '/EXAM?', '/grade،'])('"%s" opens a session', async (body) => {
    await send(body);

    expect(session().status).toBe('collecting_images');
  });
});

describe('S2: answer-key entry only ends on /cancel', () => {
  const openAnswerKey = () => {
    mockStore.sessions.set(TEACHER.id, {
      id: 'exam-session-answers',
      user_id: TEACHER.id,
      status: 'collecting_answers',
      original_images: [{ url: 'https://files.example.test/p1.jpg', pageNumber: 1 }],
      detected_questions: [
        { id: 'Q1', type: 'short_answer', text: 'What does a red octagonal road sign say?' },
        { id: 'Q2', type: 'short_answer', text: 'Name a primary colour.' },
      ],
      marking_scheme: { questions: [], totalMarks: 0 },
    });
  };

  test.each(['Stop', 'stop', 'Cancel', 'منسوخ', 'إلغاء'])('"%s" is stored as the answer and the session goes on', async (word) => {
    openAnswerKey();

    await send(word);

    expect(session().status).toBe('collecting_answers');
    expect(session().marking_scheme.questions).toEqual([{ id: 'Q1', answer: word, marks: 1 }]);
    expect(sent()).not.toMatch(/cancelled/i);
    expect(sent()).toMatch(/Q2: Name a primary colour/);
  });

  test('"/cancel" ends the session', async () => {
    openAnswerKey();

    await send('/cancel');

    expect(session().status).toBe('cancelled');
    expect(sent()).toMatch(/Exam checking cancelled/);
  });

  test('the answer prompt says how to stop', async () => {
    openAnswerKey();

    await send('Stop');

    expect(sent()).toMatch(/Q2: Name a primary colour\.[\s\S]*send \/cancel to stop/i);
  });

  test.each(['collecting_images', 'confirming_scheme'])('in %s a bare "stop" still cancels', async (state) => {
    mockStore.sessions.set(TEACHER.id, {
      id: 'exam-session-other', user_id: TEACHER.id, status: state,
      original_images: [{ url: 'https://files.example.test/p1.jpg', pageNumber: 1 }],
    });

    await send('stop');

    expect(session().status).toBe('cancelled');
  });
});

describe('N2: more ways to say cancel', () => {
  test.each(['منسوخ کریں', 'ألغاء', 'آلغاء', 'إلغاء', 'الغاء'])('"%s" cancels an open session', async (word) => {
    mockStore.sessions.set(TEACHER.id, {
      id: 'exam-session-open', user_id: TEACHER.id, status: 'collecting_images',
      original_images: [{ url: 'https://files.example.test/p1.jpg', pageNumber: 1 }],
    });

    await send(word);

    expect(session().status).toBe('cancelled');
    expect(sent()).toMatch(/Exam checking cancelled/);
  });
});

describe('S3: a short question with no question mark is ordinary chat', () => {
  test.each([
    'how to grade papers',
    'what is exam check',
    'Why grade papers',
    'امتحان چیک کیسے کروں',
    'پرچے چیک کرنے کا طریقہ',
    'کیا پیپر چیک ہو گئے',
    'كيف تصحيح امتحان',
    'ما هو تصحيح الامتحان',
    'هل تصحيح الامتحان صعب',
  ])('"%s" is answered and stored once, and opens no session', async (body) => {
    await send(body);

    expect(session()).toBeUndefined();
    expect(sent()).not.toMatch(/0 images/);
    expect(OpenAIService.getResponseWithFormat).toHaveBeenCalledTimes(1);
    expect(storedRoles()).toEqual(['user', 'assistant']);
  });

  // "can", "could" and "please" ask for something; they are not question words.
  // Urdu "کیا" right after the verb ("چیک کیا جائے", "چیک کیا کریں") is the
  // verb "do", a polite request, not "what".
  test.each([
    'check my papers please',
    'please check exams for class 5',
    'can you check my papers',
    'could you grade papers',
    'امتحان چیک کرو',
    'امتحان چیک کیا جائے',
    'پرچے چیک کیا کریں',
  ])('"%s" still opens a session', async (body) => {
    await send(body);

    expect(session().status).toBe('collecting_images');
    expect(OpenAIService.getResponseWithFormat).not.toHaveBeenCalled();
  });

  test('a question word inside a longer word does not count ("showcase", "whoever")', () => {
    const { shouldTriggerExamChecker } = require('../../bot/shared/handlers/exam-checker.handler');

    expect(shouldTriggerExamChecker('check exams showcase')).toBe(true);
    expect(shouldTriggerExamChecker('whoever check papers')).toBe(true);
  });

  test('a photo caption with a question word still opens a session', () => {
    const { shouldTriggerExamChecker } = require('../../bot/shared/handlers/exam-checker.handler');

    expect(shouldTriggerExamChecker('how to grade papers', { caption: true })).toBe(true);
    expect(shouldTriggerExamChecker('امتحان چیک کیسے کروں', { caption: true })).toBe(true);
  });
});

describe('N5: only words with a letter or digit count, and direction marks are ignored', () => {
  test.each([
    'please check exams for class 5 🙏',
    'please check exams for class 5 ‎',
    'check exams - - - - -',
    'check exams 🙏 🙏 🙏 🙏 🙏',
    'امتحان ‏ چیک کرو',
    'امتحان چیک؜ کرو',
  ])('"%s" opens a session', async (body) => {
    await send(body);

    expect(session().status).toBe('collecting_images');
  });

  test('a seventh real word still makes it chat', async () => {
    await send('please check exams for my class 5 🙏');

    expect(session()).toBeUndefined();
    expect(OpenAIService.getResponseWithFormat).toHaveBeenCalledTimes(1);
  });

  test('a direction mark between a phrase\'s words matches in a caption too', () => {
    const { shouldTriggerExamChecker } = require('../../bot/shared/handlers/exam-checker.handler');

    expect(shouldTriggerExamChecker('امتحان ‏ چیک کرو', { caption: true })).toBe(true);
  });
});
