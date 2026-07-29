#!/usr/bin/env node
/**
 * Import the Video-Quiz Content Library
 *
 * Downloads the openly-hosted Taleemabad content library — 975 student videos
 * (890 visible after duplicate-hiding), 943 video quizzes and 11,831 QA-
 * certified questions — and loads it into this deployment's database:
 *
 *   student_videos   the browsable video library (grade → subject → title)
 *   quizzes          one bank quiz per video (quiz_source='video')
 *   quiz_questions   the question bank, media URLs already resolved to the
 *                    public CDN — no asset pipeline needed at runtime
 *
 * The library is Pakistani national-curriculum content (English + Urdu,
 * Nursery–Grade 6), served from a public Cloudflare R2 bucket. Every media
 * URL in the data (videos, voice notes, picture grids, explanation art)
 * points at that bucket, so a fresh clone needs NO media hosting of its own.
 *
 * Idempotent: rows are upserted on their primary key (videos/quizzes) or on
 * external_id (questions), so re-running only fills gaps and applies updates.
 *
 * Usage:
 *   node bot/scripts/setup/import-video-quiz-library.js --dry     # counts only
 *   node bot/scripts/setup/import-video-quiz-library.js --apply
 *
 * Env:
 *   CONTENT_LIBRARY_BASE  override the library host (default: the public
 *                         Taleemabad bucket). Point this at your own mirror
 *                         if you re-host the assets.
 */

const zlib = require('zlib');

const DEFAULT_BASE = 'https://pub-0edccec5d5bd419782ba389c59faecac.r2.dev';
const BASE = (process.env.CONTENT_LIBRARY_BASE || DEFAULT_BASE).replace(/\/$/, '');
const BATCH = 500;

async function fetchGunzipJsonl(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'rumi-platform-importer' } });
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const text = url.endsWith('.gz') ? zlib.gunzipSync(buf).toString('utf8') : buf.toString('utf8');
  return text.split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

function chunks(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

async function main() {
  const apply = process.argv.includes('--apply');
  if (!apply && !process.argv.includes('--dry')) {
    console.log('Pass --dry (counts only) or --apply (write to the database).');
    process.exit(1);
  }

  console.log(`📚 Content library: ${BASE}/library/`);
  const manifest = await (await fetch(`${BASE}/library/manifest.json`)).json();
  console.log(`   manifest version ${manifest.version}:`, manifest.counts);

  const [videos, quizzes, questions] = await Promise.all([
    fetchGunzipJsonl(`${BASE}/${manifest.files.student_videos}`),
    fetchGunzipJsonl(`${BASE}/${manifest.files.quizzes}`),
    fetchGunzipJsonl(`${BASE}/${manifest.files.quiz_questions}`),
  ]);
  console.log(`   downloaded: ${videos.length} videos, ${quizzes.length} quizzes, ${questions.length} questions`);

  // The export must be internally consistent before anything is written.
  const vidIds = new Set(videos.map((v) => v.id));
  const quizIds = new Set(quizzes.map((q) => q.id));
  const orphanQuizzes = quizzes.filter((q) => !vidIds.has(q.video_id));
  const orphanQuestions = questions.filter((q) => !quizIds.has(q.quiz_id));
  if (orphanQuizzes.length || orphanQuestions.length) {
    throw new Error(`library inconsistent: ${orphanQuizzes.length} quizzes without a video, `
      + `${orphanQuestions.length} questions without a quiz`);
  }
  console.log('   integrity: every quiz has its video, every question its quiz ✓');

  if (!apply) {
    console.log('\n--dry: nothing written. Re-run with --apply to import.');
    return;
  }

  const supabase = require('../../shared/config/supabase');

  // Insert order respects the FK chain; superseded_by is self-referential so
  // videos land in two passes (rows first, then the superseded links).
  console.log('\n⏳ Importing student_videos …');
  for (const batch of chunks(videos.map((v) => ({
    id: v.id, grade: v.grade, subject: v.subject,
    topic: v.clean_chapter || v.clean_title || 'General',
    subtopic: v.clean_title,
    clean_chapter: v.clean_chapter, clean_title: v.clean_title,
    original_filename: v.original_filename, video_url: v.r2_url, r2_url: v.r2_url,
    migration_status: v.migration_status,
  })), BATCH)) {
    const { error } = await supabase.from('student_videos').upsert(batch, { onConflict: 'id' });
    if (error) throw new Error(`student_videos upsert failed: ${error.message}`);
  }
  const links = videos.filter((v) => v.superseded_by);
  for (const v of links) {
    const { error } = await supabase.from('student_videos')
      .update({ superseded_by: v.superseded_by }).eq('id', v.id);
    if (error) throw new Error(`superseded_by link failed for ${v.id}: ${error.message}`);
  }

  console.log('⏳ Importing quizzes …');
  for (const batch of chunks(quizzes.map((q) => ({
    id: q.id, video_id: q.video_id, quiz_source: 'video',
    topic: q.topic, grade: q.grade, subject: q.subject, status: q.status || 'ready',
  })), BATCH)) {
    const { error } = await supabase.from('quizzes').upsert(batch, { onConflict: 'id' });
    if (error) throw new Error(`quizzes upsert failed: ${error.message}`);
  }

  console.log('⏳ Importing quiz_questions …');
  let done = 0;
  for (const batch of chunks(questions.map((q) => ({
    id: q.id, quiz_id: q.quiz_id, question_text: q.question_text,
    option_a: q.option_a, option_b: q.option_b, option_c: q.option_c, option_d: q.option_d,
    correct_option: q.correct_option, explanation: q.explanation,
    media: q.media, option_feedback: q.option_feedback,
    render_pattern: q.render_pattern, external_id: q.external_id,
    difficulty_level: q.difficulty_level, sort_order: q.sort_order,
    distractor_misconceptions: q.distractor_misconceptions,
  })), BATCH)) {
    const { error } = await supabase.from('quiz_questions').upsert(batch, { onConflict: 'id' });
    if (error) throw new Error(`quiz_questions upsert failed: ${error.message}`);
    done += batch.length;
    if (done % 2000 < BATCH) console.log(`   … ${done}/${questions.length}`);
  }

  // Verify by reading back, never by trusting the writer.
  const counts = {};
  for (const [name, q] of [
    ['videos', supabase.from('student_videos').select('id', { count: 'exact', head: true })],
    ['quizzes', supabase.from('quizzes').select('id', { count: 'exact', head: true }).eq('quiz_source', 'video')],
  ]) {
    const { count, error } = await q;
    if (error) throw new Error(`read-back failed: ${error.message}`);
    counts[name] = count;
  }
  console.log('\n✅ Imported. Read-back:', counts);
  console.log('   Set DEFAULT_REGION=pakistan (region gate) and STUDENT_VIDEOS_FLOW_ID');
  console.log('   (via register-all-flows) — then /video serves the library with quizzes.');
}

if (require.main === module) {
  main().catch((err) => { console.error('❌', err.message); process.exit(1); });
}

module.exports = { fetchGunzipJsonl, chunks, DEFAULT_BASE };
