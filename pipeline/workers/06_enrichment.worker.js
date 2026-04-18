/**
 * 06_enrichment.worker.js
 *
 * Stage 06: For each lp_segment, generate the 23-field enriched_content JSONB —
 * the actual teacher-facing Urdu lesson plan body. Even for Maths + English
 * books, the teacher-facing text is Urdu (scientific terms English). Pattern
 * extended from Rawalpindi's teacher-dialogue convention per Q4 decision.
 *
 * Reads Stage 02 OCR + Stage 03 ToC + Stage 04 SLOs + Stage 05 segments.
 * NEVER re-reads PDFs — massive cost win vs Rawalpindi which had Opus re-read.
 *
 * Primary: Claude Sonnet 4.6 with tool-use JSON.
 * Escalation: Opus 4.7 if Sonnet reports confidence < 0.85 on its own output.
 */

const Anthropic = require('@anthropic-ai/sdk');
const { STATUS, PipelineError } = require('./_base.worker');
const { readPagesForBook, readRowsForStage } = require('../lib/page_store');

const stageName = '06_enrichment';

const ENRICH_SYSTEM_PROMPT = `You are writing a pedagogically sound, teacher-ready Urdu lesson plan for a Sindh school teacher.

Output: a single enriched_content JSON via the emit_enriched tool.

Non-negotiables:
- Language: URDU for all teacher-facing narrative, instructions, dialogues, reflections — EVEN for Maths and English lessons.
- English is retained for: scientific terms, formulas (e.g. "2 + 2 = 4"), English vocab being taught, quoted text from the textbook if English-medium.
- Honorific: use EXACTLY the Sindh variant "صلی اللہ علیہ وآلہ وسلم" (with وآلہ) and "رضی اللہ تعالی عنہ" wherever needed. Never truncate to ﷺ alone in running text.
- Cite the textbook explicitly: "آپ کی کتاب کا صفحہ X دیکھیں" / "Open your book to page X" — use the numeral system appropriate to the subject (Urdu numerals for Urdu subject; Arabic for Maths/English).
- Ground every claim in the source OCR content you are given. Do NOT fabricate content not supported by the page snippets.
- Word budget: ≤ 350 words for Gr1-2 segments; ≤ 500 words for Gr3-5 segments (across all fields combined).
- Each activity ends with a CFU (Check for Understanding): thumbs up/down, choral response, mini-whiteboard, or exit ticket.
- GRR arc within the segment: I Do → We Do → You Do.
- Confidence self-assessment: return 0-1 honestly. If you hesitated, lower it.

Rubric you'll be graded on (downstream 3-judge panel):
  content_skill_alignment, topic_accuracy, boundary_quality, duration_feasibility,
  grr_arc, exercise_availability, cpa_sequence (maths only), diacritics_metadata,
  slo_relevance, blooms_appropriateness.`;

const ENRICH_TOOL = {
  name: 'emit_enriched',
  description: 'Emit the full 23-field enriched_content for a single segment.',
  input_schema: {
    type: 'object',
    properties: {
      topic_urdu: { type: 'string', description: 'Segment topic title in Urdu Nastaliq.' },
      topic_english: { type: 'string', description: 'Segment topic in English for internal reference.' },
      duration_minutes: { type: 'integer' },
      warm_up: { type: 'string', description: 'Urdu. 1-2 min opener — greeting + hook.' },
      hook_story: { type: 'string', description: 'Urdu. Culturally-resonant 2-3 sentence story/anecdote connecting to the topic.' },
      board_work: { type: 'string', description: 'Urdu (with English formulas/terms). Exactly what the teacher writes on the board.' },
      i_do_steps: {
        type: 'array',
        items: { type: 'string' },
        description: 'Urdu numbered steps — teacher models the skill. 2-4 steps.',
      },
      worked_example: { type: 'string', description: 'Urdu. One worked example verbatim. For maths this is a full problem → solution.' },
      we_do_partner_activity: { type: 'string', description: 'Urdu. Paired practice instructions + partner dialogue starter.' },
      you_do_independent_practice: { type: 'string', description: 'Urdu. What students do alone. Reference textbook exercise numbers if applicable.' },
      cfu_checks: {
        type: 'array',
        items: { type: 'string' },
        description: 'Urdu. 2-3 explicit Check-for-Understanding prompts the teacher will use.',
      },
      key_facts: {
        type: 'array',
        items: { type: 'string' },
        description: 'Urdu. 2-4 short facts/rules in amber-callout style.',
      },
      common_misconceptions: {
        type: 'array',
        items: { type: 'string' },
        description: 'Urdu. 2-3 student misconceptions the teacher should watch for.',
      },
      model_answers: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            question: { type: 'string' },
            answer: { type: 'string' },
          },
          required: ['question', 'answer'],
        },
        description: 'For every practice problem, a worked model answer.',
      },
      differentiation: {
        type: 'object',
        properties: {
          below_level: { type: 'string' },
          on_level: { type: 'string' },
          above_level: { type: 'string' },
        },
        description: 'Urdu. How to adjust for struggling / on-level / advanced students.',
      },
      materials_needed: {
        type: 'array',
        items: { type: 'string' },
        description: 'Urdu + English (e.g. textbook, chalk + board, takhti, کھلونے).',
      },
      textbook_page_refs: {
        type: 'array',
        items: { type: 'integer' },
        description: 'Printed page numbers this segment draws from.',
      },
      textbook_exercise_refs: {
        type: 'array',
        items: { type: 'string' },
        description: 'Specific exercise numbers / names the segment sends students to.',
      },
      coaching_reflection_prompt: { type: 'string', description: 'Urdu. 1-sentence reflection question the teacher should ask themselves post-lesson.' },
      next_topic_teaser: { type: 'string', description: 'Urdu. 1-sentence bridge to the next segment.' },
      closing: { type: 'string', description: 'Urdu. 1-2 min closing — recap + affirmation.' },
      homework: { type: 'string', description: 'Urdu. Optional — brief homework if applicable; else empty string.' },
      diacritics_required: { type: 'boolean', description: 'True if the Urdu text in this segment should be fully vowel-pointed (grades 1-3).' },
      confidence: { type: 'number', description: '0-1 self-assessed quality of this enrichment.' },
    },
    required: [
      'topic_urdu', 'topic_english', 'duration_minutes', 'warm_up', 'hook_story',
      'board_work', 'i_do_steps', 'worked_example', 'we_do_partner_activity',
      'you_do_independent_practice', 'cfu_checks', 'key_facts', 'common_misconceptions',
      'model_answers', 'differentiation', 'materials_needed', 'textbook_page_refs',
      'textbook_exercise_refs', 'coaching_reflection_prompt', 'next_topic_teaser',
      'closing', 'homework', 'diacritics_required', 'confidence',
    ],
  },
};

function buildEnrichmentUserMsg(book, segment, sloCodes, pages) {
  const ocrBlocks = pages.map(p => {
    const parts = [`-- PDF p${p.page_number} / printed p${p.textbook_page_number || '?'} --`];
    for (const b of (p.text_blocks || [])) parts.push(`[${b.role}] ${b.content}`);
    for (const i of (p.illustrations || [])) {
      const countStr = i.object_count != null ? ` (count=${i.object_count})` : '';
      parts.push(`[illustration:${i.pedagogical_role}] ${i.description}${countStr}`);
    }
    for (const e of (p.exercises || [])) parts.push(`[exercise:${e.type}] ${e.description}`);
    return parts.join('\n');
  }).join('\n\n');

  return `Book: ${book.id} | Grade ${book.grade} | Subject: ${book.subject} | Medium: ${book.medium || 'urdu'}

Segment #${segment.segment_index}
Chapter ${segment.chapter_number}: ${segment.chapter_title || '(chapter title unknown)'}
Pages: ${segment.page_start}-${segment.page_end}
Primary skill_type: ${segment.skill_type}${segment.cpa_phase ? ` (CPA phase: ${segment.cpa_phase})` : ''}
SLO codes to target: ${(sloCodes || []).join(', ') || '(none mapped yet)'}

Source OCR (text + illustrations + exercises for these pages):

${ocrBlocks}

Write the full enriched_content for this segment via the emit_enriched tool. Language: Urdu for teacher-facing body, English for scientific/technical terms. Follow all system rules.`;
}

async function enrichSegment(book, segment, sloCodes, pages, provinceConfig) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const primaryModel = provinceConfig.models?.enrichment || 'claude-sonnet-4-5';
  const escalateModel = provinceConfig.models?.enrichment_escalate || 'claude-opus-4-5';
  const confidenceThreshold = provinceConfig.eval_gates?.enrichment?.confidence_escalation ?? 0.85;

  async function callEnrich(modelId) {
    const userMsg = buildEnrichmentUserMsg(book, segment, sloCodes, pages);
    const resp = await client.messages.create({
      model: modelId,
      max_tokens: 4096,
      system: ENRICH_SYSTEM_PROMPT,
      tools: [ENRICH_TOOL],
      tool_choice: { type: 'tool', name: 'emit_enriched' },
      messages: [{ role: 'user', content: userMsg }],
    });
    const toolUse = resp.content.find(b => b.type === 'tool_use');
    if (!toolUse) throw new PipelineError(`enrich no tool_use from ${modelId}`);
    return { content: toolUse.input, usage: resp.usage, model: modelId };
  }

  let out = await callEnrich(primaryModel);
  let escalated = false;
  if ((out.content.confidence ?? 1) < confidenceThreshold) {
    escalated = true;
    out = await callEnrich(escalateModel);
  }
  return { ...out, escalated };
}

async function handleJob(jobId, provinceConfig, opts = {}) {
  const books = opts.bookId
    ? provinceConfig.books.filter(b => b.id === opts.bookId)
    : provinceConfig.books;
  if (!books.length) return { status: STATUS.COMPLETE, detail: { reason: 'no books' } };

  const writeRow = opts.writeRow || ((row) => console.log(JSON.stringify({ stage: stageName, ...row })));
  const segmentRows = await readRowsForStage('05_chunking');
  const sloRows = await readRowsForStage('04_slo_mapping');
  const segmentLimit = opts.segmentLimit ? parseInt(opts.segmentLimit, 10) : null;
  const results = [];

  for (const book of books) {
    const bookSegments = segmentRows.filter(r => r.textbook_id === book.id && r.segment_index != null);
    const bookSloMapping = sloRows.find(r => r.textbook_id === book.id);
    const pages = await readPagesForBook(book.id);

    console.log(`[${stageName}] ${book.id}: ${bookSegments.length} segments to enrich`);
    if (bookSegments.length === 0) continue;

    let enrichedCount = 0;
    const limit = segmentLimit || bookSegments.length;
    for (const seg of bookSegments.slice(0, limit)) {
      const sloCodes = (bookSloMapping?.chapter_slos || [])
        .find(c => c.chapter_number === seg.chapter_number)
        ?.slo_codes.map(s => s.code) || [];
      const segPages = pages.filter(p => {
        const pn = p.textbook_page_number ? parseInt(p.textbook_page_number, 10) : p.page_number;
        return !Number.isNaN(pn) && pn >= seg.page_start && pn <= seg.page_end;
      });
      try {
        const out = await enrichSegment(book, seg, sloCodes, segPages, provinceConfig);
        await writeRow({
          textbook_id: book.id,
          chapter_number: seg.chapter_number,
          segment_index: seg.segment_index,
          skill_type: seg.skill_type,
          enriched_content: out.content,
          confidence: out.content.confidence,
          model: out.model,
          escalated: out.escalated,
          usage: out.usage,
          slo_codes: sloCodes,
        });
        enrichedCount++;
        console.log(`  ✓ seg ${seg.segment_index} (ch ${seg.chapter_number}): conf=${out.content.confidence}, model=${out.model}${out.escalated ? ' [ESCALATED]' : ''}`);
      } catch (err) {
        await writeRow({
          textbook_id: book.id,
          segment_index: seg.segment_index,
          status: 'enrichment_failed',
          error: err.message,
        });
        console.error(`  ✗ seg ${seg.segment_index}: ${err.message}`);
      }
    }
    results.push({ book: book.id, enriched: enrichedCount, total_segments: bookSegments.length });
  }

  return { status: STATUS.COMPLETE, detail: { results } };
}

module.exports = { stageName, handleJob, enrichSegment };
