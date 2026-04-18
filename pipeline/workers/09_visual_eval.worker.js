/**
 * 09_visual_eval.worker.js — slide visual quality eval
 *
 * For each generated slide PNG from Stage 08, run a 12-criteria rubric via
 * Gemini 2.5 Flash (VLM). Criteria derived from Rawalpindi bd-1116:
 *   no_percent_leak, navigation_varies, language_metadata_matches,
 *   cpa_badge_present, diacritics_rendered, no_prompt_bleed, text_legible,
 *   rtl_ltr_correct, cartoon_consistency, cfu_present, page_ref_valid,
 *   no_placeholder_text.
 *
 * On fail: emit regen_guidance that Stage 08's regen loop can inject into the
 * next prompt attempt. Max 3 regens; then human_review.
 */

const fs = require('fs');
const { STATUS, PipelineError } = require('./_base.worker');
const { readRowsForStage } = require('../lib/page_store');
const { callGeminiViaOpenRouter } = require('../models/providers/gemini_client');

const stageName = '09_visual_eval';

const CRITERIA = [
  'no_percent_leak',             // no literal "20%" / "55%" leaked into slide text
  'no_prompt_bleed',              // no prompt instructions leaked (e.g. "Pakistani Grade 1 giden")
  'navigation_varies',            // for navigation slides: "Day N of M" reflects actual segment index
  'language_metadata_matches',    // slide language matches segment declared language
  'cpa_badge_present',            // maths slides show CPA phase
  'diacritics_rendered',          // Urdu Gr1-3 has vowel marks
  'text_legible',                 // text readable at thumbnail, no gibberish
  'rtl_ltr_correct',              // Urdu RTL correct, English LTR correct
  'cartoon_consistency',          // Pakistani cultural characters, clothing
  'cfu_present',                  // CFU prompt visible where expected
  'page_ref_valid',               // textbook page reference matches source
  'no_placeholder_text',          // no "[topic]", "___", "Option A" placeholders
];

const EVAL_PROMPT = `You are evaluating a generated lesson-plan slide image against a 12-criteria rubric.
For each criterion: score 1 (fail) or 5 (pass). Intermediate values allowed (3 = acceptable with issues).

Criteria:
- no_percent_leak: absence of literal "%" markers used internally as layout hints.
- no_prompt_bleed: no prompt engineering instructions visible (e.g. "Pakistani Grade 1 giden").
- navigation_varies: navigation-slide banners reflect THIS segment (Day N of M, not "Day 1 of 1").
- language_metadata_matches: slide language matches what it claims to be.
- cpa_badge_present: for Maths slides, CPA-phase label visible.
- diacritics_rendered: for Urdu Gr1-3, short-vowel diacritics (zer/zabar/pesh) visible.
- text_legible: text sharp, not gibberish, readable at thumbnail size.
- rtl_ltr_correct: Urdu text RTL, English LTR, no wrong mirroring.
- cartoon_consistency: Pakistani-appropriate attire (shalwar kameez/dupatta), classroom context.
- cfu_present: explicit CFU prompt where expected on that template.
- page_ref_valid: if a textbook page is referenced, it matches the source segment.
- no_placeholder_text: no unresolved placeholders like "___" or "[topic]".

For each fail: emit a specific regen_guidance line that can be injected as an added constraint on the next NBPro prompt.

Ship if mean ≥ 4.0 AND no critical dim (no_prompt_bleed, text_legible) < 3.`;

const EVAL_SCHEMA = {
  name: 'emit_visual_scores',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      scores: {
        type: 'object',
        additionalProperties: false,
        properties: Object.fromEntries(CRITERIA.map(c => [c, { type: 'integer', minimum: 1, maximum: 5 }])),
        required: CRITERIA,
      },
      mean: { type: 'number' },
      ship: { type: 'boolean' },
      regen_guidance: { type: 'string' },
      specific_failures: { type: 'array', items: { type: 'string' } },
    },
    required: ['scores', 'mean', 'ship', 'regen_guidance', 'specific_failures'],
  },
};

async function evalSlide(slidePath, expectedMeta) {
  const imageData = fs.readFileSync(slidePath).toString('base64');
  const text = `${EVAL_PROMPT}\n\nExpected metadata:\n${JSON.stringify(expectedMeta, null, 2)}\n\nJudge this slide image.`;
  const out = await callGeminiViaOpenRouter({
    model: 'gemini-2.5-flash',
    text,
    imageBase64: imageData,
    jsonSchema: EVAL_SCHEMA,
    temperature: 0.1,
  });
  return out.json;
}

async function handleJob(jobId, provinceConfig, opts = {}) {
  const books = opts.bookId
    ? provinceConfig.books.filter(b => b.id === opts.bookId)
    : provinceConfig.books;
  if (!books.length) return { status: STATUS.COMPLETE, detail: { reason: 'no books' } };

  const writeRow = opts.writeRow || ((row) => console.log(JSON.stringify({ stage: stageName, ...row })));
  const slideRows = (await readRowsForStage('08_slide_gen')).filter(r => r.slide_path);
  const results = [];

  for (const book of books) {
    const bookSlides = slideRows.filter(r => r.textbook_id === book.id);
    console.log(`[${stageName}] ${book.id}: ${bookSlides.length} slides to eval`);
    let ship = 0, regen = 0, failed = 0;
    for (const row of bookSlides) {
      if (!fs.existsSync(row.slide_path)) {
        failed++;
        await writeRow({ textbook_id: book.id, slide_path: row.slide_path, status: 'slide_missing' });
        continue;
      }
      const expected = {
        slide_template: row.slide_template,
        segment_index: row.segment_index,
        subject: book.subject,
        grade: book.grade,
      };
      try {
        const scores = await evalSlide(row.slide_path, expected);
        await writeRow({
          textbook_id: book.id,
          segment_index: row.segment_index,
          slide_template: row.slide_template,
          slide_path: row.slide_path,
          scores: scores.scores,
          mean: scores.mean,
          ship: scores.ship,
          regen_guidance: scores.regen_guidance,
          specific_failures: scores.specific_failures,
        });
        if (scores.ship) ship++; else regen++;
        console.log(`  ${scores.ship ? '✓' : '↻'} ${row.slide_template}/seg${row.segment_index}: mean=${scores.mean.toFixed(2)}`);
      } catch (err) {
        failed++;
        await writeRow({ textbook_id: book.id, slide_path: row.slide_path, status: 'eval_failed', error: err.message });
        console.error(`  ✗ ${row.slide_template}: ${err.message}`);
      }
    }
    results.push({ book: book.id, ship, regen, failed });
  }

  return { status: STATUS.COMPLETE, detail: { results } };
}

module.exports = { stageName, handleJob, CRITERIA, evalSlide };
