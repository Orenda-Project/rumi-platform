'use strict';
// QuizReportService — generate and send quiz results report to teacher
// PDF rendering via shared/templates/quiz-report.template.js + html-to-pdf
// (existing Puppeteer engine; Playwright migration swaps transparently)

const fs = require('fs');
const path = require('path');
const os = require('os');
const { logToFile } = require('../../utils/logger');
const supabase = require('../../config/supabase');
const WhatsAppService = require('../whatsapp.service');
const { htmlToPdf } = require('../../utils/html-to-pdf');
const renderQuizReportHtml = require('../../templates/quiz-report.template');
const { uploadReportPDF } = require('../../storage/r2');

class QuizReportService {
  /**
   * Generate and send quiz report to teacher.
   * Called by scheduler.worker.js at 12-hour mark.
   *
   * @param {string} quizId       - Quiz UUID
   * @param {Object} payload      - { teacherPhone, language }
   */
  static async generateReport(quizId, payload = {}) {
    logToFile('📊 QuizReportService.generateReport', { quizId });

    const { teacherPhone, language = 'en' } = payload;

    // Fetch quiz with class + teacher metadata
    const { data: quiz, error: quizErr } = await supabase
      .from('quizzes')
      .select('id, teacher_id, list_id, topic, grade, subject, created_at, total_students_sent, status')
      .eq('id', quizId)
      .single();

    if (quizErr || !quiz) {
      logToFile('❌ Quiz not found for report', { quizId });
      return;
    }

    // Fetch completed sessions
    const { data: sessions } = await supabase
      .from('quiz_sessions')
      .select('id, student_id, status, total_questions_answered, correct_answers, mastery_percentage, mastery_level, completed_at, students(student_name)')
      .eq('quiz_id', quizId);

    const completed = (sessions || []).filter(s => s.status === 'completed');
    // derive totalSent from session count, not the drift-prone column
    const totalSent = (sessions || []).length;
    const totalCompleted = completed.length;

    const stats = this._aggregateStats(completed);

    if (!teacherPhone) {
      logToFile('⚠️ No teacher phone for report', { quizId });
      return;
    }

    // Resolve class display + teacher name for the PDF header
    let classDisplay = '';
    if (quiz.list_id) {
      const { data: classRow } = await supabase
        .from('student_lists')
        .select('class_name, section')
        .eq('id', quiz.list_id)
        .single();
      if (classRow) {
        classDisplay = classRow.section ? `${classRow.class_name} - ${classRow.section}` : classRow.class_name;
      }
    }
    let teacherName = '';
    try {
      const noPlus = teacherPhone.startsWith('+') ? teacherPhone.slice(1) : teacherPhone;
      const { data: teacher } = await supabase
        .from('users')
        .select('first_name, last_name')
        .eq('phone_number', noPlus)
        .single();
      teacherName = teacher?.first_name || '';
    } catch (_) { /* non-fatal */ }

    // build the structured insight (band classifier + cluster
    // surfacing + band-specific buttons). No LLM in the hot path.
    const QuizInsightService = require('./quiz-insight.service');
    const topMissed = await this._buildTopMissedQuestions(quizId).catch(() => []);
    const stragglerNames = await QuizInsightService.loadStragglerNames(quizId);

    // every question with full options + per-option pick counts.
    // The teacher has otherwise never seen the questions — they triggered
    // /quiz from WhatsApp, the bot generated + delivered, students answered.
    // The PDF is the only audit-trail surface.
    const allQuestions = await this._buildAllQuestions(quizId).catch(() => []);

    const insight = QuizInsightService.buildInsight({
      quiz,
      classDisplay,
      totalSent,
      totalCompleted,
      stats,
      topMissed,
      stragglerNames
    });

    // Render + upload PDF
    let pdfUrl = null;
    try {
      const html = renderQuizReportHtml({
        quiz,
        classDisplay,
        teacherName,
        totalSent,
        totalCompleted,
        stats,
        sessions: completed,
        topMissed,
        allQuestions,                     //  full MCQ list
        insight: insight.body,            //  structured body, not LLM blob
        language
      });

      const pdfBuffer = await htmlToPdf(html, {
        timeout: 30000,
        pdfOptions: {
          format: 'A4',
          printBackground: true,
          margin: { top: '0', right: '0', bottom: '0', left: '0' }
        }
      });

      pdfUrl = await uploadReportPDF(pdfBuffer, quiz.teacher_id, quizId);

      // Bundle delivery — PDF caption carries the headline + portal
      // link; insight body + buttons follow ~2s later. No drip-fed "see more
      // in your portal" message.
      const tempPath = path.join(os.tmpdir(), `quiz-report-${quizId}.pdf`);
      fs.writeFileSync(tempPath, pdfBuffer);
      try {
        const filename = `Quiz_${(quiz.topic || 'report').replace(/[^a-z0-9]+/gi, '_')}.pdf`;
        // Append the portal trends link only when PORTAL_URL is configured.
        const portalBase = require('../../config/branding').portalUrl();
        const portalLink = portalBase
          ? '\n\n📊 Open it in your portal for trends across classes:\n' +
            `${portalBase.replace(/^https?:\/\//, '')}/quizzes\n` +
            '🔐 Same login as before.'
          : '';
        await WhatsAppService.sendDocument(
          teacherPhone,
          tempPath,
          filename,
          insight.caption + portalLink
        );
      } finally {
        try { fs.unlinkSync(tempPath); } catch (_) {}
      }

      logToFile('✅ Quiz report PDF sent', { quizId, pdfUrl, band: insight.band });
    } catch (pdfErr) {
      // Fail-safe: if the PDF pipeline breaks, still deliver the text summary
      logToFile('❌ PDF generation failed — falling back to text summary', { quizId, error: pdfErr.message });
      const reportText = this._buildReportText(quiz, totalSent, totalCompleted, completed, stats);
      await WhatsAppService.sendMessage(teacherPhone, reportText);
    }

    // Single follow-up message — insight body + band-specific
    // buttons. No third "want to see more in the portal?" nudge.
    if (totalCompleted > 0 && insight.body) {
      await new Promise(r => setTimeout(r, 2000));
      await WhatsAppService.sendInteractiveButtons(teacherPhone, {
        body: insight.body,
        buttons: insight.buttons
      });
    }

    // Update quiz status
    await supabase
      .from('quizzes')
      .update({
        status: 'report_sent',
        total_students_completed: totalCompleted,
        report_sent_at: new Date().toISOString(),
        report_pdf_url: pdfUrl
      })
      .eq('id', quizId);

    logToFile('✅ Quiz report flow complete', { quizId, totalCompleted, pdfUrl, band: insight.band });
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  static _aggregateStats(sessions) {
    if (!sessions || sessions.length === 0) {
      return { avgScore: 0, masteredCount: 0, developingCount: 0, needsPracticeCount: 0 };
    }

    const total = sessions.length;
    const avgScore = sessions.reduce((sum, s) => sum + (s.mastery_percentage || 0), 0) / total;
    const masteredCount = sessions.filter(s => s.mastery_level === 'mastered').length;
    const developingCount = sessions.filter(s => s.mastery_level === 'developing').length;
    const needsPracticeCount = sessions.filter(s => s.mastery_level === 'needs_practice').length;

    return { avgScore: Math.round(avgScore), masteredCount, developingCount, needsPracticeCount };
  }

  static _buildReportText(quiz, totalSent, totalCompleted, sessions, stats) {
    const dateStr = new Date().toLocaleDateString('en-PK', { day: 'numeric', month: 'short' });
    const pending = totalSent - totalCompleted;

    let text = `📊 *Quiz Report: ${quiz.topic}*\n`;
    text += `${quiz.grade || ''} | ${dateStr}\n`;
    text += `─────────────────\n\n`;

    text += `📈 *Results Summary*\n`;
    text += `• Total students: ${totalSent}\n`;
    text += `• Completed: ${totalCompleted}\n`;
    if (pending > 0) text += `• Pending: ${pending}\n`;
    text += `• Average score: ${stats.avgScore}%\n\n`;

    text += `🎯 *Mastery Distribution*\n`;
    text += `• ✅ Mastered (80%+): ${stats.masteredCount}\n`;
    text += `• 📈 Developing (60-79%): ${stats.developingCount}\n`;
    text += `• 📚 Needs Practice (<60%): ${stats.needsPracticeCount}\n\n`;

    if (sessions.length > 0) {
      text += `👤 *Student Results*\n`;
      for (const s of sessions) {
        const name = s.students?.student_name || 'Unknown';
        const score = s.correct_answers || 0;
        const total = s.total_questions_answered || 0;
        const pct = total > 0 ? Math.round((score / total) * 100) : 0;
        const emoji = pct >= 80 ? '✅' : pct >= 60 ? '📈' : '📚';
        text += `${emoji} ${name}: ${score}/${total} (${pct}%)\n`;
      }
    }

    if (pending > 0) {
      text += `\n⏳ ${pending} student${pending > 1 ? 's have' : ' has'} not completed yet.`;
    }

    return text;
  }

  static async _generateInsight(quiz, stats, language) {
    const body = await this._generateInsightBody(quiz, stats, language);
    return body ? `💡 *Teaching Insight*\n\n${body}` : null;
  }

  /**
   * Insight body without the chat-format prefix, so the PDF and the
   * follow-up WhatsApp message can share one generation.
   */
  static async _generateInsightBody(quiz, stats, language) {
    try {
      const OpenAI = require('openai');
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

      const prompt = `A teacher in Pakistan just received quiz results on "${quiz.topic}" (${quiz.grade || 'primary school'}).

Results: Average score ${stats.avgScore}%, ${stats.masteredCount} mastered, ${stats.needsPracticeCount} need practice.

Give ONE specific, actionable teaching tip based on these results. Keep it under 2 sentences. Be encouraging.`;

      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 150
      });
      return response.choices[0].message.content;
    } catch (err) {
      logToFile('⚠️ Error generating quiz insight', { error: err.message });
      return null;
    }
  }

  /**
   * Top 3 most-missed questions in this quiz with
   * distractor cluster surfacing.
   *
   * Output per question (when there's a clear wrong-option cluster):
   *   {
   *     question_text, correct_option, correct_text,
   *     total, correct_count, wrong_count,
   *     top_wrong_option, top_wrong_text, top_wrong_count,
   *     misconception_feedback,    // from distractor_misconceptions[topWrong]
   *                                // OR fallback per-question misconception_feedback
   *     misconception_source,      // 'distractor' | 'question' (drives PDF phrasing)
   *     miss_rate
   *   }
   *
   * "Cluster" = ≥ 50% of wrong picks landed on one option. Otherwise
   * top_wrong_option is null and the report renders the simpler "split"
   * line.
   */
  static async _buildTopMissedQuestions(quizId) {
    const { data: sessionIds } = await supabase
      .from('quiz_sessions')
      .select('id')
      .eq('quiz_id', quizId)
      .eq('status', 'completed');
    if (!sessionIds?.length) return [];

    const { data: answers } = await supabase
      .from('quiz_answers')
      .select(`
        question_id,
        selected_option,
        is_correct,
        quiz_questions (
          question_text,
          option_a, option_b, option_c,
          correct_option,
          misconception_feedback,
          distractor_misconceptions
        )
      `)
      .in('session_id', sessionIds.map(s => s.id));

    if (!answers || answers.length === 0) return [];

    const byQ = {};
    for (const a of answers) {
      const q = a.quiz_questions;
      if (!q) continue;
      const qid = a.question_id;
      if (!byQ[qid]) byQ[qid] = {
        question_text: q.question_text || '',
        correct_option: q.correct_option,
        options: { A: q.option_a, B: q.option_b, C: q.option_c },
        misconception_feedback: q.misconception_feedback,
        distractor_misconceptions: q.distractor_misconceptions || null,
        total: 0,
        correct: 0,
        pickCounts: { A: 0, B: 0, C: 0 }
      };
      byQ[qid].total += 1;
      byQ[qid].pickCounts[a.selected_option] = (byQ[qid].pickCounts[a.selected_option] || 0) + 1;
      if (a.is_correct) byQ[qid].correct += 1;
    }

    return Object.values(byQ)
      .filter(q => q.total >= 1 && q.correct < q.total && q.question_text)
      .map(q => {
        const wrongTotal = q.total - q.correct;
        const wrongPicks = Object.entries(q.pickCounts)
          .filter(([opt]) => opt !== q.correct_option)
          .sort(([, a], [, b]) => b - a);
        const [topWrongOpt, topWrongCount] = wrongPicks[0] || [null, 0];
        const isCluster = wrongTotal > 0 && (topWrongCount / wrongTotal) >= 0.5;

        // prefer per-distractor misconception when the
        // clustered question has it; fall back to legacy per-question
        // misconception_feedback. The 'misconception_source' tag drives
        // PDF phrasing (confident vs cautious).
        let misconception = null;
        let source = null;
        if (isCluster && q.distractor_misconceptions && q.distractor_misconceptions[topWrongOpt]) {
          misconception = q.distractor_misconceptions[topWrongOpt];
          source = 'distractor';
        } else if (isCluster && q.misconception_feedback) {
          misconception = q.misconception_feedback;
          source = 'question';
        }

        return {
          question_text: q.question_text,
          correct_option: q.correct_option,
          correct_text: q.options[q.correct_option] || q.correct_option,
          total: q.total,
          correct_count: q.correct,
          wrong_count: wrongTotal,
          top_wrong_option: isCluster ? topWrongOpt : null,
          top_wrong_text: isCluster ? (q.options[topWrongOpt] || topWrongOpt) : null,
          top_wrong_count: isCluster ? topWrongCount : 0,
          misconception_feedback: misconception,
          misconception_source: source,
          miss_rate: q.total > 0 ? 1 - q.correct / q.total : 0
        };
      })
      .sort((a, b) => b.miss_rate - a.miss_rate)
      .slice(0, 3);
  }

  /**
   * All questions in this quiz with full MCQ + per-option pick
   * counts. Sibling of _buildTopMissedQuestions but keeps every question
   * (in sort_order) so the teacher can audit what was actually asked.
   *
   * Output per question:
   *   {
   *     sort_order, question_text, correct_option,
   *     options: { A, B, C },
   *     pick_counts: { A, B, C },
   *     correct_count, total_attempted,
   *     percent_correct  // null when no one attempted
   *   }
   */
  static async _buildAllQuestions(quizId) {
    const { data: questions } = await supabase
      .from('quiz_questions')
      .select('id, question_text, option_a, option_b, option_c, correct_option, sort_order')
      .eq('quiz_id', quizId)
      .order('sort_order', { ascending: true });
    if (!questions || questions.length === 0) return [];

    const { data: sessionIds } = await supabase
      .from('quiz_sessions')
      .select('id')
      .eq('quiz_id', quizId)
      .eq('status', 'completed');
    const ids = (sessionIds || []).map(s => s.id);

    let answers = [];
    if (ids.length > 0) {
      const res = await supabase
        .from('quiz_answers')
        .select('question_id, selected_option, is_correct')
        .in('session_id', ids);
      answers = res.data || [];
    }

    const byQ = {};
    for (const a of answers) {
      if (!byQ[a.question_id]) byQ[a.question_id] = { picks: { A: 0, B: 0, C: 0 }, correct: 0, total: 0 };
      const opt = a.selected_option;
      if (opt === 'A' || opt === 'B' || opt === 'C') byQ[a.question_id].picks[opt] += 1;
      byQ[a.question_id].total += 1;
      if (a.is_correct) byQ[a.question_id].correct += 1;
    }

    return questions
      .map((q, i) => {
        const stats = byQ[q.id] || { picks: { A: 0, B: 0, C: 0 }, correct: 0, total: 0 };
        return {
          // display_index is the 1-based array position used by
          // both PDF + portal renderers. sort_order kept on the object only
          // for any consumer that wants the underlying DB ordering key —
          // never used for "Question N." display numbering, since
          // sort_order is 0-indexed in the DB and would collide with the
          // first-row fallback when treated falsy.
          display_index: i + 1,
          sort_order: q.sort_order != null ? q.sort_order : i,
          question_text: q.question_text || '',
          correct_option: q.correct_option,
          options: { A: q.option_a, B: q.option_b, C: q.option_c },
          pick_counts: stats.picks,
          correct_count: stats.correct,
          total_attempted: stats.total,
          percent_correct: stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : null
        };
      })
      // drop pool questions that no student ever saw — pure
      // noise in the teacher-facing All Questions section.
      .filter(q => q.total_attempted > 0)
      // Re-number display_index after filter so the visible list is 1, 2, 3, …
      .map((q, i) => ({ ...q, display_index: i + 1 }));
  }
}

module.exports = QuizReportService;
