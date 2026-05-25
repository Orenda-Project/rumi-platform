'use strict';
/**
 * Meta 24h window-closed cache (interim fix for).
 *
 * The full fix builds a per-WABA `meta_message_windows` table
 * keyed by (business_phone_id, customer_phone, last_inbound_at) so the
 * window-check is per-WABA and accurate. That's a larger piece of work.
 *
 * This interim shortcut: every time Meta tells us a free interactive
 * message failed with errorCode 131047 ("Re-engagement message — more
 * than 24h since the customer last replied"), we cache that recipient
 * as "window definitely closed" in Redis with a 23h TTL. The next time
 * QuizDeliveryService._hasOpenMessageWindow runs for that phone, this
 * cache short-circuits the (often-stale) chat_sessions check and
 * returns false, so the bot routes through the cold-parent template
 * path — which DOES land per.
 *
 * The current quiz invite is still lost (Meta has already refused it).
 * The next one to that parent will route correctly without trying the
 * free path again. After 23h the cache expires, so if the parent
 * actually re-engages the bot can retry the optimistic free path.
 *
 * Failure modes covered:
 *   - errorCode 131047 — re-engagement / outside 24h window (this is
 *     the bug surfaced during a stress test)
 *
 * Failure modes NOT covered (and don't need to be):
 *   - 131026 "Message undeliverable" — recipient has no WhatsApp; no
 *     fallback path helps. Bot can't fix.
 *   - 131042 / 131049 — payment / frequency cap; tenant-side errors.
 */

const RailwayRedis = require('../cache/railway-redis.service');
const { logToFile } = require('../../utils/logger');

const TTL_SECONDS = 23 * 60 * 60;   // 23h — 1h safety margin on Meta's 24h window
const KEY_PREFIX = 'meta_window_closed:';

/**
 * Normalize a phone number for keying — strip any leading +, return digits.
 * Both `92XXXXXXXXXXX` and `+92XXXXXXXXXXX` map to the same cache slot.
 */
function _normalize(phone) {
  if (!phone) return '';
  return String(phone).startsWith('+') ? String(phone).slice(1) : String(phone);
}

/**
 * Mark a recipient phone as having a closed Meta window. Called from
 * the bot's broadcast-status webhook handler when a 131047 lands.
 */
async function markWindowClosed(phone) {
  const key = KEY_PREFIX + _normalize(phone);
  try {
    if (typeof RailwayRedis.set === 'function') {
      await RailwayRedis.set(key, '1', TTL_SECONDS);
    } else if (RailwayRedis.redis && typeof RailwayRedis.redis.setex === 'function') {
      await RailwayRedis.redis.setex(key, TTL_SECONDS, '1');
    }
    logToFile('🚫 Meta window flagged as closed (131047 cache)', { phone: String(phone).slice(-4), ttl: TTL_SECONDS });
  } catch (err) {
    logToFile('⚠️ Could not write meta_window_closed flag (non-fatal)', { phone: String(phone).slice(-4), error: err.message });
  }
}

/**
 * Returns true if we have recently seen a 131047 from Meta for this phone.
 * On any Redis error, returns false so the caller falls back to the
 * existing chat_sessions check — never blocks delivery on cache failure.
 */
async function isWindowClosed(phone) {
  const key = KEY_PREFIX + _normalize(phone);
  try {
    let val;
    if (typeof RailwayRedis.get === 'function') {
      val = await RailwayRedis.get(key);
    } else if (RailwayRedis.redis && typeof RailwayRedis.redis.get === 'function') {
      val = await RailwayRedis.redis.get(key);
    }
    return !!val;
  } catch (err) {
    logToFile('⚠️ Could not read meta_window_closed flag (treating as not-set)', { phone: String(phone).slice(-4), error: err.message });
    return false;
  }
}

module.exports = {
  markWindowClosed,
  isWindowClosed,
  // exported for tests
  _normalize,
  _TTL_SECONDS: TTL_SECONDS,
  _KEY_PREFIX: KEY_PREFIX
};
