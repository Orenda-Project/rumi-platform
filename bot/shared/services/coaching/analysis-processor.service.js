/**
 * Analysis Processor Service
 * Handles pedagogical analysis of classroom observations
 *
 * Responsibilities:
 * - Orchestrate GPT-5 mini analysis
 * - Send progress updates with animations
 * - Store analysis results
 * - Handle analysis errors with notifications
 * - Trigger reflective conversation
 *
 * Extracted from coaching.service.js as part of Phase 3 refactoring
 */

const supabase = require('../../config/supabase');
const { logToFile } = require('../../utils/logger');
const GPT5MiniService = require('../gpt5-mini.service');
const WhatsAppService = require('../whatsapp.service');
const CoachingSessionService = require('./coaching-session.service');
const { PEDAGOGICAL_ANALYSIS_MEDIA_ID } = require('../../utils/constants');
const { selectFramework } = require('./frameworks/framework-selector');
const { getCoachingMessage } = require('../../config/coaching-messages');
const { isFidelityEnabled } = require('./fidelity/fidelity-orchestrator');
const { computeFidelityForSession, applyFrameworkFidelity } = require('./fidelity/fidelity-session');

/**
 * Look up the teacher's preferred language for a coaching session.
 * Falls back to 'en' if the session/user can't be read — we'd rather
 * ship the English message than throw mid-pipeline.
 */
async function _resolveSessionLanguage(coachingSessionId) {
  try {
    const { data } = await supabase
      .from('coaching_sessions')
      .select('users(preferred_language), transcript_language')
      .eq('id', coachingSessionId)
      .maybeSingle();
    return data?.users?.preferred_language || data?.transcript_language || 'en';
  } catch (_err) {
    return 'en';
  }
}

/**
 * An observation's plan is linked by the coach, possibly while this job runs (observe-plan.service asks once the
 * teacher is known). Wait for an open plan question (bounded by LP_FIDELITY_PLAN_WAIT_SECONDS), then re-read the
 * row's plan fields — and its owner, which a late "who was observed?" answer re-binds. Any failure here costs only
 * the wait: the row as loaded is graded.
 */
async function _observationPlanRow(session) {
  try {
    await require('../observe/observe-plan.service').awaitPlanAnswer(session.id);
    const { data } = await supabase
      .from('coaching_sessions')
      .select('user_id, lesson_plan_text, lesson_plan_link_method, linked_lesson_plan_id, lesson_plan_extraction_status')
      .eq('id', session.id)
      .maybeSingle();
    return data ? { ...session, ...data } : session;
  } catch (err) {
    logToFile('[lp-fidelity] observation plan re-read failed — grading the row as loaded', { sessionId: session.id, error: err.message });
    return session;
  }
}

class AnalysisProcessorService {
  /**
   * Process analysis job (called by background worker)
   * @param {string} coachingSessionId - Coaching session UUID
   * @param {object} payload - Job payload
   * @returns {Promise<void>}
   */
  static async processAnalysis(coachingSessionId, payload) {
    try {
      logToFile('🔄 Starting pedagogical analysis', { coachingSessionId });

      // Get session data
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
      // A coach's observation of a teacher (/observe), read from the ROW. The
      // chat belongs to the coach; the analysis becomes the coach's draft to
      // review, so the teacher-facing steps of this pipeline are skipped.
      const isObservation = session.observation_type === 'leader_observation';

      // Update status
      await CoachingSessionService.updateStatus(coachingSessionId, 'analyzing', {
        analysis_started_at: new Date().toISOString()
      });

      // Send progress update
      if (!isObservation) await this.sendProgressUpdate(from, 2);

      // Fetch and compress prior feedback — the teacher's OWN reflections. An
      // observation is rated on what the coach saw today, not on those.
      const ReportGeneratorService = require('./report-generator.service');
      const priorFeedbackData = isObservation
        ? { exists: false }
        : await ReportGeneratorService.fetchAndCompressPriorFeedback(session.user_id, coachingSessionId);

      // Format prior feedback for prompt
      let priorFeedbackText = null;
      if (priorFeedbackData.exists) {
        if (priorFeedbackData.compressed) {
          // 4+ sessions: use compressed summary
          priorFeedbackText = priorFeedbackData.summary;
        } else {
          // 1-3 sessions: format verbatim sessions with dates
          priorFeedbackText = priorFeedbackData.summary.map(s => {
            const growthAreasText = s.growth_areas.map(ga => ga.area || ga.observation || 'N/A').join(', ');
            const recommendationsText = s.recommendations.join(', ');
            return `Observation ${s.date}:\nGrowth Areas: ${growthAreasText}\nRecommendations: ${recommendationsText}`;
          }).join('\n\n');
        }

        logToFile('Prior feedback fetched and formatted', {
          sessionCount: priorFeedbackData.sessionCount,
          compressed: priorFeedbackData.compressed,
          feedbackLength: priorFeedbackText?.length || 0
        });
      }

      // Run GPT-5 mini analysis with prior feedback
      const metadata = {
        duration: session.audio_duration_seconds,
        language: session.transcript_language,
        teacherFirstName: session.users.first_name,
        priorFeedback: priorFeedbackText,
        lessonPlanExcerpt: session.lesson_plan_excerpt || null,
        lessonPlanStatus: session.lesson_plan_extraction_status || null,
        lessonPlanSubject: session.lesson_plan_structured?.subject || null,
        lessonPlanTopic: session.lesson_plan_structured?.topic || null,
        ...(isObservation ? { teacherName: session.users.first_name || null } : {})
      };

      logToFile('Analysis metadata', metadata);

      // Resolve pedagogical framework: an observation is pinned to the observe
      // pack (the coach's form is shaped by it); otherwise this user's framework.
      const { pickObservationFramework } = require('../observe/observe-gate');
      const framework = await pickObservationFramework(session, { selectFramework });
      logToFile('Framework resolved', { userId: session.user_id, framework: framework.name });

      // The pedagogy analysis, the v12 reflective corpus extraction and lesson-plan fidelity
      // (LP_FIDELITY_ENABLED) run CONCURRENTLY. allSettled (NOT all) keeps the corpus and
      // fidelity tasks NON-BLOCKING — if either rejects, the critical-path analysis persist
      // still proceeds and the report falls back gracefully.
      const langCode = session.transcript_language || metadata.language || 'en';
      const fidelityOn = isFidelityEnabled();   // read once: the task below and the Section B status must agree
      let observedRow = session;   // an observation's plan fields, as re-read after the plan question
      const [analysisSettled, corpusSettled, fidelitySettled] = await Promise.allSettled([
        GPT5MiniService.analyzePedagogy(
          session.transcript_text,
          metadata,
          session.lesson_plan_structured || null,
          framework,
        ),
        // The reflective corpus feeds the teacher's own reflective chat: an observation skips it.
        isObservation ? Promise.resolve(null) : GPT5MiniService.extractReflectiveCorpus(session.transcript_text, langCode),
        // Lesson-plan fidelity checks the lesson against its plan. For an observation it is Section B, graded
        // against the plan the COACH linked (observe-plan.service) — so it waits for an open plan question first.
        !fidelityOn ? Promise.resolve(null)
          : isObservation ? _observationPlanRow(session).then((row) => { observedRow = row; return computeFidelityForSession(row); })
            : computeFidelityForSession(session, { waitForPlan: true }),
      ]);
      if (analysisSettled.status === 'rejected') throw analysisSettled.reason;
      const analysisResult = analysisSettled.value;

      let reflectiveCorpus = null;
      if (corpusSettled.status === 'fulfilled' && corpusSettled.value) {
        reflectiveCorpus = corpusSettled.value.corpus;
        logToFile('[refl-q] corpus persisted to analysis_data', {
          coachingSessionId,
          model_used: corpusSettled.value.model_used,
        });
      } else if (corpusSettled.status === 'rejected') {
        logToFile('[refl-q] corpus extraction failed (non-blocking)', {
          coachingSessionId,
          error: corpusSettled.reason && corpusSettled.reason.message,
        });
      }

      // Lesson-plan fidelity: every outcome is persisted (lp_absent, lp_unparseable, fidelity_unavailable, not
      // assessed, scored) so "never ran" stays distinguishable from each way it fell short.
      let lpFidelity = null;
      if (fidelitySettled.status === 'fulfilled') {
        lpFidelity = fidelitySettled.value;
      } else {
        lpFidelity = { status: 'fidelity_unavailable', error: fidelitySettled.reason && fidelitySettled.reason.message, graded_at: new Date().toISOString() };
      }
      if (lpFidelity) {
        logToFile('[lp-fidelity] graded', {
          coachingSessionId,
          status: lpFidelity.status,
          source: lpFidelity.source || null,
          fidelity_pct: lpFidelity.fidelity_pct ?? null,
          unusable_guard: lpFidelity.unusable_guard || null,
        });
      }

      logToFile('Analysis completed', {
        coachingSessionId,
        inputTokens: analysisResult.usage.input_tokens,
        outputTokens: analysisResult.usage.output_tokens,
        cachedTokens: analysisResult.usage.cached_tokens,
        cost: analysisResult.usage.cost,
        hasReflectiveCorpus: !!reflectiveCorpus,
      });

      // Update database — merge reflective_corpus and lp_fidelity into analysis_data when present,
      // and let the framework map a measured fidelity onto its own indicator (optional hook).
      let analysisData = reflectiveCorpus
        ? { ...analysisResult.analysis, reflective_corpus: reflectiveCorpus }
        : analysisResult.analysis;
      if (lpFidelity) {
        analysisData = applyFrameworkFidelity(framework, { ...analysisData, lp_fidelity: lpFidelity }, lpFidelity);
      }
      // An observation's Section B status: assessed, or not assessed and why — never a zero for a lesson nobody
      // could measure. Only when fidelity ran: fidelity off leaves an observation exactly as it was.
      if (isObservation && fidelityOn) {
        const { sectionBRecord } = require('../observe/observe-section-b');
        const ObservePlan = require('../observe/observe-plan.service');
        let detail;
        try { detail = await ObservePlan.planDetail(observedRow); } catch (_) { detail = undefined; }
        analysisData = { ...analysisData, section_b: sectionBRecord(lpFidelity, { detail }) };
      }
      await supabase
        .from('coaching_sessions')
        .update({
          analysis_data: analysisData,
          status: 'analysis_complete',
          analysis_completed_at: new Date().toISOString(),
          analysis_cost: analysisResult.usage.cost,
          gpt5_input_tokens: analysisResult.usage.input_tokens,
          gpt5_output_tokens: analysisResult.usage.output_tokens,
          gpt5_cached_tokens: analysisResult.usage.cached_tokens,
        })
        .eq('id', coachingSessionId);

      // An observation's result is the coach's draft: freeze it and send the
      // pre-filled ratings to the coach (observe-draft). No reflective chat.
      if (isObservation) {
        const ObserveDraft = require('../observe/observe-draft.service');
        await ObserveDraft.onAnalysisReady(coachingSessionId, from);
        logToFile('✅ Analysis processing complete (observation draft sent)', { coachingSessionId });
        return;
      }

      // Send progress update - Step 3
      const lang3 = await _resolveSessionLanguage(coachingSessionId);
      await WhatsAppService.sendMessage(from, getCoachingMessage('step3_reflecting', lang3));

      // Brief pause before first question
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Start reflective conversation
      const ReflectiveConversationService = require('./reflective-conversation.service');
      await ReflectiveConversationService.conductReflectiveConversation(coachingSessionId, from);

      logToFile('✅ Analysis processing complete', { coachingSessionId });
    } catch (error) {
      await this.handleAnalysisError(coachingSessionId, error, payload.from);
      throw error;
    }
  }

  /**
   * Send progress update to user
   * @param {string} phoneNumber - User's phone number
   * @param {number} step - Current step (1-5)
   * @returns {Promise<void>}
   */
  static async sendProgressUpdate(phoneNumber, step, languageCode = 'en') {
    try {
      // Step 2 catalog string carries the canonical "2/5" — we tolerate
      // callers passing other step numbers (e.g. legacy callers) and
      // substitute via simple string replacement to preserve message
      // localisation while still letting callers control the step counter.
      const base = getCoachingMessage('step2_analyzing', languageCode);
      const text = step === 2 ? base : base.replace('2/5', `${step}/5`);
      await WhatsAppService.sendMessage(phoneNumber, text);

      // Send pedagogical analysis animation if available
      if (PEDAGOGICAL_ANALYSIS_MEDIA_ID) {
        await WhatsAppService.sendSticker(phoneNumber, PEDAGOGICAL_ANALYSIS_MEDIA_ID);
      }
    } catch (error) {
      logToFile('⚠️  Failed to send progress update (non-critical)', {
        error: error.message,
        phoneNumber
      });
    }
  }

  /**
   * Handle analysis error
   * @param {string} coachingSessionId - Coaching session UUID
   * @param {Error} error - Error object
   * @param {string} phoneNumber - User's phone number (optional)
   * @returns {Promise<void>}
   */
  static async handleAnalysisError(coachingSessionId, error, phoneNumber) {
    try {
      logToFile('❌ Error in processAnalysis', {
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
      await CoachingSessionService.markAsFailed(coachingSessionId, 'analysis', error.message);

      // Notify user (bilingual)
      if (from) {
        const errorMessage = "معذرت، آپ کی کلاس کا تجزیہ کرتے وقت خرابی آ گئی۔ براہ کرم دوبارہ کوشش کریں۔\n\nSorry, there was an error analyzing your classroom. Please try again.";
        await WhatsAppService.sendMessage(from, errorMessage);
      }
    } catch (handlerError) {
      logToFile('❌ Error in handleAnalysisError', {
        error: handlerError.message,
        coachingSessionId
      });
    }
  }
}

module.exports = AnalysisProcessorService;
