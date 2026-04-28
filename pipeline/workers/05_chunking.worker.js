/**
 * 05_chunking.worker.js
 *
 * Stage 05: Given a chapter (from textbook_toc) + all its Stage-02 OCR pages,
 * produce lp_segments — LP-sized teaching units (25–30 min each) tagged with
 * skill_type from the provincial taxonomy.
 *
 * Approach: deterministic exercise-type → skill_type mapping (Rawalpindi
 * taxonomy, 07_TAXONOMY_EVOLVED.md) wherever possible; LLM (Haiku) only for
 * pages where the VLM exercise classifier was ambiguous or absent. Enforces
 * CPA rule for Maths (concrete before pictorial_abstract).
 */

const Anthropic = require('@anthropic-ai/sdk');
const { STATUS, PipelineError } = require('./_base.worker');
const { readPagesForBook, readRowsForStage } = require('../lib/page_store');
const { callClaude } = require('../models/providers/anthropic_client');

const stageName = '05_chunking';

const SEMANTIC_CHUNKER_MODEL = 'claude-sonnet-4-5';

const CHUNKER_SYSTEM_PROMPT = `You are a curriculum specialist segmenting a Pakistani Grade 1-5 textbook chapter into LP-sized teaching units (one segment = one ~25-30 minute classroom period).

You will be given:
- The chapter title and PDF page range
- Page-by-page OCR (text_blocks, exercises, illustrations) for every page in the chapter

Your job: split the chapter into segments where each segment is ONE coherent pedagogical lesson a teacher would deliver in one period.

HARD RULES:
1. NEVER split mid-exercise. If an exercise spans pages N and N+1, both pages live in the same segment.
2. NEVER split mid-passage / mid-explanation. A continued reading passage or worked example stays whole.
3. Use OCR \`lesson_title\`, \`header\`, and topic-changing \`body_paragraph\` blocks as the primary boundary signal — when the textbook starts a new named lesson, that begins a new segment.
4. Each segment covers ONE pedagogical topic (e.g. "Counting backward from 9", "Concept of zero", "Ascending order"). Don't merge unrelated topics.
5. Segment size: ~25-30 min teaching period. For G1-2 expect ~1-3 pages per segment; G3-5 ~2-5 pages. Single-page segments are OK if the page is a complete lesson.
6. Cover EVERY PDF page in the chapter range exactly once. No gaps, no overlaps. Use inclusive PDF indices (NOT printed page numbers — those are noisy heuristics, ignore them).
7. Skill type per segment, picked from the subject's taxonomy:
   - maths: \`concrete\` (intro with manipulatives), \`pictorial_abstract\` (visual + symbolic), \`word_problem\`, \`retrieval\` (mental math), \`revision\`
   - english: \`pre_reading\`, \`phonics\`, \`oral_communication\`, \`vocabulary_grammar\`, \`reading_comprehension\`, \`writing\`
   - urdu: \`tafheem\` (comprehension), \`qawaid\` (grammar), \`takhleeqi_likhai\` (creative writing), \`jumla_saazi\` (sentence-building), \`buland_khwani\` (reading aloud), \`alfaaz_maani\` (vocabulary)
8. CPA rule (maths only): if a chapter introduces a new concept, the FIRST segment must be \`concrete\` (manipulative-driven), then \`pictorial_abstract\` follows, then \`word_problem\`/\`retrieval\` for practice.

OUTPUT via the \`emit_chapter_segments\` tool. For each segment include:
- \`topic\`: short English-named topic the segment teaches (e.g. "Counting backward from 9 to 0")
- \`pdf_pages\`: [start, end] inclusive PDF indices
- \`skill_type\`: one of the subject's taxonomy values above
- \`cpa_phase\`: maths only — \`concrete\` | \`pictorial\` | \`abstract\` | null
- \`estimated_minutes\`: integer 20-40
- \`lesson_title_in_book\`: the actual title text from the OCR (or "(no title)" if none)
- \`split_rationale\`: 1 short sentence explaining why this is a separate segment from the next one ("Split before PDF 20 because new lesson title 'Ascending order' begins.")

Aim for the natural number of segments the chapter contains — typically 4-10 for G1-2 maths, 6-12 for higher grades. Don't pad.`;

const CHUNKER_TOOL = {
  name: 'emit_chapter_segments',
  description: 'Emit the semantic segmentation of one chapter.',
  input_schema: {
    type: 'object',
    properties: {
      segments: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            topic: { type: 'string' },
            pdf_pages: { type: 'array', items: { type: 'integer' }, minItems: 2, maxItems: 2 },
            skill_type: { type: 'string' },
            cpa_phase: { type: 'string' },
            estimated_minutes: { type: 'integer' },
            lesson_title_in_book: { type: 'string' },
            split_rationale: { type: 'string' },
          },
          required: ['topic', 'pdf_pages', 'skill_type', 'estimated_minutes', 'split_rationale'],
        },
      },
    },
    required: ['segments'],
  },
};

function buildChapterOcrBlob(chapterPages) {
  const parts = [];
  for (const p of chapterPages.sort((a, b) => a.page_number - b.page_number)) {
    parts.push(`=== PDF page ${p.page_number} ===`);
    for (const b of (p.text_blocks || [])) {
      parts.push(`  [${b.role}] ${(b.content || '').substring(0, 400)}`);
    }
    for (const e of (p.exercises || [])) {
      parts.push(`  [exercise:${e.type}] ${(e.description || '').substring(0, 200)}`);
    }
    for (const i of (p.illustrations || [])) {
      parts.push(`  [illustration:${i.pedagogical_role || 'figure'}] ${(i.description || '').substring(0, 200)}`);
    }
  }
  return parts.join('\n');
}

async function semanticChunkChapter(book, chapter, chapterPages, bounds) {
  const ocrBlob = buildChapterOcrBlob(chapterPages);
  const userText = `Segment this chapter into LP-sized teaching units.

CHAPTER METADATA:
- Subject: ${book.subject}
- Grade: ${book.grade}
- Chapter ${chapter.chapter_number}: ${chapter.title}
- PDF page range: ${bounds.pdfStart}–${bounds.pdfEnd} (${chapterPages.length} pages)

CHAPTER OCR:
${ocrBlob.substring(0, 80000)}

Emit segments via emit_chapter_segments. Cover every PDF page in [${bounds.pdfStart}, ${bounds.pdfEnd}] exactly once.`;

  const resp = await callClaude({
    model: SEMANTIC_CHUNKER_MODEL,
    system: CHUNKER_SYSTEM_PROMPT,
    userText,
    tools: [CHUNKER_TOOL],
    toolChoice: { type: 'tool', name: 'emit_chapter_segments' },
    maxTokens: 8192,
    temperature: 0.1,
  });
  if (!resp.toolInput || !Array.isArray(resp.toolInput.segments)) {
    const dbg = JSON.stringify(resp).substring(0, 400);
    throw new PipelineError(`semantic chunker returned no segments for ch${chapter.chapter_number}: ${dbg}`);
  }
  return { segments: resp.toolInput.segments, model: resp.model, usage: resp.usage };
}

function validateChapterCoverage(segments, bounds, chapterNumber) {
  const issues = [];
  const covered = new Set();
  for (const s of segments) {
    const [a, b] = s.pdf_pages || [];
    if (!Number.isInteger(a) || !Number.isInteger(b) || a > b) {
      issues.push(`ch${chapterNumber}: invalid pdf_pages ${JSON.stringify(s.pdf_pages)} for "${s.topic}"`);
      continue;
    }
    for (let p = a; p <= b; p++) {
      if (covered.has(p)) issues.push(`ch${chapterNumber}: PDF page ${p} covered by multiple segments`);
      covered.add(p);
    }
  }
  for (let p = bounds.pdfStart; p <= bounds.pdfEnd; p++) {
    if (!covered.has(p)) issues.push(`ch${chapterNumber}: PDF page ${p} uncovered`);
  }
  return issues;
}

// Exercise-type → skill_type mapping (taxonomy from 07_TAXONOMY_EVOLVED.md §4).
// Subject-aware: the same VLM exercise label means different things in
// different subjects (e.g. "fill_in_blank" is grammar in Urdu, retrieval in
// Maths, vocab in English).
const PER_SUBJECT_MAP = {
  urdu: {
    jawab_dijiye: 'tafheem',
    alfaaz_ki_jama: 'qawaid',
    fill_in_blank_with_preposition: 'qawaid',
    fill_in_blank: 'qawaid',
    khushkhat_aur_imla: 'takhleeqi_likhai',
    imla: 'takhleeqi_likhai',
    spelling_dictation: 'takhleeqi_likhai',
    jumla_saazi: 'jumla_saazi',
    sentence_making: 'jumla_saazi',
    buland_khwani: 'buland_khwani',
    reading_aloud: 'buland_khwani',
    paragraph_composition: 'takhleeqi_likhai',
    creative_writing_prompt: 'takhleeqi_likhai',
    vocab_matching: 'alfaaz_maani',
    word_meaning: 'alfaaz_maani',
  },
  maths: {
    count_and_write: 'concrete',
    read_trace_and_write: 'pictorial_abstract',
    colour: 'pictorial_abstract',
    colouring: 'pictorial_abstract',
    trace_and_write: 'pictorial_abstract',
    word_problem: 'word_problem',
    mental_math_fluency: 'retrieval',
    mental_math: 'retrieval',
    number_facts: 'retrieval',
    fill_in_blank: 'retrieval',                     // Maths fill-in = number sense
    fill_in_blank_with_preposition: 'retrieval',    // VLM misuses this label on Maths
    vocab_matching: 'pictorial_abstract',           // matching on Maths = visual matching
    match_numbers: 'pictorial_abstract',
    circle_the_correct: 'pictorial_abstract',
  },
  english: {
    alphabet_train: 'pre_reading',
    letter_recognition: 'pre_reading',
    phonics_blend: 'phonics',
    sound_blending: 'phonics',
    rhyme_detection: 'phonics',
    speech_bubble_dialogue: 'oral_communication',
    practice_following_dialogues: 'oral_communication',
    dialogue_practice: 'oral_communication',
    spelling_dictation: 'writing',
    paragraph_composition: 'writing',
    creative_writing_prompt: 'writing',
    vocab_matching: 'vocabulary_grammar',
    fill_in_blank: 'vocabulary_grammar',
    fill_in_blank_with_preposition: 'vocabulary_grammar',
    reading_comprehension_qa: 'reading_comprehension',
    comprehension_questions: 'reading_comprehension',
  },
};

function mapExerciseToSkill(exerciseType, subject) {
  const subjectMap = PER_SUBJECT_MAP[subject] || {};
  return subjectMap[exerciseType] || null;
}

/**
 * Aggregate exercise types seen across a page range into skill_type votes.
 * Subject-aware: `fill_in_blank` means different things in Urdu vs Maths.
 */
function skillVotesFromPages(pages, subject) {
  const votes = {};
  for (const p of pages) {
    for (const e of (p.exercises || [])) {
      const skill = mapExerciseToSkill(e.type, subject);
      if (skill) votes[skill] = (votes[skill] || 0) + 1;
    }
  }
  return votes;
}

/**
 * Heuristic chunking within a chapter: split pages into segments where the
 * dominant skill_type flips, OR every ~4 pages (grade 1-3) / ~6 pages (grade 4-5).
 */
function heuristicSplit(pagesForChapter, grade, subject) {
  if (pagesForChapter.length === 0) return [];
  const targetPagesPerSegment = grade <= 3 ? 4 : 6;
  const segments = [];
  let buf = [];
  let currentSkill = null;

  function flushBuf() {
    if (buf.length === 0) return;
    const votes = skillVotesFromPages(buf, subject);
    const topSkill = Object.entries(votes).sort((a, b) => b[1] - a[1])[0]?.[0] || currentSkill || 'revision';
    segments.push({
      page_start: buf[0].textbook_page_number || buf[0].page_number,
      page_end: buf[buf.length - 1].textbook_page_number || buf[buf.length - 1].page_number,
      pdf_pages: [buf[0].page_number, buf[buf.length - 1].page_number],
      skill_type: topSkill,
      vote_breakdown: votes,
      page_count: buf.length,
    });
    buf = [];
  }

  for (const p of pagesForChapter) {
    const vs = skillVotesFromPages([p], subject);
    const topHere = Object.entries(vs).sort((a, b) => b[1] - a[1])[0]?.[0];
    if (currentSkill && topHere && topHere !== currentSkill) {
      flushBuf();
      currentSkill = topHere;
    } else if (!currentSkill && topHere) {
      currentSkill = topHere;
    }
    buf.push(p);
    if (buf.length >= targetPagesPerSegment) { flushBuf(); currentSkill = null; }
  }
  flushBuf();
  return segments;
}

/**
 * Enforce CPA rule for maths chapters: the first segment of a new topic MUST
 * be `concrete` if the chapter introduces a new concept. We detect "new topic"
 * by checking if the first page has a `count_and_write` or `read_trace_and_write`
 * exercise — it's always concrete-introductory.
 */
function enforceCpaRule(segments, subject) {
  if (subject !== 'maths') return segments;
  if (segments.length === 0) return segments;
  // If the first segment's page has concrete cues but was classified as pictorial_abstract, flip.
  const first = segments[0];
  if (first.vote_breakdown?.concrete && first.skill_type === 'pictorial_abstract') {
    first.skill_type = 'concrete';
    first.cpa_enforced = true;
  }
  // Label CPA phases across all segments
  for (const s of segments) {
    s.cpa_phase = s.skill_type === 'concrete' ? 'concrete' :
                  s.skill_type === 'pictorial_abstract' ? 'pictorial_abstract' :
                  s.skill_type === 'word_problem' ? 'abstract' : null;
  }
  return segments;
}

/**
 * Detect chapter PDF boundaries by scanning OCR text_blocks for the chapter
 * title. For each chapter, find the FIRST PDF page where the title appears
 * prominently (in a lesson_title or header text_block). The chapter ends one
 * PDF page before the NEXT chapter's first page (or at total_pages for the
 * last chapter).
 *
 * Title matching: normalise to uppercase, strip punctuation, do substring
 * match against the first 8 words of the title. Uses jaccard-ish similarity
 * on tokens to handle minor OCR noise.
 */
function detectChapterBoundariesFromOcr(pages, orderedChapters) {
  function normalise(s) {
    return (s || '').toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function tokensOf(s) { return new Set(normalise(s).split(' ').filter(Boolean)); }
  function similarity(a, b) {
    const A = tokensOf(a), B = tokensOf(b);
    if (A.size === 0 || B.size === 0) return 0;
    let inter = 0;
    for (const t of A) if (B.has(t)) inter++;
    return inter / Math.min(A.size, B.size);  // recall-style: how many title words appear
  }

  // For each chapter, score every PDF page on title match. Pick the first page with score >= 0.6.
  const candidateStarts = {};
  const sortedPages = [...pages].sort((a, b) => a.page_number - b.page_number);
  for (const ch of orderedChapters) {
    let bestPage = null;
    for (const p of sortedPages) {
      const blocks = (p.text_blocks || []).filter(b => ['lesson_title', 'header'].includes(b.role));
      const blob = blocks.map(b => b.content || '').join(' ');
      const sim = similarity(blob, ch.title);
      // Require ≥60% of chapter-title tokens to appear in this page's titles/headers
      if (sim >= 0.6) {
        bestPage = p.page_number;
        break;
      }
    }
    candidateStarts[ch.chapter_number] = bestPage;
  }

  // For chapters where OCR detection failed, fall back to the ToC printed-page
  // estimate using the first detected chapter as anchor.
  const detectedNumbers = orderedChapters.filter(c => candidateStarts[c.chapter_number] != null).map(c => c.chapter_number);
  if (detectedNumbers.length > 0) {
    const anchor = orderedChapters.find(c => c.chapter_number === detectedNumbers[0]);
    const anchorPdfStart = candidateStarts[anchor.chapter_number];
    const baseOffset = anchorPdfStart - anchor.page_start;
    for (const ch of orderedChapters) {
      if (candidateStarts[ch.chapter_number] == null) {
        candidateStarts[ch.chapter_number] = ch.page_start + baseOffset;
      }
    }
  }

  // Compute end of each chapter as one PDF page before the next chapter's start.
  const totalPages = sortedPages[sortedPages.length - 1]?.page_number || 0;
  const result = {};
  for (let i = 0; i < orderedChapters.length; i++) {
    const ch = orderedChapters[i];
    const start = candidateStarts[ch.chapter_number];
    if (start == null) continue;
    const next = orderedChapters[i + 1];
    const nextStart = next ? candidateStarts[next.chapter_number] : null;
    const end = (nextStart != null) ? nextStart - 1 : totalPages;
    result[ch.chapter_number] = { pdfStart: start, pdfEnd: end };
  }
  return result;
}

async function chunkBook(book, provinceConfig, tocRows) {
  const pages = await readPagesForBook(book.id);
  if (pages.length === 0) throw new PipelineError(`No OCR pages for ${book.id}. Run Stage 02 first.`);

  // Index pages by printed page number (fallback to PDF page_number)
  const pageByPrinted = new Map();
  for (const p of pages) {
    const key = p.textbook_page_number ? String(p.textbook_page_number) : String(p.page_number);
    pageByPrinted.set(key, p);
  }

  const bookToc = tocRows.find(r => r.textbook_id === book.id);
  const chapters = bookToc?.toc?.chapters || [];

  const segments = [];
  if (chapters.length === 0) {
    // Fallback: chunk the whole book by target page count, no chapter structure
    const allSegments = heuristicSplit(pages, book.grade, book.subject);
    allSegments.forEach((s, i) => segments.push({ ...s, chapter_number: null, segment_index: i + 1 }));
  } else {
    // Detect ACTUAL chapter→PDF boundaries by scanning OCR for chapter titles
    // in text_blocks. ToC printed-page numbers drift from PDF indices after
    // section breaks; this content-based detection is robust.
    const orderedChapters = [...chapters].sort((a, b) => a.chapter_number - b.chapter_number);
    const chapterPdfBoundaries = detectChapterBoundariesFromOcr(pages, orderedChapters);

    for (let i = 0; i < orderedChapters.length; i++) {
      const ch = orderedChapters[i];
      const bounds = chapterPdfBoundaries[ch.chapter_number];
      if (!bounds) {
        console.warn(`  no PDF boundary detected for ch${ch.chapter_number} — skipping`);
        continue;
      }
      const chapterPages = pages.filter(p => p.page_number >= bounds.pdfStart && p.page_number <= bounds.pdfEnd);
      console.log(`  ch${ch.chapter_number} "${ch.title}" PDF ${bounds.pdfStart}-${bounds.pdfEnd} (${chapterPages.length} pages) → semantic chunker`);
      let chSegs;
      try {
        const out = await semanticChunkChapter(book, ch, chapterPages, bounds);
        chSegs = out.segments;
        const coverageIssues = validateChapterCoverage(chSegs, bounds, ch.chapter_number);
        if (coverageIssues.length > 0) {
          console.warn(`    coverage issues:\n      ${coverageIssues.join('\n      ')}`);
        }
        console.log(`    ✓ ${chSegs.length} semantic segments (${out.model})`);
      } catch (err) {
        console.warn(`    semantic chunker failed (${err.message?.substring(0, 100)}); falling back to heuristic`);
        chSegs = heuristicSplit(chapterPages, book.grade, book.subject);
      }

      // Normalise semantic-chunker output into the row shape downstream stages expect.
      const normalised = chSegs.map((s) => {
        const [pdfStart, pdfEnd] = s.pdf_pages || [s.pdf_pages_start, s.pdf_pages_end];
        const segPages = chapterPages.filter(p => p.page_number >= pdfStart && p.page_number <= pdfEnd);
        const votes = skillVotesFromPages(segPages, book.subject);
        return {
          page_start: segPages[0]?.textbook_page_number || pdfStart,
          page_end: segPages[segPages.length - 1]?.textbook_page_number || pdfEnd,
          pdf_pages: [pdfStart, pdfEnd],
          skill_type: s.skill_type || Object.entries(votes).sort((a, b) => b[1] - a[1])[0]?.[0] || 'revision',
          cpa_phase: s.cpa_phase || null,
          page_count: pdfEnd - pdfStart + 1,
          vote_breakdown: votes,
          topic: s.topic,
          lesson_title_in_book: s.lesson_title_in_book,
          split_rationale: s.split_rationale,
          estimated_minutes: s.estimated_minutes,
        };
      });
      const cpa = enforceCpaRule(normalised, book.subject);
      cpa.forEach((s) => segments.push({
        ...s,
        chapter_number: ch.chapter_number,
        chapter_title: ch.title,
        chapter_pdf_start: bounds.pdfStart,
        chapter_pdf_end: bounds.pdfEnd,
        segment_index: segments.length + 1,
      }));
    }
  }

  return { segments, chapter_count: chapters.length, total_pages: pages.length };
}

async function handleJob(jobId, provinceConfig, opts = {}) {
  const books = opts.bookId
    ? provinceConfig.books.filter(b => b.id === opts.bookId)
    : provinceConfig.books;
  if (!books.length) return { status: STATUS.COMPLETE, detail: { reason: 'no books' } };

  const writeRow = opts.writeRow || ((row) => console.log(JSON.stringify({ stage: stageName, ...row })));
  const tocRows = await readRowsForStage('03_toc_extract');
  const results = [];

  for (const book of books) {
    console.log(`[${stageName}] ${book.id}`);
    try {
      const out = await chunkBook(book, provinceConfig, tocRows);
      for (const seg of out.segments) {
        await writeRow({
          textbook_id: book.id,
          chapter_number: seg.chapter_number,
          chapter_title: seg.chapter_title,
          segment_index: seg.segment_index,
          skill_type: seg.skill_type,
          cpa_phase: seg.cpa_phase || null,
          page_start: seg.page_start,
          page_end: seg.page_end,
          pdf_pages: seg.pdf_pages,
          page_count: seg.page_count,
          vote_breakdown: seg.vote_breakdown,
          cpa_enforced: seg.cpa_enforced || false,
          topic: seg.topic || null,
          lesson_title_in_book: seg.lesson_title_in_book || null,
          split_rationale: seg.split_rationale || null,
          estimated_minutes: seg.estimated_minutes || null,
        });
      }
      console.log(`  ✓ ${out.segments.length} segments from ${out.chapter_count} chapters (${out.total_pages} pages)`);
      results.push({ book: book.id, segments: out.segments.length, chapters: out.chapter_count });
    } catch (err) {
      console.error(`  ✗ ${book.id}: ${err.message}`);
      await writeRow({ textbook_id: book.id, status: 'chunking_failed', error: err.message });
      results.push({ book: book.id, status: 'failed', error: err.message });
    }
  }

  return { status: STATUS.COMPLETE, detail: { results } };
}

module.exports = { stageName, handleJob, chunkBook, heuristicSplit, enforceCpaRule, mapExerciseToSkill };
