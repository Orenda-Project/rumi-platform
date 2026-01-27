/**
 * Language Detection Utility
 * Bug #10: Language Parameter Passthrough
 *
 * Design Decision:
 * - Default: English (en)
 * - Switch: Only when user EXPLICITLY requests another language
 * - Never auto-detect from message content (too unreliable)
 *
 * Created: November 30, 2025
 */

const { logToFile } = require('./logger');

/**
 * Detect explicitly requested language from user message
 * Only switches from English if user explicitly requests another language
 *
 * @param {string} userMessage - User's message text
 * @returns {string} Language code ('en', 'ur', 'ar', 'es')
 */
function detectRequestedLanguage(userMessage) {
  if (!userMessage || typeof userMessage !== 'string') {
    return 'en';
  }

  const messageLower = userMessage.toLowerCase();

  // Urdu explicit triggers
  const urduTriggers = [
    'in urdu', 'urdu mein', 'اردو میں', 'urdu main',
    'urdu version', 'urdu lesson', 'اردو', 'urdu me',
    'urdu may', 'urdu mai'
  ];

  // Arabic explicit triggers
  const arabicTriggers = [
    'in arabic', 'بالعربية', 'بالعربي', 'arabic version',
    'arabic lesson', 'العربية', 'بالعربیة'
  ];

  // Spanish explicit triggers
  const spanishTriggers = [
    'in spanish', 'en español', 'spanish version',
    'spanish lesson', 'español', 'en espanol'
  ];

  // Check for explicit language requests
  for (const trigger of urduTriggers) {
    if (messageLower.includes(trigger)) {
      logToFile('🌐 Explicit language request detected: Urdu', { trigger });
      return 'ur';
    }
  }

  for (const trigger of arabicTriggers) {
    if (messageLower.includes(trigger)) {
      logToFile('🌐 Explicit language request detected: Arabic', { trigger });
      return 'ar';
    }
  }

  for (const trigger of spanishTriggers) {
    if (messageLower.includes(trigger)) {
      logToFile('🌐 Explicit language request detected: Spanish', { trigger });
      return 'es';
    }
  }

  // Default to English
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
  detectRequestedLanguage,
  parseSubjectAndGrade
};
