/**
 * MMS Inference Service Client
 *
 * HTTP client for the MMS-ASR microservice
 * Supports Balochi (bal-PK), Sindhi (sd-PK), and Pashto (ps-PK)
 *
 * The MMS service should be deployed on Railway with GPU support
 * Environment variable: MMS_SERVICE_URL
 */

const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');
const { logToFile } = require('../utils/logger');
const { MMS_SERVICE_URL, MMS_TIMEOUT_MS, MMS_API_KEY } = require('../utils/constants');

// Supported languages (must match MMS service)
const MMS_SUPPORTED_LANGUAGES = ['bal-PK', 'sd-PK', 'ps-PK'];

class MmsInferenceService {
  /**
   * Check if a language is supported by MMS-ASR
   * @param {string} languageCode - Our language code
   * @returns {boolean}
   */
  static isSupported(languageCode) {
    return MMS_SUPPORTED_LANGUAGES.includes(languageCode);
  }

  /**
   * Check if MMS service is healthy
   * @returns {Promise<{healthy: boolean, modelLoaded: boolean, gpuAvailable: boolean}>}
   */
  static async healthCheck() {
    try {
      // 15 second timeout to account for Modal.com cold starts
      // (GPU container can take 4-8 seconds to wake from idle)
      const response = await axios.get(`${MMS_SERVICE_URL}/health`, {
        timeout: 15000
      });

      return {
        healthy: response.data.status === 'ok',
        modelLoaded: response.data.model_loaded,
        gpuAvailable: response.data.gpu_available,
        currentAdapter: response.data.current_adapter
      };
    } catch (error) {
      logToFile('❌ MMS health check failed', {
        url: MMS_SERVICE_URL,
        error: error.message
      });

      return {
        healthy: false,
        modelLoaded: false,
        gpuAvailable: false,
        currentAdapter: null
      };
    }
  }

  /**
   * Transcribe audio using MMS-ASR
   * @param {string} audioPath - Path to audio file (WAV format recommended)
   * @param {string} languageCode - Language code (bal-PK, sd-PK, ps-PK)
   * @returns {Promise<{text: string, language: string, latencyMs: number, success: boolean, error?: string}>}
   */
  static async transcribe(audioPath, languageCode) {
    const startTime = Date.now();

    // Validate language
    if (!this.isSupported(languageCode)) {
      return {
        text: '',
        language: languageCode,
        latencyMs: Date.now() - startTime,
        success: false,
        error: `Unsupported language: ${languageCode}. Supported: ${MMS_SUPPORTED_LANGUAGES.join(', ')}`
      };
    }

    // Check file exists
    if (!fs.existsSync(audioPath)) {
      return {
        text: '',
        language: languageCode,
        latencyMs: Date.now() - startTime,
        success: false,
        error: `Audio file not found: ${audioPath}`
      };
    }

    try {
      logToFile('🔊 Sending audio to MMS-ASR service', {
        audioPath,
        languageCode,
        serviceUrl: MMS_SERVICE_URL
      });

      // Create form data with audio file
      const formData = new FormData();
      formData.append('audio', fs.createReadStream(audioPath));
      formData.append('language', languageCode);

      // Send to MMS service with API key authentication
      const response = await axios.post(
        `${MMS_SERVICE_URL}/asr`,
        formData,
        {
          headers: {
            ...formData.getHeaders(),
            'X-API-Key': MMS_API_KEY
          },
          timeout: MMS_TIMEOUT_MS,
          maxContentLength: 50 * 1024 * 1024, // 50MB max
          maxBodyLength: 50 * 1024 * 1024
        }
      );

      const result = response.data;

      logToFile('✅ MMS-ASR transcription complete', {
        language: languageCode,
        mmsCode: result.mms_code,
        latencyMs: result.latency_ms,
        textLength: result.text?.length || 0,
        success: result.success
      });

      return {
        text: result.text || '',
        language: languageCode,
        mmsCode: result.mms_code,
        latencyMs: result.latency_ms,
        success: result.success,
        error: result.error
      };

    } catch (error) {
      const latencyMs = Date.now() - startTime;

      // Handle specific error types
      let errorMessage = error.message;

      if (error.code === 'ECONNREFUSED') {
        errorMessage = `MMS service not available at ${MMS_SERVICE_URL}`;
      } else if (error.code === 'ETIMEDOUT' || error.message.includes('timeout')) {
        errorMessage = `MMS service timeout after ${MMS_TIMEOUT_MS}ms`;
      } else if (error.response) {
        errorMessage = error.response.data?.detail || error.response.statusText;
      }

      logToFile('❌ MMS-ASR transcription failed', {
        language: languageCode,
        latencyMs,
        error: errorMessage,
        serviceUrl: MMS_SERVICE_URL
      });

      return {
        text: '',
        language: languageCode,
        latencyMs,
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * Get list of supported languages from MMS service
   * @returns {Promise<Array>}
   */
  static async getSupportedLanguages() {
    try {
      const response = await axios.get(`${MMS_SERVICE_URL}/languages`, {
        timeout: 5000
      });
      return response.data.supported_languages;
    } catch (error) {
      logToFile('⚠️ Could not fetch MMS supported languages', {
        error: error.message
      });
      // Return static list as fallback
      return [
        { code: 'bal-PK', name: 'Balochi', mms_code: 'bcc-script_arabic' },
        { code: 'sd-PK', name: 'Sindhi', mms_code: 'snd' },
        { code: 'ps-PK', name: 'Pashto', mms_code: 'pus' }
      ];
    }
  }
}

module.exports = MmsInferenceService;
