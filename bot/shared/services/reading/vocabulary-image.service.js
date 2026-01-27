/**
 * Vocabulary Image Service
 * Bug #7: Generates 3-picture composite images for word-level comprehension using Gemini 2.5 Flash
 *
 * Purpose: Create visual vocabulary assessments for L2/L3 learners
 * - Receptive vocabulary testing (picture-word matching)
 * - Child-friendly educational illustrations
 * - WhatsApp interactive button compatible (3 choices)
 *
 * Research Basis:
 * - L2 Vocabulary Depth (Qian, 2002): Vocabulary depth predicts reading comprehension
 * - Productive vs Receptive (Laufer & Goldstein, 2004): L2 learners have larger gaps
 * - Pakistani Context (Mansoor, 2005): 93% learn Urdu as L2, English as L3
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');
const { uploadImageBuffer, buildR2PublicUrl } = require('../../storage/r2');
const { logToFile } = require('../../utils/logger');

// Initialize Gemini client
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

class VocabularyImageService {
  /**
   * Generate a 3-picture composite image for vocabulary assessment
   * @param {string} targetWord - The word the student must identify (correct answer)
   * @param {string[]} distractorWords - 2 distractor words
   * @param {number} correctPosition - Position of correct answer (1, 2, or 3). If null, randomized.
   * @returns {Promise<{imageUrl: string, correctButton: string}>}
   */
  static async generateVocabularyGrid(targetWord, distractorWords, correctPosition = null) {
    try {
      // Randomize correct position if not specified
      if (!correctPosition) {
        correctPosition = Math.floor(Math.random() * 3) + 1; // 1, 2, or 3
      }

      // Arrange words in order based on correct position
      const orderedWords = [];
      let distractorIndex = 0;
      for (let i = 1; i <= 3; i++) {
        if (i === correctPosition) {
          orderedWords.push(targetWord);
        } else {
          orderedWords.push(distractorWords[distractorIndex++]);
        }
      }

      logToFile('🎨 Generating vocabulary grid image via Gemini', {
        targetWord,
        distractors: distractorWords,
        correctPosition,
        orderedWords
      });

      // Generate image via Gemini
      // Bug #16 Fix: More explicit prompt to prevent wrong labels like "SKIP"
      const prompt = `Create an educational image showing exactly 3 objects side by side:

LEFT POSITION: A ${orderedWords[0].toUpperCase()} (cartoon style, colorful)
CENTER POSITION: A ${orderedWords[1].toUpperCase()} (cartoon style, colorful)
RIGHT POSITION: A ${orderedWords[2].toUpperCase()} (cartoon style, colorful)

STRICT REQUIREMENTS:
- White background
- Three objects arranged horizontally with clear gaps between them
- Below each object, display ONLY the single digit number:
  * Put the number "1" below the LEFT object
  * Put the number "2" below the CENTER object
  * Put the number "3" below the RIGHT object
- The labels MUST be exactly "1", "2", "3" - nothing else
- Do NOT use any other text, words, or labels (no "skip", "next", etc.)
- Child-friendly colorful cartoon style suitable for ages 5-8
- Make each object clearly recognizable`;

      const model = genAI.getGenerativeModel({
        model: 'gemini-2.0-flash-exp-image-generation',  // Tested & verified Nov 30, 2025
        generationConfig: {
          responseModalities: ['Text', 'Image']
        }
      });

      const result = await model.generateContent(prompt);
      const response = result.response;

      // Extract image from response
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
          const imageBuffer = Buffer.from(part.inlineData.data, 'base64');

          // Upload to R2
          const key = `vocab_images/${targetWord.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}.png`;
          await uploadImageBuffer(imageBuffer, key);
          const publicUrl = buildR2PublicUrl(key);

          logToFile('✅ Vocabulary image generated and uploaded', {
            targetWord,
            distractors: distractorWords,
            correctPosition,
            imageUrl: publicUrl,
            imageSize: imageBuffer.length
          });

          return {
            imageUrl: publicUrl,
            correctButton: correctPosition.toString()
          };
        }
      }

      throw new Error('No image in Gemini response');
    } catch (error) {
      logToFile('❌ Gemini image generation failed', {
        error: error.message,
        targetWord,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Select appropriate distractor words for a target word
   * Filters out the target word and selects 2 random alternatives
   * @param {string} targetWord - The word to find distractors for
   * @param {string[]} availableWords - Pool of words from passage
   * @returns {string[]} Two distractor words
   */
  static selectDistractors(targetWord, availableWords) {
    // Filter out target word and short words (< 3 chars)
    const candidates = availableWords.filter(w =>
      w.toLowerCase() !== targetWord.toLowerCase() && w.length >= 3
    );

    // If not enough candidates, use common distractor words
    if (candidates.length < 2) {
      const commonDistractors = ['ball', 'cup', 'book', 'table', 'chair', 'door', 'window', 'pen'];
      const filtered = commonDistractors.filter(w => w.toLowerCase() !== targetWord.toLowerCase());
      // Shuffle and take what we need
      const shuffled = filtered.sort(() => Math.random() - 0.5);
      while (candidates.length < 2) {
        candidates.push(shuffled[candidates.length]);
      }
    }

    // Shuffle and take 2
    const shuffled = candidates.sort(() => Math.random() - 0.5);
    return shuffled.slice(0, 2);
  }

  /**
   * Select a good target word from passage for picture matching
   * Prefers concrete nouns that can be easily illustrated
   * @param {string[]} words - All words from passage
   * @returns {string} Target word for picture matching
   */
  static selectTargetWord(words) {
    // Filter to words that are likely concrete nouns (4+ chars, not too long)
    const candidates = words.filter(w => w.length >= 3 && w.length <= 10);

    if (candidates.length === 0) {
      return words[0]; // Fallback to first word
    }

    // Return random candidate
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  /**
   * Fallback to text-only question if Gemini fails
   * @param {string} targetWord - The correct word
   * @param {string[]} distractors - Distractor words
   * @returns {object} Text-based question configuration
   */
  static createTextFallbackQuestion(targetWord, distractors) {
    const correctPosition = Math.floor(Math.random() * 3) + 1;

    // Arrange options
    const options = [];
    let distractorIndex = 0;
    for (let i = 1; i <= 3; i++) {
      if (i === correctPosition) {
        options.push(targetWord);
      } else {
        options.push(distractors[distractorIndex++]);
      }
    }

    logToFile('⚠️ Using text fallback for vocabulary question', {
      targetWord,
      options,
      correctPosition
    });

    return {
      type: 'receptive_text_fallback',
      question: `Which of these is a "${targetWord}"?\n\n1. ${options[0]}\n2. ${options[1]}\n3. ${options[2]}`,
      expected_answer: correctPosition.toString(),
      options: options,
      buttons: [
        { id: 'vocab_answer_1', title: '1' },
        { id: 'vocab_answer_2', title: '2' },
        { id: 'vocab_answer_3', title: '3' }
      ],
      scoring: 1
    };
  }
}

module.exports = VocabularyImageService;
