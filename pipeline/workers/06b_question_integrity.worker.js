/**
 * 06b_question_integrity.worker.js — automated gate for the
 * counting-question-leaks-the-answer bug Haroon flagged.
 *
 * Scans every question stem in an enriched_content and checks: does the
 * stem already state the quantity it's asking the student to find?
 *
 * Bloom's L1 (Remember/Recall, transcription) → fail
 * Bloom's L2+ (Understand/Apply, count + cardinality) → pass
 *
 * Reads stems from ALL question fields:
 *   exitTicketQuestion, cfuExplain, cfuPractice, workedExample, wordProblem,
 *   problems[], weakLearnerSupport, challengeExtension
 *   (plus old-schema names: warm_up, you_do_independent_practice, etc.)
 *
 * Uses Haiku (cheap) with strict JSON output.
 *
 * Output rows:
 *   { textbook_id, segment_index, ship: bool, leaks: [{field, stem, answer, suggested_fix}] }
 */

const { STATUS, PipelineError } = require('./_base.worker');
const { readRowsForStage } = require('../lib/page_store');
const { callClaude } = require('../models/providers/anthropic_client');

const stageName = '06b_question_integrity';

// Field names across both old + new (v7) schemas. We check whichever exists.
const STEM_FIELDS = [
  // v7 schema
  'exitTicketQuestion', 'cfuExplain', 'cfuPractice', 'workedExample',
  'wordProblem', 'weakLearnerSupport', 'challengeExtension',
  // Old schema fallbacks
  'cfu_practice', 'cfu_explain', 'word_problem', 'worked_example',
  'you_do_independent_practice', 'we_do_partner_activity',
];
const ARRAY_STEM_FIELDS = ['problems', 'cfu_checks'];

const SYSTEM_PROMPT = `You are auditing question stems from a Pakistani Grade 1-3 lesson plan for the
"giving away the answer" pedagogical bug.

A question stem leaks the answer when it states the quantity it is asking the
student to find. Examples:

LEAK: "There are 3 balloons in the picture. What number will you write?"
       (Answer 3 is in the stem — pure transcription, Bloom L1)
FIX:  "How many balloons are there? Write the number."
       (Forces counting + cardinality, Bloom L2+)

LEAK: "Saima has 5 mangoes. Count them and write the number."
FIX:  "Saima has some mangoes. Count them and write the number."

LEAK: "تصویر میں 3 غبارے ہیں۔ خانے میں کون سا نمبر لکھیں گے؟"
FIX:  "تصویر دیکھیں — کتنے غبارے ہیں؟ خانے میں صحیح نمبر لکھیں۔"

NOT a leak (don't flag):
- Worked examples that demonstrate a process (the answer is *meant* to be visible).
- Stems that mention an unrelated quantity ("Open page 4. How many cats?" — page 4 is not the answer to the count).
- Stems that ask for a quantity that's already in a previous CONCEPT being taught (e.g. naming the digit shown).
- Comparison questions ("Are there more X or Y?") — neither count is what we're asking.

For each stem, output: { is_leak: bool, leaked_value: string | null, suggested_fix: string | null, reason: string }.

Be strict but not paranoid. Word problems often state quantities by design — only flag if the question being asked IS one of those quantities.`;

const TOOL = {
  name: 'emit_audit',
  description: 'Emit per-stem audit verdicts.',
  input_schema: {
    type: 'object',
    properties: {
      verdicts: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            field: { type: 'string', description: 'Source field name.' },
            stem: { type: 'string', description: 'The question stem text.' },
            is_leak: { type: 'boolean' },
            leaked_value: { type: ['string', 'null'] },
            suggested_fix: { type: ['string', 'null'] },
            reason: { type: 'string' },
          },
          required: ['field', 'stem', 'is_leak', 'reason'],
        },
      },
      overall_ship: { type: 'boolean', description: 'true iff ZERO leaks.' },
    },
    required: ['verdicts', 'overall_ship'],
  },
};

function extractStems(enrichedContent) {
  const stems = [];
  for (const f of STEM_FIELDS) {
    const v = enrichedContent[f];
    if (typeof v === 'string' && v.trim()) stems.push({ field: f, text: v });
  }
  for (const f of ARRAY_STEM_FIELDS) {
    const v = enrichedContent[f];
    if (Array.isArray(v)) {
      v.forEach((s, i) => { if (typeof s === 'string' && s.trim()) stems.push({ field: `${f}[${i}]`, text: s }); });
    }
  }
  return stems;
}

async function auditSegment(enrichedContent, segMeta) {
  const stems = extractStems(enrichedContent);
  if (stems.length === 0) return { verdicts: [], overall_ship: true, note: 'no stems' };

  const userMsg = `Segment ${segMeta.segment_index} | grade ${segMeta.grade} | subject ${segMeta.subject} | skill_type ${segMeta.skill_type}

Stems to audit (${stems.length}):
${stems.map((s, i) => `${i + 1}. [${s.field}] ${s.text}`).join('\n')}

Audit each stem and return verdicts via emit_audit.`;

  const resp = await callClaude({
    model: 'claude-haiku-4-5',
    system: SYSTEM_PROMPT,
    userText: userMsg,
    tools: [TOOL],
    toolChoice: { type: 'tool', name: 'emit_audit' },
    maxTokens: 4096,
  });
  if (!resp.toolInput) throw new PipelineError(`question_integrity: no tool call from Haiku`);
  // Defensive: coerce verdicts to array if Haiku returned an object
  const out = { ...resp.toolInput };
  if (!Array.isArray(out.verdicts)) {
    out.verdicts = out.verdicts && typeof out.verdicts === 'object' ? Object.values(out.verdicts) : [];
  }
  return { ...out, model: resp.model, usage: resp.usage };
}

async function handleJob(jobId, provinceConfig, opts = {}) {
  const books = opts.bookId
    ? provinceConfig.books.filter(b => b.id === opts.bookId)
    : provinceConfig.books;
  if (!books.length) return { status: STATUS.COMPLETE, detail: { reason: 'no books' } };

  const writeRow = opts.writeRow || ((row) => console.log(JSON.stringify({ stage: stageName, ...row })));
  const segmentLimit = opts.segmentLimit ? parseInt(opts.segmentLimit, 10) : null;

  const enrichRows = await readRowsForStage('06_enrichment');
  const segmentRows = await readRowsForStage('05_chunking');
  const results = [];

  for (const book of books) {
    // Latest enrichment per segment_index (handles re-enrichments)
    const latestByIdx = new Map();
    for (const r of enrichRows.filter(x => x.textbook_id === book.id && x.enriched_content)) {
      const prev = latestByIdx.get(r.segment_index);
      if (!prev || new Date(r.timestamp) > new Date(prev.timestamp)) latestByIdx.set(r.segment_index, r);
    }
    const segs = Array.from(latestByIdx.values()).sort((a, b) => a.segment_index - b.segment_index);
    console.log(`[${stageName}] ${book.id}: auditing ${segs.length} segments`);
    let leakedCount = 0;
    let totalLeaks = 0;
    const limit = segmentLimit || segs.length;
    for (const r of segs.slice(0, limit)) {
      const segRow = segmentRows.find(s => s.textbook_id === book.id && s.segment_index === r.segment_index);
      const segMeta = {
        segment_index: r.segment_index,
        grade: book.grade,
        subject: book.subject,
        skill_type: segRow?.skill_type || r.skill_type,
      };
      try {
        const audit = await auditSegment(r.enriched_content, segMeta);
        const leaks = (audit.verdicts || []).filter(v => v.is_leak);
        await writeRow({
          textbook_id: book.id,
          segment_index: r.segment_index,
          ship: audit.overall_ship,
          leak_count: leaks.length,
          stem_count: (audit.verdicts || []).length,
          leaks,
          model: audit.model,
          usage: audit.usage,
        });
        if (leaks.length > 0) { leakedCount++; totalLeaks += leaks.length; }
        const status = audit.overall_ship ? '✓' : `↻ ${leaks.length} leaks`;
        console.log(`  ${status} seg${r.segment_index}`);
      } catch (err) {
        console.error(`  ✗ seg${r.segment_index}: ${err.message?.substring(0, 200)}`);
        await writeRow({ textbook_id: book.id, segment_index: r.segment_index, status: 'audit_failed', error: err.message });
      }
    }
    results.push({ book: book.id, total: segs.length, leaked_segments: leakedCount, total_leaks: totalLeaks });
    console.log(`  Summary: ${leakedCount}/${segs.length} segments have leaks (${totalLeaks} total)`);
  }

  return { status: STATUS.COMPLETE, detail: { results } };
}

module.exports = { stageName, handleJob, auditSegment, extractStems };
