'use strict';
/**
 * Registration on Matrix, through the real handleTextMessage.
 *
 * On WhatsApp the name question waits for a finished feature, because asking a
 * stranger's name out of nowhere reads as spam there. A Matrix room is one the
 * person chose to open with Rumi, and until now they could not register at all
 * without first making a lesson plan: /register answered "try a feature
 * first". So on Matrix (only):
 *   - register / /register asks for the name straight away;
 *   - a first conversation ends with an optional offer to register;
 *   - while that offer is open, a reply that is not a name is answered as a
 *     normal message (it used to be stored as the name: "How do I..." made a
 *     teacher called "How"), and "no thanks" closes the offer.
 * WhatsApp and Slack keep their behaviour exactly.
 *
 * Only the boundaries are mocked: the database, Redis, the outbound send and
 * the LLM. The handler and the registration service run for real.
 */

jest.mock('jsonrepair', () => ({ jsonrepair: (s) => s }), { virtual: true });
const { mockBotDependency } = require('../_helpers/mock-bot-dependency');
mockBotDependency('aws-sdk', () => ({ config: { update: () => {} }, SQS: function SQS() {} }));
jest.mock('pdfkit', () => ({}), { virtual: true });
jest.mock('uuid', () => ({ v4: () => 'stub-uuid' }), { virtual: true });

// The users row, shared by every read of `users`; an update is applied to it
// and recorded, so a test can see what was written and the next message reads
// the new state. Every other table answers empty.
const mockDb = { row: {}, updates: [] };
jest.mock('../../bot/shared/config/supabase', () => {
  const chain = (table) => {
    let patch = null;
    const b = {
      select: () => b, eq: () => b, neq: () => b, in: () => b, is: () => b, not: () => b, gte: () => b,
      lte: () => b, order: () => b, limit: () => b, insert: () => b, upsert: () => b, delete: () => b,
      update: (p) => { patch = p; return b; },
      single: () => Promise.resolve({ data: table === 'users' ? { ...mockDb.row } : null, error: null }),
      maybeSingle: () => Promise.resolve({ data: table === 'users' ? { ...mockDb.row } : null, error: null }),
      then: (resolve, reject) => {
        if (patch && table === 'users') { mockDb.updates.push(patch); Object.assign(mockDb.row, patch); }
        return Promise.resolve({ data: [], error: null }).then(resolve, reject);
      },
    };
    return b;
  };
  return { from: jest.fn((table) => chain(table)), rpc: jest.fn().mockResolvedValue({ data: null, error: null }) };
});

const mockRedisStore = new Map();
jest.mock('../../bot/shared/services/cache/railway-redis.service', () => ({
  // The raw client, read directly by a few menu states; nothing is ever set there.
  redis: { get: jest.fn().mockResolvedValue(null), set: jest.fn(), del: jest.fn() },
  isAvailable: () => true,
  get: jest.fn(async (k) => (mockRedisStore.has(k) ? JSON.parse(mockRedisStore.get(k)) : null)),
  set: jest.fn(async (k, v) => { mockRedisStore.set(k, typeof v === 'string' ? v : JSON.stringify(v)); return true; }),
  setNX: jest.fn().mockResolvedValue(true),
  delete: jest.fn(async (k) => { mockRedisStore.delete(k); return true; }),
  del: jest.fn(async (k) => { mockRedisStore.delete(k); return true; }),
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
  sendAudio: jest.fn(),
  sendTypingIndicator: jest.fn(),
  markAsRead: jest.fn(),
  startContinuousTypingIndicator: () => ({ stop: jest.fn() }),
}));

const GENERAL_REPLY = 'Hello! How can I help with your class today?';
const mockAi = {
  detectIntent: jest.fn().mockResolvedValue({ type: 'general' }),
  getResponseWithFormat: jest.fn().mockResolvedValue(GENERAL_REPLY),
};
jest.mock('../../bot/shared/services/openai.service', () => ({
  detectIntent: (...a) => mockAi.detectIntent(...a),
  getResponseWithFormat: (...a) => mockAi.getResponseWithFormat(...a),
  generateResponse: jest.fn().mockResolvedValue('ok'),
  extractTopic: jest.fn().mockResolvedValue('fractions'),
  createChatCompletion: jest.fn().mockResolvedValue({ choices: [{ message: { content: 'ok' } }] }),
}));

jest.mock('../../bot/shared/database/bot-helpers', () => ({
  getOrCreateUser: jest.fn(),
  getOrCreateUserByChannel: jest.fn(),
  getOrCreateSession: jest.fn().mockResolvedValue('sess-1'),
  updateSessionType: jest.fn(),
  storeConversation: jest.fn(),
  storeLessonPlan: jest.fn(),
  getConversationHistory: jest.fn().mockResolvedValue([]),
  matrixPhoneNumberFor: jest.fn().mockResolvedValue(null),
}));
jest.mock('../../bot/shared/utils/language-cache', () => ({
  getUserLanguage: jest.fn().mockResolvedValue('en'),
  setUserLanguage: jest.fn(),
}));
jest.mock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn(), logError: jest.fn() }));
jest.mock('../../bot/shared/services/quiz/quiz-session.service', () => ({
  getPostQuizState: jest.fn().mockResolvedValue(null),
  getActiveState: jest.fn().mockResolvedValue(null),
}));

const MATRIX = 'mtx:15550100001';
const WHATSAPP = '15550100002';
const SLACK = 'slack:U0155501003';
const NOT_FOUND = /try one of my features/;
const OFFER = /what should I call you\?.*register.*keep chatting/is;

// The real handler loads the bot's own packages, which the root CI pass runs
// before bot/ installs (same guard as name-pending-loop.test.js).
const botDepsInstalled = require('fs').existsSync(require('path').resolve(__dirname, '../../bot/node_modules'));
const describeWithBotDeps = botDepsInstalled ? describe : describe.skip;

let handler;
beforeAll(() => {
  if (botDepsInstalled) handler = require('../../bot/shared/handlers/text-message.handler');
});

beforeEach(() => {
  jest.clearAllMocks();
  mockWa.sendMessage.mockReset().mockResolvedValue(true);
  mockAi.getResponseWithFormat.mockReset().mockResolvedValue(GENERAL_REPLY);
  mockRedisStore.clear();
  mockDb.updates = [];
  mockDb.row = { id: 'u-1', phone_number: null, first_name: null, registration_completed: false, registration_pending_name: false };
});

/** One message from `from`, as the given user row; returns the texts sent back. */
async function say(from, body, rowPatch = {}) {
  Object.assign(mockDb.row, rowPatch);
  const user = { id: 'u-1', preferred_language: 'en', first_name: mockDb.row.first_name };
  await handler.handleTextMessage({ id: 'm-test' }, from, body, user);
  await new Promise((r) => setImmediate(r));
  return mockWa.sendMessage.mock.calls.map(([, text]) => text);
}

const nameWrites = () => mockDb.updates.filter((u) => 'first_name' in u);

describeWithBotDeps('Matrix: offered on first contact', () => {
  test('a new person says "Hi": the normal reply, then the registration offer, and the offer is now open', async () => {
    const sent = await say(MATRIX, 'Hi');
    expect(sent[0]).toBe(GENERAL_REPLY);
    expect(sent[1]).toMatch(OFFER);
    expect(sent).toHaveLength(2);
    expect(mockDb.updates).toContainEqual({ registration_pending_name: true });
  });

  test('a first message that is a question: the answer, then the offer', async () => {
    const sent = await say(MATRIX, 'How do I keep a noisy class focused?');
    expect(sent[0]).toBe(GENERAL_REPLY);
    expect(sent[1]).toMatch(OFFER);
  });

  test('the offer suggests the bare word register, not /register', async () => {
    const sent = await say(MATRIX, 'Hi');
    expect(sent[1]).not.toMatch(/\/register/);
  });

  test('already offered (pending): a question is answered and the offer is not repeated', async () => {
    const sent = await say(MATRIX, 'What can you do for a grade 3 class?', { registration_pending_name: true });
    expect(sent).toEqual([GENERAL_REPLY]);
  });

  test('already registered: no offer', async () => {
    const sent = await say(MATRIX, 'Hi', { first_name: 'Ayesha', registration_completed: true });
    expect(sent).toEqual([GENERAL_REPLY]);
    expect(mockDb.updates).toEqual([]);
  });

  test('a failure to send the offer never breaks the reply', async () => {
    mockWa.sendMessage.mockResolvedValueOnce(true).mockRejectedValueOnce(new Error('send failed'));
    await expect(say(MATRIX, 'Hi')).resolves.toBeDefined();
    expect(mockWa.sendMessage.mock.calls[0][1]).toBe(GENERAL_REPLY);
    expect(mockWa.sendMessage).toHaveBeenCalledTimes(2);
  });
});

describeWithBotDeps('Matrix: register any time', () => {
  test.each(['register', '/register'])('"%s" with no features used asks for the name', async (body) => {
    const sent = await say(MATRIX, body);
    expect(sent).toHaveLength(1);
    expect(sent[0]).not.toMatch(NOT_FOUND);
    expect(sent[0]).toMatch(/Let's get you registered\. What should I call you\?/);
    expect(mockDb.updates).toContainEqual({ registration_pending_name: true });
  });

  test('an already-registered person is told so', async () => {
    const sent = await say(MATRIX, 'register', { first_name: 'Ayesha', registration_completed: true });
    expect(sent).toEqual([expect.stringMatching(/already registered, Ayesha/)]);
  });
});

describeWithBotDeps('Matrix: an open offer never blocks use', () => {
  test('a question while pending is handled normally and is not stored as the name', async () => {
    const sent = await say(MATRIX, 'How do I teach fractions to grade 3?', { registration_pending_name: true });
    expect(nameWrites()).toEqual([]);
    expect(mockAi.getResponseWithFormat).toHaveBeenCalled();
    expect(sent).toEqual([GENERAL_REPLY]);
    expect(mockDb.row.registration_pending_name).toBe(true);
  });

  test('a name while pending registers them', async () => {
    const sent = await say(MATRIX, 'Ayesha', { registration_pending_name: true });
    expect(mockDb.updates).toContainEqual(expect.objectContaining({
      first_name: 'Ayesha', registration_completed: true, registration_pending_name: false,
    }));
    expect(sent).toEqual([expect.stringMatching(/Nice to meet you, Ayesha/)]);
  });

  test('"my name is Ayesha" while pending registers them', async () => {
    await say(MATRIX, 'my name is Ayesha', { registration_pending_name: true });
    expect(nameWrites()).toEqual([expect.objectContaining({ first_name: 'Ayesha', registration_completed: true })]);
  });

  test('"no thanks" while pending closes the offer, briefly', async () => {
    const sent = await say(MATRIX, 'no thanks', { registration_pending_name: true });
    expect(nameWrites()).toEqual([]);
    expect(mockDb.updates).toContainEqual({ registration_pending_name: false });
    expect(sent).toEqual(["No problem — type register whenever you'd like to."]);
    expect(mockAi.getResponseWithFormat).not.toHaveBeenCalled();
  });

  test('"register" while pending asks again rather than becoming the name', async () => {
    const sent = await say(MATRIX, 'register', { registration_pending_name: true });
    expect(nameWrites()).toEqual([]);
    expect(sent).toEqual([expect.stringMatching(/What should I call you\?/)]);
  });
});

describeWithBotDeps('WhatsApp and Slack are unchanged', () => {
  test('WhatsApp: a new person says "Hi" and gets the reply only', async () => {
    const sent = await say(WHATSAPP, 'Hi');
    expect(sent).toEqual([GENERAL_REPLY]);
    expect(mockDb.updates).toEqual([]);
  });

  test.each(['/register', 'register'])('WhatsApp: "%s" with no features is still the guide', async (body) => {
    const sent = await say(WHATSAPP, body);
    expect(sent).toEqual([expect.stringMatching(NOT_FOUND)]);
  });

  test('WhatsApp: while pending, any reply is still read as the name', async () => {
    await say(WHATSAPP, 'How do I teach fractions?', { registration_pending_name: true });
    expect(nameWrites()).toEqual([expect.objectContaining({ first_name: 'How' })]);
  });

  test('WhatsApp: while pending, "no thanks" is still read as the name', async () => {
    await say(WHATSAPP, 'no thanks', { registration_pending_name: true });
    expect(nameWrites()).toEqual([expect.objectContaining({ first_name: 'No' })]);
  });

  test('Slack: "Hi" gets the reply only', async () => {
    const sent = await say(SLACK, 'Hi');
    expect(sent).toEqual([GENERAL_REPLY]);
    expect(mockDb.updates).toEqual([]);
  });

  test('Slack: /register still opens the registration form button', async () => {
    const sent = await say(SLACK, '/register');
    expect(sent).toEqual([]);
    expect(mockWa.sendInteractiveButtons).toHaveBeenCalledWith(SLACK, expect.objectContaining({
      buttons: [{ id: 'open_modal:registration', title: 'Get started' }],
    }));
  });
});
