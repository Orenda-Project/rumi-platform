/**
 * Database-Based Comprehension Flow State Management
 *
 * Bug #17 Fix: Replaced Redis with database for reliable state persistence
 *
 * Purpose: Track active comprehension question flows using Supabase
 * Pattern: Database is single source of truth - no Redis state to lose
 *
 * Key insight: current_question_index = comprehension_answers.length
 *
 * History:
 * - Original: Redis-based (Bug #33 fix for context_data)
 * - Updated: Database-based (Bug #17 fix for Redis state loss)
 */

const { createClient } = require('@supabase/supabase-js');
const { logToFile } = require('../utils/logger');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

class RedisComprehensionService {
  /**
   * Start a new comprehension flow
   * Bug #17 Fix: Now stores in database instead of Redis
   * @param {string} assessmentId - Reading assessment UUID
   * @param {Array} questions - Array of 5 comprehension questions
   * @param {string} userId - User UUID for ownership tracking
   * @returns {Object} Initial flow state
   */
  static async startFlow(assessmentId, questions, userId) {
    try {
      // Update assessment with comprehension questions and set status
      const { error } = await supabase
        .from('reading_assessments')
        .update({
          comprehension_questions: questions,
          comprehension_answers: [],
          status: 'comprehension_in_progress'
        })
        .eq('id', assessmentId);

      if (error) {
        throw new Error(`Failed to start comprehension flow: ${error.message}`);
      }

      const state = {
        assessment_id: assessmentId,
        user_id: userId,
        questions: questions,
        current_question_index: 0,
        answers: [],
        started_at: Date.now()
      };

      logToFile('Started comprehension flow in DATABASE (Bug #17 fix)', {
        assessmentId,
        questionCount: questions.length,
        userId
      });

      return state;
    } catch (error) {
      logToFile('Error starting comprehension flow', {
        assessmentId,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Get active comprehension flow by assessment ID
   * Bug #17 Fix: Reads from database instead of Redis
   * @param {string} assessmentId - Reading assessment UUID
   * @returns {Object|null} Flow state or null if not found
   */
  static async getActiveFlow(assessmentId) {
    try {
      const { data: assessment, error } = await supabase
        .from('reading_assessments')
        .select('id, user_id, comprehension_questions, comprehension_answers, status, created_at')
        .eq('id', assessmentId)
        .eq('status', 'comprehension_in_progress')
        .single();

      if (error || !assessment) {
        logToFile('No active comprehension flow found for assessment', {
          assessmentId,
          error: error?.message
        });
        return null;
      }

      // Reconstruct flow state from database
      const state = {
        assessment_id: assessment.id,
        user_id: assessment.user_id,
        questions: assessment.comprehension_questions || [],
        current_question_index: (assessment.comprehension_answers || []).length,
        answers: assessment.comprehension_answers || [],
        started_at: new Date(assessment.created_at).getTime()
      };

      return state;
    } catch (error) {
      logToFile('Error getting comprehension flow', {
        assessmentId,
        error: error.message
      });
      return null;
    }
  }

  /**
   * Find active comprehension flow by user ID
   * Bug #17 Fix: Queries database instead of scanning Redis keys
   * Used when voice/text message arrives without assessment context
   * @param {string} userId - User UUID
   * @returns {Object|null} Flow state or null if not found
   */
  static async findActiveFlowByUser(userId) {
    try {
      const { data: assessment, error } = await supabase
        .from('reading_assessments')
        .select('id, user_id, comprehension_questions, comprehension_answers, status, created_at')
        .eq('user_id', userId)
        .eq('status', 'comprehension_in_progress')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error || !assessment) {
        logToFile('No active comprehension flows found for user (DB query)', {
          userId,
          error: error?.message
        });
        return null;
      }

      // Reconstruct flow state from database
      const state = {
        assessment_id: assessment.id,
        user_id: assessment.user_id,
        questions: assessment.comprehension_questions || [],
        current_question_index: (assessment.comprehension_answers || []).length,
        answers: assessment.comprehension_answers || [],
        started_at: new Date(assessment.created_at).getTime()
      };

      logToFile('Found active comprehension flow for user (DB)', {
        userId,
        assessmentId: state.assessment_id,
        currentQuestion: state.current_question_index + 1,
        totalQuestions: state.questions.length
      });

      return state;
    } catch (error) {
      logToFile('Error finding comprehension flow by user', {
        userId,
        error: error.message
      });
      return null;
    }
  }

  /**
   * Record a comprehension answer and advance to next question
   * Bug #17 Fix: Writes directly to database instead of Redis
   * @param {string} assessmentId - Reading assessment UUID
   * @param {Object} answerResult - Answer data with transcript, analysis, correctness
   * @returns {Object} Updated flow state
   */
  static async recordAnswer(assessmentId, answerResult) {
    try {
      // Get current state from database
      const state = await this.getActiveFlow(assessmentId);

      if (!state) {
        throw new Error(`No active comprehension flow found for assessment ${assessmentId}`);
      }

      // Build new answer object
      const newAnswer = {
        question_number: state.current_question_index + 1,
        question_text: state.questions[state.current_question_index]?.question || '',
        ...answerResult,
        answered_at: Date.now()
      };

      // Add answer to array
      const updatedAnswers = [...state.answers, newAnswer];
      const newQuestionIndex = state.current_question_index + 1;
      const isComplete = newQuestionIndex >= state.questions.length;

      // Update database
      const { error } = await supabase
        .from('reading_assessments')
        .update({
          comprehension_answers: updatedAnswers,
          // Keep status as comprehension_in_progress until finalized by handler
          status: 'comprehension_in_progress'
        })
        .eq('id', assessmentId);

      if (error) {
        throw new Error(`Failed to record answer: ${error.message}`);
      }

      // Return updated state
      const updatedState = {
        ...state,
        current_question_index: newQuestionIndex,
        answers: updatedAnswers
      };

      logToFile('Recorded comprehension answer (DB)', {
        assessmentId,
        questionNumber: newAnswer.question_number,
        totalQuestions: state.questions.length,
        correct: answerResult.correct,
        isComplete
      });

      return updatedState;
    } catch (error) {
      logToFile('Error recording comprehension answer', {
        assessmentId,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Clear comprehension flow (mark as completed or failed)
   * Bug #17 Fix: No Redis to clear - just for API compatibility
   * Actual status update happens in handler when saving final results
   * @param {string} assessmentId - Reading assessment UUID
   */
  static async clearFlow(assessmentId) {
    try {
      // No Redis to clear - this method kept for API compatibility
      // The actual status update to 'comprehension_completed' happens in the handler
      logToFile('Comprehension flow cleared (no-op in DB mode)', { assessmentId });
    } catch (error) {
      logToFile('Error clearing comprehension flow', {
        assessmentId,
        error: error.message
      });
    }
  }

  /**
   * Alias for clearFlow - used in handlers
   * @param {string} assessmentId - Reading assessment UUID
   */
  static async clearComprehensionState(assessmentId) {
    return this.clearFlow(assessmentId);
  }

  /**
   * Abandon any active comprehension flows for a user
   * Called when user starts a new reading assessment
   * Prevents stale data from being served
   * @param {string} userId - User UUID
   */
  static async abandonUserFlows(userId) {
    try {
      const activeFlow = await this.findActiveFlowByUser(userId);

      if (activeFlow) {
        logToFile('Abandoning stale comprehension flow for user', {
          userId,
          assessmentId: activeFlow.assessment_id
        });

        // Mark assessment as failed in database
        await supabase
          .from('reading_assessments')
          .update({
            status: 'failed',
            error_message: 'Flow abandoned - user started new assessment',
            failed_at: new Date().toISOString()
          })
          .eq('id', activeFlow.assessment_id);

        logToFile('Abandoned stale flow for assessment', {
          assessmentId: activeFlow.assessment_id
        });
      }
    } catch (error) {
      logToFile('Error abandoning user flows', {
        userId,
        error: error.message
      });
    }
  }

  /**
   * Check if comprehension flow is complete
   * @param {Object} state - Flow state from database
   * @returns {boolean} True if all questions answered
   */
  static isFlowComplete(state) {
    return state.current_question_index >= state.questions.length;
  }

  /**
   * Get next question to send
   * @param {Object} state - Flow state from database
   * @returns {Object|null} Next question or null if complete
   */
  static getNextQuestion(state) {
    if (this.isFlowComplete(state)) {
      return null;
    }
    return state.questions[state.current_question_index];
  }
}

module.exports = RedisComprehensionService;
