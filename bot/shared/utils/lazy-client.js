/**
 * Lazy SDK client construction.
 *
 * Several services in the bot need an external SDK client (OpenAI, Google
 * Generative AI, AWS S3, AWS Textract, etc.) for the work they do. The
 * obvious pattern is `const client = new SDK({ apiKey: KEY })` at the top of
 * the module — but that pattern crashes the entire bot at cold-boot whenever
 * the relevant API key isn't set, even if NO code path that requires the SDK
 * is ever invoked. (Wave 4 hit this with ElevenLabs; Wave 5 found 5 more
 * sister files with the same shape.)
 *
 * `lazyClient(...)` is the canonical fix: it returns a getter that
 * constructs the SDK client on FIRST access. If a required env var is
 * missing, the getter throws a structured, action-oriented error message
 * pointing the operator at the specific env vars to set. The bot continues
 * to boot cleanly when the keys are unset — the failure only happens at the
 * exact call site that tries to use the SDK.
 *
 * Example:
 *
 *   const OpenAI = require('openai');
 *   const { lazyClient } = require('../utils/lazy-client');
 *
 *   const getOpenAI = lazyClient(OpenAI, ['OPENAI_API_KEY'],
 *     (env) => ({ apiKey: env.OPENAI_API_KEY })
 *   );
 *
 *   async function classifyImage(buf) {
 *     const client = getOpenAI();  // throws iff OPENAI_API_KEY missing
 *     return client.images.generate(...);
 *   }
 *
 * The cache is per-getter (closure-scoped) — repeat calls return the same
 * client instance, matching the eager-construction pattern's behaviour.
 */

/**
 * Wraps an SDK constructor with lazy + cached construction.
 *
 * @template T
 * @param {new (config: object) => T} ClientClass
 *   The SDK class constructor. Must be `new`-able.
 * @param {string[]} requiredEnvVars
 *   Env vars that MUST be set for construction to succeed. The error message
 *   lists the missing subset.
 * @param {(env: Record<string, string>) => object} buildArgs
 *   Builds the constructor argument object from the (verified-present) env
 *   vars. Receives a sanitized env subset containing only `requiredEnvVars`.
 * @returns {() => T} A getter that returns the cached client instance.
 */
function lazyClient(ClientClass, requiredEnvVars, buildArgs) {
  let cached = null;

  return function getClient() {
    if (cached) return cached;

    const missing = [];
    const env = {};
    for (const key of requiredEnvVars) {
      const value = process.env[key];
      if (!value) missing.push(key);
      else env[key] = value;
    }

    if (missing.length > 0) {
      const className = ClientClass.name || 'SDK client';
      throw new Error(
        `${className} cannot be constructed — missing env: ${missing.join(', ')}. ` +
        `Set these in .env (see .env.template) or avoid invoking this code path.`
      );
    }

    cached = new ClientClass(buildArgs(env));
    return cached;
  };
}

module.exports = { lazyClient };
