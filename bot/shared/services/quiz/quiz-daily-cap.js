'use strict';
/**
 * THE RUNAWAY GUARD — at most QUIZ_DAILY_CAP quizzes made per teacher per
 * SCHOOL day (SCHOOL_TIMEZONE, config/school-clock.js), every source (transcript,
 * lesson plan, topic), counted where every path meets: the generate step, before
 * any model call.
 *
 * One teacher tapping every lesson in /quiz would otherwise author one quiz per
 * tap (a few cents each: three attempts and a blind solve). The cap is a bound on
 * cost, not a product limit: the default (10) is far above what a class uses.
 *
 * Counted per QUIZ, not per job: the set `quizcap:<teacher>:<school date>` holds
 * quiz ids, so a redelivered job (at-least-once queues) never counts twice. The
 * add-and-check is one Lua script, so two replicas cannot both take the last slot.
 *
 * FAILS OPEN. Redis down → the quiz is made (the guard is a bound, never the
 * reason a teacher who asked gets nothing). QUIZ_DAILY_CAP=off (or 0) turns it off.
 */

const SchoolClock = require('../../config/school-clock');

const DEFAULT_CAP = 10;
const TTL_SECONDS = 36 * 60 * 60;

/** @returns {number|null} the cap, or null when switched off */
function cap() {
  const raw = String(process.env.QUIZ_DAILY_CAP || '').trim().toLowerCase();
  if (!raw) return DEFAULT_CAP;
  if (['off', 'false', 'no', '0'].includes(raw)) return null;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_CAP;
}

/** `YYYY-MM-DD` of `now` on the school's calendar — the cap's bucket. */
function schoolDate(now = new Date()) {
  return SchoolClock.localDate(now);
}

// KEYS[1] the set, ARGV[1] quiz id, ARGV[2] cap, ARGV[3] ttl.
// Returns the count including this quiz, or -count when this quiz is over the cap.
const CLAIM_LUA = `
local added = redis.call('SADD', KEYS[1], ARGV[1])
local n = redis.call('SCARD', KEYS[1])
if added == 1 and n > tonumber(ARGV[2]) then
  redis.call('SREM', KEYS[1], ARGV[1])
  return -(n - 1)
end
redis.call('EXPIRE', KEYS[1], tonumber(ARGV[3]))
return n
`;

/**
 * Run one script on the shared cache. The cache service has no script helper of
 * its own, so this uses its ioredis client (`.redis`) when the service reports
 * itself available. Any failure is null — the caller fails open.
 */
async function evalOnCache(script, keys, args) {
  let r;
  try {
    // eslint-disable-next-line global-require
    r = require('../cache/railway-redis.service');
  } catch (_) {
    return null;
  }
  try {
    if (typeof r.evalScript === 'function') return await r.evalScript(script, keys, args);
    if (!r || typeof r.isAvailable !== 'function' || !r.isAvailable() || !r.redis) return null;
    return await r.redis.eval(script, keys.length, ...keys, ...args);
  } catch (_) {
    return null;
  }
}

/**
 * @param {{now?: Date, tierCap?: number|null}} [opts] tierCap: a lower cap for
 *   this teacher's account tier (limits/daily-caps.js; 0 = none) — the smaller wins
 * @returns {Promise<{allowed:boolean, count:number|null, limit:number|null, degraded?:boolean}>}
 */
async function claim(teacherId, quizId, { now = new Date(), tierCap = null } = {}) {
  const base = cap();
  const limit = tierCap === null || tierCap === undefined ? base : (base === null ? tierCap : Math.min(base, tierCap));
  if (limit === null || !teacherId || !quizId) return { allowed: true, count: null, limit };
  const res = await evalOnCache(CLAIM_LUA, [`quizcap:${teacherId}:${schoolDate(now)}`], [String(quizId), limit, TTL_SECONDS]);
  if (res === null || res === undefined) return { allowed: true, count: null, limit, degraded: true };
  const n = Number(res);
  return n < 0 ? { allowed: false, count: -n, limit } : { allowed: true, count: n, limit };
}

module.exports = { cap, claim, schoolDate, DEFAULT_CAP, CLAIM_LUA };
