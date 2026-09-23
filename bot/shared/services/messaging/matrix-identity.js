/**
 * matrix-identity.js -- shared short/long identity FORMAT codec for the
 * Matrix channel. Pure string logic only (no storage/network) -- the
 * remembered mapping this needs on decode (see below) lives in
 * matrix-channel.service.js, next to its other client.storageProvider-backed
 * caches (dmRoomCache/DM_ROOM_STORAGE_PREFIX), matching this codebase's
 * existing "identity format is pure, storage lives with the client" split.
 *
 * ## Why this exists -- the varchar(20) budget (bug: lesson plan creation
 * failing with "value too long for type character varying(20)")
 *
 * bot/shared/services/lesson-plan-queue.service.js:36 (and several other
 * shared tables -- chat_starts.phone_number, video_quiz_deliveries.phone,
 * failed_operations.user_id, users.phone_number) write the channel-routing
 * identity straight into a `character varying(20)` column sized for a plain
 * phone number. Confirmed against the real local Postgres on 2026-09-22 via:
 *
 *   select table_name, column_name, character_maximum_length
 *   from information_schema.columns
 *   where data_type = 'character varying' and character_maximum_length <= 32
 *     and (column_name ilike '%phone%' or column_name ilike '%user%'
 *          or column_name ilike '%identif%' or column_name ilike '%id');
 *
 * The tightest hits were all varchar(20) (lesson_plan_requests, users,
 * failed_operations, video_quiz_deliveries, dashboard_users). The product
 * owner does not want that schema changed, and does not want other channels
 * touched -- so the fix has to be an identity Matrix itself never emits too
 * long, for the case that actually matters: a teacher whose Matrix username
 * IS their phone number (the product's own stated onboarding path).
 *
 * ## Matrix username shape (revised twice, 2026-09-22 -- see git history)
 *
 * A PURELY numeric Matrix localpart is impossible -- Synapse rejects it, both
 * on public registration and via `register_new_matrix_user` as admin
 * ("M_INVALID_USERNAME: Numeric user IDs are reserved for guest users"),
 * verified live. Synapse DOES accept a leading "+", also verified live
 * (`register_new_matrix_user -u "+923360506129"` succeeded, login works, full
 * id "@+923360506129:localhost") -- and "+<number>" is how a phone number is
 * already written everywhere else in the product (WhatsApp's own shape), so
 * that is the CANONICAL teacher-username convention. A leading "t" (e.g.
 * "t923360506129") is kept as a FALLBACK form -- accounts were already
 * created that way before "+" was confirmed to work, and some other
 * homeserver might reject "+" -- so both are treated as "a phone-number
 * username": a localpart that is either "+" or "t"/"T", then 7-15 digits,
 * nothing else (7 is a generous floor for a short-but-real national number;
 * 15 is E.164's hard ceiling).
 *
 * ## Budget arithmetic
 *
 * The tightest column is varchar(20). The LOCALPART itself can be up to 16
 * characters ("+"/"t" + 15 digits), so naively reusing it in a prefixed
 * identity is already too long: "matrix:" (7) + "@" (1) + 16-char localpart +
 * ":x" (2) is comfortably over 20 before a real domain is even added --
 * "matrix:" is out on its own ("matrix:" + up to 16 = 23).
 *
 * The leading "+"/"t" is only a Synapse registration-syntax requirement, not
 * part of the phone number Rumi actually needs downstream -- so the short
 * wire identity drops it and carries the bare DIGITS, exactly the shape Rumi
 * already expects from WhatsApp:
 *
 *   20 (tightest column)  -  15 (max E.164 digits)  =  5 characters spare
 *                                                       for a prefix+separator
 *   chosen prefix "mtx:"  =  4 characters  ->  4 + 15 = 19 chars, 1 to spare
 *
 * ("mx:" (3 chars, 3+15=18) would leave 2 spare instead of 1 -- also fits,
 * and was suggested as an alternative -- but "mtx:" was kept: it was already
 * wired into channel-registry.js's ALIAS_PREFIXES/driverForIdentifier before
 * this revision, is still comfortably inside the 20-char budget, and reads
 * less like a typo of "mx"/a currency code in a log line.) "mtx:" was picked
 * over the more obvious "matrix:" specifically because "matrix:" alone is 7
 * characters -- 7 + 15 = 22, already over budget by itself even for bare
 * digits, let alone a "+"/"t"-prefixed localpart. It doesn't collide with the
 * "slack"/"discord" prefixes channel-registry.js already reserves in
 * CHANNEL_PREFIXES (see that file's ALIAS_PREFIXES for how it's wired into
 * driverForIdentifier without disturbing prefixFor('matrix'), which stays
 * 'matrix' -- existing tests depend on that).
 *
 * ## The "+" vs "t" ambiguity on DECODE
 *
 * "@+923360506129:localhost" and "@t923360506129:localhost" are DIFFERENT
 * Matrix accounts. Encoding either one to "mtx:923360506129" is lossy by
 * design (that's the whole point -- the wire identity is digits-only), so
 * decoding back must never GUESS which account a given phone number's digits
 * actually belong to when the real answer is already known -- that would
 * silently reply from/to the wrong room if a teacher's account happens to be
 * the "t" form. decodeIdentity() below therefore takes an OPTIONAL
 * `knownLocalpart` -- the exact form (with its "+"/"t") the caller has
 * actually observed for these digits, e.g. via a real inbound message from
 * that account -- and only falls back to the "+<digits>" convention (the
 * canonical form) when nothing is recorded. See
 * matrix-channel.service.js#resolveKnownLocalpart/rememberPhoneLocalpart for
 * where that memory is populated and persisted (mirrors its own
 * dmRoomCache/DM_ROOM_STORAGE_PREFIX two-tier pattern) and
 * matrix-events.adapter.js#toPrefixedIdentity for where it's recorded, at the
 * one place a real account's exact localpart is observed on the way in.
 *
 * Non-phone-shaped localparts (admin accounts, our own test users like
 * "@kamal:localhost" or "@teacher576594:localhost" -- itself alphanumeric,
 * not "+"/"t"+digits-only) are NOT shortened: there is no reversible short
 * form for an arbitrary string that fits the budget, so they keep the
 * existing long "matrix:@user:server" form, which may still overflow the
 * varchar(20) columns on some flows. That is a known, LOUD (logged once at
 * info level), not-silently-swallowed limitation -- teachers should register
 * with their phone number. Truncating instead would be worse: two different
 * long identities that happen to share their first N characters would
 * silently collide, routing a reply to the wrong person.
 */

const SHORT_PREFIX = 'mtx';
const LONG_PREFIX = 'matrix';
// Either "+" (canonical, matches WhatsApp's own phone-number shape) or "t"/"T"
// (fallback -- see this file's header comment) followed by 7-15 digits.
const PHONE_LOCALPART_RE = /^(\+|[tT])(\d{7,15})$/;

// Module-level -- deliberately fires the "may exceed the limit" warning only
// ONCE per process, not once per message, so a chatty non-phone-username
// deployment doesn't spam the log.
let warnedNonPhoneOnce = false;

/** Test-only: lets a fresh test re-trigger the one-time warning. */
function _resetWarnedForTests() {
  warnedNonPhoneOnce = false;
}

/**
 * True/false-shaped check via return value: the digits (no leading "+"/"t")
 * for a Matrix localpart shaped like our phone-number registration
 * convention, or null if it doesn't match. See PHONE_LOCALPART_RE above.
 * @returns {string|null}
 */
function phoneDigitsFromLocalpart(localpart) {
  const match = PHONE_LOCALPART_RE.exec(String(localpart || ''));
  return match ? match[2] : null;
}

/** Splits a full "@<localpart>:<server>" Matrix user id, or returns null if it isn't shaped like one. */
function splitUserId(fullUserId) {
  const raw = String(fullUserId || '');
  if (!raw.startsWith('@')) return null;
  const colonIdx = raw.indexOf(':');
  if (colonIdx <= 1) return null; // no colon, or empty localpart ("@:server")
  return { localpart: raw.slice(1, colonIdx), server: raw.slice(colonIdx + 1) };
}

/** The canonical fallback localpart for a set of phone digits when no real registration form is known -- see this file's header comment ("+" vs "t" ambiguity). */
function defaultLocalpart(digits) {
  return `+${digits}`;
}

/**
 * Encodes a full Matrix user id into the shortest safe wire identity:
 * "mtx:<digits>" (leading "+"/"t" dropped) for a phone-number-shaped
 * localpart, or the existing "matrix:@<localpart>:<server>" long form
 * otherwise. The short form carries the bare phone digits -- the same shape
 * Rumi already gets from WhatsApp -- not the Matrix-only registration syntax.
 *
 * @param {string} fullUserId e.g. "@+923360506129:localhost", "@t923360506129:localhost", or "@kamal:localhost"
 * @param {{ logToFile?: Function }} [deps] structured logger, injected so this
 *   pure-ish module has no hard dependency on the logger's location
 * @returns {string}
 */
function encodeIdentity(fullUserId, deps = {}) {
  const raw = String(fullUserId || '');
  const parsed = splitUserId(raw);
  const digits = parsed ? phoneDigitsFromLocalpart(parsed.localpart) : null;

  if (digits) {
    return `${SHORT_PREFIX}:${digits}`;
  }

  if (!warnedNonPhoneOnce) {
    warnedNonPhoneOnce = true;
    const log = deps.logToFile || (() => {});
    log(
      'ℹ️ Matrix: non-phone-number Matrix username in use -- the long "matrix:@user:server" identity this produces '
      + 'may exceed the 20-character column limit on some flows (lesson plan requests, chat starts, etc), '
      + 'causing those specific writes to fail. Teachers should register with their phone number '
      + '(e.g. +923360506129) as their Matrix username to stay inside the short-identity form.',
      { channel: 'matrix', userId: raw }
    );
  }
  return `${LONG_PREFIX}:${raw}`;
}

/**
 * Decodes a wire identity (long OR short form) back into a full Matrix user
 * id ("@localpart:server"), reconstructing the server name from the bot's own
 * user id -- single-homeserver deployment, no federation, so the domain is
 * always ours.
 *
 * For the short form, the localpart ("+"/"t" + digits) is NOT re-derivable
 * from the digits alone ("+923..." and "t923..." are different accounts --
 * see this file's header comment) -- pass the real observed form as
 * `knownLocalpart` whenever the caller has one; only when it's null/absent
 * does this fall back to the "+<digits>" convention.
 *
 * @param {string} identity e.g. "mtx:923360506129", "matrix:@kamal:localhost", or an already-bare "@user:server"
 * @param {string|null} ownUserId the bot's own full Matrix user id (e.g. "@rumi:localhost") -- only needed to decode the short form
 * @param {string|null} [knownLocalpart] the real localpart (with its "+"/"t") this phone number's account actually has, if known
 * @returns {string} full "@localpart:server" Matrix user id
 * @throws {Error} if given a short-form identity but ownUserId's server name is unknown
 */
function decodeIdentity(identity, ownUserId, knownLocalpart = null) {
  const raw = String(identity || '');

  if (raw.startsWith(`${SHORT_PREFIX}:`)) {
    const digits = raw.slice(SHORT_PREFIX.length + 1);
    const server = String(ownUserId || '').split(':')[1];
    if (!server) {
      throw new Error(
        'matrix-identity: cannot decode short identity "' + raw + '" -- the bot\'s own server name is unknown '
        + '(MATRIX_USER_ID is not set and the connection has not resolved its own user id yet)'
      );
    }
    const localpart = knownLocalpart || defaultLocalpart(digits);
    return `@${localpart}:${server}`;
  }

  if (raw.startsWith(`${LONG_PREFIX}:`)) {
    return raw.slice(LONG_PREFIX.length + 1);
  }

  return raw; // already a bare "@user:server" (or unrecognized) -- pass through unchanged, matching prior behavior
}

module.exports = {
  SHORT_PREFIX,
  LONG_PREFIX,
  PHONE_LOCALPART_RE,
  phoneDigitsFromLocalpart,
  splitUserId,
  defaultLocalpart,
  encodeIdentity,
  decodeIdentity,
  _resetWarnedForTests,
};
