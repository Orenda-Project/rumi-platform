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
 * So the worker never connects. It calls useRelayForThisProcess() at startup,
 * and from then on every Matrix driver method is shipped over Redis (the
 * REDIS_URL the BullMQ queue driver already requires) to the ONE process that
 * owns the sync connection -- the bot, which calls startOwner() once its
 * inbound listener is attached. The owner runs the real driver method and
 * pushes the result back. Plain JSON on two Redis lists, no new dependency:
 *
 *   caller: LPUSH rumi:matrix:relay:requests {id, method, args, expiresAt}
 *           BRPOP rumi:matrix:relay:reply:<id>  (timeout)
 *   owner:  BRPOP rumi:matrix:relay:requests -> run -> LPUSH reply:<id>, EXPIRE
 *
 * Arguments that cannot cross a process (and on Railway, a container) boundary
 * are carried by value: Buffers as base64, and local files -- sendDocument's
 * PDF path, sendImage/sendSticker paths, file:// media URLs -- are read by the
 * caller and re-materialised in a temp dir on the owner for the duration of
 * the call. A timeout or an unreachable Redis is reported the way the driver
 * itself reports a failed send (false / null, or a throw for the media
 * lookups whose contract is to throw), and logged -- never a silent hang.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { logToFile } = require('../../utils/logger');

const REQUEST_LIST = 'rumi:matrix:relay:requests';
const REPLY_PREFIX = 'rumi:matrix:relay:reply:';
const DEFAULT_TIMEOUT_MS = 180000; // a video upload from the worker can take a while
const REPLY_TTL_SECONDS = 300;

// Positional arguments that are local file paths, per driver method.
const LOCAL_PATH_ARGS = { sendDocument: [1], sendImage: [1], sendSticker: [1] };

// What the driver itself returns on failure -- the relay returns the same.
const THROWING_METHODS = new Set(['getMediaInfo', 'downloadMedia']);
function failureValue(method) {
  return /ReturningId$/.test(method) ? null : false;
}

let relayMode = false;
let ownerStarted = false;
let callerRedis = null;
let stopOwner = null;

let replyTimeoutMs = DEFAULT_TIMEOUT_MS;

function timeoutMs() {
  return replyTimeoutMs;
}

function newRedis() {
  if (!process.env.REDIS_URL) throw new Error('Matrix relay needs REDIS_URL (the same Redis the BullMQ queue uses)');
  // eslint-disable-next-line global-require -- lazy: requiring this file must never dial Redis
  const IORedis = require('ioredis');
  return new IORedis(process.env.REDIS_URL, { maxRetriesPerRequest: null });
}

/** Called once by a process that must never open its own Matrix sync connection (the worker). */
function useRelayForThisProcess() {
  relayMode = true;
}

/** Whether driver calls in this process go over the relay instead of a local connection. */
function isRelayMode() {
  return relayMode && !ownerStarted;
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

function fileArg(localPath, asUrl) {
  return {
    __rumiFile: { name: path.basename(localPath), data: fs.readFileSync(localPath).toString('base64'), asUrl },
  };
}

/** Caller side: turns driver arguments into JSON-safe values, carrying local files by value. */
function encodeArgs(method, args) {
  const pathArgs = LOCAL_PATH_ARGS[method] || [];
  return args.map((arg, index) => {
    if (pathArgs.includes(index) && typeof arg === 'string' && fs.existsSync(arg)) return fileArg(arg, false);
    if (typeof arg === 'string' && arg.startsWith('file://') && fs.existsSync(arg.slice('file://'.length))) {
      return fileArg(arg.slice('file://'.length), true);
    }
    return encodeValue(arg);
  });
}

/** Owner side: materialises carried files into `tmpDir`, returns the real arguments. */
function decodeArgs(args, tmpDir) {
  return (args || []).map((arg) => {
    if (arg && typeof arg === 'object' && arg.__rumiFile) {
      const { name, data, asUrl } = arg.__rumiFile;
      const target = path.join(tmpDir, path.basename(name) || 'file');
      fs.writeFileSync(target, Buffer.from(data, 'base64'));
      return asUrl ? `file://${target}` : target;
    }
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
    if (!callerRedis) callerRedis = newRedis();
    const request = { id, method, args: encodeArgs(method, args), expiresAt: started + waitMs };
    await callerRedis.lpush(REQUEST_LIST, JSON.stringify(request));

    // A BRPOP blocks its whole connection, so each wait gets its own.
    blocking = newRedis();
    const popped = await blocking.brpop(`${REPLY_PREFIX}${id}`, Math.ceil(waitMs / 1000));
    if (!popped) throw new Error(`no reply from the Matrix sync owner within ${waitMs}ms -- is the bot process running?`);

    const reply = JSON.parse(popped[1]);
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

async function runRequest(redis, request, implementations) {
  const replyKey = `${REPLY_PREFIX}${request.id}`;
  if (request.expiresAt && Date.now() > request.expiresAt) {
    logToFile('⚠️ Matrix relay: dropped a request its caller already gave up on', { channel: 'matrix', method: request.method });
    return;
  }
  const impl = implementations[request.method];
  let reply;
  let tmpDir = null;
  try {
    if (typeof impl !== 'function') throw new Error(`unknown Matrix driver method "${request.method}"`);
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rumi-matrix-relay-'));
    const result = await impl(...decodeArgs(request.args, tmpDir));
    reply = { ok: true, result: encodeValue(result === undefined ? null : result) };
  } catch (error) {
    reply = { ok: false, error: error.message };
  } finally {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  }
  await redis.lpush(replyKey, JSON.stringify(reply));
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
  try {
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
        const popped = await redis.brpop(REQUEST_LIST, 5);
        if (popped) {
          const request = JSON.parse(popped[1]);
          runRequest(replies, request, implementations).catch((error) => {
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
  replyTimeoutMs = DEFAULT_TIMEOUT_MS;
}

function _setTimeoutForTests(ms) {
  replyTimeoutMs = ms;
}

module.exports = {
  useRelayForThisProcess,
  isRelayMode,
  call,
  startOwner,
  close,
  REQUEST_LIST,
  REPLY_PREFIX,
  // exported for unit tests
  _encodeArgs: encodeArgs,
  _decodeArgs: decodeArgs,
  _runRequest: runRequest,
  _resetForTests,
  _setTimeoutForTests,
};
