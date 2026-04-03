/**
 * Transcription Processor Service
 * Handles audio transcription workflow for classroom observations
 *
 * Responsibilities:
 * - Download audio from WhatsApp
 * - Upload audio to R2 storage
 * - Transcribe with Soniox (speaker diarization)
 * - Send progress updates to user
 * - Handle transcription errors with notifications
 *
 * Extracted from coaching.service.js as part of Phase 2 refactoring
 */

const fs = require('fs');
const path = require('path');
const supabase = require('../../config/supabase');
const { logToFile } = require('../../utils/logger');
const AudioService = require('../audio.service');
const WhatsAppService = require('../whatsapp.service');
const CoachingSessionService = require('./coaching-session.service');
const { uploadClassroomAudio } = require('../../storage/r2');
const { TEMP_DIR, LISTENING_ANIMATION_MEDIA_ID } = require('../../utils/constants');
const { getUserLanguage, setUserLanguage } = require('../../utils/language-cache');
const { analyzeLanguage } = require('../../utils/language-detector');

class TranscriptionProcessorService {
  /**
   * Process transcription job (called by background worker)
   * @param {string} coachingSessionId - Coaching session UUID
   * @param {object} payload - Job payload with metadata
   * @returns {Promise<void>}
   */
  static async processTranscription(coachingSessionId, payload) {
    const tempAudioPath = path.join(TEMP_DIR, `classroom_${coachingSessionId}_${Date.now()}.ogg`);

    try {
      // Ensure temp directory exists
      if (!fs.existsSync(TEMP_DIR)) {
        fs.mkdirSync(TEMP_DIR, { recursive: true });
      }

      logToFile('🔄 Starting transcription processing', { coachingSessionId });

      // Get session data
      const { data: session, error: sessionError } = await supabase
        .from('coaching_sessions')
        .select('*, users!inner(phone_number, first_name)')
        .eq('id', coachingSessionId)
        .single();

      if (sessionError || !session) {
        throw new Error('Coaching session not found');
      }

      const from = payload.from || session.users.phone_number;

      // Update status
      await CoachingSessionService.updateStatus(coachingSessionId, 'transcribing', {
        transcription_started_at: new Date().toISOString()
      });

      // Send progress update with listening animation
      await this.sendProgressUpdate(from, 1);

      // Download audio from WhatsApp
      const audioId = payload.audioId;
      if (!audioId) {
        throw new Error('Audio ID not found in payload');
      }

      const audioData = await WhatsAppService.downloadMedia(audioId);
      fs.writeFileSync(tempAudioPath, audioData);

      logToFile('Audio downloaded from WhatsApp', {
        coachingSessionId,
        fileSize: audioData.length
      });

      // Upload to R2 storage
      const r2Url = await uploadClassroomAudio(
        tempAudioPath,
        session.user_id,
        coachingSessionId,
        {
          duration: session.audio_duration_seconds,
          language: 'unknown',
          format: 'ogg'
        }
      );

      logToFile('Audio uploaded to R2', { coachingSessionId, r2Url });

      // Transcribe with diarization
      const transcriptionResult = await this.transcribeWithDiarization(tempAudioPath);

      logToFile('Transcription completed', {
        coachingSessionId,
        transcriptLength: transcriptionResult.transcript.length,
        speakerCount: transcriptionResult.diarization.speakers.length,
        confidence: transcriptionResult.diarization.confidence,
        tokenCount: transcriptionResult.tokens?.length || 0,
        silenceCount: transcriptionResult.silences?.length || 0
      });

      // === PHASE 2: Language Detection & Update ===
      // Analyze language from transcription and update user preference if needed
      const currentLanguage = await getUserLanguage(session.user_id);
      const languageAnalysis = analyzeLanguage(
        {
          transcript: transcriptionResult.transcript,
          tokens: transcriptionResult.tokens || []
        },
        currentLanguage
      );

      if (languageAnalysis.shouldUpdate && languageAnalysis.newLanguage) {
        const updateSuccess = await setUserLanguage(session.user_id, languageAnalysis.newLanguage);

        if (updateSuccess) {
          logToFile('✅ User language preference updated', {
            userId: session.user_id,
            previousLanguage: currentLanguage,
            newLanguage: languageAnalysis.newLanguage,
            reason: languageAnalysis.reason,
            confidence: languageAnalysis.details.confidence
          });
        }
      } else {
        logToFile('ℹ️  Language preference unchanged', {
          userId: session.user_id,
          currentLanguage,
          reason: languageAnalysis.reason
        });
      }

      // Validate transcript length and warn if potentially problematic
      const transcriptLength = transcriptionResult.transcript.length;
      const estimatedTokens = Math.ceil(transcriptLength / 3); // Rough estimate

      if (transcriptLength > 15000) {
        logToFile('⚠️  Long transcript detected', {
          coachingSessionId,
          transcriptLength,
          estimatedTokens,
          warning: 'May exceed GPT-5 mini output token limit'
        });

        // Send warning to user
        await WhatsAppService.sendMessage(
          from,
          "⚠️ *Long Lesson Detected*\n\n" +
          "Your lesson transcript is quite lengthy. The analysis may take a bit longer, " +
          "but I'll make sure to provide comprehensive feedback!"
        );
      }

      // Update database with transcription data and tokens for enhanced viewer
      const updateData = {
        audio_url: r2Url,
        audio_format: 'ogg',
        audio_size_bytes: audioData.length,
        transcript_text: transcriptionResult.transcript,
        transcript_language: transcriptionResult.language,
        diarization_data: transcriptionResult.diarization,
        diarization_confidence: transcriptionResult.diarization.confidence,
        status: 'transcription_complete',
        transcription_completed_at: new Date().toISOString(),
        transcription_cost: transcriptionResult.cost || 0
      };

      // Add tokens and silences for enhanced transcript viewer (Phase 1)
      // These columns may not exist yet - migration required
      if (transcriptionResult.tokens && transcriptionResult.tokens.length > 0) {
        updateData.tokens_raw = transcriptionResult.tokens;
        logToFile('Storing tokens for enhanced viewer', {
          coachingSessionId,
          tokenCount: transcriptionResult.tokens.length
        });
      }
      if (transcriptionResult.silences && transcriptionResult.silences.length > 0) {
        updateData.silence_markers = transcriptionResult.silences;
        logToFile('Storing silence markers for enhanced viewer', {
          coachingSessionId,
          silenceCount: transcriptionResult.silences.length
        });
      }

      await supabase
        .from('coaching_sessions')
        .update(updateData)
        .eq('id', coachingSessionId);

      // Send encouraging message
      const CoachingHelpersService = require('./coaching-helpers.service');
      const encouragingMessage = await CoachingHelpersService.generateEncouragingMessage(
        session.users.first_name,
        session.audio_duration_seconds
      );
      await WhatsAppService.sendMessage(from, encouragingMessage);

      // Phase 3 (bd-636): Agency follow-up — remind teacher of prior commitment
      try {
        const { data: priorSessions } = await supabase
          .from('coaching_sessions')
          .select('prioritized_action')
          .eq('user_id', session.user_id)
          .not('prioritized_action', 'is', null)
          .order('created_at', { ascending: false })
          .limit(1);

        const priorAction = priorSessions?.[0]?.prioritized_action;
        if (priorAction?.teacher_response === 'yes' && priorAction?.action) {
          await WhatsAppService.sendMessage(from,
            `💡 *Quick reminder:* Last time, you committed to:\n\n_"${priorAction.action}"_\n\nLet's see how it went in this session!`
          );
        }
      } catch (agencyError) {
        logToFile('⚠️ Agency follow-up check failed (non-critical)', { error: agencyError.message });
      }

      // Phase 3 (bd-629): Ask about classroom photo FIRST, before LP question
      const { buildPhotoPrompt } = require('./classroom-photo/photo-prompt.service');
      const userLanguage = await getUserLanguage(session.user_id) || 'en';
      const photoPrompt = buildPhotoPrompt(coachingSessionId, userLanguage);
      await WhatsAppService.sendInteractiveButtons(from, photoPrompt);

      // Update conversation state to AWAITING_PHOTO
      await CoachingSessionService.updateConversationState(coachingSessionId, {
        current_state: 'AWAITING_PHOTO'
      });

      await CoachingSessionService.updateStatus(coachingSessionId, 'awaiting_photo');

      // Clean up temp file
      if (fs.existsSync(tempAudioPath)) {
        fs.unlinkSync(tempAudioPath);
      }

      logToFile('✅ Transcription processing complete', { coachingSessionId });
    } catch (error) {
      // Clean up temp file on error
      if (fs.existsSync(tempAudioPath)) {
        fs.unlinkSync(tempAudioPath);
      }

      await this.handleTranscriptionError(coachingSessionId, error, payload.from);
      throw error;
    }
  }

  /**
   * Transcribe audio with speaker diarization
   * Returns real tokens from Soniox for enhanced transcript processing
   *
   * @param {string} audioPath - Path to audio file
   * @returns {Promise<object>} Transcription result with diarization and tokens
   *   - transcript: Formatted text with speaker labels
   *   - language: Detected language code
   *   - diarization: Speaker segments built from tokens
   *   - tokens: Raw token array from Soniox (for enhanced viewer)
   *   - silences: Detected silence markers (gaps > 3s)
   *   - cost: Estimated transcription cost
   */
  static async transcribeWithDiarization(audioPath) {
    // Enable diarization for classroom audio transcription
    const transcriptionResult = await AudioService.transcribe(audioPath, true);

    // Extract tokens from Soniox response (may be empty for Whisper fallback)
    const tokens = transcriptionResult.tokens || [];

    // Build diarization from real tokens (not mock data)
    let diarization;
    if (tokens.length > 0) {
      diarization = this._buildDiarizationFromTokens(tokens);
      logToFile('Built diarization from Soniox tokens', {
        tokenCount: tokens.length,
        segmentCount: diarization.totalSegments,
        speakerCount: diarization.speakers.length
      });
    } else {
      // Fallback for Whisper (no token-level data)
      diarization = {
        speakers: [
          { id: 'speaker_0', label: 'Teacher', tokenCount: 0, segments: [] }
        ],
        segments: [],
        totalSegments: 0,
        confidence: 50 // Lower confidence for Whisper fallback
      };
      logToFile('No tokens available - using fallback diarization (Whisper)', {
        source: transcriptionResult.source || 'unknown'
      });
    }

    // Detect silence markers for enhanced viewer
    const silences = this.detectSilences(tokens);
    if (silences.length > 0) {
      logToFile('Detected silences in transcript', {
        silenceCount: silences.length,
        totalSilenceMs: silences.reduce((sum, s) => sum + s.duration_ms, 0)
      });
    }

    return {
      transcript: transcriptionResult.text,
      language: transcriptionResult.language,
      diarization,
      tokens,           // Raw tokens for enhanced viewer storage
      silences,         // Silence markers for enhanced viewer
      cost: 0.10        // Approximate Soniox cost
    };
  }

  /**
   * Send progress update to user
   * @param {string} phoneNumber - User's phone number
   * @param {number} step - Current step (1-5)
   * @returns {Promise<void>}
   */
  static async sendProgressUpdate(phoneNumber, step) {
    try {
      await WhatsAppService.sendMessage(phoneNumber, `🔄 Step 1/5: Transcribing your classroom audio. This may take 30-60 seconds...hang in there!`);

      // Send listening animation if available
      if (LISTENING_ANIMATION_MEDIA_ID) {
        await WhatsAppService.sendSticker(phoneNumber, LISTENING_ANIMATION_MEDIA_ID);
      }
    } catch (error) {
      logToFile('⚠️  Failed to send progress update (non-critical)', {
        error: error.message,
        phoneNumber
      });
    }
  }

  /**
   * Handle transcription error
   * @param {string} coachingSessionId - Coaching session UUID
   * @param {Error} error - Error object
   * @param {string} phoneNumber - User's phone number (optional)
   * @returns {Promise<void>}
   */
  static async handleTranscriptionError(coachingSessionId, error, phoneNumber) {
    try {
      logToFile('❌ Error in processTranscription', {
        error: error.message,
        stack: error.stack,
        coachingSessionId
      });

      // Get user phone number if not provided
      let from = phoneNumber;
      if (!from) {
        try {
          const { data: session } = await supabase
            .from('coaching_sessions')
            .select('users!inner(phone_number)')
            .eq('id', coachingSessionId)
            .single();
          from = session?.users?.phone_number;
        } catch (e) {
          logToFile('⚠️  Could not get user phone for error notification', { error: e.message });
        }
      }

      // Update session with error
      await CoachingSessionService.markAsFailed(coachingSessionId, 'transcription', error.message);

      // Notify user with specific error message (bilingual)
      if (from) {
        let errorMessage;

        // Check if it's a timeout error
        if (error.message.includes('timeout') || error.message.includes('took too long')) {
          errorMessage = "معذرت، آڈیو کو ٹرانسکرائب کرنے میں بہت زیادہ وقت لگ رہا ہے۔ براہ کرم تھوڑی دیر بعد دوبارہ کوشش کریں۔\n\nSorry, the audio transcription is taking longer than expected. This might be due to high server load. Please try again in a few minutes.";
        } else if (error.message.includes('network') || error.message.includes('connection')) {
          errorMessage = "معذرت، نیٹ ورک کی خرابی کی وجہ سے ٹرانسکرپشن ناکام ہو گیا۔ براہ کرم دوبارہ کوشش کریں۔\n\nSorry, transcription failed due to a network issue. Please try again.";
        } else {
          // Generic error
          errorMessage = "معذرت، آپ کی کلاس کی آڈیو کو ٹرانسکرائب کرتے وقت خرابی آ گئی۔ براہ کرم دوبارہ کوشش کریں۔\n\nSorry, there was an error transcribing your classroom audio. Please try again.";
        }

        await WhatsAppService.sendMessage(from, errorMessage);
      }
    } catch (handlerError) {
      logToFile('❌ Error in handleTranscriptionError', {
        error: handlerError.message,
        coachingSessionId
      });
    }
  }

  /**
   * Build diarization data from Soniox tokens
   * Groups consecutive tokens by speaker and calculates speaker statistics
   *
   * @param {Array} tokens - Array of token objects from Soniox
   * @returns {Object} { segments, speakers, totalSegments, confidence }
   */
  static _buildDiarizationFromTokens(tokens) {
    // Handle null/empty tokens
    if (!tokens || tokens.length === 0) {
      return {
        segments: [],
        speakers: [],
        totalSegments: 0,
        confidence: 0
      };
    }

    // Calculate token counts per speaker to identify Teacher (most tokens)
    const speakerStats = {};
    tokens.forEach(token => {
      const speakerId = token.speaker || 'unknown';
      if (!speakerStats[speakerId]) {
        speakerStats[speakerId] = { tokenCount: 0 };
      }
      speakerStats[speakerId].tokenCount++;
    });

    // Sort speakers by token count (descending)
    const sortedSpeakers = Object.entries(speakerStats)
      .sort((a, b) => b[1].tokenCount - a[1].tokenCount)
      .map(([id]) => id);

    // Assign labels: speaker with most tokens = Teacher, others = Students
    const speakerLabels = {};
    speakerLabels[sortedSpeakers[0]] = 'Teacher';
    for (let i = 1; i < sortedSpeakers.length; i++) {
      speakerLabels[sortedSpeakers[i]] = i === 1 ? 'Student' : `Student ${i}`;
    }

    // Group consecutive tokens from same speaker into segments
    const segments = [];
    let currentSpeaker = null;
    let currentTokens = [];
    let segmentStartMs = null;

    tokens.forEach((token, index) => {
      const speakerId = token.speaker || 'unknown';

      if (speakerId !== currentSpeaker) {
        // Speaker changed - save previous segment
        if (currentSpeaker && currentTokens.length > 0) {
          const rawText = currentTokens.map(t => t.text).join('');
          const cleanedText = rawText
            .replace(/\s+/g, ' ')
            .replace(/([۔،؟!])([^\s])/g, '$1 $2')
            .replace(/([.?!])([^\s])/g, '$1 $2')
            .trim();

          segments.push({
            speaker: currentSpeaker,
            label: speakerLabels[currentSpeaker] || currentSpeaker,
            text: cleanedText,
            start_ms: segmentStartMs,
            end_ms: currentTokens[currentTokens.length - 1].end_ms
          });
        }

        // Start new segment
        currentSpeaker = speakerId;
        currentTokens = [token];
        segmentStartMs = token.start_ms;
      } else {
        // Same speaker - accumulate token
        currentTokens.push(token);
      }
    });

    // Add final segment
    if (currentSpeaker && currentTokens.length > 0) {
      const rawText = currentTokens.map(t => t.text).join('');
      const cleanedText = rawText
        .replace(/\s+/g, ' ')
        .replace(/([۔،؟!])([^\s])/g, '$1 $2')
        .replace(/([.?!])([^\s])/g, '$1 $2')
        .trim();

      segments.push({
        speaker: currentSpeaker,
        label: speakerLabels[currentSpeaker] || currentSpeaker,
        text: cleanedText,
        start_ms: segmentStartMs,
        end_ms: currentTokens[currentTokens.length - 1].end_ms
      });
    }

    // Build speakers array with segment counts
    const speakers = sortedSpeakers.map(speakerId => ({
      id: speakerId,
      label: speakerLabels[speakerId],
      tokenCount: speakerStats[speakerId].tokenCount,
      segments: segments.filter(s => s.speaker === speakerId)
    }));

    return {
      segments,
      speakers,
      totalSegments: segments.length,
      confidence: 85 // Soniox diarization confidence estimate
    };
  }

  /**
   * Detect silence gaps in token stream
   * Identifies gaps > 3 seconds between consecutive tokens
   *
   * @param {Array} tokens - Array of token objects from Soniox
   * @param {number} minGapMs - Minimum gap to consider as silence (default: 3000ms)
   * @returns {Array} Array of silence markers { start_ms, end_ms, duration_ms }
   */
  static detectSilences(tokens, minGapMs = 3000) {
    if (!tokens || tokens.length < 2) {
      return [];
    }

    const silences = [];

    for (let i = 1; i < tokens.length; i++) {
      const prevToken = tokens[i - 1];
      const currToken = tokens[i];

      const gap = currToken.start_ms - prevToken.end_ms;

      if (gap >= minGapMs) {
        silences.push({
          start_ms: prevToken.end_ms,
          end_ms: currToken.start_ms,
          duration_ms: gap,
          prevText: prevToken.text,
          nextText: currToken.text,
          prevSpeaker: prevToken.speaker,
          nextSpeaker: currToken.speaker
        });
      }
    }

    return silences;
  }
}

module.exports = TranscriptionProcessorService;
