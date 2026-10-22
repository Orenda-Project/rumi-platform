/**
 * probes -- live checks for the optional services Rumi only checks for presence.
 *
 * Rumi's own doctor tests the required services, Slack, Discord and Matrix for
 * real, but for the rest it only reports "keys present": a mistyped ElevenLabs
 * key shows as "on" until a teacher asks for a voice reply and gets nothing.
 * These close that gap from the launcher side, without touching Rumi.
 *
 * Every check is one request that is free, read-only and creates nothing:
 *
 *   soniox      GET  api.soniox.com/v1/files                      list uploaded files
 *   elevenlabs  GET  api.elevenlabs.io/v1/voices                  list voices (Rumi calls it too)
 *   uplift      GET  api.upliftai.org/v1/synthesis/phrase-replacement-config
 *   azure       POST <region>.api.cognitive.microsoft.com/sts/v1.0/issueToken
 *               -- a short-lived token; also proves the region is real
 *   gamma       GET  public-api.gamma.app/v1.0/themes             list workspace themes
 *   mistral     GET  api.mistral.ai/v1/models                     list models
 *   kie         GET  api.kie.ai/api/v1/chat/credit                read the credit balance
 *   axiom       POST api.axiom.co/v1/datasets/<dataset>/ingest    with an empty body: tests
 *               the token's ingest right on that dataset, writes no events
 *
 * Auth headers match how Rumi itself calls each one (bot/shared/services/...).
 * Each probe returns the same shape as Rumi's doctor probes -- {ok, detail} --
 * so the wizard's routes treat both alike. Details never contain a key.
 *
 * What a pass cannot tell you: whether the plan includes the feature or has
 * credit left (Kie is the exception -- its balance is shown), or whether a
 * scoped key has every permission the feature needs beyond the one read here.
 *
 * @module onboarding/probes
 */

const TIMEOUT_MS = 15000;

/** Value of an env key, or '' -- with the same placeholder rule the sidebar uses. */
function value(env, key) {
  const v = String(env[key] || '').trim();
  return /^CHANGEME|your-project|your_|^YOUR_|^<.*>$/i.test(v) ? '' : v;
}

/**
 * One request, reduced to {ok, detail}.
 *
 * @param {string} service    name used in messages
 * @param {string} url
 * @param {object} init       fetch options
 * @param {function} [read]   (status, bodyText) => {ok, detail} | undefined, to
 *                            override the default status-code reading
 */
async function check(service, url, init, read) {
  let response;
  try {
    response = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (error) {
    const code = error.cause && error.cause.code;
    if (code === 'ENOTFOUND') return { ok: false, detail: `could not reach ${new URL(url).host}` };
    if (error.name === 'TimeoutError') return { ok: false, detail: `${service} did not answer within ${TIMEOUT_MS / 1000}s` };
    return { ok: false, detail: `could not reach ${service}: ${code || error.message}` };
  }
  const body = await response.text().catch(() => '');
  const custom = read && read(response.status, body);
  if (custom) return custom;

  if (response.ok) return { ok: true, detail: 'key accepted' };
  if (response.status === 401) return { ok: false, detail: `${service} rejected the key (401)` };
  if (response.status === 403) return { ok: false, detail: `${service} refused this key (403) — check its permissions or plan` };
  if (response.status === 429) return { ok: true, detail: 'key accepted (rate-limited right now)' };
  return { ok: false, detail: `${service} answered HTTP ${response.status}` };
}

const bearer = (token) => ({ Authorization: `Bearer ${token}` });

const PROBES = {
  soniox: {
    keys: ['SONIOX_API_KEY'],
    run: (env) => check('Soniox', 'https://api.soniox.com/v1/files', { headers: bearer(value(env, 'SONIOX_API_KEY')) }),
  },

  elevenlabs: {
    keys: ['ELEVENLABS_API_KEY'],
    run: (env) => check('ElevenLabs', 'https://api.elevenlabs.io/v1/voices', {
      headers: { 'xi-api-key': value(env, 'ELEVENLABS_API_KEY') },
    }),
  },

  uplift: {
    keys: ['UPLIFT_API_KEY'],
    run: (env) => check('Uplift', 'https://api.upliftai.org/v1/synthesis/phrase-replacement-config', {
      headers: bearer(value(env, 'UPLIFT_API_KEY')),
    }),
  },

  azure: {
    keys: ['AZURE_SPEECH_KEY', 'AZURE_SPEECH_REGION'],
    run: async (env) => {
      const region = value(env, 'AZURE_SPEECH_REGION').toLowerCase();
      // A region is a short slug like "eastus". Anything else would be put
      // straight into a hostname, so refuse it rather than request it.
      if (!/^[a-z0-9-]{2,40}$/.test(region)) return { ok: false, detail: `"${region}" is not an Azure region name (e.g. eastus)` };
      const result = await check('Azure Speech', `https://${region}.api.cognitive.microsoft.com/sts/v1.0/issueToken`, {
        method: 'POST',
        headers: { 'Ocp-Apim-Subscription-Key': value(env, 'AZURE_SPEECH_KEY'), 'Content-Length': '0' },
      }, (status) => {
        if (status === 401) return { ok: false, detail: `Azure rejected the key for region ${region} — wrong key, or a key from another region` };
        return undefined;
      });
      // No such host means no such region: say which setting to fix.
      if (!result.ok && result.detail.startsWith('could not reach')) {
        return { ok: false, detail: `there is no Azure region called "${region}" — check AZURE_SPEECH_REGION (e.g. eastus)` };
      }
      return result;
    },
  },

  gamma: {
    keys: ['GAMMA_API_KEY'],
    run: (env) => check('Gamma', 'https://public-api.gamma.app/v1.0/themes', {
      headers: { 'X-API-KEY': value(env, 'GAMMA_API_KEY') },
    }, (status) => {
      if (status === 403) return { ok: false, detail: 'Gamma refused this key (403) — API access needs a paid Gamma plan' };
      return undefined;
    }),
  },

  mistral: {
    keys: ['MISTRAL_API_KEY'],
    run: (env) => check('Mistral', 'https://api.mistral.ai/v1/models', { headers: bearer(value(env, 'MISTRAL_API_KEY')) }),
  },

  kie: {
    keys: ['KIE_API_KEY'],
    // Kie answers HTTP 200 even for a bad key and puts the real status in the
    // body ({"code":401,...}), so the body decides, not the status line.
    run: (env) => check('Kie.ai', 'https://api.kie.ai/api/v1/chat/credit', {
      headers: { ...bearer(value(env, 'KIE_API_KEY')), Accept: 'application/json' },
    }, (status, text) => {
      let body;
      try { body = JSON.parse(text); } catch { return undefined; }
      if (body.code === 200) {
        const credits = Number(body.data);
        if (Number.isFinite(credits) && credits <= 0) return { ok: false, detail: 'key accepted, but the account has no credits left' };
        return { ok: true, detail: Number.isFinite(credits) ? `key accepted — ${credits.toLocaleString('en-US')} credits left` : 'key accepted' };
      }
      if (body.code === 401) return { ok: false, detail: 'Kie.ai rejected the key (401)' };
      if (body.code) return { ok: false, detail: `Kie.ai answered code ${body.code}` };
      return undefined;
    }),
  },

  axiom: {
    keys: ['AXIOM_DATASET', 'AXIOM_TOKEN'],
    run: (env) => {
      const dataset = value(env, 'AXIOM_DATASET');
      return check('Axiom', `https://api.axiom.co/v1/datasets/${encodeURIComponent(dataset)}/ingest`, {
        method: 'POST',
        headers: { ...bearer(value(env, 'AXIOM_TOKEN')), 'Content-Type': 'application/x-ndjson' },
        body: '',
      }, (status) => {
        if (status === 404) return { ok: false, detail: `the token works, but there is no dataset named "${dataset}"` };
        if (status === 403) return { ok: false, detail: `the token is not allowed to send to "${dataset}" (403)` };
        return undefined;
      });
    },
  },
};

/** Which probe tests a given env key, for the wizard's per-field test. */
const PROBE_FOR_KEY = Object.fromEntries(
  Object.entries(PROBES).flatMap(([name, probe]) => probe.keys.map((key) => [key, name])),
);

/**
 * Run one probe by name. Own-property lookup only: a bare PROBES[name] would
 * resolve "constructor" and friends (see routes/credentials.js for why that matters).
 *
 * @returns {Promise<{ok: boolean, detail: string}>|null} null if no such probe
 */
function runProbe(name, env) {
  if (!Object.prototype.hasOwnProperty.call(PROBES, name)) return null;
  const probe = PROBES[name];
  const missing = probe.keys.filter((key) => !value(env, key));
  if (missing.length === probe.keys.length) return Promise.resolve({ ok: false, detail: `not set: ${missing.join(' and ')}` });
  if (missing.length) return Promise.resolve({ ok: false, detail: `also needs ${missing.join(' and ')}` });
  return probe.run(env);
}

/** Run every probe whose keys are all set; the rest are not configured, so skipped. */
async function runConfigured(env) {
  const configured = Object.entries(PROBES).filter(([, probe]) => probe.keys.every((key) => value(env, key)));
  const results = await Promise.all(configured.map(async ([name, probe]) => {
    const result = await probe.run(env);
    return { name, keys: probe.keys, status: result.ok ? 'pass' : 'fail', detail: result.detail };
  }));
  return results;
}

module.exports = { PROBES, PROBE_FOR_KEY, runProbe, runConfigured };
