'use strict';
/**
 * DAILY CAPS BY ACCOUNT TIER — how much one account may ask of Rumi in a school
 * day (SCHOOL_TIMEZONE, config/school-clock.js).
 *
 * A public deployment lets anyone open an account. An account that has not
 * finished registration ("unregistered": users.registration_completed is not
 * true) gets a small daily allowance; a registered teacher gets the
 * deployment's ordinary one. Every cap is an env var, and an EMPTY one means
 * no cap, so a deployment that sets none behaves exactly as before:
 *
 *   DAILY_MESSAGE_CAP_UNREGISTERED      inbound messages a day
 *   DAILY_MESSAGE_CAP_REGISTERED        inbound messages a day
 *   DAILY_LESSON_PLAN_CAP_UNREGISTERED  lesson plans / presentations a day
 *   DAILY_LESSON_PLAN_CAP_REGISTERED    lesson plans / presentations a day
 *   DAILY_LESSON_PLAN_CAP_TOTAL         lesson plans / presentations a day for the
 *                                       whole instance, every account together
 *   DAILY_COACHING_CAP_UNREGISTERED     classroom recordings sent for coaching a day
 *   DAILY_QUIZ_CAP_UNREGISTERED         quizzes made a day (QUIZ_DAILY_CAP still bounds everyone)
 *
 * 0 means none at all (e.g. no coaching until registration is finished).
 *
 * Counted with one INCR per claim on `dailycap:<kind>:<user>:<school date>`,
 * and for a total cap on `dailycap:<kind>:total:<school date>` (only claims
 * the account's own cap let through count toward it). Redis down: an
 * in-process counter takes over (each replica counts on its own) rather than
 * failing open.
 */

const SchoolClock = require('../../config/school-clock');

const TTL_SECONDS = 36 * 60 * 60;
const LOCAL_MAX_KEYS = 20000;

const KINDS = Object.freeze({
  message: { unregistered: 'DAILY_MESSAGE_CAP_UNREGISTERED', registered: 'DAILY_MESSAGE_CAP_REGISTERED' },
  lesson_plan: { unregistered: 'DAILY_LESSON_PLAN_CAP_UNREGISTERED', registered: 'DAILY_LESSON_PLAN_CAP_REGISTERED', total: 'DAILY_LESSON_PLAN_CAP_TOTAL' },
  coaching: { unregistered: 'DAILY_COACHING_CAP_UNREGISTERED' },
  quiz: { unregistered: 'DAILY_QUIZ_CAP_UNREGISTERED' },
});

const localCounts = new Map();

/** @returns {'registered'|'unregistered'} */
function tierOf(user) {
  return user && user.registration_completed === true ? 'registered' : 'unregistered';
}

/** @returns {number|null} the cap for this kind and tier ('total' = the whole instance), null = no cap */
function capFor(kind, tier) {
  const envKey = KINDS[kind] && KINDS[kind][tier];
  if (!envKey) return null;
  const raw = String(process.env[envKey] || '').trim().toLowerCase();
  if (!raw || ['off', 'none', 'unlimited'].includes(raw)) return null;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
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

async function count(key) {
  const r = cache();
  let n = r ? await r.incr(key) : null;
  const degraded = n === null || n === undefined;
  if (degraded) n = localIncr(key);
  else if (n === 1) await r.expire(key, TTL_SECONDS);
  return { n: Number(n), degraded };
}

function localIncr(key) {
  const n = (localCounts.get(key) || 0) + 1;
  localCounts.set(key, n);
  if (localCounts.size > LOCAL_MAX_KEYS) localCounts.delete(localCounts.keys().next().value);
  return n;
}

/**
 * Count one use of `kind` for this account and say whether it fits today's cap.
 *
 * @param {object|null} user the users row (needs id and registration_completed)
 * @param {'message'|'lesson_plan'|'coaching'|'quiz'} kind
 * @returns {Promise<{allowed:boolean, first:boolean, count:number|null, limit:number|null, tier:string, scope?:'total', degraded?:boolean}>}
 *   first: true for the first refused use of the day (tell the teacher once, then stay quiet)
 *   scope: 'total' when the instance-wide cap refused it
 */
async function claim(user, kind, { now = new Date() } = {}) {
  const tier = tierOf(user);
  const limit = capFor(kind, tier);
  const day = SchoolClock.localDate(now);
  let out = { allowed: true, first: false, count: null, limit, tier };

  if (limit !== null && user && user.id) {
    const { n, degraded } = await count(`dailycap:${kind}:${user.id}:${day}`);
    out = { allowed: n <= limit, first: n === limit + 1, count: n, limit, tier };
    if (degraded) out.degraded = true;
    if (!out.allowed) return out;
  }

  const totalLimit = capFor(kind, 'total');
  if (totalLimit === null) return out;
  const { n, degraded } = await count(`dailycap:${kind}:total:${day}`);
  if (n <= totalLimit) return degraded ? { ...out, degraded } : out;
  const refused = { allowed: false, first: n === totalLimit + 1, count: n, limit: totalLimit, tier, scope: 'total' };
  return degraded ? { ...refused, degraded } : refused;
}

const MESSAGES = {
  message: {
    unregistered: (n) => `You've reached today's limit of ${n} messages. Finish registering (send /register) to keep chatting, or come back tomorrow.`,
    registered: (n) => `You've reached today's limit of ${n} messages. Please come back tomorrow.`,
  },
  lesson_plan: {
    unregistered: (n) => (n === 0
      ? 'Lesson plans are available once you finish registering. Send /register to finish, then ask again.'
      : `You've made ${n} lesson plan${n === 1 ? '' : 's'} today, the daily limit before registration. Send /register to finish registering, or ask again tomorrow.`),
    registered: (n) => `You've made ${n} lesson plan${n === 1 ? '' : 's'} today, the daily limit. Please ask again tomorrow.`,
    total: () => 'Rumi has made all the lesson plans it can today. Please ask again tomorrow.',
  },
  coaching: (n) => (n === 0
    ? 'Classroom coaching is available once you finish registering. Send /register to finish, then send your recording again.'
    : `You've sent ${n} recording${n === 1 ? '' : 's'} for coaching today, the daily limit before registration. Send /register to finish registering, or try again tomorrow.`),
  quiz: (n) => (n === 0
    ? 'Quizzes are available once you finish registering. Send /register to finish, then ask again.'
    : `You've made ${n} quiz${n === 1 ? '' : 'zes'} today, the daily limit before registration. Send /register to finish registering, or ask again tomorrow.`),
};

/** The reply for a refused claim. */
function capMessage(kind, { limit, tier, scope }) {
  const m = MESSAGES[kind];
  if (typeof m === 'function') return m(limit);
  return (m[scope] || m[tier] || m.unregistered)(limit);
}

/**
 * Claim `kind` for a request the teacher just made and, when it is over the
 * cap, tell them (every time: they asked for this one thing). Never throws: a
 * cap that cannot be read lets the request through.
 *
 * @returns {Promise<boolean>} true = go ahead
 */
async function allowOrExplain(user, kind, to) {
  let res;
  try {
    res = await claim(user, kind);
  } catch (_) {
    return true;
  }
  if (res.allowed) return true;
  try {
    const { logToFile } = require('../../utils/logger');
    logToFile('🚧 Daily cap reached', { kind, tier: res.tier, limit: res.limit, userId: user && user.id });
    await require('../whatsapp.service').sendMessage(to, capMessage(kind, res));
  } catch (_) { /* the refusal stands even if the explanation could not be sent */ }
  return false;
}

/**
 * allowOrExplain for a path that holds only the account id: reads the tier
 * first, and only when the operator set a cap for this kind. An unreadable
 * account is let through its own cap; a total cap still counts it.
 */
async function allowOrExplainForUserId(userId, kind, to) {
  if (!userId || Object.keys(KINDS[kind] || {}).every((tier) => capFor(kind, tier) === null)) return true;
  let account = null;
  try {
    const supabase = require('../../config/supabase');
    const { data } = await supabase.from('users').select('id, registration_completed').eq('id', userId).maybeSingle();
    account = data || null;
  } catch (_) {
    account = null;
  }
  return allowOrExplain(account, kind, to);
}

/** Test seam: forget the in-process fallback's counts. */
function _resetLocal() {
  localCounts.clear();
}

module.exports = { claim, allowOrExplain, allowOrExplainForUserId, capFor, tierOf, capMessage, KINDS, _resetLocal };
