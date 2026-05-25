'use strict';
// QuizGenerationService — generate MCQ questions via LLM, store in DB

const { logToFile } = require('../../utils/logger');
const supabase = require('../../config/supabase');

// Question count by difficulty
const QUESTION_DISTRIBUTION = [
  { level: 1, count: 2 },
  { level: 2, count: 2 },
  { level: 3, count: 3 },
  { level: 4, count: 2 },
  { level: 5, count: 1 },
];

class QuizGenerationService {
  /**
   * Generate a quiz and store it in the database.
   *
   * @returns {Promise<string>} quizId
   */
  static async generateAndStore({
    teacherId,
    listId,
    lessonPlanId = null,
    topic,
    grade,
    subject,
    sourceContent = null,
    quizSource = 'lesson_plan',
    language = 'en'
  }) {
    logToFile('📝 QuizGenerationService.generateAndStore', { teacherId, topic, grade, quizSource });

    // 1. Create quiz record (status: generating)
    const { data: quiz, error: quizErr } = await supabase
      .from('quizzes')
      .insert({
        teacher_id: teacherId,
        lesson_plan_id: lessonPlanId,
        list_id: listId,
        quiz_source: quizSource,
        topic,
        grade,
        subject,
        source_content: sourceContent,
        status: 'generating'
      })
      .select('id')
      .single();

    if (quizErr || !quiz) {
      throw new Error(`Failed to create quiz record: ${quizErr?.message}`);
    }

    const quizId = quiz.id;

    try {
      // 2. Generate questions via LLM
      const questions = await this._generateQuestions({ topic, grade, subject, sourceContent, quizSource });

      // 3. Store questions
      await this._storeQuestions(quizId, questions);

      // 4. Mark quiz as ready
      await supabase
        .from('quizzes')
        .update({ status: 'ready' })
        .eq('id', quizId);

      logToFile('✅ Quiz generation complete', { quizId, questionCount: questions.length });
      return quizId;

    } catch (err) {
      // Mark as failed
      await supabase
        .from('quizzes')
        .update({ status: 'failed' })
        .eq('id', quizId);
      throw err;
    }
  }

  /**
   * Generate questions via LLM.
   * @private
   */
  static async _generateQuestions({ topic, grade, subject, sourceContent, quizSource }) {
    const OpenAI = require('openai');
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const contentBlock = sourceContent
      ? `Based on this lesson plan content:\n${sourceContent.substring(0, 3000)}`
      : `Based on the Pakistan national curriculum for ${grade ? `Grade ${grade}` : 'primary school'} ${subject || ''}.
         Focus on key concepts a student should know about "${topic}".`;

    // misconception-encoded distractors. Each WRONG option must
    // be designed to look right to a student holding a SPECIFIC, NAMED
    // misconception. The two wrong options must encode DIFFERENT
    // misconceptions — never repeat. This is what makes downstream
    // distractor cluster analysis surface decision-grade
    // signal instead of "3 students picked the same wrong answer".
    const systemPrompt = `You are creating quiz questions for Pakistani school students on the topic: "${topic}".
${contentBlock}

Generate exactly 10 multiple-choice questions at varying difficulty levels:
- 2 questions at difficulty 1 (very easy — recall/recognition)
- 2 questions at difficulty 2 (easy — basic understanding)
- 3 questions at difficulty 3 (medium — application)
- 2 questions at difficulty 4 (hard — analysis)
- 1 question at difficulty 5 (very hard — synthesis/evaluation)

For EACH question:
- Question text ≤ 200 characters.
- Exactly 3 answer options (A, B, C). One is the correct answer; the other
  two are WRONG OPTIONS — but they must NOT be random or absurd.
- Each option ≤ 250 characters. Full sentences are fine — options render in
  the WhatsApp message body, not as button labels. Aim for 5–80
  characters per option for readability; only go longer when the content
  genuinely needs it.
- Each WRONG OPTION must be designed to look correct to a student who is
  holding a SPECIFIC, NAMED MISCONCEPTION about this topic. The two wrong
  options must encode DIFFERENT misconceptions — never repeat. Wrong
  options must be the kind of mistake a real student of this grade would
  actually make, not a trivially incorrect answer.
- For each wrong option, write a 1-sentence label of the misconception it
  encodes, phrased as the student's likely mental model — e.g. "student
  adds the denominators when they should keep them" or "student thinks
  evaporation only happens at boiling point". Each label ≤ 200 chars.
- A 1-sentence explanation of why the correct answer is correct.

Return ONLY a valid JSON object in this exact format, no other text:
{
  "questions": [
    {
      "question": "What is 1/2 + 1/2?",
      "option_a": "1",
      "option_b": "2/4",
      "option_c": "1/4",
      "correct": "A",
      "explanation": "1/2 + 1/2 = 1 whole, like two halves make one full.",
      "distractor_misconceptions": {
        "B": "student adds both numerator and denominator instead of keeping the denominator",
        "C": "student subtracts when seeing same denominator instead of adding"
      },
      "difficulty": 1
    }
  ]
}

The distractor_misconceptions object MUST have keys exactly matching the
two WRONG-option letters (so for correct: "A", only "B" and "C" appear
as keys; never include the correct option as a key).`;

    let attempts = 0;
    while (attempts < 2) {
      try {
        const response = await openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [{ role: 'user', content: systemPrompt }],
          temperature: attempts === 0 ? 0.7 : 0.9,
          response_format: { type: 'json_object' }
        });

        const raw = response.choices[0].message.content;
        let parsed;

        // Parse JSON and extract questions array
        try {
          parsed = JSON.parse(raw);
          // Primary: { "questions": [...] } format
          if (parsed.questions && Array.isArray(parsed.questions)) {
            parsed = parsed.questions;
          } else if (!Array.isArray(parsed)) {
            // Fallback: object whose values are all question objects
            const vals = Object.values(parsed);
            if (vals.length > 0 && typeof vals[0] === 'object' && vals[0].question) {
              parsed = vals;
            } else if (vals.length === 1 && Array.isArray(vals[0])) {
              parsed = vals[0];
            } else {
              throw new Error('LLM response has unexpected structure');
            }
          }
        } catch {
          throw new Error('LLM returned invalid JSON');
        }

        // Validate questions
        const validated = this._validateQuestions(parsed);
        if (validated.length < 8) {
          throw new Error(`Only ${validated.length} valid questions generated`);
        }

        return validated;

      } catch (err) {
        attempts++;
        logToFile('⚠️ Quiz generation attempt failed', { attempt: attempts, error: err.message });
        if (attempts >= 2) throw err;
      }
    }
  }

  /**
   * Validate and sanitize generated questions.
   *
   * every question is post-shuffled so the LLM's prompt-driven
   * correct=A bias doesn't reach students. The shuffle is invisible to
   * the LLM (post-generation) and to students (they see well-shuffled
   * questions). Without this step, every Manto-style quiz lands with
   * correct=A on every row → students pattern-match and abuse.
   *
   * @private
   */
  static _validateQuestions(questions) {
    if (!Array.isArray(questions)) return [];

    return questions.filter(q => {
      if (!q.question || !q.option_a || !q.option_b || !q.option_c) return false;
      if (!['A', 'B', 'C'].includes(q.correct)) return false;
      if (q.question.length > 200) q.question = q.question.substring(0, 197) + '...';
      // options now render in message body (not button titles), so the
      // old 20-char button-title limit no longer applies. Cap at 250 to stay
      // well under Meta's 1024-char interactive-body limit even with 3 options.
      if (q.option_a.length > 250) q.option_a = q.option_a.substring(0, 247) + '...';
      if (q.option_b.length > 250) q.option_b = q.option_b.substring(0, 247) + '...';
      if (q.option_c.length > 250) q.option_c = q.option_c.substring(0, 247) + '...';
      // Ensure unique options
      if (q.option_a === q.option_b || q.option_b === q.option_c || q.option_a === q.option_c) return false;
      if (!q.difficulty || q.difficulty < 1 || q.difficulty > 5) q.difficulty = 3;

      // validate per-distractor misconceptions. If the LLM produced
      // them in the right shape, keep ONLY the two wrong-option keys. If
      // missing/malformed, drop to null — downstream falls back to the
      // legacy single misconception field. We don't reject the question
      // itself: partial coverage is better than partial loss of quizzes.
      const wrongOpts = ['A', 'B', 'C'].filter(k => k !== q.correct);
      const dm = q.distractor_misconceptions;
      const validShape =
        dm && typeof dm === 'object' && !Array.isArray(dm) &&
        wrongOpts.every(opt =>
          typeof dm[opt] === 'string' &&
          dm[opt].trim().length > 0 &&
          dm[opt].length <= 200
        );
      if (validShape) {
        q.distractor_misconceptions = {
          [wrongOpts[0]]: dm[wrongOpts[0]],
          [wrongOpts[1]]: dm[wrongOpts[1]]
        };
      } else {
        q.distractor_misconceptions = null;
      }
      return true;
    }).map(q => this._shuffleQuestionOptions(q));   // 
  }

  /**
   * shuffle the option positions for a single question. Pure
   * function (no mutation of input). Picks a uniformly random new slot
   * for the correct option; places the two wrong options in the
   * remaining slots in random order; updates option_a/_b/_c, correct,
   * and distractor_misconceptions keys accordingly.
   *
   * @param {Object} q   - validated question with option_a/_b/_c, correct, distractor_misconceptions
   * @param {Function=} rng - injectable RNG for determinism in tests; default Math.random
   * @returns {Object}      - new question with shuffled layout
   * @private
   */
  static _shuffleQuestionOptions(q, rng = Math.random) {
    const slots = ['A', 'B', 'C'];
    const texts = { A: q.option_a, B: q.option_b, C: q.option_c };
    const correctText = texts[q.correct];
    const wrongLetters = slots.filter(s => s !== q.correct);
    const wrongTexts = wrongLetters.map(s => texts[s]);
    const oldDM = q.distractor_misconceptions || null;
    const wrongMisconceptions = oldDM
      ? wrongLetters.map(s => oldDM[s])
      : [null, null];

    const newCorrect = slots[Math.floor(rng() * 3)];
    const remaining = slots.filter(s => s !== newCorrect);
    if (rng() < 0.5) remaining.reverse();

    const newTexts = { [newCorrect]: correctText };
    newTexts[remaining[0]] = wrongTexts[0];
    newTexts[remaining[1]] = wrongTexts[1];

    let newDM = null;
    if (oldDM && wrongMisconceptions[0] && wrongMisconceptions[1]) {
      newDM = {
        [remaining[0]]: wrongMisconceptions[0],
        [remaining[1]]: wrongMisconceptions[1]
      };
    }

    return {
      ...q,
      option_a: newTexts.A,
      option_b: newTexts.B,
      option_c: newTexts.C,
      correct: newCorrect,
      distractor_misconceptions: newDM
    };
  }

  /**
   * Store questions in DB.
   * @private
   */
  static async _storeQuestions(quizId, questions) {
    const rows = questions.map((q, index) => {
      // keep legacy misconception_feedback as a derived "best wrong-
      // option misconception" so old code paths (e.g. _sendFeedback when the
      // student gets it wrong) keep working without per-distractor lookups.
      const legacyFallback = q.distractor_misconceptions
        ? Object.values(q.distractor_misconceptions)[0]
        : (q.misconception || null);

      return {
        quiz_id: quizId,
        question_text: q.question,
        option_a: q.option_a,
        option_b: q.option_b,
        option_c: q.option_c,
        correct_option: q.correct,
        explanation: q.explanation || 'The correct answer has been selected.',
        misconception_feedback: legacyFallback,
        distractor_misconceptions: q.distractor_misconceptions || null,
        difficulty_level: q.difficulty,
        sort_order: index
      };
    });

    const { error } = await supabase.from('quiz_questions').insert(rows);
    if (error) throw new Error(`Failed to store questions: ${error.message}`);
  }
}

module.exports = QuizGenerationService;
