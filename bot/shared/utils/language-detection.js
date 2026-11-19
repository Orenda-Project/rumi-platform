/**
 * Language Detection Utility
 * Language Parameter Passthrough
 *
 * Decides the language of a generated lesson plan / presentation:
 * 1. An explicit request in the message ("in Hindi", "हिंदी में") always wins.
 * 2. A message written mostly in an Indian script gets that language.
 * 3. A teacher whose saved language is Indian gets that language.
 * 4. Otherwise English. Urdu/Arabic/Spanish/French teachers keep the
 *    English default unless they ask — unchanged behaviour for those markets.
 *
 * Created: November 30, 2025
 */

const { logToFile } = require('./logger');

// Explicit-request phrases per language, checked in order (first hit wins).
// Every code here must exist in gamma-languages.config.js — a test enforces
// that every Gamma language is reachable from this list.
const REQUEST_TRIGGERS = [
  {
    code: 'ur',
    triggers: ['in urdu', 'urdu mein', 'اردو میں', 'urdu main', 'urdu version', 'urdu lesson', 'اردو',
      'urdu me', 'urdu may', 'urdu mai']
  },
  {
    code: 'ar',
    triggers: ['in arabic', 'بالعربية', 'بالعربي', 'arabic version', 'arabic lesson', 'العربية', 'بالعربیة']
  },
  {
    code: 'es',
    triggers: ['in spanish', 'en español', 'spanish version', 'spanish lesson', 'español', 'en espanol']
  },
  {
    code: 'hi',
    triggers: ['in hindi', 'hindi mein', 'hindi main', 'hindi me', 'hindi mai', 'hindi may', 'hindi version',
      'hindi lesson', 'हिंदी में', 'हिन्दी में', 'हिंदी मे', 'हिन्दी मे']
  },
  {
    code: 'mr',
    triggers: ['in marathi', 'marathi madhe', 'marathi madhye', 'marathit', 'marathi version', 'marathi lesson',
      'मराठीत', 'मराठी मध्ये', 'मराठीमध्ये', 'मराठी में']
  },
  {
    code: 'bn',
    triggers: ['in bengali', 'in bangla', 'banglay', 'bangla te', 'bengali version', 'bangla version',
      'bengali lesson', 'বাংলায়', 'বাংলা ভাষায়']
  },
  {
    code: 'te',
    triggers: ['in telugu', 'telugu lo', 'telugu version', 'telugu lesson', 'తెలుగులో']
  },
  {
    code: 'ta-IN',
    triggers: ['in tamil', 'tamil il', 'tamil version', 'tamil lesson', 'தமிழில்']
  },
  {
    code: 'kn',
    triggers: ['in kannada', 'kannada dalli', 'kannadadalli', 'kannada version', 'kannada lesson', 'ಕನ್ನಡದಲ್ಲಿ']
  },
  {
    code: 'fr',
    triggers: ['in french', 'en français', 'en francais', 'french version']
  }
];

// Indian languages: the only ones whose saved preference changes the default.
const INDIAN_LANGUAGES = ['hi', 'bn', 'mr', 'te', 'ta-IN', 'kn'];

// Indian (Brahmic) scripts by Unicode block — same ranges as
// language-detector.service.js. Devanagari is Hindi unless the teacher is Marathi.
const INDIC_SCRIPTS = [
  { code: 'hi', re: /[ऀ-ॿ]/g },
  { code: 'bn', re: /[ঀ-৿]/g },
  { code: 'ta-IN', re: /[஀-௿]/g },
  { code: 'te', re: /[ఀ-౿]/g },
  { code: 'kn', re: /[ಀ-೿]/g }
];
const SCRIPT_RATIO_THRESHOLD = 0.2;

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Whole-phrase match: "hindi me" must not fire inside "hindi meanings".
function containsPhrase(text, phrase) {
  return new RegExp(`(?:^|[^\\p{L}\\p{M}])${escapeRegExp(phrase)}(?:$|[^\\p{L}\\p{M}])`, 'u').test(text);
}

function detectExplicitRequest(messageLower) {
  for (const { code, triggers } of REQUEST_TRIGGERS) {
    const trigger = triggers.find((t) => containsPhrase(messageLower, t));
    if (trigger) {
      logToFile('🌐 Explicit language request detected', { code, trigger });
      return code;
    }
  }
  return null;
}

function detectIndicScript(message, preferredLanguage) {
  const totalChars = message.replace(/\s/g, '').length;
  if (totalChars === 0) return null;

  for (const { code, re } of INDIC_SCRIPTS) {
    const ratio = (message.match(re) || []).length / totalChars;
    if (ratio > SCRIPT_RATIO_THRESHOLD) {
      return code === 'hi' && preferredLanguage === 'mr' ? 'mr' : code;
    }
  }
  return null;
}

/**
 * Detect the language a lesson plan / presentation should be generated in.
 *
 * @param {string} userMessage - User's message text
 * @param {object} [opts]
 * @param {string} [opts.preferredLanguage] - users.preferred_language
 * @returns {string} Language code (a key of gamma-languages.config.js)
 */
function detectRequestedLanguage(userMessage, { preferredLanguage } = {}) {
  const message = typeof userMessage === 'string' ? userMessage : '';

  const explicit = detectExplicitRequest(message.toLowerCase());
  if (explicit) return explicit;

  const fromScript = detectIndicScript(message, preferredLanguage);
  if (fromScript) {
    logToFile('🌐 Lesson-plan language from message script', { code: fromScript });
    return fromScript;
  }

  if (INDIAN_LANGUAGES.includes(preferredLanguage)) {
    logToFile('🌐 Lesson-plan language from saved preference', { code: preferredLanguage });
    return preferredLanguage;
  }

  return 'en';
}

/**
 * Parse subject and grade from user message for analytics
 *
 * @param {string} userMessage - User's message text
 * @returns {object} { subject: string|null, grade: string|null }
 */
function parseSubjectAndGrade(userMessage) {
  if (!userMessage || typeof userMessage !== 'string') {
    return { subject: null, grade: null };
  }

  const messageLower = userMessage.toLowerCase();

  // ========== GRADE DETECTION ==========
  const gradePatterns = [
    // Explicit patterns
    { pattern: /grade\s*(\d+|k|kg|kindergarten)/i, extract: 1 },
    { pattern: /class\s*(\d+)/i, extract: 1 },
    { pattern: /(\d+)(?:st|nd|rd|th)\s*grade/i, extract: 1 },
    // Age-based
    { pattern: /(\d+)\s*year\s*olds?/i, extract: 1, type: 'age' },
    // Level-based
    { pattern: /primary|elementary/i, value: '1-5' },
    { pattern: /middle\s*school/i, value: '6-8' },
    { pattern: /high\s*school/i, value: '9-12' },
    { pattern: /pre-?school|pre-?k/i, value: 'PK' },
    { pattern: /early\s*years/i, value: 'EY' }
  ];

  let grade = null;
  for (const p of gradePatterns) {
    const match = messageLower.match(p.pattern);
    if (match) {
      if (p.value) {
        grade = p.value;
      } else if (p.type === 'age') {
        // Convert age to grade (rough approximation: age - 5 = grade)
        const age = parseInt(match[p.extract]);
        grade = Math.max(1, age - 5).toString();
      } else {
        const extracted = match[p.extract];
        grade = extracted.toUpperCase() === 'K' ||
                extracted.toUpperCase() === 'KG' ||
                extracted.toLowerCase() === 'kindergarten'
                  ? 'K'
                  : extracted;
      }
      break;
    }
  }

  // ========== SUBJECT DETECTION ==========
  const subjectKeywords = {
    'math': ['math', 'mathematics', 'algebra', 'geometry', 'calculus', 'arithmetic', 'numbers', 'addition', 'subtraction', 'multiplication', 'division', 'fractions'],
    'science': ['science', 'biology', 'chemistry', 'physics', 'ecology', 'astronomy', 'experiment', 'scientific method', 'nature', 'plants', 'animals'],
    'english': ['english', 'language arts', 'reading', 'writing', 'grammar', 'vocabulary', 'literature', 'poetry', 'comprehension'],
    'urdu': ['urdu', 'اردو', 'urdu language'],
    'social_studies': ['social studies', 'history', 'geography', 'civics', 'economics', 'culture', 'society'],
    'islamiat': ['islamiat', 'islamic studies', 'islam', 'quran', 'hadith', 'اسلامیات'],
    'art': ['art', 'drawing', 'painting', 'craft', 'creative', 'design'],
    'music': ['music', 'singing', 'rhythm', 'instruments'],
    'physical_education': ['physical education', 'PE', 'sports', 'exercise', 'health', 'fitness'],
    'computer': ['computer', 'technology', 'coding', 'programming', 'IT', 'digital'],
    'general': ['general knowledge', 'GK', 'current affairs']
  };

  let subject = null;
  for (const [subj, keywords] of Object.entries(subjectKeywords)) {
    for (const kw of keywords) {
      if (messageLower.includes(kw.toLowerCase())) {
        subject = subj;
        break;
      }
    }
    if (subject) break;
  }

  return {
    subject: subject || null,
    grade: grade || null
  };
}

module.exports = {
  REQUEST_TRIGGERS,
  detectRequestedLanguage,
  parseSubjectAndGrade
};
