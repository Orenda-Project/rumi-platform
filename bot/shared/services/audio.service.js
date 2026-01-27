const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const ffprobePath = require('@ffprobe-installer/ffprobe').path;
const {
  SONIOX_API_KEY,
  UPLIFT_API_KEY,
  UPLIFT_VOICE_ID,
  SONIOX_V3_TIMEOUT,
  SONIOX_V2_TIMEOUT,
  TEMP_DIR,
  OPENAI_API_KEY
} = require('../utils/constants');
const { logToFile } = require('../utils/logger');
const OpenAI = require('openai');

// Set ffmpeg and ffprobe paths
ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);

/**
 * ASR Engine Routing Configuration
 *
 * Soniox: 7 mainstream languages (en, ur, ar, es, ta-LK, pa-PK, plus simplified codes)
 * - Includes Punjabi (pa-PK) because:
 *   1. Soniox supports Punjabi (pa) natively
 *   2. Both Soniox and MMS output Gurmukhi (not Shahmukhi)
 *   3. GPT understands Gurmukhi and responds in Shahmukhi
 *   4. No benefit to adding MMS complexity for Punjabi
 *
 * MMS-ASR: 3 regional languages (bal-PK, sd-PK, ps-PK)
 * - Balochi, Sindhi, Pashto - not supported by Soniox
 */
const SONIOX_LANGUAGES = ['en', 'ur', 'ar', 'es', 'ta', 'ta-LK', 'pa', 'pa-PK'];
const MMS_LANGUAGES = {
  'bal-PK': 'bcc-script_arabic',  // Southern Balochi with Arabic script
  'sd-PK': 'snd',                  // Sindhi
  'ps-PK': 'pus'                   // Pashto
  // Note: Punjabi NOT here - uses Soniox
};

/**
 * Audio Service
 * Handles audio processing, transcription (Soniox), and text-to-speech (Uplift)
 */
class AudioService {
  /**
   * Convert audio to WAV format for Soniox
   * @param {Buffer} inputBuffer - Input audio buffer
   * @param {string} outputPath - Output file path
   * @returns {Promise<string>} Output file path
   */
  static async convertToWav(inputBuffer, outputPath) {
    return new Promise((resolve, reject) => {
      const inputPath = path.join(TEMP_DIR, `input_${Date.now()}.ogg`);

      // Write buffer to temp file
      fs.writeFileSync(inputPath, inputBuffer);

      ffmpeg(inputPath)
        .toFormat('wav')
        .audioFrequency(16000) // Soniox works best with 16kHz
        .audioChannels(1) // Mono
        .on('end', () => {
          // Clean up input file
          fs.unlinkSync(inputPath);
          resolve(outputPath);
        })
        .on('error', (err) => {
          // Clean up input file
          if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
          reject(err);
        })
        .save(outputPath);
    });
  }

  /**
   * Attempt transcription with a specific Soniox model version
   * @param {string} fileId - Soniox file ID
   * @param {string} modelVersion - Model version (stt-async-v3 or stt-async-v2)
   * @param {number} timeoutSeconds - Timeout in seconds
   * @param {boolean} enableDiarization - Whether to enable speaker diarization (for classroom audio)
   * @returns {Promise<string>} Transcription text
   * @private
   */
  static async _attemptTranscription(fileId, modelVersion, timeoutSeconds, enableDiarization = false, language = null) {
    let transcriptionId = null;

    try {
      logToFile(`Attempting transcription with ${modelVersion}...`, {
        timeout: `${timeoutSeconds} seconds`,
        language: language || 'auto-detect'
      });

      // Build request body based on model version
      // Bug #29 Fix: Use specific language hint if provided (reading assessment)
      // Otherwise use all supported languages (coaching multi-language audio)
      // Note: Only include languages Soniox supports (pa, ta are supported; sd, bal, ps are NOT)
      // IMPORTANT: Soniox expects ISO 639-1 codes (e.g., 'pa'), NOT locale codes (e.g., 'pa-PK')
      // Strip region suffix before sending to Soniox
      const normalizedLanguage = language ? language.split('-')[0] : null;
      const languageHints = normalizedLanguage ? [normalizedLanguage] : ['en', 'ur', 'es', 'ar', 'pa', 'ta'];

      const requestBody = {
        file_id: fileId,
        model: modelVersion,
        language_hints: languageHints,
      };

      logToFile('Language hints configured', {
        originalLanguage: language,
        normalizedForSoniox: normalizedLanguage,
        hints: languageHints,
        specificLanguage: language !== null,
        mode: language ? 'single-language (reading)' : 'multi-language (coaching)'
      });

      // Add advanced features for V3
      if (modelVersion === 'stt-async-v3') {
        requestBody.enable_language_identification = true;

        // Only enable speaker diarization for classroom audio (15+ minute recordings)
        if (enableDiarization) {
          requestBody.enable_speaker_diarization = true; // Enable speaker separation
          requestBody.speaker_diarization_config = {
            min_speakers: 2, // At least teacher + students
            max_speakers: 5  // Teacher + up to 4 student voices
          };
          logToFile('Speaker diarization enabled for classroom audio', {
            modelVersion,
            enableDiarization: true
          });
        } else {
          requestBody.enable_speaker_diarization = false;
          logToFile('Regular transcription without diarization', {
            modelVersion,
            enableDiarization: false
          });
        }

        requestBody.include_words = true; // ← Request detailed word-level data with timestamps, language
        requestBody.context = {
          general: [
            { key: 'domain', value: 'Education' },
            { key: 'setting', value: 'Classroom observation with 1 teacher and approximately 30 children' },
            { key: 'participants', value: 'One teacher conducting a lesson with a class of about 30 students' },
            { key: 'topic', value: 'Classroom teaching, lesson delivery, student learning activities' },
            { key: 'organization', value: 'Education' }
          ],
          text: 'This is a classroom observation recording of a teacher in Pakistan teaching a lesson to approximately 30 students. The recording captures the teacher delivering instruction, asking questions, explaining concepts, and interacting with students. Students may be heard responding to questions, participating in activities, or asking questions. The lesson may cover subjects like science, math, Urdu, English, social studies, or other academic topics taught in Pakistani schools. The teacher may give instructions, provide examples, conduct assessments, and manage classroom activities.',
          terms: [
            'school',
            'classroom',
            'students',
            'teacher',
            'ustaad',
            'taleem',
            'lesson',
            'activity',
            'exercise',
            'homework',
            'question',
            'answer',
            'board',
            'copy',
            'notebook',
            'group work',
            'assessment',
            'learning objective'
          ]
        };

        logToFile('Using V3 with advanced features', {
          languageIdentification: true,
          educationalContext: true
        });
      } else {
        logToFile('Using V2 with basic features (no language ID or context)');
      }

      // Create transcription job
      const createResponse = await axios.post(
        'https://api.soniox.com/v1/transcriptions',
        requestBody,
        {
          headers: {
            'Authorization': `Bearer ${SONIOX_API_KEY}`,
            'Content-Type': 'application/json',
          },
        }
      );

      transcriptionId = createResponse.data.id;
      logToFile('Transcription job created', { transcriptionId, model: modelVersion });

      // Poll for completion
      let transcription = '';
      let attempts = 0;
      const maxAttempts = timeoutSeconds;

      while (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second

        const statusResponse = await axios.get(
          `https://api.soniox.com/v1/transcriptions/${transcriptionId}`,
          {
            headers: {
              'Authorization': `Bearer ${SONIOX_API_KEY}`,
            },
          }
        );

        const status = statusResponse.data.status;
        const errorType = statusResponse.data.error_type;
        const errorMessage = statusResponse.data.error_message;

        // Log every 10 attempts to reduce noise
        if (attempts % 10 === 0 || status !== 'queued') {
          logToFile(`Transcription status: ${status} (${modelVersion})`, {
            attempt: attempts + 1,
            transcriptionId,
            model: modelVersion,
            errorType,
            errorMessage,
            fullResponse: statusResponse.data
          });
        }

        // Check for errors
        if (errorType || errorMessage) {
          logToFile('Transcription has error fields', {
            model: modelVersion,
            errorType,
            errorMessage,
            fullResponse: statusResponse.data
          });
          throw new Error(`Soniox transcription error (${modelVersion}): ${errorType} - ${errorMessage}`);
        }

        if (status === 'completed') {
          // Get the transcript
          const transcriptResponse = await axios.get(
            `https://api.soniox.com/v1/transcriptions/${transcriptionId}/transcript`,
            {
              headers: {
                'Authorization': `Bearer ${SONIOX_API_KEY}`,
              },
            }
          );

          const rawTranscript = transcriptResponse.data.text || transcriptResponse.data.transcript || '';
          const tokens = transcriptResponse.data.tokens || []; // Soniox returns 'tokens', not 'words'
          const speakerInfo = transcriptResponse.data.speakers || [];

          // Try to get language from various possible fields in the response
          let detectedLanguage = transcriptResponse.data.language
            || transcriptResponse.data.detected_language
            || transcriptResponse.data.language_code
            || null;

          // If Soniox didn't return language, use our language detector on the text
          if (!detectedLanguage && rawTranscript) {
            const LanguageDetectorService = require('./language-detector.service');
            detectedLanguage = LanguageDetectorService.detectLanguage(rawTranscript);
            logToFile('Language detected from transcription text (Soniox did not provide)', {
              detectedLanguage
            });
          }

          // Format transcript with speaker labels if diarization is available
          let formattedTranscript = rawTranscript;
          let diarizationData = null;

          if (tokens && tokens.length > 0 && tokens.some(t => t.speaker)) {
            // We have speaker diarization data - format transcript with speaker labels
            const result = this._formatTranscriptWithSpeakers(tokens, speakerInfo);
            formattedTranscript = result.transcript;
            diarizationData = result.diarization;

            logToFile('Transcription completed with speaker diarization', {
              model: modelVersion,
              speakerCount: diarizationData.speakers.length,
              teacherTurns: diarizationData.speakers[0]?.segments.length || 0,
              language_info: detectedLanguage || 'not available'
            });
          } else {
            logToFile('Transcription completed (no diarization)', {
              model: modelVersion,
              transcription: rawTranscript,
              language_info: detectedLanguage || 'not available'
            });
          }

          transcription = formattedTranscript;

          // Clean up this transcription
          try {
            await axios.delete(
              `https://api.soniox.com/v1/transcriptions/${transcriptionId}`,
              {
                headers: {
                  'Authorization': `Bearer ${SONIOX_API_KEY}`,
                },
              }
            );
            logToFile('Transcription deleted from Soniox', { transcriptionId, model: modelVersion });
          } catch (cleanupError) {
            logToFile('Warning: Transcription cleanup failed (non-critical)', {
              error: cleanupError.message,
              transcriptionId,
              model: modelVersion
            });
          }

          return {
            text: transcription,
            language: detectedLanguage,
            tokens: tokens // Include tokens for language detection
          };
        } else if (status === 'failed') {
          logToFile('Soniox transcription failed', {
            model: modelVersion,
            statusData: statusResponse.data
          });
          throw new Error(`Soniox transcription failed (${modelVersion}): ${JSON.stringify(statusResponse.data)}`);
        } else if (status === 'processing') {
          logToFile('Transcription processing...', { attempt: attempts + 1, model: modelVersion });
        }

        attempts++;
      }

      if (!transcription && attempts >= maxAttempts) {
        logToFile('Transcription timeout after max attempts', {
          attempts,
          transcriptionId,
          model: modelVersion,
          timeoutSeconds
        });
        throw new Error(`Transcription timeout (${modelVersion}) - Soniox API took too long (${timeoutSeconds}s).`);
      }

      return transcription;
    } catch (error) {
      // Clean up transcription on error
      if (transcriptionId) {
        try {
          await axios.delete(
            `https://api.soniox.com/v1/transcriptions/${transcriptionId}`,
            {
              headers: {
                'Authorization': `Bearer ${SONIOX_API_KEY}`,
              },
            }
          );
          logToFile('Transcription deleted from Soniox (error cleanup)', {
            transcriptionId,
            model: modelVersion
          });
        } catch (cleanupError) {
          logToFile('Warning: Error cleanup failed (non-critical)', {
            error: cleanupError.message,
            transcriptionId,
            model: modelVersion
          });
        }
      }
      throw error;
    }
  }

  /**
   * Transcribe audio using OpenAI Whisper API
   * @param {string} audioPath - Path to audio file
   * @returns {Promise<Object>} Transcription result with text and language
   * @private
   */
  static async _transcribeWithWhisper(audioPath) {
    try {
      logToFile('🎙️ Starting OpenAI Whisper transcription...', { audioPath });

      // Initialize OpenAI client
      const openai = new OpenAI({
        apiKey: OPENAI_API_KEY
      });

      // Read the audio file
      const audioFile = fs.createReadStream(audioPath);

      // Get file size for logging
      const stats = fs.statSync(audioPath);
      const fileSizeInMB = stats.size / (1024 * 1024);

      logToFile('Whisper: Uploading audio file', {
        fileSizeMB: fileSizeInMB.toFixed(2),
        path: audioPath
      });

      // Call Whisper API with turbo model for speed
      const startTime = Date.now();
      const transcription = await openai.audio.transcriptions.create({
        file: audioFile,
        model: "whisper-1",
        language: undefined, // Let Whisper auto-detect the language
        response_format: "verbose_json", // Get detailed response with language info
        prompt: "This is a classroom observation recording from Pakistan. The recording contains a teacher teaching a lesson to students. Languages may include Urdu, English, Punjabi, or a mix."
      });

      const elapsedTime = (Date.now() - startTime) / 1000;

      logToFile('✅ Whisper transcription completed', {
        elapsedTimeSeconds: elapsedTime,
        detectedLanguage: transcription.language,
        duration: transcription.duration,
        textLength: transcription.text.length
      });

      // Map Whisper language codes to our system's codes
      let mappedLanguage = transcription.language;
      if (transcription.language === 'urdu') {
        mappedLanguage = 'ur';
      } else if (transcription.language === 'english') {
        mappedLanguage = 'en';
      }

      // Format segments if available (for future speaker diarization)
      let formattedText = transcription.text;
      if (transcription.segments && transcription.segments.length > 0) {
        // Log segment information for debugging
        logToFile('Whisper provided segments', {
          segmentCount: transcription.segments.length,
          sampleSegment: transcription.segments[0]
        });
      }

      return {
        text: formattedText,
        language: mappedLanguage,
        tokens: [], // Whisper doesn't provide token-level data like Soniox
        source: 'whisper',
        metadata: {
          duration: transcription.duration,
          detectedLanguage: transcription.language,
          model: 'whisper-1'
        }
      };

    } catch (error) {
      logToFile('❌ Whisper transcription failed', {
        error: error.message,
        errorType: error.constructor.name,
        statusCode: error.status || error.response?.status
      });

      // Provide more specific error messages
      if (error.status === 413 || error.message.includes('413')) {
        throw new Error('Whisper: Audio file too large (max 25MB)');
      } else if (error.status === 401) {
        throw new Error('Whisper: Invalid OpenAI API key');
      } else if (error.status === 429) {
        throw new Error('Whisper: Rate limit exceeded');
      } else if (error.status === 400) {
        throw new Error(`Whisper: Invalid request - ${error.message}`);
      } else {
        throw new Error(`Whisper transcription failed: ${error.message}`);
      }
    }
  }

  /**
   * Transcribe audio using Soniox with v3 and v2 fallback
   * @param {string} audioPath - Path to audio file
   * @param {boolean} enableDiarization - Whether to enable speaker diarization (for classroom audio)
   * @returns {Promise<string>} Transcription text
   */
  static async transcribe(audioPath, enableDiarization = false, language = null) {
    let fileId = null;

    try {
      logToFile('Starting Soniox transcription...', {
        audioPath,
        language: language || 'auto-detect',
        mode: language ? 'single-language' : 'multi-language'
      });

      // Step 1: Upload file to Soniox to get file_id
      const formData = new FormData();
      formData.append('file', fs.createReadStream(audioPath));

      const uploadResponse = await axios.post(
        'https://api.soniox.com/v1/files',
        formData,
        {
          headers: {
            'Authorization': `Bearer ${SONIOX_API_KEY}`,
            ...formData.getHeaders(),
          },
        }
      );

      fileId = uploadResponse.data.id;
      logToFile('File uploaded to Soniox', { fileId });

      // Step 2: Try v3 first, fallback to v2, then Whisper if both fail
      let transcriptionResult = { text: '', language: null };
      let soniox3Error = null;
      let soniox2Error = null;

      try {
        logToFile('Attempting transcription with stt-async-v3 (3 minute timeout)...', {
          enableDiarization,
          language: language || 'auto-detect'
        });
        transcriptionResult = await this._attemptTranscription(fileId, 'stt-async-v3', SONIOX_V3_TIMEOUT, enableDiarization, language);
      } catch (v3Error) {
        soniox3Error = v3Error;
        logToFile('⚠️ V3 transcription failed, trying v2 fallback (2 minute timeout)...', {
          v3Error: v3Error.message,
          enableDiarization
        });

        try {
          logToFile('Attempting transcription with stt-async-v2...');
          transcriptionResult = await this._attemptTranscription(fileId, 'stt-async-v2', SONIOX_V2_TIMEOUT, false, language); // V2 doesn't support diarization
          logToFile('✅ V2 fallback succeeded!');
        } catch (v2Error) {
          soniox2Error = v2Error;
          logToFile('❌ Both Soniox v3 and v2 failed', {
            v3Error: v3Error.message,
            v2Error: v2Error.message
          });

          // Try Whisper as final fallback
          logToFile('🔄 Attempting OpenAI Whisper as final fallback...');

          // Clean up Soniox file before trying Whisper
          try {
            if (fileId) {
              await axios.delete(
                `https://api.soniox.com/v1/files/${fileId}`,
                {
                  headers: {
                    'Authorization': `Bearer ${SONIOX_API_KEY}`,
                  },
                }
              );
              logToFile('File deleted from Soniox before Whisper attempt', { fileId });
              fileId = null; // Mark as deleted
            }
          } catch (cleanupError) {
            logToFile('Warning: Pre-Whisper cleanup failed (non-critical)', {
              error: cleanupError.message,
              fileId
            });
          }

          try {
            transcriptionResult = await this._transcribeWithWhisper(audioPath);
            logToFile('✅ Whisper fallback succeeded!', {
              source: 'whisper',
              language: transcriptionResult.language,
              textLength: transcriptionResult.text.length
            });
          } catch (whisperError) {
            logToFile('❌ All transcription methods failed', {
              soniox3: soniox3Error.message,
              soniox2: soniox2Error.message,
              whisper: whisperError.message
            });

            // Throw comprehensive error with all failure details
            throw new Error(
              `All transcription methods failed:\n` +
              `- Soniox V3: ${soniox3Error.message}\n` +
              `- Soniox V2: ${soniox2Error.message}\n` +
              `- OpenAI Whisper: ${whisperError.message}`
            );
          }
        }
      }

      // Step 3: Clean up file from Soniox
      try {
        if (fileId) {
          await axios.delete(
            `https://api.soniox.com/v1/files/${fileId}`,
            {
              headers: {
                'Authorization': `Bearer ${SONIOX_API_KEY}`,
              },
            }
          );
          logToFile('File deleted from Soniox', { fileId });
        }
      } catch (cleanupError) {
        logToFile('Warning: File cleanup failed (non-critical)', {
          error: cleanupError.message,
          fileId
        });
      }

      return transcriptionResult;
    } catch (error) {
      // Clean up file even on error
      if (fileId) {
        try {
          await axios.delete(
            `https://api.soniox.com/v1/files/${fileId}`,
            {
              headers: {
                'Authorization': `Bearer ${SONIOX_API_KEY}`,
              },
            }
          );
          logToFile('File deleted from Soniox (error cleanup)', { fileId });
        } catch (cleanupError) {
          logToFile('Warning: File error cleanup failed (non-critical)', {
            error: cleanupError.message,
            fileId
          });
        }
      }

      logToFile('Error transcribing with Soniox', {
        error: error.message,
        errorDetails: error.response?.data
      });
      throw error;
    }
  }

  /**
   * Generate speech using Uplift AI (Urdu) with female voice
   * @param {string} text - Text to convert to speech
   * @returns {Promise<Buffer>} Audio buffer
   */
  static async generateSpeech(text) {
    try {
      const response = await axios.post(
        'https://api.upliftai.org/v1/synthesis/text-to-speech',
        {
          voiceId: UPLIFT_VOICE_ID,
          text: text,
          outputFormat: 'MP3_22050_128', // High quality MP3 format
        },
        {
          headers: {
            'Authorization': `Bearer ${UPLIFT_API_KEY}`,
            'Content-Type': 'application/json',
          },
          responseType: 'arraybuffer',
        }
      );

      return Buffer.from(response.data);
    } catch (error) {
      console.error('Error generating speech with Uplift:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Generate speech using appropriate TTS service based on language
   * Routes to ElevenLabs, Uplift, or OpenAI TTS based on VOICE_MODELS config
   *
   * @param {string} text - Text to convert to speech
   * @param {string} language - Language code (en, ur, ar, es, pa-PK, ps-PK, sd-PK, bal-PK, ta-LK)
   * @returns {Promise<Buffer>} Audio buffer
   */
  static async generateSpeechForLanguage(text, language) {
    logToFile('Generating speech for language', { language, textLength: text.length });

    try {
      // Use VOICE_MODELS configuration to determine provider
      const { VOICE_MODELS } = require('../utils/constants');
      const voiceConfig = VOICE_MODELS[language];

      // Tier 3 (no config): Use OpenAI TTS directly as fallback
      if (!voiceConfig) {
        logToFile('Tier 3 language - using OpenAI TTS fallback', { language });
        const ElevenLabsService = require('./elevenlabs.service');
        return await ElevenLabsService.generateSpeechOpenAI(text, language);
      }

      // Strip emotion tags for Uplift languages (they don't support it)
      let processedText = text;
      if (!voiceConfig.supportsEmotionTags) {
        processedText = text.replace(/\[[\w\s]+\]/g, '').trim();
        if (processedText !== text) {
          logToFile('Stripped emotion tags for non-ElevenLabs provider', { originalLength: text.length, newLength: processedText.length });
        }
      }

      // Route based on provider
      if (voiceConfig.provider === 'elevenlabs') {
        const ElevenLabsService = require('./elevenlabs.service');
        logToFile('Routing to ElevenLabs for TTS', { language, voiceId: voiceConfig.voiceId, tier: voiceConfig.tier });
        try {
          return await ElevenLabsService.generateSpeechForLanguage(processedText, language);
        } catch (error) {
          // ElevenLabs failed - fallback to OpenAI TTS
          logToFile('ElevenLabs failed, falling back to OpenAI TTS', { error: error.message, language });
          return await ElevenLabsService.generateSpeechOpenAI(processedText, language);
        }
      } else if (voiceConfig.provider === 'uplift') {
        logToFile('Routing to Uplift for TTS', { language, voiceId: voiceConfig.voiceId, tier: voiceConfig.tier });
        try {
          return await this.generateSpeechWithUplift(processedText, voiceConfig.voiceId);
        } catch (error) {
          // Uplift failed - fallback to OpenAI TTS
          logToFile('Uplift failed, falling back to OpenAI TTS', { error: error.message, language });
          const ElevenLabsService = require('./elevenlabs.service');
          return await ElevenLabsService.generateSpeechOpenAI(processedText, language);
        }
      } else {
        // Unknown provider - use OpenAI fallback
        logToFile('Unknown provider, using OpenAI TTS fallback', { provider: voiceConfig.provider, language });
        const ElevenLabsService = require('./elevenlabs.service');
        return await ElevenLabsService.generateSpeechOpenAI(processedText, language);
      }
    } catch (error) {
      logToFile('❌ Error in generateSpeechForLanguage', {
        error: error.message,
        language,
        textSample: text.substring(0, 100)
      });
      throw error;
    }
  }

  /**
   * Generate speech using Uplift AI with specific voice ID
   * Supports Urdu, Sindhi, and Balochi voices
   *
   * @param {string} text - Text to convert to speech
   * @param {string} voiceId - Uplift voice ID
   * @returns {Promise<Buffer>} Audio buffer
   */
  static async generateSpeechWithUplift(text, voiceId) {
    try {
      logToFile('Generating speech with Uplift', { voiceId, textLength: text.length });

      const response = await axios.post(
        'https://api.upliftai.org/v1/synthesis/text-to-speech',
        {
          voiceId: voiceId,
          text: text,
          outputFormat: 'MP3_22050_128',
        },
        {
          headers: {
            'Authorization': `Bearer ${UPLIFT_API_KEY}`,
            'Content-Type': 'application/json',
          },
          responseType: 'arraybuffer',
        }
      );

      logToFile('Uplift TTS success', { voiceId, bytes: response.data.length });
      return Buffer.from(response.data);
    } catch (error) {
      logToFile('❌ Error generating speech with Uplift', {
        error: error.message,
        voiceId,
        status: error.response?.status
      });
      throw error;
    }
  }

  /**
   * Format transcript with speaker labels, timestamps, and language markers
   * @param {Array} tokens - Array of token objects from Soniox (with speaker, text, start_ms, end_ms, language)
   * @param {Array} speakerInfo - Metadata about each speaker
   * @returns {Object} { transcript: string, diarization: object }
   * @private
   */
  static _formatTranscriptWithSpeakers(tokens, speakerInfo) {
    if (!tokens || tokens.length === 0) {
      return { transcript: '', diarization: null };
    }

    // Calculate speaking time for each speaker to identify the teacher
    const speakerStats = {};
    tokens.forEach(token => {
      const speakerId = token.speaker || 'unknown'; // Soniox uses 'speaker', not 'speaker_id'
      if (!speakerStats[speakerId]) {
        speakerStats[speakerId] = { wordCount: 0, segments: 0 };
      }
      speakerStats[speakerId].wordCount++;
    });

    // Sort speakers by word count (descending)
    const sortedSpeakers = Object.entries(speakerStats)
      .sort((a, b) => b[1].wordCount - a[1].wordCount)
      .map(([id]) => id);

    // Assign labels: first speaker (most words) = Teacher, rest = Students
    const speakerLabels = {};
    speakerLabels[sortedSpeakers[0]] = 'Teacher';
    for (let i = 1; i < sortedSpeakers.length; i++) {
      speakerLabels[sortedSpeakers[i]] = i === 1 ? 'Student' : `Student ${i}`;
    }

    logToFile('Speaker identification', {
      totalSpeakers: sortedSpeakers.length,
      speakerWordCounts: speakerStats,
      labels: speakerLabels
    });

    // Helper function to format timestamp (milliseconds to MM:SS)
    const formatTimestamp = (ms) => {
      if (!ms && ms !== 0) return '00:00';
      const totalSeconds = Math.floor(ms / 1000);
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;
      return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    };

    // Group consecutive tokens from same speaker into segments
    const segments = [];
    let currentSpeaker = null;
    let currentText = [];
    let currentStartTime = null;
    let currentLanguage = null;

    tokens.forEach((token, index) => {
      const speakerId = token.speaker || 'unknown'; // Soniox uses 'speaker'
      const tokenLanguage = token.language || null;

      if (speakerId !== currentSpeaker) {
        // Speaker changed - save previous segment
        if (currentSpeaker && currentText.length > 0) {
          // Soniox returns sub-word tokens (e.g., "Beautiful" → ["Beau", "ti", "ful"])
          // Tokens include trailing spaces to mark word boundaries
          const rawText = currentText.join(''); // Join without separator (preserves spaces in token.text)

          // FIX: Use same space normalization for ALL languages
          // Soniox tokens already include proper word boundaries (trailing spaces)
          // Previous bug: Urdu branch removed ALL spaces, concatenating words
          // Correct: Normalize multiple spaces to single, add space after punctuation
          let cleanedText = rawText
            .replace(/\s+/g, ' ') // Normalize multiple spaces to single space
            .replace(/([۔،؟!])([^\s])/g, '$1 $2') // Add space after Urdu punctuation if missing
            .replace(/([.?!])([^\s])/g, '$1 $2') // Add space after Latin punctuation if missing
            .trim();

          segments.push({
            speaker: currentSpeaker,
            label: speakerLabels[currentSpeaker] || currentSpeaker,
            text: cleanedText,
            startTime: currentStartTime,
            endTime: tokens[index - 1]?.end_ms || null, // Soniox uses 'end_ms'
            language: currentLanguage
          });
          speakerStats[currentSpeaker].segments = (speakerStats[currentSpeaker].segments || 0) + 1;
        }

        // Start new segment
        currentSpeaker = speakerId;
        currentText = [token.text];
        currentStartTime = token.start_ms || null; // Soniox uses 'start_ms'
        currentLanguage = tokenLanguage;
      } else {
        // Same speaker - accumulate tokens
        currentText.push(token.text);
        // Update language if it changes within same speaker
        if (tokenLanguage && tokenLanguage !== currentLanguage) {
          currentLanguage = tokenLanguage;
        }
      }
    });

    // Add final segment
    if (currentSpeaker && currentText.length > 0) {
      // Soniox returns sub-word tokens (e.g., "Beautiful" → ["Beau", "ti", "ful"])
      // Tokens include trailing spaces to mark word boundaries
      const rawText = currentText.join(''); // Join without separator (preserves spaces in token.text)

      // FIX: Use same space normalization for ALL languages
      // Soniox tokens already include proper word boundaries (trailing spaces)
      // Previous bug: Urdu branch removed ALL spaces, concatenating words
      // Correct: Normalize multiple spaces to single, add space after punctuation
      let cleanedText = rawText
        .replace(/\s+/g, ' ') // Normalize multiple spaces to single space
        .replace(/([۔،؟!])([^\s])/g, '$1 $2') // Add space after Urdu punctuation if missing
        .replace(/([.?!])([^\s])/g, '$1 $2') // Add space after Latin punctuation if missing
        .trim();

      segments.push({
        speaker: currentSpeaker,
        label: speakerLabels[currentSpeaker] || currentSpeaker,
        text: cleanedText,
        startTime: currentStartTime,
        endTime: tokens[tokens.length - 1]?.end_ms || null, // Soniox uses 'end_ms'
        language: currentLanguage
      });
      speakerStats[currentSpeaker].segments = (speakerStats[currentSpeaker].segments || 0) + 1;
    }

    // Format transcript with speaker labels, timestamps, and language markers
    const formattedTranscript = segments
      .map(seg => {
        const timestamp = seg.startTime !== null ? `[${formatTimestamp(seg.startTime)}]` : '[00:00]';
        const langMarker = seg.language ? ` (${seg.language.toUpperCase()})` : '';
        return `${timestamp} ${seg.label}${langMarker}: ${seg.text}`;
      })
      .join('\n\n');

    // Build diarization data object
    const diarizationData = {
      speakers: sortedSpeakers.map(speakerId => ({
        id: speakerId,
        label: speakerLabels[speakerId],
        wordCount: speakerStats[speakerId].wordCount,
        segments: segments.filter(s => s.speaker === speakerId)
      })),
      totalSegments: segments.length,
      confidence: 85 // Soniox diarization confidence estimate
    };

    logToFile('Transcript formatted with speaker labels', {
      segmentCount: segments.length,
      formattedLength: formattedTranscript.length,
      speakers: diarizationData.speakers.map(s => ({
        label: s.label,
        segments: s.segments.length,
        words: s.wordCount
      }))
    });

    return { transcript: formattedTranscript, diarization: diarizationData };
  }

  /**
   * Get audio duration in seconds using ffprobe
   * @param {Buffer} audioBuffer - Audio file buffer
   * @returns {Promise<number>} Duration in seconds
   */
  static async getAudioDuration(audioBuffer) {
    return new Promise((resolve, reject) => {
      const tempPath = path.join(TEMP_DIR, `duration_check_${Date.now()}.m4a`);

      try {
        // Write buffer to temp file
        fs.writeFileSync(tempPath, audioBuffer);

        // Use ffprobe to get duration
        ffmpeg.ffprobe(tempPath, (err, metadata) => {
          // Clean up temp file
          if (fs.existsSync(tempPath)) {
            fs.unlinkSync(tempPath);
          }

          if (err) {
            logToFile('Error getting audio duration with ffprobe', { error: err.message });
            reject(err);
            return;
          }

          const duration = metadata?.format?.duration || 0;
          logToFile('Audio duration extracted', {
            duration,
            durationMinutes: Math.round(duration / 60)
          });
          resolve(duration);
        });
      } catch (error) {
        // Clean up temp file on error
        if (fs.existsSync(tempPath)) {
          fs.unlinkSync(tempPath);
        }
        logToFile('Error in getAudioDuration', { error: error.message });
        reject(error);
      }
    });
  }

  /**
   * Determine which ASR engine to use for a language
   * @param {string} languageCode - Our language code (e.g., 'bal-PK', 'en')
   * @returns {string} ASR engine: 'soniox' or 'mms-asr'
   */
  static getASREngine(languageCode) {
    if (MMS_LANGUAGES[languageCode]) {
      return 'mms-asr';
    }
    return 'soniox';
  }

  /**
   * Get MMS language code for regional languages
   * @param {string} ourCode - Our language code (e.g., 'bal-PK')
   * @returns {string|null} MMS language code (e.g., 'bcc-script_arabic')
   */
  static getMmsLanguageCode(ourCode) {
    return MMS_LANGUAGES[ourCode] || null;
  }

  /**
   * Transcribe audio using user's preferred language
   * Routes to Soniox or MMS-ASR based on language
   *
   * @param {string} wavPath - Path to WAV audio file
   * @param {string} userLanguage - User's preferred language code
   * @returns {Promise<{text: string, language: string, engine: string}>}
   */
  static async transcribeWithLanguagePreference(wavPath, userLanguage) {
    const engine = this.getASREngine(userLanguage);

    logToFile('🔀 ASR routing', {
      userLanguage,
      engine,
      mmsCode: engine === 'mms-asr' ? this.getMmsLanguageCode(userLanguage) : null
    });

    // Route to MMS-ASR for regional languages (bal-PK, sd-PK, ps-PK)
    if (engine === 'mms-asr') {
      const MmsInferenceService = require('./mms-inference.service');

      // Check if MMS service is available
      const health = await MmsInferenceService.healthCheck();

      if (health.healthy && health.modelLoaded) {
        logToFile('🔊 Using MMS-ASR for regional language', {
          userLanguage,
          mmsCode: this.getMmsLanguageCode(userLanguage),
          gpuAvailable: health.gpuAvailable
        });

        const mmsResult = await MmsInferenceService.transcribe(wavPath, userLanguage);

        if (mmsResult.success) {
          return {
            text: mmsResult.text,
            language: userLanguage,
            engine: 'mms-asr'
          };
        }

        // MMS failed - fall back to Soniox with warning
        logToFile('⚠️ MMS-ASR failed, falling back to Soniox', {
          userLanguage,
          error: mmsResult.error
        });
      } else {
        // MMS service not available - fall back to Soniox
        logToFile('⚠️ MMS service unavailable, falling back to Soniox', {
          userLanguage,
          health
        });
      }

      // Fallback to Soniox (will produce poor results but won't crash)
      const result = await this.transcribe(wavPath, false, userLanguage);
      return {
        text: result.text,
        language: result.language || userLanguage,
        engine: 'soniox-fallback'
      };
    }

    // Use Soniox for mainstream languages (en, ur, ar, es, ta, pa)
    const result = await this.transcribe(wavPath, false, userLanguage);

    return {
      text: result.text,
      language: result.language || userLanguage,
      engine: 'soniox'
    };
  }
}

module.exports = AudioService;
