'use strict';
/**
 * Two-button confirmation router for natural-language
 * quiz intent.
 *
 * When a teacher writes "Quiz on photosynthesis" or "Create a quiz for
 * grade 5", text-message.handler.js stashes the topic + language in
 * Redis under quiz_intent_pending:<userId> (30-min TTL) and shows two
 * interactive buttons:
 *
 *   [ Send to class ]    handleConfirmationButton('quiz_send_to_class')
 *   [ Show in chat ]     handleConfirmationButton('quiz_show_in_chat')
 *
 * "Send to class" runs the readiness gate — if the teacher
 * has no class / no students / no parent phones, we route her into the
 * smallest gap-filler Flow and stash the original quiz topic in
 * pending_quiz_resume:<userId> so the post-Flow completion handler
 * (in flow-response.handler.js) can pick up where we left off.
 *
 * "Show in chat" generates the quiz inline (no parent broadcast) using
 * QuizGenerationService with listId=null + quiz_source='in_chat_preview'.
 */

const { checkQuizReadiness } = require('./quiz-readiness.service');
const RedisService = require('../cache/railway-redis.service');
const WhatsAppService = require('../whatsapp.service');
const supabase = require('../../config/supabase');
const { logToFile } = require('../../utils/logger');

const PENDING_INTENT_KEY = (userId) => `quiz_intent_pending:${userId}`;
const PENDING_RESUME_KEY = (userId) => `pending_quiz_resume:${userId}`;
const RESUME_TTL_SEC = 30 * 60;

const COPY = {
  no_class: {
    en: (topic) => `First, let's set up your class. Once it's ready, I'll come back to your quiz on "${topic}".`,
    ur: (topic) => `پہلے اپنی کلاس بنائیں۔ تیار ہوتے ہی میں آپ کا "${topic}" کا کوئز بھیج دوں گی۔`
  },
  no_students: {
    en: (topic) => `Your class is set up — but it has no students yet. Add at least one student with their parent's WhatsApp number, and I'll come back to your quiz on "${topic}".`,
    ur: (topic) => `آپ کی کلاس تیار ہے لیکن ابھی کوئی طالب علم نہیں۔ کم از کم ایک طالب علم اور والدین کا واٹس ایپ نمبر شامل کریں، پھر میں "${topic}" کا کوئز بھیجوں گی۔`
  },
  no_phones: {
    en: (topic) => `Your students don't have parent WhatsApp numbers yet. Add at least one parent phone so I can send the quiz on "${topic}".`,
    ur: (topic) => `آپ کے طالب علموں کے والدین کے واٹس ایپ نمبر نہیں ہیں۔ کم از کم ایک نمبر شامل کریں تاکہ میں "${topic}" کا کوئز بھیج سکوں۔`
  },
  resumed: {
    en: (topic) => `Class is set up — let's send your quiz on "${topic}" now!`,
    ur: (topic) => `کلاس تیار ہے — اب چلیں "${topic}" کا کوئز بھیجتے ہیں!`
  },
  show_in_chat_intro: {
    en: (topic) => `Generating a 5-question preview quiz on "${topic}"…`,
    ur: (topic) => `"${topic}" پر 5 سوالات کا پیش نظری کوئز تیار کر رہی ہوں…`
  }
};

function _copy(key, lang) {
  return (COPY[key] && (COPY[key][lang] || COPY[key].en)) || COPY[key].en;
}

async function _redisGet(key) {
  try {
    if (typeof RedisService.get === 'function') return await RedisService.get(key);
    if (RedisService.redis && typeof RedisService.redis.get === 'function') return await RedisService.redis.get(key);
  } catch (_) {}
  return null;
}

async function _redisSet(key, value, ttlSec) {
  try {
    if (typeof RedisService.set === 'function') return await RedisService.set(key, value, ttlSec);
    if (RedisService.redis && typeof RedisService.redis.setex === 'function') return await RedisService.redis.setex(key, ttlSec, value);
  } catch (_) {}
  return null;
}

async function _redisDel(key) {
  try {
    if (typeof RedisService.del === 'function') return await RedisService.del(key);
    if (RedisService.redis && typeof RedisService.redis.del === 'function') return await RedisService.redis.del(key);
  } catch (_) {}
  return null;
}

/**
 * Read the stashed { topic, language } the handler set when it showed
 * the two buttons. Returns { topic, language } or null if expired/missing.
 *
 * RailwayRedisService.get auto-JSON.parses values it stored
 * earlier — so `raw` may already be an object. The pre-fix code did
 * JSON.parse(rawObject) → SyntaxError → silent catch → returned null
 * → caller fell back to `{ topic: '' }` → off-topic Pakistan-trivia
 * preview. Now we accept both shapes.
 */
async function _readPendingIntent(userId) {
  const raw = await _redisGet(PENDING_INTENT_KEY(userId));
  if (raw == null) return null;
  let parsed = raw;
  if (typeof raw === 'string') {
    try { parsed = JSON.parse(raw); } catch (_) { return null; }
  }
  if (parsed && typeof parsed === 'object' && typeof parsed.topic === 'string') return parsed;
  return null;
}

/**
 * Open the existing Quiz Manager Flow with the topic pre-filled.
 * Falls back to a plain message if QUIZ_FLOW_ID isn't configured (very
 * old deployments).
 */
async function _openQuizManagerFlow(user, from, topic) {
  const { QUIZ_FLOW_ID } = require('../../utils/constants');
  if (!QUIZ_FLOW_ID) {
    await WhatsAppService.sendMessage(from,
      `Sorry, the quiz feature isn't fully configured here. Please try /quiz manually.`);
    return;
  }
  await WhatsAppService.sendFlow(from, {
    flowId: QUIZ_FLOW_ID,
    flowToken: user.id,
    header: 'Quiz',
    body: topic ? `Quiz on "${topic}" — pick the class to send it to.` : 'Manage your quizzes.',
    footer: 'Powered by Rumi',
    buttonText: 'Open quiz menu'
  });
  logToFile('✅ Quiz Manager Flow opened (post-confirmation)', { userId: user.id, topic });
}

async function _openAddClassFlow(user, from) {
  const { ATTENDANCE_SETUP_FLOW_ID } = require('../../utils/constants');
  if (!ATTENDANCE_SETUP_FLOW_ID) {
    await WhatsAppService.sendMessage(from, "Sorry, class setup isn't available right now.");
    return;
  }
  await WhatsAppService.sendFlow(from, {
    flowId: ATTENDANCE_SETUP_FLOW_ID,
    header: '📋 Add New Class',
    body: "Let's set up your class so we can send the quiz to parents.",
    buttonText: 'Add Class',
    screen: 'CLASS_INFO',
    flowToken: user.id
  });
}

async function _openEditClassFlow(user, from, cls, focus) {
  const { EDIT_CLASS_FLOW_ID } = require('../../utils/constants');
  if (!EDIT_CLASS_FLOW_ID) {
    await WhatsAppService.sendMessage(from, "Sorry, class editing isn't available right now.");
    return;
  }
  const display = cls.section ? `${cls.class_name} - ${cls.section}` : cls.class_name;
  await WhatsAppService.sendFlow(from, {
    flowId: EDIT_CLASS_FLOW_ID,
    header: '📋 Edit Class',
    body: `Edit roster for ${display}`,
    buttonText: 'Edit Class',
    flowToken: `${user.id}:${cls.id}`
  });
  // Note: Edit Class flow opens on its own intro screen — the focus
  // hint is recorded in the resume key for downstream visibility but
  // doesn't change the flow itself today.
  logToFile('📋 Edit Class flow opened (readiness gate)', { userId: user.id, classId: cls.id, focus });
}

/**
 * "Send to class" tap → run the readiness gate, route accordingly.
 */
async function _handleSendToClass(user, from, intent) {
  const { topic, language } = intent;

  const readiness = await checkQuizReadiness(user.id);

  if (readiness.gate === 'ready') {
    await _redisDel(PENDING_INTENT_KEY(user.id));
    await _openQuizManagerFlow(user, from, topic);
    return;
  }

  // Stash topic + language so the Add/Edit-Class completion handler can resume
  await _redisSet(PENDING_RESUME_KEY(user.id), JSON.stringify({ topic, language, gate: readiness.gate }), RESUME_TTL_SEC);

  const lang = language || 'en';
  if (readiness.gate === 'no_class') {
    await WhatsAppService.sendMessage(from, _copy('no_class', lang)(topic));
    await _openAddClassFlow(user, from);
    return;
  }

  // For no_students / no_phones we need to pick a class to edit.
  // If exactly one — open it directly. If multiple — send a message asking
  // teacher to start with one (UI for picker is already handled by the
  // existing Edit Class button list elsewhere; for the readiness gate we
  // pick the most-recently-created class as the canonical first target).
  const cls = (readiness.classes && readiness.classes[0]) || null;
  if (!cls) {
    await WhatsAppService.sendMessage(from, _copy('no_students', lang)(topic));
    return;
  }

  await WhatsAppService.sendMessage(from,
    readiness.gate === 'no_phones' ? _copy('no_phones', lang)(topic) : _copy('no_students', lang)(topic)
  );
  await _openEditClassFlow(user, from, cls, readiness.gate === 'no_phones' ? 'EDIT_PHONES' : 'ADD_STUDENTS');
}

/**
 * "Show in chat" tap → generate a 5-question preview quiz inline.
 * No parent broadcast, no quiz_sessions rows, no SQS jobs.
 */
async function _handleShowInChat(user, from, intent) {
  const { topic, language } = intent;
  const lang = language || 'en';

  await WhatsAppService.sendMessage(from, _copy('show_in_chat_intro', lang)(topic));

  // Generate via the existing service with listId=null + the new
  // 'in_chat_preview' quiz_source. The service already supports nullable
  // list_id (DB FK is ON DELETE SET NULL); we just need to make sure we
  // skip the delivery step. Generation orchestrator: write quiz row +
  // questions → return quizId. Then we render inline.
  const QuizGenerationService = require('./quiz-generation.service');
  let quizId = null;
  try {
    quizId = await QuizGenerationService.generateAndStore({
      teacherId: user.id,
      listId: null,
      lessonPlanId: null,
      topic,
      grade: null,
      subject: null,
      sourceContent: null,
      quizSource: 'in_chat_preview',
      language: lang
    });
  } catch (err) {
    logToFile('❌ in_chat_preview quiz generation failed', { userId: user.id, topic, error: err.message });
    await WhatsAppService.sendMessage(from,
      ({ ur: 'معذرت، کوئز بنانے میں مسئلہ ہوا۔ دوبارہ کوشش کریں یا /quiz لکھیں۔', en: "Sorry, the preview quiz failed to generate. Try again or type /quiz." })[lang] || "Sorry, the preview quiz failed to generate. Try again or type /quiz.");
    return;
  }

  // Pull the questions and render them as a single text bubble.
  const { data: questions } = await supabase
    .from('quiz_questions')
    .select('question_text, option_a, option_b, option_c, correct_option, sort_order')
    .eq('quiz_id', quizId)
    .order('sort_order', { ascending: true });

  if (!questions || questions.length === 0) {
    await WhatsAppService.sendMessage(from,
      ({ ur: 'معذرت، کوئی سوال نہیں بنا۔', en: "Sorry, no questions were generated." })[lang] || "Sorry, no questions were generated.");
    return;
  }

  const previewLines = [];
  previewLines.push(({ ur: `📝 *"${topic}" — پیش نظری کوئز*`, en: `📝 *Preview quiz: "${topic}"*` })[lang] || `📝 *Preview quiz: "${topic}"*`);
  previewLines.push('');
  questions.slice(0, 5).forEach((q, i) => {
    previewLines.push(`*${i + 1}. ${q.question_text}*`);
    previewLines.push(`A. ${q.option_a}`);
    previewLines.push(`B. ${q.option_b}`);
    previewLines.push(`C. ${q.option_c}`);
    previewLines.push(`✓ ${({ ur: 'درست جواب', en: 'Correct' })[lang] || 'Correct'}: *${q.correct_option}*`);
    previewLines.push('');
  });
  await WhatsAppService.sendMessage(from, previewLines.join('\n'));

  // Offer a one-tap path to send to a class
  await WhatsAppService.sendInteractiveButtons(from, {
    body: ({ ur: 'یہ کوئز کلاس کو بھیجنا چاہیں؟', en: 'Want to send this quiz to a class?' })[lang] || 'Want to send this quiz to a class?',
    buttons: [
      { id: 'quiz_send_to_class', title: ({ ur: 'کلاس کو بھیجیں', en: 'Send to class' })[lang] || 'Send to class' }
    ]
  });

  await _redisDel(PENDING_INTENT_KEY(user.id));
  logToFile('✅ Show-in-chat preview rendered', { userId: user.id, quizId, count: questions.length });
}

/**
 * Public entry called from whatsapp-bot.js button-reply branch.
 *
 * @param {string} buttonId — 'quiz_send_to_class' | 'quiz_show_in_chat'
 * @param {Object|null} user — users row (must be present)
 * @param {string} from — recipient phone (E.164)
 */
async function handleConfirmationButton(buttonId, user, from) {
  if (!user || !user.id) {
    logToFile('⚠️ quiz intent button tapped without user — ignoring', { buttonId, from });
    return;
  }

  const intent = (await _readPendingIntent(user.id)) || { topic: '', language: 'en' };

  if (buttonId === 'quiz_send_to_class') {
    await _handleSendToClass(user, from, intent);
  } else if (buttonId === 'quiz_show_in_chat') {
    await _handleShowInChat(user, from, intent);
  } else {
    logToFile('⚠️ quiz intent: unknown button id', { buttonId });
  }
}

/**
 * Called from flow-response.handler.js when an Add Class or Edit Class
 * Flow completes. Checks the pending_quiz_resume:<userId> key and, if
 * present, resumes the original quiz request by opening the Quiz Manager
 * Flow with the original topic.
 */
async function tryResumeAfterClassFlow(user, from) {
  if (!user || !user.id) return false;
  const raw = await _redisGet(PENDING_RESUME_KEY(user.id));
  if (raw == null) return false;
  // same RailwayRedisService.get auto-parse fix as _readPendingIntent.
  let parsed = raw;
  if (typeof raw === 'string') {
    try { parsed = JSON.parse(raw); } catch (_) { parsed = null; }
  }
  if (!parsed || typeof parsed !== 'object' || !parsed.topic) {
    await _redisDel(PENDING_RESUME_KEY(user.id));
    return false;
  }

  // Re-check readiness in case the flow didn't actually fix it
  const readiness = await checkQuizReadiness(user.id);
  if (readiness.gate !== 'ready') {
    // Don't resume yet — leave the pending key in place; teacher can
    // re-tap "Send to class" or finish the setup flow.
    logToFile('ℹ️ Quiz resume deferred — readiness still not ready', { userId: user.id, gate: readiness.gate });
    return false;
  }

  const lang = parsed.language || 'en';
  await WhatsAppService.sendMessage(from, _copy('resumed', lang)(parsed.topic));
  await _openQuizManagerFlow(user, from, parsed.topic);
  await _redisDel(PENDING_RESUME_KEY(user.id));
  logToFile('✅ Quiz resumed after class setup', { userId: user.id, topic: parsed.topic });
  return true;
}

module.exports = {
  handleConfirmationButton,
  tryResumeAfterClassFlow,
  // Exposed for tests
  _PENDING_INTENT_KEY: PENDING_INTENT_KEY,
  _PENDING_RESUME_KEY: PENDING_RESUME_KEY,
  _RESUME_TTL_SEC: RESUME_TTL_SEC,
  _COPY: COPY
};
