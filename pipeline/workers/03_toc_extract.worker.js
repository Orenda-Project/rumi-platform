/**
 * 03_toc_extract.worker.js
 *
 * Stage 03: Extract table-of-contents / chapter structure from a textbook's
 * first ~20 pages. Reads Stage 02 OCR output; does NOT re-read PDFs.
 *
 * Approach: feed the aggregated text from first 20 pages into Gemini 2.5 Flash
 * with a strict responseSchema for an ordered list of chapters with page ranges
 * and learning outcomes. Validate structural constraints. Write to textbook_toc.
 */

const { STATUS, PipelineError } = require('./_base.worker');
const { readPagesForBook } = require('../lib/page_store');
const { callGeminiViaOpenRouter } = require('../models/providers/gemini_client');

const stageName = '03_toc_extract';

const TOC_SYSTEM_PROMPT = `You are extracting the Table of Contents and chapter structure from a textbook.
Input: OCR output from the first ~20 pages of a textbook (front matter, ToC pages, possibly the start of Unit 1).
Task: identify every CHAPTER / UNIT, its exact title, its page range in the PRINTED page numbering (not PDF index), and (where listed) its learning outcomes / student objectives.

Rules:
- Use the book's actual printed ToC page if visible. Otherwise infer from chapter headings seen in content.
- page_start and page_end are PRINTED page numbers. If the ToC shows "12-25", page_start=12, page_end=25.
- If a ToC entry has no end-page listed, compute it from the next chapter's start_page minus 1; set page_end=start_page if a single-page chapter.
- Learning outcomes: copy verbatim from the page if shown; else empty string.
- Do NOT invent chapters not visible in the input. Return fewer rather than more.
- Order chapters by chapter_number ascending.`;

// OpenRouter-style JSON schema (OpenAI-compatible)
const TOC_SCHEMA = {
  name: 'extract_toc',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      chapters: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            chapter_number: { type: 'integer' },
            title: { type: 'string' },
            title_in_script: { type: 'string' },
            page_start: { type: 'integer' },
            page_end: { type: 'integer' },
            learning_outcomes: { type: 'string' },
            evidence: { type: 'string' },
          },
          required: ['chapter_number', 'title', 'title_in_script', 'page_start', 'page_end', 'learning_outcomes', 'evidence'],
        },
      },
      toc_source: { type: 'string', enum: ['printed_toc', 'inferred_from_chapter_openers', 'mixed', 'unknown'] },
      confidence: { type: 'number' },
    },
    required: ['chapters', 'toc_source', 'confidence'],
  },
};

function pagesToPromptInput(pages) {
  return pages.map(p => {
    const blocks = (p.text_blocks || []).map(b => `  [${b.role}] ${b.content}`).join('\n');
    return `=== PDF page ${p.page_number} | printed page ${p.textbook_page_number || '?'} ===\n${blocks}`;
  }).join('\n\n');
}

async function extractTocForBook(book, provinceConfig) {
  const pages = await readPagesForBook(book.id, { startPage: 1, endPage: 25 });
  if (pages.length === 0) {
    throw new PipelineError(`No OCR rows found for ${book.id}. Run Stage 02 first.`, { retryable: false });
  }
  const promptInput = pagesToPromptInput(pages);
  const modelId = provinceConfig.models?.toc_extract || 'gemini-2.5-flash';
  const userMsg = `${TOC_SYSTEM_PROMPT}\n\nBook: ${book.id} (grade ${book.grade}, subject ${book.subject})\n\nOCR from first ${pages.length} pages:\n\n${promptInput}`;

  const result = await callGeminiViaOpenRouter({
    model: modelId,
    text: userMsg,
    jsonSchema: TOC_SCHEMA,
    temperature: 0.1,
    maxTokens: 4096,
  });
  return { toc: result.json, usage: result.usage, pages_read: pages.length, model: result.model };
}

function validateToc(toc, book) {
  const issues = [];
  if (!toc.chapters || toc.chapters.length === 0) issues.push('no_chapters');
  let prev = 0;
  for (const c of (toc.chapters || [])) {
    if (c.page_end < c.page_start) issues.push(`chapter_${c.chapter_number}_invalid_range`);
    if (c.chapter_number <= prev) issues.push(`chapter_${c.chapter_number}_not_monotonic`);
    prev = c.chapter_number;
  }
  return { valid: issues.length === 0, issues };
}

async function handleJob(jobId, provinceConfig, opts = {}) {
  const books = opts.bookId
    ? provinceConfig.books.filter(b => b.id === opts.bookId)
    : provinceConfig.books;
  if (!books.length) return { status: STATUS.COMPLETE, detail: { reason: 'no books' } };

  const writeRow = opts.writeRow || ((row) => console.log(JSON.stringify({ stage: stageName, ...row })));
  const results = [];

  for (const book of books) {
    console.log(`[${stageName}] ${book.id}`);
    try {
      const out = await extractTocForBook(book, provinceConfig);
      const validation = validateToc(out.toc, book);
      await writeRow({
        textbook_id: book.id,
        toc: out.toc,
        toc_source: out.toc.toc_source,
        confidence: out.toc.confidence,
        validation,
        pages_read: out.pages_read,
        usage: out.usage,
        ocr_model: provinceConfig.models?.toc_extract || 'gemini-2.5-flash',
      });
      console.log(`  ✓ ${out.toc.chapters.length} chapters, conf=${out.toc.confidence}, source=${out.toc.toc_source}, valid=${validation.valid}`);
      results.push({ book: book.id, chapters: out.toc.chapters.length, valid: validation.valid });
    } catch (err) {
      console.error(`  ✗ ${book.id}: ${err.message}`);
      await writeRow({ textbook_id: book.id, status: 'toc_failed', error: err.message });
      results.push({ book: book.id, status: 'failed', error: err.message });
    }
  }

  return { status: STATUS.COMPLETE, detail: { results } };
}

module.exports = { stageName, handleJob, extractTocForBook, validateToc, TOC_SCHEMA };
