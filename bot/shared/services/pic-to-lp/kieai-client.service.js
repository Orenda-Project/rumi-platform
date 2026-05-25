/**
 * Kie.ai Client
 *
 * Standalone wrapper around the Kie.ai jobs API for the pic-to-LP backend.
 * Mirrors the gamma-client.service.js shape so the handoff service can swap
 * callers cleanly.
 *
 * Routing:
 *   language='en' → gpt-image-2-image-to-image at 1K resolution (~80s)
 *   language ∈ {'ur','sd','pa'} → gpt-image-2-image-to-image at 2K (~4 min)
 *
 * The 2K Urdu path is cheaper per image than nano-banana-pro at the cost of
 * ~60s extra latency. The teacher is told the expected wait upfront via the
 * pic-lp-wait-message service.
 *
 * NOTE: Different model identifier prefix means different request shape:
 *   gpt-image-2-image-to-image  → uses `input_urls` array
 *   nano-banana-pro / nano-banana-2 → use `image_input` array
 * (The nano-banana variants aren't used by default, but the detection logic
 *  is kept for future flexibility.)
 */

const https = require('https');
const { logToFile } = require('../../utils/logger');
const { KIE_API_KEY_PIC_LP, KIE_MAX_ATTEMPTS, KIE_POLL_INTERVAL } = require('../../utils/constants');
// Pic-to-LP uses its dedicated key (falls back to the shared KIE_API_KEY if
// unset) so its rate-limit budget is isolated from other image features.
const KIE_API_KEY = KIE_API_KEY_PIC_LP;

const KIE_API_HOST = 'api.kie.ai';
const SOCKET_TIMEOUT_MS = 60000;
const RETRY_TRANSIENT_RE = /ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket timeout|socket hang up/;

/**
 * Pick model + resolution by language. Codified as the locked routing rule.
 *
 * @param {string} language - 'en' | 'ur' | 'sd' | 'pa'
 * @returns {{model: string, resolution: string, costUsdPerPage: number, expectedSec: number, upperSec: number}}
 */
function pickBackend(language) {
  // Latin-script languages → 1K (cheaper + faster; sufficient glyph fidelity
  // for Latin). RTL non-Latin → 2K (Nastaliq + Naskh glyphs need the extra
  // pixels per character).
  const LATIN_SCRIPT = ['en', 'sw']; // English, Kiswahili
  if (LATIN_SCRIPT.includes(language)) {
    return {
      model: 'gpt-image-2-image-to-image',
      resolution: '1K',
      costUsdPerPage: 0.03,
      expectedSec: 90,
      upperSec: 180,
    };
  }
  // Urdu (Nastaliq), Sindhi (Nastaliq), Punjabi (Shahmukhi/Nastaliq), Arabic (Naskh)
  return {
    model: 'gpt-image-2-image-to-image',
    resolution: '2K',
    costUsdPerPage: 0.05,
    expectedSec: 240,
    upperSec: 420,
  };
}

/**
 * Pick the input-array field name for a given model.
 * Detection is by prefix because Kie.ai's API field name varies.
 */
function inputFieldFor(model) {
  if (model && model.startsWith('gpt-image-2')) return 'input_urls';
  return 'image_input'; // nano-banana-pro / nano-banana-2 / google/nano-banana-edit
}

function httpsRequestOnce(opts, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (_) { reject(new Error(`Bad JSON from kie.ai: ${data.slice(0, 200)}`)); }
      });
    });
    req.on('error', reject);
    req.setTimeout(SOCKET_TIMEOUT_MS, () => req.destroy(new Error('socket timeout')));
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function httpsRequest(opts, body, maxRetries = 5) {
  let lastErr;
  for (let i = 0; i < maxRetries; i++) {
    try { return await httpsRequestOnce(opts, body); }
    catch (e) {
      lastErr = e;
      const transient = RETRY_TRANSIENT_RE.test(e.message);
      if (!transient && i === 0) throw e;
      const wait = Math.min(2000 * Math.pow(2, i), 16000);
      logToFile(`Kie.ai retry ${i + 1}/${maxRetries}: ${e.message} (sleeping ${wait}ms)`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw lastErr;
}

// GPT-Image-2's output moderation is stochastic — the same prompt + same inputs
// can fail one attempt and succeed the next (e.g. a benign educational biology
// illustration with a student-cast hook scene can trip a false positive). One
// stochastic flag shouldn't strand a teacher, so retry up to MAX_CP_RETRIES
// times before declaring the generation terminal.
const CONTENT_POLICY_RE = /content polic|may violate/i;
const MAX_CP_RETRIES = 2;

/**
 * Generate one image via Kie.ai (createTask + poll until success).
 *
 * Retries on stochastic content-policy false positives up to MAX_CP_RETRIES
 * times. All other failure modes (timeout, createTask error, malformed
 * response) remain terminal on first occurrence.
 *
 * @param {Object} opts
 * @param {string} opts.prompt        - The image prompt (under 10K chars)
 * @param {string[]} opts.inputUrls   - Reference image URLs (logo + textbook page)
 * @param {string} opts.language      - 'en' | 'ur' | 'sd' | 'pa' (drives routing)
 * @param {string} opts.label         - Diagnostic label for logs
 * @returns {Promise<{success: boolean, url?: string, generationMs?: number, error?: string, model?: string, resolution?: string, attempts?: number}>}
 */
async function generate({ prompt, inputUrls, language, label }) {
  if (!KIE_API_KEY) {
    return { success: false, error: 'KIE_API_KEY env var is missing' };
  }
  const tStart = Date.now();
  let lastResult = null;
  for (let attempt = 1; attempt <= MAX_CP_RETRIES + 1; attempt++) {
    const attemptLabel = attempt === 1 ? label : `${label}#retry${attempt - 1}`;
    lastResult = await _singleAttempt({ prompt, inputUrls, language, label: attemptLabel });
    if (lastResult.success) {
      return { ...lastResult, attempts: attempt };
    }
    // Only retry on content-policy false positives; all other errors terminal.
    if (!CONTENT_POLICY_RE.test(lastResult.error || '')) {
      return { ...lastResult, attempts: attempt };
    }
    if (attempt > MAX_CP_RETRIES) break;
    const waitMs = 1000 * attempt; // 1s, 2s
    logToFile('Kie.ai content-policy false positive — retrying', {
      label, attempt, nextAttemptIn: waitMs, error: lastResult.error,
    });
    await new Promise((r) => setTimeout(r, waitMs));
  }
  // All retries exhausted; return the last failure with attempts count.
  return {
    ...lastResult,
    attempts: MAX_CP_RETRIES + 1,
    totalMs: Date.now() - tStart,
  };
}

/**
 * One createTask + poll cycle. Internal helper; callers should use generate()
 * which wraps this in the content-policy retry loop.
 */
async function _singleAttempt({ prompt, inputUrls, language, label }) {
  const backend = pickBackend(language);
  const inputField = inputFieldFor(backend.model);

  const payload = {
    model: backend.model,
    input: {
      prompt,
      [inputField]: inputUrls,
      aspect_ratio: '3:4',
      resolution: backend.resolution,
    },
  };
  // gpt-image-2 doesn't accept output_format; nano-banana variants do.
  if (!backend.model.startsWith('gpt-image-2')) {
    payload.input.output_format = 'png';
  }

  const t0 = Date.now();
  let create;
  try {
    create = await httpsRequest({
      method: 'POST',
      hostname: KIE_API_HOST,
      path: '/api/v1/jobs/createTask',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KIE_API_KEY}` },
    }, payload);
  } catch (e) {
    logToFile('Kie.ai createTask threw', { label, error: e.message });
    return { success: false, error: `createTask failed: ${e.message}` };
  }

  const taskId = create?.data?.taskId;
  if (!taskId) {
    logToFile('Kie.ai createTask returned no taskId', { label, response: JSON.stringify(create).slice(0, 300) });
    return { success: false, error: `createTask failed: ${JSON.stringify(create).slice(0, 200)}` };
  }
  logToFile('Kie.ai task created', { label, taskId, model: backend.model, resolution: backend.resolution });

  for (let i = 0; i < KIE_MAX_ATTEMPTS; i++) {
    await new Promise((r) => setTimeout(r, KIE_POLL_INTERVAL));
    let info;
    try {
      info = await httpsRequest({
        method: 'GET',
        hostname: KIE_API_HOST,
        path: `/api/v1/jobs/recordInfo?taskId=${taskId}`,
        headers: { Authorization: `Bearer ${KIE_API_KEY}` },
      });
    } catch (e) {
      logToFile('Kie.ai poll threw, will retry next tick', { label, taskId, error: e.message });
      continue;
    }

    const state = info?.data?.state;
    if (state === 'success') {
      const generationMs = Date.now() - t0;
      let url;
      try {
        url = JSON.parse(info.data.resultJson).resultUrls[0];
      } catch (_) {
        return { success: false, error: 'Bad resultJson from Kie.ai' };
      }
      logToFile('Kie.ai task success', { label, taskId, generationMs });
      return { success: true, url, generationMs, model: backend.model, resolution: backend.resolution };
    }
    if (state === 'fail') {
      const failMsg = info?.data?.failMsg || 'unknown';
      logToFile('Kie.ai task failed', { label, taskId, failMsg });
      return { success: false, error: `kie.ai failed: ${failMsg}` };
    }
  }
  return { success: false, error: `kie.ai timeout after ${KIE_MAX_ATTEMPTS} polls` };
}

module.exports = { generate, pickBackend, inputFieldFor };
