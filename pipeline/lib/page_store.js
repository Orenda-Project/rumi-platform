/**
 * page_store.js — read/write textbook_pages rows.
 *
 * Abstraction layer so every stage reads its upstream data from ONE place,
 * regardless of whether the project is using Supabase or JSONL-as-DB.
 *
 * Day 2: JSONL-as-DB mode only (runs live in pipeline/runs/*.jsonl).
 * Once SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are set, we'll flip to that
 * backend. No worker code changes required.
 */

const fs = require('fs');
const path = require('path');

const RUNS_DIR = path.resolve(__dirname, '..', 'runs');

/**
 * Read all pages for a textbook from the JSONL-as-DB.
 * Merges across all JSONL files in runs/ — later runs override earlier
 * for the same (textbook_id, page_number).
 *
 * @param {string} textbookId
 * @param {object} [opts]
 * @param {number} [opts.startPage]
 * @param {number} [opts.endPage]
 * @returns {Promise<Array>} rows sorted by page_number
 */
async function readPagesForBook(textbookId, opts = {}) {
  if (!fs.existsSync(RUNS_DIR)) return [];
  const files = fs.readdirSync(RUNS_DIR).filter(f => f.endsWith('.jsonl'));
  const byPage = new Map();
  for (const f of files) {
    const lines = fs.readFileSync(path.join(RUNS_DIR, f), 'utf8').trim().split('\n').filter(Boolean);
    for (const line of lines) {
      let r;
      try { r = JSON.parse(line); } catch { continue; }
      if (r.stage !== '02_ingestion') continue;
      if (r.textbook_id !== textbookId) continue;
      if (r.status === 'ocr_failed') continue;
      if (!r.page_number) continue;
      // Latest wins if same (textbook, page) appears in multiple files
      const prev = byPage.get(r.page_number);
      if (!prev || new Date(r.timestamp) > new Date(prev.timestamp)) byPage.set(r.page_number, r);
    }
  }
  let rows = Array.from(byPage.values()).sort((a, b) => a.page_number - b.page_number);
  if (opts.startPage) rows = rows.filter(r => r.page_number >= opts.startPage);
  if (opts.endPage) rows = rows.filter(r => r.page_number <= opts.endPage);
  return rows;
}

/**
 * Read the most recent run-output JSONL file(s) matching a stage.
 */
async function readRowsForStage(stageName, filter = () => true) {
  if (!fs.existsSync(RUNS_DIR)) return [];
  const files = fs.readdirSync(RUNS_DIR).filter(f => f.endsWith('.jsonl'));
  const rows = [];
  for (const f of files) {
    const lines = fs.readFileSync(path.join(RUNS_DIR, f), 'utf8').trim().split('\n').filter(Boolean);
    for (const line of lines) {
      let r;
      try { r = JSON.parse(line); } catch { continue; }
      if (r.stage !== stageName) continue;
      if (!filter(r)) continue;
      rows.push(r);
    }
  }
  return rows;
}

module.exports = { readPagesForBook, readRowsForStage, RUNS_DIR };
