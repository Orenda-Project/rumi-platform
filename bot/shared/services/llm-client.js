/**
 * LLM Client Factory
 *
 * Provides a unified interface to LLM providers using the OpenAI SDK.
 * Default: OpenRouter (one key for 500+ models).
 * Override: Direct OpenAI (set LLM_PROVIDER=openai + OPENAI_API_KEY).
 *
 * When using OpenRouter, model names are auto-prefixed with 'openai/' if no
 * provider prefix is present (e.g. 'gpt-4o-mini' → 'openai/gpt-4o-mini').
 * This means existing code can use bare OpenAI model names unchanged.
 *
 * Usage:
 *   const { getClient, getDefaultModel } = require('./llm-client');
 *   const client = getClient();
 *   const response = await client.chat.completions.create({
 *     model: 'gpt-4o-mini',  // auto-prefixed to 'openai/gpt-4o-mini' on OpenRouter
 *     messages: [{ role: 'user', content: 'Hello' }],
 *   });
 */

const OpenAI = require('openai');
const ModelBudget = require('./limits/model-budget');

const PROVIDER = (process.env.LLM_PROVIDER || 'openrouter').toLowerCase();
const DEFAULT_MODEL = process.env.LLM_MODEL || 'openai/gpt-4o';
// Overridable for an OpenRouter-compatible gateway (or a test double of one).
const OPENROUTER_BASE_URL = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';

let _client = null;

/**
 * Create a new LLM client configured for the current provider.
 * For OpenRouter, wraps chat.completions.create to auto-prefix model names.
 * Either way every completion passes the budget breaker (limits/model-budget.js):
 * a provider refusing for money becomes one "busy" reply and one alert.
 */
function createLLMClient() {
  if (PROVIDER === 'openai') {
    // Direct OpenAI — no baseURL override
    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    client.chat.completions.create = ModelBudget.guardCreate(client.chat.completions.create.bind(client.chat.completions));
    return client;
  }

  // Default: OpenRouter — uses OpenAI-compatible API
  const client = new OpenAI({
    apiKey: process.env.OPENROUTER_API_KEY,
    baseURL: OPENROUTER_BASE_URL,
    defaultHeaders: {
      'HTTP-Referer': process.env.APP_URL || '',
      'X-Title': 'Rumi Teaching Assistant',
    },
  });

  // Auto-prefix model names for OpenRouter (e.g. 'gpt-4o-mini' → 'openai/gpt-4o-mini')
  const originalCreate = client.chat.completions.create.bind(client.chat.completions);
  client.chat.completions.create = ModelBudget.guardCreate((params, options) => {
    if (params.model && !params.model.includes('/')) {
      params = { ...params, model: `openai/${params.model}` };
    }
    return originalCreate(params, options);
  });

  return client;
}

/**
 * Get a singleton LLM client instance.
 */
function getClient() {
  if (!_client) {
    _client = createLLMClient();
  }
  return _client;
}

/**
 * Get the default model name.
 */
function getDefaultModel() {
  return DEFAULT_MODEL;
}

// Request fields only OpenRouter understands; direct OpenAI rejects them.
const OPENROUTER_ONLY_PARAMS = ['usage', 'reasoning'];

let _openaiDirectClient = null;

/**
 * The client and model id for one call of a model-registry job.
 *
 * Same client as getClient(), and the same provider: PROVIDER, read once at
 * require time, so an env change at runtime never pairs the OpenRouter client
 * with OpenAI-shaped ids (or the reverse). This only settles WHICH model and,
 * on the direct OpenAI provider, turns an OpenRouter-style request into one
 * OpenAI accepts (`openai/gpt-x` → `gpt-x`, OpenRouter-only fields dropped). An
 * OpenRouter id of another vendor (`anthropic/…`) does not exist there, so it
 * falls back to the job's OpenAI default. A job's default comes from
 * config/model-registry.js when no model is named.
 *
 * @param {string|null} model an OpenRouter model id, or null for the job's default
 * @param {{job?: string}} [opts]
 * @returns {{client: object, model: string, job: string|null}}
 */
function getClientForModel(model, { job = null } = {}) {
  const registry = require('../config/model-registry');
  let id = String(model || '').trim();
  if (!id && job) id = registry.resolveModelForJob(job, {}, { ...process.env, LLM_PROVIDER: PROVIDER }).model;
  if (!id) id = DEFAULT_MODEL;

  if (PROVIDER !== 'openai') return { client: getClient(), model: id, job };

  if (!_openaiDirectClient) {
    const base = getClient();
    const create = base.chat.completions.create.bind(base.chat.completions);
    // Layered over the SDK objects (not spread from them): parse, stream and the
    // rest live on their prototypes and must stay reachable.
    const completions = Object.create(base.chat.completions);
    completions.create = (params, options) => {
      const clean = { ...params };
      for (const k of OPENROUTER_ONLY_PARAMS) delete clean[k];
      return create(clean, options);
    };
    const chat = Object.create(base.chat);
    chat.completions = completions;
    _openaiDirectClient = Object.create(base);
    _openaiDirectClient.chat = chat;
  }
  if (id.includes('/') && !/^openai\//.test(id)) {
    const entry = job && registry.JOBS[job];
    const fallback = (entry && entry.openaiDefault) || DEFAULT_MODEL;
    try {
      require('../utils/logger').logToFile('⚠️ LLM: an OpenRouter model id was asked for on LLM_PROVIDER=openai — using an OpenAI model instead', {
        job, requested: id, model: fallback,
      }, 'warn');
    } catch (_) { /* a log is not worth a failed call */ }
    id = fallback;
  }
  let bare = id.replace(/^openai\//, '');
  // DEFAULT_MODEL comes from LLM_MODEL and could itself name another vendor.
  if (bare.includes('/')) bare = 'gpt-4o';
  return { client: _openaiDirectClient, model: bare, job };
}

/**
 * Get current provider info (for diagnostics/health checks).
 */
function getProviderInfo() {
  return {
    provider: PROVIDER,
    model: DEFAULT_MODEL,
    baseURL: PROVIDER === 'openrouter' ? OPENROUTER_BASE_URL : 'https://api.openai.com/v1',
  };
}

module.exports = {
  createLLMClient,
  getClient,
  getClientForModel,
  getDefaultModel,
  getProviderInfo,
};
