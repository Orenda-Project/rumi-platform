/**
 * Lesson Plan Processor Service
 * Handles lesson plan document processing for classroom observations
 *
 * Responsibilities:
 * - Process Yes/No lesson plan responses
 * - Download and store lesson plan documents
 * - Extract text from documents (PDF/Word/Images)
 * - Upload to R2 storage
 * - Queue analysis job
 *
 * Extracted from coaching.service.js as part of Phase 3 refactoring
 */

const supabase = require('../../config/supabase');
const { logToFile } = require('../../utils/logger');
const WhatsAppService = require('../whatsapp.service');
const CoachingSessionService = require('./coaching-session.service');
const CoachingJobQueueService = require('./coaching-job-queue.service');
const { uploadLessonPlanBuffer, buildR2PublicUrl } = require('../../storage/r2');

class LessonPlanProcessorService {
  /**
   * Handle lesson plan response (Yes/No/Document upload)
   * @param {string} coachingSessionId - Coaching session UUID
   * @param {string} from - User's phone number
   * @param {boolean} hasLessonPlan - Whether user has lesson plan
   * @param {string|null} documentId - WhatsApp document media ID (if uploaded)
   * @returns {Promise<void>}
   */
  static async handleLessonPlanResponse(coachingSessionId, from, hasLessonPlan, documentId = null) {
    try {
      logToFile('Handling lesson plan response', {
        coachingSessionId,
        hasLessonPlan,
        hasDocument: !!documentId
      });

      if (!hasLessonPlan) {
        // User doesn't have lesson plan - proceed immediately to analysis
        await supabase
          .from('coaching_sessions')
          .update({
            has_lesson_plan: false
          })
          .eq('id', coachingSessionId);

        await WhatsAppService.sendMessage(from, "No problem! I'll analyze your classroom audio without the lesson plan.");

        // Queue analysis job
        const CoachingJobQueueService = require('./coaching-job-queue.service');
        await CoachingJobQueueService.queueAnalysis(coachingSessionId, { from });
        return;
      }

      // User has lesson plan
      if (documentId) {
        await this.handleLessonPlanUpload(coachingSessionId, from, documentId);
        // Queue analysis job immediately; LP extraction happens in background
        await CoachingJobQueueService.queueAnalysis(coachingSessionId, { from, lpUploaded: true });
      } else {
        // User said yes but no document yet - ask them to send it
        await WhatsAppService.sendMessage(from,
          "Great! Please send your lesson plan as a document (PDF, Word, or image).\n\nTap 📎 → Document to upload it."
        );

        // Set timeout for 24 hours with reminders
        // TODO: Implement reminder system (can be done in Phase 4)
      }
    } catch (error) {
      logToFile('❌ Error in handleLessonPlanResponse', {
        error: error.message,
        coachingSessionId
      });
      throw error;
    }
  }

  static async handleLessonPlanUpload(coachingSessionId, from, documentId) {
    try {
      logToFile('Processing lesson plan upload (async)', { coachingSessionId, documentId });

      const session = await CoachingSessionService.getSession(coachingSessionId);
      if (!session) {
        throw new Error('Coaching session not found');
      }

      const docData = await WhatsAppService.downloadMedia(documentId);
      const fileType = this.detectFileType(docData);
      const r2Key = await uploadLessonPlanBuffer({
        buffer: docData,
        userId: session.user_id,
        sessionId: coachingSessionId,
        fileType
      });

      const lessonPlanUrl = buildR2PublicUrl(r2Key);

      await supabase
        .from('coaching_sessions')
        .update({
          has_lesson_plan: true,
          lesson_plan_url: lessonPlanUrl,
          lesson_plan_r2_key: r2Key,
          lesson_plan_format: fileType,
          lesson_plan_extraction_status: 'pending',
          lesson_plan_extraction_error: null
        })
        .eq('id', coachingSessionId);

      await CoachingJobQueueService.queueLessonPlanExtraction(coachingSessionId, {
        r2Key,
        fileType,
        userId: session.user_id
      });

      await WhatsAppService.sendMessage(from,
        "📄 Lesson plan received! I'm processing it in the background and will weave it into your analysis."
      );

      logToFile('Lesson plan queued for extraction', {
        coachingSessionId,
        fileType,
        r2Key
      });
    } catch (error) {
      logToFile('❌ Error handling lesson plan upload', {
        error: error.message,
        coachingSessionId
      });
      throw error;
    }
  }

  static detectFileType(buffer) {
    if (!buffer || buffer.length < 4) {
      return 'pdf';
    }

    const bytes = buffer.subarray(0, 8);
    const hex = bytes.toString('hex');

    if (hex.startsWith('25504446')) {
      return 'pdf';
    }

    if (hex.startsWith('504b0304')) {
      return 'docx';
    }

    if (hex.startsWith('d0cf11e0')) {
      return 'doc';
    }

    if (hex.startsWith('ffd8ff')) {
      return 'jpg';
    }

    if (hex.startsWith('89504e47')) {
      return 'png';
    }

    return 'pdf';
  }
}

module.exports = LessonPlanProcessorService;
