/**
 * 03_toc_extract.worker.js — STUB
 *
 * Real implementation: for each book, pass the first ~15 pages (rendered as images or
 * the OCR output from Stage 02) to Gemini 2.5 Flash to extract chapters, page ranges,
 * and learning outcomes into textbook_toc.
 *
 * Eval gate: page_end ≤ total_pages, chapter count matches printed ToC, no overlaps.
 */

const { STATUS } = require('./_base.worker');

const stageName = '03_toc_extract';

async function handleJob(jobId, provinceConfig) {
  return { status: STATUS.COMPLETE, detail: { note: 'stub — not yet implemented' } };
}

module.exports = { stageName, handleJob };
