/**
 * Silence Detector Service
 *
 * Phase 3: Silence Detection & Board Writing Inference
 *
 * Detects silence gaps in classroom audio transcripts and infers
 * the likely activity during those silences (wait time, board writing,
 * extended activity like reading or group work).
 *
 * Key Features:
 * - Silence detection from token timestamps
 * - Classification by duration
 * - Board writing inference using keyword context
 * - Confidence scoring based on contextual evidence
 *
 * @module silence-detector.service
 */

const { logToFile } = require('../../utils/logger');
const { logEvent } = require('../../utils/structured-logger');

/**
 * Keywords that indicate board writing activity
 * Grouped by position relative to silence
 */
const BOARD_KEYWORDS = {
  // Keywords BEFORE a silence that suggest board writing
  before: [
    // Urdu
    'لکھو', 'لکھتے', 'لکھیں', 'لکھتی', 'لکھتا',
    'بورڈ', 'تختہ',
    'یہاں دیکھو', 'یہاں', 'نوٹ',
    'write', 'board',
    // English phonetic
    'رائٹ', 'نوٹ ڈاؤن'
  ],
  // Keywords AFTER a silence that suggest board writing just happened
  after: [
    // Urdu
    'دیکھو', 'دیکھیں', 'دیکھ',
    'یہ ہے', 'یہ',
    'پڑھو', 'پڑھیں',
    'سمجھ', 'سمجھے',
    // English
    'look', 'see', 'read',
    'لوک', 'سی'
  ]
};

/**
 * Silence duration thresholds (milliseconds)
 */
const THRESHOLDS = {
  MIN_SILENCE: 3000,          // Ignore gaps < 3s
  WAIT_TIME_MAX: 5000,        // 3-5s = wait time (thinking)
  BOARD_WRITING_MAX: 15000,   // 5-15s = potential board writing
  // > 15s = extended activity
};

class SilenceDetectorService {
  /**
   * Detect silence gaps between tokens
   *
   * @param {Array} tokens - Array of tokens with start_ms and end_ms
   * @param {number} minGapMs - Minimum gap to consider as silence (default 3000)
   * @returns {Array} Array of silence objects
   */
  static detectSilences(tokens, minGapMs = THRESHOLDS.MIN_SILENCE) {
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
          prev_token_index: i - 1,
          next_token_index: i
        });
      }
    }

    return silences;
  }

  /**
   * Classify a silence by its duration
   *
   * @param {Object} silence - Silence object with duration_ms
   * @returns {string} Classification: wait_time, potential_board_writing, or extended_activity
   */
  static classifySilence(silence) {
    const duration = silence.duration_ms;

    if (duration <= THRESHOLDS.WAIT_TIME_MAX) {
      return 'wait_time';
    } else if (duration <= THRESHOLDS.BOARD_WRITING_MAX) {
      return 'potential_board_writing';
    } else {
      return 'extended_activity';
    }
  }

  /**
   * Get text context around a silence
   *
   * @param {Array} tokens - All tokens
   * @param {number} tokenIndex - Starting token index
   * @param {number} count - Number of tokens to include
   * @param {string} direction - 'before' or 'after'
   * @returns {string} Combined text from tokens
   */
  static getContext(tokens, tokenIndex, count = 5, direction = 'before') {
    let contextTokens = [];

    if (direction === 'before') {
      const start = Math.max(0, tokenIndex - count + 1);
      contextTokens = tokens.slice(start, tokenIndex + 1);
    } else {
      const end = Math.min(tokens.length, tokenIndex + count);
      contextTokens = tokens.slice(tokenIndex, end);
    }

    return contextTokens.map(t => t.text).join('').trim();
  }

  /**
   * Check if text contains any of the keywords
   *
   * @param {string} text - Text to search
   * @param {Array} keywords - Keywords to look for
   * @returns {boolean} True if any keyword found
   */
  static hasKeyword(text, keywords) {
    if (!text) return false;

    const lowerText = text.toLowerCase();
    return keywords.some(keyword => lowerText.includes(keyword.toLowerCase()));
  }

  /**
   * Infer board writing activity from silences with keyword context
   *
   * @param {Array} tokens - All tokens
   * @param {Array} silences - Detected silences
   * @returns {Array} Silence markers with activity and confidence
   */
  static inferBoardWriting(tokens, silences) {
    if (!silences || silences.length === 0) {
      return [];
    }

    return silences.map(silence => {
      // Get classification from duration
      const baseClassification = this.classifySilence(silence);

      // Get context before and after silence
      const contextBefore = this.getContext(tokens, silence.prev_token_index, 5, 'before');
      const contextAfter = this.getContext(tokens, silence.next_token_index, 5, 'after');

      // Check for keywords
      const hasKeywordBefore = this.hasKeyword(contextBefore, BOARD_KEYWORDS.before);
      const hasKeywordAfter = this.hasKeyword(contextAfter, BOARD_KEYWORDS.after);

      // Determine final activity and confidence
      let activity = baseClassification;
      let confidence = 'low';

      if (baseClassification === 'wait_time') {
        // Wait time stays as is, high confidence based on duration
        activity = 'wait_time';
        confidence = 'high';
      } else if (baseClassification === 'potential_board_writing') {
        if (hasKeywordBefore && hasKeywordAfter) {
          // Strong evidence both before and after
          activity = 'board_writing';
          confidence = 'high';
        } else if (hasKeywordBefore || hasKeywordAfter) {
          // Partial evidence
          activity = 'board_writing';
          confidence = 'medium';
        } else {
          // No keyword evidence, keep as potential
          activity = 'potential_board_writing';
          confidence = 'low';
        }
      } else if (baseClassification === 'extended_activity') {
        // Extended activity (reading, group work, etc.)
        activity = 'extended_activity';
        if (hasKeywordBefore || hasKeywordAfter) {
          // Some context clues
          confidence = 'medium';
        } else {
          confidence = 'low';
        }
      }

      return {
        start_ms: silence.start_ms,
        end_ms: silence.end_ms,
        duration_ms: silence.duration_ms,
        activity,
        confidence,
        context_before: contextBefore,
        context_after: contextAfter
      };
    });
  }

  /**
   * Build silence markers - full pipeline
   *
   * @param {Array} tokens - Array of tokens with timestamps
   * @param {number} minGapMs - Minimum gap to consider (default 3000)
   * @returns {Array} Complete silence markers ready for storage
   */
  static buildSilenceMarkers(tokens, minGapMs = THRESHOLDS.MIN_SILENCE) {
    if (!tokens || tokens.length < 2) {
      return [];
    }

    logEvent('silence.detection.started', {
      tokenCount: tokens.length,
      minGapMs
    });

    const startTime = Date.now();

    try {
      // Step 1: Detect silences
      const silences = this.detectSilences(tokens, minGapMs);

      // Step 2: Infer activities and add context
      const markers = this.inferBoardWriting(tokens, silences);

      const duration = Date.now() - startTime;

      // Log summary
      const summary = {
        totalMarkers: markers.length,
        byActivity: {}
      };

      markers.forEach(m => {
        summary.byActivity[m.activity] = (summary.byActivity[m.activity] || 0) + 1;
      });

      logEvent('silence.detection.completed', {
        tokenCount: tokens.length,
        markersFound: markers.length,
        durationMs: duration,
        summary
      });

      return markers;

    } catch (error) {
      logEvent('silence.detection.failed', {
        tokenCount: tokens.length,
        errorType: error.name,
        errorMessage: error.message
      });

      logToFile('[SilenceDetector] Detection failed', {
        error: error.message
      });

      return [];
    }
  }
}

// Expose constants for testing and configuration
SilenceDetectorService.BOARD_KEYWORDS = BOARD_KEYWORDS;
SilenceDetectorService.THRESHOLDS = THRESHOLDS;

module.exports = SilenceDetectorService;
