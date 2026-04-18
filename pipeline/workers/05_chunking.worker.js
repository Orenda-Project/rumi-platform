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

const stageName = '05_chunking';

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
    // Map each PDF page to exactly ONE chapter using ToC ordering on PDF index,
    // not printed page number (the printed-number heuristic is noisy).
    // Order chapters by page_start ascending; partition pages by chapter boundary.
    const orderedChapters = [...chapters].sort((a, b) => a.page_start - b.page_start);
    // Estimate PDF-index range per chapter by proportional mapping: assume
    // front matter uses first 1..5 PDF pages; remaining PDF pages distributed
    // linearly across chapters weighted by (page_end - page_start + 1).
    // Simpler fallback: treat printed-page range as PDF-page range directly +
    // a learned offset (first-content-page PDF index minus chapter-1 page_start).
    const firstContentPdfPage = pages.find(p => {
      const hasTitle = (p.text_blocks||[]).some(b => b.role === 'lesson_title' || b.role === 'header');
      return hasTitle;
    })?.page_number || 1;
    const offset = firstContentPdfPage - orderedChapters[0].page_start;

    for (const ch of orderedChapters) {
      const chPdfStart = ch.page_start + offset;
      const chPdfEnd = ch.page_end + offset;
      const chapterPages = pages.filter(p => p.page_number >= chPdfStart && p.page_number <= chPdfEnd);
      const chSegs = heuristicSplit(chapterPages, book.grade, book.subject);
      const cpa = enforceCpaRule(chSegs, book.subject);
      cpa.forEach((s) => segments.push({ ...s, chapter_number: ch.chapter_number, chapter_title: ch.title, segment_index: segments.length + 1 }));
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
