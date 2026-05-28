/**
 * Coaching Session Service
 * Handles coaching session lifecycle: initiation, confirmation, and state management
 *
 * Responsibilities:
 * - Create new coaching sessions
 * - Handle user confirmation/cancellation
 * - Manage session status and conversation state
 * - Validate user registration before session creation
 *
 * Extracted from coaching.service.js (1,225 lines) as part of Phase 2 refactoring
 */

const supabase = require('../../config/supabase');
const { logToFile } = require('../../utils/logger');
const WhatsAppService = require('../whatsapp.service');
const { getCoachingMessage } = require('../../config/coaching-messages');

class CoachingSessionService {
  /**
   * Initiate a new coaching session
   * @param {string} userId - User's UUID from database
   * @param {string} sessionId - Chat session UUID
   * @param {string} audioId - WhatsApp audio media ID
   * @param {string} from - User's WhatsApp phone number
   * @param {number} audioDuration - Audio duration in seconds
   * @returns {Promise<object|null>} Created coaching session or null if user not registered
   */
  static async initiateSession(userId, sessionId, audioId, from, audioDuration) {
    try {
      logToFile('Initiating coaching session', {
        userId,
        sessionId,
        audioId,
        audioDuration
      });

      // Get user details (registration no longer required upfront - fix)
      // Feature-based registration happens after first feature completion
      const { data: user, error: userError} = await supabase
        .from('users')
        .select('name, first_name, last_name')
        .eq('id', userId)
        .single();

      if (userError || !user) {
        throw new Error('User not found');
      }

      // Create coaching_sessions record
      const { data: coachingSession, error: createError } = await supabase
        .from('coaching_sessions')
        .insert({
          user_id: userId,
          session_id: sessionId,
          audio_id: audioId,
          audio_duration_seconds: audioDuration,
          status: 'initiated',
          conversation_state: {
            current_state: 'AWAITING_CONFIRMATION',
            questions_answered: 0,
            questions: [],
            skipped: false,
            started_at: new Date().toISOString(),
            last_interaction: new Date().toISOString()
          },
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (createError) {
        logToFile('❌ Error creating coaching session', { error: createError });
        throw createError;
      }

      logToFile('✅ Coaching session created', {
        coachingSessionId: coachingSession.id,
        status: coachingSession.status
      });

      // Send confirmation message with buttons
      const confirmationMessage = `I detected a ${Math.round(audioDuration / 60)}-minute audio recording.\n\nIs this classroom audio you'd like me to analyze using research-based pedagogical frameworks?`;

      await WhatsAppService.sendInteractiveButtons(from, {
        body: confirmationMessage,
        buttons: [
          { id: `coaching_confirm_${coachingSession.id}`, title: 'Yes, Analyze' },
          { id: `coaching_cancel_${coachingSession.id}`, title: 'No' }
        ]
      });

      return coachingSession;
    } catch (error) {
      logToFile('❌ Error in initiateSession', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Handle confirmation button response
   * @param {string} coachingSessionId - Coaching session UUID
   * @param {string} from - User's phone number
   * @param {boolean} confirmed - Whether user confirmed
   * @returns {Promise<{confirmed: boolean, session: object|null}>}
   */
  static async handleConfirmation(coachingSessionId, from, confirmed) {
    try {
      logToFile('Handling coaching confirmation', { coachingSessionId, confirmed });

      if (!confirmed) {
        // User declined - update status and exit
        await supabase
          .from('coaching_sessions')
          .update({
            status: 'cancelled',
            completed_at: new Date().toISOString()
          })
          .eq('id', coachingSessionId);

        // Resolve teacher language for the localised cancellation message.
        const { data: userRow } = await supabase
          .from('users')
          .select('preferred_language')
          .eq('id', (await supabase
            .from('coaching_sessions')
            .select('user_id')
            .eq('id', coachingSessionId)
            .maybeSingle()).data?.user_id || '')
          .maybeSingle();
        const lang = userRow?.preferred_language || 'en';
        await WhatsAppService.sendMessage(from, getCoachingMessage('exitedNoAudio', lang));

        return { confirmed: false, session: null };
      }

      // Get coaching session to retrieve audio_id
      const { data: session, error: sessionError } = await supabase
        .from('coaching_sessions')
        .select('*')
        .eq('id', coachingSessionId)
        .single();

      if (sessionError || !session) {
        throw new Error('Coaching session not found');
      }

      // User confirmed - update status
      const { data: updatedSession, error: updateError } = await supabase
        .from('coaching_sessions')
        .update({
          status: 'confirmed',
          confirmed_at: new Date().toISOString(),
          conversation_state: {
            current_state: 'TRANSCRIBING',
            questions_answered: 0,
            questions: [],
            skipped: false,
            started_at: session.conversation_state?.started_at || new Date().toISOString(),
            last_interaction: new Date().toISOString()
          }
        })
        .eq('id', coachingSessionId)
        .select()
        .single();

      if (updateError) {
        throw updateError;
      }

      logToFile('✅ Coaching session confirmed', { coachingSessionId });

      return { confirmed: true, session: updatedSession };
    } catch (error) {
      logToFile('❌ Error in handleConfirmation', {
        coachingSessionId,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Update session status
   * @param {string} coachingSessionId - Coaching session UUID
   * @param {string} status - New status
   * @param {object} updates - Additional fields to update
   * @returns {Promise<object>} Updated session
   */
  static async updateStatus(coachingSessionId, status, updates = {}) {
    try {
      const { data: session, error } = await supabase
        .from('coaching_sessions')
        .update({
          status,
          ...updates
        })
        .eq('id', coachingSessionId)
        .select()
        .single();

      if (error) {
        throw error;
      }

      logToFile('Session status updated', { coachingSessionId, status });
      return session;
    } catch (error) {
      logToFile('❌ Error updating session status', {
        coachingSessionId,
        status,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Update conversation state
   * @param {string} coachingSessionId - Coaching session UUID
   * @param {object} stateUpdates - Partial conversation state updates
   * @returns {Promise<object>} Updated session
   */
  static async updateConversationState(coachingSessionId, stateUpdates) {
    try {
      // Get current state
      const { data: session, error: fetchError } = await supabase
        .from('coaching_sessions')
        .select('conversation_state')
        .eq('id', coachingSessionId)
        .single();

      if (fetchError) {
        throw fetchError;
      }

      // Merge with updates
      const updatedState = {
        ...session.conversation_state,
        ...stateUpdates,
        last_interaction: new Date().toISOString()
      };

      // Update in database
      const { data: updatedSession, error: updateError } = await supabase
        .from('coaching_sessions')
        .update({ conversation_state: updatedState })
        .eq('id', coachingSessionId)
        .select()
        .single();

      if (updateError) {
        throw updateError;
      }

      logToFile('Conversation state updated', { coachingSessionId, stateUpdates });
      return updatedSession;
    } catch (error) {
      logToFile('❌ Error updating conversation state', {
        coachingSessionId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get session by ID
   * @param {string} coachingSessionId - Coaching session UUID
   * @returns {Promise<object>} Session data
   */
  static async getSession(coachingSessionId) {
    try {
      const { data: session, error } = await supabase
        .from('coaching_sessions')
        .select('*')
        .eq('id', coachingSessionId)
        .single();

      if (error) {
        throw error;
      }

      return session;
    } catch (error) {
      logToFile('❌ Error fetching session', {
        coachingSessionId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Mark session as failed
   * @param {string} coachingSessionId - Coaching session UUID
   * @param {string} failedStep - Step where failure occurred
   * @param {string} errorMessage - Error message
   * @returns {Promise<object>} Updated session
   */
  static async markAsFailed(coachingSessionId, failedStep, errorMessage) {
    try {
      const { data: session, error } = await supabase
        .from('coaching_sessions')
        .update({
          status: 'failed',
          failed_step: failedStep,
          error_message: errorMessage,
          completed_at: new Date().toISOString()
        })
        .eq('id', coachingSessionId)
        .select()
        .single();

      if (error) {
        throw error;
      }

      logToFile('Session marked as failed', {
        coachingSessionId,
        failedStep,
        errorMessage
      });

      return session;
    } catch (error) {
      logToFile('❌ Error marking session as failed', {
        coachingSessionId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Mark session as completed
   * @param {string} coachingSessionId - Coaching session UUID
   * @param {object} completionData - Data to include on completion
   * @returns {Promise<object>} Updated session
   */
  static async markAsCompleted(coachingSessionId, completionData = {}) {
    try {
      const { data: session, error } = await supabase
        .from('coaching_sessions')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          ...completionData
        })
        .eq('id', coachingSessionId)
        .select()
        .single();

      if (error) {
        throw error;
      }

      logToFile('✅ Session marked as completed', { coachingSessionId });
      return session;
    } catch (error) {
      logToFile('❌ Error marking session as completed', {
        coachingSessionId,
        error: error.message
      });
      throw error;
    }
  }
}

module.exports = CoachingSessionService;
