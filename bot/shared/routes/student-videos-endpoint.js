/**
 * Student Videos Flow Endpoint
 *
 * Screens: SELECT_GRADE → SELECT_SUBJECT → SELECT_TOPIC → SUCCESS
 *
 * Lets a teacher browse the student_videos library by grade → subject →
 * video, then delivers the chosen video to their chat and schedules a
 * post-delivery 👍/👎 survey.
 *
 * The video list is labelled by `subtopic` (falling back to `topic`), grouped
 * by `topic`; the chapter prefix is shown only when ≥ 2 videos share a topic.
 * SELECT_TOPIC's payload carries the video row id directly (no fragile text
 * re-resolution). A "Sending your video…" ack is dispatched before the async
 * upload so the teacher sees instant acknowledgement during the upload window.
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

// The per-video display label: the specific subtopic when present, else the topic.
const videoTitle = (r) => (r.subtopic && r.subtopic.trim()) ? r.subtopic : (r.topic || 'Untitled');

async function fetchVideos(filter = {}) {
  let q = supabase
    .from('student_videos')
    .select('id,grade,subject,topic,subtopic,video_url');
  for (const [k, v] of Object.entries(filter)) q = q.eq(k, v);
  const { data, error } = await q;
  if (error) {
    logToFile('Student Videos: supabase error', { error: error.message, filter });
    return [];
  }
  // Only rows with a playable URL are deliverable.
  return (data || []).filter((r) => r.video_url);
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
  const rows = await fetchVideos();
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
  const rows = await fetchVideos({ grade });
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

// SELECT_SUBJECT → SELECT_TOPIC (single combined list, topic as inline prefix)
async function selectSubject(screenData) {
  const grade = screenData && screenData.grade;
  const subject = screenData && screenData.subject;
  if (!grade || !subject) return { data: { error: { message: 'Please select a subject.' } } };
  const rows = await fetchVideos({ grade, subject });
  if (rows.length === 0) {
    return { data: { error: { message: `No ${subject} videos for ${gradeTitle(grade)} yet.` } } };
  }

  // Count topic sizes so we know whether to render the topic prefix.
  // Prefix shown ONLY when ≥ 2 videos share the topic (otherwise it's noise).
  const topicCount = new Map();
  for (const r of rows) {
    const t = r.topic || '';
    topicCount.set(t, (topicCount.get(t) || 0) + 1);
  }

  // Sort by (topic, title) so grouped videos cluster visually.
  rows.sort((a, b) => {
    const at = (a.topic || '').toLowerCase();
    const bt = (b.topic || '').toLowerCase();
    if (at !== bt) return at < bt ? -1 : 1;
    const al = videoTitle(a).toLowerCase();
    const bl = videoTitle(b).toLowerCase();
    return al < bl ? -1 : al > bl ? 1 : 0;
  });

  const videos = rows.map((r) => {
    const title = videoTitle(r);
    const topic = r.topic;
    const show_prefix = topic && topic.toLowerCase() !== title.toLowerCase() &&
      (topicCount.get(topic) || 0) >= 2;
    return {
      id: r.id, // pass the row id directly — no fragile text re-resolution.
      title: show_prefix ? `${topic} · ${title}` : title,
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
    .select('id,grade,subject,topic,subtopic,video_url')
    .eq('id', videoId)
    .single();
  if (error || !row || !row.video_url) {
    logToFile('Student Videos: row lookup failed', { videoId, error: error?.message });
    return { data: { error: { message: 'That video is not available right now.' } } };
  }

  await sendPreDeliveryAck(flowToken, row);
  deliverVideoAsync(flowToken, row);

  return {
    screen: 'SUCCESS',
    data: {
      message: `Your video "${videoTitle(row)}" (${gradeTitle(row.grade)} ${row.subject}) is on its way!`,
    },
  };
}

// Immediate chat ack so the teacher sees feedback during the upload window.
async function sendPreDeliveryAck(flowToken, row) {
  const userId = (flowToken || '').split(':')[0];
  try {
    const phone = await getPhoneForUser(userId);
    if (!phone) return;
    await WhatsAppService.sendMessage(
      phone,
      `🎬 Sending your video: ${gradeTitle(row.grade)} ${row.subject} — ${videoTitle(row)} …`
    );
  } catch (err) {
    logToFile('Student Videos: pre-delivery ack failed', { error: err.message });
  }
}

// Fire-and-forget upload. Schedules the 30s post-delivery survey ONLY when the
// upload succeeds — a failed upload should not ask the teacher to rate a video
// they never received.
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
      const caption = `📚 ${gradeTitle(row.grade)} · ${row.subject}\n${videoTitle(row)}`;
      await WhatsAppService.sendVideoFromUrl(phone, row.video_url, caption);
      logEvent('student_videos.delivered', {
        userId,
        videoId: row.id,
        grade: row.grade,
        subject: row.subject,
        topic: row.topic,
        subtopic: row.subtopic,
      });
    } catch (err) {
      logToFile('Student Videos: delivery failed', { userId, videoId: row.id, error: err.message });
      return; // don't schedule feedback for a delivery that failed
    }
    // Post-delivery survey — 30s after upload completes.
    try {
      const { data: userRow } = await supabase
        .from('users')
        .select('preferred_language')
        .eq('id', userId)
        .maybeSingle();
      const language = userRow?.preferred_language || 'en';
      StudentVideoFeedbackService.scheduleFeedbackPrompt({
        videoId: row.id,
        userId,
        phone,
        context: {
          grade: row.grade,
          subject: row.subject,
          topic: row.topic,
          subtopic: row.subtopic,
          language,
        },
      });
    } catch (err) {
      logToFile('Student Videos: scheduleFeedbackPrompt threw', { userId, videoId: row.id, error: err.message });
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
  videoTitle,
};
