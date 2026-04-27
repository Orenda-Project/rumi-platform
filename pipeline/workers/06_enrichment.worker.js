/**
 * 06_enrichment.worker.js — Rawalpindi v7 schema + Sindh Urdu overlay
 *
 * Produces the 24-field enriched_content JSONB that Rawalpindi v7 slide
 * templates consume verbatim. Field names and semantics match
 * lp-content-generator.backup.js (bd-867).
 *
 * Sindh MVP overlay (Q4):
 *   - All teacher-facing narrative in Urdu (even for Maths/English books)
 *   - English retained for: scientific terms, formulas, English vocab being taught,
 *     quoted textbook content if the book is English-medium
 *   - Honorific: "صلی اللہ علیہ وآلہ وسلم" (Sindh variant, with واله)
 *
 * Reads Stage 02 structured OCR. Never re-reads PDFs. Sonnet → Opus escalation
 * when self-reported confidence < 0.85.
 */

const { STATUS, PipelineError } = require('./_base.worker');
const { readPagesForBook, readRowsForStage } = require('../lib/page_store');
const { callClaude } = require('../models/providers/anthropic_client');

const stageName = '06_enrichment';

const ENRICH_SYSTEM_PROMPT = `You are a lesson plan designer for Sindh government school teachers (Grades 1-5).
You build lesson plans that match the Rawalpindi v7 visual template exactly — same 24-field JSON schema the slide templates consume verbatim.

SINDH-SPECIFIC OVERLAY (non-negotiable):
- Language: URDU for all teacher-facing narrative, dialogues, reflections — EVEN for Maths and English books. The teacher reads these lines aloud; they speak Urdu in class.
- ENGLISH PRESERVED for: scientific terms, formulas (e.g. "2 + 2 = 4"), English vocabulary being taught, verbatim textbook content if the book is English-medium, numerals on Maths slides. Don't transliterate these.
- Honorific: use EXACTLY "صلی اللہ علیہ وآلہ وسلم" (with واله — Sindh variant, differs from Punjab). Never truncate to ﷺ alone in running text.
- For Urdu-subject books: 100% Urdu Nastaliq, no English except technical terms.

PEDAGOGICAL RULES (from Rawalpindi v7):
1. Reference ACTUAL content from the textbook OCR snippets provided — specific letters, words, numbers, exercises, stories.
2. ZERO placeholders. Never "Option A", "[word]", "___", "sound /___/".
3. Pakistani cultural context: names (Ali, Fatima, Sana, Usman), places (bazaar, cricket, roti, chai), Rs. for money.
4. For English/Maths books: teacher dialogue bilingual (Urdu primary, English for technical). For Urdu books: 100% Urdu.
5. Every problem, example, exercise tied to what's on the textbook pages.
6. Exit ticket must be a REAL MCQ with actual content from the lesson (not generic).
7. Word budget ceiling: ~350 words (Gr1-2) / ~500 words (Gr3-5) across all fields combined.

COUNTING-QUESTION INTEGRITY RULE (Bloom's L2+, NCP 2023, Gelman & Gallistel):
For ANY counting / quantity / cardinality question (Grades 1-3 especially), the
question stem MUST NOT state the quantity it is asking the student to find.
The numeral being assessed must appear ONLY in the visual / manipulative,
NEVER in the prose stem.
Self-check before emitting: *"If I delete the image, can the student still
derive the answer from the text alone?"* If YES → REWRITE the stem.

Examples (Maths Grade 1):
  LEAK: "تصویر میں 3 غبارے ہیں۔ خانے میں کون سا نمبر لکھیں؟" (answer "3" is in stem)
  FIX:  "تصویر دیکھیں — کتنے غبارے ہیں؟ خانے میں صحیح نمبر لکھیں۔"

  LEAK: "میں تین کنکر اٹھاتا ہوں — یہ کتنے ہیں؟" (answer "تین" is in stem)
  FIX:  "میں کچھ کنکر اٹھاتا ہوں — یہ کتنے ہیں؟"

  LEAK: "Saima has 5 mangoes. Count them and write the number."
  FIX:  "Saima has some mangoes. Count them and write the number."

This rule applies to: exitTicketQuestion, cfuExplain, cfuPractice, problems[],
wordProblem, weakLearnerSupport, challengeExtension, you_do instructions, and
any embedded comprehension prompt. ONLY exception: workedExample (the answer
is *meant* to be visible — that's a teacher demonstration, not a question).

Bloom's distinction: a stem that pre-states the quantity tests L1 Remember
(transcription only). The same content reframed as "how many?" tests L2
Understand + L3 Apply (count → cardinality → symbol). NCP 2023 SLO 1.N.1.2
requires both verbs ("count AND identify the corresponding numeral") — so
the stem must elicit counting.

CROSS-REFERENCE RULES:
- For reading_comprehension / tafheem: the reading passage may be on an earlier page — cite "صفحہ X" / "page X" explicitly.
- For revision / duhrai: explicitly cite which pages and days are being reviewed.
- For Maths concrete: use physical manipulatives (bottle caps, stones, sticks) and STAY WITHIN the concept being taught today.

Output via the emit_enriched tool. All 24 fields required. No commentary.`;

const ENRICH_TOOL = {
  name: 'emit_enriched',
  description: 'Emit the Rawalpindi v7 24-field enriched_content for a single segment.',
  input_schema: {
    type: 'object',
    properties: {
      warmUp: { type: 'string', description: '2-minute spiral review. Urdu for teacher-facing; reference previous lesson content if present.' },
      hookStory: { type: 'string', description: '3-4 sentence Pakistani cultural hook introducing TODAY\'S specific topic. Urdu primary. Local names, contexts.' },
      keyWords: { type: 'array', items: { type: 'string' }, description: '3-5 actual vocabulary words / terms FROM THE TEXTBOOK PAGES.' },
      boardWork: { type: 'string', description: 'Specific board setup: exact letters, words, numbers, or diagrams from the textbook content. Urdu instructions + preserved English/numeric content.' },
      steps: { type: 'array', items: { type: 'string' }, description: 'EXACTLY 3 steps for I-Do phase. Specific, textbook-rooted. Urdu teacher actions.' },
      teacherSays: { type: 'string', description: 'Urdu 1-2 sentence teacher prompt. For Urdu books: 100% Urdu Nastaliq. For others: Urdu primary.' },
      keyFact: { type: 'string', description: '1-sentence takeaway specific to today\'s textbook content. Urdu.' },
      cfuExplain: { type: 'string', description: 'Specific thumbs-up/down CFU question about today\'s content, not generic. Urdu.' },
      workedExample: { type: 'string', description: 'FULLY WORKED example using content from the textbook pages. Show all steps + answer. Mixed script OK.' },
      partnerActivity: { type: 'string', description: 'Partner activity with specific A/B dialogue frames using textbook content. Urdu dialogue lines.' },
      circulateInstruction: { type: 'string', description: 'Specific thing for teacher to look for as she walks around. Urdu.' },
      modelAnswer: { type: 'string', description: 'Specific correct answer for the worked example.' },
      cfuPractice: { type: 'string', description: 'Specific check-for-understanding question after practice. Urdu.' },
      problems: { type: 'array', items: { type: 'string' }, description: '2+ specific problems tied to the textbook (reference exercise numbers where present).' },
      wordProblem: { type: 'string', description: 'Word problem with Pakistani names + context, tied to today\'s content. Urdu primary.' },
      weakLearnerSupport: { type: 'string', description: 'Simplified version of a problem above; specific scaffold. Urdu.' },
      challengeExtension: { type: 'string', description: 'Harder extension problem using today\'s concept. Urdu.' },
      keyFacts: { type: 'array', items: { type: 'string' }, description: '2-4 specific takeaways from today\'s content.' },
      exitTicketQuestion: { type: 'string', description: '1 specific MCQ based on today\'s actual content.' },
      exitTicketChoices: { type: 'array', items: { type: 'string' }, description: '4 real options (strings). No generic "Option A".' },
      exitTicketCorrect: { type: 'string', enum: ['A', 'B', 'C', 'D'], description: 'The correct choice letter.' },
      homework: { type: 'string', description: 'Specific textbook page/exercise reference + what to do. Urdu.' },
      coachingReflection: { type: 'string', description: 'Lesson-specific teacher reflection question + a CTA to WhatsApp Rumi for feedback.' },
      nextTopicPreview: { type: 'string', description: '1-sentence preview of tomorrow\'s topic.' },
      manipulatives: { type: 'string', description: '(Maths concrete only, else empty string) Specific physical manipulatives the teacher should bring.' },
      hookCharacters: {
        type: 'array',
        description: 'Optional: 2+ character specs used in hook illustrations. Prefer when hookStory has named characters with dialogue.',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            role: { type: 'string' },
            position: { type: 'string' },
            speechBubble: { type: 'string' },
          },
          required: ['name', 'role', 'position', 'speechBubble'],
        },
      },
      confidence: { type: 'number', description: '0-1 self-assessed quality of this enrichment.' },
    },
    required: [
      'warmUp', 'hookStory', 'keyWords', 'boardWork', 'steps', 'teacherSays',
      'keyFact', 'cfuExplain', 'workedExample', 'partnerActivity', 'circulateInstruction',
      'modelAnswer', 'cfuPractice', 'problems', 'wordProblem', 'weakLearnerSupport',
      'challengeExtension', 'keyFacts', 'exitTicketQuestion', 'exitTicketChoices',
      'exitTicketCorrect', 'homework', 'coachingReflection', 'nextTopicPreview',
      'manipulatives', 'confidence',
    ],
  },
};

function buildEnrichmentUserMsg(book, segment, sloCodes, pages) {
  const ocrBlocks = pages.map(p => {
    const parts = [`=== PAGE ${p.textbook_page_number || p.page_number} (PDF index ${p.page_number}) ===`];
    for (const b of (p.text_blocks || [])) parts.push(`[${b.role}] ${b.content}`);
    for (const i of (p.illustrations || [])) {
      const countStr = i.object_count != null ? ` (count=${i.object_count})` : '';
      parts.push(`[illustration:${i.pedagogical_role}] ${i.description}${countStr}`);
    }
    for (const e of (p.exercises || [])) parts.push(`[exercise:${e.type}] ${e.description}`);
    return parts.join('\n');
  }).join('\n\n');

  const pageRange = segment.page_start === segment.page_end
    ? `page ${segment.page_start}`
    : `pages ${segment.page_start}-${segment.page_end}`;
  const wordCountTarget = book.grade <= 2 ? 350 : 500;

  return `Build a Rawalpindi-v7 lesson plan for this Sindh segment.

=== SEGMENT METADATA ===
Subject: ${book.subject}
Grade: ${book.grade}
Chapter: ${segment.chapter_title} (Chapter ${segment.chapter_number})
Today's topic: ${segment.topic || segment.chapter_title}
Skill type: ${segment.skill_type}
${segment.cpa_phase ? `CPA phase: ${segment.cpa_phase}` : ''}
Textbook pages for this lesson: ${pageRange}
SLO codes: ${(sloCodes || []).join(', ') || '(none)'}
Word count ceiling: ${wordCountTarget} words
Segment position: Day ${segment.segment_index}

=== ACTUAL TEXTBOOK CONTENT ON THESE PAGES ===
${ocrBlocks}

=== YOUR TASK ===
Build the 24-field JSON via the emit_enriched tool. Fill every field using actual textbook content. Follow the SINDH OVERLAY rules: Urdu teacher-facing, English preserved for technical content, honorific "صلی اللہ علیہ وآلہ وسلم" where needed.`;
}

async function enrichSegment(book, segment, sloCodes, pages, provinceConfig) {
  const primaryModel = provinceConfig.models?.enrichment || 'claude-sonnet-4-5';
  const escalateModel = provinceConfig.models?.enrichment_escalate || 'claude-opus-4-5';
  const confidenceThreshold = provinceConfig.eval_gates?.enrichment?.confidence_escalation ?? 0.85;

  async function callEnrich(modelId) {
    const userMsg = buildEnrichmentUserMsg(book, segment, sloCodes, pages);
    const resp = await callClaude({
      model: modelId,
      system: ENRICH_SYSTEM_PROMPT,
      userText: userMsg,
      tools: [ENRICH_TOOL],
      toolChoice: { type: 'tool', name: 'emit_enriched' },
      maxTokens: 8192,
    });
    if (!resp.toolInput) throw new PipelineError(`enrich no tool call from ${modelId}`);
    return { content: resp.toolInput, usage: resp.usage, model: resp.model };
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
  const onlySegmentIdx = opts.segmentIndex ? parseInt(opts.segmentIndex, 10) : null;
  const resume = opts.resume === true || opts.resume === 'true';
  const schemaVersion = opts.schemaVersion || 'rawalpindi_v7';
  const results = [];

  // If resuming, only skip segments already enriched with the SAME schema version
  let alreadyEnriched = new Set();
  if (resume) {
    const existing = await readRowsForStage('06_enrichment');
    for (const r of existing) {
      if (r.enriched_content && r.segment_index != null && r.schema_version === schemaVersion) {
        alreadyEnriched.add(`${r.textbook_id}:${r.segment_index}`);
      }
    }
    console.log(`[${stageName}] resume: ${alreadyEnriched.size} segments already enriched at v=${schemaVersion} — will skip`);
  }

  for (const book of books) {
    let bookSegments = segmentRows.filter(r => r.textbook_id === book.id && r.segment_index != null);
    if (onlySegmentIdx) bookSegments = bookSegments.filter(s => s.segment_index === onlySegmentIdx);
    const bookSloMapping = sloRows.find(r => r.textbook_id === book.id);
    const pages = await readPagesForBook(book.id);

    console.log(`[${stageName}] ${book.id}: ${bookSegments.length} segments to enrich (schema=${schemaVersion})`);
    if (bookSegments.length === 0) continue;

    let enrichedCount = 0;
    const limit = segmentLimit || bookSegments.length;
    for (const seg of bookSegments.slice(0, limit)) {
      if (resume && alreadyEnriched.has(`${book.id}:${seg.segment_index}`)) {
        enrichedCount++;
        continue;
      }
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
          schema_version: schemaVersion,
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

module.exports = { stageName, handleJob, enrichSegment, ENRICH_TOOL };
