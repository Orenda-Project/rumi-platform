/**
 * Style Policy Framework
 *
 * Implements controlled code-mixing based on user behavior and preferences.
 * Pakistani languages naturally code-switch - this isn't a bug, it's a feature.
 *
 * @see PROBLEM_B_IMPLEMENTATION_PLAN.md for full documentation
 */

const STYLE_POLICIES = {
  MIXED_PREFERRED: 'mixed_preferred',    // Default: Natural Pakistani teacher mixing
  PURE_PREFERRED: 'pure_preferred',      // User explicitly wants pure language
  SAME_AS_USER: 'same_as_user'           // Mirror user's mixing ratio
};

// Patterns that indicate user wants pure language
const PURITY_PATTERNS = [
  /pure\s*(pashto|sindhi|balochi|punjabi|urdu)/i,
  /صرف\s*(پشتو|سندھی|بلوچی|پنجابی|اردو)/i,
  /without\s*(urdu|english)/i,
  /only\s*(pashto|sindhi|balochi|punjabi)/i,
  /صاف\s*(پشتو|سندھی|بلوچی|پنجابی)/i
];

/**
 * Determine style policy for a response
 * @param {Object} user - User object with preferences
 * @param {string} detectedLanguage - Language detected in user's message
 * @param {string} userMessage - The user's message text
 * @returns {string} Style policy to use
 */
function determineStylePolicy(user, detectedLanguage, userMessage) {
  // Check for explicit purity request in current message
  if (PURITY_PATTERNS.some(regex => regex.test(userMessage))) {
    return STYLE_POLICIES.PURE_PREFERRED;
  }

  // Check user preferences if available
  if (user?.style_preference === 'pure') {
    return STYLE_POLICIES.PURE_PREFERRED;
  }

  // If user has language_locked, use mixed_preferred (they chose the language)
  if (user?.language_locked) {
    return STYLE_POLICIES.MIXED_PREFERRED;
  }

  // Otherwise, mirror user's style
  return STYLE_POLICIES.SAME_AS_USER;
}

/**
 * Analyze mixing ratio in text
 * @param {string} text - Text to analyze
 * @returns {Object} Mixing analysis
 */
function analyzeMixingRatio(text) {
  if (!text) {
    return { arabicRatio: 1, latinRatio: 0, isHeavilyMixed: false };
  }

  const arabicChars = (text.match(/[\u0600-\u06FF]/g) || []).length;
  const latinChars = (text.match(/[a-zA-Z]/g) || []).length;
  const tamilChars = (text.match(/[\u0B80-\u0BFF]/g) || []).length;
  const total = arabicChars + latinChars + tamilChars;

  if (total === 0) {
    return { arabicRatio: 1, latinRatio: 0, isHeavilyMixed: false };
  }

  const latinRatio = latinChars / total;

  return {
    arabicRatio: total > 0 ? arabicChars / total : 1,
    latinRatio: latinRatio,
    tamilRatio: total > 0 ? tamilChars / total : 0,
    isHeavilyMixed: latinRatio > 0.2 && latinRatio < 0.8
  };
}

/**
 * Get style policy instruction for GPT prompt
 * @param {string} stylePolicy - Style policy type
 * @param {string} language - Target language code
 * @param {string} userMessage - User's message for analysis
 * @returns {string} Instruction to add to prompt
 */
function getStylePolicyInstruction(stylePolicy, language, userMessage) {
  const languageNames = {
    'ur': 'Urdu',
    'bal-PK': 'Balochi',
    'sd-PK': 'Sindhi',
    'ps-PK': 'Pashto',
    'pa-PK': 'Punjabi',
    'ta-LK': 'Tamil'
  };

  const langName = languageNames[language] || language;

  switch (stylePolicy) {
    case STYLE_POLICIES.MIXED_PREFERRED:
      return `Use natural Pakistani teacher code-mixing. English educational terms (lesson plan, worksheet, activity) and common Urdu words are acceptable and encouraged. This is how teachers actually speak.`;

    case STYLE_POLICIES.PURE_PREFERRED:
      return `Respond in PURE ${langName} only. Avoid English and Urdu words completely. If you don't know a word in ${langName}, describe the concept using simpler ${langName} words. The user explicitly requested language purity.`;

    case STYLE_POLICIES.SAME_AS_USER:
      const userMixing = analyzeMixingRatio(userMessage);
      if (userMixing.isHeavilyMixed) {
        return `The user is code-mixing heavily (${Math.round(userMixing.latinRatio * 100)}% Latin script). Match their style with natural mixing of English/Urdu terms.`;
      } else if (userMixing.latinRatio > 0.05) {
        return `The user is using moderate mixing. Use some English terms naturally but keep ${langName} as the primary language.`;
      } else {
        return `The user is using minimal mixing. Keep your response mostly in ${langName} with only essential English terms.`;
      }

    default:
      return '';
  }
}

module.exports = {
  STYLE_POLICIES,
  determineStylePolicy,
  analyzeMixingRatio,
  getStylePolicyInstruction
};
