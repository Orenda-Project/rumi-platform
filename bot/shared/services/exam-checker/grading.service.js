/**
 * Grading Service for Exam Checker
 * Uses GPT-4o to grade student answers against marking scheme
 * Enhanced with board-specific scales and structured feedback
 *
 * Created: 2026-01-24
 * Updated: 2026-01-25 (Board scales + Feed Up/Back/Forward)
 */

const { getClient } = require('../llm-client');
const supabase = require('../../config/supabase');
const { logToFile } = require('../../utils/logger');
const pLimit = require('p-limit');
const GradingScaleService = require('./grading-scale.service');
const FeedbackService = require('./feedback.service');

const openai = getClient();

// Grading system prompt
const GRADING_SYSTEM_PROMPT = `You are an expert exam grader. Grade the student's answer fairly and accurately.

You will receive:
1. The question
2. The correct answer / marking scheme
3. The student's answer
4. Maximum marks for this question

Provide your grading as JSON:
{
  "marksAwarded": number,
  "maxMarks": number,
  "feedback": "brief constructive feedback",
  "breakdown": [
    { "criterion": "criterion name", "marks": number, "comment": "why" }
  ],
  "confidence": 0.0-1.0
}

Grading guidelines:
- Be fair but strict
- Award partial marks where appropriate
- For MCQ/True-False: 0 or full marks only
- For math: Check working, not just final answer
- For essays: Consider content, structure, relevance
- Penalize off-topic or irrelevant content
- Be lenient with spelling if meaning is clear`;

class GradingService {
  /**
   * Grade a batch of student submissions
   * @param {object} session - Exam session with marking scheme
   * @param {object} options - { concurrency, onProgress }
   * @returns {object} { successful, failed, summary }
   */
  static async gradeBatch(session, options = {}) {
    const { concurrency = 5, onProgress } = options;
    const limit = pLimit(concurrency);

    const students = session.confirmed_students || [];
    const markingScheme = session.marking_scheme || { questions: [] };

    logToFile('📊 Starting batch grading', {
      sessionId: session.id,
      studentCount: students.length,
      questionCount: markingScheme.questions.length
    });

    const successful = [];
    const failed = [];
    let completed = 0;

    const tasks = students.map((student, index) =>
      limit(async () => {
        try {
          const result = await this.gradeStudent(session, student, markingScheme);
          successful.push(result);

          // Save to database
          await this._saveGrade(session, student, result);
        } catch (error) {
          logToFile('❌ Grading failed for student', {
            student: student.name,
            error: error.message
          });
          failed.push({ student, error: error.message });
        }

        completed++;
        if (onProgress) {
          onProgress({
            completed,
            total: students.length,
            percentage: Math.round((completed / students.length) * 100)
          });
        }
      })
    );

    await Promise.all(tasks);

    const summary = this._calculateSummary(successful);

    logToFile('✅ Batch grading complete', {
      sessionId: session.id,
      successful: successful.length,
      failed: failed.length,
      averageScore: summary.averagePercentage
    });

    return { successful, failed, summary };
  }

  /**
   * Grade a single student's submission
   * Enhanced with board-specific grades and structured feedback
   * @param {object} session - Exam session
   * @param {object} student - Student info with answers
   * @param {object} markingScheme - Marking scheme
   * @returns {object} Grading result
   */
  static async gradeStudent(session, student, markingScheme) {
    logToFile('📝 Grading student', { student: student.name });

    const questionResults = [];
    let totalMarks = 0;
    let marksAwarded = 0;
    const board = session.board || session.grading_scale || 'Generic';
    const language = session.language || 'en';

    for (const question of markingScheme.questions) {
      // Find student's answer for this question
      const studentAnswer = this._findStudentAnswer(session, student, question.id);

      const result = await this.gradeQuestion(question, studentAnswer);

      // Generate structured feedback for this question
      const feedback = FeedbackService.generate({
        question: question.text || question.id,
        learningObjective: question.learningObjective,
        studentAnswer,
        correctAnswer: question.answer,
        awarded: result.marksAwarded,
        maxMarks: result.maxMarks,
        language
      });

      questionResults.push({
        questionId: question.id,
        ...result,
        structuredFeedback: feedback
      });

      totalMarks += question.marks || 0;
      marksAwarded += result.marksAwarded || 0;
    }

    const percentage = totalMarks > 0 ? Math.round((marksAwarded / totalMarks) * 100) : 0;

    // Get board-specific grade
    const gradeReport = GradingScaleService.getFullReport(percentage, board);

    // Generate overall structured feedback
    const overallFeedback = FeedbackService.generateOverall(questionResults, language);

    return {
      student,
      questionResults,
      totalMarks,
      marksAwarded,
      percentage,
      grade: gradeReport.grade,
      gradeReport, // Full grade details with GPA, division, etc.
      overallFeedback, // Feed Up/Back/Forward for whole exam
      board,
      gradedAt: new Date().toISOString()
    };
  }

  /**
   * Grade a single question
   * @param {object} question - Question with correct answer
   * @param {string} studentAnswer - Student's answer
   * @returns {object} Grading result
   */
  static async gradeQuestion(question, studentAnswer) {
    // Handle empty answers
    if (!studentAnswer || studentAnswer.trim() === '') {
      return {
        marksAwarded: 0,
        maxMarks: question.marks || 1,
        feedback: 'No answer provided',
        breakdown: [],
        confidence: 1.0
      };
    }

    // For MCQ and True/False, do simple matching
    if (question.type === 'mcq' || question.type === 'true_false') {
      const isCorrect = this._checkExactMatch(question.answer, studentAnswer);
      return {
        marksAwarded: isCorrect ? (question.marks || 1) : 0,
        maxMarks: question.marks || 1,
        feedback: isCorrect ? 'Correct!' : `Incorrect. The answer is ${question.answer}`,
        breakdown: [],
        confidence: 1.0
      };
    }

    // For other types, use GPT-4o
    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: GRADING_SYSTEM_PROMPT },
          {
            role: 'user',
            content: `Grade this answer:

Question (${question.type}, ${question.marks} marks): ${question.text || question.id}

Correct Answer/Rubric: ${question.answer || question.rubric || 'Use your judgment'}

Student's Answer: ${studentAnswer}

Maximum Marks: ${question.marks || 1}`
          }
        ],
        max_tokens: 500,
        temperature: 0.3,
        response_format: { type: 'json_object' }
      });

      const content = response.choices[0]?.message?.content;
      const result = JSON.parse(content);

      // Validate marks don't exceed max
      result.marksAwarded = Math.min(result.marksAwarded || 0, question.marks || 1);
      result.maxMarks = question.marks || 1;

      return result;
    } catch (error) {
      logToFile('⚠️ GPT grading failed, using fallback', { error: error.message });

      // Fallback: keyword matching
      return this._fallbackGrading(question, studentAnswer);
    }
  }

  /**
   * Check exact match for MCQ/True-False
   * @param {string} correct - Correct answer
   * @param {string} student - Student answer
   * @returns {boolean}
   */
  static _checkExactMatch(correct, student) {
    if (!correct || !student) return false;

    const normalize = (s) => s.toString().toLowerCase().trim()
      .replace(/[^a-z0-9]/g, '');

    return normalize(correct) === normalize(student);
  }

  /**
   * Fallback grading using keyword matching
   * @param {object} question - Question
   * @param {string} studentAnswer - Answer
   * @returns {object} Grading result
   */
  static _fallbackGrading(question, studentAnswer) {
    const maxMarks = question.marks || 1;
    const correctAnswer = question.answer || '';

    // Simple keyword matching
    const correctWords = new Set(
      correctAnswer.toLowerCase().split(/\s+/).filter(w => w.length > 3)
    );
    const studentWords = new Set(
      studentAnswer.toLowerCase().split(/\s+/).filter(w => w.length > 3)
    );

    let matches = 0;
    for (const word of studentWords) {
      if (correctWords.has(word)) matches++;
    }

    const matchRatio = correctWords.size > 0 ? matches / correctWords.size : 0;
    const marksAwarded = Math.round(matchRatio * maxMarks);

    return {
      marksAwarded,
      maxMarks,
      feedback: `Partial credit based on keyword matching (${Math.round(matchRatio * 100)}% match)`,
      breakdown: [],
      confidence: 0.5
    };
  }

  /**
   * Find student's answer for a question
   * @param {object} session - Session with detected data
   * @param {object} student - Student info
   * @param {string} questionId - Question ID
   * @returns {string} Student's answer
   */
  static _findStudentAnswer(session, student, questionId) {
    // Look in detected questions from the student's pages
    const studentPages = student.pageNumbers || [];
    const ocrResults = session.ocr_results || { pages: [] };

    for (const page of ocrResults.pages) {
      if (!studentPages.includes(page.pageNumber)) continue;

      const question = page.questions?.find(q =>
        q.number?.toString() === questionId.replace('Q', '') ||
        q.id === questionId
      );

      if (question?.studentAnswer) {
        return question.studentAnswer;
      }
    }

    return '';
  }

  /**
   * Calculate letter grade from marks
   * Now uses GradingScaleService for board-specific grades
   * @param {number} marks - Marks awarded
   * @param {number} total - Total marks
   * @param {string} board - Board name (optional)
   * @returns {string} Letter grade
   */
  static _calculateGrade(marks, total, board = 'Generic') {
    if (total === 0) return 'N/A';
    const percentage = (marks / total) * 100;

    // Use board-specific scale if available
    return GradingScaleService.convert(percentage, board);
  }

  /**
   * Calculate summary statistics
   * @param {Array} results - Successful grading results
   * @returns {object} Summary
   */
  static _calculateSummary(results) {
    if (results.length === 0) {
      return { averagePercentage: 0, highestScore: 0, lowestScore: 0, gradeDistribution: {} };
    }

    const percentages = results.map(r => r.percentage);
    const gradeDistribution = {};

    for (const r of results) {
      gradeDistribution[r.grade] = (gradeDistribution[r.grade] || 0) + 1;
    }

    return {
      averagePercentage: Math.round(percentages.reduce((a, b) => a + b, 0) / percentages.length),
      highestScore: Math.max(...percentages),
      lowestScore: Math.min(...percentages),
      gradeDistribution
    };
  }

  /**
   * Save a graded submission to the database.
   *
   * The schema is normalised across two tables:
   *   - `exam_submissions` — one row per (session, student): image references,
   *     extracted text, status. The summary view (total marks / percentage)
   *     is computed at read time, not stored here.
   *   - `exam_grades` — one row per (submission, question): awarded marks,
   *     rationale, structured Feed Up/Back/Forward. Unique-indexed on
   *     `(submission_id, question_id)` so re-grading is idempotent.
   *
   * Before this fix, `_saveGrade()` upserted a per-STUDENT summary row into
   * `exam_grades` with columns (`session_id`, `student_name`, `total_marks`,
   * `marks_obtained`, `percentage`, `grade`, `question_breakdown`,
   * `graded_at`) — none of which exist in the schema. Every grading run
   * silently failed to persist.
   *
   * @param {object} session - Exam session (read for image_urls + ocr_results)
   * @param {object} student - Student info (name, rollNumber, pageNumbers)
   * @param {object} result  - Grading result from `gradeStudent()`
   */
  static async _saveGrade(session, student, result) {
    const sessionId = session.id;
    const studentPages = student.pageNumbers || [];

    // Slice the per-student image set out of the session-level array. Page
    // numbers are 1-indexed in the OCR layer; convert to 0-indexed for array
    // lookup. Empty array when pageNumbers is missing — image_urls is NOT
    // NULL on exam_submissions so we provide [] not null.
    const allImages = session.original_images || [];
    const studentImageUrls = studentPages.length > 0
      ? studentPages.map(p => allImages[p - 1]).filter(Boolean)
      : [];

    // 1) Upsert the exam_submissions row. The schema has no unique
    //    constraint on (session_id, student_name) so we look it up
    //    explicitly and update-or-insert.
    const { data: existing, error: lookupError } = await supabase
      .from('exam_submissions')
      .select('id')
      .eq('session_id', sessionId)
      .eq('student_name', student.name)
      .maybeSingle();

    if (lookupError) {
      logToFile('⚠️ Failed to look up exam submission', {
        sessionId, studentName: student.name, error: lookupError.message,
      });
      return;
    }

    let submissionId;
    if (existing) {
      submissionId = existing.id;
      const { error: updateError } = await supabase
        .from('exam_submissions')
        .update({
          image_urls: studentImageUrls,
          page_numbers: studentPages,
          extracted_answers: { questionResults: result.questionResults },
          status: 'graded',
        })
        .eq('id', submissionId);
      if (updateError) {
        logToFile('⚠️ Failed to update exam submission', {
          submissionId, error: updateError.message,
        });
        return;
      }
    } else {
      const { data: newSubmission, error: insertError } = await supabase
        .from('exam_submissions')
        .insert({
          session_id: sessionId,
          student_name: student.name,
          image_urls: studentImageUrls,
          page_numbers: studentPages,
          extracted_answers: { questionResults: result.questionResults },
          status: 'graded',
        })
        .select('id')
        .single();
      if (insertError || !newSubmission) {
        logToFile('⚠️ Failed to insert exam submission', {
          sessionId, studentName: student.name,
          error: insertError ? insertError.message : 'no row returned',
        });
        return;
      }
      submissionId = newSubmission.id;
    }

    // 2) Upsert per-question grade rows. The (submission_id, question_id)
    //    unique index makes re-grading idempotent — a second run replaces
    //    prior grades rather than duplicating them.
    const gradeRows = result.questionResults.map((qr) => {
      const max = qr.maxMarks ?? 0;
      const awarded = qr.marksAwarded ?? 0;
      const isCorrect = max > 0 ? awarded >= max : null;
      const isPartial = max > 0 ? awarded > 0 && awarded < max : false;
      return {
        submission_id: submissionId,
        question_id: qr.questionId,
        question_type: qr.questionType || 'unknown',
        max_marks: max,
        awarded_marks: awarded,
        is_correct: isCorrect,
        is_partial: isPartial,
        grading_rationale: qr.feedback || null,
        confidence: qr.confidence ?? null,
        feedback_up: qr.structuredFeedback?.feedUp || null,
        feedback_back: qr.structuredFeedback?.feedBack || null,
        feedback_forward: qr.structuredFeedback?.feedForward || null,
      };
    });

    if (gradeRows.length === 0) return;

    const { error: gradesError } = await supabase
      .from('exam_grades')
      .upsert(gradeRows, { onConflict: 'submission_id,question_id' });

    if (gradesError) {
      logToFile('⚠️ Failed to upsert exam_grades rows', {
        submissionId, count: gradeRows.length, error: gradesError.message,
      });
    }
  }
}

module.exports = GradingService;
