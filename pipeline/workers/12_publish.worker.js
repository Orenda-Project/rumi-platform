/**
 * 12_publish.worker.js — STUB
 *
 * Real implementation: uploads generated PDFs + voicenotes to R2, populates
 * lesson_plans + textbook_segments rows, sets up WhatsApp Flow v2.0 delivery.
 * Runs final eval gate: all R2 URLs 200-reachable, DB rows consistent.
 */

const { STATUS } = require('./_base.worker');

const stageName = '12_publish';

async function handleJob(jobId, provinceConfig) {
  return { status: STATUS.COMPLETE, detail: { note: 'stub — not yet implemented' } };
}

module.exports = { stageName, handleJob };
