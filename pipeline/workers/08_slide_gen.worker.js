/**
 * 08_slide_gen.worker.js
 *
 * Stage 08: Generate 6 slides per enriched lp_segment via Kie.AI Nano Banana Pro,
 * using Rawalpindi v7 prompt templates VERBATIM (ported from
 * generate-lps-v3.backup.js). Sindh MVP adds an Urdu-primary language overlay
 * for non-Urdu subjects per Q4 decision.
 *
 * 6 slide templates (Rawalpindi v7):
 *   1. navigation         — Day X of N + journey + today + coming up + TO PREPARE
 *   2. hook_boardwork     — warm-up + rotating-type hook + today's goal + key words + board
 *   3. how_it_works       — IKEA 3-step procedure + teacher says + key fact + worked ex + CFU
 *   4. guided_practice    — teacher model + partner A/B + circulate + CFU
 *   5. independent_practice — problems + word problem + weak-learner/challenge differentiation
 *   6. before_you_go      — key facts + exit ticket (4 choices) + homework + tomorrow + coaching CTA
 *
 * Decision locked 2026-04-18 (Q2): NBPro only. Cheap alternatives fail Urdu.
 * NBPro pricing verified $0.09/2K (not $1.50 as v1 research claimed).
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const { STATUS, PipelineError } = require('./_base.worker');
const { readRowsForStage } = require('../lib/page_store');
const { V7_TEMPLATES } = require('../prompts/rawalpindi_v7/slide_prompts');

const stageName = '08_slide_gen';
const SLIDES_OUT_ROOT = path.resolve(__dirname, '..', 'runs', 'slides');

function selectTemplatesForSegment(segment) {
  // Core 6 — same order as Rawalpindi v7.
  return ['navigation', 'hook_boardwork', 'how_it_works', 'guided_practice', 'independent_practice', 'before_you_go'];
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

async function generateSlideWithNBPro(prompt, attempt = 0) {
  let create;
  try {
    create = await httpPost('https://api.kie.ai/api/v1/jobs/createTask', {
      model: 'nano-banana-pro',
      input: { prompt, aspect_ratio: '3:4', resolution: '2K', output_format: 'png' },
    });
  } catch (err) {
    if (attempt < 3 && /ENOTFOUND|ECONNRESET|ETIMEDOUT|ENETUNREACH|socket hang up/.test(err.message)) {
      console.warn(`  [nbpro] transient error "${err.message}", retry ${attempt + 1}/3 in ${(attempt + 1) * 10}s`);
      await new Promise(r => setTimeout(r, (attempt + 1) * 10000));
      return generateSlideWithNBPro(prompt, attempt + 1);
    }
    throw err;
  }
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

/**
 * Compute chapter navigation context exactly like Rawalpindi v3.
 * Input: current segment + all segments in the same chapter.
 */
function computeChapterNavigation(segment, chapterSegments) {
  const sorted = [...chapterSegments].sort((a, b) => a.segment_index - b.segment_index);
  const totalDays = sorted.length;
  const currentIdx = sorted.findIndex(s => s.segment_index === segment.segment_index);
  const dayNum = currentIdx + 1;
  const journeySoFar = sorted.slice(0, currentIdx).map((s, i) => {
    const pages = s.page_start === s.page_end ? `p.${s.page_start}` : `pp.${s.page_start}-${s.page_end}`;
    return { dayNum: i + 1, topic: s.topic || s.chapter_title, pages, skillType: s.skill_type };
  });
  const comingUp = sorted.slice(currentIdx + 1, currentIdx + 4).map((s, i) => {
    const pages = s.page_start === s.page_end ? `p.${s.page_start}` : `pp.${s.page_start}-${s.page_end}`;
    return { dayNum: currentIdx + 2 + i, topic: s.topic || s.chapter_title, pages, skillType: s.skill_type };
  });
  return { dayNum, totalDays, journeySoFar, comingUp, allSegments: sorted };
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
    const bookEnriched = enrichRows.filter(r => r.textbook_id === book.id && r.enriched_content);
    console.log(`[${stageName}] ${book.id}: ${bookEnriched.length} enriched segments`);
    const limit = segmentLimit || bookEnriched.length;
    let slideCount = 0;

    // Dedupe enriched rows (keep latest per segment_index)
    const latestBySeg = new Map();
    for (const r of bookEnriched) {
      const prev = latestBySeg.get(r.segment_index);
      if (!prev || new Date(r.timestamp) > new Date(prev.timestamp)) latestBySeg.set(r.segment_index, r);
    }
    let filtered = Array.from(latestBySeg.values()).sort((a, b) => a.segment_index - b.segment_index);
    if (onlySegmentIdx) filtered = filtered.filter(r => r.segment_index === onlySegmentIdx);

    // Group by chapter for correct "Day X of N" counting
    const byChapter = new Map();
    for (const s of segmentRows.filter(r => r.textbook_id === book.id && r.segment_index != null)) {
      const ch = s.chapter_number ?? 0;
      if (!byChapter.has(ch)) byChapter.set(ch, []);
      byChapter.get(ch).push(s);
    }

    // Load SLO mapping for this book (optional per segment)
    const sloRows = await readRowsForStage('04_slo_mapping');
    const bookSloMapping = sloRows.find(r => r.textbook_id === book.id);

    for (const row of filtered.slice(0, limit)) {
      const rawSeg = segmentRows.find(s => s.textbook_id === book.id && s.segment_index === row.segment_index);
      if (!rawSeg) { console.warn(`  no segment row for seg${row.segment_index}`); continue; }

      const chapterSlos = (bookSloMapping?.chapter_slos || []).find(c => c.chapter_number === rawSeg.chapter_number);
      const sloDescriptions = (chapterSlos?.slo_codes || []).map(s => s.rationale).filter(Boolean);

      // Enrich segment with book-level + enrichment-level fields the v7 prompts expect
      const seg = {
        ...rawSeg,
        subject: book.subject,
        grade: book.grade,
        topic: row.enriched_content?.topic || rawSeg.topic || `${rawSeg.chapter_title} — Day ${row.segment_index}`,
        slo_descriptions: sloDescriptions,
        blooms_target: row.enriched_content?.blooms_target || null,
      };

      const chapterSegments = (byChapter.get(rawSeg.chapter_number ?? 0) || [rawSeg]).map(s => ({
        ...s,
        subject: book.subject,
        grade: book.grade,
        topic: s.topic || `${s.chapter_title} — Day ${s.segment_index}`,
      }));
      const nav = computeChapterNavigation(seg, chapterSegments);
      const templates = selectTemplatesForSegment(seg);

      const outDir = path.join(SLIDES_OUT_ROOT, book.id, `seg${String(row.segment_index).padStart(3, '0')}`);
      fs.mkdirSync(outDir, { recursive: true });

      for (const tmplName of templates) {
        const slideOutPath = path.join(outDir, `${tmplName}.png`);
        if (fs.existsSync(slideOutPath) && fs.statSync(slideOutPath).size > 10000) {
          console.log(`  ⏭  ${book.id}/seg${row.segment_index}/${tmplName} exists`);
          continue;
        }
        try {
          const builder = V7_TEMPLATES[tmplName];
          if (!builder) throw new PipelineError(`Unknown template ${tmplName}`);
          const prompt = builder(seg, row.enriched_content, nav, provinceConfig);
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
          console.error(`  ✗ ${book.id}/seg${row.segment_index}/${tmplName}: ${(err.message || '').substring(0, 250)}`);
          await writeRow({
            textbook_id: book.id,
            segment_index: row.segment_index,
            slide_template: tmplName,
            status: 'nbpro_failed',
            error: err.message || '(unknown)',
          });
        }
      }
    }
    results.push({ book: book.id, slides_generated: slideCount, segments: bookEnriched.length });
  }

  return { status: STATUS.COMPLETE, detail: { results } };
}

module.exports = { stageName, handleJob, V7_TEMPLATES, selectTemplatesForSegment, computeChapterNavigation };
