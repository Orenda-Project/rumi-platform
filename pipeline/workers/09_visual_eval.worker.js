/**
 * 09_visual_eval.worker.js — STUB
 *
 * Real implementation: Gemini 2.5 Flash primary + Qwen3-VL-30B-A3B second opinion
 * on Urdu slides. 12-criteria rubric from Rawalpindi bd-1116:
 *   no_percent_leak, navigation_varies, language_metadata_matches, cpa_badge_present,
 *   diacritics_rendered, no_prompt_bleed, text_legible, rtl_ltr_correct,
 *   cartoon_consistency, cfu_present, page_ref_valid, no_placeholder_text
 * On fail: regen with FORBIDDEN directive injected into prompt. Max 3 regens.
 */

const { STATUS } = require('./_base.worker');

const stageName = '09_visual_eval';

async function handleJob(jobId, provinceConfig) {
  return { status: STATUS.COMPLETE, detail: { note: 'stub — not yet implemented' } };
}

module.exports = { stageName, handleJob };
