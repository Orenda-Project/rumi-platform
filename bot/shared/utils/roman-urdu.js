/**
 * Roman Urdu Detection and Processing
 *
 * 70-80% of digital Urdu communication uses Roman script.
 * We must accept it as input while responding in Nastaliq for TTS.
 *
 * Uplift Guidance: Use native Nastaliq script for TTS output,
 * not Roman transliterations.
 *
 * @see PROBLEM_B_IMPLEMENTATION_PLAN.md for full documentation
 */

const { logToFile } = require('./logger');

// Common Roman Urdu word patterns (high confidence markers)
const ROMAN_URDU_MARKERS = [
  // Question words
  'kya', 'kaise', 'kyun', 'kahan', 'kab', 'kaun', 'kitna', 'konsa',
  // Common verbs/auxiliaries
  'hai', 'hain', 'tha', 'thi', 'the', 'hoga', 'hogi', 'kar', 'karo', 'karna',
  // Pronouns
  'mujhe', 'mujh', 'aap', 'tum', 'hum', 'woh', 'yeh', 'mein', 'main',
  // Common words
  'theek', 'acha', 'accha', 'nahi', 'nhi', 'han', 'haan', 'ji',
  'chahiye', 'chahte', 'zaroor', 'bilkul', 'please', 'plz',
  // Education-related
  'lesson', 'teacher', 'student', 'class', 'school',
  // Greetings
  'salam', 'assalam', 'walaikum', 'khuda', 'hafiz'
];

// Common Roman Urdu spelling variations
const SPELLING_VARIATIONS = {
  'acha': ['acha', 'accha', 'achha', 'achchha'],
  'theek': ['theek', 'thik', 'theik', 'tik'],
  'nahi': ['nahi', 'nhi', 'nahin', 'nai'],
  'haan': ['haan', 'han', 'haa'],
  'kya': ['kya', 'kia', 'kyaa'],
  'hai': ['hai', 'he', 'hay'],
  'hain': ['hain', 'hen', 'hein'],
  'mujhe': ['mujhe', 'mujhay', 'mujhey', 'mjhe'],
  'chahiye': ['chahiye', 'chahie', 'chaiye', 'chahye'],
  'please': ['please', 'plz', 'pls', 'plzz']
};

/**
 * Detect if text is Roman Urdu
 * @param {string} text - User input
 * @returns {boolean} True if likely Roman Urdu
 */
function isRomanUrdu(text) {
  if (!text || typeof text !== 'string') return false;

  const lowerText = text.toLowerCase();

  // Count character types
  const latinChars = (text.match(/[a-zA-Z]/g) || []).length;
  const arabicChars = (text.match(/[\u0600-\u06FF]/g) || []).length;
  const totalChars = latinChars + arabicChars;

  if (totalChars === 0) return false;

  // Check Latin ratio (should be mostly Latin for Roman Urdu)
  const latinRatio = latinChars / totalChars;
  if (latinRatio < 0.7) return false;

  // Check for Urdu markers
  const hasUrduMarkers = ROMAN_URDU_MARKERS.some(marker =>
    lowerText.includes(marker)
  );

  // Check for spelling variations
  const hasVariations = Object.values(SPELLING_VARIATIONS).some(variations =>
    variations.some(v => lowerText.includes(v))
  );

  // Must have Latin characters AND (Urdu markers OR sufficient Latin text)
  return latinRatio > 0.7 && (hasUrduMarkers || hasVariations || latinChars > 15);
}

/**
 * Get confidence score for Roman Urdu detection
 * @param {string} text - User input
 * @returns {Object} Detection result with confidence
 */
function detectRomanUrduWithConfidence(text) {
  if (!text || typeof text !== 'string') {
    return { isRomanUrdu: false, confidence: 0, markers: [] };
  }

  const lowerText = text.toLowerCase();
  const words = lowerText.split(/\s+/);

  // Find matching markers
  const foundMarkers = ROMAN_URDU_MARKERS.filter(marker =>
    lowerText.includes(marker)
  );

  // Count character types
  const latinChars = (text.match(/[a-zA-Z]/g) || []).length;
  const arabicChars = (text.match(/[\u0600-\u06FF]/g) || []).length;
  const totalChars = latinChars + arabicChars;

  if (totalChars === 0) {
    return { isRomanUrdu: false, confidence: 0, markers: [] };
  }

  const latinRatio = latinChars / totalChars;

  // Calculate confidence score
  let confidence = 0;

  // Latin ratio contribution (max 40%)
  if (latinRatio > 0.9) confidence += 40;
  else if (latinRatio > 0.7) confidence += 30;
  else if (latinRatio > 0.5) confidence += 15;

  // Marker count contribution (max 40%)
  confidence += Math.min(foundMarkers.length * 10, 40);

  // Word count contribution (max 20%)
  if (words.length >= 3) confidence += 10;
  if (words.length >= 5) confidence += 10;

  return {
    isRomanUrdu: confidence >= 50,
    confidence: Math.min(confidence, 100),
    markers: foundMarkers,
    latinRatio: Math.round(latinRatio * 100),
    wordCount: words.length
  };
}

/**
 * Prepare Roman Urdu for GPT processing
 * @param {string} romanUrdu - User's Roman Urdu input
 * @returns {string} Processing instruction for GPT
 */
function prepareForGpt(romanUrdu) {
  return `The user has sent a message in ROMAN URDU (Latin script):
"${romanUrdu}"

Understand their request and respond in NASTALIQ URDU script (نستعلیق).
Use natural, conversational Urdu with appropriate code-mixing as per your instructions.
Keep English terms (like "lesson plan") in ASCII within the Nastaliq response.`;
}

/**
 * Log Roman Urdu detection for analytics
 * @param {string} text - Input text
 * @param {Object} detection - Detection result
 */
function logRomanUrduDetection(text, detection) {
  logToFile('Roman Urdu detection', {
    inputLength: text.length,
    isRomanUrdu: detection.isRomanUrdu,
    confidence: detection.confidence,
    markers: detection.markers,
    latinRatio: detection.latinRatio
  });
}

module.exports = {
  isRomanUrdu,
  detectRomanUrduWithConfidence,
  prepareForGpt,
  logRomanUrduDetection,
  ROMAN_URDU_MARKERS,
  SPELLING_VARIATIONS
};
