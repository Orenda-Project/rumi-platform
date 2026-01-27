/**
 * Attendance Detector Service
 * Detects attendance-related keywords in user messages
 *
 * Created: January 24, 2026
 * Bead: bd-050
 *
 * Keywords:
 * - High confidence: Direct triggers that should immediately start attendance flow
 * - Medium confidence: Related terms that might indicate attendance interest
 */

const { logToFile } = require('../utils/logger');

/**
 * Attendance keywords organized by confidence level
 */
const ATTENDANCE_KEYWORDS = {
  high: [
    // English
    'attendance',
    'roll call',
    '/attendance',

    // Urdu (Arabic script)
    'حاضری',

    // Roman Urdu variants
    'hazri',
    'haazri',
    'haziri',
    'hajri'
  ],
  medium: [
    // English
    'class list',
    'student list',
    'students present',
    'who is absent',
    'who is present',
    'mark present',
    'mark absent',

    // Roman Urdu
    'class ki list',
    'student ki list'
  ]
};

/**
 * Keywords for adding a new class (bd-205)
 * These trigger the setup flow even if user already has classes
 */
const ADD_CLASS_KEYWORDS = [
  // English
  'add class',
  'new class',
  'create class',
  'add a class',
  'another class',
  '/addclass',
  '/add-class',

  // Urdu (Arabic script)
  'نئی کلاس',
  'کلاس شامل',

  // Roman Urdu
  'nayi class',
  'nai class',
  'class add',
  'ek aur class'
];

/**
 * Confidence score mapping
 */
const CONFIDENCE_SCORES = {
  high: 0.9,
  medium: 0.6
};

class AttendanceDetectorService {
  /**
   * Detect attendance intent in a user message
   *
   * @param {string} message - User's message
   * @returns {Object} Detection result
   *   - detected: boolean
   *   - confidence: 'high' | 'medium' (only if detected)
   *   - keyword: string (the matched keyword, only if detected)
   */
  static detectAttendanceIntent(message) {
    // Handle null/undefined/empty
    if (!message || typeof message !== 'string' || message.trim() === '') {
      return { detected: false };
    }

    const lowerMessage = message.toLowerCase();

    // Check high confidence keywords first
    for (const keyword of ATTENDANCE_KEYWORDS.high) {
      if (lowerMessage.includes(keyword.toLowerCase())) {
        logToFile('🎯 Attendance keyword detected (high)', { keyword, message: message.substring(0, 100) });
        return {
          detected: true,
          confidence: 'high',
          keyword: keyword
        };
      }
    }

    // Check medium confidence keywords
    for (const keyword of ATTENDANCE_KEYWORDS.medium) {
      if (lowerMessage.includes(keyword.toLowerCase())) {
        logToFile('🎯 Attendance keyword detected (medium)', { keyword, message: message.substring(0, 100) });
        return {
          detected: true,
          confidence: 'medium',
          keyword: keyword
        };
      }
    }

    // No attendance keywords found
    return { detected: false };
  }

  /**
   * Get numeric confidence score for a confidence level
   *
   * @param {string} confidence - 'high' or 'medium'
   * @returns {number} Score between 0 and 1
   */
  static getConfidenceScore(confidence) {
    return CONFIDENCE_SCORES[confidence] || 0;
  }

  /**
   * Check if message is the /attendance command
   *
   * @param {string} message - User's message
   * @returns {boolean} True if it's the /attendance command
   */
  static isAttendanceCommand(message) {
    if (!message || typeof message !== 'string') {
      return false;
    }

    const trimmed = message.trim().toLowerCase();
    return trimmed === '/attendance' || trimmed.startsWith('/attendance ');
  }

  /**
   * Get all supported keywords (for documentation/debugging)
   *
   * @returns {Object} Keywords organized by confidence level
   */
  static getSupportedKeywords() {
    return { ...ATTENDANCE_KEYWORDS };
  }

  /**
   * Detect "add class" intent in a user message (bd-205)
   * This triggers the setup flow even if user already has classes
   *
   * @param {string} message - User's message
   * @returns {Object} Detection result
   *   - detected: boolean
   *   - keyword: string (the matched keyword, only if detected)
   */
  static detectAddClassIntent(message) {
    // Handle null/undefined/empty
    if (!message || typeof message !== 'string' || message.trim() === '') {
      return { detected: false };
    }

    const lowerMessage = message.toLowerCase();

    for (const keyword of ADD_CLASS_KEYWORDS) {
      if (lowerMessage.includes(keyword.toLowerCase())) {
        logToFile('🎯 Add class keyword detected', { keyword, message: message.substring(0, 100) });
        return {
          detected: true,
          keyword: keyword
        };
      }
    }

    return { detected: false };
  }
}

module.exports = AttendanceDetectorService;
