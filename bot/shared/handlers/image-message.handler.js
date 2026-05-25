/**
 * Image Message Handler
 *
 * Handles image messages for multimodal vision analysis using GPT-4.1-mini.
 * Teachers can send classroom photos, worksheets, student work, etc.
 * for analysis and feedback.
 *
 * Routing order (each gate falls through to the next):
 *   1. Coaching classroom-photo collection (active coaching session)
 *   2. Exam checker (active exam session)
 *   3. Pic-to-LP: a textbook-page photo → illustrated lesson-plan PDF
 *   4. Generic vision analysis (fallback — feedback on any image)
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
const MAX_COACHING_PHOTOS = 3;

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
    let idempotencyAcquired = false; // Track if we own the lock (bd-691)

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
      // Phase 3 (bd-630): Classroom photo collection for coaching
      // ============================================================
      try {
        const coachingSupabase = require('../config/supabase');
        const { data: photoSession } = await coachingSupabase
          .from('coaching_sessions')
          .select('id, conversation_state')
          .eq('user_id', user.id)
          .eq('status', 'awaiting_photo')
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        if (photoSession && (photoSession.conversation_state?.current_state === 'COLLECTING_PHOTOS' || photoSession.conversation_state?.current_state === 'AWAITING_PHOTO')) {
          logToFile('📸 Phase 3: Classroom photo received for coaching session', {
            coachingSessionId: photoSession.id,
            userId: user.id
          });

          // Download and upload image to R2
          const imageId = message.image?.id;
          const imageBuffer = await WhatsAppService.downloadMedia(imageId);
          const { uploadImageWithRetry: uploadPhoto } = require('../storage/r2');
          const photoUrl = await uploadPhoto(imageBuffer, user.id, imageId, message.image?.mime_type || 'image/jpeg');

          const userLang = await getUserLanguage(user.id) || user.preferred_language || 'en';

          // Append photo URL to coaching_sessions.classroom_photos JSONB array
          const existingPhotos = photoSession.conversation_state?.classroom_photos || [];
          if (existingPhotos.length >= MAX_COACHING_PHOTOS) {
            await WhatsAppService.sendMessage(
              from,
              userLang === 'ur'
                ? '📸 آپ زیادہ سے زیادہ 3 تصاویر بھیج سکتی ہیں۔ اب تجزیہ شروع کیا جا رہا ہے۔'
                : '📸 You can upload a maximum of 3 photos. Starting analysis now.'
            );
            const CoachingSessionService = require('../services/coaching/coaching-session.service');
            const CoachingJobQueueService = require('../services/coaching/coaching-job-queue.service');
            await CoachingSessionService.updateStatus(photoSession.id, 'analysis_started');
            await CoachingJobQueueService.queueAnalysis(photoSession.id, {
              from,
              trigger: 'photo_max_limit_reached',
              photoCount: existingPhotos.length
            });
            typingController.stop();
            return;
          }

          existingPhotos.push({ url: photoUrl, uploaded_at: new Date().toISOString() });

          await coachingSupabase
            .from('coaching_sessions')
            .update({
              classroom_photos: existingPhotos,
              conversation_state: {
                ...photoSession.conversation_state,
                classroom_photos: existingPhotos
              }
            })
            .eq('id', photoSession.id);

          // Photo received — ask explicitly whether to add more photos or proceed.
          if (existingPhotos.length >= MAX_COACHING_PHOTOS) {
            await WhatsAppService.sendMessage(
              from,
              userLang === 'ur'
                ? `📸 تصویر ${existingPhotos.length} موصول۔ زیادہ سے زیادہ حد پوری ہو گئی ہے، اب تجزیہ شروع کیا جا رہا ہے۔`
                : `📸 Photo ${existingPhotos.length} received. Maximum reached, starting analysis now.`
            );
            const CoachingSessionService = require('../services/coaching/coaching-session.service');
            const CoachingJobQueueService = require('../services/coaching/coaching-job-queue.service');
            await CoachingSessionService.updateStatus(photoSession.id, 'analysis_started');
            await CoachingJobQueueService.queueAnalysis(photoSession.id, {
              from,
              trigger: 'photo_max_reached',
              photoCount: existingPhotos.length
            });
          } else {
            const confirmMsg = userLang === 'ur'
              ? `📸 تصویر ${existingPhotos.length} موصول۔ کیا آپ ایک اور تصویر شامل کرنا چاہیں گی؟`
              : `📸 Photo ${existingPhotos.length} received. Would you like to add another photo?`;
            await WhatsAppService.sendInteractiveButtons(from, {
              body: confirmMsg,
              buttons: [
                { id: `photo_more_${photoSession.id}`, title: userLang === 'ur' ? 'مزید تصویر' : 'Add another' },
                { id: `photo_done_${photoSession.id}`, title: userLang === 'ur' ? 'مکمل' : 'Done' }
              ]
            });
          }

          logToFile('📸 Coaching photo stored, waiting for more or timeout', {
            coachingSessionId: photoSession.id,
            photoCount: existingPhotos.length
          });

          typingController.stop();
          return;
        }
      } catch (photoCheckError) {
        logToFile('⚠️ Phase 3: Photo collection check failed (non-critical)', {
          error: photoCheckError.message
        });
        // Continue with regular image handling
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

      // ============================================================
      // PIC-TO-LP DETECTION: book-page → illustrated lesson plan
      // Slots AFTER coaching + exam-checker so neither flow is regressed.
      // tryPicLpRoute returns true once the image is enqueued to the batch
      // coalescer (which classifies once per batch and either starts an LP
      // session or falls back to generic vision analysis).
      // ============================================================
      try {
        const handled = await tryPicLpRoute({
          user,
          from,
          imageId,
          mimeType,
          caption,
          typingController,
        });
        if (handled) {
          // Tag idempotency so repeat sends don't fall through to vision analysis
          await redisService.set(
            `image:${user.id}:${imageId}`,
            JSON.stringify({ status: 'pic_lp_handled', timestamp: Date.now() }),
            IDEMPOTENCY_TTL_SECONDS
          );
          return;
        }
      } catch (picLpError) {
        logToFile('⚠️ Error in pic-to-LP routing (non-critical)', {
          error: picLpError.message,
          stack: picLpError.stack,
        });
        // Fall through to generic vision analysis
      }

      // Generic vision-feedback path. Extracted into runImageAnalysis so the
      // pic-LP batch coalescer can reuse it for non-textbook images (one reply
      // per batch).
      const result = await runImageAnalysis({
        user, from, imageId, mimeType, caption,
        typingController, correlationId, startTime,
      });
      idempotencyAcquired = result.idempotencyAcquired;
      return;
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

      // Only send error message if we acquired the idempotency lock (bd-691)
      // Without this guard, every concurrent failed handler sends an error message
      if (idempotencyAcquired) {
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
    }
  });
}

/**
 * Generic vision-feedback path (extracted from handleImageMessage so the
 * pic-LP batch coalescer can reuse it for non-textbook images).
 *
 * Steps: Redis idempotency lock → DB record (image_analysis_requests) → R2
 * upload → VisionService.analyzeWithRetry → send reply → cache result → store
 * conversation history.
 *
 * Throws on unexpected errors so the caller's outer try/catch can send the
 * localized generic error message (gated by idempotencyAcquired). Returns
 * `{ idempotencyAcquired }` so the caller can update its own flag for that guard.
 */
async function runImageAnalysis({ user, from, imageId, mimeType, caption, typingController, correlationId, startTime }) {
  // Get or create session for conversation history
  const sessionId = await getOrCreateSession(user.id);

  // Atomic idempotency check — SET NX ensures only one handler proceeds (bd-690)
  const idempotencyKey = `image:${user.id}:${imageId}`;
  const idempotencyAcquired = await redisService.setNX(
    idempotencyKey,
    JSON.stringify({ status: 'processing', startedAt: Date.now() }),
    IDEMPOTENCY_TTL_SECONDS
  );

  if (!idempotencyAcquired) {
    // Another handler already has this image — check for cached result
    const existingResult = await redisService.get(idempotencyKey);
    if (existingResult) {
      try {
        const cached = JSON.parse(existingResult);
        if (cached.response) {
          logToFile('🔄 Duplicate image, returning cached result', { imageId, userId: user.id });
          typingController.stop();
          await WhatsAppService.sendMessage(from, cached.response);
          return { idempotencyAcquired: false };
        }
      } catch (parseErr) {
        // Result still processing or invalid — just bail
      }
    }
    logToFile('🔄 Duplicate image detected, skipping (another handler active)', { imageId, userId: user.id });
    typingController.stop();
    return { idempotencyAcquired: false };
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

  return { idempotencyAcquired };
}

/**
 * Pic-to-LP routing. Decides whether an incoming image belongs to the pic-LP
 * flow and, if so, routes it (appending to an active page-collection session,
 * or enqueueing to the batch coalescer for fresh classification).
 *
 * Returns true if this image was handled by the pic-LP flow (and the caller
 * should stop). Returns false if the image should fall through to the generic
 * vision analysis path.
 *
 * Two paths inside:
 *   A) Active session in 'collecting_pages' → append page, prompt for more.
 *   B) Fresh image → enqueue to the batch coalescer (which classifies once per
 *      batch; BOOK_PAGE starts an LP session, otherwise falls back to vision).
 */
async function tryPicLpRoute({ user, from, imageId, mimeType, caption, typingController }) {
  // Lazy-require to keep startup cheap and avoid circular imports
  const PicLpSession = require('../services/pic-to-lp/pic-lp-session.service');
  const PageCollector = require('../services/pic-to-lp/page-collector.service');
  const ImageBatchCoalescer = require('../services/pic-to-lp/image-batch-coalescer.service');
  const { uploadImageWithRetry } = require('../storage/r2');

  // ---- Path A: active collecting_pages session for this user ----
  const activeSession = await PicLpSession.getActiveSession(user.id);
  if (activeSession && activeSession.status === 'collecting_pages') {
    const language = await getUserLanguage(user.id) || user.preferred_language || 'en';
    const imageBuffer = await WhatsAppService.downloadMedia(imageId);
    const url = await uploadImageWithRetry(imageBuffer, user.id, imageId, mimeType);
    const page = { url, mime: mimeType, uploaded_at: new Date().toISOString() };

    typingController.stop();
    const result = await PageCollector.appendPageAndPrompt({
      sessionId: activeSession.id,
      from,
      language,
      page,
    });

    if (result.autoComplete) {
      await PageCollector.onComplete({
        sessionId: activeSession.id,
        from,
        language,
        trigger: 'max_reached',
      });
    }
    return true;
  }

  // If a session is in a non-collecting active status, treat it per-status:
  //
  //   - awaiting_form_submit / awaiting_intent: the teacher already pre-attached
  //     pages and opened the form. If they're sending MORE photos now, they're
  //     abandoning the prior batch and starting fresh — auto-cancel and route
  //     the new batch through the coalescer normally.
  //
  //   - generating / handed_off / failed: keep the 10-min STALE protection —
  //     the teacher may have accidentally re-sent while their LP is being
  //     produced, and we don't want to clobber the in-flight job.
  //
  // The "old, stale" cleanup (>10 min) still fires for any status.
  if (activeSession) {
    const STALE_AFTER_MS = 10 * 60 * 1000;
    const ageMs = Date.now() - new Date(activeSession.updated_at || activeSession.created_at).getTime();
    const isAwaitingForm = activeSession.status === 'awaiting_form_submit'
      || activeSession.status === 'awaiting_intent';

    if (ageMs > STALE_AFTER_MS) {
      logToFile('📚 Pic-LP session stale — auto-cancelling and starting fresh', {
        sessionId: activeSession.id,
        status: activeSession.status,
        ageMinutes: Math.round(ageMs / 60000),
      });
      await PicLpSession.cancelActiveForUser(user.id, 'timed_out');
      // fall through to fresh classification
    } else if (isAwaitingForm) {
      // Teacher is in the form-open state and is sending new photos. Read that
      // as "abandoning the prior submission" — cancel and start fresh.
      logToFile('📚 Pic-LP awaiting-form session + new photo — auto-cancelling for fresh batch', {
        sessionId: activeSession.id,
        status: activeSession.status,
        ageMinutes: Math.round(ageMs / 60000),
      });
      await PicLpSession.cancelActiveForUser(user.id, 'cancelled');
      // fall through to fresh classification (coalescer enqueue below)
    } else {
      // generating / handed_off / failed within 10 min → skip
      logToFile('📚 Pic-LP session active but not collecting — skipping', {
        sessionId: activeSession.id,
        status: activeSession.status,
        ageMinutes: Math.round(ageMs / 60000),
      });
      return false;
    }
  }

  // NOTE: production also gates here on an active quiz session (so a parent who
  // snaps a quiz screenshot mid-quiz doesn't get an LP). That gate is omitted
  // until the quiz subsystem (and its quiz_sessions table) is part of this
  // bundle — restore it alongside the quiz port.

  // ---- Path B: enqueue to batch coalescer ----
  //
  // WhatsApp delivers album-batch sends as N separate concurrent webhooks.
  // Without coalescing, each one races the classifier + session create — N
  // duplicate sessions, or N-1 falling through to generic vision-feedback. The
  // coalescer buffers per-user webhooks for ~2.5 s and fires onFlush once with
  // the deduped batch. Caption-carrying photo (if any) is picked as primary.
  ImageBatchCoalescer.enqueue({
    userId: user.id,
    image: { mediaId: imageId, mimeType, caption, typingController },
    onFlush: (batch) => {
      // Fire-and-forget; the coalescer logs any throws.
      handleCoalescedBatch({ user, from, batch }).catch((err) => {
        logToFile('⚠️ Pic-LP batch handler failed', { error: err.message, userId: user.id });
      });
    },
  });

  // Stop the typing indicator for this individual webhook. The coalescer
  // stops each webhook's controller on flush — but stopping early is harmless
  // and prevents the wheel from spinning if the coalescer takes longer.
  typingController.stop();
  return true;
}

/**
 * Process a coalesced batch of images from one user.
 *
 * The coalescer has already deduped by mediaId and picked a `primary` image
 * (the caption-carrying one, or the first arrival). We classify ONCE on the
 * primary; if BOOK_PAGE, we upload all images to R2, create one session with
 * the primary's caption, append the rest as pages, and send a single intent
 * prompt. If NOT_BOOK_PAGE we run generic vision analysis on the primary (one
 * content-aware reply per batch).
 */
async function handleCoalescedBatch({ user, from, batch }) {
  const PicLpSession = require('../services/pic-to-lp/pic-lp-session.service');
  const PageCollector = require('../services/pic-to-lp/page-collector.service');
  const Classifier = require('../services/pic-to-lp/classifier.service');
  const { uploadImageWithRetry } = require('../storage/r2');
  const { generateCorrelationId } = require('../utils/structured-logger');

  // Best-effort: stop every webhook's typing indicator now that we're processing.
  for (const img of batch.images) {
    try { img.typingController?.stop(); } catch (e) { /* swallow */ }
  }

  const language = await getUserLanguage(user.id) || user.preferred_language || 'en';
  const isUrdu = language === 'ur';

  // Download + classify the primary (caption-carrier or first arrival).
  const primaryBuffer = await WhatsAppService.downloadMedia(batch.primary.mediaId);
  const classification = await Classifier.classifyImageType(
    primaryBuffer,
    batch.primary.mimeType,
    batch.caption
  );

  logEvent('pic_lp.classified', {
    userId: user.id,
    type: classification.type,
    confidence: classification.confidence,
    batchSize: batch.images.length,
    captionPreview: (batch.caption || '').substring(0, 60),
  });

  // Threshold 0.5 to catch borderline textbook pages (poorly lit, partially
  // obscured) that would otherwise fall to the fallback.
  if (classification.type !== 'BOOK_PAGE' || classification.confidence < 0.5) {
    // Restore vision-feedback for the primary image only. For a 4-classroom-
    // photo batch the user gets ONE content-aware reply. Call into
    // runImageAnalysis with a synthetic correlationId + startTime since the
    // coalescer's onFlush runs outside the original webhook scope.
    const correlationId = generateCorrelationId();
    const startTime = Date.now();
    const primaryTypingController = batch.primary.typingController || { stop: () => {} };
    try {
      await runImageAnalysis({
        user,
        from,
        imageId: batch.primary.mediaId,
        mimeType: batch.primary.mimeType,
        caption: batch.caption,
        typingController: primaryTypingController,
        correlationId,
        startTime,
      });
    } catch (visionErr) {
      logToFile('⚠️ runImageAnalysis from coalescer threw', {
        error: visionErr.message,
        userId: user.id,
        batchSize: batch.images.length,
      });
      // Fall back to a polite single message if vision-feedback also failed.
      const fallback = isUrdu
        ? '📷 آپ کی تصاویر مل گئیں۔ اگر آپ لیسن پلان چاہتی ہیں، براہ کرم کسی نصابی کتاب کے صفحے کی واضح تصویر بھیجیں۔ مدد کے لیے "menu" لکھیں۔'
        : "📷 Got your image(s). For a lesson plan, please send a clear photo of a textbook page. Type \"menu\" to see other things I can help with.";
      await WhatsAppService.sendMessage(from, fallback);
    }
    return;
  }

  // BOOK_PAGE: upload every image in the batch to R2.
  const uploaded = [];
  for (const img of batch.images) {
    const buffer = (img.mediaId === batch.primary.mediaId)
      ? primaryBuffer
      : await WhatsAppService.downloadMedia(img.mediaId);
    const url = await uploadImageWithRetry(buffer, user.id, img.mediaId, img.mimeType);
    uploaded.push({ url, mime: img.mimeType, uploaded_at: new Date().toISOString() });
  }

  // Create the session with the first page; append the rest.
  const correlationId = generateCorrelationId();
  const session = await PicLpSession.create({
    userId: user.id,
    correlationId,
    caption: batch.caption,
    firstPage: uploaded[0],
  });

  for (let i = 1; i < uploaded.length; i++) {
    await PicLpSession.appendPage(session.id, uploaded[i]);
  }

  const captionAlreadyHasIntent = /\b(lesson\s*plan|sabaq|sabaq plan|سبق|لیسن پلان)\b/i.test(batch.caption || '');

  if (captionAlreadyHasIntent) {
    logEvent('pic_lp.intent_chosen', {
      sessionId: session.id,
      intent: 'auto_from_caption',
      pagesAtStart: uploaded.length,
    });
    await PageCollector.startCollectingFromIntent({ sessionId: session.id, from, language });
  } else {
    await PageCollector.promptIntent({
      sessionId: session.id,
      from,
      language,
      captionAlreadyHasIntent: false,
    });
  }
}

module.exports = {
  handleImageMessage,
  // Exported for testing the coalesced-batch flow
  handleCoalescedBatch,
  // Exported for testing tryPicLpRoute's status-routing branches
  __test_only_tryPicLpRoute: tryPicLpRoute,
};
