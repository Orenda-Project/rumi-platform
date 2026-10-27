/**
 * Exam Checker Dry Run
 *
 * Reads one exam page and grades it with the exam-vision engine — the same two
 * calls the exam-grading worker makes — and prints what each call returned.
 * Nothing is stored and nothing is sent to WhatsApp.
 *
 * Needs the LLM key in .env (OPENROUTER_API_KEY, or OPENAI_API_KEY with
 * LLM_PROVIDER=openai). Every run costs one or two vision calls.
 *
 * Usage (from bot/):
 *   node scripts/exam-checker-dry-run.js <image file or https URL> [scheme.json]
 *
 * scheme.json is a marking scheme: { "questions": [{ "id": "Q1", "text": "...", "answer": "...", "marks": 2 }] }.
 * Without it, the grader works out each correct answer itself.
 */

const fs = require('fs');
const path = require('path');
// The repo keeps one .env at its root, as bot/whatsapp-bot.js reads it.
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const examVision = require('../shared/services/exam-checker/exam-vision.service');
const { resolveModelForJob } = require('../shared/config/model-registry');

function imageFor(arg) {
  if (/^https?:\/\//.test(arg)) return arg;
  const file = path.resolve(arg);
  const mime = /\.png$/i.test(file) ? 'image/png' : 'image/jpeg';
  return examVision.toDataUrl(fs.readFileSync(file), mime);
}

async function main() {
  const [imageArg, schemeArg] = process.argv.slice(2);
  if (!imageArg) {
    console.error('Usage: node scripts/exam-checker-dry-run.js <image file or https URL> [scheme.json]');
    process.exit(1);
  }
  const scheme = schemeArg ? JSON.parse(fs.readFileSync(path.resolve(schemeArg), 'utf8')) : {};

  console.log('\n🔬 EXAM CHECKER DRY RUN');
  for (const job of Object.values(examVision.JOBS)) {
    console.log(`   ${job.padEnd(14)} ${resolveModelForJob(job).model}`);
  }

  console.log('\n📷 Call A — reading the page (marking scheme withheld)…');
  const page = await examVision.readPageWithEscalation(imageFor(imageArg));
  console.log(`   model: ${page._model}`);
  console.log(`   student: ${page.page_meta.student_name || '?'} · grade ${page.page_meta.grade || '?'} · ${page.page_meta.subject || '?'}`);
  for (const it of page.items) {
    console.log(`   ${it.question_id}: "${it.answer_text_verbatim}"  [${it.script}, confidence ${it.confidence}, box ${JSON.stringify(it.box_2d)}]`);
  }

  console.log('\n📊 Call B — grading the copied answers…');
  const graded = await examVision.gradeAnswers(page.items, scheme, page.page_meta);
  let awarded = 0;
  let max = 0;
  for (const g of graded.items) {
    awarded += g.verdict === 'cannot_grade' ? 0 : (g.awarded_marks || 0);
    max += g.verdict === 'cannot_grade' ? 0 : (g.max_marks || 0);
    console.log(`   ${g.question_id}: ${g.verdict} ${g.awarded_marks}/${g.max_marks} (expected: ${g.expected_answer ?? '—'})`);
    if (g.feedback_forward) console.log(`      next step: ${g.feedback_forward}`);
  }
  // The worker sums the per-question marks itself; the model's own totals are not trusted.
  console.log(`\n   Total: ${awarded}/${max}  (the model's own total said ${graded.total_awarded}/${graded.total_max})\n`);
}

main().catch((err) => {
  console.error('❌ Dry run failed:', err.message);
  process.exit(1);
});
