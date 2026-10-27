/**
 * Grading Service for Exam Checker
 * Grades each student's copied answers against the marking scheme with the
 * exam-vision engine (Call B — exam-vision.service.js), then applies the
 * board-specific scale and structured feedback.
 *
 * Created: 2026-01-24
 * Updated: 2026-01-25 (Board scales + Feed Up/Back/Forward)
 * Updated: 2026-10-19 (grades with the exam-vision engine)
 */

const supabase = require('../../config/supabase');
const { logToFile } = require('../../utils/logger');
const pLimit = require('p-limit');
const GradingScaleService = require('./grading-scale.service');
const FeedbackService = require('./feedback.service');
const examVision = require('./exam-vision.service');

const VERDICTS = ['correct', 'partial', 'wrong', 'cannot_grade'];

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
   * Grade a single student's submission: one Call B for all their questions.
   * @param {object} session - Exam session
   * @param {object} student - Student info (name, pageNumbers)
   * @param {object} markingScheme - Marking scheme ({ questions: [{ id, text, answer, marks }] })
   * @returns {object} Grading result
   */
  static async gradeStudent(session, student, markingScheme) {
    logToFile('📝 Grading student (exam-vision)', { student: student.name });

    const board = session.board || session.grading_scale || 'Generic';
    const language = session.language || 'en';
    const schemeQuestions = (markingScheme && markingScheme.questions) || [];

    // One item per scheme question: the student's copied answer, its box and
    // the page it sits on.
    const items = schemeQuestions.map((q) => {
      const found = this._findStudentAnswerAndBox(session, student, q.id);
      return {
        question_id: q.id,
        question_text: q.text || q.id,
        answer_text_verbatim: found.answer || '',
        box_2d: found.box_2d,
        pageNumber: found.pageNumber,
        script: found.script,
      };
    });

    const graded = await examVision.gradeAnswers(items, markingScheme, {
      grade: session.grade, subject: session.subject,
    });

    const gradedById = {};
    (graded.items || []).forEach((g) => { gradedById[g.question_id] = g; });
    const schemeById = {};
    schemeQuestions.forEach((q) => { schemeById[q.id] = q; });

    const questionResults = items.map((it) => {
      const g = gradedById[it.question_id] || {};
      const scheme = schemeById[it.question_id] || {};
      // The engine may ABSTAIN (cannot_grade) on a question that needs
      // information not on the page — audio, dictation, an unseen picture.
      // Such a question is worth 0/0: it must not count toward the total or be
      // shown as a wrong answer.
      const rawVerdict = VERDICTS.includes(g.verdict) ? g.verdict : null;
      const cannotGrade = rawVerdict === 'cannot_grade';
      const maxMarks = cannotGrade ? 0 : (typeof g.max_marks === 'number' ? g.max_marks : (scheme.marks || 1));
      const awarded = cannotGrade ? 0 : (typeof g.awarded_marks === 'number' ? Math.min(g.awarded_marks, maxMarks) : 0);
      const verdict = rawVerdict || (awarded >= maxMarks ? 'correct' : awarded > 0 ? 'partial' : 'wrong');
      const structuredFeedback = {
        feedUp: g.feedback_up || '',
        feedBack: g.feedback_back || '',
        feedForward: g.feedback_forward || '',
      };
      return {
        questionId: it.question_id,
        questionText: it.question_text,
        questionType: scheme.type || 'unknown',
        studentAnswer: it.answer_text_verbatim,
        expectedAnswer: g.expected_answer ?? null,
        marksAwarded: awarded,
        maxMarks,
        isCorrect: verdict === 'correct',
        isPartial: verdict === 'partial',
        cannotGrade,
        verdict,
        // The margin note is the actionable next step; the full feedback is kept structured.
        feedback: structuredFeedback.feedForward || structuredFeedback.feedBack || structuredFeedback.feedUp || '',
        structuredFeedback,
        confidence: g.confidence ?? 0.8,
        script: it.script || 'en',
        pageNumber: it.pageNumber,
        box_2d: it.box_2d || null,
        bbox: this._markPosition(it.box_2d),
      };
    });

    // Always sum the per-question marks — never trust the model's own
    // total_awarded / total_max, which can disagree with its per-question marks.
    // cannot_grade questions are 0/0, so they drop out of both sums.
    const totalMarks = questionResults.reduce((s, q) => s + (q.maxMarks || 0), 0);
    const marksAwarded = questionResults.reduce((s, q) => s + (q.marksAwarded || 0), 0);
    const cannotGradeCount = questionResults.filter(q => q.cannotGrade).length;
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
      cannotGradeCount,
      grade: gradeReport.grade,
      gradeReport, // Full grade details with GPA, division, etc.
      overallFeedback, // Feed Up/Back/Forward for whole exam
      board,
      gradedAt: new Date().toISOString()
    };
  }

  /**
   * Where the annotator draws a question's mark: the right edge of the answer
   * box, at its top, as 0-1 fractions of the page. box_2d is
   * [ymin, xmin, ymax, xmax] on a 0-1000 grid. Null without a box — the
   * annotator then falls back to its own layout.
   */
  static _markPosition(box2d) {
    if (!Array.isArray(box2d) || box2d.length !== 4 || !box2d.every(n => typeof n === 'number')) return null;
    const [ymin, , , xmax] = box2d;
    const clamp = (v) => Math.min(Math.max(v, 0), 1);
    return { x: clamp(xmax / 1000), y: clamp(ymin / 1000) };
  }

  /**
   * Find a student's copied answer, its box, script and page for a question.
   * Ids are compared loosely, so a scheme "Q1" matches a page "q1", "1" or "Q.1".
   * @returns {{answer: string, box_2d: number[]|null, script: string|undefined, pageNumber: number|undefined}}
   */
  static _findStudentAnswerAndBox(session, student, questionId) {
    const allPages = (session.ocr_results && session.ocr_results.pages) || [];
    const studentPages = (student.pageNumbers && student.pageNumbers.length > 0)
      ? student.pageNumbers
      : allPages.map(p => p.pageNumber);
    const want = this._normalizeQuestionId(questionId);

    for (const page of allPages) {
      if (!studentPages.includes(page.pageNumber)) continue;
      const q = (page.questions || []).find(qq =>
        this._normalizeQuestionId(qq.id) === want || this._normalizeQuestionId(qq.number) === want
      );
      if (q && (q.studentAnswer || q.box_2d)) {
        return {
          answer: q.studentAnswer || '',
          box_2d: Array.isArray(q.box_2d) ? q.box_2d : null,
          script: q.script,
          pageNumber: page.pageNumber,
        };
      }
    }
    return { answer: '', box_2d: null, script: undefined, pageNumber: undefined };
  }

  /** "Q1", "q1", "Q.1", "Question 1" and "1" all become "1". */
  static _normalizeQuestionId(value) {
    return String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '').replace(/^(question|q)(?=\d)/, '');
  }

  /**
   * A student's copied answer for a question.
   * @param {object} session - Session with detected data
   * @param {object} student - Student info
   * @param {string} questionId - Question ID
   * @returns {string} Student's answer
   */
  static _findStudentAnswer(session, student, questionId) {
    return this._findStudentAnswerAndBox(session, student, questionId).answer;
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
