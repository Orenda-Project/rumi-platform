/**
 * Language Detection Utilities
 * Calculates dominant language from Soniox token-level language identification
 *
 * Phase 2: Language Architecture (Updated December 2025)
 *
 * Features:
 * - Token-level language counting
 * - Dominant language calculation (>50% threshold)
 * - Explicit language override command detection
 * - Support for code-switching scenarios
 *
 * Supported Languages:
 * - Tier 1 (full): en, ur
 * - Tier 2 (coaching): es, ar, pa-PK, ps-PK, sd-PK, bal-PK, ta-LK
 */

const { logToFile } = require('./logger');
const { VALID_LANGUAGES, DEFAULT_LANGUAGE } = require('./language-cache');

// Minimum confidence threshold for language detection (0-1)
const MIN_CONFIDENCE_THRESHOLD = 0.5;

// Language code mappings (Soniox/generic → our regional codes)
const LANGUAGE_CODE_MAPPINGS = {
  'pa': 'pa-PK',  // Punjabi → Pakistani Punjabi (Shahmukhi)
  'ps': 'ps-PK',  // Pashto → Pakistani Pashto
  'sd': 'sd-PK',  // Sindhi → Pakistani Sindhi
  'ta': 'ta-LK',  // Tamil → Sri Lankan Tamil
  'bal': 'bal-PK' // Balochi
};

/**
 * Normalize language code to our standard format
 * Maps generic codes (pa, ta) to regional codes (pa-PK, ta-LK)
 *
 * @param {string} code - Language code from Soniox or other sources
 * @returns {string} Normalized language code
 */
function normalizeLanguageCode(code) {
  if (!code) return DEFAULT_LANGUAGE;

  // First extract base code (e.g., 'en-US' -> 'en')
  const baseCode = code.split('-')[0].toLowerCase();

  // Check if it needs mapping to a regional variant
  if (LANGUAGE_CODE_MAPPINGS[baseCode]) {
    return LANGUAGE_CODE_MAPPINGS[baseCode];
  }

  // Check if the full code is already valid
  if (VALID_LANGUAGES.includes(code)) {
    return code;
  }

  // Check if base code is valid
  if (VALID_LANGUAGES.includes(baseCode)) {
    return baseCode;
  }

  return baseCode; // Return as-is for unknown languages
}

// Explicit language override commands
const LANGUAGE_OVERRIDE_COMMANDS = {
  en: [
    /switch to english/i,
    /speak in english/i,
    /talk in english/i,
    /use english/i,
    /english please/i
  ],
  ur: [
    /اردو میں بات کرو/,
    /اردو استعمال کرو/,
    /switch to urdu/i,
    /speak in urdu/i,
    /talk in urdu/i,
    /use urdu/i,
    /urdu please/i
  ],
  es: [
    /habla en español/i,
    /usa español/i,
    /switch to spanish/i,
    /speak in spanish/i,
    /talk in spanish/i,
    /use spanish/i,
    /spanish please/i
  ],
  ar: [
    /تحدث بالعربية/,
    /استخدم العربية/,
    /switch to arabic/i,
    /speak in arabic/i,
    /talk in arabic/i,
    /use arabic/i,
    /arabic please/i,
    /change to arabic/i,
    /arabic language/i,
    /in arabic/i,
    /بالعربي/,
    /تكلم عربي/,
    /اتكلم بالعربية/,
    /اريد بالعربية/,
    /عربي/i
  ],
  // New languages (December 2025)
  'pa-PK': [
    /پنجابی میں بولو/,
    /پنجابی وچ گل کرو/,
    /switch to punjabi/i,
    /speak in punjabi/i,
    /talk in punjabi/i,
    /use punjabi/i,
    /punjabi please/i
  ],
  'sd-PK': [
    /سنڌي ۾ ڳالھايو/,
    /سنڌي استعمال ڪريو/,
    /switch to sindhi/i,
    /speak in sindhi/i,
    /talk in sindhi/i,
    /use sindhi/i,
    /sindhi please/i
  ],
  'ps-PK': [
    /پښتو کښې خبرې وکړئ/,
    /پښتو استعمال کړئ/,
    /switch to pashto/i,
    /speak in pashto/i,
    /talk in pashto/i,
    /use pashto/i,
    /pashto please/i
  ],
  'bal-PK': [
    /بلوچی ءَ گپ کن/,
    /بلوچی استعمال کن/,
    /switch to balochi/i,
    /speak in balochi/i,
    /talk in balochi/i,
    /use balochi/i,
    /balochi please/i
  ],
  'ta-LK': [
    /தமிழில் பேசுங்கள்/,
    /தமிழ் பயன்படுத்துங்கள்/,
    /switch to tamil/i,
    /speak in tamil/i,
    /talk in tamil/i,
    /use tamil/i,
    /tamil please/i
  ]
};

/**
 * Calculate dominant language from Soniox tokens
 * Uses >50% threshold to determine if language should be updated
 *
 * @param {Array} tokens - Soniox tokens with language property
 * @returns {object} { language: string|null, confidence: number, distribution: object }
 */
function calculateDominantLanguage(tokens) {
  if (!tokens || tokens.length === 0) {
    logToFile('⚠️  No tokens provided for language detection', { level: 'warn' });
    return {
      language: null,
      confidence: 0,
      distribution: {},
      totalTokens: 0
    };
  }

  // Count tokens by language
  const languageCounts = {};
  let totalTokensWithLanguage = 0;

  tokens.forEach(token => {
    const lang = token.language;

    // Skip tokens without language info
    if (!lang) {
      return;
    }

    // Normalize and map language code
    const normalizedLang = normalizeLanguageCode(lang.toLowerCase());

    // Only count valid languages
    if (VALID_LANGUAGES.includes(normalizedLang)) {
      languageCounts[normalizedLang] = (languageCounts[normalizedLang] || 0) + 1;
      totalTokensWithLanguage++;
    }
  });

  // Calculate percentages
  const distribution = {};
  Object.keys(languageCounts).forEach(lang => {
    distribution[lang] = {
      count: languageCounts[lang],
      percentage: (languageCounts[lang] / totalTokensWithLanguage) * 100
    };
  });

  // Find dominant language (>50% threshold)
  let dominantLanguage = null;
  let maxPercentage = 0;

  Object.keys(distribution).forEach(lang => {
    if (distribution[lang].percentage > maxPercentage) {
      maxPercentage = distribution[lang].percentage;
      dominantLanguage = lang;
    }
  });

  // Only return dominant language if it meets threshold
  const confidence = maxPercentage / 100;
  const meetsThreshold = confidence > MIN_CONFIDENCE_THRESHOLD;

  logToFile('Language detection results', {
    dominantLanguage: meetsThreshold ? dominantLanguage : 'none (below threshold)',
    confidence: confidence.toFixed(2),
    threshold: MIN_CONFIDENCE_THRESHOLD,
    distribution,
    totalTokensWithLanguage,
    totalTokens: tokens.length
  });

  return {
    language: meetsThreshold ? dominantLanguage : null,
    confidence,
    distribution,
    totalTokens: tokens.length,
    totalTokensWithLanguage
  };
}

/**
 * Detect explicit language override command in text
 * Checks for commands like "Switch to English" or "اردو میں بات کرو"
 *
 * @param {string} text - User input text
 * @returns {string|null} Language code if override detected, null otherwise
 */
function detectLanguageOverride(text) {
  if (!text || typeof text !== 'string') {
    return null;
  }

  // Check each language's override patterns
  for (const [lang, patterns] of Object.entries(LANGUAGE_OVERRIDE_COMMANDS)) {
    for (const pattern of patterns) {
      if (pattern.test(text)) {
        logToFile('✅ Explicit language override detected', {
          targetLanguage: lang,
          matchedPattern: pattern.toString()
        });
        return lang;
      }
    }
  }

  return null;
}

/**
 * Determine if language preference should be updated
 * Compares detected language with current preference
 *
 * @param {string} currentLanguage - User's current language preference
 * @param {string} detectedLanguage - Detected language from tokens
 * @param {number} confidence - Detection confidence (0-1)
 * @returns {boolean} True if language should be updated
 */
function shouldUpdateLanguage(currentLanguage, detectedLanguage, confidence) {
  // Don't update if no clear detection
  if (!detectedLanguage) {
    return false;
  }

  // Don't update if confidence too low
  if (confidence <= MIN_CONFIDENCE_THRESHOLD) {
    logToFile('Language detection confidence too low', {
      currentLanguage,
      detectedLanguage,
      confidence,
      threshold: MIN_CONFIDENCE_THRESHOLD
    });
    return false;
  }

  // Don't update if language hasn't changed
  if (currentLanguage === detectedLanguage) {
    return false;
  }

  logToFile('Language preference should be updated', {
    from: currentLanguage,
    to: detectedLanguage,
    confidence
  });

  return true;
}

/**
 * Analyze language from Soniox transcription result
 * Handles both token-level detection and explicit overrides
 *
 * @param {object} transcriptionResult - Soniox transcription response
 * @param {string} currentLanguage - User's current language preference
 * @returns {object} { shouldUpdate: boolean, newLanguage: string|null, reason: string }
 */
function analyzeLanguage(transcriptionResult, currentLanguage) {
  const result = {
    shouldUpdate: false,
    newLanguage: null,
    reason: 'no_change',
    details: {}
  };

  // Step 1: Check for explicit language override command
  const overrideLanguage = detectLanguageOverride(transcriptionResult.transcript);
  if (overrideLanguage) {
    result.shouldUpdate = true;
    result.newLanguage = overrideLanguage;
    result.reason = 'explicit_override';
    result.details.command = 'detected';

    logToFile('🎯 Language override command detected', {
      currentLanguage,
      newLanguage: overrideLanguage
    });

    return result;
  }

  // Step 2: Calculate dominant language from tokens
  const tokens = transcriptionResult.tokens || [];
  const detection = calculateDominantLanguage(tokens);

  result.details = detection;

  // Step 3: Determine if we should update
  if (shouldUpdateLanguage(currentLanguage, detection.language, detection.confidence)) {
    result.shouldUpdate = true;
    result.newLanguage = detection.language;
    result.reason = 'dominant_language_detected';
  }

  return result;
}

/**
 * Get language display name
 *
 * @param {string} languageCode - Language code (en, es, ur, ar, pa-PK, ps-PK, sd-PK, bal-PK, ta-LK)
 * @returns {string} Display name
 */
function getLanguageDisplayName(languageCode) {
  const names = {
    en: 'English',
    es: 'Español',
    ur: 'اردو',
    ar: 'العربية',
    'pa-PK': 'پنجابی',
    'sd-PK': 'سنڌي',
    'ps-PK': 'پښتو',
    'bal-PK': 'بلوچی',
    'ta-LK': 'தமிழ்'
  };
  return names[languageCode] || languageCode;
}

/**
 * Format language distribution for display
 *
 * @param {object} distribution - Language distribution from calculateDominantLanguage
 * @returns {string} Formatted distribution string
 */
function formatDistribution(distribution) {
  return Object.entries(distribution)
    .map(([lang, data]) => `${lang}: ${data.percentage.toFixed(1)}%`)
    .join(', ');
}

module.exports = {
  calculateDominantLanguage,
  detectLanguageOverride,
  shouldUpdateLanguage,
  analyzeLanguage,
  getLanguageDisplayName,
  formatDistribution,
  normalizeLanguageCode,
  MIN_CONFIDENCE_THRESHOLD,
  LANGUAGE_OVERRIDE_COMMANDS,
  LANGUAGE_CODE_MAPPINGS
};
