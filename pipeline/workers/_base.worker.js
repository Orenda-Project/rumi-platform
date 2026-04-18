/**
 * _base.worker.js — common contract every pipeline worker follows.
 *
 * Each worker exports: { stageName, handleJob(jobId, provinceConfig) }
 *
 * The driver guarantees:
 *   - idempotent invocation — rerun any stage without damage
 *   - pipeline_runs row tracking (one per run × stage)
 *   - retries up to provinceConfig.retry.max_attempts_per_stage
 *   - escalate to `needs_human_review` on exhaustion
 */

/**
 * Worker contract — every stage implements:
 *
 *   export const stageName = '02_ingestion';
 *   export async function handleJob(jobId, provinceConfig) { ... }
 *
 * Return shape:
 *   { status: 'complete' | 'retry' | 'human_review', score?: number, detail?: object }
 */

const STATUS = {
  COMPLETE: 'complete',
  RETRY: 'retry',
  HUMAN_REVIEW: 'human_review',
  FAILED: 'failed',
};

class PipelineError extends Error {
  constructor(message, { retryable = false, guidance = null } = {}) {
    super(message);
    this.retryable = retryable;
    this.guidance = guidance;
  }
}

/**
 * Wraps a worker with retry + state tracking.
 * @param {Function} handleJob - async (jobId, provinceConfig) => result
 * @param {object} provinceConfig - loaded YAML
 * @param {number} attempts - tries used so far
 */
async function runWithRetry(handleJob, jobId, provinceConfig, attempts = 0) {
  const maxAttempts = provinceConfig?.retry?.max_attempts_per_stage ?? 3;
  try {
    const result = await handleJob(jobId, provinceConfig);
    return { ...result, attempts: attempts + 1 };
  } catch (err) {
    if (err instanceof PipelineError && err.retryable && attempts + 1 < maxAttempts) {
      return runWithRetry(handleJob, jobId, provinceConfig, attempts + 1);
    }
    return {
      status: STATUS.HUMAN_REVIEW,
      error: err.message,
      guidance: err.guidance || null,
      attempts: attempts + 1,
    };
  }
}

module.exports = { STATUS, PipelineError, runWithRetry };
