/**
 * 06_enrichment.worker.js — STUB
 *
 * Real implementation: Claude Sonnet 4.6 writes the 23-field enriched_content JSONB
 * in Urdu (even for Maths/English books; scientific terms kept English).
 * Escalates to Opus 4.7 when Sonnet self-reports confidence < 0.85.
 *
 * Reads Stage 02 structured OCR (no re-read of PDFs). Huge cost win vs Rawalpindi
 * which had Opus re-read PDFs per chapter.
 */

const { STATUS } = require('./_base.worker');

const stageName = '06_enrichment';

async function handleJob(jobId, provinceConfig) {
  return { status: STATUS.COMPLETE, detail: { note: 'stub — not yet implemented' } };
}

module.exports = { stageName, handleJob };
