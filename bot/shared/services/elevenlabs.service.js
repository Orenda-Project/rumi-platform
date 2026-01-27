const axios = require('axios');
const OpenAI = require('openai');
const {
  ELEVENLABS_API_KEY,
  ELEVENLABS_VOICE_ID,
  ELEVENLABS_SPANISH_VOICE_ID,
  ELEVENLABS_ARABIC_VOICE_ID,
  VOICE_MODELS,
  OPENAI_API_KEY
} = require('../utils/constants');
const { logToFile } = require('../utils/logger');

/**
 * ElevenLabs Service (Phase 3: Multi-language support)
 * Handles text-to-speech for English, Spanish, and Arabic with emotional expressiveness
 * Uses ElevenLabs Eleven v3 model with emotion tag support
 * Supports audio tags like [laughs], [whispers], [excited] and creative tags like [warmly], [thoughtfully]
 * v3 gracefully ignores unsupported tags, allowing creative emotional direction
 * Includes OpenAI TTS fallback for all languages
 */
class ElevenLabsService {
  // Initialize OpenAI client as a static property for use in static methods
  static openai = new OpenAI({ apiKey: OPENAI_API_KEY });

  /**
   * Generate speech from text using ElevenLabs (Jessica voice with emotion support)
   * @param {string} text - Text to convert to speech (can include emotion tags like [warmly])
   * @returns {Promise<Buffer>} Audio buffer (MP3 format)
   */
  static async generateSpeech(text) {
    try {
      logToFile('Generating speech with ElevenLabs', {
        textLength: text.length,
        textSample: text.substring(0, 100),
        voiceId: ELEVENLABS_VOICE_ID,
        hasEmotionTags: /\[[\w]+\]/.test(text)
      });

      const response = await axios.post(
        `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`,
        {
          text: text,
          model_id: 'eleven_v3', // v3 supports audio tags and emotion control
          voice_settings: {
            stability: 0.0, // 0.0 = Creative (best for expressiveness with audio tags)
            similarity_boost: 0.75, // How closely to match the voice
            style: 0.0, // Style exaggeration (0 = natural)
            use_speaker_boost: true // Enhance speaker clarity
          }
        },
        {
          headers: {
            'xi-api-key': ELEVENLABS_API_KEY,
            'Content-Type': 'application/json',
          },
          responseType: 'arraybuffer',
          timeout: 120000 // 120 second timeout (increased for long voice debriefs)
        }
      );

      const audioBuffer = Buffer.from(response.data);

      logToFile('✅ ElevenLabs speech generated successfully', {
        audioSize: audioBuffer.length,
        voiceId: ELEVENLABS_VOICE_ID
      });

      return audioBuffer;

    } catch (error) {
      logToFile('❌ Error generating speech with ElevenLabs', {
        error: error.message,
        status: error.response?.status,
        errorDetails: error.response?.data?.toString() || 'No details'
      });

      // Log specific error types
      if (error.response?.status === 401) {
        logToFile('❌ ElevenLabs authentication failed - check API key');
      } else if (error.response?.status === 429) {
        logToFile('❌ ElevenLabs rate limit exceeded');
      } else if (error.response?.status === 400) {
        logToFile('❌ ElevenLabs bad request - check text formatting');
      }

      throw error;
    }
  }

  /**
   * Generate speech for any language using appropriate voice model
   * Routes to correct provider based on language (Phase 3: Multi-language)
   *
   * @param {string} text - Text to convert to speech (can include emotion tags for en/es/ar)
   * @param {string} languageCode - Language code (en, es, ur, ar)
   * @returns {Promise<Buffer>} Audio buffer (MP3 or OGG format)
   */
  static async generateSpeechForLanguage(text, languageCode = 'en') {
    const voiceConfig = VOICE_MODELS[languageCode];

    if (!voiceConfig) {
      logToFile('⚠️  Unsupported language code, falling back to English', {
        requestedLanguage: languageCode,
        fallbackLanguage: 'en'
      });
      return this.generateSpeech(text);
    }

    try {
      if (voiceConfig.provider === 'elevenlabs') {
        // Use ElevenLabs for en/es/ar
        return await this.generateSpeechWithVoice(text, voiceConfig.voiceId, languageCode);
      } else if (voiceConfig.provider === 'uplift') {
        // Use Uplift for Urdu (existing integration in audio.service)
        const AudioService = require('./audio.service');
        return await AudioService.generateSpeech(text);
      }
    } catch (error) {
      logToFile('❌ Primary TTS provider failed, attempting OpenAI fallback', {
        language: languageCode,
        provider: voiceConfig.provider,
        error: error.message
      });

      // Fallback to OpenAI TTS
      return await this.generateSpeechOpenAI(text, languageCode);
    }
  }

  /**
   * Generate speech using specific ElevenLabs voice ID
   * Supports emotion tags for English, Spanish, and Arabic
   *
   * @param {string} text - Text to convert to speech
   * @param {string} voiceId - ElevenLabs voice ID
   * @param {string} languageCode - Language code for logging
   * @returns {Promise<Buffer>} Audio buffer (MP3 format)
   */
  static async generateSpeechWithVoice(text, voiceId, languageCode) {
    try {
      logToFile('Generating speech with ElevenLabs', {
        textLength: text.length,
        textSample: text.substring(0, 100),
        voiceId,
        language: languageCode,
        hasEmotionTags: /\[[\w]+\]/.test(text)
      });

      const response = await axios.post(
        `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
        {
          text: text,
          model_id: 'eleven_v3', // v3 supports audio tags and emotion control
          voice_settings: {
            stability: 0.0, // 0.0 = Creative (best for expressiveness with audio tags)
            similarity_boost: 0.75, // How closely to match the voice
            style: 0.0, // Style exaggeration (0 = natural)
            use_speaker_boost: true // Enhance speaker clarity
          }
        },
        {
          headers: {
            'xi-api-key': ELEVENLABS_API_KEY,
            'Content-Type': 'application/json',
          },
          responseType: 'arraybuffer',
          timeout: 120000 // 120 second timeout
        }
      );

      const audioBuffer = Buffer.from(response.data);

      logToFile('✅ ElevenLabs speech generated successfully', {
        audioSize: audioBuffer.length,
        voiceId,
        language: languageCode
      });

      return audioBuffer;

    } catch (error) {
      logToFile('❌ Error generating speech with ElevenLabs', {
        language: languageCode,
        voiceId,
        error: error.message,
        status: error.response?.status
      });
      throw error;
    }
  }

  /**
   * Generate speech using OpenAI TTS (fallback for all languages)
   * Used as fallback when ElevenLabs/Uplift fails, or for Tier 3 languages
   *
   * @param {string} text - Text to convert to speech (emotion tags will be stripped)
   * @param {string} languageCode - Language code (en, es, ur, ar, pa-PK, ps-PK, sd-PK, bal-PK, ta-LK)
   * @returns {Promise<Buffer>} Audio buffer (MP3 format)
   */
  static async generateSpeechOpenAI(text, languageCode = 'en') {
    try {
      // Strip emotion tags for OpenAI (doesn't support them)
      const cleanText = text.replace(/\[[\w\s]+\]/g, '').trim();

      logToFile('Generating speech with OpenAI TTS fallback', {
        textLength: cleanText.length,
        language: languageCode,
        strippedEmotionTags: text !== cleanText
      });

      // OpenAI voice mapping (best voices for each language/region)
      const openaiVoices = {
        // Tier 1/2 languages (fallback when primary fails)
        en: 'nova',      // Female, warm, engaging
        es: 'nova',      // Works well for Spanish
        ur: 'shimmer',   // Clear pronunciation for Urdu
        ar: 'alloy',     // Neutral, works for Arabic

        // New languages (December 2025)
        'pa-PK': 'shimmer',  // Pakistani Punjabi
        'ps-PK': 'shimmer',  // Pakistani Pashto
        'sd-PK': 'shimmer',  // Sindhi
        'bal-PK': 'shimmer', // Balochi
        'ta-LK': 'nova',     // Sri Lankan Tamil

        // Common Tier 3 languages (direct OpenAI TTS)
        hi: 'shimmer',   // Hindi
        bn: 'shimmer',   // Bengali
        fr: 'nova',      // French
        de: 'onyx',      // German
        pt: 'nova',      // Portuguese
        tr: 'alloy',     // Turkish
        fa: 'shimmer'    // Farsi/Persian
      };

      const voice = openaiVoices[languageCode] || 'nova';

      const mp3 = await this.openai.audio.speech.create({
        model: 'tts-1',
        voice: voice,
        input: cleanText,
        speed: 1.0
      });

      const buffer = Buffer.from(await mp3.arrayBuffer());

      logToFile('✅ OpenAI TTS generated successfully', {
        audioSize: buffer.length,
        language: languageCode,
        voice
      });

      return buffer;

    } catch (error) {
      logToFile('❌ Error generating speech with OpenAI TTS', {
        language: languageCode,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Test the ElevenLabs API connection
   * @returns {Promise<boolean>} True if connection successful
   */
  static async testConnection() {
    try {
      const testText = '[warmly] Hello! This is a test of the ElevenLabs text-to-speech service.';
      await this.generateSpeech(testText);
      logToFile('✅ ElevenLabs connection test successful');
      return true;
    } catch (error) {
      logToFile('❌ ElevenLabs connection test failed', { error: error.message });
      return false;
    }
  }

  /**
   * Get available voices from ElevenLabs
   * @returns {Promise<Array>} List of available voices
   */
  static async getAvailableVoices() {
    try {
      const response = await axios.get(
        'https://api.elevenlabs.io/v1/voices',
        {
          headers: {
            'xi-api-key': ELEVENLABS_API_KEY
          }
        }
      );

      return response.data.voices;
    } catch (error) {
      logToFile('Error fetching ElevenLabs voices', { error: error.message });
      throw error;
    }
  }
}

module.exports = ElevenLabsService;
