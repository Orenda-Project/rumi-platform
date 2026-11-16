'use strict';
/**
 * Who speaks a voice note: Soniox, or the site's own vendor call as it is today ("legacy").
 *
 * The choice is configuration, never code. A call site says WHAT it is saying
 * (its use case and site) and this module answers WHO says it:
 *
 *   TTS_PROVIDER_<USE_CASE>_<SITE>   one site        e.g. TTS_PROVIDER_COACHING_REPORT_VOICENOTE
 *   TTS_PROVIDER_<USE_CASE>          one use case    e.g. TTS_PROVIDER_CONVERSATION
 *   TTS_PROVIDER                     every voice note
 *   (nothing set)                    legacy — exactly the behaviour before the gateway
 *
 * The first valid setting wins. Every value is read per call, so setting a
 * variable and restarting is the whole rollout, and deleting it the whole rollback.
 */

// The use cases and the sites inside each. The use case is the unit
// a feature is switched by; the site narrows it to one call and labels telemetry.
const USE_CASES = Object.freeze({
  conversation: Object.freeze({ sites: Object.freeze(['voice_reply', 'language_switch', 'name_question', 'name_retry']) }),
  coaching: Object.freeze({ sites: Object.freeze(['question', 'closer', 'report_voicenote']) }),
  reading: Object.freeze({ sites: Object.freeze(['feedback']) }),
  video: Object.freeze({ sites: Object.freeze(['narration']) }),
});

const PROVIDERS = Object.freeze(['soniox', 'legacy']);

function envName(...parts) {
  return ['TTS_PROVIDER', ...parts].filter(Boolean).join('_').toUpperCase();
}

/**
 * @param {object} args
 * @param {string} args.useCase  a key of USE_CASES
 * @param {string} args.site     one of that use case's sites
 * @param {object} [args.env]    defaults to process.env
 * @returns {{ provider: 'soniox'|'legacy', source: string, ignored: string[] }}
 *   source  — the variable that decided, or 'default'
 *   ignored — "NAME=value" for every setting that named neither provider
 */
function resolveProvider({ useCase, site, env = process.env } = {}) {
  // A wrong name would silently skip its own override, so a caller bug fails
  // loudly here — and in that site's tests — instead of in production.
  if (!useCase || !Object.prototype.hasOwnProperty.call(USE_CASES, useCase)) {
    throw new Error(`TTS: unknown use case "${useCase}"; expected one of ${Object.keys(USE_CASES).join(', ')}`);
  }
  if (!USE_CASES[useCase].sites.includes(site)) {
    throw new Error(`TTS: unknown site "${site}" for use case "${useCase}"; expected one of ${USE_CASES[useCase].sites.join(', ')}`);
  }

  const ignored = [];
  for (const name of [envName(useCase, site), envName(useCase), envName()]) {
    const value = String(env[name] || '').trim().toLowerCase();
    if (!value) continue;
    if (PROVIDERS.includes(value)) return { provider: value, source: name, ignored };
    // A typo must not route voice notes anywhere unexpected: report it and let
    // the next setting (or the default) decide.
    ignored.push(`${name}=${value}`);
  }
  return { provider: 'legacy', source: 'default', ignored };
}

module.exports = { resolveProvider, USE_CASES, PROVIDERS };
