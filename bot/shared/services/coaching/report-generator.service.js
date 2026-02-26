/**
 * Report Generator Service
 * Handles comprehensive observation report generation and delivery
 *
 * Responsibilities:
 * - Enhance analysis with teacher reflections
 * - Generate Gamma report with visualizations
 * - Generate and send PDF report
 * - Generate voice debrief (optional)
 * - Calculate total costs
 * - Record quality metrics
 * - Handle report generation errors with notifications
 *
 * Extracted from coaching.service.js as part of Phase 3 refactoring
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const supabase = require('../../config/supabase');
const { logToFile } = require('../../utils/logger');
const GPT5MiniService = require('../gpt5-mini.service');
const ContentService = require('../content.service');
const AudioService = require('../audio.service');
const WhatsAppService = require('../whatsapp.service');
const CoachingSessionService = require('./coaching-session.service');
const CoachingHelpersService = require('./coaching-helpers.service');
const PDFReportService = require('../pdf-report.service');
const FeatureLinkerService = require('../feature-linker.service');
const { uploadVoiceDebrief, uploadReportPDF } = require('../../storage/r2');
const { TEMP_DIR } = require('../../utils/constants');
const {
  CLASSROOM_MARKS_BASE,
  CLASSROOM_MARKS_WITH_LP
} = require('../../constants/scoring.constants');

class ReportGeneratorService {
  /**
   * Generate comprehensive observation report (called by background worker)
   * @param {string} coachingSessionId - Coaching session UUID
   * @param {object} payload - Job payload (may include partial, autoCompleted, userRequestedEarly flags)
   * @returns {Promise<void>}
   */
  static async generateReport(coachingSessionId, payload) {
    try {
      // Bug #9: Check for partial report flags
      const isPartialReport = payload.partial || false;
      const isAutoCompleted = payload.autoCompleted || false;
      const isUserRequestedEarly = payload.userRequestedEarly || false;

      logToFile('🔄 Starting report generation', {
        coachingSessionId,
        isPartialReport,
        isAutoCompleted,
        isUserRequestedEarly
      });

      // Get complete session data
      const { data: session, error: sessionError } = await supabase
        .from('coaching_sessions')
        .select('*, users!inner(phone_number, first_name, last_name)')
        .eq('id', coachingSessionId)
        .single();

      if (sessionError || !session) {
        logToFile('❌ Session query error', { sessionError, coachingSessionId });
        throw new Error('Coaching session not found');
      }

      const from = payload.from || session.users.phone_number;
      const teacherName = `${session.users.first_name} ${session.users.last_name}`.trim();
      const isRetry = payload.attempt && payload.attempt > 1;

      // Store partial report flags in session for PDF generation
      session._isPartialReport = isPartialReport;
      session._isAutoCompleted = isAutoCompleted;
      session._isUserRequestedEarly = isUserRequestedEarly;
      session._questionsAtCompletion = session.conversation_state?.questions_at_completion ||
        session.conversation_state?.questions_answered || 0;

      // Send progress update (only on first attempt)
      if (!isRetry) {
        await WhatsAppService.sendMessage(from, "🔄 Step 4/5: Generating your comprehensive observation report with visualizations...");
      }

      // Enhance analysis with teacher reflections
      const enhancedAnalysis = await this.enhanceAnalysisWithReflections(session);

      // Always infer lesson topic and subject from transcript (even if they exist in analysis)
      // This ensures topic and subject are always populated from actual lesson content
      const inferredTopic = await GPT5MiniService.inferLessonTopic(
        session.transcript_text,
        session.lesson_plan_excerpt
      );

      const inferredSubject = await GPT5MiniService.inferLessonSubject(
        session.transcript_text,
        session.lesson_plan_excerpt
      );

      let updated = false;

      if (inferredTopic && inferredTopic !== 'N/A') {
        enhancedAnalysis.topic = inferredTopic;
        logToFile('Lesson topic inferred from transcript', { topic: inferredTopic });
        updated = true;
      }

      if (inferredSubject && inferredSubject !== 'N/A') {
        enhancedAnalysis.subject = inferredSubject;
        logToFile('Lesson subject inferred from transcript', { subject: inferredSubject });
        updated = true;
      }

      // Update database with inferred topic and subject
      if (updated) {
        await supabase
          .from('coaching_sessions')
          .update({
            analysis_data: enhancedAnalysis
          })
          .eq('id', coachingSessionId);
      }

      // Generate PDF report directly using wkhtmltopdf
      const pdfBuffer = await this.generatePDFReport(session, teacherName, enhancedAnalysis);

      // Upload PDF to R2 for portal access
      let reportPdfUrl = null;
      try {
        reportPdfUrl = await uploadReportPDF(pdfBuffer, session.user_id, coachingSessionId);
        logToFile('✅ Report PDF uploaded to R2', { reportPdfUrl });

        // Store PDF URL in database
        await supabase
          .from('coaching_sessions')
          .update({ report_pdf_url: reportPdfUrl })
          .eq('id', coachingSessionId);
        logToFile('✅ Report PDF URL stored in database');
      } catch (error) {
        logToFile('⚠️ Failed to upload report PDF to R2', { error: error.message });
        // Don't fail entire process if R2 upload fails
      }

      // Send PDF immediately with proper filename
      await this.sendPDFReport(from, coachingSessionId, pdfBuffer, session.users.first_name, session.created_at);

      // Generate and send voice debrief (optional, won't fail entire process)
      if (!isRetry) {
        await this.generateAndSendVoiceDebrief(session, from, coachingSessionId, enhancedAnalysis);
      }

      // Mark session as completed
      await this.completeSession(session, coachingSessionId);

      logToFile('✅ Report generation complete', { coachingSessionId });

      // Suggest next feature after coaching completion
      try {
        const language = session.users?.preferred_language || session.transcript_language || 'en';
        await FeatureLinkerService.suggestNext(
          'coaching',
          session.user_id,
          from,
          language,
          { coachingSessionId }
        );
      } catch (error) {
        logToFile('⚠️ Error in feature linker after coaching', { error: error.message });
      }
    } catch (error) {
      await this.handleReportError(coachingSessionId, error, payload.from);
      throw error;
    }
  }

  /**
   * Enhance analysis with teacher reflections
   * @param {object} session - Session data
   * @returns {Promise<object>} Enhanced analysis
   * @private
   */
  static async enhanceAnalysisWithReflections(session) {
    logToFile('🔍 Starting reflection enhancement', {
      coachingSessionId: session.id,
      hasQuestions: !!session.conversation_state?.questions,
      questionCount: session.conversation_state?.questions?.length || 0,
      answeredQuestionCount: session.conversation_state?.questions?.filter(q => q.answer).length || 0
    });

    const enhancedAnalysis = await GPT5MiniService.enhanceAnalysisWithReflections(
      session.analysis_data,
      session.transcript_text,
      session.conversation_state,
      {
        duration: session.audio_duration_seconds
      },
      session.user_id,  // Pass userId to enable prior sessions check
      session.id        // Pass currentSessionId to exclude from prior check
    );

    // Validate that debrief_reflection was generated
    if (!enhancedAnalysis.debrief_reflection) {
      logToFile('⚠️  WARNING: Debrief reflection not generated', {
        coachingSessionId: session.id,
        enhancedAnalysisKeys: Object.keys(enhancedAnalysis),
        questionsAnswered: session.conversation_state?.questions?.filter(q => q.answer).length || 0,
        rawEnhancedAnalysisPreview: JSON.stringify(enhancedAnalysis).substring(0, 500)
      });
    } else {
      logToFile('✅ Debrief reflection generated successfully', {
        coachingSessionId: session.id,
        criteriaCount: Object.keys(enhancedAnalysis.debrief_reflection).length
      });
    }

    // Update database with enhanced analysis
    await supabase
      .from('coaching_sessions')
      .update({
        analysis_data: enhancedAnalysis
      })
      .eq('id', session.id);

    logToFile('Analysis enhanced and saved', { coachingSessionId: session.id });

    return enhancedAnalysis;
  }

  /**
   * Fetch and compress prior coaching feedback for the teacher
   * Implements context compression: 1-3 sessions verbatim, 4+ sessions summarized
   * @param {string} userId - User ID
   * @param {string} currentSessionId - Current session ID (to exclude)
   * @returns {Promise<object>} Prior feedback data with compression
   * @private
   */
  static async fetchAndCompressPriorFeedback(userId, currentSessionId) {
    try {
      logToFile('Fetching prior coaching sessions with compression', { userId, currentSessionId });

      const { data: priorSessions, error } = await supabase
        .from('coaching_sessions')
        .select('id, created_at, analysis_data')
        .eq('user_id', userId)
        .eq('status', 'completed')
        .neq('id', currentSessionId)
        .order('created_at', { ascending: false });

      if (error || !priorSessions || priorSessions.length === 0) {
        logToFile('No prior coaching sessions found', { userId });
        return {
          exists: false,
          summary: null,
          sessionCount: 0
        };
      }

      logToFile(`Found ${priorSessions.length} prior session(s)`, { userId });

      // If 1-3 sessions, include all verbatim with dates
      if (priorSessions.length <= 3) {
        const verbatimSessions = priorSessions.map(s => ({
          date: new Date(s.created_at).toLocaleDateString('en-US', {
            month: 'numeric',
            day: 'numeric',
            year: 'numeric'
          }),
          growth_areas: s.analysis_data?.growth_opportunities || [],
          recommendations: s.analysis_data?.recommendations || []
        }));

        logToFile('Using verbatim prior feedback (1-3 sessions)', {
          sessionCount: priorSessions.length
        });

        return {
          exists: true,
          summary: verbatimSessions,
          sessionCount: priorSessions.length,
          compressed: false
        };
      }

      // If 4+ sessions, summarize using GPT-4o-mini
      logToFile('Compressing prior feedback (4+ sessions)', {
        sessionCount: priorSessions.length
      });

      const compressedSummary = await GPT5MiniService.summarizePriorFeedback(priorSessions);

      return {
        exists: true,
        summary: compressedSummary,
        sessionCount: priorSessions.length,
        compressed: true
      };
    } catch (error) {
      logToFile('Error fetching prior sessions', { error: error.message });
      return {
        exists: false,
        summary: null,
        sessionCount: 0
      };
    }
  }

  /**
   * Legacy method - Fetch prior coaching session for the teacher (DEPRECATED)
   * Use fetchAndCompressPriorFeedback() instead
   * @deprecated
   * @param {string} userId - User ID
   * @param {string} currentSessionId - Current session ID (to exclude)
   * @returns {Promise<object|null>} Prior session data or null
   * @private
   */
  static async fetchPriorSession(userId, currentSessionId) {
    try {
      logToFile('⚠️  Using deprecated fetchPriorSession() - use fetchAndCompressPriorFeedback() instead', { userId });

      const { data: priorSession, error } = await supabase
        .from('coaching_sessions')
        .select('id, created_at, analysis_data')
        .eq('user_id', userId)
        .eq('status', 'completed')
        .neq('id', currentSessionId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error || !priorSession) {
        logToFile('No prior coaching session found', { userId });
        return null;
      }

      logToFile('Prior coaching session found', {
        priorSessionId: priorSession.id,
        priorSessionDate: priorSession.created_at
      });

      return priorSession;
    } catch (error) {
      logToFile('Error fetching prior session', { error: error.message });
      return null;
    }
  }

  /**
   * Extract growth areas from prior session analysis
   * @param {object} priorAnalysis - Prior session's analysis data
   * @returns {string} Formatted growth areas text
   * @private
   */
  static extractGrowthAreas(priorAnalysis) {
    const growthAreas = [];

    // Extract from growth_areas array if it exists
    if (priorAnalysis.growth_areas && Array.isArray(priorAnalysis.growth_areas)) {
      priorAnalysis.growth_areas.forEach(area => {
        if (area.area || area.description) {
          growthAreas.push(area.area || area.description);
        }
      });
    }

    // Extract from recommendations if growth_areas doesn't exist
    if (growthAreas.length === 0 && priorAnalysis.recommendations) {
      if (Array.isArray(priorAnalysis.recommendations)) {
        priorAnalysis.recommendations.forEach(rec => {
          if (rec.recommendation || rec.description) {
            growthAreas.push(rec.recommendation || rec.description);
          }
        });
      }
    }

    // Fallback to extracting from executive summary
    if (growthAreas.length === 0 && priorAnalysis.executive_summary) {
      return `Previous feedback: ${priorAnalysis.executive_summary}`;
    }

    return growthAreas.length > 0
      ? `Prior growth areas identified: ${growthAreas.join('; ')}`
      : 'No specific growth areas identified in prior session';
  }

  /**
   * Generate PDF report using wkhtmltopdf
   * @param {object} session - Session data
   * @param {string} teacherName - Teacher's full name
   * @param {object} enhancedAnalysis - Enhanced analysis data
   * @returns {Promise<Buffer>} PDF buffer
   * @private
   */
  static async generatePDFReport(session, teacherName, enhancedAnalysis) {
    logToFile('Generating PDF report with wkhtmltopdf', { coachingSessionId: session.id });

    // Transform enhanced analysis into report data format
    const reportData = await this.transformAnalysisToReportData(session, teacherName, enhancedAnalysis);

    // Generate PDF using our new service
    const pdfBuffer = await PDFReportService.generateClassroomObservationReport(reportData);

    logToFile('PDF report generated', {
      coachingSessionId: session.id,
      pdfSizeKB: Math.round(pdfBuffer.length / 1024)
    });

    // Update database with generation timestamp
    await supabase
      .from('coaching_sessions')
      .update({
        report_generated_at: new Date().toISOString()
      })
      .eq('id', session.id);

    return pdfBuffer;
  }

  /**
   * Transform enhanced analysis into report data format
   * @param {object} session - Session data
   * @param {string} teacherName - Teacher's full name
   * @param {object} enhancedAnalysis - Enhanced analysis data
   * @returns {Promise<object>} Report data
   * @private
   */
  static async transformAnalysisToReportData(session, teacherName, enhancedAnalysis) {
    // Extract observation details from analysis
    const observationDate = new Date(session.created_at).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const goals = [];

    // HOTS Area-to-report mapping
    const areaDefinitions = [
      {
        key: 'area1_classroom_management',
        title: 'Area 1: Classroom Management',
        scoreKey: 'area1_classroom_management_total',
        maxScore: 9,
        indicators: [
          { key: 'open_discussions', name: 'Open Discussions & Critical Thinking', defaultMax: 3 },
          { key: 'resources_organization', name: 'Resources & Space Organization', defaultMax: 3 },
          { key: 'complex_task_expectations', name: 'Complex Task Expectations', defaultMax: 3 }
        ]
      },
      {
        key: 'area2_lesson_planning',
        title: 'Area 2: Lesson Planning',
        scoreKey: 'area2_lesson_planning_total',
        maxScore: 9,
        indicators: [
          { key: 'objectives_hots_alignment', name: 'Objectives & HOTS Alignment', defaultMax: 3 },
          { key: 'analysis_evaluation_strategies', name: 'Analysis & Evaluation Strategies', defaultMax: 3 },
          { key: 'interdisciplinary_applications', name: 'Interdisciplinary Applications', defaultMax: 3 }
        ]
      },
      {
        key: 'area3_instructional_strategies',
        title: 'Area 3: Instructional Strategies',
        scoreKey: 'area3_instructional_strategies_total',
        maxScore: 12,
        indicators: [
          { key: 'open_ended_questions', name: 'Open-Ended Questions', defaultMax: 3 },
          { key: 'student_analysis_critique', name: 'Student Analysis & Critique', defaultMax: 3 },
          { key: 'problem_solving_creativity', name: 'Problem-Solving & Creativity', defaultMax: 3 },
          { key: 'scaffolding', name: 'Scaffolding', defaultMax: 3 }
        ]
      },
      {
        key: 'area4_student_engagement',
        title: 'Area 4: Student Engagement',
        scoreKey: 'area4_student_engagement_total',
        maxScore: 9,
        indicators: [
          { key: 'collaborative_synthesis', name: 'Collaborative Synthesis', defaultMax: 3 },
          { key: 'multiple_perspectives', name: 'Multiple Perspectives', defaultMax: 3 },
          { key: 'discussions_debates', name: 'Discussions & Debates', defaultMax: 3 }
        ]
      },
      {
        key: 'area5_assessment_feedback',
        title: 'Area 5: Assessment & Feedback',
        scoreKey: 'area5_assessment_feedback_total',
        maxScore: 9,
        indicators: [
          { key: 'self_peer_assessment', name: 'Self/Peer Assessment', defaultMax: 3 },
          { key: 'refinement_feedback', name: 'Refinement Feedback', defaultMax: 3 },
          { key: 'hots_assessment_tasks', name: 'HOTS Assessment Tasks', defaultMax: 3 }
        ]
      }
    ];

    for (const areaDef of areaDefinitions) {
      const areaData = enhancedAnalysis[areaDef.key];
      if (areaData) {
        goals.push({
          title: areaDef.title,
          score: enhancedAnalysis.scores?.[areaDef.scoreKey] || 0,
          maxScore: areaDef.maxScore,
          criteria: areaDef.indicators.map(ind => {
            let evidence = areaData[ind.key]?.evidence || 'No evidence provided';
            const timestamp = areaData[ind.key]?.timestamp || null;

            // Safety net: prepend timestamp to evidence if it exists but isn't already embedded
            if (timestamp && !evidence.startsWith('[') && !evidence.includes(`[${timestamp}`)) {
              evidence = `[${timestamp}] ${evidence}`;
            }

            return {
              name: ind.name,
              score: areaData[ind.key]?.computed_marks || 0,
              max: areaData[ind.key]?.max_marks || ind.defaultMax,
              evidence,
              timestamp
            };
          })
        });
      }
    }

    // PRIOR FEEDBACK (separate from 5 main areas, 5 marks total)
    // Check if user has prior completed sessions
    let hasPriorSessions = false;
    const { count, error: countError } = await supabase
      .from('coaching_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', session.user_id)
      .eq('status', 'completed')
      .neq('id', session.id);

    if (countError) {
      logToFile('⚠️  Error checking prior sessions', { error: countError, userId: session.user_id });
    }

    hasPriorSessions = (count || 0) > 0;

    // Extract incorporation_of_feedback from uptake_of_feedback in debrief or prior feedback data
    let priorFeedback = null;
    if (enhancedAnalysis.debrief_reflection?.uptake_of_feedback) {
      const priorData = enhancedAnalysis.debrief_reflection.uptake_of_feedback;

      if (hasPriorSessions) {
        // Has prior sessions - normal scoring
        priorFeedback = {
          score: priorData.computed_marks || 0,
          maxScore: 5,
          evidence: priorData.evidence || '',
          timestamp: priorData.timestamp || 'N/A',
          isFirstObservation: false
        };
      } else {
        // First observation - exclude from scoring
        priorFeedback = {
          score: 0,
          maxScore: 0, // Indicates N/A
          evidence: "This is the teacher's first classroom observation with Rumi. This section will be populated once the first observation is completed.",
          timestamp: 'N/A',
          isFirstObservation: true
        };
      }
    }

    // DEBRIEF & REFLECTION SECTION (separate from 5 main goals, 15 marks total)
    let debriefReflection = null;
    if (enhancedAnalysis.debrief_reflection) {
      const debriefData = enhancedAnalysis.debrief_reflection;
      debriefReflection = {
        score: debriefData.total || 0,
        maxScore: debriefData.max_total || 15,
        criteria: [
          {
            name: 'Reflection Quality',
            score: debriefData.reflection_quality?.computed_marks || 0,
            max: debriefData.reflection_quality?.max_marks || 4,
            evidence: debriefData.reflection_quality?.evidence || 'Debrief conversation not yet completed',
            justification: debriefData.reflection_quality?.justification || ''
          },
          {
            name: 'Connecting to Specific Incidents',
            score: debriefData.connecting_to_incidents?.computed_marks || 0,
            max: debriefData.connecting_to_incidents?.max_marks || 4,
            evidence: debriefData.connecting_to_incidents?.evidence || 'Debrief conversation not yet completed',
            justification: debriefData.connecting_to_incidents?.justification || ''
          },
          {
            name: 'Uptake of Observer Feedback',
            score: debriefData.uptake_of_feedback?.computed_marks || 0,
            max: debriefData.uptake_of_feedback?.max_marks || 4,
            evidence: debriefData.uptake_of_feedback?.evidence || 'Debrief conversation not yet completed',
            justification: debriefData.uptake_of_feedback?.justification || ''
          },
          {
            name: 'Openness During Debrief',
            score: debriefData.openness_during_debrief?.computed_marks || 0,
            max: debriefData.openness_during_debrief?.max_marks || 3,
            evidence: debriefData.openness_during_debrief?.evidence || 'Debrief conversation not yet completed',
            justification: debriefData.openness_during_debrief?.justification || ''
          }
        ]
      };
    }

    const hasLessonPlanData = !!(session.lesson_plan_structured || enhancedAnalysis.has_lesson_plan);

    let fidelitySection = enhancedAnalysis.fidelity_analysis ? {
      score: enhancedAnalysis.fidelity_analysis.score || 0,
      maxScore: enhancedAnalysis.fidelity_analysis.max_score || 100,
      note: enhancedAnalysis.fidelity_analysis.note || 'Informational only',
      commentary: enhancedAnalysis.fidelity_analysis.overall_commentary || enhancedAnalysis.fidelity_analysis.note || '',
      evidence: enhancedAnalysis.fidelity_analysis.evidence || [],
      strengths: enhancedAnalysis.fidelity_analysis.strengths || [],
      gaps: enhancedAnalysis.fidelity_analysis.gaps || []
    } : null;

    if (hasLessonPlanData && !fidelitySection) {
      logToFile('⚠️ Fidelity analysis missing despite lesson plan', {
        coachingSessionId: session.id
      });
      fidelitySection = {
        score: 0,
        maxScore: 100,
        note: 'Lesson plan submitted, fidelity analysis unavailable',
        commentary: 'Lesson plan was provided but fidelity insights were not generated. Please rerun analysis after resolving extraction issues.',
        evidence: [],
        strengths: [],
        gaps: []
      };
    }

    const classroomScore = enhancedAnalysis.scores?.overall_marks || 0;
    const debriefScore = debriefReflection?.score || 0;
    const priorScore = priorFeedback && !priorFeedback.isFirstObservation ? priorFeedback.score : 0;
    const totalScore = classroomScore + debriefScore + priorScore;

    const classroomMax = hasLessonPlanData
      ? CLASSROOM_MARKS_WITH_LP
      : CLASSROOM_MARKS_BASE;
    const debriefMax = debriefReflection?.maxScore || 0;
    const priorMax = hasPriorSessions ? 5 : 0;
    const maxPossibleMarks = classroomMax + debriefMax + priorMax;

    this._applyLessonPlanEvidenceToCriteria(goals, session.lesson_plan_structured, teacherName);

    // Bug #9: Build partial report note if applicable
    let partialReportNote = null;
    if (session._isPartialReport) {
      const questionsCompleted = session._questionsAtCompletion || 0;
      if (session._isAutoCompleted) {
        partialReportNote = questionsCompleted > 0
          ? `Note: This report includes ${questionsCompleted}/3 reflective responses. The session was auto-completed after 12 hours of inactivity. Full insights require completing all reflection questions.`
          : `Note: This report is based on classroom audio analysis only. The reflective conversation was not completed (auto-completed after 12 hours of inactivity).`;
      } else if (session._isUserRequestedEarly) {
        partialReportNote = questionsCompleted > 0
          ? `Note: This report includes ${questionsCompleted}/3 reflective responses. You requested early completion. Full insights require completing all reflection questions.`
          : `Note: This report is based on classroom audio analysis only. The reflective conversation was skipped at your request.`;
      }

      logToFile('📝 Partial report note added', {
        coachingSessionId: session.id,
        questionsCompleted,
        isAutoCompleted: session._isAutoCompleted,
        isUserRequestedEarly: session._isUserRequestedEarly
      });
    }

    // Build report data structure matching our PDF template
    return {
      teacherName,
      observationDate,
      subject: session.lesson_plan_structured?.subject || enhancedAnalysis.subject || 'N/A',
      topic: session.lesson_plan_structured?.topic || enhancedAnalysis.topic || 'N/A',
      observerName: require('../../config/branding').botName,
      hasLessonPlan: hasLessonPlanData,
      totalScore,
      maxScore: maxPossibleMarks,
      priorFeedback,
      goals,
      debriefReflection,
      fidelitySection,
      feedback: enhancedAnalysis.executive_summary || enhancedAnalysis.summary || 'Analysis complete.',
      strengths: enhancedAnalysis.strengths || [],
      growthOpportunities: enhancedAnalysis.growth_opportunities || [],
      recommendations: enhancedAnalysis.recommendations || [],
      // Bug #9: Partial report metadata
      isPartialReport: session._isPartialReport || false,
      partialReportNote
    };
  }

  /**
   * Inject "From Lesson Plan / From Classroom" structure into targeted criteria
   * @private
   */
  static _applyLessonPlanEvidenceToCriteria(goals, lessonPlanStructured, teacherName) {
    if (!lessonPlanStructured || !Array.isArray(goals)) {
      return;
    }

    const snippets = this._buildLessonPlanSnippets(lessonPlanStructured, teacherName);

    const enhanceCriterion = (goalPredicate, criterionName, snippetKey) => {
      const snippet = snippets[snippetKey];
      if (!snippet) {
        return;
      }
      const goal = goals.find((g) => goalPredicate(g.title || ''));
      if (!goal || !Array.isArray(goal.criteria)) {
        return;
      }
      const criterion = goal.criteria.find((c) => c.name === criterionName);
      if (!criterion || !criterion.evidence) {
        return;
      }
      const timestampSuffix = criterion.timestamp
        ? ` (Timestamp: ${criterion.timestamp})`
        : '';
      const planLines = [];
      const baseLine = snippet.narrative
        ? `From Lesson Plan: ${snippet.narrative}`
        : 'From Lesson Plan:';
      planLines.push(baseLine.trim());
      if (snippet.quote) {
        planLines.push(`Quote: ${snippet.quote}`);
      }
      const classroomLine = `From Classroom: ${criterion.evidence}${timestampSuffix}`;
      criterion.evidence = `${planLines.join('\n')}\n${classroomLine}`;
    };

    const isArea = {
      lessonPlanning: (title = '') => title.toLowerCase().includes('lesson planning'),
      management: (title = '') => title.toLowerCase().includes('classroom management'),
      assessment: (title = '') => title.toLowerCase().includes('assessment')
    };

    enhanceCriterion(isArea.lessonPlanning, 'Objectives & HOTS Alignment', 'smartObjectives');
    enhanceCriterion(isArea.lessonPlanning, 'Interdisciplinary Applications', 'priorKnowledge');
    enhanceCriterion(isArea.assessment, 'HOTS Assessment Tasks', 'assessment');
    enhanceCriterion(isArea.management, 'Resources & Space Organization', 'materials');
  }

  /**
   * Build natural-language snippets from structured lesson plan data
   * @private
   */
  static _buildLessonPlanSnippets(plan, teacherName) {
    const snippets = {};
    const teacherLabel = (teacherName || 'The teacher').trim();
    const teacherShort = teacherLabel.split(' ')[0] || teacherLabel;
    const formatExcerpt = (items = [], limit = 3) => {
      if (!Array.isArray(items) || !items.length) {
        return null;
      }
      const cleaned = items
        .map((item) => (typeof item === 'string' ? item.trim() : item))
        .filter(Boolean);
      if (!cleaned.length) {
        return null;
      }
      const selected = cleaned.slice(0, limit).map((value) => value.toString().trim());
      const remainder = cleaned.length - selected.length;
      return remainder > 0 ? `${selected.join('; ')} (+${remainder} more)` : selected.join('; ');
    };

    const buildListNarrative = (items = [], opts = {}) => {
      if (!Array.isArray(items) || !items.length) {
        return null;
      }
      const selected = items.slice(0, opts.limit || 2);
      if (!selected.length) {
        return null;
      }
      const summary = selected.join('; ');
      if (items.length > selected.length) {
        return `${summary} (+${items.length - selected.length} more)`;
      }
      return summary;
    };

    if (plan.objectives?.length) {
      const objectiveSummary = buildListNarrative(plan.objectives, { limit: 2 });
      snippets.smartObjectives = {
        narrative: objectiveSummary
          ? `${teacherShort} framed explicit outcomes such as ${objectiveSummary}, giving students a clear target for the lesson.`
          : `${teacherShort} framed explicit outcomes so students knew what success looked like before practice began.`,
        quote: formatExcerpt(plan.objectives, 2)
      };
    }

    if (plan.prior_knowledge?.length) {
      const priorSummary = buildListNarrative(plan.prior_knowledge, { limit: 3 });
      snippets.priorKnowledge = {
        narrative: priorSummary
          ? `${teacherShort} expected learners to already understand ${priorSummary}, so the lesson could build directly on that base.`
          : `${teacherShort} anticipated key prerequisite knowledge before introducing new material.`,
        quote: formatExcerpt(plan.prior_knowledge, 3)
      };
    }

    const assessmentPieces = [];
    if (plan.assessment_sequences?.length) {
      assessmentPieces.push(
        ...plan.assessment_sequences.map((sequence) => {
          const steps = sequence.steps?.length ? `Steps: ${sequence.steps.join(' › ')}` : '';
          return `${sequence.title || 'Assessment'}${steps ? ` (${steps})` : ''}`.trim();
        })
      );
    }
    if (plan.assessment_methods?.length) {
      assessmentPieces.push(...plan.assessment_methods);
    }
    if (plan.planned_questions?.length) {
      assessmentPieces.push(...plan.planned_questions.map((question) => question.question || '').filter(Boolean));
    }
    if (assessmentPieces.length) {
      snippets.assessment = {
        narrative: `${teacherShort} mapped formative checkpoints (group demonstrations, notebook work, and targeted oral questions) to gather evidence beyond whole-class recall.`,
        quote: formatExcerpt(assessmentPieces, 3)
      };
    }

    const materialEntries = [];
    if (plan.materials?.length) {
      materialEntries.push(...plan.materials);
    }
    if (plan.resources_detail?.length) {
      materialEntries.push(
        ...plan.resources_detail.map((resource) => {
          const reference = resource.reference ? ` (${resource.reference})` : '';
          return `${resource.name || 'Resource'}${reference}`;
        })
      );
    }
    if (plan.textbook_references?.length) {
      materialEntries.push(
        ...plan.textbook_references.map(
          (ref) => `${ref.title || 'Textbook'} p.${ref.page || '?'}${ref.usage ? ` – ${ref.usage}` : ''}`
        )
      );
    }
    if (plan.resource_pages?.length) {
      materialEntries.push(
        ...plan.resource_pages.map(
          (page) =>
            `${page.name || 'Resource'} (page ${page.page || '?'})${page.description ? ` – ${page.description}` : ''}`
        )
      );
    }
    if (materialEntries.length) {
      const materialSummary = buildListNarrative(materialEntries, { limit: 3 });
      snippets.materials = {
        narrative: materialSummary
          ? `${teacherShort} prepared resources such as ${materialSummary} so students could access the concept in multiple ways.`
          : `${teacherShort} stocked the required teaching materials in advance.`,
        quote: formatExcerpt(materialEntries, 3)
      };
    }

    return snippets;
  }

  /**
   * Send PDF report to user with formatted filename
   * @param {string} phoneNumber - User's phone number
   * @param {string} coachingSessionId - Coaching session UUID
   * @param {Buffer} pdfBuffer - PDF buffer from report generator
   * @param {string} teacherFirstName - Teacher's first name for filename
   * @param {string} observationDate - Observation date (ISO string)
   * @returns {Promise<void>}
   * @private
   */
  static async sendPDFReport(phoneNumber, coachingSessionId, pdfBuffer, teacherFirstName = 'Teacher', observationDate = null) {
    try {
      await WhatsAppService.sendMessage(phoneNumber, "✅ Your Classroom Observation Report is ready! 📄");

      const tempPdfPath = path.join(TEMP_DIR, `report_${coachingSessionId}_${Date.now()}.pdf`);

      // Ensure temp directory exists
      if (!fs.existsSync(TEMP_DIR)) {
        fs.mkdirSync(TEMP_DIR, { recursive: true });
      }

      // Write PDF buffer to temp file
      fs.writeFileSync(tempPdfPath, pdfBuffer);

      // Format filename: "Classroom Observation_FirstName_DDMMYYYY.pdf"
      const dateObj = observationDate ? new Date(observationDate) : new Date();
      const day = String(dateObj.getDate()).padStart(2, '0');
      const month = String(dateObj.getMonth() + 1).padStart(2, '0');
      const year = dateObj.getFullYear();
      const formattedDate = `${day}${month}${year}`;
      const filename = `Classroom Observation_${teacherFirstName}_${formattedDate}.pdf`;

      logToFile('PDF saved to temp file, sending to user', {
        coachingSessionId,
        pdfSize: pdfBuffer.length,
        filename
      });

      // Send document with formatted filename
      await WhatsAppService.sendDocument(phoneNumber, tempPdfPath, filename);

      // Clean up temp file
      if (fs.existsSync(tempPdfPath)) {
        fs.unlinkSync(tempPdfPath);
      }

      logToFile('PDF report sent', { coachingSessionId });
    } catch (error) {
      logToFile('Warning: Failed to send PDF', {
        coachingSessionId,
        error: error.message
      });
      throw error; // PDF delivery is critical, fail if it doesn't work
    }
  }

  /**
   * Generate and send voice debrief (non-critical, won't fail main process)
   * @param {object} session - Session data
   * @param {string} phoneNumber - User's phone number
   * @param {string} coachingSessionId - Coaching session UUID
   * @param {object} enhancedAnalysis - Enhanced analysis data
   * @returns {Promise<void>}
   * @private
   */
  static async generateAndSendVoiceDebrief(session, phoneNumber, coachingSessionId, enhancedAnalysis) {
    try {
      await WhatsAppService.sendMessage(phoneNumber, "🔄 Step 5/5: Creating your personalized voice debrief...");

      const outputLanguage = await CoachingHelpersService.determineOutputLanguage(
        session.user_id,
        session.session_id,
        session.transcript_language
      );

      const voiceScript = await GPT5MiniService.summarizeForVoiceDebrief(
        {
          analysis: enhancedAnalysis,
          conversation: session.conversation_state,
          hasLessonPlan: !!enhancedAnalysis.has_lesson_plan,
          fidelityScore: enhancedAnalysis.fidelity_analysis?.score || null
        },
        outputLanguage
      );

      logToFile('Voice debrief script generated', {
        coachingSessionId,
        language: outputLanguage,
        scriptLength: voiceScript.length
      });

      // Validate script
      if (!voiceScript || voiceScript.trim().length === 0) {
        throw new Error('Voice debrief script generation returned empty content');
      }

      // Generate audio from script
      const voiceBuffer = await AudioService.generateSpeechForLanguage(voiceScript, outputLanguage);

      // Upload voice debrief to R2
      const voiceUrl = await uploadVoiceDebrief(
        voiceBuffer,
        session.user_id,
        coachingSessionId,
        outputLanguage
      );

      logToFile('Voice debrief uploaded', { coachingSessionId, voiceUrl });

      // Update database
      await supabase
        .from('coaching_sessions')
        .update({
          voice_debrief_url: voiceUrl,
          voice_debrief_language: outputLanguage,
          voice_debrief_duration_seconds: Math.round(voiceBuffer.length / 16000)
        })
        .eq('id', coachingSessionId);

      // Send voice debrief
      await WhatsAppService.sendMessage(phoneNumber, "🎤 Here's your personalized voice summary:");
      await WhatsAppService.sendAudioFromUrl(phoneNumber, voiceUrl);

      logToFile('✅ Voice debrief sent successfully', { coachingSessionId });
    } catch (voiceError) {
      logToFile('⚠️  Voice debrief generation failed, but PDF was already sent', {
        coachingSessionId,
        error: voiceError.message
      });
      await WhatsAppService.sendMessage(phoneNumber,
        "Note: Voice summary could not be generated, but your written report is complete! You can review it in the PDF above. 📄"
      );
    }
  }

  /**
   * Complete session and record metrics
   * @param {object} session - Session data
   * @param {string} coachingSessionId - Coaching session UUID
   * @returns {Promise<void>}
   * @private
   */
  static async completeSession(session, coachingSessionId) {
    // Mark session as completed
    await CoachingSessionService.markAsCompleted(coachingSessionId, {
      completed_at: new Date().toISOString()
    });

    // Calculate total cost
    const totalCost = CoachingHelpersService.calculateTotalCost(
      session.transcription_cost || 0,
      session.analysis_cost || 0,
      0, // report cost
      0  // voice cost
    );

    await supabase
      .from('coaching_sessions')
      .update({ total_cost: totalCost })
      .eq('id', coachingSessionId);

    // Record quality metrics
    const updatedSession = await CoachingSessionService.getSession(coachingSessionId);
    await CoachingHelpersService.recordQualityMetrics(updatedSession);
  }

  /**
   * Handle report generation error
   * @param {string} coachingSessionId - Coaching session UUID
   * @param {Error} error - Error object
   * @param {string} phoneNumber - User's phone number (optional)
   * @returns {Promise<void>}
   */
  static async handleReportError(coachingSessionId, error, phoneNumber) {
    try {
      logToFile('❌ Error in generateReport', {
        error: error.message,
        stack: error.stack,
        coachingSessionId
      });

      // Get user phone number if not provided
      let from = phoneNumber;
      if (!from) {
        try {
          const { data: session } = await supabase
            .from('coaching_sessions')
            .select('users!inner(phone_number)')
            .eq('id', coachingSessionId)
            .single();
          from = session?.users?.phone_number;
        } catch (e) {
          logToFile('⚠️  Could not get user phone for error notification', { error: e.message });
        }
      }

      // Update session with error
      await CoachingSessionService.markAsFailed(coachingSessionId, 'report_generation', error.message);

      // Notify user (bilingual)
      if (from) {
        const errorMessage = "معذرت، آپ کی رپورٹ بناتے وقت خرابی آ گئی۔ براہ کرم دوبارہ کوشش کریں۔\n\nSorry, there was an error generating your report. Please try again.";
        await WhatsAppService.sendMessage(from, errorMessage);
      }
    } catch (handlerError) {
      logToFile('❌ Error in handleReportError', {
        error: handlerError.message,
        coachingSessionId
      });
    }
  }
}

module.exports = ReportGeneratorService;
