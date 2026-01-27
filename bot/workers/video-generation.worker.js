/**
 * Video Generation Worker
 * Processes video generation jobs from SQS queue
 *
 * Pipeline: Script → TTS → Images → Videos → Assembly → Delivery
 * Takes ~10-12 minutes per video
 *
 * CHECKPOINT/RESUME SYSTEM (v1.6):
 * - Phase 1: Step-level resume - checks current_step, reuses stored data
 * - Phase 2: Slide-level checkpointing - resumes from last completed slide
 * - Phase 3: Task ID persistence - resumes Kie.ai polling on crash
 */

require('dotenv').config();
const fs = require('fs');
const { logToFile } = require('../shared/utils/logger');
const VideoSessionService = require('../shared/services/video/video-session.service');
const VideoScriptService = require('../shared/services/video/video-script.service');
const VideoImageService = require('../shared/services/video/video-image.service');
const VideoAnimationService = require('../shared/services/video/video-animation.service');
const VideoAssemblyService = require('../shared/services/video/video-assembly.service');
const WhatsAppService = require('../shared/services/whatsapp.service');
const FeatureRegistrationService = require('../shared/services/feature-registration.service');

// Max retries before sending apology
const MAX_RETRIES = 2;

/**
 * Error messages in supported languages
 */
const ERROR_MESSAGES = {
  en: "Sorry, there was an error generating your video. Please try again later.",
  ur: "معذرت، ویڈیو بنانے میں مسئلہ ہوا۔ براہ کرم بعد میں دوبارہ کوشش کریں۔",
  ar: "عذراً، حدث خطأ في إنشاء الفيديو. يرجى المحاولة مرة أخرى لاحقاً.",
  es: "Lo siento, hubo un error al generar tu video. Por favor intenta más tarde."
};

class VideoGenerationWorker {
  /**
   * Process a video generation job with checkpoint/resume support
   * @param {Object} jobData - Job payload from SQS
   */
  static async process(jobData) {
    // ISSUE #14: Extract customization from jobData
    // ISSUE #35: Extract style from jobData (defaults to 'infographic')
    const { videoRequestId, userId, from, topic, language = 'en', sessionId, customization, style = 'infographic' } = jobData;
    const supabase = require('../shared/config/supabase');

    // FIX: Check if request is still valid (not cancelled) before processing
    // This prevents zombie SQS messages from blocking worker slots
    const { data: preCheck } = await supabase
      .from('video_requests')
      .select('status')
      .eq('id', videoRequestId)
      .single();

    if (!preCheck || preCheck.status === 'cancelled') {
      logToFile('Skipping cancelled/invalid video request', {
        videoRequestId,
        status: preCheck?.status || 'NOT_FOUND'
      });
      return; // Job completes without processing, frees worker slot
    }

    const startTime = Date.now();

    try {
      // ============================================
      // PHASE 1: Fetch existing progress for resume
      // ============================================
      const { data: existingRequest } = await supabase
        .from('video_requests')
        .select('current_step, script_data, slide_urls, video_segment_urls, pdf_url')
        .eq('id', videoRequestId)
        .single();

      const currentStep = existingRequest?.current_step || 0;
      let scriptData = existingRequest?.script_data;
      let slideUrls = existingRequest?.slide_urls;
      let videoPaths = existingRequest?.video_segment_urls;
      const existingPdfUrl = existingRequest?.pdf_url;

      // Reconstruct slideUrls array format if we have flat URLs
      if (slideUrls && Array.isArray(slideUrls) && slideUrls.length > 0 && typeof slideUrls[0] === 'string') {
        // Convert flat URL array back to structured format
        const reconstructed = [];
        for (let i = 0; i < slideUrls.length; i += 2) {
          reconstructed.push({
            slideId: Math.floor(i / 2) + 1,
            startUrl: slideUrls[i],
            endUrl: slideUrls[i + 1]
          });
        }
        slideUrls = reconstructed;
      }

      logToFile('Starting video generation with checkpoint', {
        videoRequestId,
        userId,
        topic,
        language,
        customization: customization || 'none',  // ISSUE #14: Log customization
        style,  // ISSUE #35: Log selected style
        resumeFromStep: currentStep,
        hasScriptData: !!scriptData,
        hasSlideUrls: !!slideUrls?.length,
        hasVideoPaths: !!videoPaths?.length
      });

      // Mark as processing
      await supabase
        .from('video_requests')
        .update({
          status: 'processing',
          started_at: existingRequest?.started_at || new Date().toISOString()
        })
        .eq('id', videoRequestId);

      // ============================================
      // STEP 1: Script Generation + TTS (~30 seconds)
      // Skip if already completed (currentStep >= 1 AND scriptData exists)
      // ============================================
      if (currentStep < 1 || !scriptData || !scriptData.slides || !scriptData.audioPaths) {
        logToFile('Step 1: Generating script (not cached)', { videoRequestId });
        await VideoSessionService.sendProgressUpdate(videoRequestId, 1, language);
        await this.updateStep(supabase, videoRequestId, 1);

        // ISSUE #14: Pass customization to script generation
        scriptData = await VideoScriptService.generateScript(videoRequestId, {
          topic,
          language,
          slideCount: 3,
          customization  // User's focus preference (e.g., "Interference in democracy")
        });

        // ISSUE #35: Apply style prefix to slide prompts
        const { applyStyleToPrompts } = require('../shared/services/video/video-script.service');
        scriptData.slides = applyStyleToPrompts(scriptData.slides, style);

        logToFile('Script generation complete', {
          videoRequestId,
          slideCount: scriptData.slides.length,
          style,  // ISSUE #35: Log applied style
          totalAudioDuration: scriptData.audioDurations.reduce((a, b) => a + b, 0)
        });

        // Store script data
        await supabase
          .from('video_requests')
          .update({ script_data: scriptData, current_step: 1 })
          .eq('id', videoRequestId);
      } else {
        logToFile('Step 1: Using cached script data', {
          videoRequestId,
          slideCount: scriptData.slides?.length
        });
      }

      // ============================================
      // STEP 2: Image Generation (~3-4 minutes)
      // Skip if already completed, or resume from partial progress
      // ============================================
      const expectedSlideCount = scriptData.slides?.length || 3;
      const hasCompleteImages = slideUrls && slideUrls.length === expectedSlideCount;

      if (currentStep < 2 || !hasCompleteImages) {
        logToFile('Step 2: Generating images', {
          videoRequestId,
          existingSlides: slideUrls?.length || 0,
          expectedSlides: expectedSlideCount
        });

        await VideoSessionService.sendProgressUpdate(videoRequestId, 2, language);
        await this.updateStep(supabase, videoRequestId, 2);

        // PHASE 2: Pass existing URLs for slide-level resume
        slideUrls = await VideoImageService.generateImages(videoRequestId, {
          slides: scriptData.slides,
          language,
          existingUrls: slideUrls || []  // Pass what we have for resume
        });

        logToFile('Image generation complete', {
          videoRequestId,
          imageCount: slideUrls.length * 2
        });

        // Store slide URLs
        const flatUrls = slideUrls.flatMap(s => [s.startUrl, s.endUrl]);
        await supabase
          .from('video_requests')
          .update({ slide_urls: flatUrls, current_step: 2 })
          .eq('id', videoRequestId);
      } else {
        logToFile('Step 2: Using cached image URLs', {
          videoRequestId,
          slideCount: slideUrls.length
        });
      }

      // ============================================
      // SEND PDF IMMEDIATELY (if not already sent)
      // ============================================
      if (!existingPdfUrl) {
        const pdfPath = await VideoAssemblyService.generateAndSendPDF(videoRequestId, {
          from,
          language,
          slideUrls
        });

        logToFile('PDF sent immediately after images', { videoRequestId, pdfPath });

        if (pdfPath) {
          await supabase
            .from('video_requests')
            .update({ pdf_url: pdfPath })
            .eq('id', videoRequestId);
        }
      } else {
        logToFile('Step 2.5: PDF already sent', { videoRequestId, existingPdfUrl });
      }

      // ============================================
      // STEP 3: Video Animation (~5-6 minutes)
      // Skip if already completed, or resume from partial progress
      // ============================================
      // PHASE 2.5: Validate video paths actually exist (container may have restarted)
      let validatedVideoPaths = [];
      if (videoPaths && videoPaths.length > 0) {
        for (const videoPath of videoPaths) {
          if (fs.existsSync(videoPath)) {
            validatedVideoPaths.push(videoPath);
          } else {
            logToFile('Cached video file missing (container restarted?)', {
              videoRequestId,
              missingPath: videoPath
            });
            break; // Stop at first missing
          }
        }
        if (validatedVideoPaths.length !== videoPaths.length) {
          logToFile('Some video files missing, will regenerate', {
            videoRequestId,
            hadPaths: videoPaths.length,
            validPaths: validatedVideoPaths.length
          });
          videoPaths = validatedVideoPaths;
        }
      }

      const hasCompleteVideos = videoPaths && videoPaths.length === expectedSlideCount;

      if (currentStep < 3 || !hasCompleteVideos) {
        logToFile('Step 3: Generating videos', {
          videoRequestId,
          existingVideos: videoPaths?.length || 0,
          expectedVideos: expectedSlideCount
        });

        await VideoSessionService.sendProgressUpdate(videoRequestId, 3, language);
        await this.updateStep(supabase, videoRequestId, 3);

        // ISSUE #12: Start sending fun facts in background (don't await)
        // This runs during the 5-6 minute video generation step
        if (scriptData.funFacts && scriptData.funFacts.length > 0) {
          this.sendFunFacts(from, scriptData.funFacts, videoRequestId)
            .catch(err => logToFile('Fun facts sending failed (non-fatal)', { error: err.message }));
        }

        // PHASE 2: Pass existing paths for slide-level resume
        videoPaths = await VideoAnimationService.generateVideos(videoRequestId, {
          slides: scriptData.slides,
          slideUrls,
          audioDurations: scriptData.audioDurations,
          existingPaths: videoPaths || []  // Pass what we have for resume
        });

        logToFile('Video animation complete', {
          videoRequestId,
          videoCount: videoPaths.length
        });

        // Store video segment paths
        await supabase
          .from('video_requests')
          .update({ video_segment_urls: videoPaths, current_step: 3 })
          .eq('id', videoRequestId);
      } else {
        logToFile('Step 3: Using cached video paths', {
          videoRequestId,
          videoCount: videoPaths.length
        });
      }

      // ============================================
      // STEP 4: Assembly + Delivery (~1-2 minutes)
      // Always run (assembly is cheap, delivery is required)
      // ============================================
      logToFile('Step 4: Assembling and delivering video', { videoRequestId });
      await VideoSessionService.sendProgressUpdate(videoRequestId, 4, language);
      await this.updateStep(supabase, videoRequestId, 4);

      const { videoUrl } = await VideoAssemblyService.assembleAndDeliver(
        videoRequestId,
        {
          from,
          userId,  // Issue #7: Pass userId for portal prompt language lookup
          language,
          videoPaths,
          audioPaths: scriptData.audioPaths,
          slideUrls
        }
      );

      // ============================================
      // COMPLETION
      // ============================================
      const generationTime = Math.round((Date.now() - startTime) / 1000);

      await supabase
        .from('video_requests')
        .update({
          status: 'completed',
          video_url: videoUrl,
          generation_time_seconds: generationTime,
          completed_at: new Date().toISOString(),
          current_step: 4
        })
        .eq('id', videoRequestId);

      logToFile('Video generation completed successfully', {
        videoRequestId,
        generationTimeSeconds: generationTime,
        videoUrl
      });

      // Check and trigger registration if needed (non-blocking)
      try {
        await FeatureRegistrationService.checkAndTriggerRegistration(
          userId,
          'video',
          from,
          language,
          'text' // Videos are requested via text
        );
      } catch (regError) {
        logToFile('Registration trigger error (non-fatal)', { error: regError.message });
      }

    } catch (error) {
      logToFile('Video generation failed', {
        videoRequestId,
        error: error.message,
        stack: error.stack
      });

      // Get current retry count
      const { data: request } = await supabase
        .from('video_requests')
        .select('retry_count')
        .eq('id', videoRequestId)
        .single();

      const retryCount = (request?.retry_count || 0) + 1;

      // Mark as failed (but keep progress data for resume!)
      await supabase
        .from('video_requests')
        .update({
          status: 'failed',
          error_message: error.message,
          retry_count: retryCount
          // NOTE: We don't clear script_data, slide_urls, video_segment_urls
          // so they can be reused on retry
        })
        .eq('id', videoRequestId);

      // If max retries exceeded, send apology (ISSUE #13 + #17: global per-user deduplication)
      if (retryCount >= MAX_RETRIES) {
        try {
          // ISSUE #17 FIX: Use per-USER deduplication (not per-request)
          // This ensures a user only gets ONE error message per hour, regardless of how many videos fail
          const RedisService = require('../shared/services/cache/railway-redis.service');
          const errorSentKey = `video:error:${from}`;  // Per-user, not per-request!
          const alreadySent = await RedisService.get(errorSentKey);

          if (alreadySent) {
            logToFile('Error message already sent to user, skipping duplicate', {
              videoRequestId,
              from,
              reason: 'Global per-user deduplication (Issue #17)'
            });
          } else {
            const errorMsg = ERROR_MESSAGES[language] || ERROR_MESSAGES.en;
            await WhatsAppService.sendMessage(from, errorMsg);

            // Mark as sent with 1 hour TTL - applies to ALL videos from this user
            await RedisService.setex(errorSentKey, 3600, 'true');
            logToFile('Apology message sent after max retries', { videoRequestId, retryCount, from });
          }
        } catch (msgError) {
          logToFile('Failed to send apology message', { error: msgError.message });
        }
      }

      // Re-throw to let SQS handle retry
      throw error;
    }
  }

  /**
   * Update current step in database
   */
  static async updateStep(supabase, videoRequestId, step) {
    await supabase
      .from('video_requests')
      .update({ current_step: step })
      .eq('id', videoRequestId);
  }

  /**
   * ISSUE #12: Send fun facts during video generation
   * Runs in background, doesn't block main process
   * @param {string} from - WhatsApp phone number
   * @param {Array} funFacts - Array of fun fact strings
   * @param {string} videoRequestId - For logging
   */
  static async sendFunFacts(from, funFacts, videoRequestId) {
    if (!funFacts || !Array.isArray(funFacts) || funFacts.length === 0) {
      logToFile('No fun facts to send', { videoRequestId });
      return;
    }

    const emojis = ['💡', '🎯', '✨', '📚', '🌟'];
    const interval = 120000; // 2 minutes between facts

    logToFile('Starting fun facts sequence', {
      videoRequestId,
      factCount: funFacts.length,
      intervalMs: interval
    });

    for (let i = 0; i < funFacts.length; i++) {
      try {
        // Wait before sending (skip first wait to send immediately)
        if (i > 0) {
          await new Promise(resolve => setTimeout(resolve, interval));
        }

        const emoji = emojis[i % emojis.length];
        const factMessage = `${emoji} *Did You Know?*\n\n${funFacts[i]}`;

        await WhatsAppService.sendMessage(from, factMessage);
        logToFile('Fun fact sent', { videoRequestId, factIndex: i + 1 });
      } catch (error) {
        logToFile('Error sending fun fact (non-fatal)', {
          videoRequestId,
          factIndex: i + 1,
          error: error.message
        });
        // Don't throw - fun facts are optional
      }
    }
  }
}

module.exports = VideoGenerationWorker;
