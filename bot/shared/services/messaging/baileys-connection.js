/**
 * Baileys connection manager — the ONE place that owns the persistent
 * WhatsApp Web socket. Both bot/scripts/setup/baileys-pair.js (the standalone
 * pairing script) and baileys-channel.service.js (the driver the running bot
 * uses to send) share this, via getSocket() — whichever runs first connects;
 * whichever runs after reuses the same connection, so pairing state is never
 * duplicated.
 *
 * `baileys` (via ./baileys-lib.js — see that file for why it's a separate
 * module, not an inlined dynamic import) and `qrcode-terminal` are loaded
 * LAZILY, inside connect(), not at module top level. This matters for two
 * reasons: (1) it matches this repo's existing lazy-client convention (see
 * shared/storage/r2.js's lazyClient) — nothing here should force-load a
 * heavy dependency before it's actually needed; (2) it means simply
 * requiring this file (or baileys-channel.service.js, which requires this
 * file) never touches the real `baileys` package, so root-suite tests that
 * only check method presence/shape don't need to mock it — only tests that
 * actually exercise connect()/getSocket() do (see
 * tests/messaging/baileys-connection.test.js).
 *
 * `events` (the exported `events` EventEmitter, below) is the one and ONLY
 * place a caller should observe connection lifecycle — NOT a specific
 * socket's own `sock.ev`. Real-world discovery (a live pairing run against
 * WhatsApp's actual servers): after the QR is scanned, Baileys closes the
 * socket with "restart required" (code 515) and this module transparently
 * reconnects internally, creating a NEW socket object. A caller that
 * attached its success listener to the FIRST sock's `ev` (as
 * baileys-pair.js originally did) never sees the second socket's real
 * "open" event and times out despite the pairing having actually succeeded
 * — this `events` emitter is registered once per connect() call from
 * inside the SAME internal listener that already correctly fires across
 * every reconnect, so it never goes stale.
 */

const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');
const { logToFile } = require('../../utils/logger');

const AUTH_SUBDIR = 'baileys';

// The repo root, four levels up from bot/shared/services/messaging.
const REPO_ROOT = path.resolve(__dirname, '../../../..');

/**
 * Where this driver keeps its session.
 *
 * Anchored to the repo, NOT to process.cwd(). A relative CHANNEL_STATE_DIR
 * resolved against the working directory means the session moves when you do:
 * `cd bot && npm start` used a *different, empty* folder, so Baileys registered
 * a second device and re-synced from scratch — endlessly, and with two devices
 * fighting over one account. Seen live: `.channel-state/baileys` (device :13) at
 * the repo root and `bot/.channel-state/baileys` (device :14) side by side.
 *
 * An absolute CHANNEL_STATE_DIR is honoured as given.
 */
function authDir() {
  const root = process.env.CHANNEL_STATE_DIR || '.channel-state';
  return path.isAbsolute(root)
    ? path.join(root, AUTH_SUBDIR)
    : path.resolve(REPO_ROOT, root, AUTH_SUBDIR);
}

let socketPromise = null;
const connectionState = { connected: false };
const events = new EventEmitter();

// ── Single-instance guard on the auth folder ─────────────────────────────────
//
// Two processes must never share one Baileys auth folder. What happens if they
// do, observed live: both connect with the same credentials, WhatsApp rejects
// the duplicate with "Stream Errored (conflict)", and the SESSION IS
// INVALIDATED — not just the losing process. Recovering needs a human with the
// phone to re-scan a QR.
//
// This is not an exotic race. It happens whenever restarts overlap even
// slightly: a supervisor that restarts on exit, a PaaS rolling deploy where the
// old container is still draining while the new one boots, or (as here) an
// operator restarting faster than the previous process died.
//
// So: claim the folder, and refuse to start if someone live already holds it.
// Failing to boot is enormously better than destroying the pairing.
const LOCK_FILENAME = '.instance.lock';

function lockPath() {
  return path.join(authDir(), LOCK_FILENAME);
}

/**
 * A pino-shaped logger that discards everything, for the interactive commands.
 * Prefers real pino (already a dependency, so its exact interface is honoured)
 * and falls back to a stub if it cannot be loaded — a missing logger must never
 * be the reason pairing fails.
 *
 * @returns {object}
 */
function quietBaileysLogger() {
  try {
    return require('pino')({ level: 'silent' });
  } catch {
    const noop = () => {};
    const stub = {
      level: 'silent', fatal: noop, error: noop, warn: noop, info: noop, debug: noop, trace: noop,
    };
    stub.child = () => stub;
    return stub;
  }
}

/** True when a process with this pid exists and we may signal it. */
function pidIsAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0); // signal 0 = existence check only
    return true;
  } catch (error) {
    // EPERM means it exists but belongs to another user — still alive.
    return error.code === 'EPERM';
  }
}

let lockHeld = false;

/**
 * Claims the auth folder for this process.
 *
 * @throws {Error} when a live process already holds it.
 */
function acquireInstanceLock() {
  if (lockHeld) return;
  fs.mkdirSync(authDir(), { recursive: true });

  const file = lockPath();
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      // 'wx' fails if the file exists — atomic claim, no check-then-write race.
      const fd = fs.openSync(file, 'wx');
      fs.writeSync(fd, JSON.stringify({ pid: process.pid, since: new Date().toISOString() }));
      fs.closeSync(fd);
      lockHeld = true;
      return;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;

      let holder = null;
      try {
        holder = JSON.parse(fs.readFileSync(file, 'utf-8'));
      } catch {
        holder = null; // unreadable/corrupt — treat as stale
      }

      if (holder && pidIsAlive(holder.pid) && holder.pid !== process.pid) {
        throw new Error(
          `Another Rumi instance (pid ${holder.pid}, since ${holder.since}) is already using `
          + `${authDir()}. Two processes sharing one WhatsApp session make WhatsApp invalidate it, `
          + 'which requires re-pairing by hand — so this one is stopping instead. '
          + 'Stop the other instance first.'
        );
      }

      // Stale (holder dead, or it is us after a crash) — take it over.
      logToFile('Baileys: taking over a stale instance lock', { staleHolder: holder });
      try { fs.unlinkSync(file); } catch { /* another process just cleaned it */ }
    }
  }
  throw new Error(`Could not claim the Baileys instance lock at ${lockPath()}`);
}

function releaseInstanceLock() {
  if (!lockHeld) return;
  lockHeld = false;
  try {
    const holder = JSON.parse(fs.readFileSync(lockPath(), 'utf-8'));
    if (holder.pid !== process.pid) return; // not ours any more; leave it alone
  } catch {
    return; // already gone
  }
  try { fs.unlinkSync(lockPath()); } catch { /* already gone */ }
}

// A crash or a signal must not leave a lock that blocks the next start. The
// stale-pid takeover above is the real backstop; this just keeps things tidy.
process.once('exit', releaseInstanceLock);

// Set by close() so the connection.update 'close' branch below knows the
// disconnect was deliberate and must NOT trigger the usual auto-reconnect —
// sock.end() emits the same 'close' event a network blip does.
let shuttingDown = false;

/**
 * Recently-sent messages, so Baileys can answer RETRY RECEIPTS.
 *
 * The real bug this fixes, found live: the paired phone showed "Waiting for
 * this message. This may take a while." on the bot's replies, permanently.
 * WhatsApp's recovery path for an undecryptable message is a retry receipt —
 * the recipient asks the sender to re-encrypt and resend. Baileys implements
 * that in sendMessagesAgain() (Socket/messages-recv.js), which calls the
 * `getMessage` config hook to recover the ORIGINAL content before resending:
 *
 *     const msgs = await Promise.all(ids.map(id => getMessage({ ...key, id })));
 *     ...
 *     for (const [i, msg] of msgs.entries()) { if (msg) { ...resend... } }
 *
 * The library default is `async () => undefined` (Defaults/index.js), and
 * Baileys leaves a TODO saying the consumer must supply the store ("implement
 * a cache to store the last 256 sent messages"). Without it every `msg` is
 * undefined, so nothing is EVER resent and the placeholder never resolves —
 * which is exactly what we observed: the retry receipts arrived and the bot
 * had no way to answer them.
 *
 * Bounded to the same 256 Baileys' TODO suggests, oldest-evicted-first (Map
 * preserves insertion order). Deliberately in-memory only: this holds decrypted
 * outgoing message content, which should not be written to disk. Losing it on
 * restart is fine — a retry for a pre-restart message can't be honoured anyway.
 */
const SENT_MESSAGE_STORE_MAX = 256;
const sentMessages = new Map(); // message id -> proto.IMessage

function rememberSentMessage(sent) {
  if (!sent?.key?.id || !sent.message) return;
  sentMessages.set(sent.key.id, sent.message);
  while (sentMessages.size > SENT_MESSAGE_STORE_MAX) {
    sentMessages.delete(sentMessages.keys().next().value);
  }
}

/** The `getMessage` hook Baileys calls when a recipient requests a resend. */
async function getStoredMessage(key) {
  return sentMessages.get(key?.id);
}

/**
 * Serialises every sock.sendMessage() call so no two overlap on this socket,
 * and records each result for the retry store above.
 *
 * The serialisation is the important half. Concurrent sends on a single
 * Baileys socket corrupt Signal ratchet state: two encryptions can advance
 * from the same chain key, and the loser produces ciphertext the recipient
 * cannot decrypt — it shows "Waiting for this message. This may take a while."
 * This bot sends several messages per inbound message (a reaction, a typing
 * presence update, then the text reply), and startContinuousTypingIndicator
 * keeps firing on a timer WHILE the reply is being sent, so overlap is the
 * normal case here, not an edge case.
 *
 * Confirmed independently: NousResearch's hermes-agent WhatsApp bridge hit the
 * same failure and fixed it the same way, noting "overlapping sends are the
 * root cause of cross-chat contamination — the WhatsApp protocol-level routing
 * can misdeliver when two sendMessage() Promises race on the same socket."
 *
 * Wrapped here, once, rather than at ~20 call sites in
 * baileys-channel.service.js — every outbound path already funnels through the
 * socket this module hands out.
 */
function trackSentMessages(sock) {
  const originalSendMessage = sock.sendMessage.bind(sock);
  let sendQueue = Promise.resolve();

  sock.sendMessage = (...args) => {
    // Chain on both fulfilment and rejection so one failed send never wedges
    // the queue for every subsequent one.
    const task = sendQueue.then(
      () => originalSendMessage(...args),
      () => originalSendMessage(...args)
    ).then((sent) => {
      rememberSentMessage(sent);
      return sent;
    });
    sendQueue = task.catch(() => {});
    return task;
  };

  return sock;
}

/**
 * Resolves ONLY once the connection is actually open — NOT as soon as
 * makeWASocket() returns a socket shell. Real-world discovery (a live send
 * attempt): makeWASocket() returns synchronously, long before the WebSocket
 * handshake/auth completes; a caller that did `sock = await connect();
 * sock.sendMessage(...)` immediately hit "Connection Closed" because the
 * transport genuinely wasn't open yet. Every consumer (baileys-channel
 * .service.js's sendMessage/etc.) goes through getSocket(), so fixing the
 * resolution semantics here fixes it everywhere at once.
 *
 * If the socket closes (non-logout) before ever reaching "open" — e.g. the
 * very first attempt hits a transient error — this attempt's promise chains
 * onto the fresh reconnect this module kicks off internally, rather than
 * hanging forever unresolved (the same "stale reference" bug class the
 * `events` emitter above fixes for listeners, applied to the promise itself).
 *
 * @param {object} [opts]
 * @param {(qr: string) => void} [opts.onQr] called with the raw QR payload
 *   whenever WhatsApp issues one (unpaired or session expired) — in addition
 *   to the terminal render this function always does.
 * @returns {Promise<import('baileys').WASocket>}
 */
async function connect(opts = {}) {
  const {
    makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason,
  } = await require('./baileys-lib').loadBaileys();
  const qrcodeTerminal = require('qrcode-terminal');

  // Claim the auth folder BEFORE touching it. Throws (rather than corrupting a
  // live session) if another instance already holds it.
  acquireInstanceLock();

  // Whether this process STARTED with credentials. Load-bearing below: a QR is
  // normal and wanted when there are none (first-time pairing), but a QR when
  // creds existed means the session was invalidated server-side, and re-pairing
  // needs a human with the phone. Captured before useMultiFileAuthState(), which
  // creates the directory.
  const hadCredentials = fs.existsSync(path.join(authDir(), 'creds.json'));

  const { state, saveCreds } = await useMultiFileAuthState(authDir());
  const { version, isLatest } = await fetchLatestBaileysVersion();
  logToFile('Baileys: connecting', { version, isLatest, authDir: authDir() });

  const socketConfig = {
    auth: state,
    version,
    // Lets Baileys honour retry receipts — without it a recipient that fails
    // to decrypt is stuck on "Waiting for this message" forever (see the
    // sentMessages doc comment above). Still defaults to a no-op in 7.x.
    getMessage: getStoredMessage,
    // Baileys 7.x flipped this default to TRUE. Rumi only ever acts on
    // messages that arrive while it is running, so pulling the operator's
    // entire chat history on every connect is pure cost (and on a large
    // account, a slow, memory-hungry one).
    syncFullHistory: false,
    // Do NOT mark the account "online" just because the bot connected — that
    // suppresses push notifications on the operator's own phone for the whole
    // time the bot is up. hermes-agent's bridge sets this for the same reason.
    markOnlineOnConnect: false,
    // Shows up in WhatsApp → Linked Devices, so the operator can tell which
    // entry is this bot rather than an anonymous "Chrome (Ubuntu)".
    browser: ['Rumi', 'Chrome', '120.0'],
  };

  // Baileys logs its whole handshake at info level through its own default
  // logger. On the server that is useful; in `rumi pair` it put ~15 lines of raw
  // JSON immediately above and below the QR code, burying the one thing on
  // screen the user had to use.
  //
  // Set as a separate key, NOT as `logger: isCli ? quiet : undefined`. Baileys
  // merges config over its defaults, so an explicit `undefined` *overwrites* its
  // default logger rather than leaving it alone — and the next thing it does is
  // call `logger.child()`. That took the bot's entire WhatsApp connection down
  // with "Cannot read properties of undefined (reading 'child')" while every
  // other service reported healthy.
  if (process.env.RUMI_CLI === '1') socketConfig.logger = quietBaileysLogger();

  const sock = trackSentMessages(makeWASocket(socketConfig));

  sock.ev.on('creds.update', saveCreds);

  return new Promise((resolve, reject) => {
    let settled = false;

    sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        // A QR when we ALREADY had credentials is not a pairing opportunity —
        // the session was invalidated (WhatsApp reports this as
        // "Stream Errored (conflict)", typically because two processes shared one
        // auth folder, e.g. an old instance still alive during a redeploy).
        // Baileys then re-issues a QR every ~20s forever. Nobody is watching this
        // terminal, so the only thing that achieves is hammering WhatsApp's
        // pairing endpoint — which is precisely how this project kept tripping
        // the "can't link new devices right now" rate limit. Treat it exactly
        // like a logout: terminal, needs a human, stop trying.
        if (hadCredentials && !opts.allowRepair) {
          logToFile('🔒 Baileys: session was invalidated — re-pairing needs a human, not a retry loop', {
            authDir: authDir(),
            remedy: `delete ${authDir()} and run: npm run pair:baileys`,
          });
          events.emit('close', { statusCode: DisconnectReason.loggedOut, loggedOut: true });
          // Don't render or re-request. Ending the socket stops the QR cycle.
          try { sock.end(new Error('session invalidated — re-pairing required')); } catch { /* already closing */ }
          if (!settled) { settled = true; reject(new Error('Baileys session invalidated — re-pair required')); }
          return;
        }

        qrcodeTerminal.generate(qr, { small: true });
        logToFile('📱 Baileys: scan this QR code with WhatsApp (Linked Devices) to pair', {});
        if (opts.onQr) opts.onQr(qr);
        events.emit('qr', qr);
      }

      if (connection === 'open') {
        connectionState.connected = true;
        logToFile('✅ Baileys: connected', {});
        events.emit('open');
        if (!settled) { settled = true; resolve(sock); }
      }

      if (connection === 'close') {
        connectionState.connected = false;
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const loggedOut = statusCode === DisconnectReason.loggedOut;
        logToFile('⚠️  Baileys: connection closed', { statusCode, loggedOut });
        events.emit('close', { statusCode, loggedOut });

        if (shuttingDown) {
          // Deliberate close() during process shutdown — reconnecting here
          // would resurrect the socket we are trying to shut down.
          logToFile('Baileys: closed for shutdown — not reconnecting', {});
          if (!settled) { settled = true; reject(new Error('Baileys: shutting down')); }
        } else if (loggedOut) {
          logToFile('🔒 Baileys: session logged out — delete the auth folder and re-pair', { authDir: authDir() });
          socketPromise = null;
          if (!settled) { settled = true; reject(new Error('Baileys: logged out before connecting')); }
        } else {
          // Not a logout (network blip, the expected post-pairing "restart
          // required", etc.) — reconnect. No exponential backoff / storm
          // protection here by design: v1 targets local/dev quick-start, not
          // hosted-at-scale resilience (see
          // docs/onboarding/sandbox-production-design.md's out-of-scope list).
          socketPromise = null;
          const reconnectPromise = getSocket(opts);
          if (!settled) {
            settled = true;
            reconnectPromise.then(resolve, reject);
          } else {
            reconnectPromise.catch((err) => logToFile('❌ Baileys: reconnect failed', { error: err.message }));
          }
        }
      }
    });
  });
}

/** Lazily connects on first call; subsequent calls reuse the same connection. Resolves once actually open. */
function getSocket(opts) {
  if (!socketPromise) socketPromise = connect(opts);
  return socketPromise;
}

function isConnected() {
  return connectionState.connected;
}

/**
 * Closes the socket cleanly WITHOUT logging out (the pairing survives), then
 * waits briefly so Baileys' auth-state writes can land on disk.
 *
 * Why the wait matters — a real bug this fixes, found live: the process was
 * killed by SIGTERM with no shutdown handling at all. `useMultiFileAuthState`
 * persists Signal session/ratchet state to CHANNEL_STATE_DIR/baileys with
 * fire-and-forget async fs writes, so an abrupt exit loses whatever hadn't
 * flushed. On restart Baileys loaded stale ratchet state and encrypted with
 * keys the paired phone no longer expected — the phone could not decrypt the
 * bot's replies and showed "Waiting for this message. This may take a while."
 * indefinitely. Every message sent before the kill decrypted fine; everything
 * after it was stuck, which is what pinned the cause to the unclean exit.
 *
 * This matters in production, not just locally: a PaaS redeploy (Railway,
 * Fly, Docker stop, k8s rollout) sends SIGTERM on EVERY deploy, so without
 * this the sandbox driver risks desyncing live users' sessions each release.
 *
 * @param {object}  [opts]
 * @param {number}  [opts.flushMs=500] grace period for pending auth-state writes.
 */
async function close({ flushMs = 500 } = {}) {
  shuttingDown = true;
  const pending = socketPromise;
  socketPromise = null;

  if (pending) {
    try {
      const sock = await pending;
      sock.end(undefined); // undefined = clean close, NOT a logout
    } catch {
      // Never reached "open" (or already rejected) — nothing to close.
    }
  }

  connectionState.connected = false;
  logToFile('Baileys: connection closed for shutdown, flushing auth state', { flushMs });
  await new Promise((resolve) => setTimeout(resolve, flushMs));

  // Released only AFTER the flush window, so a supervisor that restarts the
  // instant this resolves cannot begin writing the auth folder while our final
  // Signal-state writes are still landing.
  releaseInstanceLock();
}

/** Test-only: forces the next getSocket() call to reconnect from scratch. */
function _resetForTests() {
  socketPromise = null;
  connectionState.connected = false;
  shuttingDown = false;
  lockHeld = false;
  sentMessages.clear();
  events.removeAllListeners();
}

module.exports = {
  getSocket,
  isConnected,
  close,
  authDir,
  events,
  lockPath,
  acquireInstanceLock,
  // Exported for its contract test: Baileys is handed this object, so the shape
  // has to stay pino-compatible even on the no-pino fallback path.
  quietBaileysLogger,
  releaseInstanceLock,
  getStoredMessage,
  rememberSentMessage,
  _resetForTests,
};
