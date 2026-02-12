/**
 * Pronunciation Assessment Service
 * Handles pronunciation analysis for reading assessments
 *
 * Assessment Strategy:
 * - English: Azure Pronunciation Assessment (phoneme-level with NBestPhonemes)
 * - Urdu/Other: GPT-4o audio analysis (word-level, Azure doesn't support Urdu)
 *
 * Azure Pronunciation Assessment Features:
 * - Phoneme-level accuracy scores (with NBestPhonemes config)
 * - Word-level accuracy, error types (omission, insertion, mispronunciation)
 * - Prosody analysis (intonation, stress, rhythm)
 * - Fluency score (pace, pauses)
 * - Completeness score (how much of reference text was read)
 *
 * IMPORTANT: Azure phoneme scores correlate but individual scores less reliable
 * Focus: Use word-level feedback for diagnostics, phoneme-level for patterns
 *
 * Prerequisites:
 * - npm install microsoft-cognitiveservices-speech-sdk
 * - AZURE_SPEECH_KEY and AZURE_SPEECH_REGION in .env
 */

const fs = require('fs');
const path = require('path');
const { getClient } = require('../llm-client');
const { logToFile } = require('../../utils/logger');
const { OPENAI_API_KEY, TEMP_DIR } = require('../../utils/constants');

const openai = getClient();

// Azure Speech SDK (install with: npm install microsoft-cognitiveservices-speech-sdk)
let sdk = null;
try {
  sdk = require('microsoft-cognitiveservices-speech-sdk');
} catch (error) {
  logToFile('⚠️ Azure Speech SDK not installed - pronunciation assessment will use fallback', {
    error: error.message
  });
}

const AZURE_SPEECH_KEY = process.env.AZURE_SPEECH_KEY;
const AZURE_SPEECH_REGION = process.env.AZURE_SPEECH_REGION || 'eastus';

class PronunciationService {
  /**
   * Assess pronunciation based on language
   * @param {string} assessmentId - Assessment UUID
   * @param {string} audioUrl - R2 URL of audio file
   * @param {string} referenceText - Original passage text (what should be read)
   * @param {string} language - Language code ('en' or 'ur')
   * @param {string} transcribedText - What was actually read (from Soniox)
   * @returns {Promise<object>} Pronunciation assessment result
   */
  static async assessPronunciation(
    assessmentId,
    audioUrl,
    referenceText,
    language,
    transcribedText
  ) {
    try {
      logToFile('📊 Starting pronunciation assessment', {
        assessmentId,
        language,
        referenceLength: referenceText.length,
        transcriptLength: transcribedText.length
      });

      if (language === 'en') {
        // English: Use Azure Pronunciation Assessment
        return await this.assessEnglishPronunciation(
          assessmentId,
          audioUrl,
          referenceText,
          transcribedText
        );
      } else {
        // Urdu/Other: Use GPT-4o audio analysis
        return await this.assessNonEnglishPronunciation(
          assessmentId,
          audioUrl,
          referenceText,
          transcribedText,
          language
        );
      }

    } catch (error) {
      logToFile('❌ Error in pronunciation assessment', {
        assessmentId,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Assess English pronunciation using Azure
   * @param {string} assessmentId - Assessment UUID
   * @param {string} audioUrl - R2 URL of audio file
   * @param {string} referenceText - Reference passage text
   * @param {string} transcribedText - Transcribed text
   * @returns {Promise<object>} Azure pronunciation assessment result
   */
  static async assessEnglishPronunciation(
    assessmentId,
    audioUrl,
    referenceText,
    transcribedText,
    passageType = 'passage'
  ) {
    // Check if Azure SDK is available
    if (!sdk || !AZURE_SPEECH_KEY) {
      logToFile('⚠️ Azure Speech SDK or credentials not available, using fallback');
      return this.fallbackPronunciationAssessment(referenceText, transcribedText, 'en');
    }

    let tempAudioPath = null;

    try {
      logToFile('Using Azure Pronunciation Assessment for English', { assessmentId });

      // Download audio from R2 using authenticated S3 client
      const { downloadFromR2, extractKeyFromUrl } = require('../../storage/r2');
      const audioKey = extractKeyFromUrl(audioUrl);

      logToFile('📥 Downloading audio from R2 for Azure pronunciation', {
        audioUrl,
        key: audioKey
      });

      const audioBuffer = await downloadFromR2(audioKey);

      logToFile('✅ Audio downloaded from R2 for Azure', {
        size: audioBuffer.length
      });

      tempAudioPath = path.join(TEMP_DIR, `azure_pronunciation_${assessmentId}.wav`);

      // Convert to WAV format (Azure requires WAV)
      const AudioService = require('../audio.service');
      await AudioService.convertToWav(audioBuffer, tempAudioPath);

      logToFile('Audio converted to WAV for Azure', { tempAudioPath });

      // Configure Azure Speech
      const speechConfig = sdk.SpeechConfig.fromSubscription(AZURE_SPEECH_KEY, AZURE_SPEECH_REGION);
      const audioConfig = sdk.AudioConfig.fromWavFileInput(fs.readFileSync(tempAudioPath));

      // Configure pronunciation assessment with phoneme-level detail
      const pronunciationConfig = new sdk.PronunciationAssessmentConfig(
        referenceText,
        sdk.PronunciationAssessmentGradingSystem.HundredMark,
        sdk.PronunciationAssessmentGranularity.Phoneme, // CRITICAL: Phoneme-level
        true // enableMiscue - detects insertions/omissions
      );

      // Configure for word list if applicable (accept any order)
      if (passageType === 'words' || passageType === 'word-list') {
        // Note: Azure SDK may not have direct contentAssessmentType property
        // But we can handle word order flexibility in analysis
        logToFile('📝 Configuring for word list assessment (any order accepted)');
        // Words can be read in any order - we'll validate all words were read
        // rather than enforcing a specific sequence
      }

      // Enable advanced features
      pronunciationConfig.enableProsodyAssessment = true; // Intonation, stress, rhythm
      pronunciationConfig.phonemeAlphabet = 'IPA'; // International Phonetic Alphabet

      // CRITICAL: Enable NBestPhonemes for phoneme-level scores
      pronunciationConfig.nBestPhonemeCount = 5; // Top 5 phoneme predictions

      const recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);
      pronunciationConfig.applyTo(recognizer);

      logToFile('Azure recognizer configured', {
        referenceText: referenceText.substring(0, 50),
        enabledFeatures: ['phoneme-level', 'prosody', 'miscue', 'NBestPhonemes']
      });

      // Run recognition
      const azureResult = await new Promise((resolve, reject) => {
        recognizer.recognizeOnceAsync(
          result => {
            recognizer.close();
            resolve(result);
          },
          error => {
            recognizer.close();
            reject(error);
          }
        );
      });

      // Clean up temp file
      if (tempAudioPath && fs.existsSync(tempAudioPath)) {
        fs.unlinkSync(tempAudioPath);
      }

      // Parse pronunciation assessment result
      if (azureResult.reason === sdk.ResultReason.RecognizedSpeech) {
        const pronunciationResult = sdk.PronunciationAssessmentResult.fromResult(azureResult);

        logToFile('✅ Azure pronunciation assessment complete', {
          accuracyScore: pronunciationResult.accuracyScore,
          fluencyScore: pronunciationResult.fluencyScore,
          completenessScore: pronunciationResult.completenessScore,
          prosodyScore: pronunciationResult.prosodyScore,
          pronunciationScore: pronunciationResult.pronunciationScore
        });

        // Extract detailed results
        const detailedResult = JSON.parse(azureResult.properties.getProperty(
          sdk.PropertyId.SpeechServiceResponse_JsonResult
        ));

        const words = detailedResult.NBest[0].Words || [];
        const phonemes = this.extractPhonemes(words);

        return {
          // Overall scores
          accuracyScore: pronunciationResult.accuracyScore || 0,
          fluencyScore: pronunciationResult.fluencyScore || 0,
          completenessScore: pronunciationResult.completenessScore || 0,
          prosodyScore: pronunciationResult.prosodyScore || 0,
          pronunciationScore: pronunciationResult.pronunciationScore || 0,

          // Enhanced word-level analysis with IPA extraction
          words: words.map(w => {
            const phonemes = w.Phonemes || [];

            // Extract NBest phoneme predictions and build IPA
            const phoneticDetails = phonemes.map(p => {
              const nBest = p.PronunciationAssessment?.NBestPhonemes || [];
              const expected = p.Phoneme;
              const actualBest = nBest[0]?.Phoneme || expected;
              const confidence = nBest[0]?.Score || p.PronunciationAssessment?.AccuracyScore || 0;

              return {
                expected: expected,
                actual: actualBest,
                confidence: confidence,
                accuracyScore: p.PronunciationAssessment?.AccuracyScore || 0,
                alternates: nBest.slice(1, 3).map(n => ({
                  phoneme: n.Phoneme,
                  score: n.Score
                }))
              };
            });

            // Build IPA representations
            const expectedIPA = phoneticDetails.map(p => p.expected).join('');
            const actualIPA = phoneticDetails.map(p => p.actual).join('');

            return {
              word: w.Word,
              accuracyScore: w.PronunciationAssessment?.AccuracyScore || 0,
              errorType: w.PronunciationAssessment?.ErrorType || 'None',
              expectedIPA: expectedIPA,
              actualIPA: actualIPA,
              isMispronounced: w.PronunciationAssessment?.ErrorType === 'Mispronunciation',
              phoneticDetails: phoneticDetails,
              syllables: w.Syllables || [],
              phonemes: phonemes
            };
          }),

          // Phoneme-level analysis (for patterns, not individual diagnosis)
          phonemes: phonemes,

          // Prosody analysis
          prosodyAnalysis: {
            intonation: pronunciationResult.prosodyScore || 0,
            rhythm: detailedResult.NBest[0].PronunciationAssessment?.Prosody?.Rhythm || 0,
            stress: detailedResult.NBest[0].PronunciationAssessment?.Prosody?.Stress || 0
          },

          // Raw Azure result for debugging
          rawResult: detailedResult,

          // Source
          source: 'azure',
          model: 'pronunciation-assessment-v1'
        };

      } else {
        logToFile('❌ Azure recognition failed', {
          reason: azureResult.reason,
          errorDetails: azureResult.errorDetails
        });

        // Fallback to alternative assessment
        return this.fallbackPronunciationAssessment(referenceText, transcribedText, 'en');
      }

    } catch (error) {
      logToFile('❌ Error in Azure pronunciation assessment', {
        assessmentId,
        error: error.message,
        errorCode: error.code,
        errorDetails: error.details || error.response?.data,
        stack: error.stack,
        azureKey: AZURE_SPEECH_KEY ? 'present' : 'missing',
        azureRegion: AZURE_SPEECH_REGION,
        audioPath: tempAudioPath,
        audioExists: tempAudioPath ? fs.existsSync(tempAudioPath) : false
      });

      // Clean up temp file on error
      if (tempAudioPath && fs.existsSync(tempAudioPath)) {
        try {
          fs.unlinkSync(tempAudioPath);
        } catch (cleanupError) {
          logToFile('Warning: Temp file cleanup failed', { error: cleanupError.message });
        }
      }

      // Fallback to alternative assessment
      logToFile('Using fallback pronunciation assessment (text-based)', {
        language: 'en'
      });
      return this.fallbackPronunciationAssessment(referenceText, transcribedText, 'en');
    }
  }

  /**
   * Assess non-English pronunciation using GPT-4o audio analysis
   * @param {string} assessmentId - Assessment UUID
   * @param {string} audioUrl - R2 URL of audio file
   * @param {string} referenceText - Reference passage text
   * @param {string} transcribedText - Transcribed text
   * @param {string} language - Language code
   * @returns {Promise<object>} GPT-4o pronunciation assessment result
   */
  static async assessNonEnglishPronunciation(
    assessmentId,
    audioUrl,
    referenceText,
    transcribedText,
    language
  ) {
    try {
      logToFile('Using GPT-4o audio analysis for non-English', {
        assessmentId,
        language
      });

      // Download audio from R2 using authenticated S3 client
      const { downloadFromR2, extractKeyFromUrl } = require('../../storage/r2');
      const audioKey = extractKeyFromUrl(audioUrl);

      logToFile('📥 Downloading audio from R2 for GPT-4o pronunciation', {
        audioUrl,
        key: audioKey
      });

      const audioBuffer = await downloadFromR2(audioKey);

      logToFile('✅ Audio downloaded from R2 for GPT-4o', {
        size: audioBuffer.length
      });

      // Convert to base64 for GPT-4o
      const audioBase64 = audioBuffer.toString('base64');

      const prompt = `You are an expert in ${language === 'ur' ? 'Urdu' : language} pronunciation assessment for early-grade readers.

**Reference Text (what should be read):**
${referenceText}

**Transcribed Text (what was actually read):**
${transcribedText}

**Audio:** [Audio file provided below]

Analyze the student's reading pronunciation and provide:

1. **Overall Pronunciation Score (0-100)**: Based on clarity and accuracy
2. **Word-Level Accuracy**: List words that were mispronounced or omitted
3. **Fluency Assessment**: Comment on pace, pauses, and smoothness
4. **Strengths**: 2-3 specific pronunciation strengths
5. **Improvement Areas**: 2-3 specific areas to work on

Format your response as JSON:
{
  "pronunciationScore": 85,
  "fluencyScore": 80,
  "mispronunciations": ["word1", "word2"],
  "omissions": ["word3"],
  "strengths": ["Clear vowel sounds", "Good pacing"],
  "improvements": ["Work on consonant clusters", "Reduce hesitations"]
}`;

      // TODO: GPT-4o audio API is not yet publicly available
      // For now, use text-based analysis as placeholder
      logToFile('⚠️ GPT-4o audio API not available, using text-based fallback');

      return this.fallbackPronunciationAssessment(referenceText, transcribedText, language);

    } catch (error) {
      logToFile('❌ Error in GPT-4o pronunciation assessment', {
        assessmentId,
        error: error.message,
        stack: error.stack
      });

      return this.fallbackPronunciationAssessment(referenceText, transcribedText, language);
    }
  }

  /**
   * Fallback pronunciation assessment (text-based comparison)
   * @param {string} referenceText - Reference passage
   * @param {string} transcribedText - Transcribed text
   * @param {string} language - Language code
   * @returns {object} Basic pronunciation assessment
   */
  static fallbackPronunciationAssessment(referenceText, transcribedText, language) {
    logToFile('Using fallback pronunciation assessment (text-based)', { language });

    // Normalize texts for comparison
    const normalize = (text) => text.toLowerCase().replace(/[^\w\s]/g, '').trim();
    const refWords = normalize(referenceText).split(/\s+/);
    const transWords = normalize(transcribedText).split(/\s+/);

    // Simple word-level comparison
    const matches = refWords.filter(w => transWords.includes(w)).length;
    const accuracyScore = Math.round((matches / refWords.length) * 100);

    // Estimate fluency based on length similarity
    const lengthRatio = transWords.length / refWords.length;
    const fluencyScore = Math.round(Math.max(0, 100 - Math.abs(lengthRatio - 1) * 100));

    return {
      accuracyScore: accuracyScore,
      fluencyScore: fluencyScore,
      completenessScore: Math.round((transWords.length / refWords.length) * 100),
      prosodyScore: 70, // Default estimate
      pronunciationScore: Math.round((accuracyScore + fluencyScore) / 2),

      words: refWords.map((word, i) => ({
        word: word,
        accuracyScore: transWords.includes(word) ? 100 : 0,
        errorType: transWords.includes(word) ? 'None' : 'Mispronunciation'
      })),

      phonemes: [],

      prosodyAnalysis: {
        intonation: 70,
        rhythm: 70,
        stress: 70
      },

      source: 'fallback',
      model: 'text-comparison-v1'
    };
  }

  /**
   * Extract phoneme-level data from Azure words
   * @param {Array} words - Azure word-level results
   * @returns {Array} Phonemes with scores
   */
  static extractPhonemes(words) {
    const phonemes = [];

    for (const word of words) {
      if (word.Phonemes && Array.isArray(word.Phonemes)) {
        for (const phoneme of word.Phonemes) {
          phonemes.push({
            phoneme: phoneme.Phoneme,
            accuracyScore: phoneme.PronunciationAssessment?.AccuracyScore || 0,
            nBest: phoneme.PronunciationAssessment?.NBestPhonemes || [],
            word: word.Word
          });
        }
      }
    }

    return phonemes;
  }
}

module.exports = PronunciationService;
