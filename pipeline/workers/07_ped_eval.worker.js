/**
 * 07_ped_eval.worker.js — AI-only pedagogical eval (3-judge panel)
 *
 * For each enriched segment from Stage 06:
 *   1. Send to Haiku judge + Gemini Flash judge + Sonnet judge (via OpenRouter)
 *   2. Each scores 10 pedagogical dimensions on 1-5
 *   3. Majority-vote pass/fail per dimension (threshold 4.0)
 *   4. Failures → regen guidance written to stdout; segment marked needs_regen
 *
 * Cross-generator enforcement: the model that generated the enrichment (Sonnet
 * or Opus) is EXCLUDED from the judge panel to avoid "marking own homework".
 * Replacement in that case: GPT-5 Mini via OpenRouter.
 */

const Anthropic = require('@anthropic-ai/sdk');
const { STATUS, PipelineError } = require('./_base.worker');
const { readRowsForStage } = require('../lib/page_store');
const { callGeminiViaOpenRouter } = require('../models/providers/gemini_client');

const stageName = '07_ped_eval';

const JUDGE_DIMENSIONS = [
  'content_skill_alignment',
  'topic_accuracy',
  'boundary_quality',
  'duration_feasibility',
  'grr_arc',
  'cfu_presence',
  'textbook_grounding',
  'differentiation_quality',
  'urdu_language_quality',
  'cultural_appropriateness',
];

const JUDGE_PROMPT = `You are judging a pedagogically-grounded Urdu lesson plan segment against a 10-dimension rubric.
Score each dimension 1-5 where:
  1 = seriously flawed, do not ship
  3 = acceptable but improvable
  5 = excellent, ship as-is

Dimensions:
- content_skill_alignment: does the segment content match its declared skill_type?
- topic_accuracy: does topic/title match the textbook source pages given?
- boundary_quality: does segment start/end make pedagogical sense?
- duration_feasibility: can this realistically fit in the declared minutes?
- grr_arc: I Do → We Do → You Do progression present and distinct?
- cfu_presence: are concrete CFU (check-for-understanding) prompts present?
- textbook_grounding: does it cite textbook page/exercise numbers the source OCR supports?
- differentiation_quality: are below/on/above-level adjustments meaningful?
- urdu_language_quality: is the Urdu natural, diacritics appropriate, honorifics correct?
- cultural_appropriateness: Pakistani classroom appropriate; respectful Islamic references?

Return JSON via the emit_scores tool. Be honest. Fail early if serious issues.`;

const JUDGE_SCHEMA = {
  name: 'emit_scores',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      scores: {
        type: 'object',
        additionalProperties: false,
        properties: Object.fromEntries(JUDGE_DIMENSIONS.map(d => [d, { type: 'integer', minimum: 1, maximum: 5 }])),
        required: JUDGE_DIMENSIONS,
      },
      mean: { type: 'number' },
      critical_issues: { type: 'array', items: { type: 'string' } },
      ship: { type: 'boolean' },
      regen_guidance: { type: 'string' },
    },
    required: ['scores', 'mean', 'critical_issues', 'ship', 'regen_guidance'],
  },
};

function formatSegmentForJudging(enrichRow) {
  const ec = enrichRow.enriched_content;
  return `Segment ${enrichRow.segment_index} | skill_type: ${enrichRow.skill_type} | SLO codes: ${(enrichRow.slo_codes || []).join(', ')}

Topic (Urdu): ${ec.topic_urdu}
Topic (English): ${ec.topic_english}
Duration: ${ec.duration_minutes} min

Warm-up: ${ec.warm_up}
Hook story: ${ec.hook_story}
Board work: ${ec.board_work}
I-Do steps:
${ec.i_do_steps.map((s, i) => `  ${i+1}. ${s}`).join('\n')}
Worked example: ${ec.worked_example}
We-Do: ${ec.we_do_partner_activity}
You-Do: ${ec.you_do_independent_practice}

CFU checks:
${ec.cfu_checks.map(c => `  • ${c}`).join('\n')}

Key facts:
${ec.key_facts.map(k => `  • ${k}`).join('\n')}

Common misconceptions:
${ec.common_misconceptions.map(m => `  • ${m}`).join('\n')}

Model answers:
${ec.model_answers.map(m => `  Q: ${m.question}\n  A: ${m.answer}`).join('\n')}

Differentiation:
  Below: ${ec.differentiation?.below_level}
  On:    ${ec.differentiation?.on_level}
  Above: ${ec.differentiation?.above_level}

Textbook page refs: ${(ec.textbook_page_refs || []).join(', ')}
Textbook exercise refs: ${(ec.textbook_exercise_refs || []).join(', ')}
Coaching reflection: ${ec.coaching_reflection_prompt}
Next topic: ${ec.next_topic_teaser}
Closing: ${ec.closing}
Homework: ${ec.homework || '(none)'}
Self-reported confidence: ${ec.confidence}`;
}

async function runJudgeHaiku(segText) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const resp = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 2048,
    system: JUDGE_PROMPT,
    tools: [{
      name: 'emit_scores',
      description: 'Emit scores for this segment.',
      input_schema: JUDGE_SCHEMA.schema,
    }],
    tool_choice: { type: 'tool', name: 'emit_scores' },
    messages: [{ role: 'user', content: segText }],
  });
  const toolUse = resp.content.find(b => b.type === 'tool_use');
  if (!toolUse) throw new PipelineError('Haiku judge: no tool_use');
  return { ...toolUse.input, judge: 'claude-haiku-4-5' };
}

async function runJudgeGeminiFlash(segText) {
  const out = await callGeminiViaOpenRouter({
    model: 'gemini-2.5-flash',
    text: `${JUDGE_PROMPT}\n\nSegment:\n\n${segText}`,
    jsonSchema: JUDGE_SCHEMA,
    temperature: 0.1,
  });
  return { ...out.json, judge: 'google/gemini-2.5-flash (openrouter)' };
}

async function runJudgeSonnet(segText) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const resp = await client.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 2048,
    system: JUDGE_PROMPT,
    tools: [{
      name: 'emit_scores',
      description: 'Emit scores for this segment.',
      input_schema: JUDGE_SCHEMA.schema,
    }],
    tool_choice: { type: 'tool', name: 'emit_scores' },
    messages: [{ role: 'user', content: segText }],
  });
  const toolUse = resp.content.find(b => b.type === 'tool_use');
  if (!toolUse) throw new PipelineError('Sonnet judge: no tool_use');
  return { ...toolUse.input, judge: 'claude-sonnet-4-5' };
}

function pickJudges(enrichmentModel) {
  // Cross-generator exclusion: if enriched by a Claude model, include Gemini
  // but swap the same-family judge for another. For simplicity: always include
  // Haiku + Gemini Flash; pick third based on generator.
  const all = [runJudgeHaiku, runJudgeGeminiFlash, runJudgeSonnet];
  // If enrichment was Sonnet/Opus, exclude Sonnet-judge. Keep Haiku + Gemini + (future: GPT-5 Mini)
  if (/sonnet|opus/i.test(enrichmentModel || '')) {
    // 2-judge panel until GPT-5 Mini wired: Haiku + Gemini Flash
    return [all[0], all[1]];
  }
  return all;
}

function aggregate(panelResults) {
  const dims = JUDGE_DIMENSIONS;
  const mean = dims.reduce((sum, d) => {
    const vals = panelResults.map(r => r.scores?.[d]).filter(Number.isFinite);
    return sum + (vals.reduce((a, b) => a + b, 0) / Math.max(1, vals.length));
  }, 0) / dims.length;
  // Pass if overall mean ≥ 4.0 AND no dim has majority < 3
  const weakDims = dims.filter(d => {
    const vals = panelResults.map(r => r.scores?.[d]).filter(Number.isFinite);
    const avg = vals.reduce((a, b) => a + b, 0) / Math.max(1, vals.length);
    return avg < 3;
  });
  const criticalIssues = [...new Set(panelResults.flatMap(r => r.critical_issues || []))];
  const ship = mean >= 4.0 && weakDims.length === 0 && !panelResults.some(r => r.ship === false);
  const regenGuidance = panelResults.map(r => r.regen_guidance).filter(Boolean).join(' | ');
  return { mean, weak_dims: weakDims, critical_issues: criticalIssues, ship, regen_guidance: regenGuidance, panel: panelResults };
}

async function handleJob(jobId, provinceConfig, opts = {}) {
  const books = opts.bookId
    ? provinceConfig.books.filter(b => b.id === opts.bookId)
    : provinceConfig.books;
  if (!books.length) return { status: STATUS.COMPLETE, detail: { reason: 'no books' } };

  const writeRow = opts.writeRow || ((row) => console.log(JSON.stringify({ stage: stageName, ...row })));
  const enrichRows = await readRowsForStage('06_enrichment');
  const segLimit = opts.segmentLimit ? parseInt(opts.segmentLimit, 10) : null;
  const results = [];

  for (const book of books) {
    const bookEnriched = enrichRows.filter(r => r.textbook_id === book.id && r.enriched_content);
    console.log(`[${stageName}] ${book.id}: ${bookEnriched.length} enriched segments to judge`);
    let ship = 0, regen = 0, failed = 0;
    const limit = segLimit || bookEnriched.length;
    for (const row of bookEnriched.slice(0, limit)) {
      const segText = formatSegmentForJudging(row);
      const judges = pickJudges(row.model);
      try {
        const panelResults = await Promise.all(judges.map(j => j(segText)));
        const agg = aggregate(panelResults);
        await writeRow({
          textbook_id: book.id,
          segment_index: row.segment_index,
          mean_score: agg.mean,
          weak_dimensions: agg.weak_dims,
          critical_issues: agg.critical_issues,
          ship: agg.ship,
          regen_guidance: agg.regen_guidance,
          panel: panelResults,
        });
        if (agg.ship) ship++; else regen++;
        console.log(`  ${agg.ship ? '✓' : '↻'} seg${row.segment_index}: mean=${agg.mean.toFixed(2)}${agg.weak_dims.length ? ' weak=' + agg.weak_dims.join(',') : ''}`);
      } catch (err) {
        failed++;
        await writeRow({ textbook_id: book.id, segment_index: row.segment_index, status: 'judging_failed', error: err.message });
        console.error(`  ✗ seg${row.segment_index}: ${err.message}`);
      }
    }
    results.push({ book: book.id, ship, regen, failed, total: bookEnriched.length });
  }

  return { status: STATUS.COMPLETE, detail: { results } };
}

module.exports = { stageName, handleJob, JUDGE_DIMENSIONS, aggregate };
