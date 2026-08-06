/**
 * Pending numbered-option menus, so a plain-text numeric reply can be turned
 * back into the interactive reply the bot's router already understands.
 *
 * Why this exists: Meta's WhatsApp Cloud API has native buttons and list
 * pickers, and bot/whatsapp-bot.js dispatches on the resulting
 * `interactive.button_reply.id` / `interactive.list_reply.id` (33 distinct ID
 * families — coaching_confirm_*, lang_*, style_*, quiz_*, …). Baileys has no
 * reliable equivalent, so baileys-channel.service.js renders those menus as
 * numbered plain text ("1. English", "2. اردو", …).
 *
 * That is only half a feature: without this store the user's "1" arrives as an
 * ordinary text message, never matches the interactive branches, and falls
 * through to general AI chat — the menu is displayed but unanswerable. So when
 * the driver renders a menu it records the offered {number -> option} mapping
 * here, and the inbound adapter consults it to synthesise the exact payload
 * Meta would have produced. Dispatch logic stays untouched.
 *
 * Storage mirrors session.service.js: Redis-backed (so a menu survives the
 * process restart a PaaS redeploy causes mid-conversation) with an in-memory
 * fallback, and a TTL so a stale menu can't hijack a much later "1".
 *
 * @module pending-options
 */

const { logToFile } = require('../../utils/logger');

/**
 * Redis is required LAZILY, not at module load. railway-redis.service.js opens
 * its connection on require, and this module is pulled in by
 * baileys-channel.service.js — so a top-level require would mean merely loading
 * the channel driver (as several tests and `rumi doctor` do) eagerly dials
 * Redis and keeps the event loop alive. Same lazy-client convention as
 * shared/storage/r2.js and baileys-connection.js's lazy `baileys` import.
 */
function redis() {
  // eslint-disable-next-line global-require -- deliberate: see comment above
  return require('../cache/railway-redis.service');
}

const KEY_PREFIX = 'baileys:pending-options:';
/** Long enough for a user to read and answer; short enough that a stale menu expires. */
const TTL_SECONDS = 30 * 60;

/** In-memory fallback, used when Redis is unavailable. Map<phone, {expiresAt, menu}>. */
const memory = new Map();

function keyFor(phoneNumber) {
  return `${KEY_PREFIX}${phoneNumber}`;
}

function pruneMemory(now = Date.now()) {
  for (const [phone, entry] of memory) {
    if (entry.expiresAt <= now) memory.delete(phone);
  }
}

/**
 * @typedef {object} PendingMenu
 * @property {'button_reply'|'list_reply'} replyType which interactive shape to synthesise
 * @property {Array<{id: string, title: string}>} options in the SAME order they were rendered,
 *   so option N corresponds to the user typing N.
 */

/**
 * Records the menu just rendered to this user, replacing any previous one.
 * Best-effort: a storage failure must never break the outbound send that
 * triggered it, so this only logs.
 *
 * @param {string} phoneNumber
 * @param {PendingMenu} menu
 */
async function remember(phoneNumber, menu) {
  if (!phoneNumber || !menu?.options?.length) return;

  const payload = { replyType: menu.replyType, options: menu.options };
  memory.set(phoneNumber, { expiresAt: Date.now() + TTL_SECONDS * 1000, menu: payload });
  pruneMemory();

  try {
    // NOTE: railway-redis.service.set() RETURNS FALSE rather than throwing when
    // Redis isn't ready — so a try/catch alone is blind to the failure. Check
    // the boolean too, or a silently-unpersisted menu looks like a success and
    // only shows up as "the user's numeric reply did nothing after a restart".
    const stored = await redis().set(keyFor(phoneNumber), JSON.stringify(payload), TTL_SECONDS);
    if (stored === false) {
      logToFile('⚠️ pending-options: Redis unavailable — menu kept in memory only (lost on restart)', { phoneNumber });
    }
  } catch (error) {
    logToFile('⚠️ pending-options: Redis write failed, using in-memory only', { error: error.message });
  }
}

/**
 * @param {string} phoneNumber
 * @returns {Promise<PendingMenu|null>}
 */
async function get(phoneNumber) {
  if (!phoneNumber) return null;

  try {
    const raw = await redis().get(keyFor(phoneNumber));
    if (raw) return typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch (error) {
    logToFile('⚠️ pending-options: Redis read failed, falling back to memory', { error: error.message });
  }

  pruneMemory();
  return memory.get(phoneNumber)?.menu || null;
}

/** Clears the menu once answered, so the same "1" can't be replayed. */
async function clear(phoneNumber) {
  if (!phoneNumber) return;
  memory.delete(phoneNumber);
  try {
    await redis().delete(keyFor(phoneNumber));
  } catch (error) {
    logToFile('⚠️ pending-options: Redis delete failed', { error: error.message });
  }
}

/** Lowercased, whitespace-collapsed, punctuation-trimmed — for comparing labels. */
function normalize(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/[.,!?)("']/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Every string that identifies this option.
 *
 * A label may be a composite "Group · Item" (the video picker prefixes a chapter
 * onto the title), so each half counts as a label in its own right — what a
 * person reads and types back is the part that identifies the item. Live testing
 * caught exactly this: typing "Life Cycle of a Butterfly" for "Life Cycles of
 * Living Things · Life Cycle of a Butterfly" matched nothing.
 */
function labelsFor(option) {
  const labels = [];
  for (const source of [option.title, option.description]) {
    const whole = normalize(source);
    if (!whole) continue;
    labels.push(whole);
    if (whole.includes('·')) {
      for (const part of whole.split('·')) {
        const segment = normalize(part);
        if (segment) labels.push(segment);
      }
    }
  }
  return labels;
}

/**
 * Maps a raw user reply to the option it selected, or null if it isn't a
 * selection at all.
 *
 * Accepts a NUMBER **or** the option's name, because requiring a number is
 * unrealistic — people naturally type "Urdu" or "english" when shown a list of
 * languages. Matching order, most explicit first:
 *   1. a bare number in range                       → "2"
 *   2. exact label match on title or description    → "english", "Urdu language"
 *   3. exact match on a "A · B" segment             → "Life Cycle of a Frog"
 *   4. exact match on the description's first word  → "urdu" (from "Urdu language")
 *   5. UNIQUE prefix match (≥3 chars) on either     → "eng" → English
 *   6. UNIQUE substring match (≥4 chars) on either  → "butterfly" → the one video
 *
 * Still deliberately conservative, because a pending menu does NOT mean the user
 * is answering it — they may just be talking. So: 1–2 char inputs never match by
 * text (too collision-prone), and an ambiguous prefix matching several options
 * matches nothing rather than guessing. Anything unmatched falls through to
 * normal text handling.
 *
 * @param {PendingMenu|null} menu
 * @param {string} text
 * @returns {{id: string, title: string}|null}
 */
function resolveSelection(menu, text) {
  if (!menu?.options?.length || typeof text !== 'string') return null;

  const raw = text.trim();
  if (!raw) return null;

  // 1. Numeric choice — the position in the rendered list. An in-range number
  // always wins, because that is exactly what the "1. / 2. / 3." prompt asked
  // for. Out of range, though, we do NOT give up: the digits may be the option's
  // NAME. Live case — a class list ["4 - B", "5"], where the teacher replying
  // "5" means the class called 5, not item five of two. Returning null there
  // sent the reply to general AI chat and the quiz stalled with no explanation.
  if (/^\d+$/.test(raw)) {
    const index = Number.parseInt(raw, 10) - 1;
    if (index >= 0 && index < menu.options.length) return menu.options[index];
  }

  const needle = normalize(raw);

  // Short replies are normally too collision-prone to match by text (a pending
  // menu does not mean every message answers it). A DIGITS-ONLY reply is the
  // exception: it was plainly aimed at the numbered list, so if it wasn't a
  // valid position, accept it only as an EXACT name — precise enough to be safe
  // at one character ("5" → the class named 5).
  if (needle.length < 3) {
    if (!/^\d+$/.test(needle)) return null;
    const named = menu.options.filter((o) => labelsFor(o).includes(needle));
    if (named.length === 1) return named[0];
    // …or the leading token of a label, so "4" picks the class "4 - B". Still
    // unique-or-nothing: with both "4 - A" and "4 - B" on offer, "4" is genuinely
    // ambiguous and must not be guessed at.
    const leading = menu.options.filter((o) => labelsFor(o).some((l) => l.split(' ')[0] === needle));
    return leading.length === 1 ? leading[0] : null;
  }

  // 2/3. Exact match on a whole label or on one of its "·" segments.
  const exact = menu.options.filter((o) => labelsFor(o).includes(needle));
  if (exact.length === 1) return exact[0];

  // 4. First word of a label ("urdu" from "Urdu language").
  const firstWord = menu.options.filter((o) => labelsFor(o).some((l) => l.split(' ')[0] === needle));
  if (firstWord.length === 1) return firstWord[0];

  // 5. Unique prefix match — ambiguity deliberately resolves to nothing.
  const prefix = menu.options.filter((o) => labelsFor(o).some((l) => l.startsWith(needle)));
  if (prefix.length === 1) return prefix[0];

  // 6. Unique substring match. Last and least explicit, so it demands 4+ chars:
  // people quote the distinctive middle of a long title ("butterfly") rather
  // than retyping all of it. Ambiguity still resolves to nothing.
  if (needle.length >= 4) {
    const substring = menu.options.filter((o) => labelsFor(o).some((l) => l.includes(needle)));
    if (substring.length === 1) return substring[0];
  }

  return null;
}

/** Test-only: drops the in-memory fallback contents. */
function _resetForTests() {
  memory.clear();
}

module.exports = {
  remember, get, clear, resolveSelection, TTL_SECONDS, _resetForTests,
};
