/**
 * 06d_question_autofix.worker.js
 *
 * Reads the latest 06_enrichment + 06b_question_integrity rows.
 * For each leak the linter found, applies the linter's `suggested_fix` to the
 * affected field in enriched_content. Writes patched enriched rows back so
 * the page_store latest-wins picks them up.
 *
 * Why deterministic patching beats trying to coax Sonnet into compliance:
 * The linter's suggested_fix is a per-stem rewrite that's already verified
 * to remove the answer leak. Applying it directly is safer than re-prompting
 * the generator and hoping it gets it right.
 *
 * Field-name parsing handles array indices: "problems[0]" → enriched_content.problems[0]
 */

const { STATUS, PipelineError } = require('./_base.worker');
const { readRowsForStage } = require('../lib/page_store');

const stageName = '06d_question_autofix';

function applyFix(enrichedContent, fieldPath, newValue) {
  // Handle "problems[0]" style
  const arrMatch = fieldPath.match(/^([a-zA-Z_]+)\[(\d+)\]$/);
  const out = JSON.parse(JSON.stringify(enrichedContent));
  if (arrMatch) {
    const [, name, idx] = arrMatch;
    if (Array.isArray(out[name])) out[name][parseInt(idx, 10)] = newValue;
  } else {
    out[fieldPath] = newValue;
  }
  return out;
}

async function handleJob(jobId, provinceConfig, opts = {}) {
  const books = opts.bookId
    ? provinceConfig.books.filter(b => b.id === opts.bookId)
    : provinceConfig.books;
  if (!books.length) return { status: STATUS.COMPLETE, detail: { reason: 'no books' } };

  const writeRow = opts.writeRow || ((row) => console.log(JSON.stringify({ stage: stageName, ...row })));
  const enrichRows = await readRowsForStage('06_enrichment');
  const auditRows = await readRowsForStage('06b_question_integrity');
  const results = [];

  for (const book of books) {
    // Latest enrichment per segment
    const latestEnrich = new Map();
    for (const r of enrichRows.filter(x => x.textbook_id === book.id && x.enriched_content)) {
      const prev = latestEnrich.get(r.segment_index);
      if (!prev || new Date(r.timestamp) > new Date(prev.timestamp)) latestEnrich.set(r.segment_index, r);
    }
    // Latest audit per segment
    const latestAudit = new Map();
    for (const r of auditRows.filter(x => x.textbook_id === book.id && Array.isArray(x.leaks))) {
      const prev = latestAudit.get(r.segment_index);
      if (!prev || new Date(r.timestamp) > new Date(prev.timestamp)) latestAudit.set(r.segment_index, r);
    }

    let patched = 0, skipped = 0, missing_fix = 0;
    for (const [segIdx, enrich] of latestEnrich.entries()) {
      const audit = latestAudit.get(segIdx);
      if (!audit || audit.leak_count === 0 || !Array.isArray(audit.leaks)) {
        skipped++;
        continue;
      }
      let fixedContent = enrich.enriched_content;
      const appliedFixes = [];
      for (const leak of audit.leaks) {
        if (!leak.is_leak) continue;
        if (!leak.suggested_fix || leak.suggested_fix.trim() === '') {
          missing_fix++;
          continue;
        }
        // Strip parenthetical commentary that the linter often appends
        // (e.g. "Fix text. (Forces counting.)" — keep the fix, drop the commentary).
        let fix = leak.suggested_fix;
        // Remove trailing parens-only commentary
        fix = fix.replace(/\s*\((?:[^()]*forces?|reveal[s]?|removes?|elicits?)[^()]*\)\s*$/i, '').trim();
        fixedContent = applyFix(fixedContent, leak.field, fix);
        appliedFixes.push({ field: leak.field, leaked: leak.leaked_value, applied_fix: fix });
      }
      if (appliedFixes.length === 0) { skipped++; continue; }
      // Override stage so the page_store / linter (which read stage='06_enrichment')
      // pick this patched row as the latest version of the segment.
      await writeRow({
        stage: '06_enrichment',
        textbook_id: book.id,
        chapter_number: enrich.chapter_number,
        segment_index: segIdx,
        skill_type: enrich.skill_type,
        enriched_content: fixedContent,
        confidence: enrich.confidence,
        model: enrich.model + ' + autofix',
        escalated: enrich.escalated,
        slo_codes: enrich.slo_codes,
        schema_version: enrich.schema_version || 'rawalpindi_v7',
        autofix_applied: appliedFixes,
        autofix_origin_jobid: jobId,
      });
      patched++;
      console.log(`  ✓ seg${segIdx}: ${appliedFixes.length} fixes applied`);
    }
    console.log(`Summary ${book.id}: ${patched} patched, ${skipped} clean/skipped, ${missing_fix} missing-fix`);
    results.push({ book: book.id, patched, skipped, missing_fix });
  }

  return { status: STATUS.COMPLETE, detail: { results } };
}

module.exports = { stageName, handleJob, applyFix };
