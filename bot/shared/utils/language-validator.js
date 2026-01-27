/**
 * Language Validator
 *
 * Post-generation validation to catch language drift before sending to TTS.
 * Detects unwanted English function words, script issues, and dialect drift.
 *
 * @see PROBLEM_B_IMPLEMENTATION_PLAN.md for full documentation
 */

const { logToFile } = require('./logger');

// Educational/technical terms that are ALLOWED in all languages
const ALLOW_LIST = {
  educational: [
    'math', 'maths', 'angles', 'unit', 'activity', 'worksheet', 'lesson', 'plan',
    'teacher', 'student', 'class', 'homework', 'test', 'exam', 'quiz', 'grade',
    'subject', 'topic', 'chapter', 'exercise', 'practice', 'learning', 'teaching'
  ],
  technology: [
    'mobile', 'whatsapp', 'video', 'audio', 'phone', 'app', 'computer', 'internet',
    'online', 'download', 'upload', 'message', 'chat', 'call'
  ],
  common: [
    'ok', 'okay', 'yes', 'no', 'please', 'thank', 'thanks', 'sorry',
    'hello', 'hi', 'bye', 'good', 'great', 'nice', 'ready'
  ],
  abbreviations: ['UN', 'WHO', 'KPK', 'PDF', 'SMS', 'TV']
};

// English function words that indicate model drift (should NOT appear)
const LEAK_LIST = {
  englishFunctionWords: [
    'the', 'and', 'is', 'are', 'was', 'were', 'have', 'has', 'had',
    'will', 'would', 'could', 'should', 'this', 'that', 'these', 'those',
    'there', 'their', 'they', 'them', 'we', 'our', 'your', 'you',
    'can', 'may', 'might', 'must', 'shall', 'been', 'being',
    'for', 'from', 'with', 'about', 'into', 'through', 'during',
    'before', 'after', 'above', 'below', 'between', 'under', 'again'
  ],
  // Dari/Afghan vocabulary that shouldn't appear in Pakistani Pashto
  dariVocabulary: [
    'میخواهم', 'دارم', 'خوب', 'بسیار', 'چطور', 'کجا'
  ],
  // Hindi vocabulary that shouldn't appear in Pakistani Punjabi
  hindiVocabulary: [
    'क्या', 'है', 'हैं', 'में', 'को', 'के'
  ]
};

// Script detection patterns
const SCRIPT_PATTERNS = {
  arabic: /[\u0600-\u06FF]/g,
  latin: /[a-zA-Z]/g,
  devanagari: /[\u0900-\u097F]/g,
  gurmukhi: /[\u0A00-\u0A7F]/g,
  tamil: /[\u0B80-\u0BFF]/g
};

/**
 * Check if response has language drift issues
 * @param {string} response - Generated response
 * @param {string} targetLanguage - Target language code
 * @returns {Object} Validation result
 */
function validateLanguageMixing(response, targetLanguage) {
  const words = response.toLowerCase().split(/\s+/);
  const issues = [];

  // 1. Check for English function word flooding
  const englishFunctionCount = words.filter(w =>
    LEAK_LIST.englishFunctionWords.includes(w)
  ).length;

  if (englishFunctionCount > 3) {
    issues.push({
      type: 'english_drift',
      severity: 'high',
      message: `Too many English function words (${englishFunctionCount})`,
      examples: words.filter(w => LEAK_LIST.englishFunctionWords.includes(w)).slice(0, 5)
    });
  }

  // 2. Check script consistency
  const arabicChars = (response.match(SCRIPT_PATTERNS.arabic) || []).length;
  const latinChars = (response.match(SCRIPT_PATTERNS.latin) || []).length;
  const devanagariChars = (response.match(SCRIPT_PATTERNS.devanagari) || []).length;
  const gurmukhiChars = (response.match(SCRIPT_PATTERNS.gurmukhi) || []).length;
  const tamilChars = (response.match(SCRIPT_PATTERNS.tamil) || []).length;

  const total = arabicChars + latinChars + devanagariChars + gurmukhiChars + tamilChars;

  // For RTL languages (Urdu, Balochi, Sindhi, Pashto, Punjabi), Arabic script should dominate
  if (['ur', 'bal-PK', 'sd-PK', 'ps-PK', 'pa-PK'].includes(targetLanguage)) {
    if (total > 0 && latinChars / total > 0.4) {
      issues.push({
        type: 'script_imbalance',
        severity: 'medium',
        message: `Latin script ratio too high (${Math.round(latinChars / total * 100)}%)`,
        recommendation: 'Response should be primarily in Arabic script'
      });
    }

    // Check for wrong scripts
    if (devanagariChars > 0) {
      issues.push({
        type: 'wrong_script',
        severity: 'high',
        message: 'Devanagari script detected - should be Arabic script only',
        count: devanagariChars
      });
    }

    if (gurmukhiChars > 0 && targetLanguage === 'pa-PK') {
      issues.push({
        type: 'wrong_script',
        severity: 'high',
        message: 'Gurmukhi script detected - Punjabi should use Shahmukhi (Arabic) only',
        count: gurmukhiChars
      });
    }
  }

  // For Tamil, check Tamil script dominance
  if (targetLanguage === 'ta-LK') {
    if (total > 0 && tamilChars / total < 0.5) {
      issues.push({
        type: 'script_imbalance',
        severity: 'medium',
        message: `Tamil script ratio too low (${Math.round(tamilChars / total * 100)}%)`,
        recommendation: 'Response should be primarily in Tamil script'
      });
    }
  }

  // 3. Check for Dari vocabulary leak in Pashto
  if (targetLanguage === 'ps-PK') {
    const dariWords = LEAK_LIST.dariVocabulary.filter(w => response.includes(w));
    if (dariWords.length > 0) {
      issues.push({
        type: 'dialect_drift',
        severity: 'high',
        message: 'Afghan Dari vocabulary detected in Pakistani Pashto',
        examples: dariWords
      });
    }
  }

  // 4. Check sentence length (for TTS optimization)
  const sentences = response.split(/[۔.!?؟]/);
  const longSentences = sentences.filter(s => s.trim().split(/\s+/).length > 20);

  if (longSentences.length > 0) {
    issues.push({
      type: 'sentence_length',
      severity: 'low',
      message: `${longSentences.length} sentences exceed 20 words (affects TTS quality)`,
      recommendation: 'Break into shorter sentences'
    });
  }

  return {
    isValid: issues.filter(i => i.severity === 'high').length === 0,
    issues,
    needsRewrite: issues.filter(i => i.severity !== 'low').length > 0,
    stats: {
      arabicChars,
      latinChars,
      tamilChars,
      totalChars: total,
      wordCount: words.length,
      sentenceCount: sentences.length
    }
  };
}

/**
 * Check if a word is in the allow list
 * @param {string} word - Word to check
 * @returns {boolean}
 */
function isAllowedEnglishWord(word) {
  const lower = word.toLowerCase();
  return Object.values(ALLOW_LIST).some(list => list.includes(lower));
}

/**
 * Count discourse markers in response
 * @param {string} response - Response text
 * @param {string} targetLanguage - Target language code
 * @returns {Object} Discourse marker analysis
 */
function analyzeDiscourseMarkers(response, targetLanguage) {
  const markers = {
    'ur': ['اچھا', 'ہاں', 'دیکھو', 'نا', 'تو', 'بس', 'جی'],
    'bal-PK': ['یعنی', 'اَے', 'بَلے', 'خُو', 'گُشّا'],
    'sd-PK': ['ڏس', 'پوءِ', 'هاڻي', 'سري', 'يعني'],
    'ps-PK': ['خو', 'نو', 'که', 'اوس', 'بیا'],
    'pa-PK': ['یار', 'جی', 'تے', 'پر', 'اوئے'],
    'ta-LK': ['அதான்', 'அப்புறம்', 'சரி', 'ஓஹோ']
  };

  const langMarkers = markers[targetLanguage] || [];
  const found = langMarkers.filter(marker => response.includes(marker));

  const sentences = response.split(/[۔.!?؟]/).filter(s => s.trim());
  const markerRate = sentences.length > 0 ? found.length / sentences.length : 0;

  return {
    found,
    count: found.length,
    sentenceCount: sentences.length,
    markerRate: Math.round(markerRate * 100),
    isNatural: markerRate >= 0.15 && markerRate <= 0.5, // 15-50% is natural
    recommendation: markerRate < 0.15 ? 'Add more discourse markers' : null
  };
}

module.exports = {
  validateLanguageMixing,
  isAllowedEnglishWord,
  analyzeDiscourseMarkers,
  ALLOW_LIST,
  LEAK_LIST,
  SCRIPT_PATTERNS
};
