/**
 * Homework Request Flow Endpoint
 *
 * Multi-select (grade + subject + chapters). Submission does NOT deliver
 * inline — it enqueues `homework_bundle_generation` jobs (one per grade×subject
 * group) which the homework-bundle worker pdf-lib-merges and streams
 * asynchronously. The Flow returns an immediate SUCCESS ack.
 *
 * Screens: SELECT_GRADE → SELECT_CHAPTERS → SUCCESS
 *  (grade + subject picked on screen 1; chapters multi-checkbox on screen 2)
 *
 * Region-agnostic: the feature is gated by the presence of HOMEWORK_FLOW_ID
 * (set in the bot) and populated homework_chapters rows — no region check here.
 *
 * Flow token format: `${userId}:homework:${ts}`.
 */

const supabase = require('../config/supabase');
const { logToFile } = require('../utils/logger');
const { logEvent } = require('../utils/structured-logger');
const SQSQueueService = require('../services/queue/sqs-queue.service');
const HomeworkLookup = require('../services/homework-lookup.service');

// Soft cap = 12 chapters/request (~36 MB) — validated client + server. Over →
// friendly "request fewer" screen; NOT a hard block.
const HOMEWORK_SOFT_CAP = 12;

const GRADES = [
  { id: '1', title: 'Grade 1' },
  { id: '2', title: 'Grade 2' },
  { id: '3', title: 'Grade 3' },
  { id: '4', title: 'Grade 4' },
  { id: '5', title: 'Grade 5' },
];

const SUBJECTS = [
  { id: 'maths', title: 'Maths' },
  { id: 'english', title: 'English' },
  { id: 'urdu', title: 'Urdu' },
];

const SUBJECT_DISPLAY = { maths: 'Maths', english: 'English', urdu: 'Urdu' };

async function getPhoneForUser(userId) {
  if (!userId) return null;
  const { data } = await supabase
    .from('users')
    .select('phone_number')
    .eq('id', userId)
    .maybeSingle();
  return data?.phone_number || null;
}

/**
 * INIT — first screen with grade + subject options.
 */
async function handleHomeworkInit(flowToken) {
  logToFile('Homework Request Flow INIT', { flowToken });
  return {
    screen: 'SELECT_GRADE',
    data: { grades: GRADES, subjects: SUBJECTS },
  };
}

/**
 * Parse the screen's chapter selection into normalized selection groups.
 * Accepts either:
 *  - { selections_json: '[{grade,subject,chapters:[..]}]' } (multi-group)
 *  - { grade, subject, chapters:[..] } (single group convenience)
 */
function parseSelections(screenData) {
  if (screenData && typeof screenData.selections_json === 'string') {
    try {
      const parsed = JSON.parse(screenData.selections_json);
      if (Array.isArray(parsed)) return parsed;
    } catch (_) { /* fall through */ }
  }
  if (screenData && screenData.grade && screenData.subject) {
    const chapters = Array.isArray(screenData.chapters)
      ? screenData.chapters.map(Number)
      : [];
    return [{
      grade: parseInt(screenData.grade, 10),
      subject: String(screenData.subject),
      chapters,
    }];
  }
  return [];
}

function totalChapters(selections) {
  return selections.reduce(
    (n, g) => n + (Array.isArray(g.chapters) ? new Set(g.chapters.map(Number)).size : 0),
    0
  );
}

/**
 * data_exchange — route by screen.
 */
async function handleHomeworkDataExchange(flowToken, screen, screenData) {
  logToFile('Homework Request data_exchange', { flowToken, screen });
  const userId = (flowToken || '').split(':')[0];

  if (screen === 'SELECT_GRADE') {
    return handleSelectGrade(screenData);
  }
  if (screen === 'SELECT_CHAPTERS') {
    return handleSelectChapters(userId, screenData, flowToken);
  }

  logToFile('Homework Request: unknown screen', { screen });
  return { data: { error: { message: 'Something went wrong.' } } };
}

/**
 * SELECT_GRADE → SELECT_CHAPTERS: build the dynamic chapter checklist.
 */
async function handleSelectGrade(screenData) {
  const grade = parseInt(screenData.grade, 10);
  const subject = screenData.subject;

  if (!grade || !subject) {
    return { data: { error: { message: 'Please select both grade and subject.' } } };
  }

  const chapters = await HomeworkLookup.findHomeworkChapters({ grade, subject });
  if (!chapters.length) {
    return {
      data: {
        error: {
          message: `No homework found for Grade ${grade} ${SUBJECT_DISPLAY[subject] || subject} yet.`,
        },
      },
    };
  }

  const chapterOptions = chapters.map(ch => ({
    id: String(ch.chapter_number),
    title: `Ch${ch.chapter_number}: ${ch.chapter_title || ''}`.trim(),
  }));

  return {
    screen: 'SELECT_CHAPTERS',
    data: {
      chapters: chapterOptions,
      grade_display: `Grade ${grade} — ${SUBJECT_DISPLAY[subject] || subject}`,
      grade_value: String(grade),
      subject_value: subject,
      soft_cap: HOMEWORK_SOFT_CAP,
    },
  };
}

/**
 * SELECT_CHAPTERS submit → enqueue one bundle job per (grade×subject),
 * write the tracking row, return the immediate ack SUCCESS screen.
 */
async function handleSelectChapters(userId, screenData, flowToken) {
  const selections = parseSelections(screenData);

  if (!selections.length || totalChapters(selections) === 0) {
    return { data: { error: { message: 'Please select at least one chapter.' } } };
  }

  // Soft cap (server-side; client also enforces). Friendly screen, NOT a hard block.
  const count = totalChapters(selections);
  if (count > HOMEWORK_SOFT_CAP) {
    logEvent('homework.flow.soft_cap_hit', { userId, requested: count, cap: HOMEWORK_SOFT_CAP });
    return {
      screen: 'SELECT_CHAPTERS',
      data: {
        error: {
          message: `You picked ${count} chapters. To keep the files quick to download, please request up to ${HOMEWORK_SOFT_CAP} chapters at a time — then send "homework" again for the rest.`,
        },
      },
    };
  }

  // Resolve to deliverable chapters with R2 keys, grouped per grade×subject.
  const resolved = await HomeworkLookup.resolveSelection(selections);
  if (!resolved.length) {
    return {
      data: {
        error: { message: 'Those chapters are not available yet. Please try a different selection.' },
      },
    };
  }

  const phone = await getPhoneForUser(userId);

  // Group by (grade × subject) — one PDF + one SQS job per group.
  const groups = new Map();
  for (const r of resolved) {
    const key = `${r.grade}::${r.subject}`;
    if (!groups.has(key)) groups.set(key, { grade: r.grade, subject: r.subject, chapters: [] });
    groups.get(key).chapters.push({
      chapter: r.chapter, chapter_title: r.chapter_title, r2_key: r.r2_key,
    });
  }
  const groupList = Array.from(groups.values());

  // Tracking row: one lesson_plan_requests per request. The selection detail
  // travels in the SQS job payload; the row only needs to carry status.
  let requestId = null;
  try {
    const { data: lprRow, error: lprErr } = await supabase
      .from('lesson_plan_requests')
      .insert({
        user_id: userId,
        phone_number: phone,
        topic: 'Homework',
        full_message: 'homework_flow',
        language: 'en',
        content_type: 'homework',
        status: 'pending',
      })
      .select('id')
      .single();
    if (lprErr) {
      logToFile('Homework: lesson_plan_requests insert error', { error: lprErr.message });
    } else {
      requestId = lprRow?.id || null;
    }
  } catch (e) {
    logToFile('Homework: lesson_plan_requests insert threw', { error: e.message });
  }

  // Enqueue one bundle job per (grade × subject) group. groupCount + groupIndex
  // let the worker fire the single post-delivery feedback survey only after the
  // LAST group's file.
  let enqueued = 0;
  for (let i = 0; i < groupList.length; i++) {
    const g = groupList[i];
    try {
      await SQSQueueService.queueJob(
        userId,
        'homework_bundle_generation',
        {
          userId,
          phone,
          requestId,
          grade: g.grade,
          subject: g.subject,
          chapters: g.chapters,
          groupIndex: i,
          groupCount: groupList.length,
          isLastGroup: i === groupList.length - 1,
        }
      );
      enqueued += 1;
    } catch (e) {
      logToFile('Homework: queueJob failed for group', {
        error: e.message, grade: g.grade, subject: g.subject,
      });
    }
  }

  logEvent('homework.flow.submitted', {
    userId, phone, requestId,
    groupCount: groupList.length,
    enqueued,
    totalChapters: count,
  });

  return {
    screen: 'SUCCESS',
    data: {
      message: 'Your homework is being prepared — it will arrive in a few moments.',
      extension_message_response: {
        params: { flow_token: flowToken || `${userId}:homework` },
      },
    },
  };
}

/**
 * BACK — return to the grade/subject screen.
 */
async function handleHomeworkBack(flowToken, screen) {
  logToFile('Homework Request BACK', { flowToken, screen });
  return {
    screen: 'SELECT_GRADE',
    data: { grades: GRADES, subjects: SUBJECTS },
  };
}

module.exports = {
  handleHomeworkInit,
  handleHomeworkDataExchange,
  handleHomeworkBack,
  HOMEWORK_SOFT_CAP,
  GRADES,
  SUBJECTS,
};
