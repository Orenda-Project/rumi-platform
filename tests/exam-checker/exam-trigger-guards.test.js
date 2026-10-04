/**
 * Exam checker — what may open an exam session, and how a teacher gets out.
 *
 * The trigger used to be a substring match, so "https://example.org" (it
 * contains "//exam") or any "/exam…" URL path opened a session, and the
 * teacher was then stuck in it: "cancel" and ordinary chat were both read as
 * exam input, and only "Process now" ended it (with an OCR error).
 *
 * These drive the real handleExamText / handleExamImage / shouldTriggerExamChecker
 * and the real orchestrator. Only the boundaries are mocked: the session store
 * (an in-memory stand-in for ExamSessionService's Supabase + Redis), the
 * messaging service, R2 and the logger.
 */

// The exam-checker index loads the annotation service, which needs pdfkit
// from bot/node_modules; CI runs this suite before bot deps install.
jest.mock('pdfkit', () => ({}), { virtual: true });
jest.mock('../../bot/shared/config/supabase', () => ({ from: jest.fn() }));
jest.mock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
jest.mock('../../bot/shared/storage/r2', () => ({
  uploadImageWithRetry: jest.fn(async () => 'https://files.example.test/exam/page-1.jpg'),
}));
jest.mock('../../bot/shared/services/whatsapp.service', () => ({
  startContinuousTypingIndicator: jest.fn(() => ({ stop: jest.fn() })),
  sendMessage: jest.fn(async () => {}),
  sendInteractiveMessage: jest.fn(async () => {}),
  sendInteractiveButtons: jest.fn(async () => {}),
  sendFlow: jest.fn(async () => {}),
  downloadMedia: jest.fn(async () => Buffer.from('fake-image')),
}));

// In-memory session store: one row per user, same shape as exam_check_sessions.
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
  addImage: jest.fn(async (id, url) => {
    const s = mockFindById(id);
    s.original_images = [...s.original_images, { url, pageNumber: s.original_images.length + 1 }];
  }),
  updateStatus: jest.fn(async (id, status) => {
    const s = mockFindById(id);
    s.status = status;
    return s;
  }),
  update: jest.fn(async (id, patch) => Object.assign(mockFindById(id), patch)),
}));

const WhatsAppService = require('../../bot/shared/services/whatsapp.service');
const {
  shouldTriggerExamChecker,
  handleExamText,
  handleExamImage,
  EXAM_CHECK_KEYWORDS,
  PHRASE_TRIGGER_MAX_WORDS,
} = require('../../bot/shared/handlers/exam-checker.handler');
const { SESSION_STATES } = require('../../bot/shared/services/exam-checker/exam-checker.orchestrator');

const FROM = '15550001111';
const USER = { id: 'user-teacher-1' };
const text = (body) => ({ id: 'wamid.test', text: { body } });
const image = (caption) => ({ id: 'wamid.img', image: { id: 'media-1', mime_type: 'image/jpeg', caption } });
const session = () => mockStore.sessions.get(USER.id);
const openSession = (status, images = []) => {
  mockStore.sessions.set(USER.id, {
    id: 'exam-session-open',
    user_id: USER.id,
    status,
    original_images: images.map((url, i) => ({ url, pageNumber: i + 1 })),
  });
};
const allSentText = () => [
  ...WhatsAppService.sendMessage.mock.calls.map((c) => c[1]),
  ...WhatsAppService.sendInteractiveMessage.mock.calls.map((c) => JSON.stringify(c[1])),
].join('\n');

const ORIGINAL_FLAG = process.env.EXAM_CHECKER_ENABLED;

beforeEach(() => {
  mockStore.sessions.clear();
  mockStore.nextId = 1;
  jest.clearAllMocks();
  delete process.env.EXAM_CHECKER_ENABLED;
});

afterAll(() => {
  if (ORIGINAL_FLAG === undefined) delete process.env.EXAM_CHECKER_ENABLED;
  else process.env.EXAM_CHECKER_ENABLED = ORIGINAL_FLAG;
});

const COMMANDS = ['/exam', '/exams', '/grade', '/checkexam'];
const PHRASES = EXAM_CHECK_KEYWORDS.filter((k) => !k.startsWith('/'));

describe('shouldTriggerExamChecker — whole command or whole phrase only', () => {
  it('the keyword list still holds every command and phrase it shipped with', () => {
    expect(EXAM_CHECK_KEYWORDS).toEqual(expect.arrayContaining(COMMANDS));
    expect(PHRASES.length).toBeGreaterThanOrEqual(19);
  });

  it.each(EXAM_CHECK_KEYWORDS)('"%s" on its own triggers', (keyword) => {
    expect(shouldTriggerExamChecker(keyword)).toBe(true);
  });

  it.each(COMMANDS)('"%s" as the first word of the message triggers', (command) => {
    expect(shouldTriggerExamChecker(`${command} please`)).toBe(true);
    expect(shouldTriggerExamChecker(`  ${command.toUpperCase()}  `)).toBe(true);
  });

  it.each(PHRASES)('the phrase "%s" triggers inside a short request', (phrase) => {
    expect(shouldTriggerExamChecker(`${phrase} for class 5`)).toBe(true);
  });

  it('a phrase triggers whatever its case', () => {
    expect(shouldTriggerExamChecker('Please Check Exams for class 5')).toBe(true);
  });

  it.each(COMMANDS)('"%s" followed by punctuation still triggers', (command) => {
    for (const mark of ['.', '!', '?', ',', '؟', '،', '!!']) {
      expect(shouldTriggerExamChecker(`${command}${mark}`)).toBe(true);
    }
  });

  it('the Arabic alef with hamza or madda matches the plain alef', () => {
    expect(shouldTriggerExamChecker('تصحيح الإمتحان')).toBe(true);
  });

  it.each([
    'https://example.org',
    'https://example.org/exam/results',
    'see https://example.org/examination-results',
    'examples',
    'I have examples',
    '/examination-results',
    'the /exam command',
    'recheck exams',
    'Hi Rumi <a href="https://example.org">sign in</a>',
  ])('"%s" does NOT trigger', (message) => {
    expect(shouldTriggerExamChecker(message)).toBe(false);
  });

  // A question, or a message longer than PHRASE_TRIGGER_MAX_WORDS, is a
  // teacher talking about exams, not asking Rumi to check them.
  const TALKING_ABOUT_EXAMS = [
    'How do I grade papers fairly?',
    'I need to check papers tonight, how to stay focused?',
    'My exam check is next week, tips?',
    'کل امتحان چیک ہوگا؟ تیاری کیسے کروں',
    'check exams?',
    'Can you help me mark exams for my class of forty children',
  ];

  it.each(TALKING_ABOUT_EXAMS)('"%s" (a question or a long message) does NOT trigger', (message) => {
    expect(shouldTriggerExamChecker(message)).toBe(false);
  });

  it.each(TALKING_ABOUT_EXAMS)('"%s" as a photo caption still triggers', (message) => {
    expect(shouldTriggerExamChecker(message, { caption: true })).toBe(true);
  });

  it(`a phrase in a message of exactly ${PHRASE_TRIGGER_MAX_WORDS} words triggers, one more does not`, () => {
    expect(shouldTriggerExamChecker('please check exams for class 5')).toBe(true);
    expect(shouldTriggerExamChecker('please check exams for class 5 today')).toBe(false);
  });
});

describe('handleExamText — a URL never opens an exam session', () => {
  it('a first message with a link is left for ordinary chat and opens no session', async () => {
    const result = await handleExamText(text('Hi Rumi <a href="https://example.org">sign in</a>'), FROM, USER);

    expect(result).toBeNull();
    expect(session()).toBeUndefined();
    expect(WhatsAppService.sendMessage).not.toHaveBeenCalled();
    expect(WhatsAppService.sendInteractiveMessage).not.toHaveBeenCalled();
  });

  it('"check exams" still opens a session', async () => {
    const result = await handleExamText(text('check exams'), FROM, USER);

    expect(result).toEqual({ handled: true });
    expect(session().status).toBe(SESSION_STATES.COLLECTING_IMAGES);
  });
});

describe('handleExamImage — captions use the same matcher', () => {
  it('a caption with a trigger phrase opens a session and adds the image', async () => {
    const result = await handleExamImage(image('Check exams for class 5'), FROM, USER);

    expect(result).toEqual({ handled: true });
    expect(session().original_images).toHaveLength(1);
  });

  it('a long caption that asks a question still opens a session', async () => {
    const result = await handleExamImage(image('Can you grade papers like this one for my class?'), FROM, USER);

    expect(result).toEqual({ handled: true });
    expect(session().original_images).toHaveLength(1);
  });

  it('a caption with a URL is not an exam image', async () => {
    const result = await handleExamImage(image('see https://example.org/exam/results'), FROM, USER);

    expect(result).toBeNull();
    expect(session()).toBeUndefined();
  });
});

describe('handleExamText — cancel leaves a session from every state', () => {
  const NON_TERMINAL = Object.values(SESSION_STATES)
    .filter((s) => !['completed', 'error', 'cancelled'].includes(s));
  // While the answer key is collected a bare word may be the answer, so only
  // "/cancel" ends the session there (exam-question-is-chat.test.js).
  const cancelFor = (state) => (state === SESSION_STATES.COLLECTING_ANSWERS ? '/cancel' : 'cancel');

  it.each(NON_TERMINAL)('the cancel word in %s cancels the session and says so', async (state) => {
    openSession(state, state === SESSION_STATES.COLLECTING_IMAGES ? [] : ['https://files.example.test/p1.jpg']);

    const result = await handleExamText(text(cancelFor(state)), FROM, USER);

    expect(result).toEqual({ handled: true });
    expect(session().status).toBe(SESSION_STATES.CANCELLED);
    expect(WhatsAppService.sendMessage).toHaveBeenCalledWith(FROM, expect.stringMatching(/cancelled/i));
  });

  it('cancels a collecting_images session that already has images', async () => {
    openSession(SESSION_STATES.COLLECTING_IMAGES, ['https://files.example.test/p1.jpg']);

    await handleExamText(text('cancel'), FROM, USER);

    expect(session().status).toBe(SESSION_STATES.CANCELLED);
  });

  it.each(['cancel', 'Cancel', 'CANCEL!', ' cancel. ', 'stop', 'Stop', '/cancel', 'منسوخ', 'منسوخ کریں', 'منسوخ  کریں!',
    'روکیں', 'إلغاء', 'الغاء', 'ألغاء'])(
    '"%s" is a cancel word', async (word) => {
      openSession(SESSION_STATES.CONFIRMING_SCHEME, ['https://files.example.test/p1.jpg']);

      const result = await handleExamText(text(word), FROM, USER);

      expect(result).toEqual({ handled: true });
      expect(session().status).toBe(SESSION_STATES.CANCELLED);
    }
  );

  it('"cancel" inside a sentence is not a cancel', async () => {
    openSession(SESSION_STATES.COLLECTING_ANSWERS, ['https://files.example.test/p1.jpg']);

    await handleExamText(text('do not cancel the test'), FROM, USER);

    // Taken as the answer it was waiting for, not as a cancel
    expect(session().status).not.toBe(SESSION_STATES.CANCELLED);
    expect(allSentText()).not.toMatch(/cancelled/i);
  });

  it('"cancel" with no session open is left for the rest of the bot', async () => {
    const result = await handleExamText(text('cancel'), FROM, USER);

    expect(result).toBeNull();
    expect(WhatsAppService.sendMessage).not.toHaveBeenCalled();
  });
});

describe('handleExamText — an empty session does not swallow ordinary chat', () => {
  it('chat in a session with no images ends it quietly and goes on as ordinary chat', async () => {
    openSession(SESSION_STATES.COLLECTING_IMAGES, []);

    const result = await handleExamText(text('Hi'), FROM, USER);

    expect(result).toBeNull();
    expect(session().status).toBe(SESSION_STATES.CANCELLED);
    expect(WhatsAppService.sendMessage).not.toHaveBeenCalled();
    expect(WhatsAppService.sendInteractiveMessage).not.toHaveBeenCalled();
  });

  it('chat in a session that has images keeps prompting to add more or process', async () => {
    openSession(SESSION_STATES.COLLECTING_IMAGES, ['https://files.example.test/p1.jpg']);

    const result = await handleExamText(text('Hi'), FROM, USER);

    expect(result).toEqual({ handled: true });
    expect(session().status).toBe(SESSION_STATES.COLLECTING_IMAGES);
    expect(allSentText()).toMatch(/You have 1 images/);
  });

  it('a trigger phrase in an empty session keeps the session open', async () => {
    openSession(SESSION_STATES.COLLECTING_IMAGES, []);

    const result = await handleExamText(text('check exams'), FROM, USER);

    expect(result).toEqual({ handled: true });
    expect(session().status).toBe(SESSION_STATES.COLLECTING_IMAGES);
  });
});

describe('EXAM_CHECKER_ENABLED — the operator switch', () => {
  it('is on by default (unset)', async () => {
    const result = await handleExamText(text('/exam'), FROM, USER);

    expect(result).toEqual({ handled: true });
    expect(session().status).toBe(SESSION_STATES.COLLECTING_IMAGES);
  });

  it.each(['true', '1', 'yes', ''])('stays on when set to "%s"', async (value) => {
    process.env.EXAM_CHECKER_ENABLED = value;

    expect(await handleExamText(text('check exams'), FROM, USER)).toEqual({ handled: true });
  });

  it.each(['false', '0', 'off', 'OFF', ' False '])('"%s" stops a trigger phrase opening a session', async (value) => {
    process.env.EXAM_CHECKER_ENABLED = value;

    const result = await handleExamText(text('check exams'), FROM, USER);

    expect(result).toBeNull();
    expect(session()).toBeUndefined();
    expect(WhatsAppService.sendMessage).not.toHaveBeenCalled();
  });

  it('off: an image with a trigger caption opens no session', async () => {
    process.env.EXAM_CHECKER_ENABLED = 'false';

    const result = await handleExamImage(image('check exams'), FROM, USER);

    expect(result).toBeNull();
    expect(session()).toBeUndefined();
    expect(WhatsAppService.downloadMedia).not.toHaveBeenCalled();
  });

  it('off: a session that was already open ignores chat and images', async () => {
    openSession(SESSION_STATES.COLLECTING_IMAGES, ['https://files.example.test/p1.jpg']);
    process.env.EXAM_CHECKER_ENABLED = 'false';

    expect(await handleExamText(text('Hi'), FROM, USER)).toBeNull();
    expect(await handleExamImage(image(''), FROM, USER)).toBeNull();
    expect(session().original_images).toHaveLength(1);
    expect(WhatsAppService.sendMessage).not.toHaveBeenCalled();
  });

  it('off: "cancel" still closes a session that was already open', async () => {
    openSession(SESSION_STATES.CONFIRMING_SCHEME, ['https://files.example.test/p1.jpg']);
    process.env.EXAM_CHECKER_ENABLED = 'false';

    const result = await handleExamText(text('cancel'), FROM, USER);

    expect(result).toEqual({ handled: true });
    expect(session().status).toBe(SESSION_STATES.CANCELLED);
  });
});
