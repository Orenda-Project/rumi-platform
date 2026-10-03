/**
 * Public-deployment limits, live wiring — whatsapp-bot.js's handleWebhookPost,
 * the one entry point every channel's inbound adapter dispatches into.
 *
 * Real: whatsapp-bot.js, the validators, limits/ (rate limit, daily caps, model
 * budget), the messaging facade (messaging/index.js, with its budget mute) and
 * llm-client.js. Mocked at the boundary: the channel driver (meta-channel), the
 * provider's HTTP (global fetch), the database, Redis (absent: the in-process
 * fallbacks run), the logger, the message dedupe and the user lookup. The text
 * handler is a stand-in that does what every handler does: one model call, and
 * an apology when it fails.
 */

const FROM = '15550100031';
const UNREGISTERED = { id: '00000000-0000-4000-8000-0000000000c1', preferred_language: 'en', phone_number: FROM, registration_completed: false };
const REGISTERED = { ...UNREGISTERED, id: '00000000-0000-4000-8000-0000000000c2', registration_completed: true };

let handleWebhookPost;
let WA;
let Text;
let user;
let msgSeq = 0;
let fetchSpy;

const ENV_KEYS = [
  'INBOUND_RATE_LIMIT_PER_MINUTE', 'RATE_LIMIT_BYPASS_NUMBERS', 'DAILY_MESSAGE_CAP_UNREGISTERED', 'DAILY_MESSAGE_CAP_REGISTERED',
  'MODEL_BUDGET_COOLDOWN_SECONDS', 'CHANNEL_DRIVER', 'OPENROUTER_API_KEY', 'LLM_PROVIDER', 'PHONE_NUMBER_ID', 'REDIS_URL',
];
const saved = {};

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

function load(account) {
  jest.resetModules();
  user = account;
  process.env.CHANNEL_DRIVER = 'meta';
  process.env.OPENROUTER_API_KEY = 'test-key';
  delete process.env.LLM_PROVIDER;
  delete process.env.PHONE_NUMBER_ID;
  delete process.env.REDIS_URL;
  jest.doMock('../../bot/shared/config/supabase', () => inert());
  jest.doMock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn(), LOGS_DIR: '/tmp' }));
  // No Redis on this path: isAvailable() is false, so every limit counts in process.
  jest.doMock('../../bot/shared/services/cache/railway-redis.service', () => inert({ isAvailable: () => false, redis: null }));
  WA = inert({
    sendMessage: jest.fn().mockResolvedValue(true),
    sendReaction: jest.fn().mockResolvedValue(true),
    showTypingIndicator: jest.fn().mockResolvedValue(true),
    startContinuousTypingIndicator: jest.fn(() => ({ stop: jest.fn() })),
  });
  jest.doMock('../../bot/shared/services/messaging/meta-channel.service', () => WA);
  jest.doMock('../../bot/shared/services/queue', () => ({ queueJob: jest.fn().mockResolvedValue('job-1') }));
  jest.doMock('../../bot/shared/services/openai.service', () => inert());
  jest.doMock('../../bot/shared/services/gpt5-mini.service', () => inert());
  jest.doMock('../../bot/shared/services/exam-checker/annotation.service', () => inert());
  jest.doMock('../../bot/shared/services/pdf-report.service', () => inert());
  jest.doMock('../../bot/shared/database/bot-helpers', () => inert({
    getOrCreateUser: jest.fn(async () => user),
    getOrCreateSession: jest.fn().mockResolvedValue('session-1'),
  }));
  jest.doMock('../../bot/shared/services/session.service', () => inert({
    isProcessed: jest.fn().mockResolvedValue(false),
    markAsProcessed: jest.fn().mockResolvedValue(true),
    getReactionEmoji: jest.fn(() => '👀'),
  }));
  jest.doMock('../../bot/shared/services/quiz/transcript-quiz-offer.service', () => ({ handleTypedLanguageChoice: jest.fn().mockResolvedValue(false) }));
  Text = {
    handleTextMessage: jest.fn(async (message, from) => {
      const WhatsAppService = require('../../bot/shared/services/whatsapp.service');
      try {
        const { getClient } = require('../../bot/shared/services/llm-client');
        const r = await getClient().chat.completions.create({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: 'hi' }] });
        await WhatsAppService.sendMessage(from, r.choices[0].message.content);
      } catch (e) {
        await WhatsAppService.sendMessage(from, 'Sorry, something went wrong. Please try again.');
      }
    }),
  };
  jest.doMock('../../bot/shared/handlers/text-message.handler', () => Text);

  const { app } = require('../../bot/whatsapp-bot');
  const router = app.router || app._router;
  const layer = router.stack.find((l) => l.route && l.route.path === '/webhook' && l.route.methods.post);
  handleWebhookPost = layer.route.stack[layer.route.stack.length - 1].handle;
}

function metaWebhook(text) {
  msgSeq += 1;
  return {
    object: 'whatsapp_business_account',
    entry: [{
      id: '1555010000000',
      changes: [{
        field: 'messages',
        value: {
          messaging_product: 'whatsapp',
          metadata: { display_phone_number: '15550100000', phone_number_id: '1555010009999' },
          contacts: [{ profile: { name: 'Sam' }, wa_id: FROM }],
          messages: [{ from: FROM, id: `wamid.limits-${msgSeq}`, timestamp: String(Math.floor(Date.now() / 1000)), type: 'text', text: { body: text } }],
        },
      }],
    }],
  };
}

async function post(text) {
  const res = { statusCode: null };
  res.status = jest.fn((code) => { res.statusCode = code; return res; });
  res.send = jest.fn(() => res);
  res.sendStatus = jest.fn((code) => { res.statusCode = code; return res; });
  await handleWebhookPost({ method: 'POST', url: '/webhook', headers: {}, body: metaWebhook(text) }, res);
  return res;
}

const textsSent = () => WA.sendMessage.mock.calls.map((c) => c[1]);
const modelCalls = () => fetchSpy.mock.calls.filter(([url]) => /chat\/completions/.test(String(url && url.url ? url.url : url))).length;

function providerAnswers(status, body) {
  fetchSpy.mockImplementation(async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));
}
const OK = { id: 'c1', object: 'chat.completion', created: 1, model: 'openai/gpt-4o-mini', choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: 'Hello, teacher!' } }] };

beforeEach(() => {
  for (const k of ENV_KEYS) { saved[k] = process.env[k]; delete process.env[k]; }
  fetchSpy = jest.spyOn(global, 'fetch');
  providerAnswers(200, OK);
});
afterEach(() => {
  fetchSpy.mockRestore();
  for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  jest.resetModules();
});

describe('per-sender inbound rate limit', () => {
  it('a burst of 40 in a minute: 30 handled, one "slow down", the rest silent, no model call past the limit', async () => {
    load(REGISTERED);
    const statuses = [];
    for (let i = 0; i < 40; i += 1) statuses.push((await post(`message ${i}`)).statusCode);

    expect(statuses.every((s) => s === 200)).toBe(true);
    expect(Text.handleTextMessage).toHaveBeenCalledTimes(30);
    expect(modelCalls()).toBe(30);
    const slow = textsSent().filter((t) => /faster than I can answer/.test(t));
    expect(slow).toHaveLength(1);
    expect(textsSent()).toHaveLength(31);
  });

  it('INBOUND_RATE_LIMIT_PER_MINUTE=off lets every message through', async () => {
    process.env.INBOUND_RATE_LIMIT_PER_MINUTE = 'off';
    load(REGISTERED);
    for (let i = 0; i < 35; i += 1) await post(`message ${i}`);
    expect(Text.handleTextMessage).toHaveBeenCalledTimes(35);
  });
});

describe('daily message caps by tier', () => {
  it('an unregistered account over DAILY_MESSAGE_CAP_UNREGISTERED is told once, then not handled', async () => {
    process.env.DAILY_MESSAGE_CAP_UNREGISTERED = '3';
    load(UNREGISTERED);
    for (let i = 0; i < 6; i += 1) await post(`message ${i}`);
    expect(Text.handleTextMessage).toHaveBeenCalledTimes(3);
    const capped = textsSent().filter((t) => /today's limit of 3 messages/.test(t));
    expect(capped).toHaveLength(1);
    expect(capped[0]).toMatch(/\/register/);
  });

  it('/register still goes through after the cap, so the account can finish registering', async () => {
    process.env.DAILY_MESSAGE_CAP_UNREGISTERED = '1';
    load(UNREGISTERED);
    await post('hello');
    await post('hello again');
    await post('/register');
    expect(Text.handleTextMessage).toHaveBeenCalledTimes(2);
    expect(Text.handleTextMessage.mock.calls[1][2]).toBe('/register');
  });

  it('a registered account is not capped by the unregistered cap (and the defaults cap nobody)', async () => {
    process.env.DAILY_MESSAGE_CAP_UNREGISTERED = '2';
    load(REGISTERED);
    for (let i = 0; i < 5; i += 1) await post(`message ${i}`);
    expect(Text.handleTextMessage).toHaveBeenCalledTimes(5);
  });
});

describe('model budget runs out politely', () => {
  it('a 402 from the provider: one "busy" reply instead of the apology, one alert, and later messages make no model call', async () => {
    load(REGISTERED);
    providerAnswers(402, { error: { code: 402, message: 'Insufficient credits. Add more using https://openrouter.ai/settings/credits' } });

    await post('first');
    expect(textsSent()).toEqual(['Rumi is very busy right now. Please try again a little later.']);
    expect(modelCalls()).toBe(1);

    await post('second');
    await post('third');
    // Told once per cooldown; no handler ran, nothing reached the provider.
    expect(textsSent()).toHaveLength(1);
    expect(Text.handleTextMessage).toHaveBeenCalledTimes(1);
    expect(modelCalls()).toBe(1);

    const { logToFile } = require('../../bot/shared/utils/logger');
    const alerts = logToFile.mock.calls.filter(([, data]) => data && data.alert === 'model_budget_exhausted');
    expect(alerts).toHaveLength(1);
  });

  it('an ordinary provider error (400) is not a budget refusal: the handler\'s own apology goes out', async () => {
    load(REGISTERED);
    providerAnswers(400, { error: { code: 400, message: 'Bad request' } });
    await post('first');
    expect(textsSent()).toEqual(['Sorry, something went wrong. Please try again.']);
  });
});
