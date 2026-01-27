const { logToFile } = require('../utils/logger');
const OpenAI = require('openai');

// Initialize OpenAI client
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Valid language codes (must match VALID_LANGUAGES in language-cache.js)
const VALID_LANGUAGE_CODES = ['en', 'es', 'ur', 'ar', 'pa-PK', 'ps-PK', 'sd-PK', 'bal-PK', 'ta-LK'];

// Languages that Soniox handles well - trust these directly
const SONIOX_TRUSTED_LANGUAGES = ['en', 'es', 'ar', 'ta'];

/**
 * Language Detector Service
 * Detects the primary language of text input
 *
 * Phase 2 Update (December 2025):
 * - Added GPT-4o-mini confirmation for ambiguous languages
 * - Supports: en, ur, ar, es, pa-PK, ps-PK, sd-PK, bal-PK, ta-LK
 * - Uses GPT to distinguish Sindhi/Balochi/Pashto from Urdu (same script)
 */
class LanguageDetectorService {
  /**
   * Detect the primary language of text
   * @param {string} text - Text to analyze
   * @returns {string} 'en' for English, 'ur' for Urdu, 'mixed' for mixed (defaults to 'en')
   */
  static detectLanguage(text) {
    if (!text || text.trim().length === 0) {
      return 'en'; // Default to English for empty text
    }

    // Count Arabic script characters (U+0600 to U+06FF - used by both Arabic and Urdu)
    // Note: Arabic and Urdu share the same script range, so we need additional logic
    const arabicScriptChars = (text.match(/[\u0600-\u06FF]/g) || []).length;

    // Count Spanish-specific characters (for basic Spanish detection)
    const spanishChars = (text.match(/[áéíóúñ¿¡ÁÉÍÓÚÑ]/g) || []).length;

    // Count total non-whitespace characters
    const totalChars = text.replace(/\s/g, '').length;

    if (totalChars === 0) {
      return 'en'; // Default to English if no characters
    }

    // Calculate percentages
    const arabicScriptPercentage = arabicScriptChars / totalChars;
    const spanishPercentage = spanishChars / totalChars;

    // Check for specific Arabic/Urdu distinguishing patterns
    // Common Arabic words that don't appear in Urdu
    const hasArabicPatterns = /اللغة|العربية|الله|من|في|إلى|على|هذا|ذلك|التي|الذي/i.test(text);
    // Common Urdu patterns
    const hasUrduPatterns = /ہے|ہیں|میں|کی|کے|کا|نے|سے|اور|یہ|وہ|کیا/i.test(text);

    logToFile('Language detection analysis', {
      textSample: text.substring(0, 100),
      arabicScriptChars,
      spanishChars,
      totalChars,
      arabicScriptPercentage: (arabicScriptPercentage * 100).toFixed(2) + '%',
      spanishPercentage: (spanishPercentage * 100).toFixed(2) + '%',
      hasArabicPatterns,
      hasUrduPatterns
    });

    // Decision logic:
    // 1. Check for Spanish first (distinct characters)
    if (spanishPercentage > 0.01) { // Even a few Spanish characters indicate Spanish
      logToFile('Language detected: Spanish');
      return 'es';
    }

    // 2. If significant Arabic script, distinguish between Arabic and Urdu
    if (arabicScriptPercentage > 0.5) {
      // Try to distinguish Arabic from Urdu based on patterns
      if (hasArabicPatterns && !hasUrduPatterns) {
        logToFile('Language detected: Arabic');
        return 'ar';
      } else if (hasUrduPatterns) {
        logToFile('Language detected: Urdu');
        return 'ur';
      } else {
        // Default to Urdu for ambiguous Arabic script (since we're in Pakistan context)
        logToFile('Language detected: Urdu (ambiguous Arabic script)');
        return 'ur';
      }
    } else if (arabicScriptPercentage < 0.1) {
      logToFile('Language detected: English');
      return 'en';
    } else {
      logToFile('Language detected: Mixed (defaulting to English)');
      return 'en'; // Default to English for mixed content
    }
  }

  /**
   * Check if text contains any Urdu characters
   * @param {string} text - Text to check
   * @returns {boolean} True if text contains Urdu characters
   */
  static containsUrdu(text) {
    return /[\u0600-\u06FF]/.test(text);
  }

  /**
   * Check if text is primarily English (Roman script)
   * @param {string} text - Text to check
   * @returns {boolean} True if text is primarily English
   */
  static isEnglish(text) {
    const detected = this.detectLanguage(text);
    return detected === 'en';
  }

  /**
   * Check if text is primarily Urdu
   * @param {string} text - Text to check
   * @returns {boolean} True if text is primarily Urdu
   */
  static isUrdu(text) {
    const detected = this.detectLanguage(text);
    return detected === 'ur';
  }

  /**
   * Get confirmed language with GPT-4o-mini verification for ambiguous cases
   * This is the main entry point for voice message language detection
   *
   * @param {string} transcript - Transcribed text from Soniox
   * @param {string} sonioxLanguage - Language code returned by Soniox (or null)
   * @returns {Promise<string>} Confirmed language code
   */
  static async getConfirmedLanguage(transcript, sonioxLanguage) {
    // Normalize Soniox language code
    const normalizedSoniox = sonioxLanguage ? sonioxLanguage.toLowerCase().split('-')[0] : null;

    logToFile('Language confirmation check', {
      sonioxLanguage,
      normalizedSoniox,
      transcriptSample: transcript?.substring(0, 100)
    });

    // Case 1: Soniox returned a trusted language - use it directly
    if (normalizedSoniox && SONIOX_TRUSTED_LANGUAGES.includes(normalizedSoniox)) {
      logToFile('Trusting Soniox language detection', { language: normalizedSoniox });
      return normalizedSoniox;
    }

    // Case 2: Soniox returned 'ur' - could be Urdu, Sindhi, Balochi, or Pashto
    // Case 3: Soniox returned 'pa' - could be Gurmukhi vs Shahmukhi
    // Case 4: Soniox returned nothing - need to detect from text
    if (normalizedSoniox === 'ur' || normalizedSoniox === 'pa' || !normalizedSoniox) {
      logToFile('Confirming language with GPT-4o-mini', {
        sonioxLanguage: normalizedSoniox,
        reason: normalizedSoniox === 'ur' ? 'could be sd-PK/bal-PK/ps-PK' :
                normalizedSoniox === 'pa' ? 'Gurmukhi vs Shahmukhi' :
                'Soniox returned nothing'
      });

      try {
        const gptLanguage = await this.detectLanguageWithGPT(transcript);
        logToFile('GPT language confirmation result', {
          sonioxLanguage: normalizedSoniox,
          gptLanguage,
          using: gptLanguage
        });
        return gptLanguage;
      } catch (error) {
        logToFile('GPT language detection failed, using fallback', {
          error: error.message,
          fallback: normalizedSoniox || 'ur'
        });
        // Fallback to Soniox result or 'ur' for Arabic script
        return normalizedSoniox || 'ur';
      }
    }

    // Case 5: Unknown language from Soniox - try text detection then GPT
    logToFile('Unknown Soniox language, attempting detection', { sonioxLanguage });

    // First try rule-based detection
    const ruleBasedLang = this.detectLanguage(transcript);
    if (ruleBasedLang !== 'en' && ruleBasedLang !== 'ur') {
      // Rule-based detected something specific (ar, es)
      return ruleBasedLang;
    }

    // For ambiguous cases, use GPT
    try {
      return await this.detectLanguageWithGPT(transcript);
    } catch (error) {
      logToFile('GPT fallback failed, using rule-based result', { error: error.message });
      return ruleBasedLang;
    }
  }

  /**
   * Detect language using GPT-4o-mini
   * Specifically designed to distinguish Pakistani regional languages
   *
   * @param {string} transcript - Text to analyze
   * @returns {Promise<string>} Language code (en, ur, pa-PK, ps-PK, sd-PK, bal-PK, etc.)
   */
  static async detectLanguageWithGPT(transcript) {
    if (!transcript || transcript.trim().length === 0) {
      return 'en';
    }

    const prompt = `You are a language identification expert for Pakistani regional languages.

CRITICAL CONTEXT: The text below was transcribed by an ASR system that does NOT support Balochi, Sindhi, or Pashto. It phonetically writes these languages using Urdu script. So even if the text LOOKS like Urdu, the speaker may actually be speaking Balochi, Sindhi, or Pashto.

TASK: Identify the ACTUAL SPOKEN language based on vocabulary and speech patterns. Return ONLY the language code, nothing else.

DETECTION RULES (check in ORDER - return immediately when matched):

1. BALOCHI (bal-PK) - Return if ANY of these patterns:
   - Word "بلوچی" or "بلوچ" appears ANYWHERE
   - Speaker says they are Balochi teacher/speaker
   - Balochi words (even in Urdu script): چوکس، وانن، وانکھ، کنا، پدا، گوں، منی، تئی، انت، توانیں، کتگ، بدل، شما، کمک، کنگ
   - Sentence endings: ءَ، ءِ، انت، اِنت
   - Verb forms: کنگ، کتگ، بیت، کن
   - Pronouns: من، تو، آ، ما، شما

2. PASHTO (ps-PK) - Return if ANY of these patterns:
   - Word "پشتو" or "پختون" appears
   - Unique letters: ښ ږ ڼ ې ۍ ړ ځ څ
   - Pashto words (even in Urdu script): زه، ته، دا، هغه، راغلم، ځم، وایم، کوم، شم، ورکړم
   - Common phrases: څنګه، ستاسو، زما، تاسو، ولې، څه، چې، که
   - Verb endings: م، ې، ي، و
   - "da" (دا) for "this", "za" (زه) for "I"

3. SINDHI (sd-PK) - Return if ANY of these patterns:
   - Word "سنڌي" or "سنڌ" appears
   - Unique Sindhi letters: ڄ ڃ ڦ ڻ ڳ ڱ ڪ ڏ ٺ ٽ ٿ
   - Sindhi words (even in Urdu script): آهي، آهن، ڪري، ڏي، وٺي، ڇا، اٿم، ويندو، ڪندو
   - Verb forms ending in: يو، ئي، ون، ين
   - "aahay" (آهي) for "is", "ahyan" (آهيان) for "am"
   - Pronouns: مان، تون، هو، هي، اسان، توهان

4. PUNJABI (pa-PK) - Return if:
   - Gurmukhi script present (ਪੰਜਾਬੀ)
   - Punjabi words: دا، نوں، وچ، نال، ہے گا، کردا، جاندا
   - "da/di" possessive patterns different from Urdu

5. URDU (ur) - ONLY if:
   - Pure standard Urdu with NO regional vocabulary
   - Standard patterns: ہے، ہیں، میں، کی، کے، کا، نے
   - NO words from categories 1-4 above

IMPORTANT: If the speaker mentions ANY regional language by name (بلوچی، پشتو، سنڌي) or identifies as a regional language teacher/speaker, that is the strongest indicator.

Text to analyze:
"${transcript.substring(0, 500)}"

Language code:`;

    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 15,
        temperature: 0
      });

      let detected = response.choices[0].message.content.trim().toLowerCase();

      // Clean up response (remove any extra text)
      detected = detected.split(/[\s,]/)[0]; // Take first word only

      logToFile('GPT-4o-mini language detection', {
        detected,
        transcriptSample: transcript.substring(0, 100)
      });

      // Normalize the response to our standard codes
      const normalizedCode = this.normalizeLanguageCode(detected);

      // Validate it's in our supported list
      if (VALID_LANGUAGE_CODES.includes(normalizedCode)) {
        return normalizedCode;
      }

      // If GPT returned something unexpected, fall back to 'ur' for Arabic script
      // or 'en' for Roman script
      const hasArabicScript = /[\u0600-\u06FF]/.test(transcript);
      return hasArabicScript ? 'ur' : 'en';

    } catch (error) {
      logToFile('GPT language detection error', {
        error: error.message,
        status: error.response?.status
      });
      throw error;
    }
  }

  /**
   * Normalize GPT response to our standard language codes
   * Handles variations like 'sindhi', 'sd', 'sd-pk', etc.
   *
   * @param {string} code - Raw language code from GPT
   * @returns {string} Normalized language code
   */
  static normalizeLanguageCode(code) {
    if (!code) return 'en';

    const lowerCode = code.toLowerCase().trim();

    // Direct matches
    if (VALID_LANGUAGE_CODES.includes(lowerCode)) {
      return lowerCode;
    }

    // Handle variations
    const mappings = {
      // Sindhi variations
      'sindhi': 'sd-PK',
      'sd': 'sd-PK',
      'sd-pk': 'sd-PK',
      'snd': 'sd-PK',

      // Pashto variations
      'pashto': 'ps-PK',
      'pushto': 'ps-PK',
      'ps': 'ps-PK',
      'ps-pk': 'ps-PK',
      'pus': 'ps-PK',

      // Balochi variations
      'balochi': 'bal-PK',
      'baluchi': 'bal-PK',
      'bal': 'bal-PK',
      'bal-pk': 'bal-PK',

      // Punjabi variations
      'punjabi': 'pa-PK',
      'pa': 'pa-PK',
      'pa-pk': 'pa-PK',
      'pnb': 'pa-PK',

      // Tamil variations
      'tamil': 'ta-LK',
      'ta': 'ta-LK',
      'ta-lk': 'ta-LK',

      // Standard languages
      'english': 'en',
      'urdu': 'ur',
      'arabic': 'ar',
      'spanish': 'es'
    };

    return mappings[lowerCode] || lowerCode;
  }
}

module.exports = LanguageDetectorService;
