/**
 * Matrix connection manager -- the ONE place that owns the persistent Matrix
 * sync connection. Mirrors discord-connection.js's role exactly (a single
 * shared client, exposed via getClient()): matrix-channel.service.js (the
 * outbound driver) and matrix-events.adapter.js (the inbound listener) both
 * share this ONE client instance -- a second `new MatrixClient()` against the
 * same access token would run a second, redundant /sync loop against the
 * homeserver, which is wasteful and (with E2EE on) actively harmful: two
 * processes racing the same Olm/Megolm session state corrupts the crypto
 * store, not just double-delivers messages.
 *
 * `matrix-bot-sdk` is loaded LAZILY, inside connect(), matching this repo's
 * existing lazy-client convention (see discord-connection.js's own header
 * comment, and shared/storage/r2.js's lazyClient) -- requiring this file never
 * touches the real `matrix-bot-sdk` package or opens a sync connection; only
 * connect()/getClient() do.
 *
 * E2EE (MATRIX_E2EE, default/"auto" = try, degrade quietly on failure):
 * matrix-bot-sdk only makes encryption functional when a crypto storage
 * provider is passed to the MatrixClient constructor (its own doc comment:
 * "If not supplied, end-to-end encryption will not be functional in this
 * client."). That provider (RustSdkCryptoStorageProvider) needs a
 * `StoreType` enum value -- and that enum is exported by the separate native
 * package `@matrix-org/matrix-sdk-crypto-nodejs` itself
 * (`require('@matrix-org/matrix-sdk-crypto-nodejs').StoreType`), NOT by
 * `matrix-bot-sdk` -- matrix-bot-sdk@0.8.0's own exports are `CryptoClient`,
 * `requiresCrypto`, `RustSdkCryptoStorageProvider`,
 * `RustSdkAppserviceCryptoStorageProvider` and nothing named `StoreType` at
 * all (confirmed against the installed package; an earlier version of this
 * file imported it from the wrong package, which threw
 * "Cannot read properties of undefined (reading 'Sqlite')" on every host and
 * was then swallowed by an over-broad catch as a misleading "missing native
 * binary" message -- exactly backwards, since that was a code bug, not an
 * environment fact).
 *
 * `@matrix-org/matrix-sdk-crypto-nodejs` ships prebuilt binaries per
 * platform/Node ABI and has no source fallback, and its own package.json
 * declares `engines.node: ">=24"` (NOT >=22 -- a wrong claim in an earlier
 * version of this comment; verified against the actual installed
 * package.json) -- so it IS a genuine "can be absent on an older host"
 * dependency, just not the only failure mode. buildCryptoProvider()
 * therefore distinguishes the two:
 *   - MODULE_NOT_FOUND (the package is genuinely absent, e.g. Node <24 or no
 *     matching prebuild) → logged as a warning, a real environment fact.
 *   - anything else (wrong API usage, a corrupted store, ...) → logged at
 *     ERROR level with the real message/code/stack, because that is a BUG,
 *     not an environment limitation, and must never look like the quiet
 *     "expected" case above.
 * In BOTH cases, if MATRIX_E2EE was explicitly set to "on", startup FAILS
 * (throws) instead of silently downgrading -- an operator who explicitly
 * asked for encryption must be told it didn't happen, not handed a silent
 * plaintext fallback. Only MATRIX_E2EE unset/"auto" downgrades quietly.
 * `MATRIX_E2EE=off` skips the attempt entirely.
 *
 * `events` is the one place to observe connection lifecycle, mirroring
 * discord-connection.js's/baileys-connection.js's own `events` emitter.
 *
 * Serialized/retried account data (crash fix, 2026-09-22): matrix-bot-sdk's
 * own `client.dms` (constructed inside its MatrixClient constructor --
 * matrix-bot-sdk/lib/MatrixClient.js -- not something this file opts into)
 * attaches an internal `room.invite` listener
 * (`this.client.on("room.invite", (rid, ev) => this.handleInvite(rid, ev))`,
 * matrix-bot-sdk/lib/DMs.js) with NO try/catch of its own around
 * `await this.persistCache()`, which does a bare
 * `await this.client.setAccountData('m.direct', obj)`. A burst of pending
 * invites (AutojoinRoomsMixin joins them all in parallel) fires that
 * listener once per invite, i.e. N concurrent PUTs to the SAME account-data
 * row -- Postgres aborts the losing transactions with a
 * SerializationFailure, Synapse turns that into a 500, and the rejection
 * from `setAccountData` has nothing in matrix-bot-sdk (or in our own code)
 * catching it: it comes straight out of an EventEmitter listener callback,
 * i.e. an unhandled rejection that killed the whole Node process (reproduced
 * live -- see the PR/commit this comment shipped with).
 *
 * Our own welcome-DM "greeted" marker (org.rumi.messenger.greeted, see
 * matrix-events.adapter.js#markGreeted) writes account data the same way and
 * is exposed to the identical contention during a join burst.
 *
 * wrapSetAccountDataSerialized() is the seam: it replaces the live client's
 * OWN `setAccountData` with a version that (1) serializes every call -- ours
 * and the SDK's internal ones alike -- through one plain promise chain (no
 * new dependency), so no two writes to the account-data store are ever
 * in-flight at once, and (2) retries a failing write a few times with a
 * short backoff, since a SerializationFailure is transient by construction
 * (Postgres aborts one of two racing transactions; a retry against the now-
 * quiescent row succeeds). Patching the client's own method -- rather than
 * adding a global `process.on('unhandledRejection', ...)` -- means only
 * Matrix account-data writes are affected; an unrelated bug elsewhere in the
 * bot still crashes loudly, as it should. After retries are exhausted the
 * wrapped function LOGS and SWALLOWS the error instead of rejecting --
 * account data here is inherently best-effort and self-healing on the next
 * call (see DMs.fixDms/hasBeenGreeted, which never trust a stale entry
 * blindly) -- and, critically, a promise it hands back to the SDK's
 * `persistCache()`/our own `markGreeted()` must never reject, because both
 * callers have no catch of their own around that await.
 */

const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');
const { logToFile } = require('../../utils/logger');

let client = null;
let clientPromise = null;
let cachedUserId = null;
let cryptoEnabled = false;
const events = new EventEmitter();
const connectionState = { connected: false };

// Set by close() so a sync-loop error firing during intentional shutdown is
// not mistaken for a real problem worth logging loudly -- mirrors
// baileys-connection.js's/discord-connection.js's own `shuttingDown` flag.
let shuttingDown = false;

/**
 * "off" (explicit) | "on" (explicit) | "auto" (unset or any other value --
 * treated as "try, but never fail startup over it"). Kept as three states,
 * not a boolean, because "explicitly on" and "auto" now behave differently
 * on failure (see file header) -- collapsing them the way an earlier version
 * of this file did is exactly what made a real bug look like an expected
 * environment condition.
 */
function e2eeMode() {
  const raw = (process.env.MATRIX_E2EE || '').trim().toLowerCase();
  if (raw === 'off') return 'off';
  if (raw === 'on') return 'on';
  return 'auto';
}

function storageDir() {
  return process.env.MATRIX_STORAGE_DIR || './.matrix-storage';
}

/**
 * Builds the crypto storage provider for E2EE, or null when E2EE is off or
 * (in "auto" mode only) the crypto module couldn't be loaded on this host.
 * Throws when MATRIX_E2EE=on was set explicitly and the provider could not
 * be built for ANY reason -- see file header for the full policy.
 */
function buildCryptoProvider(dir) {
  const mode = e2eeMode();
  if (mode === 'off') {
    logToFile('ℹ️ Matrix: MATRIX_E2EE=off -- starting without end-to-end encryption', {});
    return null;
  }

  try {
    // eslint-disable-next-line global-require -- lazy, optional native module (see file header)
    const { RustSdkCryptoStorageProvider } = require('matrix-bot-sdk');
    // StoreType lives on the crypto package itself, NOT on matrix-bot-sdk --
    // see file header for the exact wrong-package bug this replaces.
    // eslint-disable-next-line global-require -- lazy: only touched when E2EE is actually requested
    const { StoreType } = require('@matrix-org/matrix-sdk-crypto-nodejs');
    const provider = new RustSdkCryptoStorageProvider(path.join(dir, 'crypto'), StoreType.Sqlite);
    cryptoEnabled = true;
    return provider;
  } catch (error) {
    cryptoEnabled = false;
    const moduleAbsent = error.code === 'MODULE_NOT_FOUND';

    if (moduleAbsent) {
      // A genuine environment fact, not a bug -- warn level.
      logToFile(
        '⚠️ Matrix: E2EE crypto module (@matrix-org/matrix-sdk-crypto-nodejs) is not installed on this host -- '
        + 'it needs Node >=24 with a matching prebuilt native binary. Set MATRIX_E2EE=off to silence this '
        + 'warning if plaintext is expected, or install it under Node 24+ to enable encryption.',
        { error: error.message, code: error.code }
      );
    } else {
      // NOT a missing-module condition -- a real bug (wrong API usage, a
      // corrupted crypto store, ...). Always logged loudly, at error level,
      // with the full message/code/stack, regardless of MATRIX_E2EE mode --
      // this must never be mistaken for the quiet "expected" case above.
      logToFile(
        '❌ Matrix: E2EE crypto provider failed to initialize for a reason OTHER than the module being '
        + 'absent -- this is a bug, not an environment limitation.',
        { error: error.message, code: error.code, stack: error.stack, level: 'error' }
      );
    }

    if (mode === 'on') {
      throw new Error(
        `Matrix: MATRIX_E2EE=on was explicitly set, but the crypto provider could not be built `
        + `(${error.code || 'no error code'}: ${error.message}) -- refusing to silently start in plaintext. `
        + 'Set MATRIX_E2EE=off if plaintext is acceptable here, or fix the underlying issue.'
      );
    }
    return null; // "auto" mode: downgrade quietly, already logged above
  }
}

const ACCOUNT_DATA_RETRY_ATTEMPTS = 4;
const ACCOUNT_DATA_RETRY_BASE_MS = 200;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Replaces `matrixClient.setAccountData` in place with a serialized,
 * retried, never-rejecting version. See the file header comment
 * ("Serialized/retried account data") for the full why -- this is what
 * stops a burst of invites (matrix-bot-sdk's own internal `DMs` class) and
 * our own welcome-DM "greeted" marker from racing concurrent writes to the
 * same account-data row and crashing the process.
 *
 * @param {import('matrix-bot-sdk').MatrixClient} matrixClient
 */
function wrapSetAccountDataSerialized(matrixClient) {
  const original = matrixClient.setAccountData.bind(matrixClient);
  let queue = Promise.resolve();

  async function attemptWithRetry(type, content) {
    for (let attempt = 1; attempt <= ACCOUNT_DATA_RETRY_ATTEMPTS; attempt++) {
      try {
        // eslint-disable-next-line no-await-in-loop -- intentionally sequential retries
        return await original(type, content);
      } catch (error) {
        const isLastAttempt = attempt === ACCOUNT_DATA_RETRY_ATTEMPTS;
        if (isLastAttempt) {
          logToFile(
            '❌ Matrix: account-data write failed after retries -- swallowed (best-effort, self-heals on next write)',
            { channel: 'matrix', accountDataType: type, attempts: attempt, error: error.message }
          );
          return undefined; // never reject -- see wrapSetAccountDataSerialized's header comment
        }
        logToFile('⚠️ Matrix: account-data write failed, retrying', {
          channel: 'matrix', accountDataType: type, attempt, error: error.message,
        });
        // eslint-disable-next-line no-await-in-loop -- short backoff between retries, by design
        await sleep(ACCOUNT_DATA_RETRY_BASE_MS * attempt);
      }
    }
    return undefined;
  }

  matrixClient.setAccountData = function serializedSetAccountData(type, content) {
    const run = () => attemptWithRetry(type, content);
    // Chain onto the queue regardless of how the PREVIOUS write settled --
    // attemptWithRetry() never rejects, but the extra .catch(() => {}) means
    // the queue itself can never wedge even if that guarantee is ever broken
    // by a future edit.
    const result = queue.then(run, run);
    queue = result.catch(() => {});
    return result;
  };
}

/**
 * Auto-accepts every room invite, exactly like matrix-bot-sdk's own
 * AutojoinRoomsMixin.setupOnClient() -- except a failed join is caught and
 * logged instead of being left to reject out of an EventEmitter callback.
 * See connect()'s call site for the crash this replaces.
 *
 * @param {import('matrix-bot-sdk').MatrixClient} matrixClient
 */
function autojoinRoomInvites(matrixClient) {
  matrixClient.on('room.invite', (roomId) => {
    matrixClient.joinRoom(roomId).catch((error) => {
      logToFile('⚠️ Matrix: failed to auto-join an invited room -- skipped, invite left pending', {
        channel: 'matrix', roomId, error: error.message,
      });
    });
  });
}

/**
 * @returns {Promise<import('matrix-bot-sdk').MatrixClient>} resolves once the
 *   client's first sync has completed -- matrix-bot-sdk's own start() promise
 *   contract -- mirroring discord-connection.js's "never resolve before real
 *   work can happen" rule.
 */
async function connect() {
  const homeserverUrl = process.env.MATRIX_HOMESERVER_URL;
  const accessToken = process.env.MATRIX_ACCESS_TOKEN;
  if (!homeserverUrl) throw new Error('Matrix connection: MATRIX_HOMESERVER_URL is not set');
  if (!accessToken) throw new Error('Matrix connection: MATRIX_ACCESS_TOKEN is not set');

  // eslint-disable-next-line global-require -- lazy, see file header
  const { MatrixClient, SimpleFsStorageProvider } = require('matrix-bot-sdk');

  const dir = storageDir();
  fs.mkdirSync(dir, { recursive: true });
  const storage = new SimpleFsStorageProvider(path.join(dir, 'bot.json'));
  const cryptoProvider = buildCryptoProvider(dir);

  const freshClient = cryptoProvider
    ? new MatrixClient(homeserverUrl, accessToken, storage, cryptoProvider)
    : new MatrixClient(homeserverUrl, accessToken, storage);

  // Must happen BEFORE start(): matrix-bot-sdk's own `client.dms` (built
  // inside the MatrixClient constructor above) reads `this.client.setAccountData`
  // dynamically at call time, so patching the property here is safe -- but
  // invites (and therefore its internal room.invite handler) can only start
  // arriving once the sync loop is running, so this must be in place first.
  // See the file header comment ("Serialized/retried account data") for why.
  wrapSetAccountDataSerialized(freshClient);

  // Auto-accepts room invites (a teacher DMing the bot for the first time
  // arrives as an invite the bot must join before it can reply) -- the direct
  // Matrix analogue of Discord requiring no equivalent step at all (a DM
  // channel just exists) and Baileys/Meta having no invite concept.
  //
  // OUR OWN listener, not matrix-bot-sdk's AutojoinRoomsMixin -- its own
  // `room.invite` handler (matrix-bot-sdk/lib/mixins/AutojoinRoomsMixin.js)
  // is `client.on("room.invite", (roomId) => client.joinRoom(roomId))`, with
  // NO try/catch. A join that fails for ANY reason (a stale/foreign invite
  // to a room with no reachable server, a federation hiccup, the bot having
  // already been kicked, ...) throws straight out of an EventEmitter
  // callback and kills the process -- the exact same crash SHAPE as the
  // DMs.persistCache() one this file already guards against, and one this
  // fix's own live burst-test run actually hit (a leftover stale invite in
  // the test homeserver's room list). autojoinRoomInvites() below is
  // functionally identical (still calls client.joinRoom(roomId) for every
  // invite) but never lets a failed join escape uncaught.
  autojoinRoomInvites(freshClient);

  try {
    await freshClient.start();
  } catch (error) {
    logToFile('❌ Matrix: failed to start sync -- check MATRIX_HOMESERVER_URL/MATRIX_ACCESS_TOKEN', {
      error: error.message,
    });
    throw error;
  }

  client = freshClient;
  connectionState.connected = true;

  try {
    cachedUserId = process.env.MATRIX_USER_ID || await freshClient.getUserId();
  } catch (error) {
    logToFile('⚠️ Matrix: could not resolve own user id via whoami -- set MATRIX_USER_ID explicitly', {
      error: error.message,
    });
  }

  logToFile('✅ Matrix: connected', { homeserverUrl, userId: cachedUserId, e2ee: cryptoEnabled });
  events.emit('open');
  return freshClient;
}

/**
 * Lazily connects on first call; subsequent calls reuse the same connection.
 * Resolves once the first sync has actually completed -- mirrors
 * discord-connection.js's getClient() resolution semantics exactly.
 *
 * @returns {Promise<import('matrix-bot-sdk').MatrixClient>}
 */
function getClient() {
  if (!clientPromise) clientPromise = connect();
  return clientPromise;
}

function isConnected() {
  return connectionState.connected;
}

/** Whether the live connection came up with a working crypto provider (false = plaintext). */
function isE2eeActive() {
  return cryptoEnabled;
}

/** The bot's own Matrix user id, once connected -- used to skip its own echoed messages. Null before connect(). */
function getCachedUserId() {
  return cachedUserId;
}

/**
 * Whether the live client currently considers itself joined to `roomId` --
 * reads matrix-bot-sdk's own live-maintained `lastJoinedRoomIds` array
 * (matrix-bot-sdk/lib/MatrixClient.js), which its sync loop keeps in sync on
 * every room.join/room.leave BEFORE that same sync pass processes any
 * `room.message` events for other rooms (see the leave-rooms-then-invites-
 * then-joined-rooms processing order in its own processSync) -- so this is
 * always at least as fresh as anything a `room.message` handler could have
 * observed, with NO network round trip. Used by matrix-channel.service.js to
 * decide whether a recorded "last room a user messaged us in" is still safe
 * to reply into, or the bot has since left/been kicked from it.
 *
 * `lastJoinedRoomIds` is a private (TS-only) field on the SDK's own class,
 * not part of its public API -- reached into directly the same way this file
 * already reads `client.dms`/`client.storageProvider` elsewhere. Defensively
 * treated as "not joined" if it's ever not an array (a future SDK version
 * renaming/removing it), which is the SAFE direction to fail in: it just
 * means an extra getOrCreateDm() fallback, never a reply into a room the bot
 * cannot actually post to.
 *
 * @param {import('matrix-bot-sdk').MatrixClient} matrixClient
 * @param {string} roomId
 * @returns {boolean}
 */
function isJoinedToRoom(matrixClient, roomId) {
  return Array.isArray(matrixClient?.lastJoinedRoomIds) && matrixClient.lastJoinedRoomIds.includes(roomId);
}

/**
 * Closes the sync connection cleanly. Unlike Baileys (which distinguishes a
 * clean disconnect from a "logged out" one) there is no session-invalidation
 * concept for a long-lived access token -- client.stop() simply halts the
 * /sync loop; nothing about it revokes MATRIX_ACCESS_TOKEN.
 */
async function close() {
  shuttingDown = true;
  if (client) {
    try {
      client.stop();
    } catch (error) {
      logToFile('Matrix: stop() error (ignored)', { error: error.message });
    }
  }
  client = null;
  clientPromise = null;
  cachedUserId = null;
  cryptoEnabled = false;
  connectionState.connected = false;
  events.emit('close', { shuttingDown });
}

/** Test-only: forces the next getClient() call to reconnect from scratch. */
function _resetForTests() {
  client = null;
  clientPromise = null;
  cachedUserId = null;
  cryptoEnabled = false;
  connectionState.connected = false;
  shuttingDown = false;
  events.removeAllListeners();
}

module.exports = {
  getClient,
  isConnected,
  isE2eeActive,
  getCachedUserId,
  isJoinedToRoom,
  close,
  events,
  _resetForTests,
  // Exported for direct unit testing of the serialize/retry seam -- see this
  // file's header comment ("Serialized/retried account data").
  _wrapSetAccountDataSerialized: wrapSetAccountDataSerialized,
  // Exported for direct unit testing of the crash-safe autojoin replacement.
  _autojoinRoomInvites: autojoinRoomInvites,
};
