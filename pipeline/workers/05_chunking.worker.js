/**
 * 05_chunking.worker.js — STUB
 *
 * Real implementation: Haiku 4.5 with tool-use JSON enforcing lp_segments schema.
 * Heavy lifting uses VLM `exercises[].type` from Stage 02 to auto-map skill_type
 * deterministically per taxonomy (07_TAXONOMY_EVOLVED.md mapping table).
 * LLM only invoked on residual unclassified cases.
 */

const { STATUS } = require('./_base.worker');

const stageName = '05_chunking';

async function handleJob(jobId, provinceConfig) {
  return { status: STATUS.COMPLETE, detail: { note: 'stub — not yet implemented' } };
}

module.exports = { stageName, handleJob };
