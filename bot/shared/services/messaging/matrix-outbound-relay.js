/**
 * Matrix outbound relay -- lets a process that does NOT own the Matrix sync
 * connection (the SQS/BullMQ worker) send to Matrix teachers anyway.
 *
 * Why this exists: lesson plans, coaching reports, reading-assessment results,
 * videos and exam grading are all delivered FROM THE WORKER, which calls the
 * same WhatsAppService.sendDocument/sendMessage/... facade the bot does. For a
 * Matrix identity that routes to matrix-channel.service.js, whose getClient()
 * would open a SECOND MatrixClient in the worker: a second /sync loop on the
 * same access token AND the same device's Olm/Megolm crypto store (both
 * processes default to the same MATRIX_STORAGE_DIR). matrix-connection.js's
 * header comment already names that as corrupting the crypto store, and with
 * MATRIX_E2EE=on it can simply fail to start -- either way the teacher never
 * got the lesson plan the worker produced.
 *
 * So only the bot connects. Relay mode is the DEFAULT: the bot claims the
 * connection with ownConnectionInThisProcess() before it attaches its inbound
 * listener, and every other process -- the worker, the stale-session cron, the
 * brief worker, a one-off script -- ships every Matrix driver method over Redis (the
 * REDIS_URL the BullMQ queue driver already requires) to the ONE process that
 * owns the sync connection -- the bot, which calls startOwner() once its
 * inbound listener is attached. The owner runs the real driver method and
 * pushes the result back. Plain JSON on two Redis lists, no new dependency:
 *
 *   caller: LPUSH rumi:matrix:relay:<ns>:requests {v, id, method, args, issuedAt, expiresAt, sig}
 *           BRPOP rumi:matrix:relay:<ns>:reply:<id>  (timeout)
 *   owner:  BRPOP rumi:matrix:relay:<ns>:requests -> verify -> run -> LPUSH reply:<id>, EXPIRE
 *
 * Arguments that cannot cross a process (and on Railway, a container) boundary
 * are carried by value: Buffers as base64, and local files -- sendDocument's
 * PDF path, sendImage/sendSticker paths, file:// media URLs -- are read by the
 * caller and re-materialised in a temp dir on the owner for the duration of
 * the call. A timeout or an unreachable Redis is reported the way the driver
 * itself reports a failed send (false / null, or a throw for the media
 * lookups whose contract is to throw), and logged -- never a silent hang.
 *
 * Why the owner trusts nothing in the list: Redis is often shared (one Redis
 * for several services, or for staging and production), so "can LPUSH" must
 * not mean "can make the bot send, or read the bot's own files". Hence:
 *   - every request and reply is HMAC-SHA256 signed with a key both processes
 *     derive from MATRIX_ACCESS_TOKEN (which they already share -- the token
 *     itself never goes on the wire or in a log); the owner drops unsigned or
 *     badly signed requests, and requests past their caller's deadline;
 *   - the list names carry a namespace derived from the same token and the
 *     homeserver, so two deployments on one Redis never pop each other's work;
 *   - the owner never reads a local path a request names. ARG_KINDS below is
 *     an allowlist: a file argument may only be bytes the caller encoded, a
 *     media argument only those bytes or an http(s) URL. Any raw string there
 *     (a path, relative or absolute, or file://) is refused with a failure
 *     reply, before anything is read.
 *
 * Why the default is relay rather than opt-in: a process that forgot to opt in
 * used to open a second sync on the bot's device. Synapse then refused its
 * one-time-key upload ("already exists") while its send still "resolved", and
 * the two processes could corrupt each other's Olm/Megolm state.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { AsyncLocalStorage } = require('async_hooks');
const { logToFile } = require('../../utils/logger');

const KEY_ROOT = 'rumi:matrix:relay:';
const PROTOCOL_VERSION = 1;
const DEFAULT_TIMEOUT_MS = 180000; // a video upload from the worker can take a while
const REPLY_TTL_SECONDS = 300;

/**
 * The shape each relayed argument position must have, per driver method --
 * the owner refuses anything else (see the header). Positions not listed are
 * plain JSON values (recipient, text, captions, menus) that the driver never
 * treats as a file. matrix-outbound-relay-security.test.js fails if a driver
 * method that reads a file or a media URL is missing here.
 *   file:    a local file -> crosses only as caller-encoded bytes (__rumiFile)
 *   media:   an http(s) URL, or a caller's file:// file as bytes (__rumiFile)
 *   buffer:  a Buffer -> crosses as base64 (__rumiBuffer)
 *   dropped: the caller's temp dir -- meaningless on the owner (and unused by
 *            the Matrix driver), so it crosses as null
 */
const ARG_KINDS = {
  sendDocument: { 1: 'file' },
  sendImage: { 1: 'file' },
  sendSticker: { 1: 'file' },
  sendDocumentFromUrl: { 1: 'media' },
  sendAudioFromUrl: { 1: 'media' },
  sendAudioFromUrlReturningId: { 1: 'media' },
  sendImageFromUrl: { 1: 'media' },
  sendVideoFromUrl: { 1: 'media' },
  sendImageWithButtons: { 1: 'media' },
  sendAudio: { 1: 'buffer', 2: 'dropped' },
  sendVideo: { 1: 'buffer', 2: 'dropped' },
};

// What the driver itself returns on failure -- the relay returns the same.
const THROWING_METHODS = new Set(['getMediaInfo', 'downloadMedia']);
function failureValue(method) {
  return /ReturningId$/.test(method) ? null : false;
}

let relayMode = false;
let connectionOwner = false;
let ownerStarted = false;
let callerRedis = null;
let stopOwner = null;

let replyTimeoutMs = DEFAULT_TIMEOUT_MS;

// The job a call belongs to (caller side), and the relayed call being run
// (owner side). A worker job's typing hold and its sends carry the same job, so
// the owner ends a job's "Rumi is typing…" on that job's own send and not on an
// unrelated one (matrix-channel.service.js, typing sessions).
const jobContext = new AsyncLocalStorage();
const relayedCallContext = new AsyncLocalStorage();

/** Runs `fn` with every relayed call it makes tagged with `jobKey`. */
function forJob(jobKey, fn) {
  return jobContext.run(String(jobKey), fn);
}

/** The job the current code runs for (forJob), or null. */
function currentJob() {
  return jobContext.getStore() || null;
}

/** On the owner, while it runs a relayed call: `{ job }` (job null when the caller named none); otherwise null. */
function relayedCall() {
  return relayedCallContext.getStore() || null;
}

function timeoutMs() {
  return replyTimeoutMs;
}

// ── Shared secret and namespace ───────────────────────────────────────────────

function hkdf(token, label) {
  return Buffer.from(crypto.hkdfSync('sha256', token, Buffer.alloc(0), label, 32));
}

/**
 * The signing key and the key namespace, both derived from what the bot and
 * its workers already share. The namespace comes from the access token and
 * the homeserver rather than MATRIX_USER_ID: that variable is optional (the
 * bot can learn its id from whoami, which a worker that never connects cannot
 * do), whereas a process without the token cannot sign at all. A token is
 * bound to one account on one homeserver, so this is per bot account, and it
 * is stable across restarts until the token is rotated -- which already
 * means redeploying the bot and its workers together.
 */
function deploymentKeys() {
  const token = process.env.MATRIX_ACCESS_TOKEN;
  if (!token) throw new Error('Matrix relay needs MATRIX_ACCESS_TOKEN to sign and verify relayed calls');
  const homeserver = String(process.env.MATRIX_HOMESERVER_URL || '').trim().toLowerCase().replace(/\/+$/, '');
  const namespace = hkdf(token, `rumi-matrix-relay/v1/namespace|${homeserver}`).toString('hex').slice(0, 12);
  return {
    signingKey: hkdf(token, 'rumi-matrix-relay/v1/signing-key'),
    requestList: `${KEY_ROOT}${namespace}:requests`,
    replyKey: (id) => `${KEY_ROOT}${namespace}:reply:${id}`,
  };
}

function signatureOf(signingKey, fields) {
  return crypto.createHmac('sha256', signingKey).update(JSON.stringify(fields)).digest('hex');
}

/** Serialises `fields` with their signature. The signed bytes are exactly JSON.stringify(fields). */
function signed(signingKey, fields) {
  return JSON.stringify({ ...fields, sig: signatureOf(signingKey, fields) });
}

/**
 * Parses and verifies a signed message; null if it is malformed or its
 * signature does not match. Re-serialising the parsed fields reproduces the
 * signed bytes (JSON.stringify(JSON.parse(x)) is stable for JSON.stringify
 * output), and any edit or key reordering by a third party breaks the match.
 */
function verified(signingKey, raw) {
  let message;
  try {
    message = JSON.parse(raw);
  } catch (error) {
    return null;
  }
  if (!message || typeof message !== 'object' || Array.isArray(message) || typeof message.sig !== 'string') return null;
  const { sig, ...fields } = message;
  const expected = Buffer.from(signatureOf(signingKey, fields), 'hex');
  const given = Buffer.from(sig, 'hex');
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  return fields;
}

function newRedis() {
  if (!process.env.REDIS_URL) throw new Error('Matrix relay needs REDIS_URL (the same Redis the BullMQ queue uses)');
  // eslint-disable-next-line global-require -- lazy: requiring this file must never dial Redis
  const IORedis = require('ioredis');
  return new IORedis(process.env.REDIS_URL, { maxRetriesPerRequest: null });
}

/** Called once by the one process that owns the Matrix sync connection (the bot), before it connects. */
function ownConnectionInThisProcess() {
  connectionOwner = true;
}

/**
 * Forces relay mode even after a claim. Not needed any more (relay is the
 * default), kept so the worker can say so explicitly at startup.
 */
function useRelayForThisProcess() {
  relayMode = true;
}

/** Whether driver calls in this process go over the relay instead of a local connection. */
function isRelayMode() {
  if (ownerStarted) return false;
  return relayMode || !connectionOwner;
}

// ── (De)serialisation ─────────────────────────────────────────────────────────

function encodeValue(value) {
  if (Buffer.isBuffer(value)) return { __rumiBuffer: value.toString('base64') };
  return value;
}

function decodeValue(value) {
  if (value && typeof value === 'object' && typeof value.__rumiBuffer === 'string') {
    return Buffer.from(value.__rumiBuffer, 'base64');
  }
  return value;
}

/** Thrown for an argument whose shape ARG_KINDS does not allow; never carries the value itself. */
class RelayRefusal extends Error {}

function fileArg(localPath) {
  return { __rumiFile: { name: path.basename(localPath), data: fs.readFileSync(localPath).toString('base64') } };
}

function isLocalFile(value) {
  return typeof value === 'string' && value !== '' && fs.existsSync(value) && fs.statSync(value).isFile();
}

function isHttpUrl(value) {
  return typeof value === 'string' && /^https?:\/\//i.test(value);
}

/**
 * Caller side: turns driver arguments into JSON-safe values, carrying the
 * caller's own local files by value. Only positions ARG_KINDS declares are
 * ever read -- a file:// string in a message text stays text.
 */
function encodeArgs(method, args) {
  const kinds = ARG_KINDS[method] || {};
  return args.map((arg, index) => {
    switch (kinds[index]) {
      case 'file':
        if (isLocalFile(arg)) return fileArg(arg);
        throw new RelayRefusal(`${method}: argument ${index} is not a local file this process can read`);
      case 'media':
        if (isHttpUrl(arg)) return arg;
        if (typeof arg === 'string' && arg.startsWith('file://') && isLocalFile(arg.slice('file://'.length))) {
          return fileArg(arg.slice('file://'.length));
        }
        throw new RelayRefusal(`${method}: argument ${index} is neither an http(s) URL nor a local file:// this process can read`);
      case 'buffer':
        if (Buffer.isBuffer(arg)) return encodeValue(arg);
        throw new RelayRefusal(`${method}: argument ${index} is not a Buffer`);
      case 'dropped':
        return null;
      default:
        return encodeValue(arg);
    }
  });
}

/** Owner side: writes carried bytes into `tmpDir` under a name that cannot leave it. */
function materialise(carried, tmpDir, method, index) {
  const { name, data } = (carried && carried.__rumiFile) || {};
  if (typeof data !== 'string') throw new RelayRefusal(`${method}: argument ${index} carries no file bytes`);
  const base = path.basename(typeof name === 'string' ? name : '');
  const target = path.join(tmpDir, base && base !== '.' && base !== '..' ? base : 'file');
  fs.writeFileSync(target, Buffer.from(data, 'base64'));
  return target;
}

function isCarriedFile(value) {
  return Boolean(value && typeof value === 'object' && value.__rumiFile);
}

/**
 * Owner side: checks every argument against ARG_KINDS and returns the real
 * arguments. A refusal is thrown before any bytes are written, and nothing
 * here ever reads a path -- a file only exists on the owner because its bytes
 * came in the request.
 */
function decodeArgs(method, args, tmpDir) {
  const kinds = ARG_KINDS[method] || {};
  const list = Array.isArray(args) ? args : [];
  list.forEach((arg, index) => {
    const kind = kinds[index];
    const ok = (kind === 'file' && isCarriedFile(arg))
      || (kind === 'media' && (isCarriedFile(arg) || isHttpUrl(arg)))
      || (kind === 'buffer' && arg && typeof arg === 'object' && typeof arg.__rumiBuffer === 'string')
      || (kind === 'dropped' && arg == null)
      || (kind === undefined && !isCarriedFile(arg));
    if (!ok) throw new RelayRefusal(`${method}: argument ${index} is not an allowed ${kind || 'value'} (a local path is never accepted)`);
  });
  return list.map((arg, index) => {
    const kind = kinds[index];
    if (kind === 'file') return materialise(arg, tmpDir, method, index);
    if (kind === 'media' && isCarriedFile(arg)) return `file://${materialise(arg, tmpDir, method, index)}`;
    return decodeValue(arg);
  });
}

// ── Caller side (worker) ──────────────────────────────────────────────────────

/**
 * Ships one driver call to the owner and waits for its result.
 * @param {string} method a matrix-channel.service.js method name
 * @param {Array} args the call's arguments
 */
async function call(method, args) {
  const id = crypto.randomUUID();
  const started = Date.now();
  const waitMs = timeoutMs();
  let blocking = null;
  try {
    const keys = deploymentKeys();
    // The deadline is this caller's own timeout: the owner skips the request
    // once it has passed, because by then this call has already reported failure.
    const request = {
      v: PROTOCOL_VERSION, id, method, args: encodeArgs(method, args), issuedAt: started, expiresAt: started + waitMs,
    };
    const job = currentJob();
    if (job) request.job = job;
    if (!callerRedis) callerRedis = newRedis();
    await callerRedis.lpush(keys.requestList, signed(keys.signingKey, request));

    // A BRPOP blocks its whole connection, so each wait gets its own.
    blocking = newRedis();
    const popped = await blocking.brpop(keys.replyKey(id), Math.ceil(waitMs / 1000));
    if (!popped) throw new Error(`no reply from the Matrix sync owner within ${waitMs}ms -- is the bot process running?`);

    const reply = verified(keys.signingKey, popped[1]);
    if (!reply || reply.id !== id) throw new Error('the reply was not signed by this deployment\'s sync owner');
    logToFile('↪️ Matrix relay: call completed by the sync owner', {
      channel: 'matrix', method, ok: reply.ok, ms: Date.now() - started,
    });
    if (!reply.ok) throw new Error(reply.error || 'the sync owner reported a failure');
    return decodeValue(reply.result);
  } catch (error) {
    logToFile('❌ Matrix relay: call failed', { channel: 'matrix', method, error: error.message });
    if (THROWING_METHODS.has(method)) throw error;
    return failureValue(method);
  } finally {
    if (blocking) blocking.disconnect();
  }
}

// ── Owner side (bot) ──────────────────────────────────────────────────────────

/** Ids already run, until their deadline: a captured request pushed again is not sent twice. */
function firstSighting(seen, request) {
  const now = Date.now();
  for (const [id, expiresAt] of seen) if (expiresAt < now) seen.delete(id);
  if (seen.has(request.id)) return false;
  seen.set(request.id, request.expiresAt);
  return true;
}

/**
 * Verifies and runs one popped request. Never throws. Unsigned, badly signed,
 * replayed and expired requests are dropped without a reply (their id cannot
 * be trusted, or their caller has stopped listening); a signed request with a
 * refused argument gets a failure reply and runs nothing.
 *
 * @param {object} redis the connection replies are pushed on
 * @param {string} raw the list entry, exactly as popped
 * @param {Record<string, Function>} implementations the driver's real, local methods
 * @param {{keys: object, seen: Map}} [owner] startOwner's keys and replay memory
 */
async function runRequest(redis, raw, implementations, owner) {
  let request;
  let keys;
  try {
    ({ keys } = owner || { keys: deploymentKeys() });
    request = verified(keys.signingKey, typeof raw === 'string' ? raw : '');
  } catch (error) {
    request = null;
  }
  if (!request || request.v !== PROTOCOL_VERSION || typeof request.id !== 'string' || typeof request.method !== 'string') {
    logToFile('🚫 Matrix relay: dropped an unsigned or badly signed request', { channel: 'matrix' });
    return;
  }
  // N5: the caller reports failure once its own timeout passes, so a request
  // past its deadline (or without one) is not started -- a retry of the job
  // would otherwise send it twice. What remains: a call the owner started
  // just before the deadline (a slow video upload) can still complete after
  // the caller has given up, and a clock skew between the two containers
  // shifts the deadline by that much. Both are rare and leave a duplicate,
  // never a lost send.
  if (typeof request.expiresAt !== 'number' || Date.now() > request.expiresAt) {
    logToFile('⚠️ Matrix relay: dropped a request its caller already gave up on', { channel: 'matrix', method: request.method });
    return;
  }
  if (!firstSighting((owner && owner.seen) || new Map(), request)) {
    logToFile('🚫 Matrix relay: dropped a replayed request', { channel: 'matrix', method: request.method });
    return;
  }

  const impl = implementations[request.method];
  let reply;
  let tmpDir = null;
  try {
    if (typeof impl !== 'function') throw new Error(`unknown Matrix driver method "${request.method}"`);
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rumi-matrix-relay-'));
    const decoded = decodeArgs(request.method, request.args, tmpDir);
    const context = { job: typeof request.job === 'string' ? request.job : null };
    const result = await relayedCallContext.run(context, () => impl(...decoded));
    reply = { ok: true, result: encodeValue(result === undefined ? null : result) };
  } catch (error) {
    if (error instanceof RelayRefusal) {
      logToFile('🚫 Matrix relay: refused a request argument', { channel: 'matrix', method: request.method, reason: error.message });
    }
    reply = { ok: false, error: error.message };
  } finally {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  }
  const replyKey = keys.replyKey(request.id);
  await redis.lpush(replyKey, signed(keys.signingKey, { v: PROTOCOL_VERSION, id: request.id, ...reply }));
  await redis.expire(replyKey, REPLY_TTL_SECONDS);
}

/**
 * Starts serving relayed calls in the process that owns the sync connection.
 * Idempotent. Never throws: a missing REDIS_URL just means there is nothing to
 * relay FROM (no worker can reach us either), which is logged once.
 *
 * @param {Record<string, Function>} implementations the driver's real, local methods
 * @returns {boolean} whether the loop started
 */
function startOwner(implementations) {
  if (ownerStarted) return true;
  let redis;
  let replies;
  let owner;
  try {
    // Derived once: the namespace and key this process serves stay fixed while it runs.
    owner = { keys: deploymentKeys(), seen: new Map() };
    redis = newRedis();
    replies = newRedis();
  } catch (error) {
    logToFile('⚠️ Matrix relay: not serving worker sends -- ' + error.message, { channel: 'matrix' });
    return false;
  }
  ownerStarted = true;
  let running = true;
  stopOwner = () => { running = false; redis.disconnect(); replies.disconnect(); };

  (async function loop() {
    while (running) {
      try {
        // eslint-disable-next-line no-await-in-loop -- a blocking pop loop, by design
        const popped = await redis.brpop(owner.keys.requestList, 5);
        if (popped) {
          runRequest(replies, popped[1], implementations, owner).catch((error) => {
            logToFile('❌ Matrix relay: failed to answer a request', { channel: 'matrix', error: error.message });
          });
        }
      } catch (error) {
        if (!running) break;
        logToFile('⚠️ Matrix relay: request loop error, retrying', { channel: 'matrix', error: error.message });
        // eslint-disable-next-line no-await-in-loop -- backoff before retrying the pop
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  }());

  logToFile('✅ Matrix relay: serving Matrix sends for worker processes', { channel: 'matrix' });
  return true;
}

/** Stops the owner loop / drops the caller connection (shutdown and tests). */
function close() {
  if (stopOwner) stopOwner();
  stopOwner = null;
  ownerStarted = false;
  if (callerRedis) callerRedis.disconnect();
  callerRedis = null;
}

function _resetForTests() {
  close();
  relayMode = false;
  connectionOwner = false;
  replyTimeoutMs = DEFAULT_TIMEOUT_MS;
}

function _setTimeoutForTests(ms) {
  replyTimeoutMs = ms;
}

module.exports = {
  ownConnectionInThisProcess,
  useRelayForThisProcess,
  isRelayMode,
  call,
  forJob,
  currentJob,
  relayedCall,
  startOwner,
  close,
  // exported for unit tests
  _ARG_KINDS: ARG_KINDS,
  _requestListKey: () => deploymentKeys().requestList,
  _encodeArgs: encodeArgs,
  _decodeArgs: decodeArgs,
  _runRequest: runRequest,
  _resetForTests,
  _setTimeoutForTests,
};
