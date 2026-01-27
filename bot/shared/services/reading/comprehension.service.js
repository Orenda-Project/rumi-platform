/**
 * Comprehension Assessment Service
 * Sprint 1.8: EGRA-aligned comprehension testing
 *
 * Features:
 * - Generate 5 grade-appropriate questions (2 literal, 2 inferential, 1 vocabulary)
 * - Bilingual answer evaluation (accept Urdu/Punjabi/English responses)
 * - EGRA-based benchmarking (3/5 = adequate comprehension)
 * - Teacher guidance generation
 *
 * Bug #7: Word-Level Comprehension Redesign
 * - Letters: No comprehension (blocked)
 * - Words: 3-question vocabulary assessment (semantic, receptive with images, productive)
 * - Sentences/Paragraphs: 5-question standard comprehension
 */

const OpenAI = require('openai');
const AudioService = require('../audio.service');
const VocabularyImageService = require('./vocabulary-image.service');
const { logToFile } = require('../../utils/logger');
const { OPENAI_API_KEY } = require('../../utils/constants');

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

class ComprehensionService {
  /**
   * Generate comprehension questions for a passage
   * Bug #7: Passage-type-specific question generation
   * @param {string} passageText - The passage students read
   * @param {string} language - 'en' or 'ur'
   * @param {number} gradeLevel - Grade level (0-5)
   * @param {string} passageType - 'letters', 'words', 'sentences', 'paragraph', 'story'
   * @returns {Promise<object|null>} { questions: Array, total_points: number } or null for letters
   */
  static async generateQuestions(passageText, language, gradeLevel, passageType = 'sentences') {
    try {
      logToFile('📝 Generating comprehension questions', {
        language,
        gradeLevel,
        passageType,
        passageLength: passageText.length
      });

      // Bug #7: Dispatch based on passage type
      // Letters: No comprehension (no semantic content)
      if (passageType === 'letters') {
        logToFile('⏭️ Skipping comprehension for letters passage (no semantic content)');
        return null;
      }

      // Words: 3-question vocabulary assessment
      if (passageType === 'words') {
        logToFile('🔤 Generating word-level comprehension questions');
        return await this.generateWordLevelQuestions(passageText, language, gradeLevel);
      }

      // Sentences/Paragraphs/Stories: Standard 5-question comprehension
      logToFile('📖 Generating standard text-level comprehension questions');

      const prompts = {
        en: `You are an EGRA-trained reading assessment specialist. Generate EXACTLY 5 comprehension questions for this passage.

**Passage** (${language}, Grade ${gradeLevel}):
${passageText}

**Requirements**:
1. Question 1: Literal recall (factual, explicit in text)
2. Question 2: Literal recall (factual, explicit in text)
3. Question 3: Inferential (requires reasoning beyond text)
4. Question 4: Inferential (requires reasoning beyond text)
5. Question 5: Vocabulary (word meaning from context)

**Format** (JSON):
{
  "questions": [
    {
      "id": 1,
      "type": "literal",
      "question": "...",
      "expected_answer": "...",
      "acceptable_variations": ["...", "..."]
    },
    ...
  ]
}

**Important**:
- Questions must be answerable from the passage
- Expected answers should be SHORT (1-2 sentences)
- Include acceptable variations (synonyms, paraphrases)
- Grade-appropriate vocabulary and sentence complexity
- For literal questions, answers are explicitly stated in passage
- For inferential questions, students must "read between the lines"
- For vocabulary question, test understanding from context

Return ONLY valid JSON, no markdown code blocks.`,

        ur: `آپ EGRA تربیت یافتہ ریڈنگ اسیسمنٹ ماہر ہیں۔ اس اقتباس کے لیے بالکل 5 فہم کے سوالات بنائیں۔

**اقتباس** (${language}, گریڈ ${gradeLevel}):
${passageText}

**ضروریات**:
1. سوال 1: لفظی یاد (حقیقت، متن میں واضح)
2. سوال 2: لفظی یاد (حقیقت، متن میں واضح)
3. سوال 3: استنباطی (متن سے آگے استدلال کی ضرورت)
4. سوال 4: استنباطی (متن سے آگے استدلال کی ضرورت)
5. سوال 5: الفاظ (سیاق و سباق سے لفظ کا مطلب)

**فارمیٹ** (JSON):
{
  "questions": [
    {
      "id": 1,
      "type": "literal",
      "question": "...",
      "expected_answer": "...",
      "acceptable_variations": ["...", "..."]
    },
    ...
  ]
}

**اہم**:
- سوالات کا جواب اقتباس سے دیا جا سکے
- متوقع جوابات مختصر ہونے چاہیے (1-2 جملے)
- قابل قبول تغیرات شامل کریں (مترادفات، پیرافریز)
- اردو، پنجابی یا انگریزی میں جوابات قبول کریں
- گریڈ کے مطابق الفاظ اور جملوں کی پیچیدگی

صرف درست JSON واپس کریں، markdown code blocks نہیں۔`
      };

      const prompt = prompts[language] || prompts.en;

      const response = await openai.chat.completions.create({
        model: 'gpt-4o', // Bug #31 Fix: gpt-4 deprecated, use gpt-4o for JSON mode support
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        response_format: { type: 'json_object' }
      });

      const result = JSON.parse(response.choices[0].message.content);

      logToFile('✅ Comprehension questions generated', {
        questionCount: result.questions?.length || 0,
        types: result.questions?.map(q => q.type).join(', ')
      });

      return result;
    } catch (error) {
      logToFile('❌ Error generating comprehension questions', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Bug #18: Evaluate student's TEXT answer to a comprehension question
   * @param {object} questionData - Question object with expected answer
   * @param {string} textAnswer - Student's text answer directly
   * @param {string} language - 'en' or 'ur'
   * @returns {Promise<object>} { questionId, studentAnswer, correct, confidence, explanation }
   */
  static async evaluateTextAnswer(questionData, textAnswer, language) {
    try {
      logToFile('📝 Evaluating comprehension TEXT answer (Bug #18)', {
        questionId: questionData.id,
        questionType: questionData.type,
        language,
        answerLength: textAnswer.length
      });

      // GPT-4 semantic evaluation (bilingual-aware) - same as voice but skip transcription
      const evaluationPrompt = `You are evaluating a student's comprehension answer in a bilingual context (Pakistan).

**Question**: ${questionData.question}

**Expected Answer**: ${questionData.expected_answer}

**Acceptable Variations**: ${questionData.acceptable_variations.join(', ')}

**Student's Answer** (typed text): "${textAnswer}"

**Context**:
- Student may answer in Urdu, Punjabi, or English (all valid)
- Focus on SEMANTIC MEANING, not exact wording
- Accept culturally equivalent expressions
- For vocabulary questions, accept synonyms or descriptions

**Evaluate**: Is the student's answer correct?

Respond in JSON:
{
  "correct": true/false,
  "confidence": 0.0-1.0,
  "explanation": "Brief reason for judgment (1 sentence)"
}`;

      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: evaluationPrompt }],
        temperature: 0.1,
        response_format: { type: 'json_object' }
      });

      const evaluation = JSON.parse(response.choices[0].message.content);

      logToFile('✅ Text answer evaluated', {
        questionId: questionData.id,
        correct: evaluation.correct,
        confidence: evaluation.confidence
      });

      return {
        questionId: questionData.id,
        questionType: questionData.type,
        question: questionData.question,
        studentAnswer: textAnswer,
        expectedAnswer: questionData.expected_answer,
        correct: evaluation.correct,
        confidence: evaluation.confidence,
        explanation: evaluation.explanation
      };
    } catch (error) {
      logToFile('❌ Error evaluating text answer', {
        questionId: questionData?.id,
        error: error.message
      });
      // Return a default "incorrect" evaluation on error
      return {
        questionId: questionData.id,
        questionType: questionData.type,
        question: questionData.question,
        studentAnswer: textAnswer,
        expectedAnswer: questionData.expected_answer,
        correct: false,
        confidence: 0,
        explanation: 'Error evaluating answer'
      };
    }
  }

  /**
   * Evaluate student's answer to a comprehension question
   * @param {object} questionData - Question object with expected answer
   * @param {string} studentAudioPath - Path to student's voice answer
   * @param {string} language - 'en' or 'ur'
   * @returns {Promise<object>} { questionId, studentAnswer, correct, confidence, explanation }
   */
  static async evaluateAnswer(questionData, studentAudioPath, language) {
    try {
      logToFile('🎤 Evaluating comprehension answer', {
        questionId: questionData.id,
        questionType: questionData.type,
        language
      });

      // Step 1: Transcribe student's voice answer
      const transcription = await AudioService.transcribe(studentAudioPath, false);
      const studentAnswer = transcription.text;

      logToFile('Student answer transcribed', {
        questionId: questionData.id,
        answer: studentAnswer,
        confidence: transcription.confidence
      });

      // Step 2: GPT-4 semantic evaluation (bilingual-aware)
      const evaluationPrompt = `You are evaluating a student's comprehension answer in a bilingual context (Pakistan).

**Question**: ${questionData.question}

**Expected Answer**: ${questionData.expected_answer}

**Acceptable Variations**: ${questionData.acceptable_variations.join(', ')}

**Student's Answer** (transcribed from voice): "${studentAnswer}"

**Context**:
- Student may answer in Urdu, Punjabi, or English (all valid)
- Focus on SEMANTIC MEANING, not exact wording
- Accept culturally equivalent expressions
- For vocabulary questions, accept synonyms or descriptions
- Allow for minor transcription errors

**Evaluate**: Is the student's answer correct?

Respond in JSON:
{
  "correct": true/false,
  "confidence": 0.0-1.0,
  "explanation": "Brief reason for judgment (1 sentence)"
}`;

      const response = await openai.chat.completions.create({
        model: 'gpt-4o', // Bug #31 Fix: gpt-4 deprecated, use gpt-4o for JSON mode support
        messages: [{ role: 'user', content: evaluationPrompt }],
        temperature: 0.1,  // Low temp for consistent evaluation
        response_format: { type: 'json_object' }
      });

      const evaluation = JSON.parse(response.choices[0].message.content);

      logToFile('✅ Answer evaluated', {
        questionId: questionData.id,
        correct: evaluation.correct,
        confidence: evaluation.confidence
      });

      return {
        questionId: questionData.id,
        questionType: questionData.type,
        question: questionData.question,
        studentAnswer: studentAnswer,
        expectedAnswer: questionData.expected_answer,
        correct: evaluation.correct,
        confidence: evaluation.confidence,
        explanation: evaluation.explanation
      };
    } catch (error) {
      logToFile('❌ Error evaluating answer', {
        questionId: questionData?.id,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Calculate comprehension benchmark status based on EGRA standards
   * @param {number} correctAnswers - Number of questions answered correctly (0-5)
   * @param {number} gradeLevel - Grade level (0-5)
   * @returns {object} { status, label, description, color }
   */
  static calculateBenchmarkStatus(correctAnswers, gradeLevel) {
    // EGRA-based thresholds
    const benchmarks = {
      0: { below: 2, at: 3, above: 4 },      // Kindergarten (rare to test)
      1: { below: 2, at: 3, above: 4 },      // Grade 1
      2: { below: 2, at: 3, above: 4 },      // Grade 2 (3/5 = adequate)
      3: { below: 2, at: 3, above: 5 },      // Grade 3 (higher expectations)
      4: { below: 3, at: 4, above: 5 },      // Grade 4
      5: { below: 3, at: 4, above: 5 }       // Grade 5
    };

    const threshold = benchmarks[gradeLevel] || benchmarks[2];  // Default to Grade 2

    if (correctAnswers < threshold.below) {
      return {
        status: 'urgent_intervention',
        label: 'Urgent Intervention Needed',
        description: 'Student struggles to comprehend grade-level text. Needs intensive support with decoding and vocabulary.',
        color: '#DC2626'  // Red
      };
    } else if (correctAnswers < threshold.at) {
      return {
        status: 'below_benchmark',
        label: 'Below Benchmark',
        description: 'Student shows partial comprehension but needs scaffolding and targeted practice.',
        color: '#F59E0B'  // Orange
      };
    } else if (correctAnswers < threshold.above) {
      return {
        status: 'at_benchmark',
        label: 'At Benchmark',
        description: 'Student demonstrates adequate comprehension for grade level. Ready for classroom instruction.',
        color: '#10B981'  // Green
      };
    } else {
      return {
        status: 'above_benchmark',
        label: 'Above Benchmark',
        description: 'Student shows strong comprehension skills including inferential thinking. Excelling at grade level.',
        color: '#3B82F6'  // Blue
      };
    }
  }

  /**
   * Generate teacher guidance based on comprehension analysis
   * @param {object} comprehensionAnalysis - Complete analysis with answers and scores
   * @param {string} language - 'en' or 'ur'
   * @returns {Promise<string>} Teacher guidance text
   */
  static async generateComprehensionGuidance(comprehensionAnalysis, language) {
    try {
      logToFile('📚 Generating comprehension guidance', {
        correctAnswers: comprehensionAnalysis.correctAnswers,
        totalQuestions: comprehensionAnalysis.totalQuestions,
        language
      });

      // Analyze which question types were struggled with
      const literalCorrect = comprehensionAnalysis.answers.filter(a =>
        a.questionType === 'literal' && a.correct
      ).length;
      const literalTotal = comprehensionAnalysis.answers.filter(a =>
        a.questionType === 'literal'
      ).length;

      const inferentialCorrect = comprehensionAnalysis.answers.filter(a =>
        a.questionType === 'inferential' && a.correct
      ).length;
      const inferentialTotal = comprehensionAnalysis.answers.filter(a =>
        a.questionType === 'inferential'
      ).length;

      const vocabularyCorrect = comprehensionAnalysis.answers.filter(a =>
        a.questionType === 'vocabulary' && a.correct
      ).length;
      const vocabularyTotal = comprehensionAnalysis.answers.filter(a =>
        a.questionType === 'vocabulary'
      ).length;

      const prompts = {
        en: `You are a reading specialist providing guidance to a teacher about a student's comprehension assessment.

**Comprehension Results**:
- Total Score: ${comprehensionAnalysis.correctAnswers}/${comprehensionAnalysis.totalQuestions} (${Math.round(comprehensionAnalysis.correctAnswers / comprehensionAnalysis.totalQuestions * 100)}%)
- Literal Questions: ${literalCorrect}/${literalTotal}
- Inferential Questions: ${inferentialCorrect}/${inferentialTotal}
- Vocabulary Questions: ${vocabularyCorrect}/${vocabularyTotal}
- Benchmark Status: ${comprehensionAnalysis.benchmarkStatus.label}

**Question Breakdown**:
${comprehensionAnalysis.answers.map(a =>
  `- ${a.correct ? '✅' : '❌'} (${a.questionType}): "${a.question}" → Student said: "${a.studentAnswer}"`
).join('\n')}

Generate a brief, actionable guidance paragraph (3-4 sentences) for the teacher:
1. Identify which comprehension skills are strong vs weak
2. Explain what this means for the student's reading development
3. Give 2-3 specific, practical activities to support growth

Be concise, warm, and focused on actionable next steps.`,

        ur: `آپ ریڈنگ ماہر ہیں جو استاد کو طالب علم کی فہم کی تشخیص کے بارے میں رہنمائی فراہم کر رہے ہیں۔

**فہم کے نتائج**:
- کل سکور: ${comprehensionAnalysis.correctAnswers}/${comprehensionAnalysis.totalQuestions} (${Math.round(comprehensionAnalysis.correctAnswers / comprehensionAnalysis.totalQuestions * 100)}%)
- لفظی سوالات: ${literalCorrect}/${literalTotal}
- استنباطی سوالات: ${inferentialCorrect}/${inferentialTotal}
- الفاظ کے سوالات: ${vocabularyCorrect}/${vocabularyTotal}
- بینچ مارک کی حیثیت: ${comprehensionAnalysis.benchmarkStatus.label}

**سوالات کی تفصیل**:
${comprehensionAnalysis.answers.map(a =>
  `- ${a.correct ? '✅' : '❌'} (${a.questionType}): "${a.question}" → طالب علم نے کہا: "${a.studentAnswer}"`
).join('\n')}

استاد کے لیے ایک مختصر، قابل عمل رہنمائی پیراگراف بنائیں (3-4 جملے):
1. کون سی فہم کی مہارتیں مضبوط ہیں بمقابلہ کمزور
2. یہ طالب علم کی پڑھنے کی ترقی کے لیے کیا مطلب ہے
3. ترقی کی حمایت کے لیے 2-3 مخصوص، عملی سرگرمیاں دیں

مختصر، گرم، اور قابل عمل اگلے اقدامات پر مرکوز رہیں۔`
      };

      const prompt = prompts[language] || prompts.en;

      const response = await openai.chat.completions.create({
        model: 'gpt-4o', // Bug #31 Fix: gpt-4 deprecated, use gpt-4o for consistency
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.5,
        max_tokens: 300
      });

      const guidance = response.choices[0].message.content.trim();

      logToFile('✅ Comprehension guidance generated', {
        guidanceLength: guidance.length,
        language
      });

      return guidance;
    } catch (error) {
      logToFile('❌ Error generating comprehension guidance', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Complete comprehension assessment flow
   * @param {Array} questions - Array of question objects
   * @param {Array} answers - Array of answer evaluation results
   * @param {number} gradeLevel - Grade level
   * @param {string} language - 'en' or 'ur'
   * @returns {object} Complete comprehension analysis
   */
  static async analyzeComprehension(questions, answers, gradeLevel, language) {
    try {
      logToFile('📊 Analyzing comprehension results', {
        questionCount: questions.length,
        answerCount: answers.length,
        gradeLevel,
        language
      });

      const correctAnswers = answers.filter(a => a.correct).length;
      const totalQuestions = questions.length;
      const score = Math.round((correctAnswers / totalQuestions) * 100);

      const benchmarkStatus = this.calculateBenchmarkStatus(correctAnswers, gradeLevel);

      const comprehensionAnalysis = {
        correctAnswers,
        totalQuestions,
        score,
        benchmarkStatus,
        answers
      };

      const guidance = await this.generateComprehensionGuidance(comprehensionAnalysis, language);

      logToFile('✅ Comprehension analysis complete', {
        correctAnswers,
        totalQuestions,
        score,
        benchmarkStatus: benchmarkStatus.label
      });

      return {
        correctAnswers,
        totalQuestions,
        score,
        benchmarkStatus,
        answers,
        guidance
      };
    } catch (error) {
      logToFile('❌ Error analyzing comprehension', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Generate word-level comprehension questions (Bug #7)
   * 3-question vocabulary assessment for word-level passages
   *
   * Question Types:
   * 1. Semantic Categorization (1 point) - How many words are about X?
   * 2. Receptive Vocabulary (1 point) - Picture-word matching with Gemini-generated images
   * 3. Productive Vocabulary (2 points) - Use word in a sentence
   *
   * Total: 4 points (shorter than sentence/paragraph's 5 questions)
   *
   * @param {string} passageText - Word list passage
   * @param {string} language - 'en' or 'ur'
   * @param {number} gradeLevel - Grade level (0-5)
   * @returns {Promise<object>} { questions: Array, total_points: number }
   */
  static async generateWordLevelQuestions(passageText, language, gradeLevel) {
    try {
      // Parse words from passage
      const words = passageText.split(/\s+/).filter(w => w.length >= 2);

      logToFile('🔤 Generating word-level comprehension', {
        wordCount: words.length,
        language,
        gradeLevel
      });

      if (words.length < 3) {
        logToFile('⚠️ Not enough words for vocabulary assessment', { wordCount: words.length });
        return null;
      }

      // Analyze semantic categories via GPT
      const categories = await this._analyzeWordCategories(words);
      const categoryAnalysis = this._getCategoryStats(words, categories);

      // Question 1: Semantic Categorization
      const categorizationQ = {
        id: 1,
        type: 'categorization',
        question: language === 'ur'
          ? `ان الفاظ میں سے کتنے ${categoryAnalysis.mostCommonCategory} کے بارے میں ہیں؟`
          : `How many of these words are about ${categoryAnalysis.mostCommonCategory}?`,
        expected_answer: categoryAnalysis.count.toString(),
        acceptable_variations: [
          categoryAnalysis.count.toString(),
          categoryAnalysis.categoryWords.join(', ')
        ],
        scoring: 1
      };

      // Question 2: Receptive (Picture-Word Matching via Gemini)
      const targetWord = VocabularyImageService.selectTargetWord(words);
      const distractors = VocabularyImageService.selectDistractors(targetWord, words);

      let receptiveQ;
      try {
        const { imageUrl, correctButton } = await VocabularyImageService.generateVocabularyGrid(
          targetWord,
          distractors
        );

        receptiveQ = {
          id: 2,
          type: 'receptive',
          question: language === 'ur'
            ? `کون سی تصویر "${targetWord}" دکھاتی ہے؟`
            : `Which picture shows the word "${targetWord}"?`,
          expected_answer: correctButton,
          imageUrl: imageUrl,  // Gemini-generated composite image
          buttons: [
            { id: 'vocab_answer_1', title: '1' },
            { id: 'vocab_answer_2', title: '2' },
            { id: 'vocab_answer_3', title: '3' }
          ],
          scoring: 1
        };
      } catch (geminiError) {
        // Fallback to text-only question if Gemini fails
        logToFile('⚠️ Gemini failed, using text fallback', { error: geminiError.message });
        receptiveQ = VocabularyImageService.createTextFallbackQuestion(targetWord, distractors);
        receptiveQ.id = 2;
      }

      // Question 3: Productive (Sentence Generation)
      const productiveWord = words.find(w => w !== targetWord && w.length >= 3) || words[1];
      const productiveQ = {
        id: 3,
        type: 'productive',
        question: language === 'ur'
          ? `"${productiveWord}" لفظ کو اسکول کے بارے میں ایک جملے میں استعمال کریں۔`
          : `Use the word "${productiveWord}" in a sentence about school.`,
        expected_answer: null, // GPT scores response
        acceptable_variations: [], // Any valid sentence using the word
        targetWord: productiveWord,
        scoring: 2
      };

      const result = {
        questions: [categorizationQ, receptiveQ, productiveQ],
        total_points: 4,
        passageType: 'words',
        assessmentType: 'vocabulary_comprehension'
      };

      logToFile('✅ Word-level comprehension questions generated', {
        questionTypes: result.questions.map(q => q.type),
        totalPoints: result.total_points,
        hasImage: !!receptiveQ.imageUrl
      });

      return result;
    } catch (error) {
      logToFile('❌ Error generating word-level questions', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Analyze word categories using GPT-4o-mini
   * @param {string[]} words - Array of words to categorize
   * @returns {Promise<object>} Category mapping
   */
  static async _analyzeWordCategories(words) {
    try {
      const prompt = `Categorize these words into semantic categories.

Words: ${words.join(', ')}

Categories to use:
- animals (e.g., dog, cat, bird)
- objects (e.g., table, pen, ball)
- actions (e.g., run, jump, eat)
- nature (e.g., tree, flower, sun)
- food (e.g., apple, rice, bread)
- body_parts (e.g., hand, eye, foot)
- colors (e.g., red, blue, green)
- other (anything else)

Return ONLY valid JSON, no markdown:
{
  "categories": {
    "word1": "category",
    "word2": "category"
  }
}`;

      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        response_format: { type: 'json_object' }
      });

      const result = JSON.parse(response.choices[0].message.content);
      return result.categories || {};
    } catch (error) {
      logToFile('⚠️ Category analysis failed, using fallback', { error: error.message });
      // Fallback: return empty categories
      return {};
    }
  }

  /**
   * Get statistics about word categories
   * @param {string[]} words - All words
   * @param {object} categories - Category mapping from GPT
   * @returns {object} Category statistics
   */
  static _getCategoryStats(words, categories) {
    // Count words per category
    const categoryCounts = {};
    const categoryWords = {};

    for (const word of words) {
      const category = categories[word.toLowerCase()] || categories[word] || 'other';
      categoryCounts[category] = (categoryCounts[category] || 0) + 1;
      if (!categoryWords[category]) categoryWords[category] = [];
      categoryWords[category].push(word);
    }

    // Find most common category (excluding 'other')
    let mostCommonCategory = 'objects';
    let maxCount = 0;

    for (const [category, count] of Object.entries(categoryCounts)) {
      if (category !== 'other' && count > maxCount) {
        maxCount = count;
        mostCommonCategory = category;
      }
    }

    return {
      mostCommonCategory,
      count: maxCount || 1,
      categoryWords: categoryWords[mostCommonCategory] || [words[0]],
      allCategories: categoryCounts
    };
  }
}

module.exports = ComprehensionService;
