/**
 * 02_ingestion.worker.js
 *
 * Stage 02: OCR every page of a textbook via Gemini 2.5 Flash VLM.
 * Extracts text + describes illustrations + auto-classifies exercise types.
 *
 * Validated end-to-end on Sindh G1 Maths + G2 Urdu pages in prior tests
 * (see planning repo 08_OCR_TEST_RESULTS.md). Replaces Mistral OCR which
 * hallucinated on Nastaliq.
 *
 * Escalation chain:
 *   Gemini 2.5 Flash  →  Qari-v0.2 (self-hosted, Urdu/Sindhi low-confidence)
 *                    →  Gemini 2.5 Pro (residual low-confidence after Qari)
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { GoogleGenerativeAI, SchemaType } = require('@google/generative-ai');

const { PipelineError, STATUS } = require('./_base.worker');

const stageName = '02_ingestion';

const OCR_SYSTEM_PROMPT = `You are extracting content from a textbook page image for an automated lesson-plan pipeline.
Return a structured JSON per the schema.
Critical instructions:
- Extract ALL visible text verbatim (Urdu Nastaliq, Latin, numerals as they appear).
- For each illustration, describe WHAT is shown and COUNT discrete countable objects (pencils, chickens, candles, etc.). Pedagogical role matters: counting objects for Maths, character anchors for narrative, concept illustrations for text-heavy pages.
- Identify exercise types using the canonical taxonomy: count_and_write, read_trace_and_write, jawab_dijiye, alfaaz_ki_jama, fill_in_blank_with_preposition, khushkhat_aur_imla, jumla_saazi, alphabet_train, speech_bubble_dialogue, phonics_blend, rhyme_detection, spelling_dictation, paragraph_composition, creative_writing_prompt, vocab_matching.
- Detect honorific ligatures exactly as rendered (e.g. "صلی اللہ علیہ وآلہ وسلم" with واله, not without). Preserve provincial variations.
- confidence per block: 0.0-1.0 honest self-assessment.
- ocr_confidence_overall: overall confidence across all extracted content.`;

// responseSchema for Gemini — must match pipeline/schemas/ocr_page.json semantically
const RESPONSE_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    printed_numeral_system: { type: SchemaType.STRING, enum: ['urdu_arabic', 'arabic', 'tamil', 'sinhala', 'mixed'] },
    language_detected: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
    script: { type: SchemaType.STRING, enum: ['nastaliq', 'naskh', 'latin', 'tamil', 'sinhala', 'mixed'] },
    text_blocks: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          role: { type: SchemaType.STRING, enum: ['lesson_title', 'slo_box', 'body_paragraph', 'teacher_note_footer', 'exercise_instruction', 'header', 'caption', 'number_label', 'other'] },
          content: { type: SchemaType.STRING },
          confidence: { type: SchemaType.NUMBER },
        },
        required: ['role', 'content', 'confidence'],
      },
    },
    illustrations: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          description: { type: SchemaType.STRING },
          pedagogical_role: { type: SchemaType.STRING, enum: ['counting_object', 'character_anchor', 'concept_illustration', 'decorative', 'teacher_guidance_avatar', 'number_tracing', 'other'] },
          object_count: { type: SchemaType.INTEGER, nullable: true },
        },
        required: ['description', 'pedagogical_role'],
      },
    },
    exercises: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          type: { type: SchemaType.STRING },
          description: { type: SchemaType.STRING },
        },
        required: ['type', 'description'],
      },
    },
    honorifics_detected: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
    ocr_confidence_overall: { type: SchemaType.NUMBER },
  },
  required: ['printed_numeral_system', 'language_detected', 'script', 'text_blocks', 'illustrations', 'exercises', 'ocr_confidence_overall'],
};

/** Render a single PDF page to PNG using pdftoppm with -singlefile (no page suffix). */
function renderPageToPng(pdfPath, pageNum, dpi = 200) {
  const outPrefix = path.join(process.env.TMPDIR || '/tmp', `pipeline_${path.basename(pdfPath, '.pdf')}_p${pageNum}_${process.pid}`);
  const result = spawnSync('pdftoppm', ['-png', '-r', String(dpi), '-f', String(pageNum), '-l', String(pageNum), '-singlefile', pdfPath, outPrefix], { stdio: 'pipe' });
  if (result.status !== 0) {
    throw new PipelineError(`pdftoppm failed for ${pdfPath}:p${pageNum} — ${result.stderr?.toString()}`);
  }
  const outPath = `${outPrefix}.png`;
  if (!fs.existsSync(outPath)) throw new PipelineError(`pdftoppm produced no output at ${outPath}`);
  return outPath;
}

async function ocrPageWithGeminiFlashNative(imgPath) {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA,
      temperature: 0.1,
    },
  });
  const imageData = fs.readFileSync(imgPath);
  const result = await model.generateContent([
    OCR_SYSTEM_PROMPT,
    { inlineData: { mimeType: 'image/png', data: imageData.toString('base64') } },
  ]);
  return {
    json: JSON.parse(result.response.text()),
    usage: result.response.usageMetadata || {},
    model: 'gemini-2.5-flash (native)',
  };
}

/**
 * OpenRouter route — same model, pay-as-you-go (no free-tier daily cap of 20).
 * Uses OpenAI-compatible API at https://openrouter.ai/api/v1.
 */
async function ocrPageWithGeminiFlashOpenRouter(imgPath) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new PipelineError('OPENROUTER_API_KEY missing');
  const imageData = fs.readFileSync(imgPath).toString('base64');

  // OpenRouter requires a JSON schema via response_format for structured output.
  // Simplified schema (OpenRouter passes through to Gemini).
  const orSchema = {
    name: 'ocr_page_output',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        printed_numeral_system: { type: 'string', enum: ['urdu_arabic', 'arabic', 'tamil', 'sinhala', 'mixed'] },
        language_detected: { type: 'array', items: { type: 'string' } },
        script: { type: 'string', enum: ['nastaliq', 'naskh', 'latin', 'tamil', 'sinhala', 'mixed'] },
        text_blocks: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              role: { type: 'string', enum: ['lesson_title', 'slo_box', 'body_paragraph', 'teacher_note_footer', 'exercise_instruction', 'header', 'caption', 'number_label', 'other'] },
              content: { type: 'string' },
              confidence: { type: 'number' },
            },
            required: ['role', 'content', 'confidence'],
          },
        },
        illustrations: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              description: { type: 'string' },
              pedagogical_role: { type: 'string', enum: ['counting_object', 'character_anchor', 'concept_illustration', 'decorative', 'teacher_guidance_avatar', 'number_tracing', 'other'] },
              object_count: { type: ['integer', 'null'] },
            },
            required: ['description', 'pedagogical_role', 'object_count'],
          },
        },
        exercises: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: { type: { type: 'string' }, description: { type: 'string' } },
            required: ['type', 'description'],
          },
        },
        honorifics_detected: { type: 'array', items: { type: 'string' } },
        ocr_confidence_overall: { type: 'number' },
      },
      required: ['printed_numeral_system', 'language_detected', 'script', 'text_blocks', 'illustrations', 'exercises', 'honorifics_detected', 'ocr_confidence_overall'],
    },
  };

  const body = {
    model: 'google/gemini-2.5-flash',
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: OCR_SYSTEM_PROMPT },
          { type: 'image_url', image_url: { url: `data:image/png;base64,${imageData}` } },
        ],
      },
    ],
    response_format: { type: 'json_schema', json_schema: orSchema },
    temperature: 0.1,
  };
  const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://github.com/Orenda-Project/rumi-platform',
      'X-Title': 'rumi-pipeline',
    },
    body: JSON.stringify(body),
  });
  const text = await resp.text();
  if (!resp.ok) throw new PipelineError(`OpenRouter OCR HTTP ${resp.status}: ${text.substring(0, 300)}`);
  const j = JSON.parse(text);
  const content = j.choices?.[0]?.message?.content;
  if (!content) throw new PipelineError(`OpenRouter OCR no content: ${text.substring(0, 300)}`);
  return {
    json: JSON.parse(content),
    usage: j.usage || {},
    model: 'google/gemini-2.5-flash (openrouter)',
  };
}

/**
 * Smart router: prefer OpenRouter (pay-as-you-go, no free-tier caps). Fall back
 * to native Gemini key if OR key is missing. Retry with the OTHER route on 429.
 */
async function ocrPageWithGeminiFlash(imgPath) {
  const prefer = process.env.OPENROUTER_API_KEY ? 'openrouter' : 'native';
  try {
    return prefer === 'openrouter' ? await ocrPageWithGeminiFlashOpenRouter(imgPath) : await ocrPageWithGeminiFlashNative(imgPath);
  } catch (err) {
    if (!/429|quota|rate/i.test(err.message)) throw err;
    // Fall back to the other route on rate limit
    const other = prefer === 'openrouter' ? 'native' : 'openrouter';
    console.warn(`  [ocr] ${prefer} rate-limited, falling back to ${other}`);
    return other === 'openrouter' ? await ocrPageWithGeminiFlashOpenRouter(imgPath) : await ocrPageWithGeminiFlashNative(imgPath);
  }
}

/** Decide whether to escalate based on confidence + script. */
function shouldEscalateToQari(ocr, eval_gates) {
  const suspect = eval_gates?.ingestion?.suspect_confidence ?? 0.80;
  return (ocr.ocr_confidence_overall < suspect) && (['nastaliq', 'naskh'].includes(ocr.script));
}
function shouldEscalateToPro(ocr, eval_gates) {
  const escalate = eval_gates?.ingestion?.escalate_confidence ?? 0.70;
  return ocr.ocr_confidence_overall < escalate;
}

/**
 * Process a single PDF page through the OCR pipeline.
 * Returns structured OCR output + model used.
 */
async function ocrSinglePage(pdfPath, pageNum, provinceConfig) {
  const imgPath = renderPageToPng(pdfPath, pageNum);
  try {
    const flash = await ocrPageWithGeminiFlash(imgPath);
    let ocr = flash.json;
    let modelUsed = 'gemini-2.5-flash';
    let fallbackTrail = [];

    if (shouldEscalateToQari(ocr, provinceConfig.eval_gates)) {
      // Qari-v0.2 fallback — TODO wire self-hosted endpoint. Stub skip for now.
      fallbackTrail.push({ model: 'qari-v0.2', skipped: 'endpoint_not_wired_yet' });
    }
    if (shouldEscalateToPro(ocr, provinceConfig.eval_gates)) {
      // Gemini 2.5 Pro escalation — TODO wire. Stub skip for now.
      fallbackTrail.push({ model: 'gemini-2.5-pro', skipped: 'endpoint_not_wired_yet' });
    }

    return {
      page_number: pageNum,
      ocr,
      model_used: modelUsed,
      fallback_trail: fallbackTrail,
      usage: flash.usage,
    };
  } finally {
    try { fs.unlinkSync(imgPath); } catch {}
  }
}

/**
 * Stage 02 entry point.
 * For each book in provinceConfig.books, OCR every page, write to textbook_pages.
 *
 * @param {string} jobId - unique run id
 * @param {object} provinceConfig - loaded from config/<province>.yaml
 * @param {object} opts
 * @param {string} [opts.bookId] - run on single book only
 * @param {function} [opts.writeRow] - receives ({ textbook_id, page_number, ... }); default console
 */
async function handleJob(jobId, provinceConfig, opts = {}) {
  const books = opts.bookId
    ? provinceConfig.books.filter(b => b.id === opts.bookId)
    : provinceConfig.books;
  if (!books.length) return { status: STATUS.COMPLETE, detail: { reason: 'no books' } };

  const writeRow = opts.writeRow || ((row) => console.log(JSON.stringify({ stage: stageName, ...row })));
  const pageLimit = opts.pageLimit ? parseInt(opts.pageLimit, 10) : null;
  const startPage = opts.startPage ? parseInt(opts.startPage, 10) : 1;
  const resume = opts.resume === true || opts.resume === 'true';   // skip already-OK pages
  const results = [];

  // Load already-succeeded pages if resuming
  let alreadyOk = new Set();
  if (resume) {
    const { readPagesForBook } = require('../lib/page_store');
    const existing = await readPagesForBook(opts.bookId || '');
    for (const p of existing) if (p.ocr_confidence_overall) alreadyOk.add(`${p.textbook_id}:${p.page_number}`);
    console.log(`[${stageName}] resume: ${alreadyOk.size} pages already OK — will skip`);
  }

  for (const book of books) {
    const pdfPath = path.resolve(book.path);
    if (!fs.existsSync(pdfPath)) {
      results.push({ book: book.id, status: 'missing_pdf', path: pdfPath });
      continue;
    }
    const pageCountOut = spawnSync('pdfinfo', [pdfPath], { stdio: 'pipe' });
    const pages = pageCountOut.stdout.toString().match(/Pages:\s+(\d+)/)?.[1];
    if (!pages) { results.push({ book: book.id, status: 'pdfinfo_failed' }); continue; }
    const total = parseInt(pages, 10);
    const lastPage = pageLimit ? Math.min(startPage + pageLimit - 1, total) : total;
    console.log(`[${stageName}] ${book.id}: processing pages ${startPage}-${lastPage} of ${total}`);
    for (let p = startPage; p <= lastPage; p++) {
      if (resume && alreadyOk.has(`${book.id}:${p}`)) continue;
      try {
        const out = await ocrSinglePage(pdfPath, p, provinceConfig);
        await writeRow({
          textbook_id: book.id,
          page_number: out.page_number,
          textbook_page_number: out.ocr.text_blocks?.find(b => /^\d+$|^[۰-۹]+$/.test(b.content?.trim?.()))?.content,
          printed_numeral_system: out.ocr.printed_numeral_system,
          language_detected: out.ocr.language_detected,
          script: out.ocr.script,
          text_blocks: out.ocr.text_blocks,
          illustrations: out.ocr.illustrations,
          exercises: out.ocr.exercises,
          honorifics_detected: out.ocr.honorifics_detected,
          ocr_confidence_overall: out.ocr.ocr_confidence_overall,
          ocr_model: out.model_used,
          fallback_trail: out.fallback_trail,
          usage: out.usage,
        });
      } catch (err) {
        await writeRow({
          textbook_id: book.id,
          page_number: p,
          status: 'ocr_failed',
          error: err.message,
        });
      }
    }
    results.push({ book: book.id, status: 'complete', pages_processed: lastPage - startPage + 1, total_pages: total });
  }

  return { status: STATUS.COMPLETE, detail: { results } };
}

module.exports = { stageName, handleJob, ocrSinglePage, ocrPageWithGeminiFlash, RESPONSE_SCHEMA, OCR_SYSTEM_PROMPT };
