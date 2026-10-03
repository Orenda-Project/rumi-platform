'use strict';
/**
 * THE INBOUND RATE LIMIT — at most INBOUND_RATE_LIMIT_PER_MINUTE messages per
 * sender per rolling minute, checked in handleWebhookPost (the one entry point
 * every channel's inbound adapter dispatches into) before the user lookup and
 * before anything can reach a model.
 *
 * On a public link anyone can open an account, and every message can start
 * paid model calls; without this one account could send without limit. Over the
 * limit the sender gets ONE polite "slow down" per window, then silence until
 * the window rolls on.
 *
 * The identity is the sender as the channel delivers it (a phone number, or a
 * prefixed "mtx:..."/"slack:..." id), so it holds before an account exists.
 *
 * Redis down: an in-process sliding window takes over. It does not fail open —
 * an outage of the cache must not also be an outage of the limit. Each replica
 * then counts on its own, so N replicas allow up to N× the limit until Redis is
 * back; that is still a bound.
 *
 * INBOUND_RATE_LIMIT_PER_MINUTE: default 30; `off` (or 0) turns the limit off.
 * RATE_LIMIT_BYPASS_NUMBERS (comma-separated senders) are never limited.
 * Both are read per call.
 */

const DEFAULT_PER_MINUTE = 30;
const WINDOW_SECONDS = 60;
// A bound on the fallback's memory: past this many senders the oldest go.
const LOCAL_MAX_SENDERS = 10000;

const localHits = new Map();   // sender -> [timestamps in the window]
const localWarned = new Map(); // sender -> warned-until (ms)

/** @returns {number|null} the per-minute limit, or null when switched off */
function limit() {
  const raw = String(process.env.INBOUND_RATE_LIMIT_PER_MINUTE || '').trim().toLowerCase();
  if (!raw) return DEFAULT_PER_MINUTE;
  if (['off', 'false', 'no', '0'].includes(raw)) return null;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_PER_MINUTE;
}

function isBypassed(sender) {
  const list = String(process.env.RATE_LIMIT_BYPASS_NUMBERS || '').split(',').map((s) => s.trim()).filter(Boolean);
  return list.includes(String(sender));
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

function localCount(sender, now) {
  const since = now - WINDOW_SECONDS * 1000;
  const hits = (localHits.get(sender) || []).filter((t) => t > since);
  hits.push(now);
  localHits.delete(sender); // re-insert: the Map's order is least-recently-seen first
  localHits.set(sender, hits);
  if (localHits.size > LOCAL_MAX_SENDERS) localHits.delete(localHits.keys().next().value);
  return hits.length;
}

function localFirstWarning(sender, now) {
  if ((localWarned.get(sender) || 0) > now) return false;
  localWarned.set(sender, now + WINDOW_SECONDS * 1000);
  if (localWarned.size > LOCAL_MAX_SENDERS) localWarned.delete(localWarned.keys().next().value);
  return true;
}

/**
 * Count this message and say whether it may go on.
 *
 * @param {string} sender the channel identity
 * @returns {Promise<{allowed:boolean, notify:boolean, count:number|null, limit:number|null, degraded?:boolean}>}
 *   notify: true for the first refused message of a window (send the "slow down" reply once)
 */
async function admit(sender, { now = Date.now() } = {}) {
  const max = limit();
  if (max === null || !sender || isBypassed(sender)) return { allowed: true, notify: false, count: null, limit: max };

  const r = cache();
  let count = null;
  if (r) {
    const res = await r.checkRateLimit(`inbound:${sender}`, max, WINDOW_SECONDS);
    // checkRateLimit fails open on a Redis error (resetAt null): count locally instead.
    if (res && res.resetAt) count = Number(res.count);
  }
  const degraded = count === null;
  if (degraded) count = localCount(sender, now);
  if (count <= max) return { allowed: true, notify: false, count, limit: max, ...(degraded ? { degraded } : {}) };

  const notify = degraded
    ? localFirstWarning(sender, now)
    : (await r.setNX(`inbound_warned:${sender}`, '1', WINDOW_SECONDS)) === true;
  return { allowed: false, notify, count, limit: max, ...(degraded ? { degraded } : {}) };
}

const SLOW_DOWN = {
  en: "You're sending messages faster than I can answer. Please wait a minute, then send your message again.",
  ur: 'آپ بہت تیزی سے پیغامات بھیج رہے ہیں۔ براہ کرم ایک منٹ انتظار کریں، پھر اپنا پیغام دوبارہ بھیجیں۔',
};

function slowDownMessage(lang) {
  return SLOW_DOWN[lang] || SLOW_DOWN.en;
}

/** Test seam: forget the in-process fallback's counts. */
function _resetLocal() {
  localHits.clear();
  localWarned.clear();
}

module.exports = { admit, limit, slowDownMessage, DEFAULT_PER_MINUTE, WINDOW_SECONDS, _resetLocal };
