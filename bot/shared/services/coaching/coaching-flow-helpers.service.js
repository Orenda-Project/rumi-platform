/**
 * Coaching Flow Helpers
 *
 * Shared helper functions used by whatsapp-bot.js button handlers
 * to orchestrate the Phase 3 coaching flow transitions.
 *
 * Phase 3: bd-631 (LP selection), bd-630 (photo handlers)
 */

const supabase = require('../../config/supabase');
const { logToFile } = require('../../utils/logger');
const WhatsAppService = require('../whatsapp.service');
const CoachingSessionService = require('./coaching-session.service');
const { getUserLanguage } = require('../../utils/language-cache');
const { buildLPSelectionList } = require('./lp-coaching/lp-selection-list.service');

/**
 * Proceed from photo step to LP selection step.
 * Fetches recent LPs and sends interactive list (or fallback buttons).
 *
 * @param {string} coachingSessionId - Session UUID
 * @param {string} from - Phone number
 * @param {object} user - User object with id
 */
async function proceedToLPSelection(coachingSessionId, from, user) {
  const language = await getUserLanguage(user.id) || 'en';

  // Fetch recent 5 LPs for this teacher
  const { data: recentLPs } = await supabase
    .from('lesson_plans')
    .select('id, topic, grade, subject, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(5);

  const selection = buildLPSelectionList(coachingSessionId, recentLPs || [], language);

  if (selection.type === 'list') {
    await WhatsAppService.sendInteractiveMessage(from, selection.listData);
  } else {
    // Fallback: 0 LPs → Yes/No buttons (backwards compatible)
    await WhatsAppService.sendInteractiveButtons(from, {
      body: selection.body,
      buttons: selection.buttons,
    });
  }

  await CoachingSessionService.updateConversationState(coachingSessionId, {
    current_state: 'AWAITING_LP_SELECTION',
  });
  await CoachingSessionService.updateStatus(coachingSessionId, 'awaiting_lesson_plan');

  logToFile('LP selection sent', {
    coachingSessionId,
    type: selection.type,
    lpCount: recentLPs?.length || 0,
  });
}

module.exports = { proceedToLPSelection };
