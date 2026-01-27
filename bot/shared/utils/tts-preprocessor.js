/**
 * TTS Preprocessor for Educational Video Generation
 *
 * USAGE:
 *   const { makeVoiceoverSpeakable } = require('../utils/tts-preprocessor');
 *   const speakableText = makeVoiceoverSpeakable(script, 'math');
 *
 * PURPOSE:
 *   Converts mathematical, scientific, and technical terms into
 *   speakable form that TTS engines (ElevenLabs) can pronounce correctly.
 *
 * CRITICAL DESIGN DECISIONS:
 *   1. Pattern-based preprocessing runs FIRST (handles compound words, ranges, etc.)
 *   2. Replacements are sorted by LENGTH (longest first) to avoid substring collisions
 *   3. Word boundaries (\b) are used to prevent partial matches
 *   4. Symbols are replaced AFTER patterns (to preserve compound words like "self-driving")
 *   5. Subject-specific dictionaries can be combined for cross-domain topics
 *
 * Version: 2.0 (Issue #30 - Pattern-based preprocessing)
 * Created: December 23, 2025
 * Updated: December 25, 2025
 */

const TTS_DICTIONARY = {
  symbols: {
    '=': ' is equal to ',
    '≠': ' is not equal to ',
    '≈': ' is approximately equal to ',
    '<': ' is less than ',
    '>': ' is greater than ',
    '≤': ' is less than or equal to ',
    '≥': ' is greater than or equal to ',
    '×': ' multiplied by ',
    '÷': ' divided by ',
    '+': ' plus ',
    '-': ' minus ',
    '±': ' plus or minus ',
    'π': 'pie',
    'θ': 'theta',
    'α': 'alpha',
    'β': 'beta',
    'γ': 'gamma',
    'δ': 'delta',
    '∞': 'infinity',
    '√': 'square root of',
    '∛': 'cube root of',
    '→': 'approaches',
    '°': ' degrees',
  },

  powers: {
    '²': ' squared',
    '³': ' cubed',
    '⁴': ' to the fourth',
    '½': 'one half',
    '⅓': 'one third',
    '¼': 'one quarter',
    '⅔': 'two thirds',
    '¾': 'three quarters',
    'r²': 'r squared',
    'r³': 'r cubed',
    'x²': 'x squared',
    'x³': 'x cubed',
    '₀': ' 0',
    '₁': ' 1',
    '₂': ' 2',
    '₃': ' 3',
    '₄': ' 4',
    '₅': ' 5',
    '₆': ' 6',
    '₇': ' 7',
    '₈': ' 8',
    '₉': ' 9',
  },

  trig: {
    'arcsinh': 'arc hyperbolic sine',
    'arccosh': 'arc hyperbolic cosine',
    'arctanh': 'arc hyperbolic tangent',
    'arcsin': 'arc sine',
    'arccos': 'arc cosine',
    'arctan': 'arc tangent',
    'sinh': 'hyperbolic sine',
    'cosh': 'hyperbolic cosine',
    'tanh': 'hyperbolic tangent',
    'cosine': 'cosine',
    'sine': 'sine',
    'tangent': 'tangent',
    'cos': 'cosine',
    'sin': 'sine',
    'tan': 'tangent',
    'csc': 'cosecant',
    'sec': 'secant',
    'cot': 'cotangent',
  },

  algebra: {
    'logarithm': 'logarithm',
    'log₁₀': 'log base ten',
    'log₂': 'log base two',
    'log': 'log',
    'ln': 'natural log',
  },

  geometry: {
    'πr²': 'pie r squared',
    '2πr': 'two pie r',
    '4/3πr³': 'four thirds pie r cubed',
    '4/3': 'four thirds',
    '1/3': 'one third',
    '1/2': 'one half',
    '3D': 'three D',
    '2D': 'two D',
  },

  physics: {
    'E=mc²': 'E equals m c squared',
    'F=ma': 'F equals m a',
    'km/h': 'kilometers per hour',
    'm/s²': 'meters per second squared',
    'm/s': 'meters per second',
    'kg': 'kilograms',
    'km': 'kilometers',
    'cm': 'centimeters',
    'mm': 'millimeters',
  },

  chemistry: {
    'H₂SO₄': 'H 2 S O 4',
    'H₂O': 'H 2 O',
    'CO₂': 'C O 2',
    'O₂': 'O 2',
    'N₂': 'N 2',
    'H₂': 'H 2',
    'NaCl': 'sodium chloride',
    'pH': 'p H',
  },

  biology: {
    'DNA': 'D N A',
    'RNA': 'R N A',
    'ATP': 'A T P',
  },
};

function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function sortByLengthDesc(entries) {
  return entries.sort((a, b) => b[0].length - a[0].length);
}

/**
 * STEP 0: Context-aware pattern preprocessing
 * Process patterns that would be broken by blind symbol replacement
 * Issue #30: Fixes "self-driving" → "self minus driving" and similar issues
 */
function preprocessPatterns(text) {
  let result = text;

  // ===== HYPHEN PATTERNS (process BEFORE symbol replacement) =====

  // Pattern 1: K-through (K-12, K-5, Pre-K)
  result = result.replace(/\bK-(\d+)\b/gi, 'K through $1');
  result = result.replace(/\bPre-K\b/gi, 'Pre K');

  // Pattern 2: Grade/Class patterns (Grade-3, Class-5)
  result = result.replace(/\b(Grade|Class|Level|Year|Stage)-(\d+)\b/gi, '$1 $2');

  // Pattern 3: Multi-hyphen compounds FIRST (state-of-the-art, day-to-day)
  // Must run before single-hyphen to avoid partial matches
  result = result.replace(/\b([a-zA-Z]{2,})-([a-zA-Z]{2,})-([a-zA-Z]{2,})-([a-zA-Z]{2,})\b/g, '$1 $2 $3 $4');
  result = result.replace(/\b([a-zA-Z]{2,})-([a-zA-Z]{2,})-([a-zA-Z]{2,})\b/g, '$1 $2 $3');

  // Pattern 4: Compound words (letter-letter patterns, min 2 chars each side)
  // "self-driving" → "self driving", but "x-y" stays for math
  result = result.replace(/\b([a-zA-Z]{2,})-([a-zA-Z]{2,})\b/g, '$1 $2');

  // Pattern 5: Number ranges with units (5-10 minutes, 100-200 students)
  result = result.replace(/\b(\d+)-(\d+)\s+(minutes?|hours?|days?|weeks?|months?|years?|students?|people|items?|pages?|chapters?)\b/gi, '$1 to $2 $3');

  // Pattern 6: Year ranges (2020-2025)
  result = result.replace(/\b(\d{4})-(\d{4})\b/g, '$1 to $2');

  // Pattern 7: Em dashes and double hyphens → natural pause
  result = result.replace(/—/g, ', ');
  result = result.replace(/--/g, ', ');

  // ===== SLASH PATTERNS =====

  // Pattern 8: 24/7 specifically (before word/word pattern)
  result = result.replace(/\b24\/7\b/g, 'twenty four seven');

  // Pattern 9: Word/word (and/or, yes/no) → "word or word"
  result = result.replace(/\b([a-zA-Z]{2,})\/([a-zA-Z]{2,})\b/g, '$1 or $2');

  // ===== ABBREVIATION PATTERNS =====

  // Pattern 10: Common tech acronyms → spell out
  const spellOutAcronyms = [
    'AI', 'ML', 'API', 'URL', 'SQL', 'HTML', 'CSS', 'JSON', 'XML',
    'PDF', 'USB', 'GPU', 'CPU', 'RAM', 'ROM', 'SSD', 'HDD', 'LLM', 'NLP',
    'CV', 'UI', 'UX', 'IoT', 'VR', 'AR', 'QR', 'IP', 'ID'
  ];
  for (const acronym of spellOutAcronyms) {
    const spelled = acronym.split('').join(' ');
    const regex = new RegExp(`\\b${acronym}\\b`, 'g');
    result = result.replace(regex, spelled);
  }

  // ===== ORDINAL PATTERNS =====

  // Pattern 11: Common ordinals
  result = result.replace(/\b1st\b/gi, 'first');
  result = result.replace(/\b2nd\b/gi, 'second');
  result = result.replace(/\b3rd\b/gi, 'third');
  result = result.replace(/\b21st\b/gi, 'twenty first');
  result = result.replace(/\b22nd\b/gi, 'twenty second');
  result = result.replace(/\b23rd\b/gi, 'twenty third');
  result = result.replace(/\b31st\b/gi, 'thirty first');

  // ===== ROMAN NUMERALS =====

  // Pattern 12: Common Roman numerals in educational context
  result = result.replace(/\bGrade\s+IV\b/gi, 'Grade 4');
  result = result.replace(/\bGrade\s+III\b/gi, 'Grade 3');
  result = result.replace(/\bGrade\s+II\b/gi, 'Grade 2');
  result = result.replace(/\bGrade\s+I\b/gi, 'Grade 1');
  result = result.replace(/\bGrade\s+V\b/gi, 'Grade 5');
  result = result.replace(/\bWorld War\s+II\b/gi, 'World War 2');
  result = result.replace(/\bWorld War\s+I\b/gi, 'World War 1');

  // ===== PERCENTAGES =====

  // Pattern 13: Percentages → "N percent"
  result = result.replace(/(\d+)%/g, '$1 percent');

  return result;
}

/**
 * Convert text to TTS-speakable form
 * @param {string} text - The original voiceover script
 * @param {string|string[]} subjects - Subject(s): 'math', 'physics', 'chemistry', 'biology', 'general'
 * @returns {string} - Text with terms made speakable
 */
function makeVoiceoverSpeakable(text, subjects = 'general') {
  if (!text) return text;

  let result = text;
  const subjectList = Array.isArray(subjects) ? subjects : [subjects];

  // STEP 0: Pattern-based preprocessing (Issue #30)
  // Handles compound words, ranges, abbreviations BEFORE symbol replacement
  // This prevents "self-driving" → "self minus driving"
  result = preprocessPatterns(result);

  // STEP 1: Replace symbols (now only affects math context like "5-3")
  const symbolEntries = sortByLengthDesc(Object.entries(TTS_DICTIONARY.symbols));
  for (const [symbol, spoken] of symbolEntries) {
    result = result.split(symbol).join(spoken);
  }

  // STEP 2: Replace powers/superscripts
  const powerEntries = sortByLengthDesc(Object.entries(TTS_DICTIONARY.powers));
  for (const [power, spoken] of powerEntries) {
    result = result.split(power).join(spoken);
  }

  // STEP 3: Collect relevant dictionaries
  const termDicts = [];
  if (TTS_DICTIONARY.algebra) termDicts.push(TTS_DICTIONARY.algebra);

  const subjectMap = {
    'math': ['trig', 'algebra', 'geometry'],
    'trig': ['trig'],
    'geometry': ['geometry'],
    'physics': ['physics'],
    'chemistry': ['chemistry'],
    'biology': ['biology'],
    'general': ['trig', 'algebra', 'geometry', 'physics', 'chemistry', 'biology'],
  };

  for (const subject of subjectList) {
    const dicts = subjectMap[subject.toLowerCase()] || [];
    for (const dictName of dicts) {
      if (TTS_DICTIONARY[dictName] && !termDicts.includes(TTS_DICTIONARY[dictName])) {
        termDicts.push(TTS_DICTIONARY[dictName]);
      }
    }
  }

  // STEP 4: Collect and sort terms by length
  const allTerms = [];
  for (const dict of termDicts) {
    for (const [term, spoken] of Object.entries(dict)) {
      allTerms.push({ term, spoken });
    }
  }
  allTerms.sort((a, b) => b.term.length - a.term.length);

  // STEP 5: Replace terms with word boundaries
  for (const { term, spoken } of allTerms) {
    const regex = new RegExp(`\\b${escapeRegex(term)}\\b`, 'gi');
    result = result.replace(regex, spoken);
  }

  // STEP 6: Handle fraction patterns
  result = result
    .replace(/opposite\s*\/\s*hypotenuse/gi, 'opposite over hypotenuse')
    .replace(/adjacent\s*\/\s*hypotenuse/gi, 'adjacent over hypotenuse')
    .replace(/opposite\s*\/\s*adjacent/gi, 'opposite over adjacent')
    .replace(/(\w+)\s*\/\s*(\w+)/g, '$1 over $2');

  // STEP 7: Clean up whitespace
  result = result.replace(/\s+/g, ' ').trim();

  return result;
}

module.exports = {
  makeVoiceoverSpeakable,
  preprocessPatterns,  // Exported for testing (Issue #30)
  TTS_DICTIONARY,
};
