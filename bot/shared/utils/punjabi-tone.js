/**
 * Punjabi Tone Awareness Module
 *
 * Problem: Punjabi has 3 tones (high, mid, low) NOT marked in Shahmukhi script.
 * Solution: Context-based disambiguation + TTS hints.
 *
 * NOTE: Full solution requires ML model trained on Punjabi speech data.
 * This module provides awareness and guidance for future development.
 *
 * @see PROBLEM_B_IMPLEMENTATION_PLAN.md for full documentation
 */

const { logToFile } = require('./logger');

// High-frequency homographs with tonal distinction
// These words have the same spelling but different meanings based on tone
const TONAL_HOMOGRAPHS = {
  'کوڑا': [
    { meaning: 'leper', tone: 'HIGH', ipa: 'kóṛā', context: ['بیمار', 'مرض', 'hospital', 'بیماری'] },
    { meaning: 'whip', tone: 'LOW', ipa: 'kòṛā', context: ['گھوڑا', 'مارنا', 'چابک', 'سزا'] }
  ],
  'گھوڑا': [
    { meaning: 'horse', tone: 'HIGH', ipa: 'kʰóṛā', context: ['سواری', 'جانور', 'گھڑ سوار'] },
    { meaning: 'waterfall', tone: 'LOW', ipa: 'kʰòṛā', context: ['پانی', 'ندی', 'آبشار'] }
  ],
  'کڑا': [
    { meaning: 'bitter', tone: 'HIGH', ipa: 'káṛā', context: ['سواد', 'دوائی', 'تلخ'] },
    { meaning: 'bangle', tone: 'LOW', ipa: 'kàṛā', context: ['زیور', 'ہتھ', 'سونا'] }
  ],
  'موڑا': [
    { meaning: 'boy', tone: 'HIGH', ipa: 'múṛā', context: ['بچہ', 'لڑکا', 'منڈا'] },
    { meaning: 'turned', tone: 'LOW', ipa: 'mùṛā', context: ['گھومنا', 'واپس', 'پلٹنا'] }
  ],
  'چڑا': [
    { meaning: 'sparrow (male)', tone: 'HIGH', ipa: 'čáṛā', context: ['چڑی', 'پنچھی', 'پرندہ'] },
    { meaning: 'climbed', tone: 'LOW', ipa: 'čàṛā', context: ['چڑھنا', 'اوپر', 'سیڑھی'] }
  ]
};

// Common tonal minimal pairs for testing TTS
const TTS_TEST_PAIRS = [
  { word: 'کوڑا', contexts: ['گھوڑے کا کوڑا', 'کوڑا مریض'] },
  { word: 'گھوڑا', contexts: ['تیز گھوڑا', 'پہاڑی گھوڑا'] }
];

/**
 * Flag potential tonal ambiguity in text
 * @param {string} text - Punjabi Shahmukhi text
 * @returns {Object} Ambiguity analysis
 */
function detectTonalAmbiguity(text) {
  if (!text) {
    return { hasAmbiguity: false, ambiguities: [], ttsWarning: null };
  }

  const ambiguities = [];

  Object.keys(TONAL_HOMOGRAPHS).forEach(word => {
    if (text.includes(word)) {
      const meanings = TONAL_HOMOGRAPHS[word];

      // Try to determine which meaning based on context
      const inferredMeaning = inferMeaningFromContext(text, word, meanings);

      ambiguities.push({
        word,
        position: text.indexOf(word),
        possibleMeanings: meanings,
        inferredMeaning,
        confidence: inferredMeaning ? 'medium' : 'low',
        recommendation: inferredMeaning
          ? `Likely means "${inferredMeaning.meaning}" based on context`
          : 'Context unclear - use surrounding words to disambiguate'
      });
    }
  });

  return {
    hasAmbiguity: ambiguities.length > 0,
    ambiguities,
    ambiguityCount: ambiguities.length,
    ttsWarning: ambiguities.length > 0
      ? 'Punjabi TTS may mispronounce tonal words. Native speaker review recommended.'
      : null
  };
}

/**
 * Try to infer meaning from surrounding context
 * @param {string} text - Full text
 * @param {string} word - Ambiguous word
 * @param {Array} meanings - Possible meanings with context words
 * @returns {Object|null} Best matching meaning or null
 */
function inferMeaningFromContext(text, word, meanings) {
  let bestMatch = null;
  let bestScore = 0;

  meanings.forEach(meaning => {
    const contextScore = meaning.context.filter(ctx =>
      text.toLowerCase().includes(ctx.toLowerCase())
    ).length;

    if (contextScore > bestScore) {
      bestScore = contextScore;
      bestMatch = meaning;
    }
  });

  return bestScore > 0 ? bestMatch : null;
}

/**
 * TTS Preparation for Punjabi
 * @param {string} text - Punjabi text
 * @returns {Object} TTS guidance
 */
function preparePunjabiForTts(text) {
  const analysis = detectTonalAmbiguity(text);

  const warnings = [
    'Punjabi is TONAL - standard Urdu TTS will mispronounce',
    'Consider: Specialized Punjabi TTS or native speaker recording'
  ];

  if (analysis.hasAmbiguity) {
    warnings.push(`Tonal ambiguities detected: ${analysis.ambiguityCount}`);
    analysis.ambiguities.forEach(amb => {
      warnings.push(`  - "${amb.word}": ${amb.recommendation}`);
    });
  }

  return {
    text,
    language: 'pa-PK',
    ttsProvider: 'uplift', // Best available, but still imperfect
    hasAmbiguity: analysis.hasAmbiguity,
    ambiguities: analysis.ambiguities,
    warnings,
    fallbackStrategy: 'Use Uplift Punjabi TTS + add to native speaker review queue if ambiguous'
  };
}

/**
 * Check if text contains known tonal homographs
 * @param {string} text - Text to check
 * @returns {boolean}
 */
function hasTonalWords(text) {
  if (!text) return false;
  return Object.keys(TONAL_HOMOGRAPHS).some(word => text.includes(word));
}

/**
 * Get all known tonal homographs
 * @returns {Object}
 */
function getTonalHomographs() {
  return TONAL_HOMOGRAPHS;
}

/**
 * Log tonal analysis for monitoring
 * @param {string} text - Input text
 * @param {Object} analysis - Analysis result
 */
function logTonalAnalysis(text, analysis) {
  if (analysis.hasAmbiguity) {
    logToFile('Punjabi tonal ambiguity detected', {
      textLength: text.length,
      ambiguityCount: analysis.ambiguityCount,
      words: analysis.ambiguities.map(a => a.word),
      hasInferredMeanings: analysis.ambiguities.some(a => a.inferredMeaning)
    });
  }
}

module.exports = {
  TONAL_HOMOGRAPHS,
  TTS_TEST_PAIRS,
  detectTonalAmbiguity,
  inferMeaningFromContext,
  preparePunjabiForTts,
  hasTonalWords,
  getTonalHomographs,
  logTonalAnalysis
};
