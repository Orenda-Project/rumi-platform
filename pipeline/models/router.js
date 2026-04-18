/**
 * models/router.js — capability-based model routing
 *
 * Callers request a CAPABILITY (e.g. `ocr_page`, `enrich_segment`), not a specific
 * model. Router resolves to model ID using provinceConfig.models. This keeps model
 * swaps as YAML edits, not code changes — critical for OSS adopters on different
 * provider accounts.
 */

const CAPABILITIES = [
  'ocr_page',
  'ocr_page_fallback',
  'ocr_page_escalate',
  'extract_toc',
  'map_slo',
  'chunk_chapter',
  'enrich_segment',
  'enrich_segment_escalate',
  'judge_enrichment',
  'judge_visual',
  'judge_voice',
  'generate_slide',
  'generate_voice_script',
  'synth_voice',
];

function resolveModel(capability, provinceConfig) {
  const m = provinceConfig?.models || {};
  switch (capability) {
    case 'ocr_page': return m.ocr_primary;
    case 'ocr_page_fallback': return m.ocr_fallback_urdu;
    case 'ocr_page_escalate': return m.ocr_escalate;
    case 'extract_toc': return m.toc_extract;
    case 'map_slo': return m.slo_mapping;
    case 'chunk_chapter': return m.chunking;
    case 'enrich_segment': return m.enrichment;
    case 'enrich_segment_escalate': return m.enrichment_escalate;
    case 'judge_enrichment':
    case 'judge_voice':
      return m.judge_panel;
    case 'judge_visual':
      return [m.visual_eval_primary, m.visual_eval_second_opinion].filter(Boolean);
    case 'generate_slide': return m.slide_gen;
    case 'generate_voice_script': return m.voice_script;
    case 'synth_voice': return m.voice_tts;
    default:
      throw new Error(`Unknown capability: ${capability}`);
  }
}

module.exports = { CAPABILITIES, resolveModel };
