'use strict';
/**
 * THE MODEL BUDGET BREAKER — when the model provider refuses for money (an
 * OpenRouter key over its credit limit, an account out of credits, an OpenAI
 * project out of quota), Rumi says "busy" once instead of an error, and the
 * operator sees one alert instead of one per message.
 *
 * How it fits together:
 *   - llm-client.js passes every chat completion through guardCreate(). A
 *     budget refusal trips the breaker for MODEL_BUDGET_COOLDOWN_SECONDS
 *     (default 300); while it is tripped every further call is refused HERE,
 *     without a network call, so a flood of messages costs nothing and logs
 *     nothing new. After the cooldown the next call tries the provider again.
 *   - handleWebhookPost and the worker run each message/job inside guard().
 *     When the breaker trips during it, every reply that message would still
 *     send (the handler's own apology) is muted (isMuted(), checked by the
 *     messaging facade), and guard() sends the one "busy" reply instead.
 *   - While tripped, handleWebhookPost answers new messages with "busy" before
 *     any handler runs; each sender hears it once per cooldown, then silence.
 *
 * The tripped state lives in Redis (shared by the bot and the worker) and in
 * this process; with Redis down each process trips on its own first refusal.
 */

const { AsyncLocalStorage } = require('async_hooks');

const DEFAULT_COOLDOWN_SECONDS = 300;
const TRIPPED_KEY = 'model_budget:tripped';
const ALERT_KEY = 'model_budget:alerted';
const LOCAL_MAX_TOLD = 10000;

const scopes = new AsyncLocalStorage();
let trippedUntil = 0;
const localTold = new Map(); // recipient -> told-until (ms)

class ModelBudgetError extends Error {
  constructor(message = 'Model budget exhausted') {
    super(message);
    this.name = 'ModelBudgetError';
    this.budgetExhausted = true;
  }
}

function cooldownSeconds() {
  const n = Number.parseInt(String(process.env.MODEL_BUDGET_COOLDOWN_SECONDS || '').trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_COOLDOWN_SECONDS;
}

function cache() {
  try {
    // eslint-disable-next-line global-require
    const r = require('../cache/railway-redis.service');
    return r && r.isAvailable && r.isAvailable() === true ? r : null;
  } catch (_) {
    return null;
  }
}

function log(message, data, level) {
  try {
    require('../../utils/logger').logToFile(message, data, level);
  } catch (_) { /* a log is not worth a failed call */ }
}

/**
 * Is this provider error a refusal for money (not a bad request, a rate limit
 * or an outage)? OpenRouter: 402 (no credits) and 403 "Key limit exceeded";
 * OpenAI: 429 with code insufficient_quota.
 */
function isBudgetError(err) {
  if (!err) return false;
  if (err.budgetExhausted === true) return true;
  const status = Number(err.status || (err.response && err.response.status));
  const code = String(err.code || (err.error && err.error.code) || '');
  const text = `${err.message || ''} ${(err.error && err.error.message) || ''}`;
  if (status === 402) return true;
  if (code === 'insufficient_quota') return true;
  if (status === 403 && /key limit|credit limit|limit exceeded|insufficient credits/i.test(text)) return true;
  if (status === 429 && /insufficient_quota|exceeded your current quota|billing/i.test(text)) return true;
  return false;
}

/** Trip the breaker (one alert per cooldown) and mark the current message. */
function trip(err) {
  const scope = scopes.getStore();
  if (scope) scope.tripped = true;
  const now = Date.now();
  const wasTripped = trippedUntil > now;
  const seconds = cooldownSeconds();
  trippedUntil = now + seconds * 1000;
  const r = cache();
  if (r) {
    r.set(TRIPPED_KEY, '1', seconds).catch(() => {});
    r.setNX(ALERT_KEY, '1', seconds).then((first) => {
      if (first === true) alert(err, seconds);
    }).catch(() => {});
  } else if (!wasTripped) {
    alert(err, seconds);
  }
}

function alert(err, seconds) {
  log('🚨 MODEL BUDGET EXHAUSTED: the model provider refused for budget/quota. Rumi is answering "busy" until it is topped up.', {
    alert: 'model_budget_exhausted',
    status: err && err.status,
    error: err && String(err.message || '').slice(0, 300),
    retryInSeconds: seconds,
  }, 'error');
}

/** Tripped in this process (sync; what guardCreate uses). */
function isTrippedLocally() {
  return trippedUntil > Date.now();
}

/** Tripped here or in another process (the bot asks this per message). */
async function isTripped() {
  if (isTrippedLocally()) return true;
  const r = cache();
  if (!r) return false;
  try {
    const v = await r.get(TRIPPED_KEY);
    if (v === null || v === undefined) return false;
    trippedUntil = Date.now() + cooldownSeconds() * 1000;
    return true;
  } catch (_) {
    return false;
  }
}

/**
 * Wrap a chat.completions.create function. The provider's own promise is
 * returned untouched (its helpers stay reachable); a budget refusal is
 * noticed on a side branch, which runs before the caller's own handlers.
 */
function guardCreate(create) {
  return function guardedCreate(params, options) {
    if (isTrippedLocally()) {
      const scope = scopes.getStore();
      if (scope) scope.tripped = true;
      return Promise.reject(new ModelBudgetError('Model budget exhausted (waiting for the cooldown before trying the provider again)'));
    }
    const p = create(params, options);
    if (p && typeof p.then === 'function') {
      p.then(null, (err) => { if (isBudgetError(err)) trip(err); });
    }
    return p;
  };
}

/** True while the current message has hit the budget: its remaining sends are muted. */
function isMuted() {
  const scope = scopes.getStore();
  return !!(scope && scope.tripped);
}

const BUSY = {
  en: 'Rumi is very busy right now. Please try again a little later.',
  ur: 'رومی اس وقت بہت مصروف ہے۔ براہ کرم تھوڑی دیر بعد دوبارہ کوشش کریں۔',
};

function busyMessage(lang) {
  return BUSY[lang] || BUSY.en;
}

/**
 * Send "busy" to `to` at most once per cooldown. The caller passes its
 * messaging facade's send: the facade itself reads isMuted() from here, so
 * this module never requires it.
 *
 * @param {function(string, string):Promise<*>} send e.g. (to, text) => WhatsAppService.sendMessage(to, text)
 * @returns {Promise<boolean>} sent
 */
async function tellBusy(to, lang, send) {
  if (!to || typeof send !== 'function') return false;
  const seconds = cooldownSeconds();
  const r = cache();
  let first;
  if (r) {
    first = (await r.setNX(`model_budget:told:${to}`, '1', seconds)) === true;
  } else {
    const now = Date.now();
    first = !((localTold.get(to) || 0) > now);
    if (first) {
      localTold.set(to, now + seconds * 1000);
      if (localTold.size > LOCAL_MAX_TOLD) localTold.delete(localTold.keys().next().value);
    }
  }
  if (!first) return false;
  try {
    await send(to, busyMessage(lang));
  } catch (e) {
    log('⚠️ Could not send the "busy" reply', { error: e.message });
  }
  return true;
}

/**
 * Run one message or job. If the budget runs out during it, its own replies
 * are muted and the sender hears "busy" once instead.
 *
 * @param {string|function():string} to the recipient (or a getter for it)
 * @param {function():Promise<*>} fn
 * @param {{send: function(string, string):Promise<*>, lang?: string|function():string}} opts
 */
async function guard(to, fn, { send, lang } = {}) {
  const scope = { tripped: false };
  try {
    return await scopes.run(scope, fn);
  } finally {
    // Either may be a function: the inbound path learns the sender (and its
    // language) only after the message has been read.
    if (scope.tripped) await tellBusy(typeof to === 'function' ? to() : to, typeof lang === 'function' ? lang() : lang, send);
  }
}

/** Test seam. */
function _reset() {
  trippedUntil = 0;
  localTold.clear();
}

module.exports = {
  ModelBudgetError,
  isBudgetError,
  trip,
  isTripped,
  isTrippedLocally,
  guardCreate,
  guard,
  isMuted,
  tellBusy,
  busyMessage,
  cooldownSeconds,
  DEFAULT_COOLDOWN_SECONDS,
  _reset,
};
