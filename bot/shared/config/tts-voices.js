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
  },

  // ── India market (conversation only) ──
  // eleven_v3 is multilingual; OpenAI tts-1 is the automatic fallback. Hindi and
  // Indian Tamil have the strongest ElevenLabs coverage; the others carry a
  // verify-before-launch warning.
  'hi': {
    provider: 'elevenlabs',
    voice: 'hindi-female',
    notes: 'ElevenLabs eleven_v3 supports Hindi well. Supports emotion tags.',
    testPhrases: ['नमस्ते', 'कैसे हैं आप', 'lesson plan बनाइए'],
    scriptGuidance: 'Use Devanagari script with English terms in ASCII, Western numerals'
  },
  'bn': {
    provider: 'elevenlabs',
    voice: 'bengali-female',
    notes: 'ElevenLabs coverage for Bengali is partial.',
    testPhrases: ['নমস্কার', 'কেমন আছেন', 'lesson plan তৈরি করুন'],
    warning: 'Verify Bengali voice quality before launch; fall back to OpenAI tts-1 if poor.',
    scriptGuidance: 'Use Bengali script with English terms in ASCII'
  },
  'mr': {
    provider: 'elevenlabs',
    voice: 'marathi-female',
    notes: 'Marathi shares Devanagari with Hindi but has distinct phonology.',
    testPhrases: ['नमस्कार', 'कसे आहात', 'धडा तयार करा'],
    warning: 'Verify Marathi voice quality before launch; fall back to OpenAI tts-1 if poor.',
    scriptGuidance: 'Use Devanagari script; do not substitute Hindi pronunciation'
  },
  'te': {
    provider: 'elevenlabs',
    voice: 'telugu-female',
    notes: 'Telugu (Dravidian). ElevenLabs coverage is partial.',
    testPhrases: ['నమస్కారం', 'ఎలా ఉన్నారు', 'పాఠ్య ప్రణాళిక'],
    warning: 'Verify Telugu voice quality before launch; fall back to OpenAI tts-1 if poor.',
    scriptGuidance: 'Use Telugu script with English terms in ASCII'
  },
  'ta-IN': {
    provider: 'elevenlabs',
    voice: 'tamil-female',
    notes: 'Indian Tamil. ElevenLabs Tamil support is good. Supports emotion tags.',
    testPhrases: ['வணக்கம்', 'எப்படி இருக்கிறீர்கள்', 'பாடத் திட்டம்'],
    dialectNote: 'Indian (not Sri Lankan) Tamil pronunciation preferred',
    scriptGuidance: 'Use Tamil script with English terms in ASCII'
  },
  'kn': {
    provider: 'elevenlabs',
    voice: 'kannada-female',
    notes: 'Kannada (Dravidian). ElevenLabs coverage is partial.',
    testPhrases: ['ನಮಸ್ಕಾರ', 'ಹೇಗಿದ್ದೀರಾ', 'ಪಾಠ ಯೋಜನೆ'],
    warning: 'Verify Kannada voice quality before launch; fall back to OpenAI tts-1 if poor.',
    scriptGuidance: 'Use Kannada script with English terms in ASCII'
  },

  // ── Francophone markets (conversation only) ──
  // eleven_v3 covers French natively; OpenAI tts-1 is the automatic fallback.
  'fr': {
    provider: 'elevenlabs',
    voice: 'french-female',
    notes: 'ElevenLabs eleven_v3 supports French well. Supports emotion tags.',
    testPhrases: ['bonjour', 'comment allez-vous', 'préparez un plan de leçon'],
    scriptGuidance: 'Use standard French orthography (accents included), Western numerals'
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
