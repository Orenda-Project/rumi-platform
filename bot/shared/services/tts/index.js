'use strict';
/**
 * The voice gateway: the one place a feature asks for a voice note.
 *
 *   const voice = await tts.synthesize({
 *     text, language, useCase: 'conversation', site: 'voice_reply', correlationId,
 *     legacy: () => AudioService.generateSpeechForLanguage(text, language),   // today's call, unchanged
 *   });
 *   await deliverTts(voice, { sendOgg, legacySend });
 *
 * A site says WHAT it is saying (use case + site); configuration (routing.js) says WHO says it. With no
 * TTS_* variable set the answer is "legacy": the site's own vendor call runs exactly as it did before this
 * module, and its bytes come back untouched. When Soniox is chosen and cannot speak (no voice for the
 * language, no key, an error, a deadline), legacy speaks instead, so a Soniox problem is never silence.
 *
 * The legacy path must see exactly what it saw before, so the gateway never checks or changes the text it
 * hands to legacy.
 */

const { resolveProvider, USE_CASES } = require('./routing');
const { effectiveLanguage, sonioxSkipReason, sonioxCodeFor, sonioxVoiceFor, ignoredVoiceVariables } = require('./languages');
const { prepareForSoniox, splitForSoniox } = require('./text/soniox-text');
const { checkComplete } = require('./ogg-opus');
const { createSonioxProvider, DEFAULT_LIMITS, sonioxVoiceKey } = require('./providers/soniox.provider');
// Called through the module objects, not destructured, so a test can watch the exact lines production writes.
const audioFormat = require('./audio-format');
const logger = require('./log');
const structured = require('../../utils/structured-logger');

// The time limit bounds the Soniox attempt only. Legacy is never timed: ElevenLabs alone takes over 45 s on
// about 1,200 calls a month, and cutting it off would turn a slow note into no note.
//
// Soniox speaks at about real time per request and a process sends only `cap` parts at once, so a note takes
// about ceil(parts / cap) rounds of one part each. Measured at cap 2: English 5 parts, 62 s
// of audio, 26 s; Arabic 5 parts, 89 s, 38 s. An Arabic part is about 18 s of
// audio, so 30 s a round leaves room; a fixed 45 s made a 6-part Arabic note fall back every time and the
// teacher waited 45 s for nothing. 45 s stays the floor for a short note.
const MIN_DEADLINE_MS = 45000;
const ROUND_MS = 30000;

// A caller's own deadlineMs is used as given. A provider with no cap (a test double) counts as one slot.
function deadlineFor(partCount, provider, given) {
  if (given !== undefined) return given;
  const cap = Number.isFinite(provider.maxConcurrency) && provider.maxConcurrency >= 1 ? provider.maxConcurrency : 1;
  return Math.max(MIN_DEADLINE_MS, Math.ceil(partCount / cap) * ROUND_MS);
}

class TtsUnavailableError extends Error {
  constructor(message, failures) {
    super(message);
    this.name = 'TtsUnavailableError';
    this.failures = failures;
  }
}

// Bookkeeping must never cost a voice note. Several test suites stub the loggers partly, and a logger can
// throw; either way the line is lost and the note goes on. Called by name on the module object, so a spy
// set on it still sees the call.
function quietly(target, name, ...args) {
  try {
    return typeof target[name] === 'function' ? target[name](...args) : undefined;
  } catch (_) {
    return undefined;
  }
}

function fail(code, message) {
  return Object.assign(new Error(message), { code });
}

// One entry of failures[]. Its keys avoid `status`/`error`/`message`, as the log lines' own keys do.
function describeFailure(provider, error) {
  return {
    provider,
    reason: (error && error.code) || 'error',
    httpStatus: (error && (error.status || (error.response && error.response.status))) || undefined,
    detail: String((error && error.message) || error).slice(0, 300),
  };
}

/**
 * Runs `run(signal)` but gives up at `ms`: the signal is aborted, so the Soniox requests stop and give
 * their slots back, and the caller moves on to legacy without waiting for them.
 */
async function withDeadline(run, ms) {
  if (!(ms > 0)) return run(undefined);
  const controller = new AbortController();
  let timer;
  const expired = new Promise((resolve, reject) => {
    timer = setTimeout(() => {
      reject(fail('deadline', `No Soniox voice within ${ms} ms`)); // settle first, so the deadline is the reason
      controller.abort();
    }, ms);
  });
  try {
    return await Promise.race([run(controller.signal), expired]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @param {object} [deps]
 * @param {object} [deps.env]       read on every call, so a variable change plus a restart is the whole rollout
 * @param {object} [deps.provider]  the Soniox transport; one per gateway, so its slot cap is per process
 */
function createTtsGateway({ env = process.env, provider = createSonioxProvider({ env }) } = {}) {
  // A bad setting is reported once per distinct value, not on every voice note it touches.
  const reported = new Set();
  function reportIgnored(values, context) {
    for (const value of values) {
      if (reported.has(value)) continue;
      reported.add(value);
      quietly(logger, 'logError', 'tts.config.ignored', { event: 'tts.config.ignored', ignored: value, ...context });
    }
  }

  // Bracketed text that was not a voice direction was not spoken. A template placeholder ("[Teacher Name]",
  // a slot written in Urdu) means the teacher missed something: an error, fixed at its source. An unknown
  // lower-case direction only loses a tone.
  function reportDropped(dropped, context) {
    if (!dropped.length) return;
    const placeholders = dropped.filter((d) => /[^\x20-\x7E]|\[\s*[A-Z]/.test(d));
    const data = { event: 'tts.text.dropped', ...context, dropped: (placeholders.length ? placeholders : dropped).slice(0, 5) };
    quietly(logger, placeholders.length ? 'logError' : 'logWarn', 'tts.text.dropped', data);
  }

  async function synthesize({
    text, language, useCase, site, format = 'native', correlationId, legacy, deadlineMs,
  } = {}) {
    const started = Date.now();
    const corr = correlationId || quietly(structured, 'getCurrentCorrelationId') || undefined;
    const ids = corr ? { correlationId: corr } : {};
    const context = { ...ids, useCase, site };

    let route;
    try {
      route = resolveProvider({ useCase, site, env });
    } catch (error) {
      // A misspelled use case or site is a caller bug. It is logged loudly; the teacher still gets today's voice.
      quietly(logger, 'logError', 'tts.config.invalid', { event: 'tts.config.invalid', ...context, reason: error.message });
      route = { provider: 'legacy', source: 'invalid', ignored: [] };
    }
    reportIgnored([...route.ignored, ...ignoredVoiceVariables(env)], context);

    // Logs the one tts.synthesize.ok line and builds what the site gets back.
    function finish({ audio, provider: spokeWith, spokenLanguage, voice = null, durationSec = null,
      parts = null, attempts = null, unclosed = null, fallbackFrom = null, skipReason = null, deadlineMs: limit = null }) {
      const latencyMs = Date.now() - started;
      const result = {
        audio, provider: spokeWith, format: audioFormat.detectFormat(audio), durationSec, voice, language, spokenLanguage,
        parts, attempts, latencyMs, fallbackFrom, skipReason, unclosed, useCase, site,
      };
      quietly(structured, 'logEvent', 'tts.synthesize.ok', {
        ...context, language, spokenLanguage, provider: spokeWith, voice, parts, attempts,
        audioSec: durationSec == null ? null : Math.round(durationSec * 10) / 10,
        bytes: audio && audio.length, format: result.format, unclosed, fallbackFrom, skipReason,
        deadlineMs: limit, source: route.source, durationMs: latencyMs,
      });
      return result;
    }

    // today's call, as it is. No check on the text or the audio, no transform, no timer, and its
    // exception reaches the site unchanged.
    if (route.provider === 'legacy') {
      return finish({ audio: await legacy(), provider: 'legacy', spokenLanguage: language });
    }

    // the voice follows the script of the text; a language Soniox cannot speak is a skip, not an error.
    const spokenLanguage = effectiveLanguage({ language, text });
    const skipReason = sonioxSkipReason(spokenLanguage, env);
    if (skipReason) {
      return finish({ audio: await legacy(), provider: 'legacy', spokenLanguage: language, skipReason });
    }

    let spoken;
    let parts = null;
    let limit = null;
    try {
      // chosen but not set up is a failure, so a missing key shows up as a fallback rate.
      if (!sonioxVoiceKey(env)) throw fail('not_configured', 'TTS_PROVIDER chose Soniox but no Soniox key is set');
      // the text is prepared exactly once; the provider speaks the parts as given. The time limit is
      // set once the parts are known, because it is the parts that take the time.
      const prepared = prepareForSoniox(text, spokenLanguage);
      reportDropped(prepared.dropped, context);
      if (!prepared.text) throw fail('empty_text', 'Nothing to say once the text was prepared for Soniox');
      parts = splitForSoniox(prepared.text, { targetChars: DEFAULT_LIMITS.targetChars, maxChars: DEFAULT_LIMITS.maxChars });
      limit = deadlineFor(parts.length, provider, deadlineMs);
      spoken = await withDeadline(async (signal) => {
        const voice = sonioxVoiceFor(spokenLanguage, env);
        const out = await provider.synthesize({
          parts, sonioxCode: sonioxCodeFor(spokenLanguage), voice, useCase, site, correlationId: corr, signal,
        });
        const check = checkComplete(out.audio);
        if (!check.ok) throw fail('bad_audio', `Soniox audio is not a whole Ogg Opus stream (${check.reason})`);
        return { ...out, voice, durationSec: check.durationSec };
      }, limit);
      // one MP3 from the joined Ogg. Outside the deadline: nobody is waiting on a video file.
      if (format === 'mp3') spoken.audio = await audioFormat.toMp3(spoken.audio);
    } catch (error) {
      // logged at error, then legacy speaks to completion.
      const failures = [describeFailure('soniox', error)];
      quietly(logger, 'logError', 'tts.synthesize.fallback', {
        event: 'tts.synthesize.fallback', ...context, language, spokenLanguage, provider: 'soniox',
        reason: failures[0].reason, failures, parts: parts && parts.length, deadlineMs: limit,
        source: route.source, durationMs: Date.now() - started,
      });
      let audio;
      try {
        audio = await legacy();
      } catch (legacyError) {
        failures.push(describeFailure('legacy', legacyError));
        quietly(logger, 'logError', 'tts.synthesize.failed', {
          event: 'tts.synthesize.failed', ...context, language, spokenLanguage, failures, durationMs: Date.now() - started,
        });
        throw new TtsUnavailableError(`No voice could speak this ${useCase} voice note`, failures);
      }
      return finish({ audio, provider: 'legacy', spokenLanguage: language, fallbackFrom: 'soniox', deadlineMs: limit });
    }

    return finish({ ...spoken, provider: 'soniox', spokenLanguage, deadlineMs: limit });
  }

  return { synthesize };
}

const gateway = createTtsGateway();

module.exports = {
  synthesize: (args) => gateway.synthesize(args),
  createTtsGateway,
  TtsUnavailableError,
  USE_CASES,
};
