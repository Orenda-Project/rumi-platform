/**
 * Video Image Service
 *
 * Generates slide images using Nano Banana Pro via Kie.ai
 *
 * CHECKPOINT/RESUME SYSTEM (v1.6):
 * - Phase 2: Slide-level checkpointing - resumes from last completed slide
 * - Phase 3: Task ID persistence - stores Kie.ai task IDs for resume on crash
 */

const { logToFile } = require('../../utils/logger');
const { uploadVideoAsset, isPermanentR2Url, toPublicUrl } = require('../../storage/r2');
const fs = require('fs');
const path = require('path');
const pLimit = require('p-limit');

// Issue #44: Rate limit for Nano Banana Pro (300 RPM paid tier)
// Limit to 10 concurrent requests to stay well under 300/min with buffer
const IMAGE_CONCURRENCY_LIMIT = 10;
const imageLimit = pLimit(IMAGE_CONCURRENCY_LIMIT);

const KIE_API_KEY = process.env.KIE_API_KEY;
const KIE_API_URL = 'https://api.kie.ai/api/v1/jobs';

/**
 * Clean prompt to remove meta-instructions that get rendered literally
 * Issue #36: Prevents "text zone", "empty area", etc. from appearing in images
 * @param {string} prompt - Raw prompt from GPT
 * @returns {string} Cleaned prompt safe for image generation
 */
function cleanPromptForImageGen(prompt) {
  const metaInstructions = [
    // English meta-instructions
    /\btext zone\b/gi,
    /\bempty area\b/gi,
    /\bplaceholder\b/gi,
    /\bno text or labels\b/gi,
    /\bno labels\b/gi,
    /\bno text\b/gi,
    /\bbottom \d+%\s*(empty|clean|clear|is|for)?\s*(text zone|for text|for labels|empty)?\b/gi,
    /\b16:9 aspect ratio\b/gi,
    /\bhigh contrast text\b/gi,
    /\bstep-by-step visual explanation\b/gi,
    /\beducational slide\b/gi,
    /\bclean,?\s*professional design\b/gi,
    /\btext area\b/gi,
    /\blabel area\b/gi,
    /\breserved for\b/gi,
    /\bleave space\b/gi,
    /\bempty space\b/gi,
    // Arabic meta-instructions
    /منطقة فارغة/gi,           // "empty area"
    /لنص/gi,                   // "for text"
    /منطقة النص/gi,            // "text zone"
    /مساحة فارغة/gi,           // "empty space"
    /بنسبة \d+%/gi,            // "by X%"
    // Urdu/Punjabi meta-instructions
    /خالی جگہ/gi,              // "empty space"
    /متن کا علاقہ/gi,          // "text area"
    /نیچے کا حصہ/gi,           // "bottom portion"
  ];

  let cleaned = prompt;
  metaInstructions.forEach(regex => {
    cleaned = cleaned.replace(regex, '');
  });

  // Clean up artifacts: double spaces, orphaned periods, extra commas
  return cleaned
    .replace(/\s+/g, ' ')           // Multiple spaces to single
    .replace(/\.\s*\./g, '.')       // Double periods
    .replace(/,\s*,/g, ',')         // Double commas
    .replace(/,\s*\./g, '.')        // Comma before period
    .replace(/\(\s*\)/g, '')        // Empty parentheses
    .replace(/^\s*[,.]/, '')        // Leading comma/period
    .trim();
}

class VideoImageService {

  /**
   * Generate START and END frame images for all slides
   * ISSUE #33: PARALLEL GENERATION - generates all START frames in parallel, then all END frames
   * This reduces generation time from 3-5 min to ~1.5-2 min
   * Supports resuming from partial progress (Phase 2)
   * @param {string} videoRequestId - Video request UUID
   * @param {Object} options - { slides, language, existingUrls }
   * @returns {Array} [{ slideId, startUrl, endUrl }, ...]
   */
  static async generateImages(videoRequestId, { slides, language, existingUrls = [] }) {
    const supabase = require('../../config/supabase');

    logToFile('Starting PARALLEL image generation (Issue #33)', {
      videoRequestId,
      slideCount: slides.length,
      existingSlides: existingUrls.length
    });

    // PHASE 2: Resume support - if we have existing URLs, return them
    if (existingUrls.length >= slides.length) {
      logToFile('All slides already generated, returning cached results', {
        videoRequestId,
        existingCount: existingUrls.length
      });
      return existingUrls;
    }

    // Determine which slides need generation (for partial resume)
    const startIndex = existingUrls.length;
    const slidesToGenerate = slides.slice(startIndex);

    // ===== BATCH 1: Generate all START frames with RATE LIMITING =====
    // Issue #44: Use p-limit to stay under Nano Banana Pro's 300 RPM limit
    // START frames are independent (no cross-slide reference), so safe to parallelize
    logToFile('BATCH 1: Generating all START frames with rate limiting', {
      videoRequestId,
      count: slidesToGenerate.length,
      concurrencyLimit: IMAGE_CONCURRENCY_LIMIT
    });

    const startPromises = slidesToGenerate.map((slide, i) => {
      const slideId = startIndex + i + 1;
      // Wrap in imageLimit to control concurrency
      return imageLimit(() => this.generateImageWithTaskPersistence(
        slide.startPrompt,
        videoRequestId,
        `slide_${slideId}_start`,
        supabase,
        null  // No reference image for START (text-to-image)
      ));
    });

    const startResults = await Promise.all(startPromises);

    logToFile('BATCH 1 complete: All START frames generated', {
      videoRequestId,
      count: startResults.length
    });

    // ===== BATCH 2: Generate all END frames with RATE LIMITING =====
    // Issue #44: Use p-limit to stay under Nano Banana Pro's 300 RPM limit
    // Each END frame uses its OWN START as reference (not other slides)
    logToFile('BATCH 2: Generating all END frames with rate limiting', {
      videoRequestId,
      count: slidesToGenerate.length,
      concurrencyLimit: IMAGE_CONCURRENCY_LIMIT
    });

    const endPromises = slidesToGenerate.map((slide, i) => {
      const slideId = startIndex + i + 1;
      // Wrap in imageLimit to control concurrency
      return imageLimit(() => this.generateImageWithTaskPersistence(
        slide.endPrompt,
        videoRequestId,
        `slide_${slideId}_end`,
        supabase,
        startResults[i].ephemeralUrl  // Use own START as reference
      ));
    });

    const endResults = await Promise.all(endPromises);

    logToFile('BATCH 2 complete: All END frames generated', {
      videoRequestId,
      count: endResults.length
    });

    // ===== Combine results =====
    const newResults = slidesToGenerate.map((_, i) => {
      const slideId = startIndex + i + 1;
      return {
        slideId,
        startUrl: startResults[i].r2Url,
        endUrl: endResults[i].r2Url,
        startEphemeralUrl: startResults[i].ephemeralUrl,
        endEphemeralUrl: endResults[i].ephemeralUrl
      };
    });

    // Merge with existing results (for resume case)
    const allResults = [...existingUrls, ...newResults];

    // PHASE 2: Checkpoint after all batches complete
    await this.saveProgress(videoRequestId, allResults, supabase);

    logToFile('All images generated with PARALLEL batching', {
      videoRequestId,
      totalSlides: allResults.length,
      newlyGenerated: newResults.length
    });

    return allResults;
  }

  /**
   * Generate a single image with task ID persistence (Phase 3)
   * ISSUE #2: HYBRID approach - supports image-to-image for END frames
   * @param {string} prompt - Image generation prompt
   * @param {string} videoRequestId - For organizing files
   * @param {string} filename - Base filename without extension
   * @param {Object} supabase - Supabase client
   * @param {string|null} referenceImageUrl - Reference image for image-to-image (null for text-to-image)
   * @returns {string} Image URL
   */
  static async generateImageWithTaskPersistence(prompt, videoRequestId, filename, supabase, referenceImageUrl = null) {
    // PHASE 3: Check for existing pending task
    const { data: existingTask } = await supabase
      .from('video_tasks')
      .select('task_id, status, result_url, ephemeral_url')
      .eq('video_request_id', videoRequestId)
      .eq('filename', filename)
      .single();

    // If task already completed with permanent R2 URL, return cached result
    if (existingTask?.status === 'completed' && existingTask.result_url && isPermanentR2Url(existingTask.result_url)) {
      logToFile('Using cached image from R2 (permanent)', {
        videoRequestId,
        filename,
        taskId: existingTask.task_id,
        r2Url: existingTask.result_url,
        ephemeralUrl: existingTask.ephemeral_url ? 'available' : 'not stored'
      });
      // Return both URLs - ephemeral might be expired but r2Url is permanent
      return {
        r2Url: existingTask.result_url,
        ephemeralUrl: existingTask.ephemeral_url || existingTask.result_url
      };
    }

    // If task completed but has ephemeral URL, need to re-upload to R2
    if (existingTask?.status === 'completed' && existingTask.result_url && !isPermanentR2Url(existingTask.result_url)) {
      const ephemeralUrl = existingTask.result_url;
      logToFile('Re-uploading ephemeral URL to R2', {
        videoRequestId,
        filename,
        ephemeralUrl
      });
      // Download from ephemeral URL and upload to R2
      try {
        const tempDir = path.join('/tmp', 'video-generation', videoRequestId, 'slides');
        if (!fs.existsSync(tempDir)) {
          fs.mkdirSync(tempDir, { recursive: true });
        }
        const localPath = path.join(tempDir, `${filename}.png`);
        const imageResponse = await fetch(ephemeralUrl);
        const imageBuffer = await imageResponse.arrayBuffer();
        fs.writeFileSync(localPath, Buffer.from(imageBuffer));

        const r2Url = await uploadVideoAsset(localPath, videoRequestId, `${filename}.png`);

        // Update DB with permanent R2 URL (keep ephemeral too)
        await supabase
          .from('video_tasks')
          .update({ result_url: r2Url, ephemeral_url: ephemeralUrl })
          .eq('video_request_id', videoRequestId)
          .eq('filename', filename);

        logToFile('Ephemeral URL migrated to R2', { videoRequestId, filename, r2Url });
        return { r2Url, ephemeralUrl };
      } catch (err) {
        logToFile('Failed to migrate ephemeral URL, will regenerate', {
          videoRequestId,
          filename,
          error: err.message
        });
        // Fall through to regeneration
      }
    }

    // If task exists but is still polling, resume polling
    if (existingTask?.task_id && existingTask.status === 'polling') {
      logToFile('Resuming polling for existing task', {
        videoRequestId,
        filename,
        taskId: existingTask.task_id
      });
      return await this.pollAndComplete(existingTask.task_id, videoRequestId, filename, supabase);
    }

    // Create new task
    // ISSUE #2: HYBRID approach - image-to-image for END frames, text-to-image for START
    // CRITICAL FIX: Check if referenceImageUrl exists (can be ephemeral OR R2 URL)
    const isImageToImage = referenceImageUrl && referenceImageUrl.startsWith('http');

    logToFile('Creating new image task', {
      videoRequestId,
      filename,
      mode: isImageToImage ? 'image-to-image' : 'text-to-image',
      referenceImage: isImageToImage ? referenceImageUrl : null
    });

    // Issue #36: Clean prompt to remove meta-instructions that get rendered literally
    const cleanedPrompt = cleanPromptForImageGen(prompt);

    // For END frames (image-to-image), use simpler prompt since START provides visual context
    // For START frames (text-to-image), the style prefix is already applied by video-script.service.js
    // Issue #36: Removed meta-instructions like "high contrast text", "16:9 aspect ratio" that were rendered literally
    const enhancedPrompt = isImageToImage
      ? `${cleanedPrompt}. Maintain same layout, colors, and style.`
      : cleanedPrompt;  // Style prefix already applied, don't add more meta-instructions

    // Build API input - add image_input only for image-to-image (END frames)
    // Issue #36: Added negative_prompt to prevent literal text rendering
    const apiInput = {
      prompt: enhancedPrompt,
      output_format: 'png',
      aspect_ratio: '16:9',
      resolution: '1K',
      negative_prompt: 'text, words, letters, typography, captions, labels, watermark, signature, writing, numbers, digits, symbols, title, heading, subtitle'
    };

    // ISSUE #2: Add reference image for END frames (image-to-image generation)
    // CRITICAL FIX: Use ephemeral URL directly - Kie.ai can access their own CDN!
    if (isImageToImage) {
      // If it's already a Kie.ai ephemeral URL, use it directly (no presigning needed)
      // If it's an R2 URL, convert to presigned URL
      const isKieUrl = referenceImageUrl.includes('kie.ai') || referenceImageUrl.includes('kie-ai');
      const publicRefUrl = isKieUrl ? referenceImageUrl : await toPublicUrl(referenceImageUrl);

      logToFile('Using reference image for i2i', {
        videoRequestId,
        filename,
        originalRef: referenceImageUrl.substring(0, 80) + '...',
        isKieUrl,
        usingUrl: publicRefUrl.substring(0, 80) + '...'
      });

      apiInput.image_input = [publicRefUrl];
    }

    const createResponse = await fetch(`${KIE_API_URL}/createTask`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${KIE_API_KEY}`
      },
      body: JSON.stringify({
        model: 'nano-banana-pro',
        input: apiInput
      })
    });

    const createData = await createResponse.json();
    const taskId = createData.data?.taskId;

    if (!taskId) {
      throw new Error(`Failed to create image task: ${JSON.stringify(createData)}`);
    }

    // PHASE 3: Store task ID before polling
    await supabase.from('video_tasks').upsert({
      video_request_id: videoRequestId,
      filename,
      task_id: taskId,
      task_type: 'image',
      status: 'polling',
      created_at: new Date().toISOString()
    }, { onConflict: 'video_request_id,filename' });

    logToFile('Image task created and persisted', { videoRequestId, filename, taskId });

    return await this.pollAndComplete(taskId, videoRequestId, filename, supabase);
  }

  /**
   * Poll for task completion, upload to R2, and update status
   * ISSUE #1 FIX: Now uploads to R2 for permanent storage
   * CRITICAL: Returns { r2Url, ephemeralUrl } - use ephemeralUrl for Kie.ai, r2Url for storage
   */
  static async pollAndComplete(taskId, videoRequestId, filename, supabase) {
    // ISSUE #16 FIX: Increased timeout from 90s (30×3s) to 5min (60×5s) to match video-animation
    const ephemeralUrl = await this.pollForCompletion(taskId, 60, 5000);

    // Download from Kie.ai and save locally (needed for FFmpeg assembly)
    const tempDir = path.join('/tmp', 'video-generation', videoRequestId, 'slides');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const localPath = path.join(tempDir, `${filename}.png`);
    const imageResponse = await fetch(ephemeralUrl);
    const imageBuffer = await imageResponse.arrayBuffer();
    fs.writeFileSync(localPath, Buffer.from(imageBuffer));

    // ISSUE #1: Upload to R2 for permanent storage
    let r2Url;
    try {
      r2Url = await uploadVideoAsset(localPath, videoRequestId, `${filename}.png`);
      logToFile('Image uploaded to R2', { videoRequestId, filename, r2Url });
    } catch (err) {
      logToFile('R2 upload failed, using ephemeral URL as fallback', {
        videoRequestId,
        filename,
        error: err.message
      });
      r2Url = ephemeralUrl; // Fallback to ephemeral if R2 fails
    }

    // PHASE 3: Mark task as completed - store BOTH URLs
    // r2Url for long-term storage, ephemeralUrl for Kie.ai access
    await supabase
      .from('video_tasks')
      .update({
        status: 'completed',
        result_url: r2Url,
        ephemeral_url: ephemeralUrl, // Store ephemeral URL for Kie.ai
        completed_at: new Date().toISOString()
      })
      .eq('video_request_id', videoRequestId)
      .eq('filename', filename);

    logToFile('Image task completed', {
      videoRequestId,
      filename,
      localPath,
      r2Url,
      ephemeralUrl: ephemeralUrl.substring(0, 80) + '...'
    });

    // Return BOTH URLs - r2Url for storage, ephemeralUrl for Kie.ai
    return { r2Url, ephemeralUrl };
  }

  /**
   * Save progress after each slide (Phase 2 checkpoint)
   */
  static async saveProgress(videoRequestId, results, supabase) {
    const flatUrls = results.flatMap(s => [s.startUrl, s.endUrl]);
    await supabase
      .from('video_requests')
      .update({ slide_urls: flatUrls })
      .eq('id', videoRequestId);
  }

  /**
   * Poll Kie.ai for task completion
   * @param {string} taskId - Task ID to poll
   * @param {number} maxAttempts - Maximum polling attempts (default: 60 = 5 min with 5s interval)
   * @param {number} intervalMs - Polling interval in milliseconds (default: 5000 = 5s)
   * @returns {string} Result URL
   */
  // ISSUE #16 FIX: Increased defaults from 30/3000 (90s) to 60/5000 (5min) to match video-animation
  static async pollForCompletion(taskId, maxAttempts = 60, intervalMs = 5000) {
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise(resolve => setTimeout(resolve, intervalMs));

      try {
        const pollResponse = await fetch(`${KIE_API_URL}/recordInfo?taskId=${taskId}`, {
          headers: {
            'Authorization': `Bearer ${KIE_API_KEY}`
          }
        });

        const pollData = await pollResponse.json();
        const state = pollData.data?.state;

        // Log poll progress every 5 attempts
        if (i % 5 === 0 || state === 'success' || state === 'fail') {
          logToFile('Kie.ai poll status', {
            taskId,
            attempt: i + 1,
            maxAttempts,
            state,
            fullResponse: JSON.stringify(pollData).substring(0, 500) // Truncate for log limits
          });
        }

        if (state === 'success') {
          const resultJson = JSON.parse(pollData.data.resultJson);
          const url = resultJson.resultUrls?.[0];
          if (url) return url;
          throw new Error('No result URL in success response');
        }

        if (state === 'fail') {
          // CRITICAL: Log the full error details
          logToFile('Kie.ai task FAILED - Full details', {
            taskId,
            failMsg: pollData.data.failMsg,
            fullData: JSON.stringify(pollData.data),
            attempt: i + 1
          });
          throw new Error(`Task failed: ${pollData.data.failMsg}`);
        }

        // Still processing, continue polling
      } catch (error) {
        if (error.message.startsWith('Task failed:')) {
          throw error; // Re-throw Kie.ai failures
        }
        // Log network/parsing errors but continue polling
        logToFile('Kie.ai poll error (will retry)', {
          taskId,
          attempt: i + 1,
          error: error.message
        });
      }
    }

    logToFile('Kie.ai task TIMED OUT', {
      taskId,
      maxAttempts,
      totalTimeMs: maxAttempts * intervalMs
    });
    throw new Error(`Task ${taskId} timed out after ${maxAttempts} attempts`);
  }
}

module.exports = VideoImageService;
