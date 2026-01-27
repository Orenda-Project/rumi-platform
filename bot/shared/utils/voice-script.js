/**
 * Voice Script Transformer
 *
 * Transforms GPT responses into TTS-optimized "voice scripts".
 * Applies sentence breaking, pause insertion, and number conversion.
 *
 * @see PROBLEM_B_IMPLEMENTATION_PLAN.md for full documentation
 */

/**
 * Transform response into TTS-optimized voice script
 * @param {string} text - Raw response text
 * @param {string} language - Target language code
 * @returns {string} TTS-optimized voice script
 */
function optimizeForTTS(text, language) {
  if (!text) return '';

  let optimized = text;

  // 1. Break long sentences (>20 words)
  optimized = breakLongSentences(optimized, language);

  // 2. Add natural pauses with punctuation
  optimized = addNaturalPauses(optimized, language);

  // 3. Write out small numbers
  optimized = convertSmallNumbers(optimized, language);

  // 4. Clean up formatting
  optimized = cleanFormatting(optimized, language);

  // 5. Ensure clear ending
  optimized = ensureClearEnding(optimized, language);

  return optimized;
}

/**
 * Break sentences longer than 20 words
 * @param {string} text - Text to process
 * @param {string} language - Target language code
 * @returns {string} Text with broken sentences
 */
function breakLongSentences(text, language) {
  // Sentence enders based on language
  const sentenceEnder = ['ta-LK'].includes(language) ? /[.!?]/ : /[.!?۔؟]/;
  const sentences = text.split(sentenceEnder);

  return sentences.map(sentence => {
    const trimmed = sentence.trim();
    if (!trimmed) return '';

    const words = trimmed.split(/\s+/);
    if (words.length > 20) {
      // Find natural break point (after 10-12 words)
      const mid = Math.min(12, Math.floor(words.length / 2));
      const comma = ['ta-LK'].includes(language) ? ',' : '،';
      words.splice(mid, 0, comma);
      return words.join(' ');
    }
    return trimmed;
  }).filter(s => s).join(getFullStop(language) + ' ');
}

/**
 * Add natural pauses after conjunctions
 * @param {string} text - Text to process
 * @param {string} language - Target language code
 * @returns {string} Text with natural pauses
 */
function addNaturalPauses(text, language) {
  const conjunctions = {
    'ur': ['اور', 'لیکن', 'پھر', 'کیونکہ', 'مگر', 'تاکہ'],
    'bal-PK': ['اُو', 'بلے', 'پدا', 'کہ'],
    'sd-PK': ['۽', 'پر', 'پوءِ', 'ڇو ته'],
    'ps-PK': ['او', 'خو', 'بیا', 'ځکه'],
    'pa-PK': ['تے', 'پر', 'فیر', 'کیونجے'],
    'ta-LK': ['மற்றும்', 'ஆனால்', 'பின்னர்', 'ஏனென்றால்']
  };

  const langConjunctions = conjunctions[language] || conjunctions['ur'];
  const comma = ['ta-LK'].includes(language) ? ',' : '،';

  langConjunctions.forEach(conj => {
    // Add comma after conjunction if not already followed by punctuation
    const regex = new RegExp(`(${conj})\\s+(?![،۔,.])`,'g');
    text = text.replace(regex, `$1${comma} `);
  });

  return text;
}

/**
 * Convert numbers 0-10 to words in the target language
 * @param {string} text - Text to process
 * @param {string} language - Target language code
 * @returns {string} Text with numbers as words
 */
function convertSmallNumbers(text, language) {
  const numberWords = {
    'ur': ['صفر', 'ایک', 'دو', 'تین', 'چار', 'پانچ', 'چھ', 'سات', 'آٹھ', 'نو', 'دس'],
    'bal-PK': ['صفر', 'یک', 'دو', 'سے', 'چار', 'پنچ', 'شش', 'ہپت', 'ہشت', 'نُہ', 'دہ'],
    'sd-PK': ['صفر', 'ھڪ', 'ٻه', 'ٽي', 'چار', 'پنج', 'ڇھ', 'ست', 'اٺ', 'نو', 'ڏھ'],
    'ps-PK': ['صفر', 'یو', 'دوه', 'درې', 'څلور', 'پنځه', 'شپږ', 'اووه', 'اته', 'نهه', 'لس'],
    'pa-PK': ['صفر', 'اک', 'دو', 'تن', 'چار', 'پنج', 'چھ', 'ست', 'اٹھ', 'نوں', 'دس'],
    'ta-LK': ['பூஜ்ஜியம்', 'ஒன்று', 'இரண்டு', 'மூன்று', 'நான்கு', 'ஐந்து', 'ஆறு', 'ஏழு', 'எட்டு', 'ஒன்பது', 'பத்து']
  };

  const words = numberWords[language] || numberWords['ur'];

  // Convert standalone digits 0-10 to words
  // Only convert when surrounded by word boundaries, not in larger numbers
  for (let i = 10; i >= 0; i--) {
    const regex = new RegExp(`(?<!\\d)${i}(?!\\d)`, 'g');
    text = text.replace(regex, words[i]);
  }

  return text;
}

/**
 * Clean up formatting issues
 * @param {string} text - Text to process
 * @param {string} language - Target language code
 * @returns {string} Cleaned text
 */
function cleanFormatting(text, language) {
  const fullStop = getFullStop(language);
  const comma = ['ta-LK'].includes(language) ? ',' : '،';

  return text
    .replace(/\s+/g, ' ')                           // Multiple spaces to single
    .replace(/\s+([،۔؟!,.])/g, '$1')               // No space before punctuation
    .replace(/([،۔؟!,.])(?!\s|$)/g, '$1 ')         // Space after punctuation
    .replace(new RegExp(`${fullStop}\\s*${fullStop}`, 'g'), fullStop) // No double periods
    .trim();
}

/**
 * Ensure response ends with proper punctuation
 * @param {string} text - Text to process
 * @param {string} language - Target language code
 * @returns {string} Text with proper ending
 */
function ensureClearEnding(text, language) {
  const trimmed = text.trim();
  const endsWithPunctuation = /[۔.!?؟]$/.test(trimmed);

  if (!endsWithPunctuation) {
    return trimmed + getFullStop(language);
  }

  return trimmed;
}

/**
 * Get the full stop character for a language
 * @param {string} language - Language code
 * @returns {string} Full stop character
 */
function getFullStop(language) {
  // RTL languages use Arabic full stop
  if (['ur', 'bal-PK', 'sd-PK', 'ps-PK', 'pa-PK'].includes(language)) {
    return '۔';
  }
  return '.';
}

/**
 * Get the comma character for a language
 * @param {string} language - Language code
 * @returns {string} Comma character
 */
function getComma(language) {
  if (['ur', 'bal-PK', 'sd-PK', 'ps-PK', 'pa-PK'].includes(language)) {
    return '،';
  }
  return ',';
}

/**
 * Estimate speech duration for text
 * @param {string} text - Text to analyze
 * @param {string} language - Language code
 * @returns {Object} Duration estimate
 */
function estimateSpeechDuration(text, language) {
  const words = text.split(/\s+/).length;

  // Average speaking rate: ~150 words per minute for conversational speech
  // Adjust for RTL languages which may have different word lengths
  const wordsPerMinute = ['ta-LK'].includes(language) ? 140 : 150;

  const durationSeconds = (words / wordsPerMinute) * 60;

  return {
    words,
    estimatedSeconds: Math.round(durationSeconds),
    isWithinLimit: durationSeconds <= 60, // 60 second limit
    recommendation: durationSeconds > 60 ? 'Response too long for voice note. Shorten.' : null
  };
}

module.exports = {
  optimizeForTTS,
  breakLongSentences,
  addNaturalPauses,
  convertSmallNumbers,
  cleanFormatting,
  ensureClearEnding,
  getFullStop,
  getComma,
  estimateSpeechDuration
};
