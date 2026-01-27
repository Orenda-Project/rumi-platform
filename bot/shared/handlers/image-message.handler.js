/**
 * Image Message Handler
 *
 * Handles image messages for multimodal vision analysis using GPT-4.1-mini.
 * Teachers can send classroom photos, worksheets, student work, etc.
 * for analysis and feedback.
 *
 * Features:
 * - Idempotency via Redis (prevents duplicate processing)
 * - R2 storage with retry (image persists for retry capability)
 * - Database tracking (image_analysis_requests table)
 * - Structured logging with correlation IDs
 */

const WhatsAppService = require('../services/whatsapp.service');
const VisionService = require('../services/vision.service');
const redisService = require('../services/cache/railway-redis.service');
const supabase = require('../config/supabase');
const { uploadImageWithRetry } = require('../storage/r2');
const { logToFile } = require('../utils/logger');
const { logEvent, runWithCorrelation, generateCorrelationId } = require('../utils/structured-logger');
const { getUserLanguage } = require('../utils/language-cache');
const { storeConversation, getOrCreateSession } = require('../database/bot-helpers');

// Idempotency TTL (1 hour - prevents reprocessing of same image)
const IDEMPOTENCY_TTL_SECONDS = 3600;

/**
 * Handle image message processing
 * @param {Object} message - WhatsApp message object
 * @param {string} from - Sender phone number
 * @param {Object|null} user - User object from database
 * @returns {Promise<void>}
 */
async function handleImageMessage(message, from, user = null) {
  const correlationId = generateCorrelationId();
  const startTime = Date.now();

  return runWithCorrelation(correlationId, async () => {
    logEvent('image.analysis.started', {
      userId: user?.id,
      phoneNumber: from,
      hasCaption: !!message.image?.caption
    });

    // Start typing indicator
    const typingController = WhatsAppService.startContinuousTypingIndicator(from, message.id);

    try {
      // Extract image info
      const imageId = message.image?.id;
      const mimeType = message.image?.mime_type || 'image/jpeg';
      const caption = message.image?.caption || '';

      if (!imageId) {
        throw new Error('No image ID found in message');
      }

      logToFile('📷 Image message received', {
        imageId,
        mimeType,
        hasCaption: !!caption,
        captionPreview: caption.substring(0, 50)
      });

      // Check if user exists
      if (!user) {
        logToFile('⚠️ Image received from unregistered user', { from });
        typingController.stop();

        await WhatsAppService.sendMessage(
          from,
          "Please send a text message first so I can set up your account.\n\n" +
          "براہ کرم پہلے ایک ٹیکسٹ پیغام بھیجیں تاکہ میں آپ کا اکاؤنٹ بنا سکوں۔"
        );
        return;
      }

      // ============================================================
      // EXAM CHECKER DETECTION (bd-086): Check for active exam session
      // ============================================================
      try {
        const ExamCheckerHandler = require('./exam-checker.handler');
        const result = await ExamCheckerHandler.handleExamImage(message, from, user);
        if (result && result.handled) {
          logToFile('✅ Image handled by Exam Checker', { userId: user.id });
          typingController.stop();
          return;
        }
      } catch (examError) {
        logToFile('⚠️ Error in exam checker image detection', { error: examError.message });
        // Continue with regular image analysis
      }

      // Get or create session for conversation history
      const sessionId = await getOrCreateSession(user.id);

      // Idempotency check - prevent duplicate processing
      const idempotencyKey = `image:${user.id}:${imageId}`;
      const existingResult = await redisService.get(idempotencyKey);

      if (existingResult) {
        logToFile('🔄 Duplicate image detected, returning cached result', {
          imageId,
          userId: user.id
        });

        typingController.stop();

        // Parse cached result and send
        const cached = JSON.parse(existingResult);
        await WhatsAppService.sendMessage(from, cached.response);
        return;
      }

      // Get user's language preference
      const userLanguage = await getUserLanguage(user.id) || user.preferred_language || 'en';

      // Create database record for tracking
      const { data: analysisRequest, error: dbError } = await supabase
        .from('image_analysis_requests')
        .insert({
          user_id: user.id,
          image_url: 'pending', // Will update after R2 upload
          image_metadata: {
            whatsappMediaId: imageId,
            mimeType,
            caption,
            uploadedAt: new Date().toISOString()
          },
          status: 'processing',
          started_at: new Date().toISOString(),
          correlation_id: correlationId
        })
        .select()
        .single();

      if (dbError) {
        logToFile('⚠️ Failed to create analysis request record', {
          error: dbError.message,
          userId: user.id
        });
        // Continue anyway - database tracking is nice-to-have
      }

      const requestId = analysisRequest?.id;

      // Step 1: Download image from WhatsApp
      logToFile('Step 1: Downloading image from WhatsApp...', { imageId });
      const imageBuffer = await WhatsAppService.downloadMedia(imageId);
      logToFile('Image downloaded', { sizeBytes: imageBuffer.length });

      // Step 2: Upload to R2 with retry
      logToFile('Step 2: Uploading image to R2 storage...');
      let imageUrl;
      try {
        imageUrl = await uploadImageWithRetry(imageBuffer, user.id, imageId, mimeType);
        logToFile('✅ Image uploaded to R2', { imageUrl });

        // Update database record with R2 URL
        if (requestId) {
          await supabase
            .from('image_analysis_requests')
            .update({ image_url: imageUrl })
            .eq('id', requestId);
        }
      } catch (uploadError) {
        logToFile('❌ R2 upload failed', { error: uploadError.message });
        // Continue with base64 fallback - analysis still possible
        imageUrl = null;
      }

      // Step 3: Analyze image with Vision service
      logToFile('Step 3: Analyzing image with GPT-4.1-mini...');

      // Build analysis prompt based on context
      let analysisPrompt = caption
        ? `The teacher sent this image with the following context: "${caption}". Analyze the image and provide helpful feedback.`
        : 'Analyze this classroom-related image. It could be student work, a worksheet, whiteboard content, or classroom setup. Provide constructive feedback.';

      // Add language instruction
      if (userLanguage === 'ur') {
        analysisPrompt += '\n\nPlease respond in Urdu (اردو) with some English technical terms where appropriate.';
      } else if (userLanguage === 'ar') {
        analysisPrompt += '\n\nPlease respond in Arabic (العربية).';
      } else if (userLanguage === 'es') {
        analysisPrompt += '\n\nPlease respond in Spanish (Español).';
      }

      // Analyze with vision service - always use buffer (service handles base64 conversion)
      const analysisResult = await VisionService.analyzeWithRetry(
        imageBuffer,
        mimeType,
        {
          prompt: analysisPrompt,
          language: userLanguage
        }
      );

      logEvent('image.analysis.completed', {
        requestId,
        userId: user.id,
        durationMs: Date.now() - startTime,
        tokensUsed: analysisResult.usage?.totalTokens || 0,
        success: analysisResult.success
      });

      // Handle analysis result
      let responseMessage;
      if (analysisResult.success) {
        responseMessage = analysisResult.analysis;

        // Update database with success
        if (requestId) {
          await supabase
            .from('image_analysis_requests')
            .update({
              status: 'completed',
              completed_at: new Date().toISOString(),
              analysis_result: {
                success: true,
                analysis: analysisResult.analysis,
                usage: analysisResult.usage,
                model: analysisResult.model,
                detail: analysisResult.detail
              },
              tokens_used: analysisResult.usage?.totalTokens || 0
            })
            .eq('id', requestId);
        }

        // Cache successful result for idempotency
        await redisService.set(
          idempotencyKey,
          JSON.stringify({ response: responseMessage, timestamp: Date.now() }),
          IDEMPOTENCY_TTL_SECONDS
        );

        // Store in conversation history for follow-up context
        try {
          await storeConversation(user.id, 'user', `[Sent image${caption ? `: "${caption}"` : ''}]`, 'image', sessionId);
          await storeConversation(user.id, 'assistant', responseMessage, 'text', sessionId);
          logToFile('✅ Image conversation stored for context', { userId: user.id, sessionId });
        } catch (storeError) {
          logToFile('⚠️ Failed to store image conversation', { error: storeError.message });
        }
      } else {
        // Analysis failed
        logToFile('❌ Image analysis failed', {
          error: analysisResult.error,
          requestId
        });

        // Update database with failure
        if (requestId) {
          await supabase
            .from('image_analysis_requests')
            .update({
              status: 'failed',
              completed_at: new Date().toISOString(),
              last_error: analysisResult.error,
              retry_count: (analysisRequest?.retry_count || 0) + 1
            })
            .eq('id', requestId);
        }

        // Send error message in user's language
        const errorMessages = {
          en: "Sorry, I couldn't analyze this image. Please try again with a clearer photo.\n\nTip: Make sure the image is well-lit and not blurry.",
          ur: "معذرت، میں اس تصویر کا تجزیہ نہیں کر سکی۔ براہ کرم ایک صاف تصویر کے ساتھ دوبارہ کوشش کریں۔\n\nمشورہ: یقینی بنائیں کہ تصویر روشن اور واضح ہو۔",
          ar: "عذرًا، لم أتمكن من تحليل هذه الصورة. يرجى المحاولة مرة أخرى بصورة أوضح.\n\nنصيحة: تأكد من أن الصورة مضاءة جيدًا وغير ضبابية.",
          es: "Lo siento, no pude analizar esta imagen. Por favor intenta de nuevo con una foto más clara.\n\nConsejo: Asegúrate de que la imagen esté bien iluminada y no borrosa."
        };

        responseMessage = errorMessages[userLanguage] || errorMessages.en;
      }

      // Stop typing and send response
      typingController.stop();
      await WhatsAppService.sendMessage(from, responseMessage);

      logToFile('✅ Image analysis response sent', {
        userId: user.id,
        requestId,
        durationMs: Date.now() - startTime
      });

    } catch (error) {
      logEvent('image.analysis.failed', {
        userId: user?.id,
        durationMs: Date.now() - startTime,
        errorType: error.name,
        errorMessage: error.message
      });

      logToFile('❌ Error processing image message', {
        error: error.message,
        stack: error.stack,
        userId: user?.id
      });

      typingController.stop();

      // Send user-friendly error message
      const userLanguage = user?.preferred_language || 'en';
      const errorMessages = {
        en: "Sorry, there was an error processing your image. Please try again.\n\nمعذرت، تصویر پر کارروائی کرتے وقت خرابی آ گئی۔",
        ur: "معذرت، تصویر پر کارروائی کرتے وقت خرابی آ گئی۔ براہ کرم دوبارہ کوشش کریں۔",
        ar: "عذرًا، حدث خطأ أثناء معالجة صورتك. يرجى المحاولة مرة أخرى.",
        es: "Lo siento, hubo un error al procesar tu imagen. Por favor intenta de nuevo."
      };

      await WhatsAppService.sendMessage(
        from,
        errorMessages[userLanguage] || errorMessages.en
      );
    }
  });
}

module.exports = {
  handleImageMessage
};
