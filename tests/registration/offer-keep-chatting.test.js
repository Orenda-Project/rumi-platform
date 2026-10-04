'use strict';
/**
 * Keep chatting while the Matrix registration offer is open.
 *
 * This is the release review's reproduction, kept as it was written: the
 * offer says "...or just keep chatting", and keeping chatting with a teaching
 * assistant is often one word (a topic, or a thank-you in the teacher's own
 * language). Each of these used to be stored as the teacher's name
 * ("fractions" made a teacher called Fractions). A bare word is now a name
 * only once the teacher confirms it (see matrix-registration-offer.test.js).
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

beforeEach(async () => {
  jest.clearAllMocks();
  // The word Rumi asked about is also held in memory (for when Redis is
  // down), so clearing the Redis mock alone would carry it into the next test.
  if (botDepsInstalled) await require('../../bot/shared/services/feature-registration.service')._clearNameCandidate('u-1');
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


// The offer says "…or just keep chatting". Keeping chatting with a teaching assistant is often a one-word topic,
// or a thank-you in the teacher's own language.
describeWithBotDeps('keep chatting while the offer is open', () => {
  test.each(['fractions', 'photosynthesis', 'Shukriya', 'got it'])('"%s" is not stored as the teacher\'s name', async (reply) => {
    await say(MATRIX, reply, { registration_pending_name: true });
    expect(nameWrites()).toEqual([]);
  });
});
