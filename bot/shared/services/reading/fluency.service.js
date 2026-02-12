/**
 * Fluency Metrics Calculator Service
 * Calculates reading fluency metrics for assessment
 *
 * Key Metrics:
 * - Words Correct Per Minute (WCPM) - gold standard for reading fluency
 * - Accuracy Percentage - (correct words / total words) * 100
 * - Time Elapsed - actual reading time in seconds
 * - Error Analysis:
 *   - Omissions: Words in passage but not read
 *   - Insertions: Words read but not in passage
 *   - Substitutions: Words replaced with different words
 *   - Self-corrections: Errors caught and fixed by student
 *
 * Algorithm:
 * 1. Align transcribed text with reference passage (word-by-word)
 * 2. Identify correct words, errors, and types
 * 3. Calculate time elapsed from word timestamps
 * 4. Compute WCPM = (correct words / time in minutes)
 * 5. Compute accuracy = (correct words / total words in passage) * 100
 *
 * EGRA/ASER Standard: Uses WCPM as primary fluency indicator
 */

const { logToFile } = require('../../utils/logger');
const { matchAllLetters, matchLetterToTranscript } = require('../../utils/letter-name-mapping');
const { getClient } = require('../llm-client');
const { OPENAI_API_KEY } = require('../../utils/constants');

const openai = getClient();

class FluencyService {
  /**
   * Calculate all fluency metrics
   * @param {object} assessment - Assessment record
   * @param {object} transcriptionResult - Transcription with word timestamps
   * @param {object} pronunciationResult - Pronunciation assessment data
   * @returns {Promise<object>} Fluency metrics
   */
  static async calculateFluencyMetrics(
    assessment,
    transcriptionResult,
    pronunciationResult
  ) {
    try {
      logToFile('📊 Calculating fluency metrics', {
        assessmentId: assessment.id,
        passageWords: assessment.passage_text.split(/\s+/).length,
        transcribedWords: transcriptionResult.text.split(/\s+/).length
      });

      const passageText = assessment.passage_text || '';
      const transcribedText = transcriptionResult.text || '';
      const wordTimestamps = transcriptionResult.wordTimestamps || [];

      // CRITICAL FIX (Bug #6): Clean transcript artifacts before word alignment
      // Soniox diarization adds timestamps [00:01], speaker labels "Teacher (EN):", etc.
      // These artifacts cause false errors like "Inserted: 0001", "Inserted: teacher"
      const cleanedTranscript = this.cleanTranscriptForAlignment(transcribedText);

      // Step 1: Normalize and tokenize texts
      const passageWords = this.tokenize(passageText);
      const transcribedWords = this.tokenize(cleanedTranscript); // Use cleaned version

      logToFile('Text tokenized', {
        passageWords: passageWords.length,
        transcribedWords: transcribedWords.length
      });

      // Bug #1 Fix: For letter-type assessments, use letter name mapping instead of word alignment
      // Children say "alif" but passage stores "ا" - standard Levenshtein fails
      const passageType = assessment.passage_type || 'sentences';
      let alignment;

      if (passageType === 'letters') {
        // Use letter name mapping (Option A + C approach)
        alignment = await this.alignLettersWithMapping(
          passageWords,
          cleanedTranscript,
          assessment.language
        );
      } else {
        // Standard word alignment for non-letter assessments
        alignment = this.alignWords(passageWords, transcribedWords);
      }

      logToFile('Word alignment complete', {
        correctWords: alignment.correctWords,
        omissions: alignment.omissions.length,
        insertions: alignment.insertions.length,
        substitutions: alignment.substitutions.length
      });

      // Step 3: Calculate time elapsed from timestamps
      const timeElapsed = this.calculateTimeElapsed(wordTimestamps, assessment.audio_duration_seconds);

      logToFile('Time elapsed calculated', {
        timeElapsedSeconds: timeElapsed,
        fromTimestamps: wordTimestamps.length > 0
      });

      // Step 4: Detect self-corrections
      const selfCorrections = this.detectSelfCorrections(
        transcribedWords,
        wordTimestamps,
        passageWords
      );

      logToFile('Self-corrections detected', {
        count: selfCorrections.length
      });

      // Step 5: Calculate fluency metric (WCPM or LCPM based on passage type)
      // Bug #6 Fix: Use LCPM for letters, WCPM for connected text
      // Note: passageType already defined above for letter matching
      const timeMinutes = timeElapsed / 60;
      const rawScore = timeMinutes > 0 ? alignment.correctWords / timeMinutes : 0;

      // Determine metric type based on passage type
      const isLetterAssessment = passageType === 'letters';
      const metricType = isLetterAssessment ? 'LCPM' : 'WCPM';
      const metricDisplayName = isLetterAssessment
        ? 'Letters Correct Per Minute'
        : 'Words Correct Per Minute';

      // For backwards compatibility, always populate wcpm field
      const wcpm = rawScore;

      // Step 6: Calculate accuracy percentages
      const totalWordsInPassage = passageWords.length;

      // IMPORTANT: Separate word accuracy from pronunciation accuracy
      // Word Accuracy: Percentage of words read correctly (from word alignment)
      // Pronunciation Accuracy: Phoneme-level pronunciation quality (from Azure, English only)

      // Calculate word alignment accuracy (ALWAYS available, for all languages)
      const wordAccuracy = totalWordsInPassage > 0
        ? (alignment.correctWords / totalWordsInPassage) * 100
        : 0;

      // Extract pronunciation accuracy from Azure (only available for English)
      const azureData = pronunciationResult?.pronunciationData;
      const pronunciationAccuracy = (azureData?.source === 'azure' && azureData.accuracyScore !== undefined)
        ? azureData.accuracyScore
        : null;

      logToFile('✅ Accuracy metrics calculated', {
        wordAccuracy: Math.round(wordAccuracy * 10) / 10,
        pronunciationAccuracy: pronunciationAccuracy ? Math.round(pronunciationAccuracy * 10) / 10 : 'N/A',
        language: assessment.language,
        note: 'Word accuracy = correct words / total words. Pronunciation accuracy = Azure phoneme-level score.'
      });

      // Step 7: Build errors array
      const errors = this.buildErrorsArray(
        alignment.omissions,
        alignment.insertions,
        alignment.substitutions
      );

      const result = {
        // Core metrics
        totalWords: totalWordsInPassage,
        wordsRead: transcribedWords.length,
        wordsCorrect: alignment.correctWords,
        wcpm: Math.round(wcpm * 10) / 10, // Round to 1 decimal place (backwards compatible)
        wordAccuracy: Math.round(wordAccuracy * 10) / 10, // Word alignment accuracy (ALWAYS available)
        pronunciationAccuracy: pronunciationAccuracy ? Math.round(pronunciationAccuracy * 10) / 10 : null, // Azure pronunciation (English only)
        timeElapsed: Math.round(timeElapsed),

        // Bug #6 Fix: Passage-type-specific metric info
        metricType: metricType, // 'LCPM' for letters, 'WCPM' for connected text
        metricDisplayName: metricDisplayName, // Human-readable metric name
        fluencyScore: Math.round(rawScore * 10) / 10, // The actual score (same as wcpm but with generic name)

        // Error analysis
        errors: errors,
        omissionsCount: alignment.omissions.length,
        insertionsCount: alignment.insertions.length,
        substitutionsCount: alignment.substitutions.length,
        selfCorrections: selfCorrections,
        selfCorrectionsCount: selfCorrections.length,

        // Alignment details (for debugging)
        alignment: alignment
      };

      logToFile('✅ Fluency metrics calculated', {
        assessmentId: assessment.id,
        metricType: result.metricType,
        score: result.fluencyScore,
        wordAccuracy: result.wordAccuracy,
        pronunciationAccuracy: result.pronunciationAccuracy || 'N/A',
        timeElapsed: result.timeElapsed,
        correctWords: result.wordsCorrect,
        passageType: passageType
      });

      return result;

    } catch (error) {
      logToFile('❌ Error calculating fluency metrics', {
        assessmentId: assessment.id,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Clean transcript artifacts before word alignment (FIX for Bug #6)
   * Removes Soniox diarization markers that cause false errors
   * @param {string} transcript - Raw transcript with diarization
   * @returns {string} Cleaned transcript without artifacts
   */
  static cleanTranscriptForAlignment(transcript) {
    if (!transcript || typeof transcript !== 'string') {
      return '';
    }

    return transcript
      .replace(/\[\d{2}:\d{2}\]/g, '')                    // Remove [00:01] timestamps
      .replace(/\bTeacher\b\s*\([A-Z]{2}\)\s*:/gi, '')    // Remove "Teacher (EN):"
      .replace(/\bStudent\b\s*\([A-Z]{2}\)\s*:/gi, '')    // Remove "Student (EN):"
      .replace(/\b(EN|UR|AR|ES)\b/gi, '')                 // Remove standalone language codes
      .replace(/\s{2,}/g, ' ')                            // Collapse multiple spaces
      .trim();
  }

  /**
   * Tokenize text into normalized words
   * @param {string} text - Input text
   * @returns {Array<string>} Array of normalized words
   */
  static tokenize(text) {
    if (!text || typeof text !== 'string') {
      return [];
    }

    return text
      .toLowerCase()
      .replace(/[^\w\s\u0600-\u06FF]/g, '') // Keep alphanumeric and Urdu characters
      .trim()
      .split(/\s+/)
      .filter(word => word.length > 0);
  }

  /**
   * Align transcribed words with passage words (Levenshtein-based)
   * @param {Array<string>} passageWords - Reference passage words
   * @param {Array<string>} transcribedWords - Transcribed words
   * @returns {object} Alignment result with errors
   */
  static alignWords(passageWords, transcribedWords) {
    const n = passageWords.length;
    const m = transcribedWords.length;

    // Dynamic programming matrix for word alignment
    const dp = Array(n + 1).fill(null).map(() => Array(m + 1).fill(0));
    const operations = Array(n + 1).fill(null).map(() => Array(m + 1).fill(''));

    // Initialize base cases
    for (let i = 0; i <= n; i++) {
      dp[i][0] = i; // Cost of deleting all passage words
      if (i > 0) operations[i][0] = 'omission';
    }
    for (let j = 0; j <= m; j++) {
      dp[0][j] = j; // Cost of inserting all transcribed words
      if (j > 0) operations[0][j] = 'insertion';
    }

    // Fill DP matrix
    for (let i = 1; i <= n; i++) {
      for (let j = 1; j <= m; j++) {
        if (passageWords[i - 1] === transcribedWords[j - 1]) {
          // Match - no cost
          dp[i][j] = dp[i - 1][j - 1];
          operations[i][j] = 'match';
        } else {
          // Choose minimum cost operation
          const substitutionCost = dp[i - 1][j - 1] + 1;
          const omissionCost = dp[i - 1][j] + 1;
          const insertionCost = dp[i][j - 1] + 1;

          const minCost = Math.min(substitutionCost, omissionCost, insertionCost);
          dp[i][j] = minCost;

          if (minCost === substitutionCost) {
            operations[i][j] = 'substitution';
          } else if (minCost === omissionCost) {
            operations[i][j] = 'omission';
          } else {
            operations[i][j] = 'insertion';
          }
        }
      }
    }

    // Backtrack to find alignment
    let i = n, j = m;
    const omissions = [];
    const insertions = [];
    const substitutions = [];
    let correctWords = 0;

    while (i > 0 || j > 0) {
      const operation = operations[i][j];

      if (operation === 'match') {
        correctWords++;
        i--;
        j--;
      } else if (operation === 'substitution') {
        substitutions.push({
          expected: passageWords[i - 1],
          actual: transcribedWords[j - 1],
          position: i - 1
        });
        i--;
        j--;
      } else if (operation === 'omission') {
        omissions.push({
          word: passageWords[i - 1],
          position: i - 1
        });
        i--;
      } else if (operation === 'insertion') {
        insertions.push({
          word: transcribedWords[j - 1],
          position: j - 1
        });
        j--;
      }
    }

    return {
      correctWords: correctWords,
      omissions: omissions.reverse(),
      insertions: insertions.reverse(),
      substitutions: substitutions.reverse(),
      editDistance: dp[n][m]
    };
  }

  /**
   * Calculate time elapsed from word timestamps
   * @param {Array} wordTimestamps - Array of {word, startMs, endMs, duration}
   * @param {number} fallbackDuration - Fallback duration from audio metadata
   * @returns {number} Time elapsed in seconds
   */
  static calculateTimeElapsed(wordTimestamps, fallbackDuration = null) {
    if (!wordTimestamps || wordTimestamps.length === 0) {
      // No timestamps - use fallback duration if available
      if (fallbackDuration && fallbackDuration > 0) {
        logToFile('Using fallback duration (no timestamps)', { duration: fallbackDuration });
        return fallbackDuration;
      }

      logToFile('⚠️ No timestamps or fallback duration available');
      return 60; // Default to 60 seconds if no data
    }

    // Calculate from first word start to last word end
    const firstWord = wordTimestamps[0];
    const lastWord = wordTimestamps[wordTimestamps.length - 1];

    const startMs = firstWord.startMs || 0;
    const endMs = lastWord.endMs || lastWord.startMs || 0;

    const durationMs = endMs - startMs;
    const durationSeconds = durationMs / 1000;

    logToFile('Time calculated from timestamps', {
      startMs,
      endMs,
      durationMs,
      durationSeconds
    });

    return Math.max(1, durationSeconds); // Minimum 1 second to avoid division by zero
  }

  /**
   * Detect self-corrections (repeated words indicating error then correction)
   * @param {Array<string>} transcribedWords - Transcribed words
   * @param {Array} wordTimestamps - Word timestamps
   * @param {Array<string>} passageWords - Reference passage words
   * @returns {Array} Self-corrections detected
   */
  static detectSelfCorrections(transcribedWords, wordTimestamps, passageWords) {
    const selfCorrections = [];

    // Look for patterns: incorrect word followed by correct word
    for (let i = 0; i < transcribedWords.length - 1; i++) {
      const currentWord = transcribedWords[i];
      const nextWord = transcribedWords[i + 1];

      // Check if current word is NOT in passage but next word IS
      const currentInPassage = passageWords.includes(currentWord);
      const nextInPassage = passageWords.includes(nextWord);

      if (!currentInPassage && nextInPassage) {
        // Potential self-correction
        selfCorrections.push({
          incorrect: currentWord,
          corrected: nextWord,
          position: i
        });
      }
    }

    return selfCorrections;
  }

  /**
   * Build errors array for database storage
   * @param {Array} omissions - Omitted words
   * @param {Array} insertions - Inserted words
   * @param {Array} substitutions - Substituted words
   * @returns {Array} Errors array
   */
  static buildErrorsArray(omissions, insertions, substitutions) {
    const errors = [];

    for (const omission of omissions) {
      errors.push({
        type: 'omission',
        word: omission.word,
        position: omission.position
      });
    }

    for (const insertion of insertions) {
      errors.push({
        type: 'insertion',
        word: insertion.word,
        position: insertion.position
      });
    }

    for (const substitution of substitutions) {
      errors.push({
        type: 'substitution',
        expected: substitution.expected,
        actual: substitution.actual,
        position: substitution.position
      });
    }

    // Sort by position
    errors.sort((a, b) => (a.position || 0) - (b.position || 0));

    return errors;
  }

  // ============================================================================
  // Bug #1 Fix: Letter Name Mapping with GPT-4o Fallback
  // Option A: Fast letter name lookup + Option C: GPT-4o for ambiguous cases
  // ============================================================================

  /**
   * Align letters using name mapping (for letter-type assessments)
   * Children say "alif" but passage stores "ا" - this handles the mismatch
   *
   * @param {Array<string>} passageLetters - Letters from passage (symbols like 'ا', 'ب')
   * @param {string} transcript - Full transcript text (may contain letter names)
   * @param {string} language - 'ur' or 'en'
   * @returns {Promise<object>} Alignment result compatible with standard alignment format
   */
  static async alignLettersWithMapping(passageLetters, transcript, language) {
    logToFile('🔤 Starting letter alignment with name mapping', {
      language,
      letterCount: passageLetters.length,
      transcriptPreview: transcript.substring(0, 100)
    });

    // Step 1: Try fast letter name mapping (Option A)
    const mappingResult = matchAllLetters(passageLetters, transcript, language);

    logToFile('📊 Letter name mapping result', {
      accuracy: mappingResult.accuracy,
      matched: mappingResult.matched,
      total: mappingResult.total,
      method: 'letter-name-mapping'
    });

    // If mapping accuracy >= 80%, trust the mapping result
    if (mappingResult.accuracy >= 80) {
      logToFile('✅ Using letter name mapping (accuracy >= 80%)', {
        accuracy: mappingResult.accuracy
      });
      return this.convertMappingToAlignment(passageLetters, mappingResult);
    }

    // Step 2: Fallback to GPT-4o for ambiguous cases (Option C)
    logToFile('🤖 Falling back to GPT-4o letter matching (accuracy < 80%)', {
      mappingAccuracy: mappingResult.accuracy
    });

    try {
      const gptResult = await this.gptLetterMatching(passageLetters, transcript, language);
      return this.convertMappingToAlignment(passageLetters, gptResult);
    } catch (error) {
      logToFile('⚠️ GPT-4o fallback failed, using mapping result', {
        error: error.message
      });
      // Fall back to mapping result even if below threshold
      return this.convertMappingToAlignment(passageLetters, mappingResult);
    }
  }

  /**
   * GPT-4o letter matching for ambiguous cases
   * Handles accent variations, mispronunciations, partial matches
   *
   * @param {Array<string>} letters - Letter symbols from passage
   * @param {string} transcript - Full transcript
   * @param {string} language - 'ur' or 'en'
   * @returns {Promise<object>} { matches: boolean[], accuracy: number, matched: number, total: number }
   */
  static async gptLetterMatching(letters, transcript, language) {
    const langName = language === 'ur' ? 'Urdu' : 'English';

    const prompt = `You are analyzing a reading assessment where a child read letters aloud.

REFERENCE LETTERS (what the child was asked to read):
${letters.join(' ')}

TRANSCRIPT (what the child actually said):
${transcript}

TASK: For each reference letter, determine if the child correctly identified it.
- ${langName} children typically say letter NAMES (e.g., Urdu: "الف" for "ا", English: "ay" for "A")
- Accept phonetic variations, accents, and partial matches
- Be lenient with children's pronunciation

Return a JSON object with:
{
  "matches": [true/false for each letter in order],
  "matched": number of correct letters,
  "total": total letters,
  "accuracy": percentage (0-100)
}

IMPORTANT: Return ONLY valid JSON, no explanations.`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 500
    });

    const responseText = response.choices[0]?.message?.content || '{}';

    // Parse JSON response
    try {
      // Clean potential markdown code blocks
      const jsonStr = responseText.replace(/```json\n?|\n?```/g, '').trim();
      const result = JSON.parse(jsonStr);

      logToFile('✅ GPT-4o letter matching complete', {
        accuracy: result.accuracy,
        matched: result.matched,
        total: result.total
      });

      return {
        matches: result.matches || letters.map(() => false),
        matched: result.matched || 0,
        total: result.total || letters.length,
        accuracy: result.accuracy || 0
      };
    } catch (parseError) {
      logToFile('❌ Failed to parse GPT-4o response', {
        error: parseError.message,
        response: responseText
      });
      throw parseError;
    }
  }

  /**
   * Convert letter mapping result to standard alignment format
   * Makes letter results compatible with existing fluency metrics calculation
   *
   * @param {Array<string>} letters - Original letters
   * @param {object} mappingResult - { matches: boolean[], accuracy, matched, total }
   * @returns {object} Alignment result with omissions, insertions, substitutions arrays
   */
  static convertMappingToAlignment(letters, mappingResult) {
    const omissions = [];
    const substitutions = [];

    // Build omissions list (letters that weren't matched)
    letters.forEach((letter, index) => {
      if (!mappingResult.matches[index]) {
        omissions.push({
          word: letter,
          position: index
        });
      }
    });

    return {
      correctWords: mappingResult.matched,
      omissions: omissions,
      insertions: [], // Not applicable for letter matching
      substitutions: substitutions,
      matchedPairs: letters.map((letter, i) => ({
        passage: letter,
        transcribed: mappingResult.matches[i] ? letter : null,
        matched: mappingResult.matches[i]
      }))
    };
  }
}

module.exports = FluencyService;
