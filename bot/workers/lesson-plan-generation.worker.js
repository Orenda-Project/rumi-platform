/**
 * Lesson Plan Generation Worker
 * Processes lesson plan generation jobs from SQS queue
 *
 * Survives server restarts - job persists in SQS queue
 * Handles retries and sends apology message on max failures
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');

const { logToFile } = require('../shared/utils/logger');
const supabase = require('../shared/config/supabase');
const ContentService = require('../shared/services/content.service');
const WhatsAppService = require('../shared/services/whatsapp.service');
const LessonPlanQueueService = require('../shared/services/lesson-plan-queue.service');
const FeatureLinkerService = require('../shared/services/feature-linker.service');
const FeatureRegistrationService = require('../shared/services/feature-registration.service');
const { storeLessonPlan } = require('../shared/database/bot-helpers');

// Temp directory for PDF downloads
const TEMP_DIR = process.env.TEMP_DIR || '/tmp';

// Max retries before sending apology
const MAX_RETRIES = 3;

/**
 * Bilingual messages for user communication
 */
const MESSAGES = {
  en: {
    successWithPdf: (topic) => `✅ Your lesson plan is ready!\n\nTopic: ${topic}\n\nThis five-step lesson plan is ready for use in your classroom.`,
    successWithoutPdf: (topic, gammaUrl) => `✅ Your lesson plan on "${topic}" is ready!\n\nView it here: ${gammaUrl}`,
    apology: "I'm sorry, there was a problem creating your lesson plan. Please try again by sending your request one more time.",
    error: "Sorry, there was an error creating the lesson plan. Please try again."
  },
  ur: {
    successWithPdf: (topic) => `✅ آپ کا لیسن پلان تیار ہے!\n\nموضوع: ${topic}\n\nیہ پانچ قدمی لیسن پلان آپ کی کلاس میں استعمال کے لیے تیار ہے۔`,
    successWithoutPdf: (topic, gammaUrl) => `✅ "${topic}" پر آپ کا لیسن پلان تیار ہے!\n\nیہاں دیکھیں: ${gammaUrl}`,
    apology: "معذرت، آپ کا لیسن پلان بنانے میں مسئلہ ہوا۔ براہ کرم اپنی درخواست دوبارہ بھیج کر کوشش کریں۔",
    error: "معذرت، لیسن پلان بنانے میں خرابی ہوئی۔ براہ کرم دوبارہ کوشش کریں۔"
  },
  ar: {
    successWithPdf: (topic) => `✅ خطة درسك جاهزة!\n\nالموضوع: ${topic}\n\nخطة الدرس هذه المكونة من خمس خطوات جاهزة للاستخدام في فصلك.`,
    successWithoutPdf: (topic, gammaUrl) => `✅ خطة درسك حول "${topic}" جاهزة!\n\nشاهدها هنا: ${gammaUrl}`,
    apology: "عذراً، حدثت مشكلة في إنشاء خطة درسك. يرجى المحاولة مرة أخرى بإرسال طلبك مرة أخرى.",
    error: "عذراً، حدث خطأ في إنشاء خطة الدرس. يرجى المحاولة مرة أخرى."
  },
  es: {
    successWithPdf: (topic) => `✅ ¡Tu plan de lección está listo!\n\nTema: ${topic}\n\nEste plan de lección de cinco pasos está listo para usar en tu aula.`,
    successWithoutPdf: (topic, gammaUrl) => `✅ ¡Tu plan de lección sobre "${topic}" está listo!\n\nMíralo aquí: ${gammaUrl}`,
    apology: "Lo siento, hubo un problema al crear tu plan de lección. Por favor intenta de nuevo enviando tu solicitud una vez más.",
    error: "Lo siento, hubo un error al crear el plan de lección. Por favor intenta de nuevo."
  }
};

class LessonPlanGenerationWorker {
  /**
   * Process a lesson plan generation job
   * @param {Object} jobData - Job payload from SQS
   */
  static async process(jobData) {
    const { requestId, userId, phoneNumber, topic, fullMessage, language = 'en', contentType = 'lesson_plan' } = jobData;

    const messages = MESSAGES[language] || MESSAGES.en;

    try {
      // IDEMPOTENCY CHECK: Prevent duplicate processing
      const existingRequest = await LessonPlanQueueService.getRequest(requestId);

      if (existingRequest?.status === 'completed') {
        logToFile('⏭️ Request already completed, skipping duplicate processing', {
          requestId,
          completedAt: existingRequest.completed_at,
          gammaUrl: existingRequest.gamma_url
        });
        return; // Exit without processing
      }

      // Also skip if already failed with max retries (prevents infinite loop)
      if (existingRequest?.status === 'failed' && existingRequest?.retry_count >= MAX_RETRIES) {
        logToFile('⏭️ Request already failed with max retries, skipping', {
          requestId,
          retryCount: existingRequest.retry_count,
          errorMessage: existingRequest.error_message
        });
        return; // Exit without processing - job was already finalized
      }

      if (existingRequest?.status === 'processing') {
        const processingAge = Date.now() - new Date(existingRequest.processing_started_at).getTime();
        const TWO_MINUTES = 2 * 60 * 1000;

        if (processingAge < TWO_MINUTES) {
          logToFile('⏭️ Request being processed by another worker, skipping', {
            requestId,
            processingStartedAt: existingRequest.processing_started_at,
            ageMs: processingAge
          });
          return; // Exit - another worker is handling it
        }
        // If > 2 min, proceed (stale job recovery)
        logToFile('🔄 Recovering stale processing request', {
          requestId,
          processingStartedAt: existingRequest.processing_started_at,
          ageMinutes: (processingAge / 60000).toFixed(1)
        });
      }

      logToFile('Starting lesson plan generation', {
        requestId,
        userId,
        topic,
        contentType
      });

      // 1. Mark as processing
      await LessonPlanQueueService.markProcessing(requestId);

      // 2. Generate with Gamma API
      let result;
      if (contentType === 'presentation') {
        result = await ContentService.generatePresentation(topic, fullMessage, language);
      } else {
        result = await ContentService.generateLessonPlan(topic, fullMessage, language);
      }

      logToFile('Gamma generation complete', {
        requestId,
        gammaUrl: result.gammaUrl,
        hasPdf: !!result.pdfUrl
      });

      // 3. Download and send PDF if available
      if (result.pdfUrl) {
        const safeTopic = topic.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_').substring(0, 50);
        const pdfFilename = `${contentType}_${safeTopic}.pdf`;
        const pdfPath = path.join(TEMP_DIR, pdfFilename);

        try {
          await ContentService.downloadPDF(result.pdfUrl, pdfFilename, TEMP_DIR);

          await WhatsAppService.sendDocument(
            phoneNumber,
            pdfPath,
            pdfFilename,
            messages.successWithPdf(topic)
          );

          // Clean up temp file
          if (fs.existsSync(pdfPath)) {
            fs.unlinkSync(pdfPath);
          }
        } catch (pdfError) {
          logToFile('PDF download/send failed, falling back to URL', {
            requestId,
            error: pdfError.message
          });

          // Fallback to URL only
          await WhatsAppService.sendMessage(
            phoneNumber,
            messages.successWithoutPdf(topic, result.gammaUrl)
          );
        }
      } else {
        // No PDF, send Gamma URL
        await WhatsAppService.sendMessage(
          phoneNumber,
          messages.successWithoutPdf(topic, result.gammaUrl)
        );
      }

      // 4. Store in lesson_plans table
      try {
        await storeLessonPlan(userId, topic, contentType, result.gammaUrl, result.pdfUrl);
        logToFile('Lesson plan stored in database', { requestId, userId });
      } catch (storeError) {
        logToFile('Warning: Failed to store lesson plan', {
          requestId,
          error: storeError.message
        });
      }

      // 5. Mark request as completed
      await LessonPlanQueueService.markCompleted(requestId, result);

      // 6. Feature linker suggestion (non-blocking)
      try {
        await FeatureLinkerService.suggestNext(
          contentType === 'presentation' ? 'presentation' : 'lesson_plan',
          userId,
          phoneNumber,
          language,
          { topic }
        );
      } catch (linkerError) {
        logToFile('Feature linker error (non-fatal)', { error: linkerError.message });
      }

      // 7. Check and trigger registration if needed (non-blocking)
      try {
        await FeatureRegistrationService.checkAndTriggerRegistration(
          userId,
          contentType === 'presentation' ? 'presentation' : 'lesson_plan',
          phoneNumber,
          language,
          'text' // Lesson plans are requested via text
        );
      } catch (regError) {
        logToFile('Registration trigger error (non-fatal)', { error: regError.message });
      }

      logToFile('Lesson plan generation completed successfully', { requestId });

    } catch (error) {
      logToFile('Lesson plan generation failed', {
        requestId,
        error: error.message,
        stack: error.stack
      });

      // Get current retry count
      const request = await LessonPlanQueueService.getRequest(requestId);
      const retryCount = (request?.retry_count || 0) + 1;

      // Mark as failed (increments retry_count)
      await LessonPlanQueueService.markFailed(requestId, error.message);

      // If max retries exceeded, send apology and STOP (don't re-throw)
      if (retryCount >= MAX_RETRIES) {
        try {
          await WhatsAppService.sendMessage(phoneNumber, messages.apology);
          logToFile('Apology message sent after max retries - job complete', { requestId, retryCount });
        } catch (msgError) {
          logToFile('Failed to send apology message', { error: msgError.message });
        }
        // DON'T re-throw - let job complete and be removed from SQS
        // This prevents infinite retry loop
        return;
      }

      // Only re-throw if retries remain (let SQS handle retry)
      throw error;
    }
  }
}

module.exports = LessonPlanGenerationWorker;
