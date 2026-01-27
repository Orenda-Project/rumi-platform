/**
 * TTS Voice Selection with Language-Specific Notes
 *
 * CRITICAL: Each language has unique pronunciation requirements.
 * This config ensures the right TTS provider/voice is used.
 *
 * Uplift Guidance (from docs.upliftai.org/orator):
 * - Use native script (Nastaliq for Urdu, not Roman)
 * - Keep English words in ASCII within native script text
 * - Use Western numerals (2024 not ۲۰۲۴)
 *
 * @see PROBLEM_B_IMPLEMENTATION_PLAN.md for full documentation
 */

const TTS_VOICES = {
  'ur': {
    provider: 'uplift',
    voice: 'urdu-female',
    notes: 'Uplift recommended for Urdu. No emotion tags supported.',
    testPhrases: ['اچھا', 'ہاں ہاں', 'lesson plan'],
    scriptGuidance: 'Use Nastaliq script with English terms in ASCII'
  },

  'bal-PK': {
    provider: 'uplift',
    voice: 'balochi-default',
    notes: 'Uplift is ONLY provider with Balochi. Test retroflex ݔ carefully.',
    testPhrases: ['پݔد', 'چِ حال اِنت', 'بُت جوان'],
    criticalSounds: ['ݔ (retroflex)', 'vowel length distinctions'],
    scriptGuidance: 'Use Arabic-Balochi script with English terms in ASCII'
  },

  'sd-PK': {
    provider: 'uplift',
    voice: 'sindhi-default',
    notes: 'Test implosive consonants (ڄ ڃ ڦ ڻ) carefully - unique to Sindhi.',
    testPhrases: ['ڄڻ', 'ڃاڻ', 'ڦل', 'توهان ڪيئن آهيو'],
    criticalSounds: ['ڄ (implosive)', 'ڃ (nasal)', 'ڦ (aspirated)', 'ڻ (retroflex)'],
    scriptGuidance: 'Use Arabic-Sindhi script (52 letters) with ALL vowels marked'
  },

  'ps-PK': {
    provider: 'elevenlabs',
    voice: 'pashto-female',
    notes: 'ElevenLabs for Pashto. Supports emotion tags. Ensure Northern pronunciation.',
    testPhrases: ['ښځه', 'ږمنځ', 'ځای', 'څلور'],
    criticalSounds: ['ښ=[ʂ] NOT [x]', 'ږ=[ʐ] NOT [g]'],
    dialectNote: 'Peshawar/Yusufzai pronunciation required',
    scriptGuidance: 'Use Arabic-Pashto script with English terms in ASCII'
  },

  'pa-PK': {
    provider: 'uplift', // Fallback - may need custom solution
    voice: 'punjabi-default',
    notes: 'CRITICAL: Must handle 3 tones. Standard Urdu TTS will sound WRONG.',
    testPhrases: ['کوڑا (whip)', 'کوڑا (leper)', 'ودھیا', 'تسیں کیویں او'],
    criticalSounds: ['HIGH tone', 'LOW tone', 'MID tone'],
    warning: 'Punjabi TTS with proper tonal support may not exist. Fallback: Urdu TTS + native speaker review',
    scriptGuidance: 'Use Shahmukhi script ONLY (never Gurmukhi)'
  },

  'ta-LK': {
    provider: 'elevenlabs',
    voice: 'tamil-female',
    notes: 'ElevenLabs for Tamil. Supports emotion tags. Test SL vocabulary pronunciation.',
    testPhrases: ['வணக்கம்', 'எப்படி இருக்கீங்க', 'exam-க்கு'],
    dialectNote: 'May have slight Indian Tamil accent - acceptable if intelligible',
    criticalWords: ['பாடசாலை (SL: school)', 'ஆகாரம் (SL: food)'],
    scriptGuidance: 'Use Tamil script with English terms in ASCII'
  }
};

/**
 * Get TTS configuration for a language
 * @param {string} languageCode - Language code
 * @returns {Object|null} TTS config or null if not found
 */
function getTtsConfig(languageCode) {
  return TTS_VOICES[languageCode] || null;
}

/**
 * Get TTS provider for a language
 * @param {string} languageCode - Language code
 * @returns {string} Provider name (uplift, elevenlabs, google)
 */
function getTtsProvider(languageCode) {
  const config = TTS_VOICES[languageCode];
  return config ? config.provider : 'elevenlabs'; // Default fallback
}

/**
 * Check if a language has TTS warnings
 * @param {string} languageCode - Language code
 * @returns {string|null} Warning message or null
 */
function getTtsWarning(languageCode) {
  const config = TTS_VOICES[languageCode];
  return config ? config.warning : null;
}

/**
 * Get all languages with TTS configuration
 * @returns {string[]} Array of language codes
 */
function getSupportedTtsLanguages() {
  return Object.keys(TTS_VOICES);
}

module.exports = {
  TTS_VOICES,
  getTtsConfig,
  getTtsProvider,
  getTtsWarning,
  getSupportedTtsLanguages
};
