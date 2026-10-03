'use strict';
/**
 * Lesson quiz — GENERATE and HAND OFF (the worker step after "yes").
 *
 *   resolve the source (a transcript, a lesson plan, or a topic) → digest
 *   → author → validate (one retry, with the validator's complaints)
 *   → [plan quizzes only: key check against the plan — runKeyCheck]
 *   → blind solve of every key, every source (runKeyVerify) → store
 *   quiz_questions → teacher PDF → R2 → share code → three paced messages
 *
 * Idempotent per step, because the quiz queue is Standard SQS (at-least-once):
 * a quiz already `sent` does nothing; a quiz stuck at `ready` (questions
 * stored, hand-off failed) resumes at the hand-off. The share-code chain from
 * the video quizzes takes over from here unchanged — children join through
 * the same link, the same report fires the next school morning.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const supabase = require('../../config/supabase');
const WhatsAppService = require('../whatsapp.service');
const { logToFile } = require('../../utils/logger');
const { logEvent } = require('../../utils/structured-logger');
const { resolveUx } = require('../../config/ux-strings');
const Digest = require('./transcript-quiz-digest.service');
const Author = require('./transcript-quiz-author.service');
const {
  validate, MIN_QUESTIONS, figureDensity, latinNames, nameLexicon,
} = require('./transcript-quiz-validator');
const { peopleSpellings, spellText, logRedactor } = require('./transcript-quiz-people');
const { duplicateQuestionErrors, confirmsSameFact, solverDuplicateComplaint } = require('./transcript-quiz-duplicates');
const {
  teacherLanguageFor, quizLanguageFor, formatLessonDate, topicFor, lessonLabel, canonicalSubject,
} = require('./transcript-quiz-language');
const { SESSION_SELECT, MIN_TRANSCRIPT_CHARS, staleMs, paused } = require('./transcript-quiz-offer.service');
const {
  TRANSCRIPT, TOPIC, isPlanQuiz, lessonSessionFor, failureCopyKey, digestFailureReason,
} = require('./quiz-sources');
const PlanDigest = require('./plan-quiz-digest.service');
const LessonPlanText = require('../coaching/fidelity/lesson-plan-text');
const { summaryTruthEnabled } = require('./transcript-quiz-contract');
const Funnel = require('./quiz-funnel');
const DailyCap = require('./quiz-daily-cap');
const DailyCaps = require('../limits/daily-caps');

/**
 * The quiz cap for an account that has not finished registration, or null
 * (registered, unset, or unreadable — the deployment-wide QUIZ_DAILY_CAP still
 * applies). Read only when the operator set one.
 */
async function unregisteredQuizCap(teacherId) {
  const tierCap = DailyCaps.capFor('quiz', 'unregistered');
  if (tierCap === null || !teacherId) return null;
  const { data, error } = await supabase.from('users').select('id, registration_completed').eq('id', teacherId).maybeSingle();
  if (error || !data) return null;
  return DailyCaps.tierOf(data) === 'unregistered' ? tierCap : null;
}

/** The teacher of a plan or topic quiz — the same fields SESSION_SELECT joins for a transcript quiz. */
const LP_USER_SELECT = 'name, id, phone_number, preferred_language, grades_taught, subjects_taught';
/** The lesson plan a plan quiz is written from (OSS `lesson_plans`). */
const PLAN_SELECT = 'id, topic, grade, subject, content, pdf_url';
/** The plan a quiz names: `quizzes.lesson_plan_id`, else the first lesson in `meta.lessons`. */
function lessonPlanIdOf(quiz) {
  const lesson = ((quiz && quiz.meta && quiz.meta.lessons) || [])[0] || {};
  return (quiz && quiz.lesson_plan_id) || lesson.lesson_plan_id || null;
}

/**
 * WHAT A QUIZ WITH NO RECORDING IS WRITTEN FROM, or null when there is nothing.
 *
 *   topic         { kind: 'topic', from: 'topic', text: null, title }  — the
 *                 quiz's own topic, grade and subject; nothing is read.
 *   lp_generated  { kind: 'plan', from, text, title, lessonPlanId }  — the
 *                 plan's text: `content.plan_text` (from 'plan_text'), else the
 *                 stored content itself (from 'content'), else the text of its
 *                 PDF (from 'pdf'). A plan with none of them is written from
 *                 its topic (from 'topic', text null): still a plan quiz to the
 *                 teacher ("What you planned"), but the digest writes the
 *                 objectives instead of reading them.
 *
 * `grade` and `subject` ride along from the plan for a row that has none. A
 * plan row that is gone, or a quiz that names none, is nothing to write from.
 *
 * A database ERROR is not "no plan". It throws from here, the row stays
 * `generating`, and the queue redelivers the job (at-least-once) instead of the
 * teacher being told, permanently, that the plan could not be opened.
 */
async function resolveLessonSource(quiz) {
  if (quiz.quiz_source === TOPIC) {
    const title = String(quiz.topic || '').trim();
    return title ? {
      kind: 'topic', from: 'topic', text: null, title, grade: quiz.grade || null, subject: quiz.subject || null,
    } : null;
  }
  const planId = lessonPlanIdOf(quiz);
  if (!planId) return null;
  const { data: plan, error } = await supabase.from('lesson_plans').select(PLAN_SELECT).eq('id', planId).maybeSingle();
  if (error) {
    logToFile('❌ plan quiz: lesson plan read failed — leaving the job to be redelivered', {
      quizId: quiz.id, lessonPlanId: planId, error: error.message,
    }, 'error');
    throw new Error(`plan quiz: lesson plan read failed: ${error.message}`);
  }
  if (!plan) return null;
  const base = {
    kind: 'plan',
    title: String(plan.topic || quiz.topic || '').trim(),
    grade: plan.grade || null,
    subject: plan.subject || null,
    lessonPlanId: plan.id,
  };
  // The one reader of a stored plan's text, shared with lesson-plan fidelity:
  // content.plan_text, else the content flattened (with the plan's topic,
  // grade and subject on top).
  const stored = LessonPlanText.planTextFromRow(plan);
  if (stored) {
    const from = plan.content && typeof plan.content === 'object' && plan.content.plan_text ? 'plan_text' : 'content';
    return { ...base, from, text: stored };
  }
  if (plan.pdf_url) {
    // The plan's delivered PDF, read by the same shared helper (it never
    // throws). Best effort: an unreachable or unreadable PDF is not a failure —
    // the quiz is written from the plan's topic instead.
    const linked = await LessonPlanText.renderLinkedPlanText(plan.id, { db: supabase });
    const text = String((linked && linked.text) || '').trim();
    if (text) return { ...base, from: 'pdf', text };
    logToFile('⚠️ plan quiz: the plan PDF could not be read — writing from its topic', {
      quizId: quiz.id, lessonPlanId: planId,
    });
  }
  // The row is there but holds no lesson and no topic: that plan is UNUSABLE
  // (the teacher is told it had too little in it), not missing.
  return base.title ? { ...base, from: 'topic', text: null } : { ...base, from: 'content', text: '' };
}

const N_QUESTIONS = 8;
/**
 * Full authoring attempts per quiz. Three, not two, because with two, teachers
 * lost their quiz when attempt 1
 * was spent on something that is not a fault of the questions (the quiz
 * language, or a drawable lesson with no picture) and attempt 2 — the last —
 * met a complaint nothing could repair. One more attempt costs about $0.011
 * and ten seconds; a teacher who said yes and got "I couldn't make a good quiz"
 * costs the feature. TRANSCRIPT_QUIZ_MAX_ATTEMPTS overrides (read per call).
 */
const MAX_ATTEMPTS = 3;
/** Targeted-rewrite calls per repair: the worst five, then ONE more batch for what they left. */
const REPAIR_BATCHES = 2;
function maxAttempts() {
  // `process` is this module's exported job function, so the Node global is
  // reached through globalThis.
  const n = parseInt(String(globalThis.process.env.TRANSCRIPT_QUIZ_MAX_ATTEMPTS || '').trim(), 10);
  return Number.isInteger(n) && n >= 1 ? n : MAX_ATTEMPTS;
}

/** Subjects where a lesson can nearly always be drawn with the allowed types. */
const DRAWABLE_SUBJECTS = new Set(['maths', 'science', 'genk']);

/**
 * A grade 1-5 lesson is drawable in EVERY subject. Until the early-years
 * types were added the drawable roster was the 6-12 one, so a language lesson genuinely had
 * nothing to draw with and this gate correctly let it pass without a picture.
 * The early-years types changed that: `word_blank` and `match` are language
 * types before they are anything else, and across a K-5 lesson segmentation
 * nearly all the segments they serve are English or Urdu periods (the
 * option-space study).
 */
function isEarlyYearsBand(gradeBand) {
  const g = String(gradeBand || '').toLowerCase();
  if (/\b(kg|k|prep|nursery|ecce|katchi)\b/.test(g)) return true;
  const nums = (g.match(/\d+/g) || []).map(Number);
  return nums.length > 0 && nums.every((n) => n <= 5);
}

/**
 * "Write at least ONE picture question" was advisory: an early real science
 * lesson (Structure of an Atom — the class was asked to draw atoms)
 * came back as eight text questions and nothing sent it back. A drawable
 * lesson with zero figures now fails every attempt but the last, with the
 * reason in the retry note; the last attempt is never failed for it — a quiz
 * without a picture beats no quiz.
 */
function figureRequiredError({ questions, subject, attempt, maxAttempts, gradeBand }) {
  const early = isEarlyYearsBand(gradeBand);
  if (!early && !DRAWABLE_SUBJECTS.has(String(subject || '').toLowerCase())) return null;
  // The picture is asked for ONCE, on the first attempt. A second full attempt
  // spent on the picture is the attempt that was missing when a science lesson
  // once failed outright: text-only is a lesser quiz, no quiz is none.
  if (attempt > 1 || attempt >= maxAttempts) return null;
  const drawn = (Array.isArray(questions) ? questions : []).some((q) => q && q.figure && typeof q.figure === 'object');
  if (drawn) return null;
  const why = early
    ? `this is a grade 1-5 lesson (${subject || 'language'}) and every subject is drawable at that age`
    : `this ${subject} lesson is drawable`;
  // A grade 1-5 maths quiz aims for three (figureDensity): "one or two" sent
  // the retry of a fractions lesson that had drawn nothing back with nothing.
  const maths = early && canonicalSubject(subject) === 'maths';
  const how = maths
    ? 'Decide the pictures FIRST, then write at least three questions the child answers by READING a picture: What fraction of the bar is shaded? Which bar shows a fraction (bars P, Q, R)? What number do the sticks show? How many counters are there? A step of a procedure (a cross product, a rewritten fraction) stays text — no picture can show its answer.'
    : early
    ? 'Decide the drawing FIRST — the thing the class counted, the word they sounded out, the clock they read, the pattern they continued — then write one or two questions the child answers by reading the picture.'
    : 'Decide the drawing FIRST (what the class was shown or asked to draw), then write one or two questions the child answers by reading the picture.';
  return `quiz: FIGURE_REQUIRED — ${why} but none of the questions carries a "figure". ${how}`;
}
/**
 * Faults that must never cost a teacher the quiz.
 *
 * Two kinds. First, complaints about the SET's shape — the level mix, the share
 * of questions carrying a picture — which say nothing about whether any one
 * question is wrong or unanswerable.
 *
 * Second, the GENDER rules, by design non-blocking: the quiz still needs to be
 * delivered. They are kept, not removed: the teacher's gender is not a fact
 * this system holds, so a gendered guess printed on that teacher's own document
 * is worth catching, and a reviewer caught one on a real sheet. But the
 * detector cannot tell "She showed the class the root" (the teacher) from
 * "Ayesha has 5 cookies. She gives 2 away" (a child) — the ordinary shape of a
 * primary word problem — and as a blocking gate it cost teachers their quizzes
 * over and over. So it stays a complaint the rewrite is asked to fix, and stops
 * being a reason to send nothing: every occurrence is still recorded in
 * meta.soft_faults and counted on transcript_quiz.gendered_teacher, so the rate
 * stays visible and can be fixed properly later.
 */
const SOFT_FAULT = new RegExp('^('
  + 'PEDAGOGY_LEVEL_MIX\\b|only \\d+\\/\\d+ at\\/below taught level|FIGURE_SHARE\\b'
  + '|q\\d+: PEDAGOGY_LEVEL_(ABOVE|MIX)\\b'
  + '|q\\d+: PEDAGOGY_GENDERED_(TEACHER|CHILD)\\b|PEDAGOGY_GENDERED_TEACHER\\b'
  + '|feminine-stem address$'
  // The teacher's PDF wants its notes in Urdu, and the fields repair nearly
  // always gets there. When it does not, that is a document-quality miss
  // on a page only the teacher reads — never a reason to send a whole class
  // no quiz. Recorded in meta.soft_faults so the rate
  // stays visible instead of costing quizzes silently.
  + '|q\\d+: URDU_TEACHER_FIELDS\\b'
  // Two English terms side by side in an Urdu sentence (URDU_ADJACENT_TERMS):
  // a sound question in an order the phone reads backwards. Repaired in place
  // (IN_PLACE_FAULT, below) and never a reason to send nothing.
  + '|q\\d+: URDU_ADJACENT_TERMS\\b'
  // The same question asked twice in one quiz (DUPLICATE_QUESTION): the later
  // copy is rewritten in place (IN_PLACE_FAULT, below); a quiz whose repair
  // did not take still has seven sound questions and one repeat, and ships.
  + '|q\\d+: DUPLICATE_QUESTION\\b'
  // A person's name in English letters in an Urdu quiz (URDU_NAME_LATIN): the
  // same kind of fault, repaired in place (IN_PLACE_FAULT, below).
  + '|q\\d+: URDU_NAME_LATIN\\b'
  // Too few pictures in a grade 1-5 maths quiz (runFigureDensity): a quiz with
  // one picture is still a quiz, and refusals cost teachers quizzes.
  + '|FIGURE_FEW\\b'
  + ')');

/**
 * A verb that speaks to the child with a gender (PEDAGOGY_GENDERED_CHILD —
 * «کون سی علامت لگائیں گے؟», «آپ … سوچ رہے ہیں»). A sizeable share of
 * generated Urdu items carried one. The question around it is sound, so the fault is
 * REPAIRED IN PLACE by one targeted rewrite and then shipped whatever that
 * leaves: never a full re-roll (a second attempt can die of something that
 * really is fatal — this pipeline's history), never a dropped
 * question, never a failed quiz, over one verb. Every occurrence that ships is
 * recorded in meta.soft_faults and counted on transcript_quiz.child_address.
 */
const ADDRESS_FAULT = /^q\d+: PEDAGOGY_GENDERED_CHILD\b/;
/**
 * Two separate English terms side by side in an Urdu sentence
 * (URDU_ADJACENT_TERMS — «جب numerator denominator سے چھوٹا ہو»). The same
 * kind of fault as the child's gender: a sound question whose words need
 * moving, not a question to throw away. Repaired in place by the same one
 * targeted rewrite, shipped whatever that leaves, counted on
 * transcript_quiz.adjacent_terms.
 */
const ADJACENT_FAULT = /^q\d+: URDU_ADJACENT_TERMS\b/;
/**
 * A later question that asks what an earlier one already asks, with the same
 * answer (DUPLICATE_QUESTION — transcript-quiz-duplicates). The earlier
 * question is sound; the later one is replaced by the same one targeted
 * rewrite with a different question for its slot. A repair that does not take
 * ships the quiz with the repeat recorded rather than costing the class the
 * quiz or a question. Counted on transcript_quiz.duplicate_question.
 */
const DUPLICATE_FAULT = /^q\d+: DUPLICATE_QUESTION\b/;
/**
 * A person's name written in English letters in an Urdu quiz
 * (URDU_NAME_LATIN — «‏Hira کی بوتل»). A name is not a term; the question is
 * sound. Repaired in place by the same one targeted rewrite, which also gives
 * the name's Urdu spelling so a picture's labels agree with the stem; shipped
 * whatever that leaves; counted on transcript_quiz.latin_name_found, and what
 * ships in English letters on transcript_quiz.latin_name.
 */
const NAME_FAULT = /^q\d+: URDU_NAME_LATIN\b/;
/** A fault that is repaired IN PLACE and then shipped — never re-rolled, never dropped, never fatal. */
const IN_PLACE_FAULT = new RegExp(`${ADDRESS_FAULT.source}|${ADJACENT_FAULT.source}|${DUPLICATE_FAULT.source}|${NAME_FAULT.source}`);
const inPlaceOnly = (errors) => Array.isArray(errors) && errors.length > 0 && errors.every((e) => IN_PLACE_FAULT.test(String(e)));
/**
 * The teacher's notes on an Urdu quiz written in English (URDU_TEACHER_FIELDS).
 * It has its OWN repair — one small call that rewrites only those two fields —
 * and that repair runs after EVERY step that writes questions, the targeted
 * rewrite included (repairTeacherFields in process). A set whose only faults
 * left after it are this and the in-place ones ships from the rewrite, with the
 * faults recorded: a note on the teacher's page is never a reason to re-roll
 * eight sound questions (in testing a rewrite once left five English notes and
 * nothing else; the re-rolls that followed lost the quiz).
 */
const TEACHER_FIELDS_FAULT = /^q\d+: URDU_TEACHER_FIELDS\b/;
const repairedOnly = (errors) => Array.isArray(errors) && errors.length > 0
  && errors.every((e) => IN_PLACE_FAULT.test(String(e)) || TEACHER_FIELDS_FAULT.test(String(e)));
/** The codes in a list of complaints, for telemetry ("q3: URDU_ADJACENT_TERMS — …" → "URDU_ADJACENT_TERMS"). */
const faultKinds = (errors) => [...new Set((errors || []).map((e) => String(e).replace(/^q\d+: /, '').split(/\s|—/)[0]))];
const GAP_MS = 1200;
const LEVEL_DIFFICULTY = { recall: 2, understand: 3, apply: 4 };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── rows ────────────────────────────────────────────────────────────────────

/**
 * Shuffle the correct option into a random slot at generation time (the same
 * rule the parent quiz follows) and rewrite every index-keyed field to follow.
 * The render-time shuffle (seeded on external_id) happens on top; feedbackFor
 * remaps by stored index so both are safe together.
 */
function toRows(quizId, questions, { rng = Math.random, figureUrls = {} } = {}) {
  const Multi = require('./transcript-quiz-multi');
  return questions.map((q, i) => {
    // A "select all that apply" question may carry FOUR options;
    // an ordinary one still carries exactly three. The shuffle is over whatever
    // the question has, so a three-option question consumes the rng in exactly
    // the same order it always did and its stored rows are unchanged.
    const multi = Multi.isMultiQuestion(q);
    const order = q.options.map((_, k) => k);
    for (let k = order.length - 1; k > 0; k -= 1) {
      const j = Math.floor(rng() * (k + 1));
      [order[k], order[j]] = [order[j], order[k]];
    }
    // order[newPos] = oldIdx
    const opts = order.map((old) => String(q.options[old]).trim());
    // The answer key follows the shuffle. For a set it is every correct
    // option's NEW position, sorted, joined — the "A,C" shape correctIndices()
    // has always parsed and the column has always been able to hold (asserted
    // against the live database: correct_option is TEXT, no A/B/C constraint).
    const correctOld = multi ? Multi.authoredCorrectIndices(q) : [Number(q.correct_index)];
    const correctNew = correctOld.map((old) => order.indexOf(old)).filter((p) => p >= 0).sort((a, b) => a - b);
    const newCorrect = correctNew[0];
    const isCorrectPos = (pos) => correctNew.includes(pos);
    const wrong = {};
    const misc = {};
    order.forEach((old, pos) => {
      if (isCorrectPos(pos)) return;
      const w = q.option_feedback?.wrong?.[String(old)];
      if (w) wrong[String(pos)] = String(w).trim();
      const m = q.distractor_misconceptions?.[String(old)];
      if (m) misc['ABCD'[pos]] = String(m).trim();
    });
    // A picture question is P3: the child gets ONE interactive message —
    // image header, stem body, three reply buttons. The URL is keyed on the
    // question's index, so a figure whose PNG never uploaded degrades to a
    // plain P1 question rather than to a row pointing at nothing.
    const figureUrl = figureUrls[i];
    const selectedBecause = String(q.selected_because || '').trim();
    // `answer_mode` is the ONE discriminator every consumer reads; its absence
    // means today's behaviour, exactly, so a single-answer row still stores no
    // media at all when it has no figure and no selected_because.
    const media = {
      ...(q.figure && figureUrl ? { question_image: figureUrl, figure: q.figure } : {}),
      ...(selectedBecause ? { selected_because: selectedBecause } : {}),
      ...(multi ? { answer_mode: Multi.ANSWER_MODE_MULTI } : {}),
    };
    const hasMedia = Object.keys(media).length > 0;

    return stampDisplayOrder({
      quiz_id: quizId,
      question_text: String(q.question).trim(),
      option_a: opts[0], option_b: opts[1], option_c: opts[2],
      ...(opts.length > 3 ? { option_d: opts[3] } : {}),
      correct_option: correctNew.map((p) => 'ABCD'[p]).join(','),
      explanation: String(q.explanation || '').trim() || null,
      misconception_feedback: Object.values(wrong)[0] || null,
      distractor_misconceptions: Object.keys(misc).length ? misc : null,
      option_feedback: { correct: String(q.option_feedback?.correct || '').trim(), wrong },
      difficulty_level: LEVEL_DIFFICULTY[q.level] || 3,
      // quiz_questions.external_id is unique across ALL quizzes (partial unique
      // index), so the quiz id is part of it; the report reads the SLO as the
      // second-to-last segment.
      external_id: `tq:${quizId}:${q.slo_id || 'S?'}:${i + 1}`,
      // "media" now also carries selected_because on a question with no
      // figure, so the pattern is keyed on question_image specifically —
      // not on media's mere presence — exactly as it reads once applyMedia
      // recomputes it below.
      render_pattern: media.question_image ? 'P3' : 'P1',
      ...(hasMedia ? { media } : {}),
      sort_order: i,
    });
  });
}

/**
 * ONE ORDER, STORED ONCE.
 *
 * The order the child sees the options in is decided HERE, once, while the row
 * still has the `external_id` the shuffle is seeded on, and written onto the row
 * as `media.display_order` (display position -> stored index). Every consumer
 * reads it back through `render.displayOrder()`: the question card's picture,
 * the letter buttons, `feedbackFor`'s letter remap, the teacher PDF's answer key.
 *
 * WHY THIS AND NOT "REMEMBER TO SELECT external_id". Because the seed lived in a
 * column any query could omit, and two of them did (`sendNextQuestion` and
 * `handleAnswer`): the card was drawn from a row that had it, the buttons were
 * built from the same row without it, the two shuffles disagreed, and a child who
 * tapped the picture's B was congratulated for the answer at C. A rule that every
 * future `.select()` must remember a column is not a fix; a value that travels
 * inside `media` — which every one of those queries already loads — is.
 */
function stampDisplayOrder(row) {
  const render = require('./video-quiz-render.service');
  const labels = render.optionLabels(row);
  const order = render.displayOrder(row, labels);
  row.media = { ...(row.media || {}), display_order: order };
  return row;
}

/**
 * Where a card or figure PNG is kept. With object storage, `upload()` (R2).
 * Without it (R2 is optional) the PNG stays on local disk and the row carries a
 * file:// URL, the way main keeps a reading report or a voice note: the Baileys,
 * Slack, Discord and Matrix drivers read such a URL off disk when they send it.
 * Meta's Cloud API cannot fetch a local file, so a deployment on the Meta driver
 * needs object storage for quiz pictures (warned here). The child is sent the
 * picture later, by the bot process, so the file must outlive this job: the
 * worker and the bot have to share the disk (one host, as on a local setup).
 *
 * @returns {Promise<string>} the URL to store in the row's media
 */
async function storeQuizPng({ png, teacherId, quizId, name, upload }) {
  if (require('../../storage/r2').isR2Configured()) return upload();
  const { TEMP_DIR } = require('../../utils/constants');
  // Ids come from rows; keep them to one plain path segment each.
  const segment = (s) => String(s == null ? '' : s).replace(/[^A-Za-z0-9_-]/g, '_') || '_';
  const dir = path.join(TEMP_DIR, 'transcript_quizzes', segment(teacherId), segment(quizId));
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${segment(name)}.png`);
  fs.writeFileSync(file, png);
  if (String(globalThis.process.env.CHANNEL_DRIVER || '').toLowerCase() === 'meta') {
    logToFile('⚠️ transcript quiz: no object storage — a quiz picture is kept on local disk, which the Meta driver cannot send (set R2_*)', {
      quizId, name,
    }, 'warn');
  }
  return `file://${file}`;
}

/**
 * Draw, screenshot and store every figure in the quiz, in order.
 *
 * Sequential on purpose: Playwright pages are the expensive resource and a
 * quiz carries at most four figures. Any failure throws — an attempt that
 * cannot produce a picture is a FAILED attempt, retried with the reason, never
 * a stored row whose media.question_image points at an object that does not
 * exist.
 *
 * @returns {Promise<Object<number,string>>} question index → public URL
 */
async function renderFigures({ questions, language, teacherId, quizId }) {
  const Figure = require('./transcript-quiz-figure');
  const urls = {};
  const jobs = questions.map((q, i) => ({ q, i })).filter(({ q }) => q && q.figure);
  // Three at a time: one Chromium, three pages — the whole set lands in the
  // time one used to take, without starving the PDF render that follows.
  await runPool(jobs, 3, async ({ q, i }) => {
    const startedAt = Date.now();
    try {
      // The validator already drew this one; redrawing it would be a second
      // chance for the two copies to differ.
      const svg = q.figureSvg || Figure.renderFigureSvg(q.figure, language);
      // The frame paints "Question n of N" like a question card does; the
      // number is the row's position, which is the order the session asks in.
      const png = await Figure.renderFigurePng(svg, language, { questionNumber: i + 1, total: questions.length });
      urls[i] = await storeQuizPng({
        png, teacherId, quizId, name: `q${i}`, upload: () => Figure.uploadFigure({ teacherId, quizId, index: i, png }),
      });
      logEvent('transcript_quiz.figure_ready', {
        quizId, index: i, figureType: q.figure.type, bytes: png.length, latencyMs: Date.now() - startedAt,
      });
    } catch (err) {
      logToFile('⚠️ transcript quiz: figure could not be made', { quizId, index: i, error: err.message });
      throw new Error(`q${i}: FIGURE_RENDER — the picture could not be made (${err.message}); write this question without a "figure"`);
    }
  });
  return urls;
}

/** Run `fn` over `items` with at most `limit` in flight; the first rejection wins. */
async function runPool(items, limit, fn) {
  const queue = items.slice();
  const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length) {
      const item = queue.shift();
      // eslint-disable-next-line no-await-in-loop
      await fn(item);
    }
  });
  await Promise.all(workers);
}

/**
 * QUESTION CARDS — one image for each question whose stem or options carry
 * notation WhatsApp cannot draw, or options too long for a reply button. The
 * card shows the figure, the stem and the options in the SAME display order
 * the sender will use (seeded on the row's external id), with A/B/C handles;
 * the sender then offers letter buttons. Returns { rowIndex: url }.
 */
async function renderCards({ rows, questions, language, teacherId, quizId }) {
  const Card = require('./transcript-quiz-card');
  const render = require('./video-quiz-render.service');
  const Multi = require('./transcript-quiz-multi');
  const urls = {};
  // A tall figure makes a card too (the row may not carry the spec yet; the authored question does).
  const jobs = rows.map((row, i) => ({ row, i })).filter(({ row, i }) => Card.needsQuestionCard(row) || Card.needsQuestionCard(questions[i]));
  await runPool(jobs, 3, async ({ row, i }) => {
    const startedAt = Date.now();
    try {
      const labels = render.optionLabels(row);
      // one order. The multi path reads media.display_order when
      // the row carries it, so the letters on the card are the order the
      // checkboxes will be in.
      const displayOrder = (Multi.isMultiRow(row) && Multi.persistedOrder(row, labels))
        || render.displayOrder(row, labels);
      const authored = questions && questions[i];
      const figureSvg = (authored && authored.figureSvg) || null;
      const png = await Card.renderQuestionCardPng({
        stem: row.question_text, options: labels, displayOrder, figureSvg, language,
        questionNumber: i + 1, total: rows.length,
        // A card for a "select all that apply" question ends with "tap A, B or C"
        // unless it is told otherwise — an instruction that is simply false when
        // the child answers with checkboxes in a Flow.
        answerMode: (row.media && row.media.answer_mode) || 'single',
      });
      urls[i] = await storeQuizPng({
        png, teacherId, quizId, name: `card${i + 1}`, upload: () => Card.uploadCard({ teacherId, quizId, index: i, png }),
      });
      logEvent('transcript_quiz.card_ready', { quizId, index: i, bytes: png.length, latencyMs: Date.now() - startedAt });
    } catch (err) {
      logToFile('⚠️ transcript quiz: question card could not be made', { quizId, index: i, error: err.message });
      throw new Error(`q${i}: CARD_RENDER — the question card could not be made (${err.message})`);
    }
  });
  return urls;
}

/** Stamp the rows with what the renders produced: the figure URL, the card URL, the pattern. */
function applyMedia(rows, questions, { figureUrls = {}, cardUrls = {}, language } = {}) {
  rows.forEach((row, i) => {
    const q = questions && questions[i];
    const media = { ...(row.media || {}), language };
    if (q && q.figure && figureUrls[i]) {
      media.question_image = figureUrls[i];
      media.figure = q.figure;
      // Every figure renderFigures draws paints its own counter, so the chat
      // body under it must not repeat it. Recorded on the row, not assumed at
      // send time: a picture stored before the frame existed has no counter,
      // and its question still needs the one in the body.
      media.question_image_paints_counter = true;
    }
    if (cardUrls[i]) media.question_card = cardUrls[i];
    row.media = media;
    // A card carries the figure inside it; the header-image pattern is for a
    // figure with short text options.
    row.render_pattern = (media.question_image && !media.question_card) ? 'P3' : 'P1';
  });
  return rows;
}

// The teacher's PDF and the class's forwardable message are built in
// transcript-quiz-render.js, which the hand-off requires too (so neither of
// the two requires the other); re-exported below for every existing caller.
const {
  withFigureSvgs, teacherLabel, studentMessage, pdfFilename, renderPdf,
} = require('./transcript-quiz-render');

async function updateQuiz(quizId, patch) {
  // Every terminal failure is dated on the row, whichever step wrote it — the
  // DB half of the funnel's generation_failed (offered_at, accepted_at,
  // ready_at and sent_at already date the other stages).
  const stamped = patch && patch.status === 'failed' && patch.meta && !patch.meta.failed_at
    ? { ...patch, meta: { ...patch.meta, failed_at: new Date().toISOString() } }
    : patch;
  const { error } = await supabase.from('quizzes').update(stamped).eq('id', quizId);
  if (error) throw new Error(`quizzes update failed: ${error.message}`);
}

/**
 * `extra` rides on the `transcript_quiz.failed` event — `step` names which pass
 * stopped when one reason can come from two of them (`model_failed`: the digest
 * or the author).
 */
async function tellTeacherFailed(phone, lang, quizId, reason, quizSource = TRANSCRIPT, extra = {}, failedMeta = null) {
  // failedMeta: the row as failed, for a start failure's next-step line (quiz-sources startFailureCopyKey).
  await WhatsAppService.sendMessage(phone, resolveUx(failureCopyKey(reason, quizSource, { meta: failedMeta }), { language: lang }));
  logEvent('transcript_quiz.failed', { quizId, reason, quiz_source: quizSource, ...extra });
  Funnel.emit('generation_failed', { quiz_id: quizId, source: quizSource, reason, step: extra.step });
}

// ─── the step ────────────────────────────────────────────────────────────────

/**
 * Drop the questions whose ONLY complaints are DROPPABLE — a picture rule or a
 * pedagogy rule — and re-validate. Returns { questions, dropped } when the rest
 * still make a valid quiz, else null.
 *
 * Pedagogy joined the picture rules here for the reason the
 * pictures did: a whole-quiz reject on the last attempt means the teacher is
 * told nothing could be made, over one question that should not have been
 * asked. Both are per-question faults, and the quiz is better without that
 * question than not at all. A structural fault is still fatal — the two
 * quiz-level codes below are the only non-q complaints tolerated, and both are
 * re-checked by the validate() call at the end of this function.
 */
function salvageWithoutBadFigures(questions, errors, ctx) {
  // WHAT DECIDES IS THE FLOOR, NOT THE CODE OF THE COMPLAINT.
  //
  // This dropped a question complaining of FIGURE_, PEDAGOGY_ or RELIGIOUS_ and
  // treated every other per-question complaint as a reason to throw the WHOLE
  // quiz away — the same allow-list shape that cost teachers their quiz
  // in the repair path. A single `q5: duplicate options` on ONE question once
  // cost a teacher all eight, when it should have been non-blocking and fixed
  // later — a fault in one question is no reason to lead the quiz to failure.
  //
  // We author N_QUESTIONS and the validator's floor is MIN_QUESTIONS, so the
  // difference is how many questions may be dropped. A complaint that names a
  // question is a question we can drop; a complaint about the SET is not
  // something dropping a question fixes, and the soft set-level rules ride
  // along. What survives is re-validated in full, so a drop never ships a
  // broken remainder.
  const perQuestion = /^q(\d+):\s*\S/;
  const setLevelSoft = /^(FIGURE_SHARE|PEDAGOGY_LEVEL_MIX|only \d+\/\d+ at\/below taught level|feminine-stem address$)/;
  const bad = new Set();
  let other = false;
  errors.forEach((e) => {
    // A misaddressed question is a sound question with one wrong verb, and two
    // English terms side by side are a sound question in the wrong order: it
    // is shipped with the fault recorded, never dropped (see IN_PLACE_FAULT).
    if (IN_PLACE_FAULT.test(e)) return;
    const m = perQuestion.exec(e);
    if (m) bad.add(Number(m[1]));
    else if (!setLevelSoft.test(e) && !SOFT_FAULT.test(e)) other = true;
  });
  if (other) return { refused: 'a complaint about the set, not a question', errors };
  if (!bad.size) return { refused: 'nothing named a question to drop', errors };
  const kept = questions.filter((_, i) => !bad.has(i));
  if (kept.length < MIN_QUESTIONS) {
    return { refused: `dropping ${bad.size} would leave ${kept.length}, under the floor of ${MIN_QUESTIONS}`, errors };
  }
  const v = validate(kept, { ...ctx, nExpected: kept.length });
  // ONE definition of "shippable", shared with the soft-fault ship above: no
  // hard fault on any surviving question, and at least MIN_QUESTIONS of them.
  // These two used to disagree — the ship path allowed a set-level level-mix
  // fault and the drop path demanded a spotless remainder — so a drop that left
  // a soft fault was refused and the teacher got nothing.
  const soft = v.errors.filter((e) => !SOFT_FAULT.test(String(e)));
  if (soft.length) return { refused: 'what survived did not validate', errors: soft, dropped: [...bad].sort((a, b) => a - b) };
  // sorted, so the event and the meta read the same way every time
  return { questions: v.questions, dropped: [...bad].sort((a, b) => a - b), softFaults: v.errors };
}

/**
 * Draw the pictures and the question cards for a candidate set of questions.
 *
 * The attempt loop, the targeted rewrite and the salvage all need exactly this,
 * and all three treat a failure the same way: the candidate is not usable, the
 * reason is a `q<i>: FIGURE_RENDER` / `CARD_RENDER` string, and the next
 * recovery step runs. Called through `api` so a test can stub the two renders.
 */
async function renderFor(api, { questions, rows, language, teacherId, quizId }) {
  const [figureUrls, cardUrls] = await Promise.all([
    api.renderFigures({ questions, language, teacherId, quizId }),
    api.renderCards({ rows, questions, language, teacherId, quizId }),
  ]);
  return { figureUrls, cardUrls };
}

/**
 * PICTURE DENSITY — a grade 1-5 maths quiz aims for FIGURE_TARGET pictures.
 *
 * In practice the author drew a picture on only a small share of maths items: it was asked for
 * "two or three" and nothing held it to more than one. Too few is a SOFT
 * complaint (FIGURE_FEW) — refusals cost teachers quizzes — so it is answered
 * with a targeted "add a picture" call on the questions a picture helps most
 * (transcript-quiz-rewrite addPictures, the one rewrite allowed to add a
 * figure). The merged set is validated IN FULL like any rewrite; a picture
 * fault on an added question reverts that question alone. Whatever happens,
 * the quiz ships: repaired, partly repaired, or as it was, with FIGURE_FEW in
 * meta.soft_faults. `transcript_quiz.figure_density` records before/after on
 * every grade 1-5 maths quiz, so the rate is measurable.
 *
 * The call may also REPLACE a question no picture can answer (a step of a
 * procedure) with a new read-off question on the same objective; `replaced`
 * names those, and a replacement the validator refuses is reverted to the
 * original question like any other added picture. It asks for one picture more
 * than the shortfall (inside the half cap), and when pictures were refused and
 * the quiz is still short it is called ONCE more with what was refused and why
 * (`rounds` records how many calls ran; `reverted` the questions that still
 * have no picture after a refusal).
 *
 * Runs after every authoring repair and BEFORE the key check and the blind
 * solve, so a stem rewritten to point at its new picture — and a replaced
 * question's new key — is checked like any other. Never throws.
 */
/** The add-pictures repair runs at most this many times; the second only after refusals. */
const DENSITY_ROUNDS = 2;

async function runFigureDensity(api, {
  questions, digest, language, quizId, teacherId, lessonSummary, gradeBand, lessonDrew, attempts,
}) {
  const measure = (qs) => figureDensity(qs, { subject: digest.subject, gradeBand });
  const before = measure(questions);
  if (!before.applies) return { record: null };
  const record = {
    before: before.figured, after: before.figured, target: before.target, n: before.n, need: before.need,
    asked: 0, added: [], replaced: [], repaired: false, reason: null, cost_usd: 0,
  };
  const finish = (out = {}) => {
    const now = measure(out.questions || questions);
    record.after = now.figured;
    record.complaint = now.complaint;
    logEvent('transcript_quiz.figure_density', {
      quizId, before: record.before, after: record.after, target: record.target, n: record.n, asked: record.asked, rounds: record.rounds || 0,
      added: record.added, replaced: record.replaced, reverted: record.reverted || [], repaired: record.repaired, reason: record.reason,
    });
    return { record, ...out };
  };
  if (!before.need) { record.reason = 'enough'; return finish(); }

  const ctx = {
    language, subject: digest.subject, digest, nExpected: questions.length, lessonSummary, quizId,
  };
  const hard = (errs) => errs.filter((e) => !SOFT_FAULT.test(String(e)));
  const qIndex = (e) => { const m = /^q(\d+):/.exec(String(e)); return m ? Number(m[1]) : null; };
  let current = questions;
  let currentV = null;
  const added = [];
  const replaced = [];
  const refusedEver = new Set();
  let refused = [];
  let failure = null;
  record.rounds = 0;
  // At most TWO calls, and the second only when the first had pictures refused
  // and the quiz is still short. On a real grade 4 English quiz the repair bolted bars
  // onto three method questions, all refused by FIGURE_MISMATCH, and the quiz
  // shipped with two; told what was refused and why, a second call replaces them.
  for (let round = 1; round <= DENSITY_ROUNDS; round += 1) {
    const now = measure(current);
    if (!now.need) break;
    // ONE picture more than the shortfall, inside the half cap. Asked for exactly
    // the shortfall, the repair left two of three live fractions quizzes one
    // short: one of its pictures was refused and there was nothing behind it.
    const asked = Math.max(now.need, Math.min(now.need + 1, now.room ?? now.need));
    if (round === 1) record.asked = asked;
    let rw;
    try {
      // eslint-disable-next-line no-await-in-loop
      rw = await api.addPictures({
        questions: current, digest, language, gradeBand, lessonDrew, need: asked, quizId, refused,
      });
    } catch (err) {
      rw = { attempted: true, indices: [], merged: null, added: [], replaced: [], error: err.message };
    }
    if (rw.error) {
      logToFile('❌ transcript quiz: the add-pictures call failed — the quiz ships with what it has', { quizId, round, error: rw.error }, 'error');
    }
    record.cost_usd = Math.round(((record.cost_usd || 0) + (rw.costUsd || 0)) * 1e6) / 1e6;
    if (!rw.attempted) { failure = failure || 'no_candidates'; break; }
    record.rounds = round;
    attempts.push({
      attempt: 'add_pictures', round, indices: rw.indices, added: rw.added, replaced: rw.replaced || [], model: rw.model || null,
      cost_usd: rw.costUsd || null, latency_ms: rw.latencyMs || null, error: rw.error || null,
    });
    if (!rw.merged) { failure = failure || (rw.error ? 'call_failed' : 'nothing_usable'); break; }

    // Validated in full. A hard fault on a question the repair did NOT touch
    // cannot come from it (the set arrived shippable), so it refuses the round;
    // a fault on an ADDED question reverts that one question to what it was.
    let roundAdded = [...rw.added];
    let merged = rw.merged;
    let v = validate(merged, ctx);
    refused = [];
    if (hard(v.errors).length) {
      const errs = hard(v.errors);
      const stray = errs.some((e) => { const i = qIndex(e); return i === null || !roundAdded.includes(i); });
      record.errors = errs.slice(0, 4).map((e) => String(e).slice(0, 160));
      if (stray) { failure = failure || 'merged_set_invalid'; break; }
      const named = new Set(errs.map(qIndex));
      const revert = roundAdded.filter((i) => named.has(i));
      refused = revert.map((i) => ({ index: i, error: String(errs.find((e) => qIndex(e) === i)).slice(0, 220) }));
      revert.forEach((i) => refusedEver.add(i));
      roundAdded = roundAdded.filter((i) => !revert.includes(i));
      if (!roundAdded.length) { failure = failure || 'every_picture_failed'; continue; }
      const entering = current;
      merged = merged.map((q, i) => (revert.includes(i) ? entering[i] : q));
      v = validate(merged, ctx);
      if (hard(v.errors).length) { failure = failure || 'merged_set_invalid'; break; }
    }
    current = v.questions;
    currentV = v;
    added.push(...roundAdded);
    // a replaced question that was reverted is the original again, not new
    replaced.push(...(rw.replaced || []).filter((i) => roundAdded.includes(i)));
    if (!refused.length) break;
  }
  record.reverted = [...refusedEver].filter((i) => !added.includes(i)).sort((a, b) => a - b);
  if (!added.length) { record.reason = failure || 'nothing_usable'; return finish(); }
  try {
    const drafted = toRows(quizId, currentV.questions);
    const { figureUrls, cardUrls } = await renderFor(api, {
      questions: currentV.questions, rows: drafted, language, teacherId, quizId,
    });
    record.added = [...added].sort((a, b) => a - b);
    record.replaced = [...replaced].sort((a, b) => a - b);
    record.repaired = true;
    record.reason = refusedEver.size ? 'added_some' : 'added';
    return finish({
      changed: true, questions: currentV.questions, figureUrls, cardUrls, draftedRows: drafted,
      softFaults: currentV.errors.length ? currentV.errors : null,
    });
  } catch (figErr) {
    logToFile('❌ transcript quiz: the pictures added for density could not be drawn — the quiz ships as it was', { quizId, error: figErr.message }, 'error');
    record.reason = 'render_failed';
    return finish();
  }
}

/**
 * THE KEY CHECK — a plan quiz's keys, held against the plan it was written
 * from, after every authoring and repair step and before a single row is stored.
 *
 * WHY. A singular/plural quiz once keyed the lesson's own planted misconception
 * as the correct answer ("this word keeps its form" — the plan taught its plural
 * three times). The author is given that misconception to build wrong options
 * from; once in a couple of dozen items it built the key from it. Nothing
 * downstream compared a key with the lesson, so the quiz went out.
 *
 * WHAT. One LLM call (`plan-quiz-key-check.service`) returns a verdict per item.
 * A `contradicts` item is re-authored ONCE through the same targeted rewrite
 * every other rejected question goes through, with the lesson's quote as its
 * complaint; the merged set goes through the whole validator and only the
 * rewritten items are checked again. What still contradicts is dropped when the
 * quiz keeps its floor (the salvage's own rule and re-validation); otherwise the
 * quiz fails as `key_conflict`, persisted and told — never a silent send.
 * `unclear` never blocks.
 *
 * FAIL-OPEN, deliberately. A checker that throws, times out or returns no
 * verdicts costs the teacher nothing: the quiz ships exactly as authored — as
 * it would have without this check — the failure is logged at
 * ERROR and recorded as `meta.key_check.status = 'error'`, so the rate is
 * visible. The same holds for the re-check of a rewritten item. Blocking a
 * teacher's quiz on the checker's own outage would trade a rare wrong key for a
 * certain lost quiz on every provider blip.
 *
 * @returns {Promise<{record:object, changed?:boolean, failed?:boolean,
 *   questions?:object[], figureUrls?:object, cardUrls?:object, draftedRows?:object[],
 *   softFaults?:string[]|null}>}
 */
async function runKeyCheck(api, {
  questions, source, digest, language, quizId, teacherId, lessonSummary, gradeBand, attempts, knownNames = null,
  quizSource = null,
}) {
  const KeyCheck = require('./plan-quiz-key-check.service');
  const startedAt = Date.now();
  const record = {
    status: 'clean', model: null, checked: questions.length, contradicted: 0, fixed: 0, dropped: 0,
    unclear: 0, missing: 0, ungrounded: 0, cost_usd: 0, conflicts: [],
  };
  const finish = (out) => {
    record.latency_ms = Date.now() - startedAt;
    record.cost_usd = Math.round(record.cost_usd * 1e6) / 1e6;
    logEvent('transcript_quiz.key_check', {
      quizId, quiz_source: quizSource, status: record.status, model: record.model,
      checked: record.checked, contradicted: record.contradicted, fixed: record.fixed, dropped: record.dropped,
      unclear: record.unclear, missing: record.missing, ungrounded: record.ungrounded,
      costUsd: record.cost_usd, latencyMs: record.latency_ms,
    });
    return { record, ...out };
  };
  const failOpen = (what, err) => {
    const message = String((err && err.message) || err || 'unknown').slice(0, 200);
    logToFile(`❌ plan quiz: key check ${what} failed — shipping without it (fail-open)`, { quizId, error: message }, 'error');
    return message;
  };

  // ── 1. the check ──────────────────────────────────────────────────────────
  let first;
  try {
    first = await api.checkKeys({ questions, source, language, quizId });
  } catch (err) {
    record.status = 'error';
    record.error = failOpen(err && err.code === 'NO_ANSWERS' ? 'reply' : 'call', err);
    return finish({ changed: false });
  }
  if (first.skipped) {
    record.status = first.skipped;
    record.checked = 0;
    return finish({ changed: false });
  }
  record.model = first.model || null;
  record.cost_usd += Number(first.costUsd) || 0;
  first.verdicts.forEach((v) => {
    if (v.verdict === 'unclear') record.unclear += 1;
    if (v.missing) record.missing += 1;
    if (v.verdict === 'contradicts' && !v.grounded) record.ungrounded += 1;
  });
  const bad = first.verdicts.filter((v) => v.verdict === 'contradicts');
  record.contradicted = bad.length;
  if (!bad.length) return finish({ changed: false });

  const complaints = bad.map((v) => KeyCheck.conflictComplaint(v, questions[v.index]));
  record.conflicts = bad.map((v) => ({
    index: v.index,
    keyed: KeyCheck.keyedText(questions[v.index]).slice(0, 120),
    quote: String(v.quote || '').slice(0, 200),
    grounded: Boolean(v.grounded),
  }));
  attempts.push({ attempt: 'key_check', model: record.model, cost_usd: first.costUsd || null, latency_ms: first.latencyMs || null, errors: complaints });
  logToFile('⚠️ plan quiz: the key check found answers the plan contradicts', { quizId, indices: bad.map((v) => v.index) });

  // ── 2. ONE targeted rewrite, with the lesson's quote as the complaint ──────
  const stillBad = new Set(bad.map((v) => v.index));
  let current = questions;
  let softFaults = null;
  const rw = await api.rewriteRejected({
    // More than five conflicting keys: the worst five are rewritten, the rest dropped below.
    questions, errors: complaints, digest, language, gradeBand, quizId, lessonSummary, planned: true, knownNames, partial: true,
  });
  if (rw.attempted) {
    record.cost_usd += Number(rw.costUsd) || 0;
    let verrs = null;
    const replacedBad = (rw.replaced || []).filter((i) => stillBad.has(i));
    if (rw.merged && replacedBad.length) {
      const v = validate(rw.merged, {
        language, subject: digest.subject, digest, nExpected: questions.length, lessonSummary, quizId,
      });
      verrs = v.errors;
      // The same bar every other shipped set meets: no hard fault left.
      if (v.errors.every((e) => SOFT_FAULT.test(String(e)))) {
        let again = new Set();
        try {
          const re = await api.checkKeys({ questions: v.questions, source, language, quizId, indices: replacedBad });
          record.cost_usd += Number(re.costUsd) || 0;
          again = new Set(re.verdicts.filter((x) => x.verdict === 'contradicts').map((x) => x.index));
        } catch (err) {
          record.recheck_error = failOpen('re-check', err);
        }
        current = v.questions;
        softFaults = v.errors.length ? v.errors : null;
        replacedBad.forEach((i) => {
          if (again.has(i)) return;
          stillBad.delete(i);
          record.fixed += 1;
        });
      }
    }
    attempts.push({
      attempt: 'rewrite', after: 'key_check', indices: rw.indices, replaced: rw.replaced,
      model: rw.model || null, cost_usd: rw.costUsd || null, latency_ms: rw.latencyMs || null,
      errors: verrs || [rw.error || 'the rewrite returned no usable replacement'],
    });
    logEvent('transcript_quiz.rewrite_attempted', {
      quizId, after: 'key_check', indices: rw.indices, replaced: rw.replaced, ok: stillBad.size === 0, errors: verrs ? verrs.length : null,
    });
  }

  // ── 3. drop what still contradicts, or fail ─────────────────────────────────
  const ctx = { language, subject: digest.subject, digest, quizId, lessonSummary };
  const dropFrom = (set, indices) => {
    if (!indices.length) return { questions: set, dropped: [], softFaults };
    const errs = indices.map((i) => `q${i}: KEY_CONFLICT — still contradicts the lesson`);
    const s = salvageWithoutBadFigures(set, errs, ctx);
    if (!s || s.refused) {
      record.refused = (s && s.refused) || 'nothing could be dropped';
      return null;
    }
    return { questions: s.questions, dropped: s.dropped, softFaults: (s.softFaults && s.softFaults.length) ? s.softFaults : null };
  };
  const allBad = bad.map((v) => v.index);
  const candidates = [{ gone: [...stillBad].sort((a, b) => a - b), make: () => dropFrom(current, [...stillBad].sort((a, b) => a - b)) }];
  // Only if the repaired set cannot be DRAWN: the authored set minus every
  // flagged item. (When nothing was repaired it is the same set — not retried.)
  if (current !== questions) candidates.push({ gone: allBad, repairsLost: true, make: () => dropFrom(questions, allBad) });
  for (const { gone, repairsLost, make } of candidates) {
    const cand = make();
    if (!cand) continue;
    try {
      const drafted = toRows(quizId, cand.questions);
      // eslint-disable-next-line no-await-in-loop
      const { figureUrls, cardUrls } = await renderFor(api, {
        questions: cand.questions, rows: drafted, language, teacherId, quizId,
      });
      if (repairsLost) record.fixed = 0;
      record.dropped = cand.dropped.length;
      record.status = cand.dropped.length ? 'dropped' : 'fixed';
      record.conflicts.forEach((c) => { c.outcome = gone.includes(c.index) ? 'dropped' : 'fixed'; });
      attempts.push({ attempt: 'key_check_result', status: record.status, dropped: cand.dropped, errors: cand.softFaults || [] });
      return finish({
        changed: true, questions: cand.questions, figureUrls, cardUrls, draftedRows: drafted, softFaults: cand.softFaults,
      });
    } catch (figErr) {
      record.render_error = String(figErr.message || figErr).slice(0, 200);
      logToFile('❌ plan quiz: the key-checked set could not be drawn', { quizId, error: record.render_error }, 'error');
    }
  }
  record.status = 'failed';
  record.conflicts.forEach((c) => { c.outcome = stillBad.has(c.index) ? 'failed' : 'fixed'; });
  return finish({ failed: true });
}

/**
 * THE LAST REPAIR — for a question written AFTER the author's loop.
 *
 * The loop validates every set it writes and repairs its in-place faults (a
 * verb that guesses the child's gender, two English terms side by side). The
 * steps after it — the picture step that REPLACES a question, the key check's
 * and the blind solve's rewrites — accept any set whose faults are soft, and no
 * repair runs after them. In testing, the picture step once replaced q5
 * with a picture question whose explanation read "Quotient whole", "Remainder
 * Numerator", and it shipped that way.
 *
 * So, before the rows are stored: the in-place faults (the child's gender,
 * English terms side by side, a name in English letters) of every question
 * whose text is not one the loop settled get ONE rewrite call — the worst five
 * (rewriteTargets `partial`). The repair may change only the text its complaint
 * names; the picture, the key, the options' order, the objective and the level
 * stay exactly as they were, and a change to the options is kept only if the
 * key stays where it was. The merged set must validate with no hard fault and
 * with fewer in-place faults, and must draw; otherwise the set is kept as it
 * was. This pass never costs the teacher the quiz.
 *
 * @returns {Promise<{record:object|null, changed?:boolean, questions?:object[],
 *   figureUrls?:object, cardUrls?:object, draftedRows?:object[], faults?:string[]}>}
 */
const FINAL_REPAIRABLE = new RegExp(`${ADDRESS_FAULT.source}|${ADJACENT_FAULT.source}|${NAME_FAULT.source}`);
/** What a question SAYS — the text a repair would change. */
const textSignature = (q) => JSON.stringify([q && q.question, q && q.options, q && q.explanation, q && q.option_feedback]);
/** The fields a complaint names: «q5: URDU_ADJACENT_TERMS — explanation + option 0 put …». */
function namedFields(complaint) {
  const m = /—\s*(.+?)\s+(?:speaks?|puts?)\b/.exec(String(complaint));
  return m ? m[1].split(/\s*\+\s*/).map((f) => f.trim()) : [];
}
/** The original question with only the named text taken from its repair — or null when the repair moved the key. */
function textOnlyRepair(orig, repl, fields, { namesOnly = false } = {}) {
  if (!repl || typeof repl !== 'object') return null;
  const sameShape = Array.isArray(repl.options) && Array.isArray(orig.options) && repl.options.length === orig.options.length
    && Number(repl.correct_index) === Number(orig.correct_index)
    && JSON.stringify(repl.correct_indices || null) === JSON.stringify(orig.correct_indices || null);
  // A name in English letters is not rewritten by the model: the code writes
  // the name's Urdu spelling into the question as it was, picture labels
  // included (spellNames) — so that question is taken whole, key unmoved.
  if (namesOnly) return sameShape ? { ...repl, slo_id: orig.slo_id, level: orig.level } : null;
  const out = { ...orig };
  const has = (rx) => fields.some((f) => rx.test(f));
  if (has(/^question$/) && String(repl.question || '').trim()) out.question = repl.question;
  if (has(/^option \d/)) {
    if (!sameShape) return null;
    out.options = repl.options;
  }
  if (has(/^explanation$/) && String(repl.explanation || '').trim()) out.explanation = repl.explanation;
  if (has(/^option_feedback/) && repl.option_feedback && typeof repl.option_feedback === 'object') {
    const keys = (fb) => Object.keys((fb && fb.wrong) || {}).sort().join(',');
    if (keys(repl.option_feedback) !== keys(orig.option_feedback)) return null;
    out.option_feedback = repl.option_feedback;
  }
  return out;
}

async function runFinalSoftRepair(api, {
  questions, settled, digest, language, quizId, teacherId, lessonSummary, gradeBand, planned, topicOnly = false, attempts, knownNames = null,
}) {
  const ctx = { language, subject: digest.subject, digest, quizId, lessonSummary };
  const qIndex = (e) => Number(/^q(\d+)/.exec(String(e))[1]);
  const before = validate(questions, { ...ctx, nExpected: questions.length });
  const late = new Set(questions.map((q, i) => (settled.has(textSignature(q)) ? -1 : i)).filter((i) => i >= 0));
  const faults = before.errors.filter((e) => FINAL_REPAIRABLE.test(e) && late.has(qIndex(e)));
  if (!faults.length) return { record: null };
  const record = {
    status: 'unchanged', eligible: [...new Set(faults.map(qIndex))].sort((a, b) => a - b), asked: [], fixed: 0, cost_usd: 0,
  };
  const keep = (why) => {
    record.reason = why;
    record.remaining = faults.length;
    logEvent('transcript_quiz.final_repair', { quizId, ...record });
    return { record, faults: before.errors.filter((e) => FINAL_REPAIRABLE.test(e)) };
  };
  let rw;
  try {
    rw = await api.rewriteRejected({
      questions, errors: faults, digest, language, gradeBand, quizId, lessonSummary, planned, topicOnly, partial: true, knownNames,
    });
  } catch (err) {
    record.status = 'error';
    return keep(String((err && err.message) || err).slice(0, 160));
  }
  record.asked = rw.indices || [];
  record.cost_usd = Number(rw.costUsd) || 0;
  if (!rw.attempted || !rw.merged) return keep(rw.error ? 'rewrite_failed' : 'nothing_usable');
  const fieldsFor = (i) => [...new Set(faults.filter((e) => qIndex(e) === i).flatMap(namedFields))];
  const namesOnly = (i) => faults.filter((e) => qIndex(e) === i).every((e) => NAME_FAULT.test(e));
  const candidate = questions.map((q, i) => ((rw.replaced || []).includes(i)
    ? (textOnlyRepair(q, rw.merged[i], fieldsFor(i), { namesOnly: namesOnly(i) }) || q) : q));
  const after = validate(candidate, { ...ctx, nExpected: candidate.length });
  const hard = after.errors.filter((e) => !SOFT_FAULT.test(String(e)));
  const inPlaceBefore = before.errors.filter((e) => FINAL_REPAIRABLE.test(e)).length;
  const inPlaceAfter = after.errors.filter((e) => FINAL_REPAIRABLE.test(e));
  if (hard.length) return keep('merged_set_invalid');
  if (inPlaceAfter.length >= inPlaceBefore) return keep('nothing_fixed');
  let figureUrls;
  let cardUrls;
  let drafted;
  try {
    drafted = toRows(quizId, after.questions);
    ({ figureUrls, cardUrls } = await renderFor(api, {
      questions: after.questions, rows: drafted, language, teacherId, quizId,
    }));
  } catch (err) {
    return keep('render_failed');
  }
  record.status = 'fixed';
  record.fixed = inPlaceBefore - inPlaceAfter.length;
  record.remaining = inPlaceAfter.length;
  attempts.push({ attempt: 'final_repair', indices: record.asked, replaced: rw.replaced, errors: inPlaceAfter });
  logEvent('transcript_quiz.final_repair', { quizId, ...record });
  return {
    record, changed: true, questions: after.questions, figureUrls, cardUrls, draftedRows: drafted, faults: inPlaceAfter, names: rw.names,
  };
}

/**
 * THE SUMMARY IS TRUE BY THE SUBJECT — a quiz written from a RECORDING.
 *
 * WHY. The teacher's sheet prints what the lesson covered — the one-liner, the
 * summary, the "what this quiz checks" line, and each card's objective — all
 * written from the recording, which can hold a mistake. Among real quizzes
 * that carried a wrong key, a good share printed the class's wrong fact on the
 * sheet as what was taught, while the quiz under it said the opposite. The
 * decision: the sheet stops asserting it; it does not
 * correct the teacher and nothing is sent to anyone.
 *
 * WHAT. One call on the verify model with NOTHING about the lesson
 * (transcript-quiz-summary-truth): a false line comes back rewritten if code
 * accepts the rewrite, else it is dropped. Runs after the blind solve, whose
 * notes on the keys it disagreed with (the fact by the subject — "the first
 * step of long division is divide") ride along as hints: on real
 * quizzes with a wrong key, the solve had already named the fact in most of the
 * lines a context-free check alone let through. A summary left with no
 * sentence falls back to the checked one-liner, then to a line naming only the
 * topic — never empty (the validator requires one, and the last repair
 * re-validates).
 *
 * FAIL-OPEN. A throw or an unusable reply ships the texts as authored,
 * recorded as `meta.summary_truth.status = 'error'` and logged at error.
 *
 * @returns {Promise<{record:object, lessonSummary:string|null, extras:object, slos?:object[]}>}
 */
/**
 * The facts the blind solve noted where it disagreed with a key — its note on
 * every flagged item (another answer, two answers, or none right), which names
 * the fact by the subject. Only notes: never the item, the key or a child.
 */
function answerCheckFindings(kvRecord) {
  const flagged = new Set(['disagree', 'ambiguous', 'none_correct']);
  return [...new Set(((kvRecord && kvRecord.disagreements) || [])
    .filter((d) => d && flagged.has(d.verdict) && String(d.note || '').trim())
    .map((d) => String(d.note).trim()))];
}

async function runSummaryTruth(api, {
  lessonSummary, extras, digest, language, quizId, quizSource, grade = null, topic = null, hints = [],
}) {
  const startedAt = Date.now();
  const record = {
    status: 'clean', model: null, checked: 0, flagged: 0, rewritten: 0, dropped: 0, missing: 0, cost_usd: 0, lines: [],
  };
  const finish = (out) => {
    record.latency_ms = Date.now() - startedAt;
    record.cost_usd = Math.round((Number(record.cost_usd) || 0) * 1e6) / 1e6;
    // Counts only — never a line of the summary (it can quote the lesson).
    logEvent('transcript_quiz.summary_truth', {
      quizId, quiz_source: quizSource, status: record.status, model: record.model, checked: record.checked,
      flagged: record.flagged, rewritten: record.rewritten, dropped: record.dropped, missing: record.missing,
      fallback: record.fallback || null, costUsd: record.cost_usd, latencyMs: record.latency_ms,
    });
    return { record, ...out };
  };
  let out;
  try {
    out = await api.checkSummaryTruth({
      lessonSummary: lessonSummary || '', extras: extras || {}, slos: (digest && digest.slos) || [],
      subject: digest && digest.subject, grade, hints,
    });
  } catch (err) {
    record.status = 'error';
    record.error = String((err && err.message) || err || 'unknown').slice(0, 200);
    logToFile('❌ transcript quiz: summary truth check failed — shipping the summary as authored (fail-open)', {
      quizId, quiz_source: quizSource, error: record.error,
    }, 'error');
    return finish({ lessonSummary, extras });
  }
  Object.assign(record, {
    hints: Array.isArray(hints) ? hints.length : 0,
    model: out.model || null, checked: out.checked || 0, flagged: out.flagged || 0, rewritten: out.rewritten || 0,
    dropped: out.dropped || 0, missing: out.missing || 0, cost_usd: Number(out.costUsd) || 0, lines: out.lines || [],
  });
  if (out.skipped) record.status = 'skipped';
  else if (record.flagged) record.status = 'fixed';
  let summary = out.lessonSummary;
  if (String(lessonSummary || '').trim() && !String(summary || '').trim()) {
    const short = out.extras && out.extras.lesson_summary_short;
    record.fallback = short ? 'short' : 'topic';
    summary = short || resolveUx('tqSummaryTopicOnly', { language, params: { topic: topic || (digest && digest.topic) || '' } });
  }
  return finish({ lessonSummary: summary, extras: out.extras, slos: out.slos });
}

/**
 * THE BLIND SOLVE — every lesson quiz's keys, whatever it was written from, held
 * against an independent solver's answers, after every authoring and repair step
 * (and after a plan quiz's key check) and before a single row is stored.
 *
 * WHY. A spelling quiz once keyed the letters of a word in the wrong order and
 * offered two options for another word that held the same four letters — two
 * right answers. The class report trusts the
 * key, so it told the teacher the misspelling was right and planned tomorrow's
 * drill on it. The key check cannot see this: a spelling is in no lesson source,
 * and a transcript quiz has no source to check at all.
 *
 * WHAT. One LLM call (`transcript-quiz-key-verify.service`, its own stronger
 * model) answers every item without its key; code compares. Then every item it
 * did not flag is solved AGAIN with nothing about the lesson (`withLesson:
 * false`): the summary is written from the recording and repeats a mistake made
 * in class, and on staging it talked the solver into agreeing that 4/8 is not a
 * proper fraction. An item the subject alone decides differently is flagged
 * like any other (`pass: 'bare'`); `unsure` there never blocks. An item it answers
 * differently (`disagree`), finds a second correct option in (`ambiguous`) or no
 * correct option in (`none_correct`) is re-authored ONCE through the same
 * targeted rewrite every other rejected question goes through, with the
 * disagreement as its complaint; the merged set goes through the whole validator
 * and only the rewritten items are solved again. What still disagrees is dropped
 * when the quiz keeps its floor (the salvage's own rule and re-validation);
 * otherwise the quiz fails as `key_disagreement`, persisted and told — never a
 * silent send. `unclear` never blocks.
 *
 * FAIL-OPEN, for the reason the key check is: a solver that throws, times out or
 * returns no answers ships the quiz exactly as authored — as every quiz shipped
 * before this step existed — logged at ERROR and recorded as
 * `meta.key_verify.status = 'error'`. A failed re-solve of a rewritten item
 * keeps the rewrite (it already passed the validator), recorded as
 * `recheck_error`.
 *
 * @returns {Promise<{record:object, changed?:boolean, failed?:boolean,
 *   questions?:object[], figureUrls?:object, cardUrls?:object, draftedRows?:object[],
 *   softFaults?:string[]|null}>}
 */
async function runKeyVerify(api, {
  questions, digest, language, quizId, teacherId, lessonSummary, gradeBand, grade, quizSource, attempts, knownNames = null,
}) {
  const KeyVerify = require('./transcript-quiz-key-verify.service');
  const startedAt = Date.now();
  const record = {
    status: 'clean', model: null, checked: questions.length, agreed: 0, disagreed: 0, ambiguous: 0, none_correct: 0,
    unclear: 0, missing: 0, fixed: 0, dropped: 0, cost_usd: 0, disagreements: [],
    // The second solve, without the lesson: how many it checked, and what it found.
    bare: {
      status: 'skipped', checked: 0, agreed: 0, flagged: 0, unclear: 0,
    },
    // The questions the full solve says ask the same fact: what it named, what
    // passed the contract in code, what the rewrite replaced, what shipped.
    same_fact: {
      returned: 0, confirmed: [], unconfirmed: [], fixed: [], shipped: [],
    },
  };
  const finish = (out) => {
    record.latency_ms = Date.now() - startedAt;
    record.cost_usd = Math.round(record.cost_usd * 1e6) / 1e6;
    logEvent('transcript_quiz.key_verify', {
      quizId, quiz_source: quizSource, status: record.status, model: record.model,
      checked: record.checked, agreed: record.agreed, disagreed: record.disagreed, ambiguous: record.ambiguous,
      none_correct: record.none_correct, unclear: record.unclear, missing: record.missing,
      fixed: record.fixed, dropped: record.dropped, costUsd: record.cost_usd, latencyMs: record.latency_ms,
      bareStatus: record.bare.status, bareChecked: record.bare.checked, bareFlagged: record.bare.flagged,
      sameFactReturned: record.same_fact.returned, sameFactConfirmed: record.same_fact.confirmed.length,
      sameFactFixed: record.same_fact.fixed.length,
    });
    return { record, ...out };
  };
  const failOpen = (what, err) => {
    const message = String((err && err.message) || err || 'unknown').slice(0, 200);
    logToFile(`❌ transcript quiz: key verify ${what} failed — shipping without it (fail-open)`, {
      quizId, quiz_source: quizSource, error: message,
    }, 'error');
    return message;
  };
  const solve = (qs, indices = null, withLesson = true, again = false) => api.verifyKeys({
    questions: qs, indices, language, grade, subject: digest.subject, digest, lessonSummary, quizId, withLesson, again,
  });
  const flagged = (v) => KeyVerify.FLAGGED.has(v.verdict);
  /**
   * The same items solved again WITHOUT the lesson — every one the first solve
   * did not flag. Returns the verdicts with the second solve's flags merged in
   * (a flag there replaces the first solve's agree/unsure), or the first
   * solve's verdicts untouched when the second one fails (fail-open, at error).
   *
   * "No option is right" and "two options are right" count at once: they are
   * what a mistake made in class leaves behind (the 4/8 item had no right
   * answer). "Another option is right" counts only if a second look — the same
   * items, the options in a different order — says so too: most first answers
   * of that kind were a slip between an option's position and its text (the
   * note said "'t' is silent" beside the position of "s").
   *
   * Replayed read-only on real quizzes: on a random sample of items it flags
   * very few (some real, some debatable, some wrong; the second look removed
   * most first answers of "another option"); on items whose key the class had
   * defended against the subject it flags most of them. The solve WITH the lesson had let such items through.
   */
  const withoutLesson = async (qs, verdicts, stats) => {
    const idx = verdicts.filter((v) => !flagged(v)).map((v) => v.index);
    if (!idx.length) return { verdicts, costUsd: 0 };
    try {
      const bare = await solve(qs, idx, false);
      let costUsd = Number(bare.costUsd) || 0;
      const byIndex = new Map(bare.verdicts.map((v) => [v.index, v]));
      const toConfirm = bare.verdicts.filter((v) => v.verdict === 'disagree').map((v) => v.index);
      let confirmed = new Set();
      if (toConfirm.length) {
        const again = await solve(qs, toConfirm, false, true);
        costUsd += Number(again.costUsd) || 0;
        confirmed = new Set(again.verdicts.filter(flagged).map((v) => v.index));
        if (stats) { stats.second_look = toConfirm.length; stats.confirmed = confirmed.size; }
      }
      const counts = (b) => b && flagged(b) && (b.verdict !== 'disagree' || confirmed.has(b.index));
      if (stats) {
        stats.status = 'ok';
        stats.checked += idx.length;
        bare.verdicts.forEach((v) => {
          if (counts(v)) stats.flagged += 1;
          else if (v.verdict === 'agree') stats.agreed += 1;
          else stats.unclear += 1;
        });
      }
      return {
        verdicts: verdicts.map((v) => {
          const b = byIndex.get(v.index);
          return counts(b) ? b : v;
        }),
        costUsd,
      };
    } catch (err) {
      const message = String((err && err.message) || err || 'unknown').slice(0, 200);
      logToFile('❌ transcript quiz: key verify without the lesson failed — keeping the solve with it (fail-open)', {
        quizId, quiz_source: quizSource, error: message,
      }, 'error');
      if (stats) { stats.status = 'error'; stats.error = message; }
      return { verdicts, costUsd: 0 };
    }
  };

  // ── 1. the solve ──────────────────────────────────────────────────────────
  let first;
  try {
    first = await solve(questions);
  } catch (err) {
    record.status = 'error';
    record.error = failOpen(err && err.code === 'NO_ANSWERS' ? 'reply' : 'call', err);
    return finish({ changed: false });
  }
  if (first.skipped) {
    record.status = first.skipped;
    record.checked = 0;
    return finish({ changed: false });
  }
  record.model = first.model || null;
  record.cost_usd += Number(first.costUsd) || 0;
  first.verdicts.forEach((v) => { if (v.missing) record.missing += 1; });
  // ── 1b. the same items, without the lesson ────────────────────────────────
  const second = await withoutLesson(questions, first.verdicts, record.bare);
  record.cost_usd += second.costUsd;
  const verdicts = second.verdicts;
  const COUNT = {
    agree: 'agreed', disagree: 'disagreed', ambiguous: 'ambiguous', none_correct: 'none_correct', unclear: 'unclear',
  };
  verdicts.forEach((v) => {
    if (COUNT[v.verdict]) record[COUNT[v.verdict]] += 1;
  });
  const bad = verdicts.filter(flagged);

  // ── 1c. the same fact asked twice ─────────────────────────────────────────
  // The full solve names the questions it reads as asking the same fact with
  // the same answer. On its own that is right about three times in five (it
  // pairs one template on another item, or two questions on one topic with
  // different answers), so only a pair that ALSO passes the contract in code —
  // the same answer, the same numbers and quoted items — is acted on: the later
  // question joins the rewrite below with the repeat's own complaint. The rest
  // are only logged. Never a reason to drop a question or fail the quiz.
  const named = Array.isArray(first.sameFact) ? first.sameFact : [];
  record.same_fact.returned = named.length;
  named.forEach(([i, j]) => {
    (confirmsSameFact(questions[i], questions[j]) ? record.same_fact.confirmed : record.same_fact.unconfirmed).push([i, j]);
  });
  const repeatAt = new Map();          // later question → the earlier one it repeats
  record.same_fact.confirmed.forEach(([i, j]) => { if (!repeatAt.has(j)) repeatAt.set(j, i); });
  const repeatComplaints = [...repeatAt].map(([j, i]) => solverDuplicateComplaint(questions, i, j));
  if (named.length) {
    logEvent('transcript_quiz.duplicate_question', {
      quizId, stage: 'solver', quiz_source: quizSource, questions: repeatAt.size, indices: [...repeatAt.keys()],
      confirmed: record.same_fact.confirmed, unconfirmed: record.same_fact.unconfirmed,
    });
  }
  const repeatLeft = () => repeatComplaints.filter((e) => repeatAt.has(Number(/^q(\d+)/.exec(e)[1])));
  if (!bad.length && !repeatAt.size) return finish({ changed: false });

  const complaints = bad.map((v) => KeyVerify.disagreementComplaint(v, questions[v.index]));
  record.disagreements = bad.map((v) => ({
    index: v.index,
    verdict: v.verdict,
    pass: v.pass === 'bare' ? 'bare' : 'lesson',
    keyed: KeyVerify.optionText(questions[v.index], v.keyed).slice(0, 120),
    blind: KeyVerify.optionText(questions[v.index], v.blind || []).slice(0, 120),
    note: String(v.note || '').slice(0, 200),
  }));
  attempts.push({
    attempt: 'key_verify', model: record.model, cost_usd: first.costUsd || null, latency_ms: first.latencyMs || null, errors: [...complaints, ...repeatComplaints],
  });
  if (bad.length) {
    logToFile('⚠️ transcript quiz: a blind solver disagrees with answer keys', {
      quizId, quiz_source: quizSource, indices: bad.map((v) => v.index), verdicts: bad.map((v) => v.verdict),
    });
  }

  // ── 2. ONE targeted rewrite, with the disagreement as the complaint ────────
  // A key that is not true outranks a repeat for the five places (rewriteTargets
  // tiers KEY_* first); a repeat left out ships, recorded.
  const stillBad = new Set(bad.map((v) => v.index));
  let current = questions;
  let softFaults = null;
  const rw = await api.rewriteRejected({
    // More than five flagged keys: the worst five are rewritten, the rest dropped below.
    questions, errors: [...complaints, ...repeatComplaints], digest, language, gradeBand, quizId, lessonSummary, planned: quizSource !== TRANSCRIPT, topicOnly: quizSource === TOPIC, knownNames, partial: true,
  });
  if (rw.attempted) {
    record.cost_usd += Number(rw.costUsd) || 0;
    let verrs = null;
    const replacedBad = (rw.replaced || []).filter((i) => stillBad.has(i));
    const replacedRepeat = (rw.replaced || []).filter((i) => repeatAt.has(i));
    if (rw.merged && (replacedBad.length || replacedRepeat.length)) {
      const v = validate(rw.merged, {
        language, subject: digest.subject, digest, nExpected: questions.length, lessonSummary, quizId,
      });
      verrs = v.errors;
      // The same bar every other shipped set meets: no hard fault left.
      if (v.errors.every((e) => SOFT_FAULT.test(String(e)))) {
        let again = new Set();
        if (replacedBad.length) {
          try {
            const re = await solve(v.questions, replacedBad);
            record.cost_usd += Number(re.costUsd) || 0;
            // A rewrite is held to both solves, as the item it replaces was.
            const reBare = await withoutLesson(v.questions, re.verdicts, null);
            record.cost_usd += reBare.costUsd;
            again = new Set(reBare.verdicts.filter(flagged).map((x) => x.index));
          } catch (err) {
            record.recheck_error = failOpen('re-solve', err);
          }
        }
        current = v.questions;
        softFaults = v.errors.length ? v.errors : null;
        replacedBad.forEach((i) => {
          if (again.has(i)) return;
          stillBad.delete(i);
          record.fixed += 1;
        });
        replacedRepeat.forEach((i) => {
          repeatAt.delete(i);
          record.same_fact.fixed.push(i);
        });
      }
    }
    attempts.push({
      attempt: 'rewrite', after: 'key_verify', indices: rw.indices, replaced: rw.replaced,
      model: rw.model || null, cost_usd: rw.costUsd || null, latency_ms: rw.latencyMs || null,
      errors: verrs || [rw.error || 'the rewrite returned no usable replacement'],
    });
    logEvent('transcript_quiz.rewrite_attempted', {
      quizId, after: 'key_verify', indices: rw.indices, replaced: rw.replaced, ok: stillBad.size === 0 && repeatAt.size === 0, errors: verrs ? verrs.length : null,
    });
  }
  // A repeat the rewrite did not replace ships, recorded (never dropped).
  record.same_fact.shipped = [...repeatAt.keys()].sort((a, b) => a - b);
  // Only repeats, and the rewrite changed nothing: the quiz ships as it is.
  if (!bad.length && current === questions) {
    return finish({ changed: false, repeatFaults: repeatLeft() });
  }

  // ── 3. drop what still disagrees, or fail ──────────────────────────────────
  const ctx = { language, subject: digest.subject, digest, quizId, lessonSummary };
  const dropFrom = (set, indices) => {
    if (!indices.length) return { questions: set, dropped: [], softFaults };
    const errs = indices.map((i) => `q${i}: KEY_DISAGREEMENT — a blind solver still disagrees with the key`);
    const s = salvageWithoutBadFigures(set, errs, ctx);
    if (!s || s.refused) {
      record.refused = (s && s.refused) || 'nothing could be dropped';
      return null;
    }
    return { questions: s.questions, dropped: s.dropped, softFaults: (s.softFaults && s.softFaults.length) ? s.softFaults : null };
  };
  const allBad = bad.map((v) => v.index);
  const remaining = () => [...stillBad].sort((a, b) => a - b);
  const candidates = [{ gone: remaining(), make: () => dropFrom(current, remaining()) }];
  // Only if the repaired set cannot be DRAWN: the solved set minus every
  // flagged item. (When nothing was repaired it is the same set — not retried.)
  if (current !== questions) candidates.push({ gone: allBad, repairsLost: true, make: () => dropFrom(questions, allBad) });
  for (const { gone, repairsLost, make } of candidates) {
    const cand = make();
    if (!cand) continue;
    try {
      const drafted = toRows(quizId, cand.questions);
      // eslint-disable-next-line no-await-in-loop
      const { figureUrls, cardUrls } = await renderFor(api, {
        questions: cand.questions, rows: drafted, language, teacherId, quizId,
      });
      if (repairsLost) {
        record.fixed = 0;
        record.same_fact.fixed = [];
        record.same_fact.shipped = [...new Set(record.same_fact.confirmed.map(([, j]) => j))].sort((a, b) => a - b);
      }
      record.dropped = cand.dropped.length;
      // keys that were all true stay 'clean'; the repeats have their own record
      record.status = !bad.length ? 'clean' : (cand.dropped.length ? 'dropped' : 'fixed');
      record.disagreements.forEach((d) => { d.outcome = gone.includes(d.index) ? 'dropped' : 'fixed'; });
      attempts.push({ attempt: 'key_verify_result', status: record.status, dropped: cand.dropped, errors: cand.softFaults || [] });
      return finish({
        changed: true, questions: cand.questions, figureUrls, cardUrls, draftedRows: drafted, softFaults: cand.softFaults,
        repeatFaults: repairsLost ? repeatComplaints : repeatLeft(),
      });
    } catch (figErr) {
      record.render_error = String(figErr.message || figErr).slice(0, 200);
      logToFile('❌ transcript quiz: the blind-solved set could not be drawn', { quizId, error: record.render_error }, 'error');
    }
  }
  record.status = 'failed';
  record.disagreements.forEach((d) => { d.outcome = stillBad.has(d.index) ? 'failed' : 'fixed'; });
  return finish({ failed: true });
}

/**
 * THE RUN CLAIM. A quiz_generate job can arrive twice — a Standard queue is
 * at-least-once, and a run longer than its lease is handed to a second
 * worker — and both runs would make the quiz: two share codes, two PDFs, two
 * links. Before any work the run stamps `meta.run_ms` with a compare-and-set
 * on the value it read (null, or a claim older than the stale window: a run
 * that died). Whoever loses the race exits. `->>` reads text, so the stamp is
 * stored as a string.
 */
async function claimRun(quiz) {
  const meta = quiz.meta || {};
  const held = meta.run_ms != null ? String(meta.run_ms) : null;
  const now = Date.now();
  if (held && now - Number(held) < staleMs()) return { claimed: false };
  const ms = String(now);
  const next = { ...meta, run_ms: ms };
  let q = supabase.from('quizzes').update({ meta: next }).eq('id', quiz.id).eq('status', quiz.status);
  q = held ? q.eq('meta->>run_ms', held) : q.is('meta->>run_ms', null);
  const { data, error } = await q.select('id');
  if (error) throw new Error(`transcript quiz: run claim failed: ${error.message}`);
  if (Array.isArray(data) ? !data.length : !data) return { claimed: false };
  return { claimed: true, ms, meta: next, tookOver: Boolean(held) };
}

/**
 * Hand the claim back when the run ends — however it ends. A row still being
 * made (a throw, which the queue redelivers) must not read as "a run is
 * live", and a failed row that is later remade carries its meta over.
 */
async function releaseRun(quizId, ms) {
  try {
    const { data } = await supabase.from('quizzes').select('meta').eq('id', quizId).maybeSingle();
    if (!data || !data.meta || String(data.meta.run_ms) !== ms) return;
    const { run_ms: _done, ...rest } = data.meta;
    await supabase.from('quizzes').update({ meta: rest }).eq('id', quizId).eq('meta->>run_ms', ms);
  } catch (err) {
    logToFile('⚠️ transcript quiz: run claim not released (it expires)', { quizId, error: err.message });
  }
}

/** The generate step (the `quiz_generate` job). */
async function process(quizId, payload = {}) {
  // Switched off in the console after the job was queued: exit quietly. The
  // row stays as it is; /quiz can make it again once the switch is back on.
  if (paused()) {
    logEvent('transcript_quiz.generate_skipped', { quizId, reason: 'paused' });
    return { skipped: 'paused' };
  }
  const run = { ms: null };
  try {
    return await processQuiz(quizId, payload || {}, run);
  } finally {
    if (run.ms) await releaseRun(quizId, run.ms);
  }
}

async function processQuiz(quizId, payload, run = {}) {
  const api = module.exports;
  const { data: found, error } = await supabase.from('quizzes')
    .select('id, teacher_id, coaching_session_id, lesson_plan_id, quiz_source, topic, subject, language, status, meta, grade')
    .eq('id', quizId).maybeSingle();
  let quiz = found;
  if (error || !quiz) {
    logToFile('⚠️ transcript quiz: generate — quiz not found', { quizId, error: error?.message });
    return { skipped: 'quiz_not_found' };
  }
  if (quiz.status === 'sent' || quiz.status === 'report_sent') return { skipped: 'already_sent' };
  if (!['generating', 'ready', 'offered'].includes(quiz.status)) return { skipped: `status_${quiz.status}` };

  const claim = await claimRun(quiz);
  if (!claim.claimed) {
    logEvent('transcript_quiz.generate_skipped', { quizId, reason: 'already_running' });
    return { skipped: 'already_running' };
  }
  run.ms = claim.ms;
  // A copy: the row as claimed, never an edit of the object that was read.
  quiz = { ...quiz, meta: claim.meta };
  if (claim.tookOver) logToFile('⚠️ transcript quiz: a stale run was taken over', { quizId });

  // ── WHAT THE QUIZ IS WRITTEN FROM ─────────────────────────────────────────
  // A transcript quiz has a coaching session. A plan quiz (lp_generated) and a
  // topic quiz have none — one is written from a lesson PLAN the bot made for
  // the teacher, the other from the topic they typed — so the teacher comes
  // from quizzes.teacher_id and the "session" is only the lesson date, which is
  // all the hand-off ever reads from one.
  const quizSource = quiz.quiz_source || TRANSCRIPT;
  const isPlan = isPlanQuiz(quizSource);
  const isTopic = quizSource === TOPIC;
  // No recording, no coaching session: nobody heard this lesson.
  const isLp = isPlan || isTopic;
  // Written from a name alone — a typed topic, or a plan whose text could not
  // be had (set once the source is resolved, below).
  let topicOnly = isTopic;
  let session;
  let user;
  if (isLp) {
    const { data: teacher } = await supabase.from('users')
      .select(LP_USER_SELECT).eq('id', quiz.teacher_id).maybeSingle();
    if (!teacher) {
      await updateQuiz(quizId, { status: 'failed', meta: { ...(quiz.meta || {}), step: 'failed', error: 'teacher_missing' } });
      logEvent('transcript_quiz.failed', { quizId, reason: 'teacher_missing', quiz_source: quizSource });
      // No number to tell: the teacher's row is gone.
      Funnel.emit('generation_failed', { quiz_id: quizId, source: quizSource, reason: 'teacher_missing' });
      return { failed: true, reason: 'teacher_missing' };
    }
    user = teacher;
    session = lessonSessionFor(quiz);
  } else {
    const { data: found, error: sessionErr } = await supabase.from('coaching_sessions')
      .select(SESSION_SELECT).eq('id', quiz.coaching_session_id).maybeSingle();
    // A read that ERRORED is not a missing session. This select once
    // still joined a column a migration had dropped: PostgREST answered with an error,
    // `data` was null, and quizzes whose sessions all existed were written
    // `session_missing` — no event, and nothing said to a teacher already told
    // "making it now". The error now throws, so the queue redelivers the job, as
    // for every other database error in this step.
    if (sessionErr) {
      logToFile('❌ transcript quiz: coaching session read failed in generate', {
        quizId, code: sessionErr.code || null, error: sessionErr.message,
      }, 'error');
      throw new Error(`transcript quiz: coaching session read failed: ${sessionErr.message}`);
    }
    if (!found) {
      // Really gone. A failure like every other: persisted, an event, and the
      // teacher — who was told the quiz is being made — is told it is not.
      await updateQuiz(quizId, { status: 'failed', meta: { ...(quiz.meta || {}), step: 'failed', error: 'session_missing' } });
      const { data: owner, error: ownerErr } = await supabase.from('users')
        .select('phone_number, preferred_language').eq('id', quiz.teacher_id).maybeSingle();
      // Unreadable teacher: the job's own phone still reaches them, in the floor language.
      if (ownerErr) logToFile('⚠️ transcript quiz: teacher unreadable while failing session_missing', { quizId, error: ownerErr.message });
      const to = payload.phone || (owner && owner.phone_number);
      const lang = teacherLanguageFor({ preferredLanguage: owner && owner.preferred_language });
      if (to) {
        await tellTeacherFailed(to, lang, quizId, 'session_missing', quizSource, { step: 'session' });
      } else {
        logEvent('transcript_quiz.failed', { quizId, reason: 'session_missing', quiz_source: quizSource, step: 'session' });
        Funnel.emit('generation_failed', { quiz_id: quizId, source: quizSource, reason: 'session_missing', step: 'session' });
      }
      return { failed: true, reason: 'session_missing' };
    }
    session = found;
    user = session.users || {};
  }
  const phone = payload.phone || user.phone_number;
  const teacherLang = teacherLanguageFor({ preferredLanguage: user.preferred_language });
  const teacherName = user.name || null;
  let meta = { ...(quiz.meta || {}) };
  // Where the quiz was born — rides on every funnel stage this step writes.
  const funnel = { quiz_id: quizId, teacher_id: quiz.teacher_id, source: quizSource, channel: Funnel.channelOf(meta.source) };
  // A quiz resuming at the hand-off has already been generated; only real work
  // counts as a start. A redelivered job starts again — count distinct quiz_id.
  if (!(quiz.status === 'ready' && meta.step === 'ready')) Funnel.emit('generation_started', funnel);

  // THE RUNAWAY GUARD (quiz-daily-cap): at most QUIZ_DAILY_CAP quizzes made per
  // teacher per day, both streams, counted here where every path meets and before
  // any model call. A quiz resuming at the hand-off was already counted.
  // An unregistered account may have a lower allowance (DAILY_QUIZ_CAP_UNREGISTERED).
  if (!(quiz.status === 'ready' && meta.step === 'ready')) {
    const capped = await DailyCap.claim(quiz.teacher_id, quizId, { tierCap: await unregisteredQuizCap(quiz.teacher_id) });
    if (!capped.allowed) {
      const failedMeta = { ...meta, step: 'failed', error: 'daily_cap' };
      await updateQuiz(quizId, { status: 'failed', meta: failedMeta });
      await tellTeacherFailed(phone, teacherLang, quizId, 'daily_cap', quizSource, { step: 'cap', count: capped.count, limit: capped.limit }, failedMeta);
      return { failed: true, reason: 'daily_cap' };
    }
  }

  // The plan or topic is needed wherever the author still has to run; a quiz
  // resuming at the hand-off (`ready`/`ready`) has its questions and does not.
  let lessonSource = null;
  if (isLp && !(quiz.status === 'ready' && meta.step === 'ready')) {
    lessonSource = await resolveLessonSource(quiz);
    topicOnly = PlanDigest.digestMode(lessonSource) === 'topic';
    if (!lessonSource) {
      await updateQuiz(quizId, { status: 'failed', meta: { ...meta, step: 'failed', error: 'source_missing' } });
      await tellTeacherFailed(phone, teacherLang, quizId, 'source_missing', quizSource);
      return { failed: true, reason: 'source_missing' };
    }
  }

  // A plan with no grade or subject of its own lends the row the plan's.
  if (lessonSource) {
    quiz.grade = quiz.grade || lessonSource.grade || null;
    quiz.subject = quiz.subject || lessonSource.subject || null;
  }

  // A quiz born of a RECORDING is written from its transcript, and the offer
  // and /quiz (list and Flow) never reach here with one shorter than
  // MIN_TRANSCRIPT_CHARS. The contract is asserted here as well, BEFORE any
  // model call (root rule 24c), so a transcript that cannot carry a quiz is
  // named for what it is — source_unusable, the one failure where "the
  // transcript didn't carry enough" is true — and never spends a digest and
  // three authoring attempts to be reported as the model's failure.
  if (!isLp && !(quiz.status === 'ready' && meta.step === 'ready')) {
    const chars = String(session.transcript_text || '').length;
    if (chars < MIN_TRANSCRIPT_CHARS) {
      await updateQuiz(quizId, {
        status: 'failed',
        meta: { ...meta, step: 'failed', error: 'source_unusable', error_detail: `transcript: ${chars} chars, below ${MIN_TRANSCRIPT_CHARS}` },
      });
      await tellTeacherFailed(phone, teacherLang, quizId, 'source_unusable', quizSource, { step: 'source', transcriptChars: chars });
      return { failed: true, reason: 'source_unusable' };
    }
  }

  // ── digest (already there when the offer path claimed the row; /quiz path lands here without one)
  if (!meta.digest) {
    // A plan or topic quiz's language is settled from the row's subject BEFORE
    // the digest (the digest writes its SLO statements for it); with no
    // recording there is no lesson language to break a tie.
    const lpLanguage = isLp ? (quiz.language || quizLanguageFor(quiz.subject, null)) : null;
    // ONLY the digest call is caught here. What it throws is either the plan
    // having no lesson in it (source_unusable) or the model/provider giving
    // nothing usable (model_failed) — and the teacher is told which. A database
    // error writing the result below is neither: it throws, so the queue
    // redelivers the job, exactly as a lesson-plan read error does.
    let r;
    try {
      r = isLp
        ? await PlanDigest.run({
          source: lessonSource, language: lpLanguage, grade: quiz.grade, subject: quiz.subject, quizSource,
        })
        : await Digest.run({ session, user });
    } catch (err) {
      const reason = digestFailureReason(err);
      logToFile('❌ transcript quiz: digest failed in generate', { quizId, reason, code: err.code || null, error: err.message }, 'error');
      await updateQuiz(quizId, {
        status: 'failed',
        meta: { ...meta, step: 'failed', error: reason, error_detail: `digest: ${err.message}` },
      });
      await tellTeacherFailed(phone, teacherLang, quizId, reason, quizSource, { step: 'digest' });
      return { failed: true, reason };
    }
    meta = { ...meta, digest: r.digest, grade: r.grade, grade_source: r.gradeSource, lp_hint: r.lpHint,
      digest_model: r.model, cost_usd: (meta.cost_usd || 0) + (r.costUsd || 0) };
    // The teacher's own choice, stored on the row when the language ask was
    // answered, outranks the subject rule. The rule is what a legacy row (or
    // a skipped ask) falls back to.
    const language = lpLanguage || quiz.language || quizLanguageFor(r.digest.subject, session.transcript_language);
    quiz.language = language;
    quiz.subject = r.digest.subject;
    quiz.topic = topicFor(r.digest, language) || quiz.topic;
    quiz.grade = r.grade || quiz.grade;
    await updateQuiz(quizId, { topic: quiz.topic || 'Lesson', subject: quiz.subject, language, grade: r.grade || null, meta: { ...meta, step: 'author' } });
  }
  // `let`: the summary truth check replaces its SLO statements (a new object,
  // never an edit of the row that was read).
  let digest = meta.digest;
  const language = quiz.language || quizLanguageFor(digest.subject, session.transcript_language);
  // A complaint logged by the authoring loop can quote a person's name (a
  // URDU_NAME_LATIN line, a rejected teacher note): each is logged hashed (D4).
  const redactLog = logRedactor(digest, nameLexicon(digest).lessonWords);

  // ── author + validate + store
  let questions = null;
  let figureUrls = {};
  let cardUrls = {};
  let draftedRows = null;
  if (quiz.status !== 'ready' || meta.step !== 'ready') {
    let previousErrors = null;
    let lastRejected = null;
    let lastErrors = null;
    let lastRewriteErrors = null;   // the complaint list the loop already rewrote
    let rewritten = null;           // the best failed-rewrite candidate for the salvage
    let lastLessonSummary = null;
    let lastExtras = {};
    let readyLessonSummary = null;
    // The Urdu spelling of each person's name the repair has given for this
    // quiz ({ "Hira": "حرا" }). Every later rewrite writes the name that way
    // too: replayed, the blind solve's rewrite put "Hira" back into a teacher
    // note of a quiz that had already learned «حرا».
    const nameSpellings = {};
    const attempts = [];
    const attemptsAllowed = maxAttempts();
    // How many author attempts came back with ANY questions to judge. Zero means
    // the model never gave a usable reply (empty, cut off or unparseable after
    // completeJson's retry, or a refused call) — that is model_failed, not
    // "the questions didn't come out clear enough".
    let authorReplies = 0;
    for (let attempt = 1; attempt <= attemptsAllowed; attempt += 1) {
      let out;
      try {
        out = await Author.author({
          digest, transcript: isLp ? null : session.transcript_text, language, n: N_QUESTIONS,
          gradeBand: digest.grade_band || meta.grade, previousErrors, quizId,
          // A plan or topic quiz has no transcript: the author reads the plan
          // (or the one line naming the topic) in the excerpts' place.
          ...(isLp ? { lessonPlan: PlanDigest.lessonExcerpts(lessonSource), topicOnly } : {}),
        });
      } catch (err) {
        attempts.push({ attempt, error: err.message });
        previousErrors = [`the previous reply was not valid JSON (${err.code || err.message})`];
        continue;
      }
      authorReplies += 1;
      lastLessonSummary = out.lessonSummary;
      lastExtras = out.extras || lastExtras;
      let v = validate(out.questions, {
        language, subject: digest.subject, digest, nExpected: N_QUESTIONS, lessonSummary: out.lessonSummary, quizId,
      });
      attempts.push({ attempt, model: out.model, cost_usd: out.costUsd, latency_ms: out.latencyMs, errors: v.errors });
      meta.cost_usd = (meta.cost_usd || 0) + (out.costUsd || 0);
      // ── TEACHER FIELDS ARE REPAIRED IN PLACE, NEVER RE-ROLLED ─────────────
      // "selected_because" and the distractor meanings are printed on the
      // teacher's Urdu page and never reach a child; a fault in them is not a
      // fault in the question. One small call rewrites exactly those fields
      // (any count), and the attempt continues with whatever complaints remain.
      // eslint-disable-next-line no-await-in-loop
      const tfAuthor = await repairTeacherFields({ questions: out.questions, v, lessonSummary: out.lessonSummary, after: attempt });
      if (tfAuthor) {
        out.questions = tfAuthor.questions;
        v = tfAuthor.v;
      }
      // The same question asked twice is counted on every attempt it appears
      // in, whatever else is wrong with the attempt: the author prompt is what
      // should stop it, and this is its rate (stage "author"; what finally
      // ships is counted again, below, as stage "shipped").
      const repeated = v.ok ? [] : v.errors.filter((e) => DUPLICATE_FAULT.test(String(e)));
      if (repeated.length) {
        logEvent('transcript_quiz.duplicate_question', {
          quizId, stage: 'author', after: attempt, questions: repeated.length, indices: repeated.map((e) => Number(/^q(\d+)/.exec(e)[1])),
        });
      }
      // ── IN-PLACE FAULTS: REPAIRED IN PLACE, THEN SHIPPED ─────────────────
      // When the only complaints left are verbs that speak to the child with a
      // gender, two English terms side by side, or a question the quiz already
      // asked, one targeted rewrite is asked to change exactly those words (or,
      // for the repeat, that one question). Whatever it leaves, the quiz is
      // not re-rolled for it: a clean repair ships from runRewrite, and
      // otherwise THIS attempt ships as it stands, through the same picture and
      // render checks as a clean attempt, with the faults recorded. Tried on
      // every attempt, the last included.
      let addressFaults = null;
      if (!v.ok && inPlaceOnly(v.errors)) {
        const indicesOf = (errs) => errs.map((e) => Number(/^q(\d+)/.exec(e)[1]));
        const address = v.errors.filter((e) => ADDRESS_FAULT.test(e));
        const adjacent = v.errors.filter((e) => ADJACENT_FAULT.test(e));
        if (address.length) {
          logEvent('transcript_quiz.child_address', { quizId, after: attempt, questions: address.length, indices: indicesOf(address) });
        }
        if (adjacent.length) {
          logEvent('transcript_quiz.adjacent_terms', { quizId, after: attempt, questions: adjacent.length, indices: indicesOf(adjacent) });
        }
        const latin = v.errors.filter((e) => NAME_FAULT.test(e));
        if (latin.length) {
          logEvent('transcript_quiz.latin_name_found', {
            quizId, after: attempt, questions: [...new Set(indicesOf(latin))].length, indices: [...new Set(indicesOf(latin))],
            // how many names, never the names (data standard D4: no names in logs)
            names: new Set(latin.map((e) => /"([^"]+)"/.exec(e)[1])).size,
          });
        }
        // The picture is asked for on the first attempt of a drawable lesson
        // whatever the text faults are: that retry is the picture path, and a
        // text repair that shipped this attempt used to skip it (the quiz went
        // out with no picture). The attempt is re-authored for its picture, so
        // repairing its words first would be thrown away: they are repaired on
        // the attempt that comes back.
        const needsPicture = Boolean(figureRequiredError({
          questions: v.questions, subject: digest.subject, attempt, maxAttempts: attemptsAllowed,
          gradeBand: digest.grade_band || meta.grade,
        }));
        if (!needsPicture) {
          // eslint-disable-next-line no-await-in-loop
          const fixed = await runRewrite({ rejected: out.questions, errors: v.errors, summary: out.lessonSummary, when: attempt, partial: 'in_place' });
          if (fixed.ok) break;
        }
        addressFaults = v.errors;
        v = { ...v, ok: true };
      }
      if (v.ok) {
        const needFig = figureRequiredError({
          questions: v.questions, subject: digest.subject, attempt, maxAttempts: attemptsAllowed,
          gradeBand: digest.grade_band || meta.grade,
        });
        if (needFig) {
          attempts[attempts.length - 1].errors = [needFig, ...(addressFaults || [])];
          logToFile('⚠️ transcript quiz: drawable lesson came back without a picture', { quizId, attempt });
          previousErrors = [needFig, ...(addressFaults || [])];
          lastRejected = out.questions;
          lastErrors = [needFig];
          continue;
        }
        // The pictures are made BEFORE any row is stored: a figure that cannot
        // be drawn, screenshotted or uploaded fails this attempt exactly as a
        // validator complaint does, and the model is told which question and why.
        try {
          const drafted = toRows(quizId, v.questions);
          [figureUrls, cardUrls] = await Promise.all([
            api.renderFigures({ questions: v.questions, language, teacherId: quiz.teacher_id, quizId }),
            api.renderCards({ rows: drafted, questions: v.questions, language, teacherId: quiz.teacher_id, quizId }),
          ]);
          draftedRows = drafted;
        } catch (figErr) {
          attempts[attempts.length - 1].errors = [figErr.message];
          logToFile('⚠️ transcript quiz: attempt failed on a figure', { quizId, attempt, error: figErr.message });
          previousErrors = [figErr.message];
          continue;
        }
        questions = v.questions;
        readyLessonSummary = out.lessonSummary;
        if (addressFaults) {
          meta.soft_faults = addressFaults;
          attempts.push({ attempt: 'soft_ship', after: attempt, errors: addressFaults });
          logEvent('transcript_quiz.shipped_with_soft_faults', { quizId, faults: addressFaults.length, kinds: faultKinds(addressFaults) });
        }
        break;
      }
      // the complaints can quote a person's name: logged with it hashed (D4)
      logToFile('⚠️ transcript quiz: validator rejected attempt', { quizId, attempt, errors: redactLog(v.errors.slice(0, 8)) });
      previousErrors = v.errors;
      lastRejected = out.questions;
      lastErrors = v.errors;
      // ── REPAIR BEFORE RE-ROLL ───────────────────────────────────────────
      // When every complaint of THIS attempt belongs to one question (a long
      // option, a missing "why", one pedagogy or figure fault), one small
      // rewrite is cheaper and surer than a second full author call — and a
      // second full call can come back with a complaint nothing can repair
      // (seen on a real quiz: attempt 1 = one long option, attempt 2 = a
      // level-mix fault on the whole set; the quiz died although attempt 1
      // was one shortened option away from shipping). The rewrite is tried
      // on every attempt but the last; the last one is handled below.
      if (attempt < attemptsAllowed) {
        // eslint-disable-next-line no-await-in-loop
        const early = await runRewrite({ rejected: out.questions, errors: v.errors, summary: out.lessonSummary, when: attempt, partial: 'in_place' });
        if (early.ok) break;
        if (early.tried) {
          lastRewriteErrors = lastErrors;
          previousErrors = early.errors && early.errors.length ? early.errors : v.errors;
        }
      }
    }
    // ── A TARGETED REWRITE BEFORE THE SALVAGE ───────────────────────────────
    // The last full attempt failed. When every remaining complaint belongs to
    // one question and at most three questions are involved, a full re-roll is
    // the wrong move — it has already been tried once and the model wrote the
    // same rejected question again (real quizzes shipped 7 and 6 of 8 that
    // way). ONE small call rewrites exactly those
    // questions; the merged set goes through the whole validator again.
    // (Skipped when the loop already rewrote exactly these complaints.)
    if (!questions && lastRejected && lastErrors && lastRewriteErrors !== lastErrors) {
      // The last chance: the worst five even when more need re-asking, then the salvage.
      await runRewrite({ rejected: lastRejected, errors: lastErrors, summary: lastLessonSummary, when: 'last', partial: true });
    }
    // ── the teacher-fields repair, shared by the author loop and every rewrite ─
    // Runs on a set whose complaints include URDU_TEACHER_FIELDS, AFTER whatever
    // wrote that set: the author (after = the attempt number) or a targeted
    // rewrite (after = 'rewrite', rewrite_after = that rewrite's own `after`).
    // It used to run after the author only, so a rewrite that wrote its
    // replacements' notes in English — which the recorded rewrites did, five of
    // five — left the set failing on the teacher's page alone and the attempt
    // was thrown away. Returns the repaired set and its validation, or null
    // when there was nothing to repair or the call gave nothing usable.
    async function repairTeacherFields({
      questions: qs, v: before, lessonSummary, after, rewriteAfter,
    }) {
      const Rw = require('./transcript-quiz-rewrite');
      if (!before || before.ok || !Rw.teacherFieldTargets(before.errors).length) return null;
      const tf = await api.rewriteTeacherFields({ questions: qs, errors: before.errors, digest, language, quizId });
      if (!tf.attempted) return null;
      meta.cost_usd = (meta.cost_usd || 0) + (tf.costUsd || 0);
      const v = tf.merged
        ? validate(tf.merged, {
          language, subject: digest.subject, digest, nExpected: N_QUESTIONS, lessonSummary, quizId,
        })
        : before;
      attempts.push({
        attempt: 'teacher_fields', after, ...(rewriteAfter !== undefined ? { rewrite_after: rewriteAfter } : {}),
        indices: tf.indices, replaced: tf.replaced, model: tf.model || null, cost_usd: tf.costUsd || null, latency_ms: tf.latencyMs || null,
        errors: tf.merged ? v.errors : [tf.error || 'the repair returned nothing usable'],
      });
      logEvent('transcript_quiz.teacher_fields_repaired', {
        quizId, after, ...(rewriteAfter !== undefined ? { rewrite_after: rewriteAfter } : {}),
        indices: tf.indices, ok: Boolean(tf.merged) && !Rw.teacherFieldTargets(v.errors).length, remaining: v.errors.length,
      });
      return tf.merged ? { questions: tf.merged, v } : null;
    }

    // ── the rewrite, shared by the loop and the post-loop fallback ───────────
    async function runRewrite({
      rejected, errors, summary, when, partial = false,
    }) {
      // ONE call repairs at most five questions. When more were faulted, the
      // worst five go first (rewriteTargets), the merged set is validated
      // again, and whatever it still names gets ONE second batch — never a
      // third (REPAIR_BATCHES). The second batch runs only when the first left
      // questions out and produced a set to build on.
      let rw = null;
      let v = null;
      let merged = null;              // the rewritten set, after its teacher notes are repaired
      let rwSummary = summary;
      let base = rejected;
      let baseErrors = errors;
      let prefer = [];
      for (let batch = 1; batch <= REPAIR_BATCHES; batch += 1) {
        // eslint-disable-next-line no-await-in-loop
        const next = await api.rewriteRejected({
          questions: base, errors: baseErrors, digest, language,
          gradeBand: digest.grade_band || meta.grade, quizId, lessonSummary: rwSummary,
          // A rejected plan or topic summary is rewritten in its own voice, never "you taught".
          planned: isLp,
          topicOnly,
          knownNames: nameSpellings,
          partial,
          prefer,
        });
        if (!next.attempted) {
          if (batch === 1) return { tried: false, ok: false, errors: null };
          break;
        }
        rw = next;
        Object.assign(nameSpellings, rw.names || {});
        meta.cost_usd = (meta.cost_usd || 0) + (rw.costUsd || 0);
        // the rewrite may also return a repaired `lesson_summary`
        // (a gendered reference to the teacher is the one quiz-level complaint
        // it is asked to fix). It is the summary the merged set is VALIDATED
        // with and the one that is stored, so the two cannot disagree.
        rwSummary = rw.lessonSummary || rwSummary;
        merged = rw.merged;
        v = merged
          ? validate(merged, {
            language, subject: digest.subject, digest, nExpected: N_QUESTIONS, lessonSummary: rwSummary, quizId,
          })
          : null;
        attempts.push({
          attempt: 'rewrite',
          after: when,
          batch,
          indices: rw.indices,
          deferred: rw.deferred && rw.deferred.length ? rw.deferred : undefined,
          replaced: rw.replaced,
          model: rw.model || null,
          cost_usd: rw.costUsd || null,
          latency_ms: rw.latencyMs || null,
          errors: v ? v.errors : [rw.error || 'the rewrite returned no usable replacement'],
        });
        // The teacher-fields repair runs LAST — after the rewrite, on what the
        // rewrite wrote — so a replacement's English note never decides the set.
        // eslint-disable-next-line no-await-in-loop
        const tf = merged ? await repairTeacherFields({
          questions: merged, v, lessonSummary: rwSummary, after: 'rewrite', rewriteAfter: when,
        }) : null;
        if (tf) {
          merged = tf.questions;
          v = tf.v;
        }
        const more = batch < REPAIR_BATCHES && v && !v.ok && merged && Array.isArray(rw.deferred) && rw.deferred.length > 0;
        if (!more) break;
        logEvent('transcript_quiz.rewrite_second_batch', {
          quizId, after: when, first: rw.indices, deferred: rw.deferred, remaining: v.errors.length,
        });
        base = merged;
        baseErrors = v.errors;
        prefer = rw.deferred;
      }
      {
        // A repaired set whose only remaining complaints are in-place faults
        // (a verb that speaks to the child with a gender, two English terms
        // side by side) or teacher notes its own repair could not put in Urdu
        // is shipped, the faults recorded: the repair was the one attempt at
        // them, and the rest of the set is sound.
        let ok = Boolean(v && (v.ok || repairedOnly(v.errors)));
        if (ok) {
          try {
            const drafted = toRows(quizId, v.questions);
            ({ figureUrls, cardUrls } = await renderFor(api, {
              questions: v.questions, rows: drafted, language, teacherId: quiz.teacher_id, quizId,
            }));
            draftedRows = drafted;
            questions = v.questions;
            readyLessonSummary = rwSummary;
            if (!v.ok) {
              meta.soft_faults = v.errors;
              logEvent('transcript_quiz.shipped_with_soft_faults', { quizId, faults: v.errors.length, kinds: faultKinds(v.errors) });
            }
          } catch (figErr) {
            logToFile('⚠️ transcript quiz: the rewritten set could not be drawn', { quizId, error: figErr.message });
            ok = false;
          }
        }
        // A rewrite that did not fully pass is still the better SALVAGE
        // candidate: it may have repaired one of two rejections, and the
        // salvage then drops one question instead of two.
        if (!ok && merged && v) rewritten = { questions: merged, errors: v.errors, lessonSummary: rwSummary };
        logEvent('transcript_quiz.rewrite_attempted', {
          quizId, after: when, indices: rw.indices, replaced: rw.replaced, ok, errors: v ? v.errors.length : null,
        });
        return { tried: true, ok, errors: v ? v.errors : null };
      }
    }

    // The last attempt failed. If every remaining complaint is about a PICTURE
    // or a pedagogy rule on a few questions, the quiz is good without those
    // questions: drop them and re-validate, rather than telling the teacher
    // nothing could be made over one drawing (a test corpus once rejected most
    // first-attempt figures). The rewritten set is tried FIRST — dropping a
    // question it already repaired would throw the repair away.
    if (!questions && lastRejected && lastErrors) {
      const base = { language, subject: digest.subject, digest, quizId };
      const candidates = [rewritten, { questions: lastRejected, errors: lastErrors }].filter(Boolean);
      for (const cand of candidates) {
        // The rewritten candidate carries its own (repaired) summary; the raw
        // last attempt carries the one it was authored with.
        const ctx = { ...base, lessonSummary: cand.lessonSummary || lastLessonSummary };
        const salvaged = salvageWithoutBadFigures(cand.questions, cand.errors, ctx);
        // A refusal now says WHY. Every salvage decision today had to be
        // reconstructed by inference from the attempt record, which is a day
        // of guessing this one event would have removed.
        if (!salvaged || salvaged.refused) {
          if (salvaged && salvaged.refused) {
            logEvent('transcript_quiz.salvage_refused', {
              quizId, why: salvaged.refused,
              dropped: salvaged.dropped || null,
              errors: redactLog((salvaged.errors || []).slice(0, 6).map(String)).map((e) => e.slice(0, 120)),
            });
          }
          continue;
        }
        try {
          const drafted = toRows(quizId, salvaged.questions);
          // eslint-disable-next-line no-await-in-loop
          ({ figureUrls, cardUrls } = await renderFor(api, {
            questions: salvaged.questions, rows: drafted, language, teacherId: quiz.teacher_id, quizId,
          }));
          draftedRows = drafted;
          questions = salvaged.questions;
          readyLessonSummary = ctx.lessonSummary;
          if (salvaged.softFaults && salvaged.softFaults.length) meta.soft_faults = salvaged.softFaults;
          attempts.push({ attempt: 'salvage', dropped: salvaged.dropped, errors: salvaged.softFaults || [] });
          logEvent('transcript_quiz.figure_salvage', {
            quizId, dropped: salvaged.dropped, kept: questions.length,
            softFaults: (salvaged.softFaults || []).length,
          });
          break;
        } catch (figErr) {
          logToFile('⚠️ transcript quiz: salvage could not render the remaining figures', { quizId, error: figErr.message });
        }
      }
    }
    // ── SOFT FAULTS NEVER COST A TEACHER THE QUIZ ────────────────────────────
    // Every attempt and every repair has run. If what remains is ONLY the two
    // level-mix rules (too many above the taught level / too few at
    // understand-or-above) or the picture share — properties of the SET, with
    // every question individually well formed and answerable — the quiz ships
    // and the faults are recorded, rather than the teacher who said yes being
    // told nothing could be made (a science lesson once
    // died on its third attempt with "only 3 of 8 at understand or apply").
    if (!questions && lastRejected && lastErrors) {
      const cand = rewritten || { questions: lastRejected, errors: lastErrors, lessonSummary: lastLessonSummary };
      if (cand.errors.length && cand.errors.every((e) => SOFT_FAULT.test(String(e)))) {
        const v = validate(cand.questions, {
          language, subject: digest.subject, digest, nExpected: N_QUESTIONS, lessonSummary: cand.lessonSummary || lastLessonSummary, quizId,
        });
        if (v.errors.every((e) => SOFT_FAULT.test(String(e)))) {
          try {
            const drafted = toRows(quizId, v.questions);
            ({ figureUrls, cardUrls } = await renderFor(api, {
              questions: v.questions, rows: drafted, language, teacherId: quiz.teacher_id, quizId,
            }));
            draftedRows = drafted;
            questions = v.questions;
            readyLessonSummary = cand.lessonSummary || lastLessonSummary;
            meta.soft_faults = v.errors;
            attempts.push({ attempt: 'soft_ship', errors: v.errors });
            logEvent('transcript_quiz.shipped_with_soft_faults', { quizId, faults: v.errors.length, kinds: v.errors.map((e) => String(e).replace(/^q\d+: /, '').split(/\s|—/)[0]) });
          } catch (figErr) {
            logToFile('⚠️ transcript quiz: the soft-fault set could not be drawn', { quizId, error: figErr.message });
          }
        }
      }
    }
    meta.author_attempts = attempts;
    if (!questions) {
      // The reason is persisted on the row (it was not, for validator_failed),
      // so /quiz repeats the same sentence later instead of inferring one.
      const reason = authorReplies === 0 ? 'model_failed' : 'validator_failed';
      await updateQuiz(quizId, { status: 'failed', meta: { ...meta, step: 'failed', error: reason } });
      await tellTeacherFailed(phone, teacherLang, quizId, reason, quizSource, { step: 'author' });
      return { failed: true, reason, attempts };
    }
    // What the loop settled: its questions have been validated and offered a
    // repair. A question whose text is not in here was written later (the
    // picture step, a key rewrite) and gets the last repair below.
    const settled = new Set(questions.map(textSignature));
    // ── PICTURE DENSITY (grade 1-5 maths) ────────────────────────────────────
    // Before the key checks, so a stem rewritten for its picture is checked too.
    const dens = await runFigureDensity(api, {
      questions, digest, language, quizId, teacherId: quiz.teacher_id, lessonSummary: readyLessonSummary,
      gradeBand: digest.grade_band || meta.grade, lessonDrew: '', attempts,
    });
    if (dens.record) {
      meta.figure_density = dens.record;
      meta.cost_usd = (meta.cost_usd || 0) + (dens.record.cost_usd || 0);
      if (dens.changed) {
        questions = dens.questions;
        figureUrls = dens.figureUrls;
        cardUrls = dens.cardUrls;
        draftedRows = dens.draftedRows;
        if (dens.softFaults) meta.soft_faults = dens.softFaults;
      }
      if (dens.record.complaint) meta.soft_faults = [...(meta.soft_faults || []), dens.record.complaint];
    }
    // ── THE KEY CHECK (plan quizzes only) ───────────────────────────────────
    // Every key held against the plan it was written from, after every repair
    // and before anything is stored (see runKeyCheck). A transcript quiz has no
    // written source to check against, a topic quiz no source at all (nor a
    // plan whose text could not be read); neither comes here.
    if (isPlan && PlanDigest.digestMode(lessonSource) === 'plan') {
      const kc = await runKeyCheck(api, {
        questions, source: lessonSource, digest, language, quizId, teacherId: quiz.teacher_id,
        lessonSummary: readyLessonSummary, gradeBand: digest.grade_band || meta.grade, attempts, knownNames: nameSpellings,
        quizSource,
      });
      meta.key_check = kc.record;
      meta.cost_usd = (meta.cost_usd || 0) + (kc.record.cost_usd || 0);
      if (kc.failed) {
        await updateQuiz(quizId, { status: 'failed', meta: { ...meta, step: 'failed', error: 'key_conflict' } });
        await tellTeacherFailed(phone, teacherLang, quizId, 'key_conflict', quizSource);
        return { failed: true, reason: 'key_conflict', attempts };
      }
      if (kc.changed) {
        questions = kc.questions;
        figureUrls = kc.figureUrls;
        cardUrls = kc.cardUrls;
        draftedRows = kc.draftedRows;
        if (kc.softFaults) meta.soft_faults = kc.softFaults;
      }
    }
    // ── THE BLIND SOLVE (both sources) ──────────────────────────────────────
    // Every key answered by an independent solver that is not shown it, after
    // the key check and before anything is stored (see runKeyVerify). This is the
    // only check that can see a key which is simply WRONG — a misspelling, a bad
    // sum — or an item with two right answers.
    const kv = await runKeyVerify(api, {
      questions, digest, language, quizId, teacherId: quiz.teacher_id,
      lessonSummary: readyLessonSummary, gradeBand: digest.grade_band || meta.grade,
      grade: quiz.grade || meta.grade || digest.grade_band || null, quizSource, attempts, knownNames: nameSpellings,
    });
    meta.key_verify = kv.record;
    meta.cost_usd = (meta.cost_usd || 0) + (kv.record.cost_usd || 0);
    if (kv.failed) {
      await updateQuiz(quizId, { status: 'failed', meta: { ...meta, step: 'failed', error: 'key_disagreement' } });
      await tellTeacherFailed(phone, teacherLang, quizId, 'key_disagreement', quizSource);
      return { failed: true, reason: 'key_disagreement', attempts };
    }
    if (kv.changed) {
      questions = kv.questions;
      figureUrls = kv.figureUrls;
      cardUrls = kv.cardUrls;
      draftedRows = kv.draftedRows;
      if (kv.softFaults) meta.soft_faults = kv.softFaults;
    }
    // A question the blind solve named as a repeat that no rewrite replaced.
    if (kv.repeatFaults && kv.repeatFaults.length) meta.soft_faults = [...(meta.soft_faults || []), ...kv.repeatFaults];
    // ── THE SUMMARY IS TRUE BY THE SUBJECT (a recording's quiz) ──────────────
    // After the blind solve, so the check can read what it found (see
    // runSummaryTruth); before the last repair, which re-validates with the
    // summary that will ship.
    if (!isLp && summaryTruthEnabled()) {
      const st = await runSummaryTruth(api, {
        lessonSummary: readyLessonSummary, extras: lastExtras, digest, language, quizId, quizSource,
        grade: quiz.grade || meta.grade || digest.grade_band || null, topic: quiz.topic,
        hints: answerCheckFindings(kv.record),
      });
      meta.summary_truth = st.record;
      meta.cost_usd = (meta.cost_usd || 0) + (st.record.cost_usd || 0);
      readyLessonSummary = st.lessonSummary;
      lastExtras = st.extras || lastExtras;
      if (Array.isArray(st.slos)) {
        digest = { ...digest, slos: st.slos };
        meta.digest = digest;
      }
    }
    // ── THE LAST REPAIR (a question written after the loop) ──────────────────
    // After every step that can write a question, before anything is stored.
    const fr = await runFinalSoftRepair(api, {
      questions, settled, digest, language, quizId, teacherId: quiz.teacher_id,
      lessonSummary: readyLessonSummary, gradeBand: digest.grade_band || meta.grade, planned: isLp, topicOnly, attempts,
      knownNames: nameSpellings,
    });
    if (fr.record) {
      meta.final_repair = fr.record;
      meta.cost_usd = (meta.cost_usd || 0) + (fr.record.cost_usd || 0);
      if (fr.changed) {
        Object.assign(nameSpellings, fr.names || {});
        questions = fr.questions;
        figureUrls = fr.figureUrls;
        cardUrls = fr.cardUrls;
        draftedRows = fr.draftedRows;
      }
      // The recorded in-place faults are the ones in what ships, at the indices it ships with.
      meta.soft_faults = [...(meta.soft_faults || []).filter((e) => !FINAL_REPAIRABLE.test(String(e))), ...(fr.faults || [])];
      if (!meta.soft_faults.length) delete meta.soft_faults;
    }
    // ── A NAME STILL IN ENGLISH LETTERS WHEN THE QUIZ SHIPS (recorded) ──────
    // Repaired in place while authoring (NAME_FAULT); this records whatever the
    // repair left, or a later step brought, once per question and name — read
    // on the questions that ship. An earlier stage's record is replaced, not
    // added to: a later step can replace the question it named (replayed, the
    // picture repair did, and the record still named a question with no name).
    const names = latinNames(questions, { language, digest });
    const stale = (meta.soft_faults || []).filter((e) => NAME_FAULT.test(String(e)));
    if (stale.length || names.length) {
      const rest = (meta.soft_faults || []).filter((e) => !NAME_FAULT.test(String(e)));
      if (rest.length || names.length) meta.soft_faults = [...new Set([...rest, ...names])];
      else delete meta.soft_faults;
    }
    if (names.length) {
      logEvent('transcript_quiz.latin_name', {
        quizId, quiz_source: quizSource,
        // how many names, never the names (data standard D4: no names in logs)
        names: new Set(names.map((e) => /"([^"]+)"/.exec(e)[1])).size,
        questions: [...new Set(names.map((e) => Number(/^q(\d+)/.exec(e)[1])))],
      });
    }
    // ── THE SAME QUESTION TWICE, IN WHAT SHIPS ───────────────────────────────
    // Counted on the set that is about to be stored, whichever step left the
    // repeat: the author, a targeted rewrite that replaced one question with a
    // copy of another, or a later repair. The count on author attempts alone
    // read 0 on a quiz that shipped the same rounding question twice, written
    // by the rewrite.
    const shippedRepeats = duplicateQuestionErrors(questions);
    if (shippedRepeats.length) {
      logEvent('transcript_quiz.duplicate_question', {
        quizId, stage: 'shipped', quiz_source: quizSource, questions: shippedRepeats.length,
        indices: shippedRepeats.map((e) => Number(/^q(\d+)/.exec(e)[1])),
      });
    }
    const rows = applyMedia(draftedRows || toRows(quizId, questions), questions, { figureUrls, cardUrls, language });
    await supabase.from('quiz_questions').delete().eq('quiz_id', quizId);
    const { error: insErr } = await supabase.from('quiz_questions').insert(rows);
    if (insErr) throw new Error(`quiz_questions insert failed: ${insErr.message}`);
    // The teacher's summaries are the teacher's Urdu page too: each person the
    // digest recorded is written in the Urdu spelling there as well.
    const spellSummary = (t) => (language === 'ur' && typeof t === 'string' && /\p{Script=Arabic}/u.test(t)
      ? spellText(t, peopleSpellings(digest)) : t);
    meta = {
      ...meta,
      step: 'ready',
      question_count: rows.length,
      ready_at: new Date().toISOString(),
      ...(readyLessonSummary ? { lesson_summary: spellSummary(readyLessonSummary) } : {}),
      // the sheet's two one-liners, authored alongside the summary.
      ...(lastExtras.lesson_summary_short ? { lesson_summary_short: spellSummary(lastExtras.lesson_summary_short) } : {}),
      ...(lastExtras.checks_summary
        ? { digest: { ...(meta.digest || {}), checks_summary: spellSummary(lastExtras.checks_summary) } } : {}),
    };
    await updateQuiz(quizId, { status: 'ready', meta });
    logEvent('transcript_quiz.ready', {
      quizId, questions: rows.length, language, attempts: attempts.length, costUsd: meta.cost_usd, quiz_source: quizSource,
    });
    Funnel.emit('generated', { ...funnel, n: rows.length });
  }

  // ── hand-off (mint or reuse the share code, PDF, the three paced messages —
  // owned by transcript-quiz-handoff.service so /quiz "resend the link" can
  // run the exact same thing on a quiz that already went out).
  const { data: storedQs } = await supabase.from('quiz_questions')
    .select('external_id, question_text, option_a, option_b, option_c, option_d, correct_option, explanation, distractor_misconceptions, option_feedback, media, render_pattern, sort_order')
    .eq('quiz_id', quizId).order('sort_order', { ascending: true });
  const qRows = storedQs && storedQs.length ? storedQs
    : applyMedia(toRows(quizId, questions || []), questions || [], { figureUrls, cardUrls, language });

  const Handoff = require('./transcript-quiz-handoff.service');
  const result = await Handoff.sendHandoff(quizId, phone, {
    firstSend: true,
    prepared: { quiz, session, questions, qRows, digest, teacherName, meta, language, teacherLang },
  });
  if (!result.ok) return { failed: true, reason: result.reason };
  return { ok: true, quizId, code: result.code };
}

module.exports = {
  salvageWithoutBadFigures,
  failureCopyKey, tellTeacherFailed,
  rewriteRejected: (args) => require('./transcript-quiz-rewrite').rewriteRejected(args),
  rewriteTeacherFields: (args) => require('./transcript-quiz-rewrite').rewriteTeacherFields(args),
  // Grade 1-5 maths only — the one rewrite that may add a picture (runFigureDensity).
  addPictures: (args) => require('./transcript-quiz-rewrite').addPictures(args),
  // Plan quizzes only — the answer-key check against the plan (plan-quiz-key-check.service).
  checkKeys: (args) => require('./plan-quiz-key-check.service').checkKeys(args),
  // Both sources — the blind solve of every key (transcript-quiz-key-verify.service).
  verifyKeys: (args) => require('./transcript-quiz-key-verify.service').verifyKeys(args),
  // A recording's quiz — every line the teacher's sheet prints, checked without the lesson.
  checkSummaryTruth: (args) => require('./transcript-quiz-summary-truth').checkSummaryTruth(args),
  figureRequiredError,
  SOFT_FAULT,
  isEarlyYearsBand,
  process, processQuiz, resolveLessonSource, toRows, stampDisplayOrder, renderFigures, renderCards, applyMedia, withFigureSvgs, studentMessage, teacherLabel, renderPdf, pdfFilename,
  sleep, N_QUESTIONS, MAX_ATTEMPTS, maxAttempts,
};
