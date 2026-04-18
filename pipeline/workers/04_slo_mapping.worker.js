/**
 * 04_slo_mapping.worker.js
 *
 * Stage 04: Given textbook_toc + NCP 2023 catalog, derive SLO codes per chapter.
 * Uses Claude Sonnet 4.6 for text-only reasoning (no vision).
 *
 * For Sindh MVP: NCP 2023 is the national backbone; Sindh-specific SLOs get a
 * provincial prefix. Re-derived per the Q12 decision — we don't reuse Punjab's
 * mappings verbatim.
 */

const Anthropic = require('@anthropic-ai/sdk');
const { STATUS, PipelineError } = require('./_base.worker');
const { readRowsForStage } = require('../lib/page_store');

const stageName = '04_slo_mapping';

const SLO_SYSTEM_PROMPT = `You are mapping textbook chapter content to curriculum Student Learning Outcome codes.

Curriculum: NCP 2023 (Pakistan National Curriculum). Province: Sindh. Grade and subject given per chapter.

Output format: for each chapter, produce an array of SLO codes in the format:
  {SubjectCode}-{Grade}-{DomainCode}-{Number}
where:
  SubjectCode: E (English), M (Maths), U (Urdu)
  DomainCode (subject-specific):
    English:  PR (pre-reading), PH (phonics), RC (reading comp), OC (oral comm),
              VG (vocab/grammar), WR (writing), RV (revision)
    Maths:    NS (number sense), MO (measurement), GE (geometry), DA (data),
              PF (problem solving/fluency), RV (revision)
    Urdu:     AM (alfaaz-maani), BK (buland-khwani), TF (tafheem), AS (arkaan-saazi),
              QW (qawaid), JS (jumla-saazi), TL (takhleeqi-likhai), DH (duhrai)

Example output codes: E-3-PH-1, M-1-NS-2.3, U-5-TF-4

For each chapter:
- Derive 2-5 SLO codes that best match the chapter's learning outcomes + topic.
- Include a 1-sentence rationale tying each code to the chapter content.
- Mark province_specific=true for codes that are Sindh-specific (e.g. Sindhi cultural content, regional references) and not part of the bare NCP 2023 spec.

Be conservative: fewer, more specific codes > many loose ones.`;

const SLO_TOOL = {
  name: 'map_chapter_slos',
  description: 'Emit SLO codes for every chapter in the book.',
  input_schema: {
    type: 'object',
    properties: {
      chapters: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            chapter_number: { type: 'integer' },
            slo_codes: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  rationale: { type: 'string' },
                  province_specific: { type: 'boolean' },
                },
                required: ['code', 'rationale'],
              },
            },
            confidence: { type: 'number' },
          },
          required: ['chapter_number', 'slo_codes', 'confidence'],
        },
      },
    },
    required: ['chapters'],
  },
};

async function mapSlosForBook(book, provinceConfig, bookToc) {
  if (!bookToc?.toc?.chapters?.length) {
    throw new PipelineError(`No ToC for ${book.id}; run Stage 03 first.`);
  }
  const chapters = bookToc.toc.chapters.map(c => ({
    chapter_number: c.chapter_number,
    title: c.title,
    title_in_script: c.title_in_script,
    page_start: c.page_start,
    page_end: c.page_end,
    learning_outcomes: c.learning_outcomes || '',
  }));

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const modelId = provinceConfig.models?.slo_mapping || 'claude-sonnet-4-5';
  const userMsg = `Book: ${book.id} | Grade ${book.grade} | Subject: ${book.subject}\n\nChapters:\n${JSON.stringify(chapters, null, 2)}\n\nMap each chapter to SLO codes. Use the map_chapter_slos tool.`;

  const resp = await client.messages.create({
    model: modelId,
    max_tokens: 4096,
    system: SLO_SYSTEM_PROMPT,
    tools: [SLO_TOOL],
    tool_choice: { type: 'tool', name: 'map_chapter_slos' },
    messages: [{ role: 'user', content: userMsg }],
  });

  const toolUse = resp.content.find(b => b.type === 'tool_use');
  if (!toolUse) throw new PipelineError(`No tool_use in Sonnet response: ${JSON.stringify(resp).slice(0, 300)}`);
  return {
    mapping: toolUse.input,
    usage: resp.usage,
    model: modelId,
  };
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
    const bookToc = tocRows.find(r => r.textbook_id === book.id);
    console.log(`[${stageName}] ${book.id}`);
    try {
      const out = await mapSlosForBook(book, provinceConfig, bookToc);
      const chCount = out.mapping.chapters.length;
      const totalCodes = out.mapping.chapters.reduce((s, c) => s + c.slo_codes.length, 0);
      await writeRow({
        textbook_id: book.id,
        chapter_slos: out.mapping.chapters,
        total_codes: totalCodes,
        model: out.model,
        usage: out.usage,
      });
      console.log(`  ✓ ${chCount} chapters, ${totalCodes} SLO codes`);
      results.push({ book: book.id, chapters: chCount, codes: totalCodes });
    } catch (err) {
      console.error(`  ✗ ${book.id}: ${err.message}`);
      await writeRow({ textbook_id: book.id, status: 'slo_mapping_failed', error: err.message });
      results.push({ book: book.id, status: 'failed', error: err.message });
    }
  }

  return { status: STATUS.COMPLETE, detail: { results } };
}

module.exports = { stageName, handleJob, mapSlosForBook };
