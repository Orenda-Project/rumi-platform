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
 * Media (image, document, audio, voice, video, sticker) counts in its own,
 * larger bucket. Media is what a teacher legitimately sends in bulk — the exam
 * checker asks for a class set of photos "all at once", often more than 30 —
 * and a refused message is already marked processed, so it is lost for good.
 * A photo reaches a model only through a feature that the daily caps and the
 * model budget breaker already bound.
 *
 * Redis down: an in-process sliding window takes over. It does not fail open —
 * an outage of the cache must not also be an outage of the limit. Each replica
 * then counts on its own, so N replicas allow up to N× the limit until Redis is
 * back; that is still a bound.
 *
 * INBOUND_RATE_LIMIT_PER_MINUTE (text and everything else): default 30.
 * INBOUND_MEDIA_RATE_LIMIT_PER_MINUTE (media): default 120.
 * `off` (or 0) turns that bucket off.
 * RATE_LIMIT_BYPASS_NUMBERS (comma-separated senders) are never limited.
 * All are read per call.
 */

const DEFAULT_PER_MINUTE = 30;
const DEFAULT_MEDIA_PER_MINUTE = 120;
const WINDOW_SECONDS = 60;
// A bound on the fallback's memory: past this many senders the oldest go.
const LOCAL_MAX_SENDERS = 10000;

const BUCKETS = {
  text: { env: 'INBOUND_RATE_LIMIT_PER_MINUTE', fallback: DEFAULT_PER_MINUTE, key: 'inbound', warnKey: 'inbound_warned' },
  media: { env: 'INBOUND_MEDIA_RATE_LIMIT_PER_MINUTE', fallback: DEFAULT_MEDIA_PER_MINUTE, key: 'inbound_media', warnKey: 'inbound_media_warned' },
};
const MEDIA_TYPES = new Set(['image', 'document', 'audio', 'voice', 'video', 'sticker']);

const localHits = new Map();   // "<bucket key>:<sender>" -> [timestamps in the window]
const localWarned = new Map(); // "<bucket key>:<sender>" -> warned-until (ms)

/** @returns {'media'|'text'} the bucket a message of this channel type counts in */
function kindOf(messageType) {
  return MEDIA_TYPES.has(messageType) ? 'media' : 'text';
}

/** @returns {number|null} the per-minute limit for a bucket, or null when switched off */
function limit(kind = 'text') {
  const bucket = BUCKETS[kind] || BUCKETS.text;
  const raw = String(process.env[bucket.env] || '').trim().toLowerCase();
  if (!raw) return bucket.fallback;
  if (['off', 'false', 'no', '0'].includes(raw)) return null;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : bucket.fallback;
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

function localCount(id, now) {
  const since = now - WINDOW_SECONDS * 1000;
  const hits = (localHits.get(id) || []).filter((t) => t > since);
  hits.push(now);
  localHits.delete(id); // re-insert: the Map's order is least-recently-seen first
  localHits.set(id, hits);
  if (localHits.size > LOCAL_MAX_SENDERS) localHits.delete(localHits.keys().next().value);
  return hits.length;
}

function localFirstWarning(id, now) {
  if ((localWarned.get(id) || 0) > now) return false;
  localWarned.set(id, now + WINDOW_SECONDS * 1000);
  if (localWarned.size > LOCAL_MAX_SENDERS) localWarned.delete(localWarned.keys().next().value);
  return true;
}

/**
 * Count this message and say whether it may go on.
 *
 * @param {string} sender the channel identity
 * @param {object} [opts]
 * @param {'text'|'media'} [opts.kind] the bucket (kindOf(messageType)); text by default
 * @returns {Promise<{allowed:boolean, notify:boolean, count:number|null, limit:number|null, degraded?:boolean}>}
 *   notify: true for the first refused message of a window (send the "slow down" reply once)
 */
async function admit(sender, { kind = 'text', now = Date.now() } = {}) {
  const max = limit(kind);
  if (max === null || !sender || isBypassed(sender)) return { allowed: true, notify: false, count: null, limit: max };

  const bucket = BUCKETS[kind] || BUCKETS.text;
  const id = `${bucket.key}:${sender}`;
  const r = cache();
  let count = null;
  if (r) {
    const res = await r.checkRateLimit(id, max, WINDOW_SECONDS);
    // checkRateLimit fails open on a Redis error (resetAt null): count locally instead.
    if (res && res.resetAt) count = Number(res.count);
  }
  const degraded = count === null;
  if (degraded) count = localCount(id, now);
  if (count <= max) return { allowed: true, notify: false, count, limit: max, ...(degraded ? { degraded } : {}) };

  const notify = degraded
    ? localFirstWarning(id, now)
    : (await r.setNX(`${bucket.warnKey}:${sender}`, '1', WINDOW_SECONDS)) === true;
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

module.exports = { admit, limit, kindOf, slowDownMessage, DEFAULT_PER_MINUTE, DEFAULT_MEDIA_PER_MINUTE, WINDOW_SECONDS, _resetLocal };
