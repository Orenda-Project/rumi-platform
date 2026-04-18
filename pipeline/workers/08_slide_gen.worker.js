/**
 * 08_slide_gen.worker.js
 *
 * Stage 08: Generate 6-10 slides per enriched lp_segment via Kie.AI Nano Banana Pro.
 *
 * Decision locked 2026-04-18 (Q2 resolved): NBPro only, no hybrid routing.
 * Cheap alternatives (Gemini 2.5 Flash Image, Seedream 4, FLUX.2 Pro) all
 * hallucinate Urdu Nastaliq. Stability beats marginal savings.
 *
 * Templates — 6 core slides + up to 4 optional:
 *   1. navigation — Day X of N, journey so far, today, coming up, to prepare
 *   2. hook       — warm-up + hook story with cultural anchor
 *   3. i_do       — board work + worked example
 *   4. we_do      — partner activity (speech bubbles)
 *   5. you_do     — independent practice + model answers
 *   6. close      — CFU + coaching reflection + next topic teaser
 *  (7. extension  — above-level differentiation)
 *  (8. homework   — if homework is set)
 *
 * Output: PNG per slide, uploaded... TODO: for Day 2 we save locally to
 * pipeline/runs/slides/<book>/<segment>/slide<N>.png. R2 upload comes with Stage 12.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const { STATUS, PipelineError } = require('./_base.worker');
const { readRowsForStage } = require('../lib/page_store');

const stageName = '08_slide_gen';
const SLIDES_OUT_ROOT = path.resolve(__dirname, '..', 'runs', 'slides');

// ── Slide template registry ─────────────────────────────────────────────────
// Each template is (enrichedContent, segment, context) → (prompt string).

const baseStyleNotes = `
Portrait educational poster, 3:4 aspect. Clean white background, rounded-corner sections, flat modern illustration style.
Urdu Nastaliq text must use correct ligatures (Noto Nastaliq Urdu look). Never render gibberish.
Pakistani cultural context: shalwar-kameez / dupatta characters; chalkboard/textbook in scenes.
NEVER include: percentage markers, prompt echoes, "Pakistani Grade N giden", placeholder text.`;

function navSlide(ec, seg, ctx) {
  const dayOf = `Day ${ctx.dayNum} of ${ctx.totalDays}`;
  const dots = Array.from({ length: ctx.totalDays }, (_, i) => {
    if (i + 1 < ctx.dayNum) return 'green_check';
    if (i + 1 === ctx.dayNum) return 'gold_star';
    return 'empty';
  });
  return `${baseStyleNotes}

TOP HEADER (dark navy #1a2332, 18% height): Left large yellow-orange "${dayOf}". Right small white: "Grade ${ctx.grade} ${ctx.subjectLabel} — ${ec.topic_english}". Far-right teal pill "${ec.duration_minutes} min".
Below header: ${ctx.totalDays} progress dots — ${dots.join(', ')}. Gold star labeled "${ctx.dayNum}★".

BODY (stacked sections, 6px gap):
1. Light-green "JOURNEY SO FAR": "${ctx.journeySoFar || 'Day 1 starts today'}"
2. Yellow-orange (#f59e0b) "TODAY: ${ec.topic_english}" with pill "${seg.skill_type}${seg.cpa_phase ? ' · ' + seg.cpa_phase : ''}"
3. Light-grey "COMING UP": "${ctx.comingUp || 'Segment finale'}"
4. Teal "BY END OF TODAY: ${ec.topic_urdu}"
5. Cream "TO PREPARE:" with checkboxes: ${(ec.materials_needed || []).slice(0, 4).map(m => `☐ ${m}`).join(' · ')}
`;
}

function hookSlide(ec, seg, ctx) {
  return `${baseStyleNotes}

Title: "آج کا ہکایه" (Today's story) / "Today's Hook"
Illustrated scene with cultural anchor (a Pakistani classroom / market / village depending on story).
Body: "${ec.hook_story}"
Warm-up prompt: "${ec.warm_up}"
Teacher dialogue bubble in Urdu Nastaliq. No placeholder text.`;
}

function iDoSlide(ec, seg, ctx) {
  return `${baseStyleNotes}

Header: "میں کروں گی — Worked Example"
Cartoon of female Pakistani teacher with dupatta, pointing to a chalkboard.
Board content: "${ec.board_work}"
Steps (numbered 1-${ec.i_do_steps.length}):
${ec.i_do_steps.map((s, i) => `Step ${i + 1}: ${s}`).join('\n')}
Worked example: "${ec.worked_example}"
`;
}

function weDoSlide(ec, seg, ctx) {
  return `${baseStyleNotes}

Header: "ہم مل کر کریں گے — With Your Partner"
Two Pakistani children side-by-side (boy + girl, or two of each), speech bubbles facing each other.
Partner A speech bubble & Partner B speech bubble derived from: "${ec.we_do_partner_activity}"
Tip banner: "${ec.cfu_checks[0] || 'Check understanding'}"
`;
}

function youDoSlide(ec, seg, ctx) {
  const qas = (ec.model_answers || []).slice(0, 4);
  return `${baseStyleNotes}

Header: "اب آپ کریں — Independent Practice"
Instructions: "${ec.you_do_independent_practice}"
Exercise references: ${(ec.textbook_exercise_refs || []).join(', ') || '—'}
Model answers table:
${qas.map((qa, i) => `  ${i + 1}. Q: ${qa.question} → A: ${qa.answer}`).join('\n')}
Differentiation notes (small print): below-level: ${ec.differentiation?.below_level || '—'} | above-level: ${ec.differentiation?.above_level || '—'}
`;
}

function closeSlide(ec, seg, ctx) {
  return `${baseStyleNotes}

Header: "اختتام — Closing"
Recap: "${ec.closing}"
CFU checks list:
${(ec.cfu_checks || []).map(c => `• ${c}`).join('\n')}
Key facts (amber callouts):
${(ec.key_facts || []).map(k => `⭐ ${k}`).join('\n')}
Coaching reflection for teacher: "${ec.coaching_reflection_prompt}"
Next topic teaser: "${ec.next_topic_teaser}"
${ec.homework ? 'Homework: ' + ec.homework : ''}
`;
}

const TEMPLATES = {
  navigation: navSlide,
  hook: hookSlide,
  i_do: iDoSlide,
  we_do: weDoSlide,
  you_do: youDoSlide,
  close: closeSlide,
};

function selectTemplatesForSegment(segment) {
  // Core 6 always. Could add extension/homework per segment later.
  return ['navigation', 'hook', 'i_do', 'we_do', 'you_do', 'close'];
}

// ── Kie.AI client ───────────────────────────────────────────────────────────
function httpPost(url, body) {
  return new Promise((resolve, reject) => {
    const b = JSON.stringify(body);
    const req = https.request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(b), 'Authorization': `Bearer ${process.env.KIE_API_KEY}` },
    }, (res) => { let d = ''; res.on('data', c => d += c); res.on('end', () => { try { resolve({ status: res.statusCode, data: JSON.parse(d) }); } catch { resolve({ status: res.statusCode, data: d }); } }); });
    req.on('error', reject); req.write(b); req.end();
  });
}
function httpGet(url) {
  return new Promise((resolve, reject) => {
    https.request(url, { method: 'GET', headers: { 'Authorization': `Bearer ${process.env.KIE_API_KEY}` } }, (res) => { let d = ''; res.on('data', c => d += c); res.on('end', () => { try { resolve({ status: res.statusCode, data: JSON.parse(d) }); } catch { resolve({ status: res.statusCode, data: d }); } }); }).on('error', reject).end();
  });
}
function downloadImage(url, filePath) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) return downloadImage(res.headers.location, filePath).then(resolve).catch(reject);
      if (res.statusCode !== 200) return reject(new Error(`download HTTP ${res.statusCode}`));
      const ws = fs.createWriteStream(filePath); res.pipe(ws); ws.on('finish', () => ws.close(resolve)); ws.on('error', reject);
    }); req.on('error', reject);
  });
}

async function generateSlideWithNBPro(prompt) {
  const create = await httpPost('https://api.kie.ai/api/v1/jobs/createTask', {
    model: 'nano-banana-pro',
    input: { prompt, aspect_ratio: '3:4', resolution: '2K', output_format: 'png' },
  });
  const taskId = create.data?.data?.taskId || create.data?.taskId;
  if (!taskId) throw new PipelineError(`NBPro no taskId: ${JSON.stringify(create.data).slice(0, 300)}`);
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 6000));
    const poll = await httpGet(`https://api.kie.ai/api/v1/jobs/recordInfo?taskId=${taskId}`);
    const rec = poll.data?.data || poll.data;
    const status = rec?.status || rec?.state;
    if (status === 'completed' || status === 'success' || status === 'done') {
      let parsed = rec;
      if (rec.resultJson) try { parsed = typeof rec.resultJson === 'string' ? JSON.parse(rec.resultJson) : rec.resultJson; } catch {}
      const url = parsed?.resultUrls?.[0] || parsed?.images?.[0]?.url || parsed?.url;
      if (!url) throw new PipelineError(`NBPro no url`);
      return url;
    }
    if (status === 'failed' || status === 'error') throw new PipelineError(`NBPro failed: ${JSON.stringify(rec).slice(0, 200)}`);
  }
  throw new PipelineError('NBPro timeout');
}

async function handleJob(jobId, provinceConfig, opts = {}) {
  const books = opts.bookId
    ? provinceConfig.books.filter(b => b.id === opts.bookId)
    : provinceConfig.books;
  if (!books.length) return { status: STATUS.COMPLETE, detail: { reason: 'no books' } };

  const writeRow = opts.writeRow || ((row) => console.log(JSON.stringify({ stage: stageName, ...row })));
  const segmentLimit = opts.segmentLimit ? parseInt(opts.segmentLimit, 10) : null;

  const enrichRows = await readRowsForStage('06_enrichment');
  const segmentRows = await readRowsForStage('05_chunking');
  const results = [];

  for (const book of books) {
    const bookEnriched = enrichRows.filter(r => r.textbook_id === book.id && r.enriched_content);
    console.log(`[${stageName}] ${book.id}: ${bookEnriched.length} enriched segments`);
    const limit = segmentLimit || bookEnriched.length;
    let slideCount = 0;

    for (const row of bookEnriched.slice(0, limit)) {
      const seg = segmentRows.find(s => s.textbook_id === book.id && s.segment_index === row.segment_index);
      if (!seg) continue;

      const templates = selectTemplatesForSegment(seg);
      const ctx = {
        dayNum: row.segment_index,
        totalDays: bookEnriched.length,
        grade: book.grade,
        subjectLabel: book.subject === 'maths' ? 'Maths' : book.subject === 'english' ? 'English' : 'Urdu',
        journeySoFar: null,
        comingUp: null,
      };
      const outDir = path.join(SLIDES_OUT_ROOT, book.id, `seg${String(row.segment_index).padStart(3, '0')}`);
      fs.mkdirSync(outDir, { recursive: true });

      for (const tmplName of templates) {
        const builder = TEMPLATES[tmplName];
        const prompt = builder(row.enriched_content, seg, ctx);
        const slideOutPath = path.join(outDir, `${tmplName}.png`);
        if (fs.existsSync(slideOutPath) && fs.statSync(slideOutPath).size > 10000) {
          console.log(`  ⏭  ${book.id}/seg${row.segment_index}/${tmplName} exists`);
          continue;
        }
        try {
          const url = await generateSlideWithNBPro(prompt);
          await downloadImage(url, slideOutPath);
          slideCount++;
          await writeRow({
            textbook_id: book.id,
            segment_index: row.segment_index,
            slide_template: tmplName,
            slide_path: slideOutPath,
            bytes: fs.statSync(slideOutPath).size,
          });
          console.log(`  ✓ ${book.id}/seg${row.segment_index}/${tmplName}`);
        } catch (err) {
          console.error(`  ✗ ${book.id}/seg${row.segment_index}/${tmplName}: ${err.message}`);
          await writeRow({
            textbook_id: book.id,
            segment_index: row.segment_index,
            slide_template: tmplName,
            status: 'nbpro_failed',
            error: err.message,
          });
        }
      }
    }
    results.push({ book: book.id, slides_generated: slideCount, segments: bookEnriched.length });
  }

  return { status: STATUS.COMPLETE, detail: { results } };
}

module.exports = { stageName, handleJob, TEMPLATES, selectTemplatesForSegment };
