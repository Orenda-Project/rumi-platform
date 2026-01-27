/**
 * Exam Session Service
 * Manages exam checking sessions in Supabase + Redis
 *
 * Created: 2026-01-24
 * Bead: bd-081 (orchestrator dependency)
 */

const supabase = require('../../config/supabase');
const redisService = require('../cache/railway-redis.service');
const { logToFile } = require('../../utils/logger');

// Redis key prefix and TTL
const REDIS_PREFIX = 'exam_session:';
const REDIS_TTL = 60 * 60 * 24; // 24 hours

class ExamSessionService {
  /**
   * Get or create an exam session for a user
   * @param {string} userId - User UUID
   * @returns {object} Session object
   */
  static async getOrCreate(userId) {
    // Check Redis first for active session
    const cachedSession = await this._getFromRedis(userId);
    if (cachedSession) {
      return cachedSession;
    }

    // Check Supabase for active session
    const { data: existingSession, error } = await supabase
      .from('exam_check_sessions')
      .select('*')
      .eq('user_id', userId)
      .not('status', 'in', '("completed","cancelled","error")')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (existingSession && !error) {
      await this._saveToRedis(userId, existingSession);
      return existingSession;
    }

    // Create new session
    return this._createSession(userId);
  }

  /**
   * Get active session for user (without creating new one)
   * @param {string} userId - User UUID
   * @returns {object|null} Session or null
   */
  static async getActive(userId) {
    // Check Redis first
    const cachedSession = await this._getFromRedis(userId);
    if (cachedSession) {
      return cachedSession;
    }

    // Check Supabase
    const { data, error } = await supabase
      .from('exam_check_sessions')
      .select('*')
      .eq('user_id', userId)
      .not('status', 'in', '("completed","cancelled","error")')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (data && !error) {
      await this._saveToRedis(userId, data);
      return data;
    }

    return null;
  }

  /**
   * Get session by ID
   * @param {string} sessionId - Session UUID
   * @returns {object|null} Session or null
   */
  static async getById(sessionId) {
    const { data, error } = await supabase
      .from('exam_check_sessions')
      .select('*')
      .eq('id', sessionId)
      .single();

    if (error) {
      logToFile('❌ Failed to get session by ID', { sessionId, error: error.message });
      return null;
    }

    return data;
  }

  /**
   * Create a new exam session
   * @param {string} userId - User UUID
   * @returns {object} New session
   */
  static async _createSession(userId) {
    const { data, error } = await supabase
      .from('exam_check_sessions')
      .insert({
        user_id: userId,
        status: 'collecting_images',
        original_images: []
      })
      .select()
      .single();

    if (error) {
      logToFile('❌ Failed to create exam session', { userId, error: error.message });
      throw new Error('Failed to create exam session');
    }

    logToFile('✅ Created new exam session', { sessionId: data.id, userId });
    await this._saveToRedis(userId, data);
    return data;
  }

  /**
   * Add an image to the session
   * @param {string} sessionId - Session UUID
   * @param {string} imageUrl - R2 URL of the image
   */
  static async addImage(sessionId, imageUrl) {
    // Get current session
    const session = await this.getById(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    const images = session.original_images || [];
    const newImage = {
      url: imageUrl,
      uploadedAt: new Date().toISOString(),
      pageNumber: images.length + 1
    };

    const { error } = await supabase
      .from('exam_check_sessions')
      .update({
        original_images: [...images, newImage],
        updated_at: new Date().toISOString()
      })
      .eq('id', sessionId);

    if (error) {
      logToFile('❌ Failed to add image to session', { sessionId, error: error.message });
      throw new Error('Failed to add image');
    }

    // Update Redis cache
    const updatedSession = { ...session, original_images: [...images, newImage] };
    await this._saveToRedis(session.user_id, updatedSession);

    logToFile('📷 Image added to session', { sessionId, imageCount: images.length + 1 });
  }

  /**
   * Update session status
   * @param {string} sessionId - Session UUID
   * @param {string} status - New status
   * @param {object} additionalUpdates - Additional fields to update
   */
  static async updateStatus(sessionId, status, additionalUpdates = {}) {
    const updates = {
      status,
      updated_at: new Date().toISOString(),
      ...additionalUpdates
    };

    // Set processing timestamps
    if (status === 'processing_ocr') {
      updates.processing_started_at = new Date().toISOString();
    }
    if (['completed', 'error', 'cancelled'].includes(status)) {
      updates.processing_completed_at = new Date().toISOString();
    }

    const { data, error } = await supabase
      .from('exam_check_sessions')
      .update(updates)
      .eq('id', sessionId)
      .select()
      .single();

    if (error) {
      logToFile('❌ Failed to update session status', { sessionId, status, error: error.message });
      throw new Error('Failed to update session status');
    }

    // Update Redis cache
    if (data) {
      await this._saveToRedis(data.user_id, data);
    }

    // Clear Redis if session ended
    if (['completed', 'error', 'cancelled'].includes(status) && data) {
      await this._clearFromRedis(data.user_id);
    }

    logToFile('📝 Session status updated', { sessionId, status });
    return data;
  }

  /**
   * Update session with arbitrary fields
   * @param {string} sessionId - Session UUID
   * @param {object} updates - Fields to update
   */
  static async update(sessionId, updates) {
    const { data, error } = await supabase
      .from('exam_check_sessions')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', sessionId)
      .select()
      .single();

    if (error) {
      logToFile('❌ Failed to update session', { sessionId, error: error.message });
      throw new Error('Failed to update session');
    }

    // Update Redis cache
    if (data) {
      await this._saveToRedis(data.user_id, data);
    }

    return data;
  }

  /**
   * Add answer to marking scheme
   * @param {string} sessionId - Session UUID
   * @param {string} questionId - Question ID
   * @param {object} answer - Answer object
   */
  static async addAnswer(sessionId, questionId, answer) {
    const session = await this.getById(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    const markingScheme = session.marking_scheme || { questions: [], totalMarks: 0 };
    const existingIndex = markingScheme.questions.findIndex(q => q.id === questionId);

    const questionAnswer = {
      id: questionId,
      answer: answer.answer,
      marks: answer.marks || 1,
      type: answer.type || 'short',
      rubric: answer.rubric || null
    };

    if (existingIndex >= 0) {
      markingScheme.questions[existingIndex] = questionAnswer;
    } else {
      markingScheme.questions.push(questionAnswer);
    }

    // Recalculate total marks
    markingScheme.totalMarks = markingScheme.questions.reduce((sum, q) => sum + (q.marks || 0), 0);

    await this.update(sessionId, { marking_scheme: markingScheme });
    logToFile('📝 Answer added to marking scheme', { sessionId, questionId });
  }

  // ==================== REDIS HELPERS ====================

  static async _getFromRedis(userId) {
    try {
      const redis = await redisService.getClient();
      const key = `${REDIS_PREFIX}${userId}`;
      const data = await redis.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      logToFile('⚠️ Redis get failed', { userId, error: error.message });
      return null;
    }
  }

  static async _saveToRedis(userId, session) {
    try {
      const redis = await redisService.getClient();
      const key = `${REDIS_PREFIX}${userId}`;
      await redis.setEx(key, REDIS_TTL, JSON.stringify(session));
    } catch (error) {
      logToFile('⚠️ Redis save failed', { userId, error: error.message });
    }
  }

  static async _clearFromRedis(userId) {
    try {
      const redis = await redisService.getClient();
      const key = `${REDIS_PREFIX}${userId}`;
      await redis.del(key);
    } catch (error) {
      logToFile('⚠️ Redis clear failed', { userId, error: error.message });
    }
  }
}

module.exports = ExamSessionService;
