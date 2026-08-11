/**
 * Student Videos Flow Endpoint — v2.0
 *
 * Screens: SELECT_GRADE → SELECT_SUBJECT → SELECT_TOPIC → SUCCESS
 *
 * v2.0 changes (vs v1):
 * - Dropped the SELECT_CHAPTER screen (76% of original "chapters" were
 *   singletons — the screen was mostly a wasted click).
 * - The Topic dropdown lists every video for the (grade, subject), labelled
 *   by `clean_title`, prefixed with `clean_chapter · ` ONLY when a chapter
 *   actually groups ≥ 2 videos (singleton chapters render the title alone).
 * - SELECT_TOPIC's payload now carries the video row id directly (no more
 *   resolving by (chapter, subtopic) text — eliminates a class of mapping bugs).
 * - Pre-send chat confirmation: a "Sending your video…" message is dispatched
 *   *before* the async R2 → WhatsApp upload so the teacher sees instant
 *   acknowledgement during the 5-15s media-upload window.
 * - Caption uses `clean_title` verbatim (no more fragmented "Numbers · X — Y").
 */

const supabase = require('../config/supabase');
const { logToFile } = require('../utils/logger');
const { logEvent } = require('../utils/structured-logger');
const WhatsAppService = require('../services/whatsapp.service');
const StudentVideoFeedbackService = require('../services/student-video-feedback.service');

const GRADE_ORDER = ['NURSERY', 'KG', '1', '2', '3', '4', '5', '6'];
const gradeRank = (g) => {
  const i = GRADE_ORDER.indexOf(String(g));
  return i === -1 ? 99 : i;
};
const gradeTitle = (g) => {
  const s = String(g);
  if (s === 'NURSERY') return 'Nursery';
  if (s === 'KG') return 'KG';
  return `Grade ${s}`;
};

async function fetchDone(filter = {}) {
  // hide duplicates. 85 videos were identified as re-uploads of
  // another row and marked with `superseded_by` during the title cleanup, but
  // nothing filtered on it — so both copies stayed in the teacher's picker,
  // with near-identical titles. Marked is not hidden.
  let q = supabase
    .from('student_videos')
    .select('id,grade,subject,clean_chapter,clean_title,r2_url')
    .eq('migration_status', 'done')
    .is('superseded_by', null);
  for (const [k, v] of Object.entries(filter)) q = q.eq(k, v);
  const { data, error } = await q;
  if (error) {
    logToFile('Student Videos: supabase error', { error: error.message, filter });
    return [];
  }
  return data || [];
}

function distinct(rows, key) {
  return [...new Set(rows.map((r) => r[key]).filter((v) => v != null && v !== ''))];
}

async function getPhoneForUser(userId) {
  if (!userId) return null;
  const { data } = await supabase
    .from('users')
    .select('phone_number')
    .eq('id', userId)
    .single();
  return data?.phone_number || null;
}

// ---------- INIT ----------
async function handleStudentVideosInit(flowToken) {
  logToFile('Student Videos Flow INIT', { flowToken });
  const rows = await fetchDone();
  const grades = distinct(rows, 'grade')
    .sort((a, b) => gradeRank(a) - gradeRank(b))
    .map((g) => ({ id: String(g), title: gradeTitle(g) }));
  if (grades.length === 0) {
    return { screen: 'SELECT_GRADE', data: { grades: [], error: { message: 'The video library is being prepared. Please try again later.' } } };
  }
  return { screen: 'SELECT_GRADE', data: { grades } };
}

// ---------- DATA EXCHANGE ----------
async function handleStudentVideosDataExchange(flowToken, screen, screenData) {
  logToFile('Student Videos data_exchange', { flowToken, screen, screenData });
  if (screen === 'SELECT_GRADE') return selectGrade(screenData);
  if (screen === 'SELECT_SUBJECT') return selectSubject(screenData);
  if (screen === 'SELECT_TOPIC') return selectTopic(flowToken, screenData);
  logToFile('Student Videos: unknown screen', { screen });
  return { data: { error: { message: 'Something went wrong.' } } };
}

// SELECT_GRADE → SELECT_SUBJECT
async function selectGrade(screenData) {
  const grade = screenData && screenData.grade;
  if (!grade) return { data: { error: { message: 'Please select a class.' } } };
  const rows = await fetchDone({ grade });
  const subjects = distinct(rows, 'subject')
    .sort()
    .map((s) => ({ id: s, title: s }));
  if (subjects.length === 0) {
    return { data: { error: { message: `No videos available for ${gradeTitle(grade)} yet.` } } };
  }
  return {
    screen: 'SELECT_SUBJECT',
    data: { subjects, grade_value: String(grade), grade_display: gradeTitle(grade) },
  };
}

// SELECT_SUBJECT → SELECT_TOPIC (single combined list, chapter as inline prefix)
async function selectSubject(screenData) {
  const grade = screenData && screenData.grade;
  const subject = screenData && screenData.subject;
  if (!grade || !subject) return { data: { error: { message: 'Please select a subject.' } } };
  const rows = await fetchDone({ grade, subject });
  if (rows.length === 0) {
    return { data: { error: { message: `No ${subject} videos for ${gradeTitle(grade)} yet.` } } };
  }

  // Count chapter sizes so we know whether to render the chapter prefix.
  // Prefix shown ONLY when ≥ 2 videos share the chapter (otherwise it's noise).
  const chapterCount = new Map();
  for (const r of rows) {
    const ch = r.clean_chapter || '';
    chapterCount.set(ch, (chapterCount.get(ch) || 0) + 1);
  }

  // Sort by (chapter, title) so grouped videos cluster visually.
  rows.sort((a, b) => {
    const ac = (a.clean_chapter || '').toLowerCase();
    const bc = (b.clean_chapter || '').toLowerCase();
    if (ac !== bc) return ac < bc ? -1 : 1;
    const at = (a.clean_title || '').toLowerCase();
    const bt = (b.clean_title || '').toLowerCase();
    return at < bt ? -1 : at > bt ? 1 : 0;
  });

  const videos = rows.map((r) => {
    const title = r.clean_title || 'Untitled';
    const ch = r.clean_chapter;
    const show_prefix = ch && ch.toLowerCase() !== title.toLowerCase() &&
      (chapterCount.get(ch) || 0) >= 2;
    return {
      id: r.id, // pass the row id directly — no fragile text re-resolution.
      title: show_prefix ? `${ch} · ${title}` : title,
    };
  });

  return {
    screen: 'SELECT_TOPIC',
    data: {
      videos,
      grade_value: String(grade),
      subject_value: subject,
      header_text: `${gradeTitle(grade)} — ${subject}`,
    },
  };
}

// SELECT_TOPIC → SUCCESS (resolve by row id; ack + deliver)
async function selectTopic(flowToken, screenData) {
  const grade = screenData && screenData.grade;
  const subject = screenData && screenData.subject;
  const videoId = screenData && screenData.video;
  if (!grade || !subject || !videoId) {
    return { data: { error: { message: 'Please pick a video.' } } };
  }
  const { data: row, error } = await supabase
    .from('student_videos')
    .select('id,grade,subject,clean_chapter,clean_title,r2_url,migration_status')
    .eq('id', videoId)
    .single();
  if (error || !row || row.migration_status !== 'done' || !row.r2_url) {
    logToFile('Student Videos: row lookup failed', { videoId, error: error?.message });
    return { data: { error: { message: 'That video is not available right now.' } } };
  }

  await sendPreDeliveryAck(flowToken, row);
  deliverVideoAsync(flowToken, row);

  return {
    screen: 'SUCCESS',
    data: {
      message: `Your video "${row.clean_title}" (${gradeTitle(row.grade)} ${row.subject}) is on its way!`,
    },
  };
}

// Immediate chat ack so the teacher sees feedback during the 5-15s upload.
// Awaited (not fire-and-forget) so it lands BEFORE the SUCCESS screen renders;
// tiny sendMessage call, well under Meta's 10s data_exchange budget.
async function sendPreDeliveryAck(flowToken, row) {
  const userId = (flowToken || '').split(':')[0];
  try {
    const phone = await getPhoneForUser(userId);
    if (!phone) return;
    await WhatsAppService.sendMessage(
      phone,
      `🎬 Sending your video: ${gradeTitle(row.grade)} ${row.subject} — ${row.clean_title} …`
    );
  } catch (err) {
    logToFile('Student Videos: pre-delivery ack failed', { error: err.message });
  }
}

// Fire-and-forget R2 → WhatsApp upload (5-15s on the wire). Schedules the
// 30s post-delivery thumbs-up/thumbs-down survey when (and only when) the
// upload succeeds — a failed upload should not produce a feedback prompt
// asking the teacher to rate a video they never received.
function deliverVideoAsync(flowToken, row) {
  const userId = (flowToken || '').split(':')[0];
  (async () => {
    let phone;
    try {
      phone = await getPhoneForUser(userId);
      if (!phone) {
        logToFile('Student Videos: no phone for user', { userId });
        return;
      }
      const caption =
        `📚 ${gradeTitle(row.grade)} · ${row.subject}\n${row.clean_title}`;
      // sendVideoFromUrl RETURNS false on failure rather than throwing, so the
      // try/catch below never saw a failed upload: a teacher who received no
      // video was still counted as delivered and then offered a quiz on it.
      const delivered = await WhatsAppService.sendVideoFromUrl(phone, row.r2_url, caption);
      if (!delivered) {
        logToFile('Student Videos: video upload failed — not offering a quiz for it', {
          userId, videoId: row.id, url: row.r2_url,
        });
        await WhatsAppService.sendMessage(
          phone,
          `Sorry — I couldn't send "${row.clean_title}" just now. Please try /video again in a moment.`
        );
        return;
      }
      logEvent('student_videos.delivered', {
        userId,
        videoId: row.id,
        grade: row.grade,
        subject: row.subject,
        chapter: row.clean_chapter,
        title: row.clean_title,
      });
    } catch (err) {
      logToFile('Student Videos: delivery failed', { userId, videoId: row.id, error: err.message });
      return; // don't schedule feedback for a delivery that failed
    }
    // Post-delivery survey — 30s after upload completes. Language defaults
    // to the teacher's preferred_language; missing user → service falls
    // back to English.
    try {
      const { data: userRow } = await supabase
        .from('users')
        .select('preferred_language')
        .eq('id', userId)
        .maybeSingle();
      const language = userRow?.preferred_language || 'en';

      // record the delivery so we can measure how popular the feature
      // is — videos sent, quizzes offered, quizzes taken — without inferring it
      // from logs. Non-fatal: a tracking failure must never cost the teacher
      // their quiz.
      let deliveryId = null;
      try {
        const { data: del } = await supabase
          .from('video_quiz_deliveries')
          .insert({
            user_id: userId, video_id: row.id, phone, status: 'sent',
            grade: row.grade, subject: row.subject, title: row.clean_title,
          })
          .select('id')
          .single();
        deliveryId = del?.id || null;
      } catch (delErr) {
        logToFile('Student Videos: delivery row insert failed', { error: delErr.message });
      }

      // offer the video's quiz 3 s after delivery.
      //
      // SURVEY SUPPRESSION — the important bit. When a quiz is offered, the
      // standalone 30 s 👍/👎 survey does NOT fire. It is replaced by a survey
      // that covers whatever the teacher actually received: video-only if she
      // declines, video AND quiz if she takes it. Firing both would ask her
      // about the same video twice, 30 seconds apart, before she has even
      // answered the offer.
      const VideoQuizService = require('../services/quiz/video-quiz.service');
      const offered = await VideoQuizService.offerAfterVideo({
        userId, phone, video: row, language, deliveryId,
      });

      if (!offered) {
        StudentVideoFeedbackService.scheduleFeedbackPrompt({
          videoId: row.id,
          userId,
          phone,
          context: {
            grade: row.grade,
            subject: row.subject,
            chapter: row.clean_chapter,
            title: row.clean_title,
            language,
            scope: 'video',
            deliveryId,
          },
        });
      }
    } catch (err) {
      logToFile('Student Videos: post-delivery hook threw', { userId, videoId: row.id, error: err.message });
    }
  })();
}

// Back navigation: return to the first screen's data.
async function handleStudentVideosBack(flowToken, screen) {
  return handleStudentVideosInit(flowToken);
}

module.exports = {
  handleStudentVideosInit,
  handleStudentVideosDataExchange,
  handleStudentVideosBack,
  // exported for tests
  gradeTitle,
  gradeRank,
};
