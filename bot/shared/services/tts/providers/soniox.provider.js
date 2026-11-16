'use strict';
/**
 * Soniox text-to-speech transport — what speaks when the gateway routes a voice note to Soniox.
 *
 * The gateway hands this module text that is ALREADY prepared and split into
 * parts, plus the Soniox language code and the voice. This module only speaks:
 * the parts go out at the same time (within the per-process cap), every part is
 * checked to be a whole Ogg Opus stream, and the parts are joined into ONE Ogg
 * Opus stream — which WhatsApp shows as a voice message with a speed control.
 * It prepares no text and chooses no voice, so the text is cleaned exactly once
 * and the language table (tts/languages.js) stays the one place voices live.
 *
 * Why each safeguard exists (measured on Soniox, not assumed):
 *   - Opus at 48 kHz: at Soniox's default rate the Ogg header states half the
 *     real length.
 *   - Parts: Soniox silently ends any single request at 2 minutes of audio and
 *     speaks at roughly real time, so a long note is split and the parts run in
 *     parallel — a 60-second reply arrives in about the time of its longest part.
 *   - Whole-stream check: a response can be cut mid-body and still arrive as
 *     "200 OK" bytes. A part without its end-of-stream page, at the 2-minute
 *     ceiling, or far too short for its text is retried, never delivered.
 *   - Streamed read: the response is read as it arrives. A clip is taken as soon
 *     as its end-of-stream page is in, because Soniox sometimes sends every byte
 *     of a clip and then never closes the response; and a stream that goes silent
 *     before its end page is given up after a few seconds instead of fifteen.
 *   - Retries only where another try can help: a dropped connection, 408, 429
 *     and 5xx. A 400/401/402/403 fails at once so legacy speaks instead.
 *   - A 429 means the organisation-wide limit (shared by every deployment on the same Soniox account) is
 *     full. It gets more patience than other errors — 1 s, 2 s, 4 s — so a busy
 *     moment clears instead of falling back to the old vendor.
 *
 * The key is SONIOX_TTS_API_KEY when it is set, else SONIOX_API_KEY: one Soniox key can both understand
 * voice notes and speak replies, which is what the setup wizards offer. Set SONIOX_TTS_API_KEY to keep
 * speech on its own key (its own bill and rate limit) apart from transcription.
 */

const realAxios = require('axios');

/** The key Soniox speaks with: the voice key if set, else the transcription key. */
function sonioxVoiceKey(env = {}) {
  return String(env.SONIOX_TTS_API_KEY || env.SONIOX_API_KEY || '').trim();
}
const { checkComplete, concatOggOpus, createEndWatcher } = require('../ogg-opus');

const ENDPOINT = 'https://tts-rt.soniox.com/tts';
const DEFAULT_MODEL = 'tts-rt-v2';
const USER_AGENT = 'voice-gateway/1.0';

const DEFAULT_LIMITS = Object.freeze({
  // How the gateway should split text (splitForSoniox). Parts run at the same
  // time, so the longest one sets the wait. Measured live: a
  // 423-character Urdu reply took 20 s at 300-character parts, 12.6 s at 200,
  // and no less at 150. Soniox bills audio seconds, so smaller parts cost nothing extra.
  targetChars: 200,
  maxChars: 900,           // hard ceiling: ~80 s of audio for the slowest voice, safely under 2 minutes
  maxPartSec: 118,         // audio this long means Soniox's 2-minute cut ended it, not the text
  minSecPerChar: 1 / 40,   // 40 characters a second is faster than any voice speaks: the audio was cut
  minCharsForRateCheck: 80,
  attempts: 3,
  // A 429 waits 1 s, 2 s, 4 s (plus up to a quarter of that again, so many
  // processes hitting the limit together do not all come back at once).
  rateLimitWaitsMs: Object.freeze([1000, 2000, 4000]),
  // A stream can stall. Measured 30 Sep on 110 healthy streams: the first byte
  // by 0.71 s, and never more than 1.61 s between two chunks; 6 of 100 Urdu
  // streams sent the whole clip and then went silent without ever closing.
  // `idleTimeoutMs` is the longest silence allowed, before the first byte and
  // between chunks: 5 s is three times the worst healthy gap, where 15 s only
  // made the teacher wait. `endGraceMs` is how long a response whose end page is
  // already in may take to close (a normal close keeps the connection reusable).
  // `totalCapMs` bounds one request by the length of its text (about 10
  // characters a second for the slowest voice, spoken at roughly real time, with
  // room to spare).
  idleTimeoutMs: 5000,
  endGraceMs: 500,
  totalCapMs: (chars) => Math.max(30000, Math.ceil(chars / 10) * 1500 + 10000),
  // Parts in flight per process. The Soniox limit is per organisation and shared
  // with every other deployment on the account, and the bot runs many processes, so each one
  // starts small; SONIOX_TTS_MAX_CONCURRENCY raises it.
  concurrency: 2,
});

class SonioxTtsError extends Error {
  constructor(code, message, extra = {}) {
    super(message);
    this.name = 'SonioxTtsError';
    this.code = code;
    Object.assign(this, extra);
  }
}

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);


// The reference id lands in Soniox's usage logs. It carries what a cost query
// needs (use case, site, request) and never a phone number: any long digit run
// — which is how a WhatsApp id looks — is removed.
function referenceId({ useCase, site, correlationId, part }) {
  const req = String(correlationId || '').replace(/\d{7,}/g, '').replace(/[^A-Za-z0-9_-]/g, '').slice(-24);
  return ['tts', useCase, site, req || undefined, `p${part}`].filter(Boolean).join('-').slice(0, 250);
}

function isStream(data) {
  return Boolean(data) && typeof data.on === 'function' && typeof data.destroy === 'function';
}


// Soniox's reason for refusing a request: a Buffer when the body was buffered, a
// stream when it was streamed (read for at most a second and 2 KB).
async function readErrorBody(data) {
  try {
    if (!isStream(data)) {
      const text = Buffer.isBuffer(data) ? data.toString('utf8') : (data instanceof ArrayBuffer ? Buffer.from(data).toString('utf8') : String(data || ''));
      return text.slice(0, 300);
    }
    const chunks = [];
    let size = 0;
    await new Promise((resolve) => {
      const stop = setTimeout(resolve, 1000);
      const finish = () => { clearTimeout(stop); resolve(); };
      data.on('data', (chunk) => { chunks.push(Buffer.from(chunk)); size += chunk.length; if (size >= 2048) finish(); });
      data.on('end', finish);
      data.on('error', finish);
    });
    data.destroy();
    return Buffer.concat(chunks).toString('utf8').slice(0, 300);
  } catch (_) {
    return '';
  }
}

/**
 * Reads one streamed Soniox response into the clip it carries. Settles when the
 * response ends, when the clip's end-of-stream page has been in for `endGraceMs`
 * (Soniox sometimes never closes a response whose clip is already whole), or
 * with an error when the stream is silent for `idleMs`, closes early, fails, or
 * the part's time cap aborts it. A body that is already a buffer is returned as is.
 * Resolves to { audio, unclosed }: `unclosed` says the response never closed by itself.
 */
function readAudio(body, { idleMs, endGraceMs, signal }) {
  if (body == null) return Promise.resolve({ audio: Buffer.alloc(0), unclosed: false });
  if (!isStream(body)) return Promise.resolve({ audio: Buffer.from(body), unclosed: false });
  return new Promise((resolve, reject) => {
    const watcher = createEndWatcher();
    let idle = null;
    let grace = null;
    let settled = false;
    const fail = (code, message) => Object.assign(new Error(message), { code });
    const done = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(idle);
      clearTimeout(grace);
      if (signal) signal.removeEventListener('abort', onAbort);
      const unclosed = !body.readableEnded;
      if (unclosed) body.destroy(); // a response that never closes is let go
      if (error) reject(error);
      else resolve({ audio: watcher.buffer(), unclosed });
    };
    function onAbort() { done(fail('ERR_CANCELED', 'canceled: the part ran past its time cap')); }
    const armIdle = () => {
      clearTimeout(idle);
      idle = setTimeout(() => done(fail('ESILENT', `the stream went silent for ${idleMs} ms before its end page`)), idleMs);
    };
    if (signal) {
      if (signal.aborted) { onAbort(); return; }
      signal.addEventListener('abort', onAbort);
    }
    body.on('data', (chunk) => {
      if (settled) return;
      if (watcher.push(chunk)) {
        clearTimeout(idle);
        if (!grace) grace = setTimeout(() => done(), endGraceMs);
      } else {
        armIdle();
      }
    });
    body.on('end', () => done());
    body.on('error', (error) => done(watcher.ended ? null : error));
    body.on('close', () => done(watcher.ended ? null : fail('ECLOSED', 'the stream closed before its end page')));
    armIdle();
  });
}

function createSemaphore(getLimit) {
  let active = 0;
  const waiting = [];
  // A freed slot is handed straight to the next waiter (the count does not
  // drop), so a newcomer cannot slip in between and push past the limit.
  const release = () => {
    const next = waiting.shift();
    if (next) next();
    else active -= 1;
  };
  return async function withSlot(fn) {
    if (active >= Math.max(1, getLimit())) await new Promise((resolve) => waiting.push(resolve));
    else active += 1;
    try {
      return await fn();
    } finally {
      release();
    }
  };
}

/**
 * @param {object} [deps]
 * @param {{ post: Function }} [deps.http]  axios-compatible client (the network boundary)
 * @param {object} [deps.env]               read on every call, so a restart is the whole config change
 * @param {Function} [deps.sleep]           backoff delay (tests pass an instant one)
 * @param {object} [deps.limits]            overrides of DEFAULT_LIMITS
 * @param {Function} [deps.warn]            (message, data) for each retried attempt; the repo logger by default
 */
function createSonioxProvider({ http = realAxios, env = process.env, sleep, limits = {}, warn } = {}) {
  const wait = sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  // A retry the teacher never notices is still a vendor misbehaving: each one is
  // logged at warn with its reason, so a rising rate shows before an outage does.
  const logRetry = warn || ((message, data) => require('../log').logWarn(message, data));
  const lim = { ...DEFAULT_LIMITS, ...limits };
  const apiKey = () => sonioxVoiceKey(env);
  const concurrency = () => {
    const n = parseInt(env.SONIOX_TTS_MAX_CONCURRENCY, 10);
    return Number.isFinite(n) && n > 0 ? n : lim.concurrency;
  };
  const withSlot = createSemaphore(concurrency);

  function checkPart(audio, text) {
    const check = checkComplete(audio);
    if (!check.ok) return `stream ${check.reason}`;
    if (check.durationSec >= lim.maxPartSec) return `stream stopped at the ${Math.round(check.durationSec)} s ceiling`;
    const chars = [...text].length;
    if (lim.minSecPerChar > 0 && chars >= lim.minCharsForRateCheck && check.durationSec < chars * lim.minSecPerChar) {
      return `${check.durationSec.toFixed(1)} s is too short for ${chars} characters`;
    }
    return null;
  }

  // A 429 is the shared organisation limit being full: it gets its own, longer
  // schedule and one more try. Everything else retryable keeps the short one.
  function nextWaitMs(error, attempt) {
    if (error.status === 429) {
      if (attempt > lim.rateLimitWaitsMs.length) return null;
      const base = lim.rateLimitWaitsMs[attempt - 1];
      return base + Math.floor(Math.random() * (base / 4));
    }
    if (attempt >= lim.attempts) return null;
    return 400 * 2 ** (attempt - 1) + Math.floor(Math.random() * 250);
  }

  async function speakPart({ text, lang, voice, model, ref, part, useCase, site, signal }) {
    let lastError = null;
    // The caller (the gateway, at its deadline) has stopped waiting: no further request, no retry wait,
    // and no slot held — the slots are few per process and shared by every teacher it serves.
    const stopIfAborted = (attempts) => {
      if (signal && signal.aborted) throw new SonioxTtsError('aborted', 'Soniox TTS: the caller stopped waiting', { attempts });
    };
    for (let attempt = 1; ; attempt += 1) {
      if (attempt > 1) {
        stopIfAborted(attempt - 1);
        const ms = nextWaitMs(lastError, attempt - 1);
        if (ms == null) break;
        logRetry('tts.soniox.retry', {
          event: 'tts.soniox.retry', useCase, site, part, attempt: attempt - 1, reason: lastError.message, status: lastError.status,
        });
        await wait(ms);
      }
      stopIfAborted(attempt - 1);
      try {
        // The slot is held until the body is read, not just until the headers arrive.
        const { audio, unclosed } = await withSlot(async () => {
          stopIfAborted(attempt - 1); // it may have waited in the queue past the deadline
          const controller = new AbortController();
          const cap = setTimeout(() => controller.abort(), lim.totalCapMs([...text].length));
          const onCallerAbort = () => controller.abort();
          if (signal) signal.addEventListener('abort', onCallerAbort);
          try {
            const response = await http.post(ENDPOINT, {
              model,
              text,
              language: lang,
              voice,
              audio_format: 'opus',
              sample_rate: 48000,
              bitrate: 64000,
              client_reference_id: ref,
            }, {
              headers: {
                Authorization: `Bearer ${apiKey()}`,
                'Content-Type': 'application/json',
                'User-Agent': USER_AGENT,
              },
              responseType: 'stream',
              timeout: lim.idleTimeoutMs, // the wait for the first byte; readAudio watches the gaps after it
              signal: controller.signal,
            });
            return await readAudio(response.data, { idleMs: lim.idleTimeoutMs, endGraceMs: lim.endGraceMs, signal: controller.signal });
          } finally {
            clearTimeout(cap);
            if (signal) signal.removeEventListener('abort', onCallerAbort);
          }
        });
        const problem = checkPart(audio, text);
        if (!problem) return { audio, attempts: attempt, unclosed };
        lastError = new SonioxTtsError('incomplete_audio', `Soniox returned an incomplete voice note: ${problem}`);
      } catch (error) {
        if (error instanceof SonioxTtsError) throw error;
        stopIfAborted(attempt);
        // A 2xx status on an error means the stream broke AFTER its header — a
        // mid-body cut or the idle timeout (axios attaches the 200 response to
        // both). That is the stream failing, not Soniox refusing: retry it.
        const status = error.response?.status;
        const refused = status && (status < 200 || status >= 300);
        if (refused && !RETRYABLE_STATUS.has(status)) {
          throw new SonioxTtsError('http_error', `Soniox TTS ${status}: ${await readErrorBody(error.response?.data)}`, { status, attempts: attempt });
        }
        lastError = refused
          ? new SonioxTtsError('http_error', `Soniox TTS ${status}: ${await readErrorBody(error.response?.data)}`, { status })
          : new SonioxTtsError('network_error', `Soniox TTS stream failed (${error.code || 'network'}): ${error.message}`);
      }
      lastError.attempts = attempt;
    }
    throw lastError;
  }

  /**
   * @param {object} args
   * @param {string[]} args.parts        prepared, split text (prepareForSoniox → splitForSoniox, in the gateway)
   * @param {string} args.sonioxCode     Soniox's language code ('en', 'ur', 'pa', 'ar', …)
   * @param {string} args.voice          the Soniox voice name, chosen by the gateway from tts/languages.js
   * @param {string} [args.useCase]      for telemetry and Soniox's usage log
   * @param {string} [args.site]
   * @param {string} [args.correlationId]
   * @param {AbortSignal} [args.signal]  aborting it ends the in-flight requests and frees their slots
   * @returns {Promise<{ audio: Buffer, parts: number, attempts: number, unclosed: number }>}
   */
  async function synthesize({ parts, sonioxCode, voice, useCase, site, correlationId, signal } = {}) {
    if (!apiKey()) throw new SonioxTtsError('not_configured', 'Neither SONIOX_TTS_API_KEY nor SONIOX_API_KEY is set');
    if (!voice) throw new SonioxTtsError('no_voice', 'No Soniox voice was given');
    if (!sonioxCode) throw new SonioxTtsError('no_language', 'No Soniox language code was given');
    // Nothing to say is a caller bug, not a voice note: never pay for silence.
    if (!Array.isArray(parts) || parts.length === 0
      || parts.some((p) => typeof p !== 'string' || !p.replace(/\[[^\]]*\]/g, '').trim())) {
      throw new SonioxTtsError('empty_text', 'Nothing to say: no parts, or a part with no words');
    }
    const tooLong = parts.findIndex((p) => [...p].length > lim.maxChars);
    if (tooLong !== -1) {
      throw new SonioxTtsError('part_too_long', `Part ${tooLong} is over ${lim.maxChars} characters; Soniox would cut it at 2 minutes`);
    }
    const model = env.SONIOX_TTS_MODEL || DEFAULT_MODEL;

    const results = await Promise.all(parts.map((text, i) => speakPart({
      text, lang: sonioxCode, voice, model, ref: referenceId({ useCase, site, correlationId, part: i }), part: i, useCase, site, signal,
    })));

    return {
      audio: concatOggOpus(results.map((r) => r.audio)),
      parts: parts.length,
      attempts: results.reduce((sum, r) => sum + r.attempts, 0), // requests made, across all parts
      // Parts whose response never closed and were taken at their end page. The
      // teacher does not feel it any more, so it is counted: a rising number is
      // Soniox misbehaving before it is an outage.
      unclosed: results.filter((r) => r.unclosed).length,
    };
  }

  return {
    name: 'soniox',
    isConfigured: () => Boolean(apiKey()),
    // Read-only: the gateway sizes its time limit by how many rounds of parts this cap makes.
    get maxConcurrency() { return concurrency(); },
    synthesize,
  };
}

module.exports = { sonioxVoiceKey, createSonioxProvider, sonioxProvider: createSonioxProvider(), SonioxTtsError, DEFAULT_LIMITS, ENDPOINT };
