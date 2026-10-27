'use strict';
/**
 * model-registry — which model a job runs on, asked per request.
 *
 * A slim version of a per-job model table: every LLM job that wants its own
 * model names itself here, with a default and an env variable that overrides
 * it. Reading the env at CALL time rather than at require time is the point —
 * a model captured once at import is fixed for the life of the process, and no
 * changed variable can move it until a restart.
 *
 * Deliberately small. It carries only the jobs this repo has, no database
 * overrides and no rollout percentages; jobs not listed here use the platform
 * default from llm-client (LLM_MODEL). Calls still go through llm-client — this
 * file only answers "which model".
 *
 * No requires, so it is safe to load from `rumi doctor` and the root test suite.
 */

// An OpenRouter id ("vendor/model") or a bare OpenAI id ("gpt-4.1"). Anything
// else in an env var is a typo, and a typo must not reach the provider as a
// model name.
const MODEL_ID = /^[a-z0-9]+(?:[/.:-][a-z0-9]+)*$/i;

/**
 * job → { env, default, openaiDefault }
 *
 * The test-paper jobs default to a model that follows long structured prompts,
 * writes the requested language well (including right-to-left scripts) and
 * supports JSON output — and that one OpenRouter key reaches. `openaiDefault`
 * is for deployments that set LLM_PROVIDER=openai, where OpenRouter ids do not
 * exist.
 */
const JOBS = {
  'testpaper.generate': { env: 'TESTPAPER_MODEL', default: 'google/gemini-2.5-pro', openaiDefault: 'gpt-4.1' },
  'testpaper.revise': { env: 'TESTPAPER_MODEL', default: 'google/gemini-2.5-pro', openaiDefault: 'gpt-4.1' },
  // The lesson quiz's digest, author, validate-retry, rewrites and plan key
  // check: the cheapest model that kept the JSON contract on long,
  // mixed-language lessons in an offline eval of flash-tier models.
  'quiz.transcript': { env: 'TRANSCRIPT_QUIZ_MODEL', default: 'google/gemini-2.5-flash', openaiDefault: 'gpt-4.1-mini' },
  // The blind solve: every lesson quiz is answered once by a model that is NOT
  // shown the keys. It checks the author, so it runs on a different, stronger
  // model — a solver that shares the author's blind spots agrees with its
  // mistakes. It fails open (meta.key_verify.status 'error').
  'quiz.keyVerify': { env: 'TRANSCRIPT_QUIZ_VERIFY_MODEL', default: 'anthropic/claude-sonnet-5', openaiDefault: 'gpt-4.1' },
  // The class report's "For tomorrow" reteach box; the report arrives without
  // it if the call fails.
  'quiz.videoReport': { env: 'QUIZ_REPORT_MODEL', default: 'openai/gpt-5.4-mini', openaiDefault: 'gpt-5.4-mini' },
  // The exam checker's vision engine (exam-checker/exam-vision.service.js).
  // One model reads the page (with the marking scheme withheld) and then grades
  // the copied answers, so read and grade share an env var. A page whose
  // answers come back mostly low-confidence is read once more on the stronger
  // exam.readHard model. Every model here must accept image input.
  'exam.read': { env: 'EXAM_CHECKER_MODEL', default: 'google/gemini-3.5-flash', openaiDefault: 'gpt-4.1' },
  'exam.grade': { env: 'EXAM_CHECKER_MODEL', default: 'google/gemini-3.5-flash', openaiDefault: 'gpt-4.1' },
  'exam.readHard': { env: 'EXAM_CHECKER_HARD_MODEL', default: 'google/gemini-2.5-pro', openaiDefault: 'gpt-4.1' },
};

const PLATFORM_DEFAULT = 'openai/gpt-4o';

function isModel(value) {
  return typeof value === 'string' && value.length <= 80 && MODEL_ID.test(value.trim());
}

function provider(env) {
  return String(env.LLM_PROVIDER || 'openrouter').toLowerCase();
}

/**
 * @param {string} job          e.g. 'testpaper.generate'
 * @param {object} [ctx]
 * @param {string} [ctx.model]  an explicit model for this one call (wins)
 * @param {object} [env]
 * @returns {{model: string, source: 'context'|'env'|'default'|'platform'}}
 */
function resolveModelForJob(job, ctx = {}, env = process.env) {
  if (isModel(ctx.model)) return { model: ctx.model.trim(), source: 'context' };

  const entry = JOBS[job];
  if (!entry) {
    const platform = isModel(env.LLM_MODEL) ? env.LLM_MODEL.trim() : PLATFORM_DEFAULT;
    return { model: platform, source: 'platform' };
  }

  const override = env[entry.env];
  if (isModel(override)) return { model: override.trim(), source: 'env' };

  return { model: provider(env) === 'openai' ? entry.openaiDefault : entry.default, source: 'default' };
}

module.exports = { JOBS, PLATFORM_DEFAULT, resolveModelForJob, isModel };
