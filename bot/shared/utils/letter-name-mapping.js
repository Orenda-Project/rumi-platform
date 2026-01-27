/**
 * Letter Name Mapping Utility
 * Bug #1 Fix: Maps letter symbols to their spoken names for accurate assessment
 *
 * Problem: Children say "alif" but passage stores "ا" - Levenshtein comparison fails
 * Solution: Map letter symbols to all possible spoken name variations
 *
 * Usage:
 *   const { matchLetterToTranscript, URDU_LETTER_NAMES, ENGLISH_LETTER_NAMES } = require('./letter-name-mapping');
 *   matchLetterToTranscript('ا', 'الف بے جیم') // returns true
 */

const { logToFile } = require('./logger');

// ============================================================================
// URDU LETTER NAMES (37 letters + variations)
// Each letter maps to: [primary name, alternate spellings, romanized versions]
// ============================================================================

const URDU_LETTER_NAMES = {
  // Basic Urdu Alphabet (Huroof-e-Tahajji)
  'ا': ['الف', 'الیف', 'alif', 'alef'],
  'ب': ['بے', 'بی', 'bay', 'be', 'bee'],
  'پ': ['پے', 'پی', 'pay', 'pe', 'pee'],
  'ت': ['تے', 'تی', 'tay', 'te', 'tee'],
  'ٹ': ['ٹے', 'ٹی', 'ttay', 'tte', 'ttee'],
  'ث': ['ثے', 'ثی', 'say', 'se', 'see'],
  'ج': ['جیم', 'جم', 'jeem', 'jim', 'jm'],
  'چ': ['چے', 'چی', 'chay', 'che', 'chee'],
  'ح': ['حے', 'حی', 'hay', 'he', 'hee', 'bari he'],
  'خ': ['خے', 'خی', 'khay', 'khe', 'khee'],
  'د': ['دال', 'ڈال', 'daal', 'dal'],
  'ڈ': ['ڈال', 'ڈڈال', 'ddaal', 'ddal'],
  'ذ': ['ذال', 'zaal', 'zal'],
  'ر': ['رے', 'ری', 'ray', 're', 'ree'],
  'ڑ': ['ڑے', 'ڑی', 'rray', 'rre'],
  'ز': ['زے', 'زی', 'zay', 'ze', 'zee'],
  'ژ': ['ژے', 'ژی', 'zhay', 'zhe'],
  'س': ['سین', 'سن', 'seen', 'sin'],
  'ش': ['شین', 'شن', 'sheen', 'shin'],
  'ص': ['صاد', 'صواد', 'suad', 'sad', 'swad'],
  'ض': ['ضاد', 'ضواد', 'zuad', 'zad', 'zwad'],
  'ط': ['طوئے', 'طے', 'toay', 'toe', 'toy'],
  'ظ': ['ظوئے', 'ظے', 'zoay', 'zoe', 'zoy'],
  'ع': ['عین', 'عن', 'ain', 'ayn'],
  'غ': ['غین', 'غن', 'ghain', 'ghayn'],
  'ف': ['فے', 'فی', 'fay', 'fe', 'fee'],
  'ق': ['قاف', 'قف', 'qaaf', 'qaf'],
  'ک': ['کاف', 'کف', 'kaaf', 'kaf'],
  'گ': ['گاف', 'گف', 'gaaf', 'gaf'],
  'ل': ['لام', 'لم', 'laam', 'lam'],
  'م': ['میم', 'مم', 'meem', 'mim'],
  'ن': ['نون', 'نن', 'noon', 'nun'],
  'و': ['واؤ', 'واو', 'wao', 'vao', 'wow'],
  'ہ': ['ہے', 'ہی', 'hay', 'he', 'choti he', 'gol he'],
  'ھ': ['دو چشمی ہے', 'dochasmi he', 'do chashmi'],
  'ء': ['ہمزہ', 'hamza', 'hamzah'],
  'ی': ['یے', 'یی', 'yay', 'ye', 'yee', 'choti ye'],
  'ے': ['بڑی یے', 'bari ye', 'bari yay'],

  // Numbers in Urdu (for completeness)
  '۰': ['صفر', 'زیرو', 'zero', 'sifar'],
  '۱': ['ایک', 'one', 'ek'],
  '۲': ['دو', 'two', 'do'],
  '۳': ['تین', 'three', 'teen'],
  '۴': ['چار', 'four', 'char'],
  '۵': ['پانچ', 'five', 'paanch'],
  '۶': ['چھ', 'six', 'chhe'],
  '۷': ['سات', 'seven', 'saat'],
  '۸': ['آٹھ', 'eight', 'aath'],
  '۹': ['نو', 'nine', 'nau'],
};

// ============================================================================
// ENGLISH LETTER NAMES (26 letters + variations)
// Includes both letter names ("ay", "bee") and letter sounds ("ah", "buh")
// ============================================================================

const ENGLISH_LETTER_NAMES = {
  // Uppercase
  'A': ['ay', 'a', 'ah', 'ae', 'capital a', 'big a'],
  'B': ['bee', 'be', 'buh', 'b', 'capital b', 'big b'],
  'C': ['see', 'cee', 'ce', 'c', 'kuh', 'suh', 'capital c', 'big c'],
  'D': ['dee', 'de', 'd', 'duh', 'capital d', 'big d'],
  'E': ['ee', 'e', 'eh', 'capital e', 'big e'],
  'F': ['ef', 'eff', 'f', 'fuh', 'capital f', 'big f'],
  'G': ['jee', 'gee', 'ge', 'g', 'guh', 'capital g', 'big g'],
  'H': ['aitch', 'aych', 'h', 'huh', 'capital h', 'big h'],
  'I': ['eye', 'ai', 'i', 'ih', 'capital i', 'big i'],
  'J': ['jay', 'je', 'j', 'juh', 'capital j', 'big j'],
  'K': ['kay', 'ke', 'k', 'kuh', 'capital k', 'big k'],
  'L': ['el', 'ell', 'l', 'luh', 'capital l', 'big l'],
  'M': ['em', 'emm', 'm', 'muh', 'capital m', 'big m'],
  'N': ['en', 'enn', 'n', 'nuh', 'capital n', 'big n'],
  'O': ['oh', 'o', 'aw', 'capital o', 'big o'],
  'P': ['pee', 'pe', 'p', 'puh', 'capital p', 'big p'],
  'Q': ['cue', 'queue', 'kyoo', 'q', 'kwuh', 'capital q', 'big q'],
  'R': ['ar', 'are', 'r', 'ruh', 'capital r', 'big r'],
  'S': ['es', 'ess', 's', 'suh', 'capital s', 'big s'],
  'T': ['tee', 'te', 't', 'tuh', 'capital t', 'big t'],
  'U': ['you', 'yu', 'u', 'uh', 'capital u', 'big u'],
  'V': ['vee', 've', 'v', 'vuh', 'capital v', 'big v'],
  'W': ['double you', 'double u', 'w', 'wuh', 'capital w', 'big w'],
  'X': ['ex', 'x', 'ks', 'capital x', 'big x'],
  'Y': ['why', 'wye', 'y', 'yuh', 'capital y', 'big y'],
  'Z': ['zee', 'zed', 'z', 'zuh', 'capital z', 'big z'],

  // Lowercase (same mappings, different key)
  'a': ['ay', 'a', 'ah', 'ae', 'small a', 'little a', 'lowercase a'],
  'b': ['bee', 'be', 'buh', 'b', 'small b', 'little b', 'lowercase b'],
  'c': ['see', 'cee', 'ce', 'c', 'kuh', 'suh', 'small c', 'little c', 'lowercase c'],
  'd': ['dee', 'de', 'd', 'duh', 'small d', 'little d', 'lowercase d'],
  'e': ['ee', 'e', 'eh', 'small e', 'little e', 'lowercase e'],
  'f': ['ef', 'eff', 'f', 'fuh', 'small f', 'little f', 'lowercase f'],
  'g': ['jee', 'gee', 'ge', 'g', 'guh', 'small g', 'little g', 'lowercase g'],
  'h': ['aitch', 'aych', 'h', 'huh', 'small h', 'little h', 'lowercase h'],
  'i': ['eye', 'ai', 'i', 'ih', 'small i', 'little i', 'lowercase i'],
  'j': ['jay', 'je', 'j', 'juh', 'small j', 'little j', 'lowercase j'],
  'k': ['kay', 'ke', 'k', 'kuh', 'small k', 'little k', 'lowercase k'],
  'l': ['el', 'ell', 'l', 'luh', 'small l', 'little l', 'lowercase l'],
  'm': ['em', 'emm', 'm', 'muh', 'small m', 'little m', 'lowercase m'],
  'n': ['en', 'enn', 'n', 'nuh', 'small n', 'little n', 'lowercase n'],
  'o': ['oh', 'o', 'aw', 'small o', 'little o', 'lowercase o'],
  'p': ['pee', 'pe', 'p', 'puh', 'small p', 'little p', 'lowercase p'],
  'q': ['cue', 'queue', 'kyoo', 'q', 'kwuh', 'small q', 'little q', 'lowercase q'],
  'r': ['ar', 'are', 'r', 'ruh', 'small r', 'little r', 'lowercase r'],
  's': ['es', 'ess', 's', 'suh', 'small s', 'little s', 'lowercase s'],
  't': ['tee', 'te', 't', 'tuh', 'small t', 'little t', 'lowercase t'],
  'u': ['you', 'yu', 'u', 'uh', 'small u', 'little u', 'lowercase u'],
  'v': ['vee', 've', 'v', 'vuh', 'small v', 'little v', 'lowercase v'],
  'w': ['double you', 'double u', 'w', 'wuh', 'small w', 'little w', 'lowercase w'],
  'x': ['ex', 'x', 'ks', 'small x', 'little x', 'lowercase x'],
  'y': ['why', 'wye', 'y', 'yuh', 'small y', 'little y', 'lowercase y'],
  'z': ['zee', 'zed', 'z', 'zuh', 'small z', 'little z', 'lowercase z'],
};

// ============================================================================
// MATCHING FUNCTIONS
// ============================================================================

/**
 * Normalize text for comparison (lowercase, remove punctuation, extra spaces)
 * @param {string} text - Text to normalize
 * @returns {string} Normalized text
 */
function normalizeText(text) {
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(/[،؟۔,.!?:;'"()\[\]{}]/g, '') // Remove punctuation (Urdu + English)
    .replace(/\s+/g, ' ')  // Normalize whitespace
    .trim();
}

/**
 * Check if a letter's name appears in the transcript
 * @param {string} letter - Single letter symbol (e.g., 'ا' or 'A')
 * @param {string} transcript - Full transcript text
 * @param {string} language - 'ur' or 'en' (optional, auto-detected)
 * @returns {boolean} True if any name variation found in transcript
 */
function matchLetterToTranscript(letter, transcript, language = null) {
  if (!letter || !transcript) return false;

  const normalizedTranscript = normalizeText(transcript);

  // Auto-detect language if not provided
  const isUrdu = language === 'ur' || /[\u0600-\u06FF]/.test(letter);
  const letterMap = isUrdu ? URDU_LETTER_NAMES : ENGLISH_LETTER_NAMES;

  // Get possible names for this letter
  const names = letterMap[letter] || letterMap[letter.toUpperCase()] || [];

  if (names.length === 0) {
    // Letter not in mapping - fallback to direct match
    return normalizedTranscript.includes(normalizeText(letter));
  }

  // Check if any name variation appears in transcript
  for (const name of names) {
    const normalizedName = normalizeText(name);
    if (normalizedTranscript.includes(normalizedName)) {
      return true;
    }
  }

  return false;
}

/**
 * Match all letters in a passage against transcript
 * @param {string[]} letters - Array of letter symbols from passage
 * @param {string} transcript - Full transcript text
 * @param {string} language - 'ur' or 'en'
 * @returns {Object} { matches: boolean[], accuracy: number, matched: number, total: number }
 */
function matchAllLetters(letters, transcript, language) {
  if (!letters || letters.length === 0) {
    return { matches: [], accuracy: 0, matched: 0, total: 0 };
  }

  const matches = letters.map(letter => matchLetterToTranscript(letter, transcript, language));
  const matched = matches.filter(Boolean).length;
  const accuracy = Math.round((matched / letters.length) * 100);

  logToFile('📊 Letter matching results', {
    language,
    total: letters.length,
    matched,
    accuracy: `${accuracy}%`,
    letters: letters.join(' '),
    matchDetails: letters.map((l, i) => `${l}:${matches[i] ? '✓' : '✗'}`).join(' ')
  });

  return {
    matches,
    accuracy,
    matched,
    total: letters.length
  };
}

/**
 * Get the expected spoken name for a letter (for TTS/instructions)
 * @param {string} letter - Letter symbol
 * @param {string} language - 'ur' or 'en'
 * @returns {string} Primary spoken name
 */
function getLetterName(letter, language) {
  const isUrdu = language === 'ur' || /[\u0600-\u06FF]/.test(letter);
  const letterMap = isUrdu ? URDU_LETTER_NAMES : ENGLISH_LETTER_NAMES;
  const names = letterMap[letter] || letterMap[letter.toUpperCase()] || [];
  return names[0] || letter; // Return primary name or letter itself
}

module.exports = {
  URDU_LETTER_NAMES,
  ENGLISH_LETTER_NAMES,
  normalizeText,
  matchLetterToTranscript,
  matchAllLetters,
  getLetterName
};
