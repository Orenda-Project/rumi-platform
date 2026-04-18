/**
 * 01_acquisition.worker.js — STUB
 *
 * Real implementation: use providers/boards/<board>.provider.js to list + fetch PDFs
 * for the configured province. For Sindh MVP we skip scraping (books are local,
 * per config/sindh-g1-g5.yaml `source: local`).
 *
 * This stub validates that every book in provinceConfig.books has an accessible file.
 */

const fs = require('fs');
const path = require('path');
const { STATUS } = require('./_base.worker');

const stageName = '01_acquisition';

async function handleJob(jobId, provinceConfig) {
  const results = provinceConfig.books.map(book => {
    const p = path.resolve(book.path);
    const ok = fs.existsSync(p);
    return { book: book.id, path: p, status: ok ? 'ready' : 'missing' };
  });
  const missing = results.filter(r => r.status === 'missing');
  return {
    status: missing.length === 0 ? STATUS.COMPLETE : STATUS.HUMAN_REVIEW,
    detail: { results, missing },
  };
}

module.exports = { stageName, handleJob };
