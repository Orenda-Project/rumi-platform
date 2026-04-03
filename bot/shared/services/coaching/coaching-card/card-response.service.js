/**
 * Coaching Card Response Service
 *
 * Handles teacher button responses to the coaching card.
 * Stores response in coaching_sessions.prioritized_action.
 *
 * Bead: bd-617 (Phase 1C-C)
 */

const supabase = require('../../../config/supabase');
const { logToFile } = require('../../../utils/logger');

/**
 * Handle a coaching card button response.
 *
 * @param {string} coachingSessionId - Session UUID
 * @param {string} response - Button response: 'yes' | 'later' | 'no'
 * @returns {Promise<{ teacher_response: string, responded_at: string }>}
 */
async function handleCoachingCardResponse(coachingSessionId, response) {
  const responseData = {
    teacher_response: response,
    responded_at: new Date().toISOString(),
  };

  try {
    // Merge response into existing prioritized_action JSONB
    const { data: session } = await supabase
      .from('coaching_sessions')
      .select('prioritized_action')
      .eq('id', coachingSessionId)
      .single();

    const existingAction = session?.prioritized_action || {};
    const updated = { ...existingAction, ...responseData };

    await supabase
      .from('coaching_sessions')
      .update({ prioritized_action: updated })
      .eq('id', coachingSessionId);

    logToFile('Coaching card response recorded', {
      coachingSessionId,
      response,
    });
  } catch (error) {
    logToFile('Error storing coaching card response', {
      error: error.message,
      coachingSessionId,
    });
  }

  return responseData;
}

module.exports = { handleCoachingCardResponse };
