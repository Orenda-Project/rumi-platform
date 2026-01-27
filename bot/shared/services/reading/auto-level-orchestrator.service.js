/**
 * Auto-Level Orchestrator Service
 * Implements ASER-style adaptive level assessment for reading fluency
 *
 * ASER Methodology:
 * 1. Start at highest level (STORY)
 * 2. If accuracy < 80%, move DOWN one level
 * 3. Give 2 attempts per level before moving down
 * 4. If accuracy >= 80%, student has found their instructional level
 * 5. Continue until stable or reached LETTERS level
 *
 * Level Progression (highest to lowest):
 * story → paragraph → sentences → words → letters
 */

const supabase = require('../../config/supabase');
const WhatsAppService = require('../whatsapp.service');
const { logToFile } = require('../../utils/logger');
const OpenAI = require('openai');
const { OPENAI_API_KEY } = require('../../utils/constants');

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// Level progression from highest to lowest complexity
const LEVEL_ORDER = ['story', 'paragraph', 'sentences', 'words', 'letters'];

// Accuracy threshold for passing a level
const PASS_THRESHOLD = 80;

// Maximum attempts per level before moving down
const MAX_ATTEMPTS_PER_LEVEL = 2;

// Word counts for each level (EGRA/ASER aligned)
const LEVEL_WORD_COUNTS = {
  letters: 14,     // 14 letters in grid
  words: 14,       // 14 words in grid
  sentences: 40,   // ~4 sentences
  paragraph: 60,   // ~6 sentences
  story: 100       // ~10 sentences
};

// Level names in supported languages for voice messages
const LEVEL_NAMES = {
  en: {
    letters: 'letter recognition',
    words: 'word reading',
    sentences: 'sentence reading',
    paragraph: 'paragraph reading',
    story: 'story reading'
  },
  ur: {
    letters: 'حروف کی پہچان',
    words: 'الفاظ پڑھنا',
    sentences: 'جملے پڑھنا',
    paragraph: 'پیراگراف پڑھنا',
    story: 'کہانی پڑھنا'
  }
};

class AutoLevelOrchestratorService {
  /**
   * Start a new auto-level assessment
   * @param {string} assessmentId - Assessment UUID
   * @param {string} userId - User UUID
   * @param {string} phoneNumber - WhatsApp phone number
   * @param {string} language - 'en' or 'ur'
   * @param {number} gradeLevel - Grade level (1-5)
   * @param {string} userLanguage - User's preferred language for messages
   * @returns {Promise<object>} Initial assessment config
   */
  static async startAutoAssessment(
    assessmentId,
    userId,
    phoneNumber,
    language,
    gradeLevel,
    userLanguage = 'en'
  ) {
    try {
      logToFile('🎯 Starting auto-level assessment', {
        assessmentId,
        userId,
        language,
        gradeLevel
      });

      // Always start at STORY level for auto mode
      const startingLevel = 'story';

      // Initialize level attempts tracking
      const levelAttempts = {};
      LEVEL_ORDER.forEach(level => {
        levelAttempts[level] = {
          attempts: 0,
          passed: null,
          accuracy: null,
          wcpm: null
        };
      });

      // Update assessment record with auto mode settings
      const { error } = await supabase
        .from('reading_assessments')
        .update({
          assessment_mode: 'auto',
          starting_level: startingLevel,
          passage_type: startingLevel,
          level_attempts: levelAttempts,
          auto_level_history: [],
          current_level_attempt: 1,
          max_attempts_per_level: MAX_ATTEMPTS_PER_LEVEL
        })
        .eq('id', assessmentId);

      if (error) {
        throw new Error(`Failed to update assessment: ${error.message}`);
      }

      // Send welcome message explaining auto mode
      const welcomeMessage = await this.generateWelcomeMessage(userLanguage);
      await WhatsAppService.sendMessage(phoneNumber, welcomeMessage);

      logToFile('✅ Auto-level assessment initialized', {
        assessmentId,
        startingLevel,
        mode: 'auto'
      });

      return {
        passageType: startingLevel,
        wordCount: LEVEL_WORD_COUNTS[startingLevel],
        gradeLevel,
        language,
        isAutoMode: true
      };

    } catch (error) {
      logToFile('❌ Error starting auto-level assessment', {
        assessmentId,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Process assessment result and determine next action
   * @param {string} assessmentId - Assessment UUID
   * @param {number} accuracy - Accuracy percentage from fluency calculation
   * @param {number} wcpm - Words correct per minute
   * @param {string} phoneNumber - WhatsApp phone number
   * @param {string} userLanguage - User's preferred language
   * @returns {Promise<object>} Next action: { action: 'continue'|'complete', nextLevel?, config? }
   */
  static async processAutoLevelResult(
    assessmentId,
    accuracy,
    wcpm,
    phoneNumber,
    userLanguage = 'en'
  ) {
    try {
      // Fetch current assessment state
      const { data: assessment, error } = await supabase
        .from('reading_assessments')
        .select('*')
        .eq('id', assessmentId)
        .single();

      if (error || !assessment) {
        throw new Error(`Assessment not found: ${assessmentId}`);
      }

      // Only process if in auto mode
      if (assessment.assessment_mode !== 'auto') {
        logToFile('⚠️ Not in auto mode, skipping level progression', {
          assessmentId,
          mode: assessment.assessment_mode
        });
        return { action: 'complete', reason: 'manual_mode' };
      }

      const currentLevel = assessment.passage_type;
      const currentAttempt = assessment.current_level_attempt || 1;
      const levelAttempts = assessment.level_attempts || {};
      const levelHistory = assessment.auto_level_history || [];

      logToFile('📊 Processing auto-level result', {
        assessmentId,
        currentLevel,
        currentAttempt,
        accuracy,
        wcpm,
        passThreshold: PASS_THRESHOLD
      });

      // Update level attempts for current level
      levelAttempts[currentLevel] = {
        attempts: currentAttempt,
        passed: accuracy >= PASS_THRESHOLD,
        accuracy,
        wcpm
      };

      // Decision logic
      if (accuracy >= PASS_THRESHOLD) {
        // PASSED - Student found their instructional level
        logToFile('✅ Level PASSED - Assessment complete', {
          assessmentId,
          finalLevel: currentLevel,
          accuracy
        });

        // Update assessment with final level
        await supabase
          .from('reading_assessments')
          .update({
            final_level: currentLevel,
            level_attempts: levelAttempts,
            status: 'completed'
          })
          .eq('id', assessmentId);

        // Send congratulations message
        const passedMessage = await this.generatePassedMessage(
          currentLevel,
          accuracy,
          userLanguage
        );
        await WhatsAppService.sendMessage(phoneNumber, passedMessage);

        return {
          action: 'complete',
          reason: 'passed',
          finalLevel: currentLevel,
          accuracy,
          wcpm
        };

      } else if (currentAttempt < MAX_ATTEMPTS_PER_LEVEL) {
        // FAILED but has more attempts - Retry same level
        logToFile('🔄 Level FAILED - Retrying same level', {
          assessmentId,
          currentLevel,
          attempt: currentAttempt + 1,
          maxAttempts: MAX_ATTEMPTS_PER_LEVEL
        });

        // Update attempt counter
        await supabase
          .from('reading_assessments')
          .update({
            current_level_attempt: currentAttempt + 1,
            level_attempts: levelAttempts,
            status: 'pending' // Reset for new passage
          })
          .eq('id', assessmentId);

        // Send retry message
        const retryMessage = await this.generateRetryMessage(
          currentLevel,
          accuracy,
          currentAttempt + 1,
          MAX_ATTEMPTS_PER_LEVEL,
          userLanguage
        );
        await WhatsAppService.sendMessage(phoneNumber, retryMessage);

        return {
          action: 'retry',
          level: currentLevel,
          attempt: currentAttempt + 1,
          config: {
            passageType: currentLevel,
            wordCount: LEVEL_WORD_COUNTS[currentLevel]
          }
        };

      } else {
        // FAILED all attempts - Move down one level
        const currentLevelIndex = LEVEL_ORDER.indexOf(currentLevel);
        const nextLevelIndex = currentLevelIndex + 1;

        if (nextLevelIndex >= LEVEL_ORDER.length) {
          // Already at lowest level (letters) - Assessment complete
          logToFile('⚠️ At lowest level - Assessment complete', {
            assessmentId,
            finalLevel: currentLevel
          });

          await supabase
            .from('reading_assessments')
            .update({
              final_level: currentLevel,
              level_attempts: levelAttempts,
              status: 'completed'
            })
            .eq('id', assessmentId);

          const lowestLevelMessage = await this.generateLowestLevelMessage(
            currentLevel,
            accuracy,
            userLanguage
          );
          await WhatsAppService.sendMessage(phoneNumber, lowestLevelMessage);

          return {
            action: 'complete',
            reason: 'lowest_level',
            finalLevel: currentLevel,
            accuracy,
            wcpm
          };
        }

        const nextLevel = LEVEL_ORDER[nextLevelIndex];

        // Record level transition in history
        levelHistory.push({
          from: currentLevel,
          to: nextLevel,
          reason: 'accuracy_below_80',
          accuracy,
          timestamp: new Date().toISOString()
        });

        logToFile('⬇️ Moving down one level', {
          assessmentId,
          from: currentLevel,
          to: nextLevel,
          accuracy
        });

        // Update assessment for next level
        await supabase
          .from('reading_assessments')
          .update({
            passage_type: nextLevel,
            current_level_attempt: 1,
            level_attempts: levelAttempts,
            auto_level_history: levelHistory,
            status: 'pending' // Reset for new passage
          })
          .eq('id', assessmentId);

        // Send level transition message
        const transitionMessage = await this.generateTransitionMessage(
          currentLevel,
          nextLevel,
          accuracy,
          userLanguage
        );
        await WhatsAppService.sendMessage(phoneNumber, transitionMessage);

        return {
          action: 'continue',
          previousLevel: currentLevel,
          nextLevel,
          config: {
            passageType: nextLevel,
            wordCount: LEVEL_WORD_COUNTS[nextLevel]
          }
        };
      }

    } catch (error) {
      logToFile('❌ Error processing auto-level result', {
        assessmentId,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Check if user wants to end assessment (finish command detection)
   * @param {string} text - User message text
   * @returns {boolean} True if user wants to finish
   */
  static isFinishCommand(text) {
    if (!text) return false;

    const normalizedText = text.toLowerCase().trim();

    // English finish commands
    const englishCommands = ['done', 'finish', 'finished', 'stop', 'end', 'complete', 'exit', 'quit'];

    // Urdu finish commands
    const urduCommands = ['مکمل', 'ختم', 'بس', 'رک', 'پورا', 'ہو گیا', 'ہوگیا'];

    return englishCommands.some(cmd => normalizedText.includes(cmd)) ||
           urduCommands.some(cmd => normalizedText.includes(cmd));
  }

  /**
   * Generate welcome message for auto mode
   */
  static async generateWelcomeMessage(language) {
    const prompt = `Generate a brief, encouraging message in language code "${language}" explaining:
1. This is an adaptive reading assessment that will find the student's reading level
2. We'll start with a story passage
3. The student should read as best they can
4. Based on performance, we'll adjust the difficulty
5. Maximum 4-5 sentences
6. Friendly, supportive tone for teachers
7. NO markdown, NO meta-commentary`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 250
    });

    return response.choices[0].message.content.trim();
  }

  /**
   * Generate message when student passes a level
   */
  static async generatePassedMessage(level, accuracy, language) {
    const levelName = LEVEL_NAMES[language]?.[level] || level;

    const prompt = `Generate a brief congratulations message in language code "${language}" saying:
1. Great job! The student demonstrated ${Math.round(accuracy)}% accuracy
2. They have successfully completed the ${levelName} level
3. This is their instructional reading level
4. Brief encouragement for continued practice
5. Maximum 4 sentences
6. Very positive, celebratory tone
7. NO markdown`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.4,
      max_tokens: 200
    });

    return response.choices[0].message.content.trim();
  }

  /**
   * Generate message for retry at same level
   */
  static async generateRetryMessage(level, accuracy, attempt, maxAttempts, language) {
    const levelName = LEVEL_NAMES[language]?.[level] || level;

    const prompt = `Generate a brief, encouraging retry message in language code "${language}" saying:
1. The student scored ${Math.round(accuracy)}% on the ${levelName} level
2. This is attempt ${attempt} of ${maxAttempts}
3. Let's try one more time with a different passage
4. Encourage them to take their time and read clearly
5. Maximum 3 sentences
6. Supportive, not discouraging
7. NO markdown`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 150
    });

    return response.choices[0].message.content.trim();
  }

  /**
   * Generate message when transitioning to lower level
   */
  static async generateTransitionMessage(fromLevel, toLevel, accuracy, language) {
    const fromName = LEVEL_NAMES[language]?.[fromLevel] || fromLevel;
    const toName = LEVEL_NAMES[language]?.[toLevel] || toLevel;

    const prompt = `Generate a brief, supportive message in language code "${language}" explaining:
1. The ${fromName} level was a bit challenging (${Math.round(accuracy)}% accuracy)
2. We're moving to the ${toName} level to find their comfort zone
3. This is completely normal - the assessment adapts to find the right level
4. Brief encouragement
5. Maximum 3-4 sentences
6. Positive, no judgment
7. NO markdown`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 180
    });

    return response.choices[0].message.content.trim();
  }

  /**
   * Generate message when at lowest level
   */
  static async generateLowestLevelMessage(level, accuracy, language) {
    const levelName = LEVEL_NAMES[language]?.[level] || level;

    const prompt = `Generate a brief, encouraging completion message in language code "${language}" saying:
1. The assessment is complete
2. The student showed ${Math.round(accuracy)}% accuracy at the ${levelName} level
3. This gives us a clear picture of where to focus practice
4. Recommend starting with basic letter/word recognition practice
5. Brief, positive encouragement
6. Maximum 4 sentences
7. NO markdown`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 180
    });

    return response.choices[0].message.content.trim();
  }

  /**
   * Get the next passage config for continuing assessment
   */
  static getNextPassageConfig(nextLevel, gradeLevel, language) {
    return {
      type: nextLevel,
      wordCount: LEVEL_WORD_COUNTS[nextLevel],
      grade: gradeLevel,
      language
    };
  }
}

module.exports = AutoLevelOrchestratorService;
