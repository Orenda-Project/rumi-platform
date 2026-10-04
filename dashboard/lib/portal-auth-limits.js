/**
 * Rate limits for the teacher portal's public sign-in routes.
 *
 * Sign-in, first-time setup and the password-reset steps are reachable by
 * anyone, so each is limited by client IP and, where the request names an
 * account (the phone number typed in), by that account too. Either one tripping
 * answers 429 with one generic message — the same for both, and the same
 * whether or not the account exists, so a 429 never tells anyone which numbers
 * have portal accounts.
 *
 * Counts are kept in Redis when the dashboard has one (index.js hands its client
 * over with setPortalAuthLimitsRedisClient, as it does for the GPT cache), so
 * every cluster worker and every replica shares them. With no Redis — or a Redis
 * that errors, is not ready, or does not answer within REDIS_TIMEOUT_MS — each
 * process counts in memory instead: the request is never failed or held because
 * of the limiter.
 *
 * Buckets are keyed by a fixed route name ('login', 'reset-request', ...), never
 * by req.path: Express sends /login, /LOGIN and /login/ to the same handler, so
 * they must share a count. Account keys are an HMAC of the normalised phone
 * number, so Redis never holds a number in plain text.
 *
 * Settings (all optional; an empty, non-numeric or non-positive value means the
 * default):
 *   PORTAL_AUTH_LIMIT_WINDOW_MINUTES  window for every auth limit       (15)
 *   PORTAL_LOGIN_LIMIT_PER_IP         failed sign-ins per IP            (10)
 *   PORTAL_LOGIN_LIMIT_PER_ACCOUNT    failed sign-ins per phone number  (5)
 *   PORTAL_RESET_LIMIT_PER_IP         reset requests / code checks /
 *                                     new passwords per IP              (5)
 *   PORTAL_RESET_LIMIT_PER_ACCOUNT    reset requests / code checks per
 *                                     phone number                      (5)
 *   PORTAL_SETUP_LIMIT_PER_IP         invite checks / setups per IP     (10)
 *   PORTAL_DATA_LIMIT_PER_MINUTE      all /api/portal requests per IP
 *                                     per minute                        (300)
 *
 * "Per IP" is the client address from lib/client-ip.js: req.ip as TRUST_PROXY
 * makes it, or PORTAL_CLIENT_IP_HEADER when that is set.
 */

const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { createClientIpGetter } = require('./client-ip');

const TOO_MANY = Object.freeze({ success: false, error: 'Too many attempts. Please try again later.' });
const KEY_PREFIX = 'rl:portal:';
const REDIS_TIMEOUT_MS = 500;

const DEFAULTS = Object.freeze({
  windowMinutes: 15,
  loginPerIp: 10,
  loginPerAccount: 5,
  resetPerIp: 5,
  resetPerAccount: 5,
  setupPerIp: 10,
  dataPerMinute: 300,
});

// --- Redis client, shared the way gpt-cache.service.js shares it -------------

let sharedRedisClient = null;

/** index.js calls this when its Redis connects, and with null when it closes. */
function setPortalAuthLimitsRedisClient(client) {
  sharedRedisClient = client || null;
}

const getSharedRedisClient = () => sharedRedisClient;

// --- Settings ----------------------------------------------------------------

function positiveInt(value, fallback) {
  const s = String(value ?? '').trim();
  if (!/^\d+$/.test(s)) return fallback;
  const n = Number(s);
  return Number.isSafeInteger(n) && n > 0 ? n : fallback;
}

function readPortalAuthLimits(env = process.env) {
  return {
    windowMs: positiveInt(env.PORTAL_AUTH_LIMIT_WINDOW_MINUTES, DEFAULTS.windowMinutes) * 60 * 1000,
    loginPerIp: positiveInt(env.PORTAL_LOGIN_LIMIT_PER_IP, DEFAULTS.loginPerIp),
    loginPerAccount: positiveInt(env.PORTAL_LOGIN_LIMIT_PER_ACCOUNT, DEFAULTS.loginPerAccount),
    resetPerIp: positiveInt(env.PORTAL_RESET_LIMIT_PER_IP, DEFAULTS.resetPerIp),
    resetPerAccount: positiveInt(env.PORTAL_RESET_LIMIT_PER_ACCOUNT, DEFAULTS.resetPerAccount),
    setupPerIp: positiveInt(env.PORTAL_SETUP_LIMIT_PER_IP, DEFAULTS.setupPerIp),
    dataPerMinute: positiveInt(env.PORTAL_DATA_LIMIT_PER_MINUTE, DEFAULTS.dataPerMinute),
  };
}

// --- Keys --------------------------------------------------------------------

/** Digits only: "+1 555 200 0001" and "15552000001" are one account. */
function normalisePhone(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  return String(value).replace(/\D+/g, '');
}

/**
 * A stable, non-reversible-at-a-glance key for a phone number. Keyed with the
 * session secret when there is one, so the same on every worker and replica.
 */
function accountKey(phone) {
  const secret = process.env.SESSION_SECRET || 'rumi-portal-auth-limits';
  return crypto.createHmac('sha256', secret).update(phone).digest('hex').slice(0, 32);
}

// --- Store -------------------------------------------------------------------

function withTimeout(promise, ms) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Redis did not answer within ${ms}ms`)), ms);
      if (timer.unref) timer.unref();
    }),
  ]).finally(() => clearTimeout(timer));
}

/** Fixed-window counts in this process: the no-Redis path and the fallback. */
class MemoryCounts {
  constructor() { this.hits = new Map(); }

  increment(key, windowMs) {
    const now = Date.now();
    if (this.hits.size > 10000) {
      for (const [k, e] of this.hits) if (e.resetTime <= now) this.hits.delete(k);
    }
    let e = this.hits.get(key);
    if (!e || e.resetTime <= now) {
      e = { totalHits: 0, resetTime: now + windowMs };
      this.hits.set(key, e);
    }
    e.totalHits += 1;
    return { totalHits: e.totalHits, resetTime: new Date(e.resetTime) };
  }

  decrement(key) {
    const e = this.hits.get(key);
    if (e && e.totalHits > 0) e.totalHits -= 1;
  }

  reset(key) { this.hits.delete(key); }
}

/**
 * An express-rate-limit (v7) Store over a node-redis v5 client: INCR, then
 * PTTL, and PEXPIRE when the key has no expiry yet (works on any Redis version
 * and repairs a key whose PEXPIRE was lost). Falls back to MemoryCounts.
 */
class PortalLimitStore {
  constructor({ prefix, getClient = getSharedRedisClient } = {}) {
    this.prefix = prefix;
    this.getClient = getClient;
    this.localKeys = false;
    this.memory = new MemoryCounts();
    this.windowMs = 60 * 1000;
    this.failing = false;
  }

  init(options) {
    this.windowMs = options.windowMs;
  }

  /** The client, if there is one and it can take commands now. */
  client() {
    const client = this.getClient();
    if (!client || client.isReady === false) return null;
    return client;
  }

  redisFailed(err) {
    if (!this.failing) {
      console.warn(`[portal-limits] Redis unavailable for ${this.prefix} — counting in memory: ${err.message}`);
      this.failing = true;
    }
  }

  async increment(key) {
    const client = this.client();
    if (client) {
      const k = this.prefix + key;
      try {
        const counted = await withTimeout((async () => {
          const totalHits = Number(await client.incr(k));
          let ttl = Number(await client.pTTL(k));
          if (!(ttl > 0)) {
            await client.pExpire(k, this.windowMs);
            ttl = this.windowMs;
          }
          return { totalHits, resetTime: new Date(Date.now() + ttl) };
        })(), REDIS_TIMEOUT_MS);
        this.failing = false;
        return counted;
      } catch (err) {
        this.redisFailed(err);
      }
    }
    return this.memory.increment(key, this.windowMs);
  }

  async decrement(key) {
    this.memory.decrement(key);
    const client = this.client();
    if (!client) return;
    try {
      const left = Number(await withTimeout(client.decr(this.prefix + key), REDIS_TIMEOUT_MS));
      if (left <= 0) await withTimeout(client.del(this.prefix + key), REDIS_TIMEOUT_MS);
    } catch (err) {
      this.redisFailed(err);
    }
  }

  async resetKey(key) {
    this.memory.reset(key);
    const client = this.client();
    if (!client) return;
    try {
      await withTimeout(client.del(this.prefix + key), REDIS_TIMEOUT_MS);
    } catch (err) {
      this.redisFailed(err);
    }
  }
}

// --- Limiters ----------------------------------------------------------------

/** The one 429 every portal limiter sends. Logs the route and kind, never the key. */
function tooMany(name, kind) {
  return (req, res) => {
    console.warn(`[portal-limits] 429 on ${name} (${kind})`);
    res.status(429).json(TOO_MANY);
  };
}

function buildLimiter({ name, kind, limit, windowMs, getClient, keyGenerator, skip, skipSuccessfulRequests = false }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests,
    keyGenerator,
    ...(skip ? { skip } : {}),
    handler: tooMany(name, kind),
    store: new PortalLimitStore({ prefix: `${KEY_PREFIX}${name}:${kind}:`, getClient }),
  });
}

/** Per client address (lib/client-ip.js: TRUST_PROXY, PORTAL_CLIENT_IP_HEADER). */
function createIpLimiter({ name, limit, windowMs, getClient, skipSuccessfulRequests, clientIp = createClientIpGetter() }) {
  return buildLimiter({
    name, kind: 'ip', limit, windowMs, getClient, skipSuccessfulRequests,
    keyGenerator: clientIp,
  });
}

/**
 * Per account: the phone number in the body. A request without one is left to
 * the per-IP limit (the route answers it with a 400 anyway).
 */
function createAccountLimiter({ name, limit, windowMs, getClient, skipSuccessfulRequests }) {
  const phoneOf = (req) => normalisePhone(req.body?.phoneNumber);
  return buildLimiter({
    name, kind: 'account', limit, windowMs, getClient, skipSuccessfulRequests,
    keyGenerator: (req) => accountKey(phoneOf(req)),
    skip: (req) => phoneOf(req) === '',
  });
}

/**
 * Everything the portal router needs, built once from the env.
 *
 * Setup and validate-token are limited per IP only: their "account" is the
 * invite token, a random UUID that is itself the secret. Guessing tokens means
 * trying many different ones, which only a per-IP count can see; counting per
 * token would only slow down the teacher who holds the link.
 *
 * Sign-in does not count successful sign-ins, so a teacher who signs in often
 * — or a school where many teachers share one address — is not locked out.
 * The reset steps count every request: request-reset always answers 200.
 */
function createPortalAuthLimiters({ env = process.env, getClient = getSharedRedisClient } = {}) {
  const l = readPortalAuthLimits(env);
  const w = l.windowMs;
  const clientIp = createClientIpGetter(env);
  return {
    login: [
      createIpLimiter({ name: 'login', limit: l.loginPerIp, windowMs: w, getClient, clientIp, skipSuccessfulRequests: true }),
      createAccountLimiter({ name: 'login', limit: l.loginPerAccount, windowMs: w, getClient, skipSuccessfulRequests: true }),
    ],
    requestReset: [
      createIpLimiter({ name: 'reset-request', limit: l.resetPerIp, windowMs: w, getClient, clientIp }),
      createAccountLimiter({ name: 'reset-request', limit: l.resetPerAccount, windowMs: w, getClient }),
    ],
    verifyResetCode: [
      createIpLimiter({ name: 'reset-verify', limit: l.resetPerIp, windowMs: w, getClient, clientIp }),
      createAccountLimiter({ name: 'reset-verify', limit: l.resetPerAccount, windowMs: w, getClient }),
    ],
    resetPassword: [
      createIpLimiter({ name: 'reset-password', limit: l.resetPerIp, windowMs: w, getClient, clientIp }),
    ],
    setup: [
      createIpLimiter({ name: 'setup', limit: l.setupPerIp, windowMs: w, getClient, clientIp }),
    ],
    validateToken: [
      createIpLimiter({ name: 'validate-token', limit: l.setupPerIp, windowMs: w, getClient, clientIp }),
    ],
  };
}

/** The general per-IP limit on every /api/portal request (index.js). */
function createPortalDataLimiter({ env = process.env, getClient = getSharedRedisClient } = {}) {
  const { dataPerMinute } = readPortalAuthLimits(env);
  return rateLimit({
    windowMs: 60 * 1000,
    limit: dataPerMinute,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: createClientIpGetter(env),
    handler: (req, res) => res.status(429).json({ success: false, error: 'Too many requests. Please slow down.' }),
    store: new PortalLimitStore({ prefix: `${KEY_PREFIX}data:ip:`, getClient }),
  });
}

module.exports = {
  DEFAULTS,
  TOO_MANY,
  PortalLimitStore,
  accountKey,
  createAccountLimiter,
  createIpLimiter,
  createPortalAuthLimiters,
  createPortalDataLimiter,
  normalisePhone,
  readPortalAuthLimits,
  setPortalAuthLimitsRedisClient,
};
