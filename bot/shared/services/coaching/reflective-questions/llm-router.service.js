/**
 * Reflective-question LLM router + failover ladder.
 * Latency hardening (OpenRouter provider routing + per-attempt timeout).
 *
 * Ladder (all via OpenRouter):
 *   deepseek/deepseek-v3.2 (primary)
 *     → one transient retry on V3.2   (covers a blip / rate-limit / socket error)
 *       → openai/gpt-5.4 (failover)    (different MODEL vendor — DeepSeek down ≠ OpenAI down)
 *   …with one shortcut: if the PRIMARY attempt hits OUR per-attempt deadline (the routed
 *   provider is too slow / stalled), SKIP the V3.2 retry and go straight to GPT-5.4 — a slow
 *   provider must not cost two full timeouts back-to-back.
 *
 * Routing decision: V3.2 is the model our v11 bake-off scored best-value / tied-#1 quality.
 * The official DeepSeek API (api.deepseek.com) has since dropped V3.2 (it now serves only
 * v4-flash / v4-pro), so we reach V3.2 through OpenRouter, which still carries the exact
 * `deepseek/deepseek-v3.2` slug. The GPT-5.4 failover is also via OpenRouter (gpt-5.4 is
 * not on the official OpenAI API — it tops out at gpt-5.2).
 *
 * WHY the provider routing + timeout (internal latency investigation):
 * because V3.2 is off the official API, OpenRouter serves it via ~10 third-party providers
 * whose output throughput ranges 12–47 tok/s with mixed quantization (fp4/fp8/unknown).
 * DEFAULT (price-sorted) routing lands on the cheap-but-slow providers (18–24 tok/s) —
 * which made long-tail calls take 200–400s; and the OpenAI SDK's ~10-min default timeout
 * means a stalled provider could block the coaching queue job for minutes. So:
 *   - `provider: { sort: 'throughput', allow_fallbacks: true }` → OpenRouter routes to the
 *     fastest HEALTHY provider, falling back if it's down (never hard-fails on routing).
 *   - per-attempt `timeout` (default 150s) + client `maxRetries: 0` (our ladder owns retries,
 *     so the SDK doesn't stack its own 2 retries on top of ours).
 * Follow-up: pin quantization (fp8) for call-to-call output consistency —
 * `sort:throughput` can still pick an fp4 host.
 *
 * Tradeoff, eyes-open: both hops share ONE infra vendor (OpenRouter), so an OpenRouter
 * outage takes the feature down. We keep MODEL-vendor diversity (DeepSeek vs OpenAI) on
 * the failover hop, which survives a single-model outage. To restore infra-vendor
 * diversity later, swap the failover to gpt-5.2 on the official OpenAI API — one line.
 *
 * gpt-5.x rejects an explicit `temperature` — the failover call deliberately omits it.
 *
 * Returns { content, usage, model_used }. Throws if every hop fails (no silent null —
 * the caller decides how to degrade; see guardrails).
 */

const OpenAI = require('openai');
const { logToFile } = require('../../../utils/logger');
const { lazyClient } = require('../../../utils/lazy-client');

// Default per-attempt deadline. Sized for the corpus call's ~2-3k-token output on a
// throughput-sorted provider (≥30 tok/s → ≤~100s), with headroom; well short of the SDK's
// old ~10-min default, so a stalled provider is abandoned in time to fail over.
const DEFAULT_TIMEOUT_MS = 150000;

// OpenRouter routing: always prefer the fastest healthy provider, fall back if it's down.
const PROVIDER_ROUTING = { sort: 'throughput', allow_fallbacks: true };

// Single OpenRouter client. maxRetries:0 — our ladder owns retries (don't let the SDK
// stack its own retries on top, which would multiply latency on a bad provider).
// Lazy-initialised: OPENROUTER_API_KEY is in REQUIRED_VARS so the bot won't pass
// `doctor` without it, but we don't want module-load to crash before doctor's
// friendly missing-key matrix runs.
const getOpenRouter = lazyClient(OpenAI, ['OPENROUTER_API_KEY'], (env) => ({
  apiKey: env.OPENROUTER_API_KEY,
  baseURL: 'https://openrouter.ai/api/v1',
  maxRetries: 0,
}));

const PRIMARY_MODEL = 'deepseek/deepseek-v3.2';
const FALLBACK_MODEL = 'openai/gpt-5.4';

const tag = (r, model_used) => ({
  content: r.choices[0].message.content,
  usage: r.usage,
  model_used,
});

// True only when OUR per-attempt deadline fired (provider too slow / stalled) — NOT for a
// transient socket error like ETIMEDOUT, which stays a normal one-shot retry.
const isOurTimeout = (e) =>
  e?.name === 'APIConnectionTimeoutError' || /\b(timed out|request timeout|aborted)\b/i.test(e?.message || '');

/**
 * @param {Array} messages  OpenAI-style chat messages.
 * @param {object} opts      { maxTokens=2000, temperature=0.7, timeoutMs=150000 }
 * @returns {Promise<{content:string, usage:object, model_used:string}>}
 */
async function callReflective(messages, { maxTokens = 2000, temperature = 0.7, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const attempt = (model, extra = {}) =>
    getOpenRouter().chat.completions.create(
      {
        model,
        messages,
        response_format: { type: 'json_object' },
        max_tokens: maxTokens,
        provider: PROVIDER_ROUTING,
        ...extra,
      },
      { timeout: timeoutMs },
    );

  // 1) Primary: DeepSeek V3.2
  try {
    return tag(await attempt(PRIMARY_MODEL, { temperature }), PRIMARY_MODEL);
  } catch (e1) {
    // Our deadline fired → the routed provider is too slow; retrying V3.2 risks another
    // slow provider, so go straight to the (fast) GPT-5.4 failover.
    if (isOurTimeout(e1)) {
      logToFile('[refl-q] V3.2 timed out → straight to GPT-5.4 (skip V3.2 retry)', { err: e1.message, timeoutMs });
      return tag(await attempt(FALLBACK_MODEL), 'gpt-5.4-fallback');
    }
    logToFile('[refl-q] V3.2 error, retrying once', { err: e1.message });
    // 2) One transient retry on V3.2 (rate-limit / 5xx / socket blip)
    try {
      return tag(await attempt(PRIMARY_MODEL, { temperature }), `${PRIMARY_MODEL}-retry`);
    } catch (e2) {
      logToFile('[refl-q] V3.2 failed twice → failover GPT-5.4', { err: e2.message });
      // 3) Failover: GPT-5.4 (omit temperature — gpt-5.x rejects it)
      return tag(await attempt(FALLBACK_MODEL), 'gpt-5.4-fallback');
    }
  }
}

module.exports = { callReflective, PRIMARY_MODEL, FALLBACK_MODEL, DEFAULT_TIMEOUT_MS, PROVIDER_ROUTING };
