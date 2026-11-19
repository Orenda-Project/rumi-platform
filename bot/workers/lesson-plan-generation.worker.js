/**
 * Lesson Plan Generation Worker
 * Processes lesson plan generation jobs from SQS queue
 *
 * Survives server restarts - job persists in SQS queue
 * Handles retries and sends apology message on max failures
 */

require('dotenv').config();

const { logToFile } = require('../shared/utils/logger');
const { redactUrl } = require('../shared/utils/redact-url');
const supabase = require('../shared/config/supabase');
const ContentService = require('../shared/services/content.service');
const WhatsAppService = require('../shared/services/whatsapp.service');
const LessonPlanQueueService = require('../shared/services/lesson-plan-queue.service');
const FeatureLinkerService = require('../shared/services/feature-linker.service');
const FeatureRegistrationService = require('../shared/services/feature-registration.service');
const { storeLessonPlan } = require('../shared/database/bot-helpers');
const { planContentFromPdfFile } = require('../shared/services/coaching/fidelity/lesson-plan-text');
const { privateTempPath, removePrivateTemp } = require('../shared/utils/private-temp');

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
  },
  hi: {
    successWithPdf: (topic) => `✅ आपका lesson plan तैयार है!\n\nविषय: ${topic}\n\nयह पाँच चरणों वाला lesson plan आपकी कक्षा में इस्तेमाल के लिए तैयार है।`,
    successWithoutPdf: (topic, gammaUrl) => `✅ "${topic}" पर आपका lesson plan तैयार है!\n\nयहाँ देखें: ${gammaUrl}`,
    apology: "माफ़ कीजिए, आपका lesson plan बनाने में समस्या आई। कृपया अपना अनुरोध एक बार फिर भेजें।",
    error: "माफ़ कीजिए, lesson plan बनाने में गड़बड़ी हुई। कृपया फिर से कोशिश करें।"
  },
  bn: {
    successWithPdf: (topic) => `✅ আপনার lesson plan তৈরি!\n\nবিষয়: ${topic}\n\nএই পাঁচ ধাপের lesson plan আপনার ক্লাসে ব্যবহারের জন্য তৈরি।`,
    successWithoutPdf: (topic, gammaUrl) => `✅ "${topic}" নিয়ে আপনার lesson plan তৈরি!\n\nএখানে দেখুন: ${gammaUrl}`,
    apology: "দুঃখিত, আপনার lesson plan তৈরি করতে সমস্যা হয়েছে। অনুগ্রহ করে আপনার অনুরোধটি আরেকবার পাঠান।",
    error: "দুঃখিত, lesson plan তৈরি করতে ত্রুটি হয়েছে। অনুগ্রহ করে আবার চেষ্টা করুন।"
  },
  mr: {
    successWithPdf: (topic) => `✅ तुमचा lesson plan तयार आहे!\n\nविषय: ${topic}\n\nहा पाच टप्प्यांचा lesson plan तुमच्या वर्गात वापरण्यासाठी तयार आहे.`,
    successWithoutPdf: (topic, gammaUrl) => `✅ "${topic}" वरील तुमचा lesson plan तयार आहे!\n\nइथे पाहा: ${gammaUrl}`,
    apology: "माफ करा, तुमचा lesson plan तयार करताना अडचण आली. कृपया तुमची विनंती पुन्हा एकदा पाठवा.",
    error: "माफ करा, lesson plan तयार करताना त्रुटी आली. कृपया पुन्हा प्रयत्न करा."
  },
  te: {
    successWithPdf: (topic) => `✅ మీ lesson plan సిద్ధంగా ఉంది!\n\nఅంశం: ${topic}\n\nఈ ఐదు దశల lesson plan మీ తరగతిలో ఉపయోగించడానికి సిద్ధంగా ఉంది.`,
    successWithoutPdf: (topic, gammaUrl) => `✅ "${topic}" పై మీ lesson plan సిద్ధంగా ఉంది!\n\nఇక్కడ చూడండి: ${gammaUrl}`,
    apology: "క్షమించండి, మీ lesson plan తయారు చేయడంలో సమస్య వచ్చింది. దయచేసి మీ అభ్యర్థనను మరోసారి పంపండి.",
    error: "క్షమించండి, lesson plan తయారు చేయడంలో లోపం జరిగింది. దయచేసి మళ్ళీ ప్రయత్నించండి."
  },
  'ta-IN': {
    successWithPdf: (topic) => `✅ உங்கள் lesson plan தயார்!\n\nதலைப்பு: ${topic}\n\nஇந்த ஐந்து படி lesson plan உங்கள் வகுப்பறையில் பயன்படுத்த தயாராக உள்ளது.`,
    successWithoutPdf: (topic, gammaUrl) => `✅ "${topic}" பற்றிய உங்கள் lesson plan தயார்!\n\nஇங்கே பாருங்கள்: ${gammaUrl}`,
    apology: "மன்னிக்கவும், உங்கள் lesson plan-ஐ உருவாக்குவதில் சிக்கல் ஏற்பட்டது. உங்கள் கோரிக்கையை மீண்டும் ஒருமுறை அனுப்புங்கள்.",
    error: "மன்னிக்கவும், lesson plan உருவாக்குவதில் பிழை ஏற்பட்டது. மீண்டும் முயற்சிக்கவும்."
  },
  kn: {
    successWithPdf: (topic) => `✅ ನಿಮ್ಮ lesson plan ಸಿದ್ಧವಾಗಿದೆ!\n\nವಿಷಯ: ${topic}\n\nಈ ಐದು ಹಂತಗಳ lesson plan ನಿಮ್ಮ ತರಗತಿಯಲ್ಲಿ ಬಳಸಲು ಸಿದ್ಧವಾಗಿದೆ.`,
    successWithoutPdf: (topic, gammaUrl) => `✅ "${topic}" ಕುರಿತ ನಿಮ್ಮ lesson plan ಸಿದ್ಧವಾಗಿದೆ!\n\nಇಲ್ಲಿ ನೋಡಿ: ${gammaUrl}`,
    apology: "ಕ್ಷಮಿಸಿ, ನಿಮ್ಮ lesson plan ರಚಿಸುವಲ್ಲಿ ಸಮಸ್ಯೆಯಾಯಿತು. ದಯವಿಟ್ಟು ನಿಮ್ಮ ವಿನಂತಿಯನ್ನು ಇನ್ನೊಮ್ಮೆ ಕಳುಹಿಸಿ.",
    error: "ಕ್ಷಮಿಸಿ, lesson plan ರಚಿಸುವಲ್ಲಿ ದೋಷ ಉಂಟಾಯಿತು. ದಯವಿಟ್ಟು ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ."
  },
  fr: {
    successWithPdf: (topic) => `✅ Votre plan de leçon est prêt !\n\nSujet : ${topic}\n\nCe plan de leçon en cinq étapes est prêt à être utilisé en classe.`,
    successWithoutPdf: (topic, gammaUrl) => `✅ Votre plan de leçon sur « ${topic} » est prêt !\n\nConsultez-le ici : ${gammaUrl}`,
    apology: "Désolé, un problème est survenu lors de la création de votre plan de leçon. Veuillez renvoyer votre demande.",
    error: "Désolé, une erreur est survenue lors de la création du plan de leçon. Veuillez réessayer."
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
          gammaUrl: redactUrl(existingRequest.gamma_url)
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
        gammaUrl: redactUrl(result.gammaUrl),
        hasPdf: !!result.pdfUrl
      });

      // 3. Download and send PDF if available
      let planContent = null;
      if (result.pdfUrl) {
        const safeTopic = topic.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_').substring(0, 50);
        const pdfFilename = `${contentType}_${safeTopic}.pdf`;
        // The name is the topic, so two teachers asking for the same topic share
        // it: download into a directory of this job's own, or one teacher is sent
        // the other's plan. The file keeps the name the teacher sees.
        const tmp = privateTempPath(TEMP_DIR, pdfFilename, 'lesson-plan-');
        const pdfPath = tmp.filePath;

        try {
          await ContentService.downloadPDF(result.pdfUrl, pdfFilename, tmp.dir);

          // Keep the plan's text on its row: a teacher can later say "this is the plan I taught" for a lesson
          // recording, and lesson-plan fidelity reads the plan from this text.
          if (contentType === 'lesson_plan') {
            planContent = await planContentFromPdfFile(pdfPath);
          }

          await WhatsAppService.sendDocument(
            phoneNumber,
            pdfPath,
            pdfFilename,
            messages.successWithPdf(topic)
          );
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
        } finally {
          removePrivateTemp(tmp);
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
        await storeLessonPlan(userId, topic, contentType, result.gammaUrl, result.pdfUrl, planContent);
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

      // A failure no retry can fix (the generation API rejecting our key or the
      // request itself) is final NOW: waiting for MAX_RETRIES only delays the
      // apology, and on a queue that does not redeliver (BullMQ as configured
      // today -- see issue #108) the teacher would never hear back at all.
      const permanent = isPermanentFailure(error);

      // If max retries exceeded, send apology and STOP (don't re-throw)
      if (retryCount >= MAX_RETRIES || permanent) {
        if (permanent) {
          logToFile('Lesson plan failure is not retryable -- telling the teacher now', {
            requestId, status: error.response?.status, retryCount,
          });
        }
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

/**
 * Whether retrying cannot help: the generation API answered with a client
 * error (400 bad request, 401/403 bad or missing key, 404, 422). A 408/429 or
 * any 5xx/network error is transient and keeps the normal retry path.
 */
function isPermanentFailure(error) {
  const status = error?.response?.status;
  return [400, 401, 403, 404, 422].includes(status);
}

module.exports = LessonPlanGenerationWorker;
module.exports.isPermanentFailure = isPermanentFailure;
