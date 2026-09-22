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
  const { MatrixClient, SimpleFsStorageProvider, AutojoinRoomsMixin } = require('matrix-bot-sdk');

  const dir = storageDir();
  fs.mkdirSync(dir, { recursive: true });
  const storage = new SimpleFsStorageProvider(path.join(dir, 'bot.json'));
  const cryptoProvider = buildCryptoProvider(dir);

  const freshClient = cryptoProvider
    ? new MatrixClient(homeserverUrl, accessToken, storage, cryptoProvider)
    : new MatrixClient(homeserverUrl, accessToken, storage);

  // Auto-accepts room invites (a teacher DMing the bot for the first time
  // arrives as an invite the bot must join before it can reply) -- the direct
  // Matrix analogue of Discord requiring no equivalent step at all (a DM
  // channel just exists) and Baileys/Meta having no invite concept.
  AutojoinRoomsMixin.setupOnClient(freshClient);

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
  close,
  events,
  _resetForTests,
};
