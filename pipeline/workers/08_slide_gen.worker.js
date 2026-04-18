/**
 * 08_slide_gen.worker.js — STUB (Kie.AI NBPro via existing client)
 *
 * Real implementation: for each lp_segment, call Kie.AI nano-banana-pro
 * (`POST /api/v1/jobs/createTask` with `model: 'nano-banana-pro'`) per slide template.
 * 6–10 slides per segment. Token-bucket queue to respect Kie rate limits.
 *
 * Decision locked 2026-04-18 (Q2 resolved): NBPro only, no hybrid routing.
 * Reason: cheap alternatives (Gemini 2.5 Flash Image, Seedream 4, FLUX.2 Pro) all
 * hallucinate Urdu Nastaliq. Stability beats marginal cost savings.
 *
 * Pricing: $0.09/2K. Per Kie.AI public page; NOT $1.50 (v1 research was wrong).
 * Sindh MVP budget: ~9,000 slides × $0.09 = ~$810.
 */

const { STATUS } = require('./_base.worker');

const stageName = '08_slide_gen';

async function handleJob(jobId, provinceConfig) {
  return { status: STATUS.COMPLETE, detail: { note: 'stub — not yet implemented' } };
}

module.exports = { stageName, handleJob };
