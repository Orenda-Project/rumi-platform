/**
 * Kie.ai Handoff Service
 *
 * The orchestrator: receives the Flow form submission, sends the upfront
 * wait message in the teacher's language, enqueues an SQS job, returns
 * immediately. The actual generation runs on a worker replica via
 * workers/pic-lp-kieai.worker.js.
 *
 * Replaces the synchronous Gamma path (lp-handoff.service.js) when
 * app_settings.pic_lp_backend_ab routes to 'kieai'.
 */

const SQSQueueService = require('../queue');
const WhatsAppService = require('../whatsapp.service');
const PicLpSession = require('./pic-lp-session.service');
const PicLpLatency = require('./pic-lp-latency.service');
const PicLpWaitMessage = require('./pic-lp-wait-message.service');
const supabase = require('../../config/supabase');
const { logToFile } = require('../../utils/logger');
const { logEvent } = require('../../utils/structured-logger');

const SQS_JOB_TYPE = 'pic_lp_kieai_generation';

/**
 * Enqueue a pic-LP kieai generation job + send the upfront wait message.
 * Returns immediately — does NOT wait for Kie.ai. The web replica is
 * freed in ~100ms regardless of Kie.ai latency (4-7 min for Urdu).
 *
 * @param {Object} args
 * @param {Object} args.session - pic_lp_sessions row
 * @param {Object} args.formData - { grade, subject, topic, language }
 * @param {string} args.from - Teacher's WhatsApp phone
 */
async function enqueueAndAck({ session, formData, from }) {
  // Update session state to 'queued' (transitioning from awaiting_form_submit).
  // Note: pic_lp_sessions.status CHECK includes 'generating' but not 'queued'.
  // Reuse 'generating' as the state machine value — the worker updates to
  // 'handed_off' on success / 'failed' on error.
  await PicLpSession.updateStatus(session.id, 'generating', {
    detected: { ...(session.detected || {}), ...formData },
  });

  // System messages (wait + feedback prompts) use the teacher's
  // user.preferred_language, NOT the LP-content language from the form. These
  // are different things: a teacher who prefers an English UI may still want an
  // Urdu lesson plan.
  let userPreferredLang = 'en';
  try {
    const { data: userRow } = await supabase
      .from('users')
      .select('preferred_language')
      .eq('id', session.user_id)
      .maybeSingle();
    if (userRow?.preferred_language) userPreferredLang = userRow.preferred_language;
  } catch (e) {
    logToFile('Pic-LP: user lookup soft-failed (defaulting to en)', { sessionId: session.id, error: e.message });
  }
  // The wait-message TIMING depends on the BACKEND, and the backend is selected
  // from the CONTENT language (formData.language → 1K vs 2K, see
  // kieai-client.pickBackend). So we split: the message TEXT uses the system
  // language (preferred_language), but the message TIMING uses the content
  // language. Without this split, an English-locked teacher who generates a
  // Sindhi LP sees "~90 seconds" in English when actual generation is ~4 min.
  const systemLanguage = userPreferredLang;
  const contentLanguage = formData?.language || userPreferredLang;
  const sourceForStats = 'pic_to_lp_kieai';

  let dbStats = null;
  try {
    dbStats = await PicLpLatency.getStats(sourceForStats);
  } catch (e) {
    // Soft-fail — fall through to fallback values from pickBackend()
    logToFile('Pic-LP latency lookup soft-failed (using fallback)', {
      error: e.message, sessionId: session.id,
    });
  }

  const waitMessage = PicLpWaitMessage.buildWaitMessage({
    systemLanguage,
    contentLanguage,
    dbStats,
  });
  await WhatsAppService.sendMessage(from, waitMessage);

  // Enqueue the SQS job. Worker replica picks it up, runs Kie.ai, assembles
  // the PDF, delivers it, INSERTs into lesson_plans, schedules feedback.
  const payload = {
    sessionId: session.id,
    formData,
    from,
    enqueuedAt: Date.now(),
  };

  try {
    await SQSQueueService.queueCoachingJob(session.id, SQS_JOB_TYPE, payload);
  } catch (e) {
    // SQS enqueue failure is rare but recoverable — surface to teacher,
    // mark session failed so the stale-session worker doesn't loop on it.
    logToFile('Pic-LP SQS enqueue failed', {
      error: e.message, sessionId: session.id,
    });
    await PicLpSession.updateStatus(session.id, 'failed', {
      last_error: `SQS enqueue: ${e.message}`,
    });
    const lang = contentLanguage;
    const isUrdu = lang === 'ur' || lang === 'sd' || lang === 'pa';
    await WhatsAppService.sendMessage(from, isUrdu
      ? '⚠️ معذرت، لیسن پلان بنانے میں مسئلہ آیا۔ براہ کرم دوبارہ کوشش کریں۔'
      : '⚠️ Sorry, I had trouble queueing your lesson plan. Please try again.');
    logEvent('pic_lp.enqueue_failed', {
      sessionId: session.id, from, error: e.message,
    });
    return { success: false, error: e.message };
  }

  logEvent('pic_lp.enqueued_for_kieai', {
    sessionId: session.id, from,
    grade: formData.grade, subject: formData.subject, language: formData.language,
    topic: formData.topic,
  });

  return { success: true, queued: true };
}

module.exports = { enqueueAndAck, SQS_JOB_TYPE };
