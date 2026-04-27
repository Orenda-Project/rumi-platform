/**
 * 06c_page_fidelity.worker.js — Stage 06.5
 *
 * Page-content fidelity gate. Equivalent of Rawalpindi's bd-844 "0D Page-Content
 * Eval" but automated with Claude Sonnet vision.
 *
 * For each enriched segment:
 *   1. Render the source PDF pages (page_start..page_end) as PNGs
 *   2. Send the page images + the enriched_content to Claude Sonnet 4.6 vision
 *   3. Sonnet checks: do the textbook references, board work, problems,
 *      exit tickets, exercise references in the enriched_content actually
 *      match what's on these pages? Flag hallucinations, missing refs,
 *      fabricated content.
 *
 * Output: { ship: bool, issues: [{field, severity, what_is_wrong, suggested_fix}] }
 *
 * Cost: ~$0.03-0.05/segment (Sonnet vision on 4 pages × ~3K tokens). 36 segs = ~$1.50.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { STATUS, PipelineError } = require('./_base.worker');
const { readRowsForStage } = require('../lib/page_store');
const { callClaude } = require('../models/providers/anthropic_client');

const stageName = '06c_page_fidelity';

const SYSTEM_PROMPT = `You are a textbook-content-fidelity auditor for a Pakistani Grade 1-5 lesson plan pipeline.

You are given:
1. Image(s) of the actual source textbook page(s) for one lesson segment
2. The enriched_content JSON the LLM produced for that segment

Your job: identify any place where the enriched_content makes claims that don't match what's on the page images.

CHECK SPECIFICALLY:
- Textbook page references: does "Open page X" point to a page that actually contains what the LP says it contains?
- Exercise numbers: do "Exercise 3.2" or "Q5" references match what's printed?
- Board-work content: are letters/words/numbers in the enriched boardWork actually on the textbook pages?
- Problems / wordProblem: are these grounded in the textbook content, or fabricated?
- KeyWords: do these words actually appear in the textbook pages (or are they invented)?
- HookStory: should be culturally appropriate, but is it consistent with the textbook's topic?
- ExitTicket: question must be answerable from the textbook content shown.
- Counts in any field: if the field says "5 mangoes" or "3 balloons", do those actually appear on the page?

DO NOT FLAG:
- Pakistani cultural elaborations the teacher will add (Ali, Fatima character names — they're flavor, not textbook claims)
- Pedagogical scaffolding (warm-up, CFU, partner activity instructions) unless they reference textbook content that doesn't exist
- Translations or transliterations (English ↔ Urdu) of content that IS on the page
- Differentiation suggestions (weakLearnerSupport, challengeExtension) — these are teacher additions

Severity:
- CRITICAL: factual hallucination (cites an exercise that doesn't exist, claims content that isn't on the page)
- MAJOR: missing or wrong page reference (says "page 5" when content is on page 7)
- MINOR: inconsistency that won't confuse a teacher (e.g. spelling variation)

Return via emit_fidelity tool.`;

const TOOL = {
  name: 'emit_fidelity',
  description: 'Emit fidelity audit verdict.',
  input_schema: {
    type: 'object',
    properties: {
      issues: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            field: { type: 'string' },
            severity: { type: 'string', enum: ['CRITICAL', 'MAJOR', 'MINOR'] },
            what_is_wrong: { type: 'string' },
            evidence_in_pages: { type: 'string', description: 'Quote what the page actually shows.' },
            suggested_fix: { type: 'string' },
          },
          required: ['field', 'severity', 'what_is_wrong', 'suggested_fix'],
        },
      },
      ship: { type: 'boolean', description: 'true iff zero CRITICAL or MAJOR issues.' },
      summary: { type: 'string', description: '1-2 sentence overall verdict.' },
    },
    required: ['issues', 'ship', 'summary'],
  },
};

function renderPagesToBase64(pdfPath, startPage, endPage) {
  const out = [];
  for (let p = startPage; p <= endPage; p++) {
    const tmpPrefix = path.join(process.env.TMPDIR || '/tmp', `fidelity_${path.basename(pdfPath, '.pdf')}_p${p}_${process.pid}`);
    const r = spawnSync('pdftoppm', ['-png', '-r', '150', '-f', String(p), '-l', String(p), '-singlefile', pdfPath, tmpPrefix]);
    if (r.status !== 0) {
      console.warn(`  pdftoppm failed on p${p}: ${r.stderr?.toString()?.substring(0, 200)}`);
      continue;
    }
    const png = `${tmpPrefix}.png`;
    if (!fs.existsSync(png)) continue;
    out.push({ page: p, base64: fs.readFileSync(png).toString('base64'), path: png });
  }
  return out;
}

function cleanupPages(pages) {
  for (const p of pages) try { fs.unlinkSync(p.path); } catch {}
}

async function auditSegmentFidelity(book, segment, enrichedContent) {
  const pages = renderPagesToBase64(book.path, segment.page_start, Math.min(segment.page_end, segment.page_start + 5));
  if (pages.length === 0) return { issues: [], ship: false, summary: 'no pages rendered', error: 'pdftoppm failed' };

  // Build text+image content. Anthropic SDK style.
  const userText = `Audit this segment's enriched_content against the source textbook pages.

Segment: ${segment.segment_index} | Subject: ${book.subject} | Grade: ${book.grade}
Chapter: ${segment.chapter_title} (Ch ${segment.chapter_number})
Skill type: ${segment.skill_type}
Pages: ${segment.page_start}-${segment.page_end}

ENRICHED_CONTENT JSON:
${JSON.stringify(enrichedContent, null, 2).substring(0, 6000)}

SOURCE PAGES are provided as images below.

Audit thoroughly. Report ALL CRITICAL or MAJOR issues. Be strict on textbook-page-reference accuracy. Use emit_fidelity tool.`;

  // Use callClaude with vision via OpenRouter
  // OpenRouter uses OpenAI-style content array format with image_url parts
  const Anthropic = require('@anthropic-ai/sdk');
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    cleanupPages(pages);
    throw new PipelineError('OPENROUTER_API_KEY missing for vision call');
  }

  const messages = [{
    role: 'user',
    content: [
      { type: 'text', text: userText },
      ...pages.map(p => ({
        type: 'image_url',
        image_url: { url: `data:image/png;base64,${p.base64}` },
      })),
    ],
  }];

  const body = {
    model: 'anthropic/claude-sonnet-4-5',
    messages,
    max_tokens: 4096,
    temperature: 0.1,
    tools: [{
      type: 'function',
      function: { name: TOOL.name, description: TOOL.description, parameters: TOOL.input_schema },
    }],
    tool_choice: { type: 'function', function: { name: TOOL.name } },
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
  cleanupPages(pages);
  const text = await resp.text();
  if (!resp.ok) throw new PipelineError(`OpenRouter Sonnet vision HTTP ${resp.status}: ${text.substring(0, 300)}`);
  const j = JSON.parse(text);
  const toolCall = j.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall) throw new PipelineError('Sonnet vision returned no tool_call');
  const out = JSON.parse(toolCall.function.arguments);
  if (!Array.isArray(out.issues)) out.issues = [];
  return { ...out, model: 'anthropic/claude-sonnet-4-5 (openrouter)', usage: j.usage || {} };
}

async function handleJob(jobId, provinceConfig, opts = {}) {
  const books = opts.bookId
    ? provinceConfig.books.filter(b => b.id === opts.bookId)
    : provinceConfig.books;
  if (!books.length) return { status: STATUS.COMPLETE, detail: { reason: 'no books' } };

  const writeRow = opts.writeRow || ((row) => console.log(JSON.stringify({ stage: stageName, ...row })));
  const segmentLimit = opts.segmentLimit ? parseInt(opts.segmentLimit, 10) : null;
  const onlySegmentIdx = opts.segmentIndex ? parseInt(opts.segmentIndex, 10) : null;

  const enrichRows = await readRowsForStage('06_enrichment');
  const segmentRows = await readRowsForStage('05_chunking');
  const results = [];

  for (const book of books) {
    const latestByIdx = new Map();
    for (const r of enrichRows.filter(x => x.textbook_id === book.id && x.enriched_content)) {
      const prev = latestByIdx.get(r.segment_index);
      if (!prev || new Date(r.timestamp) > new Date(prev.timestamp)) latestByIdx.set(r.segment_index, r);
    }
    let segs = Array.from(latestByIdx.values()).sort((a, b) => a.segment_index - b.segment_index);
    if (onlySegmentIdx) segs = segs.filter(r => r.segment_index === onlySegmentIdx);

    console.log(`[${stageName}] ${book.id}: page-fidelity audit on ${segs.length} segments`);
    let critical = 0, major = 0, ship = 0, fail = 0;
    const limit = segmentLimit || segs.length;

    for (const r of segs.slice(0, limit)) {
      const segMeta = segmentRows.find(s => s.textbook_id === book.id && s.segment_index === r.segment_index);
      if (!segMeta) { console.warn(`  no segment meta for ${r.segment_index}`); continue; }
      try {
        const audit = await auditSegmentFidelity(book, segMeta, r.enriched_content);
        const crit = audit.issues.filter(i => i.severity === 'CRITICAL').length;
        const maj = audit.issues.filter(i => i.severity === 'MAJOR').length;
        critical += crit; major += maj;
        if (audit.ship) ship++; else fail++;
        await writeRow({
          textbook_id: book.id,
          segment_index: r.segment_index,
          ship: audit.ship,
          critical_count: crit,
          major_count: maj,
          minor_count: audit.issues.filter(i => i.severity === 'MINOR').length,
          issues: audit.issues,
          summary: audit.summary,
          model: audit.model,
          usage: audit.usage,
        });
        const status = audit.ship ? '✓' : `↻ C${crit} M${maj}`;
        console.log(`  ${status} seg${r.segment_index}: ${audit.summary?.substring(0, 100)}`);
      } catch (err) {
        fail++;
        console.error(`  ✗ seg${r.segment_index}: ${err.message?.substring(0, 200)}`);
        await writeRow({ textbook_id: book.id, segment_index: r.segment_index, status: 'fidelity_audit_failed', error: err.message });
      }
    }
    results.push({ book: book.id, total: segs.length, ship, fail, critical_total: critical, major_total: major });
    console.log(`  Summary: ${ship} ship, ${fail} need regen, ${critical} CRITICAL issues, ${major} MAJOR`);
  }

  return { status: STATUS.COMPLETE, detail: { results } };
}

module.exports = { stageName, handleJob, auditSegmentFidelity };
