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

// Exercise-type → skill_type mapping (taxonomy from 07_TAXONOMY_EVOLVED.md §4)
const EXERCISE_TO_SKILL = {
  // Urdu
  jawab_dijiye: 'tafheem',
  alfaaz_ki_jama: 'qawaid',
  fill_in_blank_with_preposition: 'qawaid',
  khushkhat_aur_imla: 'takhleeqi_likhai',
  jumla_saazi: 'jumla_saazi',
  buland_khwani: 'buland_khwani',
  imla: 'takhleeqi_likhai',
  // Maths
  count_and_write: 'concrete',
  read_trace_and_write: 'pictorial_abstract',
  colour: 'pictorial_abstract',
  word_problem: 'word_problem',
  mental_math_fluency: 'retrieval',
  // English
  alphabet_train: 'pre_reading',
  phonics_blend: 'phonics',
  speech_bubble_dialogue: 'oral_communication',
  rhyme_detection: 'phonics',
  spelling_dictation: 'writing',
  paragraph_composition: 'writing',
  creative_writing_prompt: 'writing',
  vocab_matching: 'vocabulary_grammar',
  practice_following_dialogues: 'oral_communication',
};

function mapExerciseToSkill(exerciseType) { return EXERCISE_TO_SKILL[exerciseType] || null; }

/**
 * Aggregate exercise types seen across a page range into skill_type votes.
 */
function skillVotesFromPages(pages) {
  const votes = {};
  for (const p of pages) {
    for (const e of (p.exercises || [])) {
      const skill = mapExerciseToSkill(e.type);
      if (skill) votes[skill] = (votes[skill] || 0) + 1;
    }
  }
  return votes;
}

/**
 * Heuristic chunking within a chapter: split pages into segments where the
 * dominant skill_type flips, OR every ~4 pages (grade 1-3) / ~6 pages (grade 4-5).
 */
function heuristicSplit(pagesForChapter, grade) {
  if (pagesForChapter.length === 0) return [];
  const targetPagesPerSegment = grade <= 3 ? 4 : 6;
  const segments = [];
  let buf = [];
  let currentSkill = null;

  function flushBuf() {
    if (buf.length === 0) return;
    const votes = skillVotesFromPages(buf);
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
    const vs = skillVotesFromPages([p]);
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
    const allSegments = heuristicSplit(pages, book.grade);
    allSegments.forEach((s, i) => segments.push({ ...s, chapter_number: null, segment_index: i + 1 }));
  } else {
    for (const ch of chapters) {
      const chapterPages = pages.filter(p => {
        const pn = p.textbook_page_number ? parseInt(p.textbook_page_number, 10) : p.page_number;
        return !Number.isNaN(pn) && pn >= ch.page_start && pn <= ch.page_end;
      });
      const chSegs = heuristicSplit(chapterPages, book.grade);
      const cpa = enforceCpaRule(chSegs, book.subject);
      cpa.forEach((s, i) => segments.push({ ...s, chapter_number: ch.chapter_number, chapter_title: ch.title, segment_index: segments.length + 1 }));
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
