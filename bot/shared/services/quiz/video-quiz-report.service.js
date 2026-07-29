'use strict';
/**
 * the class report a teacher gets after sharing a video quiz.
 *
 * Fires the NEXT MORNING, or early once every child who started has finished —
 * whichever comes first. Same promise as the /quiz report, and deliberately the
 * same shape, because a teacher should not have to learn two report formats for
 * the same question ("how did my class do?").
 *
 * WHAT IT ANSWERS, in this order:
 *   1. how many started, how many finished
 *   2. the class average
 *   3. which questions the class found hardest — the actual teaching signal
 *   4. who has not done it yet
 *
 * Scheduling uses the existing SQS job queue rather than a new mechanism: the
 * parent quiz already cascades a `quiz_report` job and advances it when all
 * sessions reach a terminal state. This registers a sibling job type so the two
 * cannot dedupe against each other.
 */

const supabase = require('../../config/supabase');
const WhatsAppService = require('../whatsapp.service');
const { logToFile } = require('../../utils/logger');
const { logEvent } = require('../../utils/structured-logger');

/**
 * the prefix is load-bearing, not cosmetic.
 *
 * queueJob routes by it: only `quiz_*` reaches SQS_QUIZ_QUEUE_URL, a STANDARD
 * queue that honours per-message DelaySeconds. Everything else lands on
 * SQS_QUEUE_URL, which is FIFO — and queueJob deliberately drops delaySeconds
 * there, because FIFO rejects it per-message. Under the old name
 * ('video_quiz_report') the delay was silently discarded and the "next morning"
 * report was delivered within seconds of the first child joining.
 *
 * Still distinct from the parent quiz's `quiz_report`, so the two can never
 * dedupe against each other (a multi-phase job deduping against its own earlier phase).
 */
const JOB_TYPE = 'quiz_video_report';

/** The name this job shipped under previously. Still consumed so any
 *  message already sitting in the queue is not dropped on deploy. */
const LEGACY_JOB_TYPE = 'video_quiz_report';

/** 07:00 Pakistan time on the next day, expressed in UTC. */
function nextMorningUtc(now = new Date()) {
  const PKT_OFFSET_MIN = 5 * 60;
  const pkt = new Date(now.getTime() + PKT_OFFSET_MIN * 60 * 1000);
  const target = new Date(Date.UTC(
    pkt.getUTCFullYear(), pkt.getUTCMonth(), pkt.getUTCDate() + 1, 7, 0, 0
  ));
  return new Date(target.getTime() - PKT_OFFSET_MIN * 60 * 1000);
}

/**
 * Schedule the report for a share code. Idempotent per code — a second call
 * (another child joining) must not queue a second report.
 */
async function scheduleForShareCode(shareCodeId) {
  try {
    const SQSQueueService = require('../queue/sqs-queue.service');
    const when = nextMorningUtc();
    const delaySeconds = Math.max(60, Math.floor((when - Date.now()) / 1000));
    await SQSQueueService.queueJob(shareCodeId, JOB_TYPE, {
      shareCodeId,
      // targetAt MUST live in the payload. queueJob builds its message
      // body from {groupId, jobType, payload, ...} and drops the options object,
      // so an options-only targetAt never reached the worker — the "not morning
      // yet, re-queue" cascade read undefined and generated the report on the
      // very first delivery.
      targetAt: when.toISOString(),
    }, {
      // SQS DelaySeconds caps at 900s; the handler re-queues until the target
      // time, the same cascade the parent quiz report uses.
      delaySeconds: Math.min(900, delaySeconds),
      deduplicationId: `${shareCodeId}-${JOB_TYPE}-morning`,
    });
    logEvent('video_quiz.report_scheduled', { shareCodeId, targetAt: when.toISOString() });
  } catch (err) {
    logToFile('⚠️ video-quiz report scheduling failed (non-fatal)', {
      shareCodeId, error: err.message,
    });
  }
}

/**
 * Every child who started has finished → send now rather than wait for morning.
 * Idempotent: only fires when at least one session exists and none is still
 * in flight.
 */
async function maybeSendEarly(shareCodeId) {
  if (!shareCodeId) return false;
  const { data: sessions } = await supabase
    .from('quiz_sessions')
    .select('status')
    .eq('share_code_id', shareCodeId);
  if (!sessions || !sessions.length) return false;
  const TERMINAL = ['completed', 'incomplete', 'expired', 'cancelled'];
  if (!sessions.every((s) => TERMINAL.includes(s.status))) return false;
  return generate(shareCodeId, { reason: 'all_finished' });
}

/**
 * Build and send the report. Safe to call twice — genuinely guarded on
 * `report_sent_at` (the previous version of this comment claimed a
 * guard that was never implemented and no column that existed).
 */
async function generate(shareCodeId, { reason = 'scheduled' } = {}) {
  const { data: sc } = await supabase
    .from('quiz_share_codes')
    .select('id, code, quiz_id, teacher_user_id, teacher_name, topic, language, '
            + 'created_at, report_sent_at')
    .eq('id', shareCodeId)
    .maybeSingle();
  if (!sc) return false;

  // ONE report per share code. A teacher who has already been told how her
  // class did should never be told again — and both trigger paths (the morning
  // job and the all-finished early send) can legitimately fire for the same code.
  if (sc.report_sent_at) {
    logEvent('video_quiz.report_suppressed', {
      shareCodeId, reason, why: 'already_sent', sentAt: sc.report_sent_at,
    });
    return false;
  }

  const { data: teacher } = await supabase
    .from('users').select('phone_number, preferred_language')
    .eq('id', sc.teacher_user_id).maybeSingle();
  if (!teacher?.phone_number) {
    logToFile('⚠️ video-quiz report: no teacher phone', { shareCodeId });
    return false;
  }

  const { data: sessions } = await supabase
    .from('quiz_sessions')
    .select('id, student_name, student_class, status, total_questions_answered, '
            + 'correct_answers, mastery_percentage')
    .eq('share_code_id', shareCodeId);

  const all = sessions || [];
  const done = all.filter((s) => s.status === 'completed');

  // never send a results message with no results in it.
  //
  // The operator received "0 of 1 students finished" seconds after the first
  // child opened the link. An EARLY trigger only earns a send once somebody has
  // actually finished; before that there is nothing to say, and saying it
  // spends the teacher's attention on noise.
  //
  // The SCHEDULED morning run is different: that is the moment she was promised
  // a report, so she hears from us even if the class never finished. Silence
  // there would read as the feature being broken.
  if (reason !== 'scheduled' && !done.length) {
    logEvent('video_quiz.report_suppressed', {
      shareCodeId, reason, why: 'nothing_completed_yet', started: all.length,
    });
    return false;
  }

  if (!all.length) {
    await WhatsAppService.sendMessage(teacher.phone_number,
      `No one has opened your quiz on “${sc.topic}” yet. The link stays live for `
      + `30 days — worth a nudge in the class group.`);
    await markReportSent(shareCodeId);
    return true;
  }

  const avg = done.length
    ? Math.round(done.reduce((s, x) => s + (x.mastery_percentage || 0), 0) / done.length)
    : 0;

  const hardest = await hardestQuestions(shareCodeId);
  const unfinished = all.filter((s) => s.status !== 'completed');

  const lines = [
    `📊 *Quiz results — ${sc.topic || 'your video quiz'}*`,
    '',
    `${done.length} of ${all.length} students finished.`,
    done.length ? `Class average: *${avg}%*` : '',
    '',
  ];

  if (done.length) {
    const sorted = [...done].sort((a, b) => (b.mastery_percentage || 0) - (a.mastery_percentage || 0));
    lines.push('*How each student did*');
    sorted.forEach((s) => {
      lines.push(`• ${s.student_name || 'Unnamed'}${s.student_class ? ` (${s.student_class})` : ''}`
        + ` — ${s.correct_answers}/${s.total_questions_answered} (${s.mastery_percentage || 0}%)`);
    });
    lines.push('');
  }

  if (hardest.length) {
    // The part that actually changes tomorrow's lesson.
    lines.push('*Worth reteaching* — most missed:');
    hardest.forEach((h) => {
      lines.push(`• ${h.question_text}`);
      lines.push(`   ${h.wrong} of ${h.total} got this wrong`);
    });
    lines.push('');
  }

  if (unfinished.length) {
    lines.push(`*Not finished yet:* ${unfinished
      .map((s) => s.student_name || 'Unnamed').join(', ')}`);
  }

  // the coaching paragraph, grounded in what this class actually got
  // wrong. Generated once and used in both the PDF and the chat message.
  const guidance = done.length
    ? await generateGuidance({
      topic: sc.topic, grade: sc.grade, average: avg,
      finished: done.length, started: all.length, hardest,
    })
    : null;

  const summary = lines.filter((l) => l !== null && l !== undefined).join('\n');

  // A designed report is worth it once there are results in it. On the morning
  // run for a class where nobody finished, a PDF of an empty table is worse
  // than a sentence — so that case stays a plain message.
  const sentAsPdf = done.length > 0 && await sendAsPdf({
    phone: teacher.phone_number, shareCode: sc, students: done, hardest,
    guidance, started: all.length, finished: done.length, average: avg,
    unfinished: unfinished.map((s) => s.student_name || 'Unnamed'),
  });

  if (!sentAsPdf) {
    // The PDF is the nicer artefact, not the report itself. If rendering fails
    // she still gets every number — losing her results because a font did not
    // load would be the wrong trade.
    await WhatsAppService.sendMessage(teacher.phone_number, summary);
    if (guidance) {
      await WhatsAppService.sendMessage(teacher.phone_number,
        `💡 *For tomorrow*\n\n${guidance}`);
    }
  }

  await markReportSent(shareCodeId);

  logEvent('video_quiz.report_sent', {
    shareCodeId, quizId: sc.quiz_id, started: all.length,
    completed: done.length, average: avg, reason,
    format: sentAsPdf ? 'pdf' : 'text', hadGuidance: Boolean(guidance),
  });
  return true;
}

/**
 * Render and send the designed report. Returns false on any failure so the
 * caller falls back to the text summary rather than the teacher getting nothing.
 */
async function sendAsPdf({ phone, shareCode, students, hardest, guidance,
                           started, finished, average, unfinished }) {
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  let tempPath = null;
  try {
    const { htmlToPdf } = require('../../utils/html-to-pdf');
    const renderHtml = require('../../templates/video-quiz-report.template');

    const html = renderHtml({
      topic: shareCode.topic || 'Video quiz',
      teacherName: shareCode.teacher_name,
      started, finished, average,
      students, hardest, guidance, unfinished,
      generatedAt: new Date().toLocaleDateString('en-GB', {
        day: 'numeric', month: 'short', year: 'numeric',
      }),
    });

    const buffer = await htmlToPdf(html, {
      timeout: 30000,
      pdfOptions: {
        format: 'A4',
        printBackground: true,
        margin: { top: '0', right: '0', bottom: '0', left: '0' },
      },
    });
    if (!buffer || !buffer.length) return false;

    const safeTopic = String(shareCode.topic || 'quiz')
      .replace(/[^a-z0-9]+/gi, '_').slice(0, 40);
    tempPath = path.join(os.tmpdir(), `class-quiz-${shareCode.id}.pdf`);
    fs.writeFileSync(tempPath, buffer);

    const caption = finished
      ? `📊 Class results — *${shareCode.topic}*\n\n`
        + `${finished} of ${started} finished · class average ${average}%`
        + (hardest.length ? `\n\n${hardest.length} question${hardest.length > 1 ? 's' : ''} worth reteaching — inside.` : '')
      : `📊 Class results — *${shareCode.topic}*`;

    const ok = await WhatsAppService.sendDocument(
      phone, tempPath, `Class_results_${safeTopic}.pdf`, caption);
    return Boolean(ok);
  } catch (err) {
    logToFile('⚠️ video-quiz: report PDF failed, falling back to text', {
      error: err.message,
    });
    return false;
  } finally {
    // sendDocument reads the file synchronously before returning, so it is safe
    // to clear here; leaving these behind fills the worker's disk over weeks.
    try { if (tempPath && fs.existsSync(tempPath)) fs.unlinkSync(tempPath); }
    catch { /* a stray temp file is not worth failing the report over */ }
  }
}

/**
 * Turn the evidence into the paragraph the teacher reads.
 *
 * Best-effort by design: if the model is slow or down she still gets her
 * results, just without the coaching line. Losing the whole report because an
 * optional paragraph failed would be the wrong trade.
 */
async function generateGuidance(context) {
  const prompt = buildGuidancePrompt(context);
  if (!prompt) return null;
  try {
    const OpenAI = require('openai');
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const res = await openai.chat.completions.create({
      // This paragraph is the one part of the report a teacher acts on, so it
      // gets the better model. gpt-4o-mini produced textbook prose here —
      // "focus on clarifying the misconception that…" — and reached for
      // "categorise various foods" instead of the dal and rice in the questions.
      model: 'gpt-5.4-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.4,               // lower than the parent quiz: this is advice
      // gpt-5 family renamed this. Passing max_tokens is not an error you can
      // see — the call just rejects and the teacher silently loses the tip.
      max_completion_tokens: 260,
    });
    const body = res.choices?.[0]?.message?.content?.trim();
    return body || null;
  } catch (err) {
    logToFile('⚠️ video-quiz: guidance generation failed (report still sends)', {
      error: err.message,
    });
    return null;
  }
}

/**
 * Stamp the share code as reported.
 *
 * Deliberately AFTER the send, not before: if WhatsApp throws, the teacher got
 * nothing and the morning job should still get its turn. The cost of that
 * ordering is a possible double-send if the stamp itself fails, which is the
 * better failure — a teacher seeing one report twice beats her seeing none.
 */
async function markReportSent(shareCodeId) {
  try {
    await supabase.from('quiz_share_codes')
      .update({ report_sent_at: new Date().toISOString() })
      .eq('id', shareCodeId);
  } catch (err) {
    logToFile('⚠️ video-quiz: could not stamp report_sent_at', {
      shareCodeId, error: err.message,
    });
  }
}

/** A wrong answer only counts as a shared misunderstanding at this share. */
const CLUSTER_THRESHOLD = 0.5;

const LETTERS = ['A', 'B', 'C', 'D'];
const optionText = (q, letter) => q[`option_${String(letter).toLowerCase()}`] || null;

/**
 * The three questions this class got wrong most often — and, where the class
 * agreed on a wrong answer, WHICH one and why that mistake happens.
 *
 * . "16 of 22 missed this" tells a teacher to reteach something. "16 of
 * 22 chose Dicot, because they flipped the vein rule" tells her what to say. The
 * second sentence is available because these questions ship with an explanation
 * authored per wrong option — 9,150 of them do.
 *
 * The cluster threshold matters. One child picking A and another picking B is a
 * coin toss, not a misconception, and reporting it as one would send her to
 * reteach the wrong thing. So a distractor is only named when at least half the
 * wrong answers landed on it.
 */
async function hardestQuestions(shareCodeId, limit = 3) {
  const { data: sessions } = await supabase
    .from('quiz_sessions').select('id').eq('share_code_id', shareCodeId);
  const ids = (sessions || []).map((s) => s.id);
  if (!ids.length) return [];

  const { data: answers } = await supabase
    .from('quiz_answers')
    .select('question_id, is_correct, selected_option')
    .in('session_id', ids);
  if (!answers || !answers.length) return [];

  const tally = new Map();
  answers.forEach((a) => {
    const t = tally.get(a.question_id)
      || { total: 0, wrong: 0, picks: new Map() };
    t.total += 1;
    if (!a.is_correct) {
      t.wrong += 1;
      if (a.selected_option) {
        t.picks.set(a.selected_option, (t.picks.get(a.selected_option) || 0) + 1);
      }
    }
    tally.set(a.question_id, t);
  });

  const ranked = [...tally.entries()]
    // Needs at least two attempts before "the class found this hard" means
    // anything — one child's slip is not a teaching signal.
    .filter(([, t]) => t.wrong > 0 && t.total >= 2)
    .sort((a, b) => (b[1].wrong / b[1].total) - (a[1].wrong / a[1].total))
    .slice(0, limit);
  if (!ranked.length) return [];

  const { data: qs } = await supabase
    .from('quiz_questions')
    .select('id, question_text, option_a, option_b, option_c, option_d, '
            + 'correct_option, option_feedback')
    .in('id', ranked.map(([id]) => id));
  const byId = new Map((qs || []).map((q) => [q.id, q]));

  return ranked.map(([id, t]) => {
    const q = byId.get(id) || {};
    let topWrong = null;
    let topCount = 0;
    let runnerUp = 0;
    t.picks.forEach((n, letter) => {
      if (n > topCount) { runnerUp = topCount; topCount = n; topWrong = letter; }
      else if (n > runnerUp) { runnerUp = n; }
    });

    // Two conditions, and the second is the one that matters. Half the wrong
    // answers landing on an option is necessary but not sufficient: with two
    // children picking A and B, A holds half the wrong answers and is still
    // just a tie. A cluster means one distractor genuinely dominates.
    const clustered = Boolean(topWrong) && t.wrong > 0
      && (topCount / t.wrong) >= CLUSTER_THRESHOLD
      && topCount > runnerUp;

    let misconception = null;
    if (clustered && q.option_feedback && q.option_feedback.wrong) {
      // Feedback is keyed by the option INDEX, not its letter.
      const idx = LETTERS.indexOf(topWrong);
      const raw = q.option_feedback.wrong[String(idx)]
        ?? q.option_feedback.wrong[idx];
      if (raw) {
        // Strip the "A) " prefix the authored copy carries — the report already
        // names the option, and repeating it reads as a stutter.
        misconception = String(raw).replace(/^\s*[A-D]\)\s*/, '').trim() || null;
      }
    }

    return {
      question_text: q.question_text || '(question unavailable)',
      wrong: t.wrong,
      total: t.total,
      top_wrong_option: clustered ? topWrong : null,
      top_wrong_text: clustered ? optionText(q, topWrong) : null,
      top_wrong_count: clustered ? topCount : 0,
      correct_option: q.correct_option || null,
      correct_text: q.correct_option ? optionText(q, q.correct_option) : null,
      misconception,
    };
  });
}

/**
 * The prompt behind the "what to practise tomorrow" paragraph.
 *
 * Deliberately built from the class's OWN answers — the questions they missed,
 * the wrong option they agreed on, and the authored reason that mistake
 * happens. A prompt that knows only the average can only return advice that
 * would fit any class on any topic, which a teacher correctly ignores.
 *
 * Returns null when nothing was missed: there is no honest guidance to give a
 * class that got everything right, and inventing some would train her to skip
 * this section.
 */
function buildGuidancePrompt({ topic, grade, average, finished, started, hardest }) {
  if (!hardest || !hardest.length) return null;

  const evidence = hardest.map((h, i) => {
    const lines = [
      `${i + 1}. "${h.question_text}"`,
      `   ${h.wrong} of ${h.total} answered this wrongly.`,
    ];
    if (h.top_wrong_text) {
      lines.push(`   Most of them chose "${h.top_wrong_text}". `
        + `The right answer was "${h.correct_text}".`);
    }
    if (h.misconception) {
      lines.push(`   Why that mistake happens: ${h.misconception}`);
    }
    return lines.join('\n');
  }).join('\n\n');

  return `You are helping a Grade ${grade || 'primary'} teacher in Pakistan plan `
    + `tomorrow's ten minutes. Her class just took a quiz on "${topic}".\n\n`
    + `Here is what they got wrong, and the wrong answer they agreed on:\n\n`
    + `${evidence}\n\n`
    + `Write EXACTLY three sentences, for her to read in ten seconds.\n\n`
    + `Sentence 1 — name the ONE thing most of them have muddled, as a plain `
    + `statement of what they believe: "They think X is Y." Pick the single `
    + `biggest confusion, not a list of all of them. Do not use the words `
    + `"misconception", "students", "concept" or "understanding".\n`
    + `Sentence 2 — one activity she can run on the board in ten minutes with `
    + `nothing but chalk. Use the REAL everyday things named in the questions `
    + `above — the specific foods, objects, words or numbers those questions `
    + `talk about. Never "various examples" or "different items". Do not use a `
    + `whole answer sentence as a label; use the thing itself.\n`
    + `Sentence 3 — the one question she asks at the end to check it landed. It `
    + `must NOT be a copy of any quiz question above; the children have already `
    + `seen those. Ask the same idea a different way.\n\n`
    + `Never begin with "In tomorrow's lesson", "To address this", "Focus on" or `
    + `"Start by". Begin with the children. Do not repeat any score or count back `
    + `to her — she has just read them. Do not praise her or the class. Write the `
    + `way a colleague leans over at break, not the way a textbook explains.`;
}

module.exports = {
  JOB_TYPE, LEGACY_JOB_TYPE, scheduleForShareCode, maybeSendEarly, generate,
  hardestQuestions, nextMorningUtc, buildGuidancePrompt, generateGuidance,
  CLUSTER_THRESHOLD,
};
