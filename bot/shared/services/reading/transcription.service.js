/**
 * Reading Assessment Transcription Service
 * Specialized transcription for reading assessments with speaker filtering
 *
 * Key Responsibilities:
 * - Transcribe student reading audio using Soniox
 * - Enable speaker diarization to detect teacher encouragement
 * - Extract ONLY primary speaker (student) segments
 * - Provide word-level timestamps for fluency calculation
 * - Calculate audio quality metrics
 * - Detect language mismatches (expected vs actual)
 *
 * Architecture:
 * - Leverages existing AudioService for Soniox integration
 * - Adds reading-specific processing and filtering
 * - Returns enriched data structure for analysis pipeline
 */

const fs = require('fs');
const path = require('path');
const AudioService = require('../audio.service');
const WhatsAppService = require('../whatsapp.service');
const { logToFile } = require('../../utils/logger');
const { TEMP_DIR } = require('../../utils/constants');

class TranscriptionService {
  /**
   * Transcribe student reading audio with speaker filtering
   * @param {string} assessmentId - UUID of reading assessment
   * @param {string} audioUrl - R2 URL of audio file
   * @param {string} expectedLanguage - Expected language ('en' or 'ur')
   * @returns {Promise<object>} Transcription result with speaker filtering
   */
  static async transcribeReading(assessmentId, audioUrl, expectedLanguage = 'en') {
    let tempAudioPath = null;

    try {
      logToFile('📝 Starting reading transcription', {
        assessmentId,
        audioUrl,
        expectedLanguage
      });

      // Step 1: Download audio from R2
      tempAudioPath = await this.downloadAudio(audioUrl, assessmentId);

      // Step 2: Transcribe with Soniox (speaker diarization enabled)
      // Bug #29 Fix: Pass expected language to force correct transcription language
      logToFile('Calling Soniox with speaker diarization and language hint enabled...', {
        expectedLanguage
      });
      const sonioxResult = await AudioService.transcribe(tempAudioPath, true, expectedLanguage); // enableDiarization = true, language = 'en' or 'ur'

      logToFile('✅ Soniox transcription complete', {
        text: sonioxResult.text.substring(0, 100),
        language: sonioxResult.language,
        expectedLanguage: expectedLanguage,
        languageMatch: sonioxResult.language === expectedLanguage,
        hasTokens: !!(sonioxResult.tokens && sonioxResult.tokens.length > 0),
        hasDiarization: !!(sonioxResult.diarization)
      });

      // Step 3: Process transcription for reading assessment
      const processedResult = await this.processTranscription(
        sonioxResult,
        expectedLanguage,
        assessmentId
      );

      // Clean up temp file
      if (tempAudioPath && fs.existsSync(tempAudioPath)) {
        fs.unlinkSync(tempAudioPath);
        logToFile('Temp audio file cleaned up', { tempAudioPath });
      }

      return processedResult;

    } catch (error) {
      logToFile('❌ Error in reading transcription', {
        assessmentId,
        error: error.message,
        stack: error.stack
      });

      // Clean up temp file on error
      if (tempAudioPath && fs.existsSync(tempAudioPath)) {
        try {
          fs.unlinkSync(tempAudioPath);
        } catch (cleanupError) {
          logToFile('Warning: Temp file cleanup failed', { error: cleanupError.message });
        }
      }

      throw error;
    }
  }

  /**
   * Download audio from R2 to temp file
   * @param {string} audioUrl - R2 URL
   * @param {string} assessmentId - Assessment ID for filename
   * @returns {Promise<string>} Local file path
   */
  static async downloadAudio(audioUrl, assessmentId) {
    try {
      const { downloadFromR2, extractKeyFromUrl } = require('../../storage/r2');

      // Extract R2 key from URL (e.g., "audio/userId/timestamp_messageId.ogg")
      const key = extractKeyFromUrl(audioUrl);

      logToFile('📥 Downloading audio from R2', {
        url: audioUrl,
        key
      });

      // Download using S3 client with proper authentication
      const audioBuffer = await downloadFromR2(key);

      const tempPath = path.join(TEMP_DIR, `reading_${assessmentId}_${Date.now()}.ogg`);
      fs.writeFileSync(tempPath, audioBuffer);

      logToFile('✅ Audio downloaded from R2', {
        url: audioUrl,
        key,
        size: audioBuffer.length,
        path: tempPath
      });

      return tempPath;

    } catch (error) {
      logToFile('❌ Error downloading audio from R2', {
        url: audioUrl,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Process Soniox transcription result for reading assessment
   * @param {object} sonioxResult - Raw Soniox result
   * @param {string} expectedLanguage - Expected language
   * @param {string} assessmentId - Assessment ID
   * @returns {Promise<object>} Processed result
   */
  static async processTranscription(sonioxResult, expectedLanguage, assessmentId) {
    try {
      logToFile('Processing transcription for reading assessment', {
        assessmentId,
        expectedLanguage,
        hasDiarization: !!sonioxResult.diarization
      });

      // Extract base transcription data
      let fullText = sonioxResult.text || '';
      let detectedLanguage = sonioxResult.language || null;
      let confidence = sonioxResult.confidence || 0;
      let tokens = sonioxResult.tokens || [];
      let diarization = sonioxResult.diarization || null;

      // Check for language mismatch
      const languageMismatch = detectedLanguage && detectedLanguage !== expectedLanguage;
      if (languageMismatch) {
        logToFile('⚠️ Language mismatch detected', {
          expected: expectedLanguage,
          detected: detectedLanguage
        });
      }

      // Calculate number of speakers
      let numSpeakers = 1;
      let primarySpeakerText = fullText;
      let primarySpeakerTokens = tokens;
      let speakerStats = null;

      if (diarization && diarization.speakers && diarization.speakers.length > 0) {
        numSpeakers = diarization.speakers.length;
        speakerStats = diarization.speakers;

        logToFile('Speaker diarization available', {
          numSpeakers,
          speakers: speakerStats.map(s => ({
            label: s.label,
            wordCount: s.wordCount,
            segmentCount: s.segments.length
          }))
        });

        // CRITICAL: Extract primary speaker (longest talk time = student)
        const primarySpeaker = this.identifyPrimarySpeaker(speakerStats);

        if (primarySpeaker) {
          logToFile('Primary speaker identified', {
            label: primarySpeaker.label,
            wordCount: primarySpeaker.wordCount,
            percentage: ((primarySpeaker.wordCount / tokens.length) * 100).toFixed(1) + '%'
          });

          // Extract primary speaker segments
          const primarySegments = primarySpeaker.segments;
          primarySpeakerText = primarySegments.map(s => s.text).join(' ');

          // Extract primary speaker tokens (word-level timestamps)
          if (tokens && tokens.length > 0) {
            primarySpeakerTokens = tokens.filter(t => t.speaker === primarySpeaker.label);
            logToFile('Primary speaker tokens extracted', {
              totalTokens: tokens.length,
              primaryTokens: primarySpeakerTokens.length
            });
          }
        } else {
          logToFile('⚠️ Could not identify primary speaker, using full transcript');
        }
      } else {
        logToFile('No speaker diarization available, using full transcript');
      }

      // Calculate word-level timestamps for fluency analysis
      const wordTimestamps = this.extractWordTimestamps(primarySpeakerTokens);

      // Bug #29 Fix: Calculate audio duration from tokens (more reliable than WhatsApp metadata)
      // Use the last token's end_ms from primary speaker tokens, or fall back to all tokens
      let audioDurationSeconds = 0;
      const tokensForDuration = primarySpeakerTokens.length > 0 ? primarySpeakerTokens : tokens;
      if (tokensForDuration && tokensForDuration.length > 0) {
        // Find the maximum end_ms across all tokens
        const maxEndMs = Math.max(...tokensForDuration.map(t => t.end_ms || 0));
        audioDurationSeconds = maxEndMs / 1000; // Convert to seconds

        logToFile('Audio duration calculated from tokens', {
          maxEndMs,
          audioDurationSeconds: audioDurationSeconds.toFixed(2),
          tokenCount: tokensForDuration.length,
          source: primarySpeakerTokens.length > 0 ? 'primary_speaker' : 'all_speakers'
        });
      } else {
        logToFile('⚠️ No tokens available for duration calculation, defaulting to 0');
      }

      // Calculate audio quality score based on confidence and speaker clarity
      const qualityScore = this.calculateQualityScore(confidence, numSpeakers, diarization);

      // Build result object
      const result = {
        // Full transcription (all speakers)
        fullText: fullText,
        fullConfidence: confidence,

        // Primary speaker (student) data
        text: primarySpeakerText,
        wordTimestamps: wordTimestamps,
        wordCount: primarySpeakerText.split(/\s+/).filter(w => w.length > 0).length,

        // Language detection
        detectedLanguage: detectedLanguage,
        languageMismatch: languageMismatch,

        // Speaker information
        numSpeakers: numSpeakers,
        speakerStats: speakerStats,

        // Quality metrics
        confidence: confidence,
        qualityScore: qualityScore,

        // Audio duration (Bug #29 fix)
        audioDurationSeconds: audioDurationSeconds,

        // Raw data for debugging
        rawTokens: tokens,
        rawDiarization: diarization
      };

      logToFile('✅ Transcription processing complete', {
        assessmentId,
        wordCount: result.wordCount,
        numSpeakers: result.numSpeakers,
        qualityScore: result.qualityScore,
        languageMismatch: result.languageMismatch
      });

      return result;

    } catch (error) {
      logToFile('❌ Error processing transcription', {
        assessmentId,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Identify primary speaker (longest talk time = student)
   * @param {Array} speakers - Array of speaker objects from diarization
   * @returns {object|null} Primary speaker object
   */
  static identifyPrimarySpeaker(speakers) {
    if (!speakers || speakers.length === 0) {
      return null;
    }

    // Sort by word count descending
    const sortedSpeakers = [...speakers].sort((a, b) => b.wordCount - a.wordCount);

    // Return speaker with most words
    return sortedSpeakers[0];
  }

  /**
   * Extract word-level timestamps for fluency calculation
   * @param {Array} tokens - Array of token objects with start_ms, end_ms
   * @returns {Array} Word timestamps [{word, startMs, endMs, duration}]
   */
  static extractWordTimestamps(tokens) {
    if (!tokens || tokens.length === 0) {
      return [];
    }

    return tokens
      .filter(t => t.text && t.text.trim().length > 0)
      .map(token => ({
        word: token.text.trim(),
        startMs: token.start_ms || 0,
        endMs: token.end_ms || 0,
        duration: (token.end_ms || 0) - (token.start_ms || 0),
        speaker: token.speaker || 'unknown'
      }));
  }

  /**
   * Calculate audio quality score (0-100)
   * @param {number} confidence - Soniox confidence score
   * @param {number} numSpeakers - Number of detected speakers
   * @param {object} diarization - Diarization data
   * @returns {number} Quality score (0-100)
   */
  static calculateQualityScore(confidence, numSpeakers, diarization) {
    let score = 100;

    // Factor 1: Transcription confidence (0-40 points)
    const confidenceScore = Math.min(40, confidence * 40);
    score = confidenceScore;

    // Factor 2: Single speaker bonus (30 points)
    // Multiple speakers indicate background noise or teacher encouragement
    if (numSpeakers === 1) {
      score += 30;
    } else if (numSpeakers === 2) {
      score += 20; // Mild penalty for 2 speakers
    } else {
      score += 10; // Larger penalty for 3+ speakers
    }

    // Factor 3: Speaker clarity (30 points)
    // If diarization is available and primary speaker has >80% talk time
    if (diarization && diarization.speakers && diarization.speakers.length > 0) {
      const sortedSpeakers = [...diarization.speakers].sort((a, b) => b.wordCount - a.wordCount);
      const primarySpeaker = sortedSpeakers[0];
      const totalWords = diarization.speakers.reduce((sum, s) => sum + s.wordCount, 0);
      const primaryPercentage = (primarySpeaker.wordCount / totalWords) * 100;

      if (primaryPercentage >= 80) {
        score += 30; // Excellent clarity
      } else if (primaryPercentage >= 60) {
        score += 20; // Good clarity
      } else {
        score += 10; // Multiple speakers interfering
      }
    } else {
      score += 20; // No diarization, assume reasonable quality
    }

    // Cap at 100
    score = Math.min(100, Math.round(score));

    return score;
  }
}

module.exports = TranscriptionService;
