/**
 * Database Helpers for WhatsApp Bot
 * Handles user and conversation management
 */

const supabase = require('../config/supabase');

/**
 * Get or create user by phone number
 * @param {string} phoneNumber - User's WhatsApp phone number
 * @returns {Promise<object>} User record
 */
async function getOrCreateUser(phoneNumber) {
  try {
    // Try to find existing user
    const { data: existingUser, error: fetchError } = await supabase
      .from('users')
      .select('*')
      .eq('phone_number', phoneNumber)
      .single();

    if (existingUser) {
      return existingUser;
    }

    // User doesn't exist, create new one
    const { data: newUser, error: createError } = await supabase
      .from('users')
      .insert({
        phone_number: phoneNumber,
        registration_completed: false,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (createError) {
      console.error('Error creating user:', createError);
      throw createError;
    }

    console.log(`✅ New user created: ${phoneNumber}`);
    return newUser;
  } catch (error) {
    // If error is "not found", user doesn't exist
    if (error.code === 'PGRST116') {
      // Create new user
      const { data: newUser, error: createError } = await supabase
        .from('users')
        .insert({
          phone_number: phoneNumber,
          registration_completed: false,
          created_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (createError) {
        console.error('Error creating user:', createError);
        throw createError;
      }

      console.log(`✅ New user created: ${phoneNumber}`);
      return newUser;
    }

    console.error('Error in getOrCreateUser:', error);
    throw error;
  }
}

/**
 * Get or create a chat session for the user (30-minute timeout)
 * @param {string} userId - User's UUID
 * @param {number} timeoutMinutes - Session timeout in minutes (default: 30)
 * @returns {Promise<string>} Session ID (UUID)
 */
async function getOrCreateSession(userId, timeoutMinutes = 30) {
  try {
    // Get the most recent active session
    const { data: activeSessions, error: fetchError } = await supabase
      .from('chat_sessions')
      .select('*')
      .eq('user_id', userId)
      .is('ended_at', null)
      .order('last_activity_at', { ascending: false })
      .limit(1);

    if (fetchError) {
      console.error('Error fetching active session:', fetchError);
      throw fetchError;
    }

    const now = new Date();
    let sessionId = null;

    // Check if we have an active session and if it's still valid
    if (activeSessions && activeSessions.length > 0) {
      const activeSession = activeSessions[0];
      const lastActivity = new Date(activeSession.last_activity_at);
      const minutesSinceLastActivity = (now - lastActivity) / (1000 * 60);

      if (minutesSinceLastActivity < timeoutMinutes) {
        // Session is still active, update last_activity_at
        const { error: updateError } = await supabase
          .from('chat_sessions')
          .update({
            last_activity_at: now.toISOString(),
            updated_at: now.toISOString(),
          })
          .eq('id', activeSession.id);

        if (updateError) {
          console.error('Error updating session activity:', updateError);
        }

        sessionId = activeSession.id;
        console.log(`✅ Continuing session: ${sessionId}`);
      } else {
        // Session timed out, end it
        await supabase
          .from('chat_sessions')
          .update({
            ended_at: activeSession.last_activity_at,
            updated_at: now.toISOString(),
          })
          .eq('id', activeSession.id);

        console.log(`⏱️ Session ${activeSession.id} timed out after ${minutesSinceLastActivity.toFixed(1)} minutes`);
      }
    }

    // Create new session if needed
    if (!sessionId) {
      const { data: newSession, error: createError } = await supabase
        .from('chat_sessions')
        .insert({
          user_id: userId,
          started_at: now.toISOString(),
          last_activity_at: now.toISOString(),
          message_count: 0,
          created_at: now.toISOString(),
          updated_at: now.toISOString(),
        })
        .select()
        .single();

      if (createError) {
        console.error('Error creating session:', createError);
        throw createError;
      }

      sessionId = newSession.id;
      console.log(`✅ New session created: ${sessionId}`);
    }

    return sessionId;
  } catch (error) {
    console.error('Error in getOrCreateSession:', error);
    throw error;
  }
}

/**
 * Update session type based on conversation intent
 * @param {string} sessionId - Session UUID
 * @param {string} sessionType - 'lesson_plan', 'presentation', 'general', 'audio_coaching'
 */
async function updateSessionType(sessionId, sessionType) {
  try {
    const { error } = await supabase
      .from('chat_sessions')
      .update({
        session_type: sessionType,
        updated_at: new Date().toISOString(),
      })
      .eq('id', sessionId);

    if (error) {
      console.error('Error updating session type:', error);
    }
  } catch (error) {
    console.error('Error in updateSessionType:', error);
  }
}

/**
 * Store conversation message
 * @param {string} userId - User's UUID from database
 * @param {string} role - 'user' or 'assistant'
 * @param {string} content - Message content
 * @param {string} messageType - 'text', 'voice', 'image', etc.
 * @param {string} sessionId - Optional session ID (will auto-create if not provided)
 * @param {string} inputFormat - Format of input ('text' or 'voice')
 * @param {string} inputLanguage - Language of input ('en', 'ur', or 'mixed')
 * @param {string} outputFormat - Format of output ('text' or 'voice') - only for assistant messages
 * @param {string} outputLanguage - Language of output ('en' or 'ur') - only for assistant messages
 * @returns {Promise<object>} Conversation record
 */
async function storeConversation(
  userId,
  role,
  content,
  messageType = 'text',
  sessionId = null,
  inputFormat = null,
  inputLanguage = null,
  outputFormat = null,
  outputLanguage = null
) {
  try {
    // Get or create session if not provided
    if (!sessionId) {
      sessionId = await getOrCreateSession(userId);
    }

    const insertData = {
      user_id: userId,
      role,
      content,
      message_type: messageType,
      session_id: sessionId,
      created_at: new Date().toISOString(),
    };

    // Add format/language tracking if provided
    if (inputFormat) insertData.input_format = inputFormat;
    if (inputLanguage) insertData.input_language = inputLanguage;
    if (outputFormat) insertData.output_format = outputFormat;
    if (outputLanguage) insertData.output_language = outputLanguage;

    const { data, error } = await supabase
      .from('conversations')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error('Error storing conversation:', error);
      throw error;
    }

    return data;
  } catch (error) {
    console.error('Error in storeConversation:', error);
    throw error;
  }
}

/**
 * Get conversation history for a user
 * @param {string} userId - User's UUID
 * @param {number} limit - Number of recent messages to retrieve
 * @returns {Promise<Array>} Array of conversation messages
 */
async function getConversationHistory(userId, limit = 10) {
  try {
    const { data, error } = await supabase
      .from('conversations')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Error fetching conversation history:', error);
      throw error;
    }

    // Reverse to get chronological order (oldest first)
    return (data || []).reverse();
  } catch (error) {
    console.error('Error in getConversationHistory:', error);
    return [];
  }
}

/**
 * Update user information
 * @param {string} userId - User's UUID
 * @param {object} updates - Fields to update
 * @returns {Promise<object>} Updated user record
 */
async function updateUser(userId, updates) {
  try {
    const { data, error } = await supabase
      .from('users')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId)
      .select()
      .single();

    if (error) {
      console.error('Error updating user:', error);
      throw error;
    }

    console.log(`✅ User updated: ${userId}`);
    return data;
  } catch (error) {
    console.error('Error in updateUser:', error);
    throw error;
  }
}

/**
 * Store audio session (for voice messages)
 * @param {string} userId - User's UUID
 * @param {string} audioUrl - R2 URL of uploaded audio
 * @param {number} duration - Duration in seconds
 * @param {string} transcript - Transcribed text
 * @returns {Promise<object>} Audio session record
 */
async function storeAudioSession(userId, audioUrl, duration, transcript) {
  try {
    const { data, error } = await supabase
      .from('audio_sessions')
      .insert({
        user_id: userId,
        audio_url: audioUrl,
        audio_duration_seconds: duration,
        transcript,
        status: 'completed',
        created_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error('Error storing audio session:', error);
      throw error;
    }

    console.log(`✅ Audio session stored: ${data.id}`);
    return data;
  } catch (error) {
    console.error('Error in storeAudioSession:', error);
    throw error;
  }
}

/**
 * Store lesson plan
 * @param {string} userId - User's UUID
 * @param {string} topic - Lesson plan topic
 * @param {string} type - 'lesson_plan' or 'presentation'
 * @param {string} gammaUrl - Gamma.app URL
 * @param {object} content - Lesson plan structure
 * @returns {Promise<object>} Lesson plan record
 */
async function storeLessonPlan(userId, topic, type, gammaUrl, pdfUrl = null, content = null) {
  try {
    // DUPLICATE CHECK: Prevent storing same lesson plan twice within 10 minutes
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();

    const { data: existing, error: checkError } = await supabase
      .from('lesson_plans')
      .select('id, topic, gamma_url, pdf_url, created_at')
      .eq('user_id', userId)
      .eq('topic', topic)
      .gte('created_at', tenMinutesAgo)
      .limit(1)
      .single();

    if (existing && !checkError) {
      console.log(`⏭️ Duplicate lesson plan found, returning existing: ${existing.id}`);
      return existing;
    }

    // No duplicate found, proceed with insert
    const { data, error } = await supabase
      .from('lesson_plans')
      .insert({
        user_id: userId,
        topic,
        type,
        gamma_url: gammaUrl,
        pdf_url: pdfUrl,
        content,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error('Error storing lesson plan:', error);
      throw error;
    }

    console.log(`✅ Lesson plan stored: ${topic}${pdfUrl ? ' (with PDF URL)' : ''}`);
    return data;
  } catch (error) {
    console.error('Error in storeLessonPlan:', error);
    throw error;
  }
}

/**
 * Track chat start in funnel (first message from user)
 * @param {object} user - User object from database
 * @param {string} phoneNumber - User's WhatsApp phone number
 * @param {string} messageBody - First message text (may contain session_id)
 * @returns {Promise<void>}
 */
async function trackChatStart(user, phoneNumber, messageBody) {
  try {
    // Only track if this is truly the first message (first_message_at is null)
    if (user.first_message_at) {
      console.log('⏭️ Not first message, skipping funnel tracking');
      return;
    }

    // Extract session_id from message if present
    // Website will append: ?sessionId=xxx to WhatsApp link
    // WhatsApp passes this as part of the first message
    let webSessionId = null;
    const sessionIdMatch = messageBody.match(/[?&]sessionId=([a-zA-Z0-9\-_]+)/i);
    if (sessionIdMatch) {
      webSessionId = sessionIdMatch[1];
      console.log('✅ Website session ID extracted from message', { sessionId: webSessionId });
    }

    const now = new Date().toISOString();

    // Record in chat_starts table
    try {
      const { error: chatStartError } = await supabase
        .from('chat_starts')
        .insert({
          user_id: user.id,
          phone_number: phoneNumber,
          session_id: webSessionId,
          created_at: now
        });

      if (chatStartError) {
        console.error('Error recording chat start:', chatStartError);
      } else {
        console.log('✅ Chat start recorded in funnel');
      }
    } catch (error) {
      console.error('Error in chat_starts insert:', error);
    }

    // Update user's first_message_at and session_id
    try {
      const updates = {
        first_message_at: now
      };

      // Only set session_id if we found one
      if (webSessionId) {
        updates.session_id = webSessionId;
        updates.source = 'website'; // Mark source as website if session_id present
      } else {
        updates.source = 'direct'; // Direct WhatsApp, no attribution
      }

      await updateUser(user.id, updates);
      console.log('✅ User updated with first_message_at and funnel attribution');
    } catch (error) {
      console.error('Error updating user with funnel data:', error);
    }

  } catch (error) {
    console.error('Error in trackChatStart:', error);
    // Don't throw - funnel tracking shouldn't break bot functionality
  }
}

module.exports = {
  getOrCreateUser,
  getOrCreateSession,
  updateSessionType,
  storeConversation,
  getConversationHistory,
  updateUser,
  storeAudioSession,
  storeLessonPlan,
  trackChatStart,
};
