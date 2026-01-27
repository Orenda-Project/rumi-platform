/**
 * Video Animation Service
 *
 * Generates video animations using Kling 2.1 Pro via Kie.ai
 * Animates from START frame to END frame using tail_image_url
 *
 * CHECKPOINT/RESUME SYSTEM (v1.6):
 * - Phase 2: Slide-level checkpointing - resumes from last completed video
 * - Phase 3: Task ID persistence - stores Kie.ai task IDs for resume on crash
 */

const { logToFile } = require('../../utils/logger');
const { uploadVideoAsset, isPermanentR2Url, toPublicUrl } = require('../../storage/r2');
const fs = require('fs');
const path = require('path');

const KIE_API_KEY = process.env.KIE_API_KEY;
const KIE_API_URL = 'https://api.kie.ai/api/v1/jobs';

class VideoAnimationService {

  /**
   * Generate video animations for all slides
   * Supports resuming from partial progress (Phase 2)
   * @param {string} videoRequestId - Video request UUID
   * @param {Object} options - { slides, slideUrls, audioDurations, existingPaths }
   * @returns {Array} [videoPath1, videoPath2, ...]
   */
  static async generateVideos(videoRequestId, { slides, slideUrls, audioDurations, existingPaths = [] }) {
    const supabase = require('../../config/supabase');

    // PHASE 2.5 + ISSUE #1: Validate existing URLs are permanent R2 URLs
    // After container restart, /tmp files are gone. R2 URLs survive.
    const validatedPaths = [];
    for (const videoPath of existingPaths) {
      // If it's a permanent R2 URL, we're good
      if (isPermanentR2Url(videoPath)) {
        validatedPaths.push(videoPath);
        continue;
      }
      // If it's a local path, check if file exists
      if (videoPath.startsWith('/tmp') && fs.existsSync(videoPath)) {
        validatedPaths.push(videoPath);
        continue;
      }
      // Otherwise, it's ephemeral - need to re-generate from here
      logToFile('Cached video URL is ephemeral or missing, will re-generate', {
        videoRequestId,
        missingPath: videoPath,
        isPermanent: isPermanentR2Url(videoPath)
      });
      break; // Stop at first missing/ephemeral - need to regenerate from here
    }

    logToFile('Starting video generation with checkpoint support', {
      videoRequestId,
      slideCount: slides.length,
      existingVideos: existingPaths.length,
      validatedVideos: validatedPaths.length
    });

    // PHASE 2: Start with validated paths (for resume)
    const videoUrls = [...validatedPaths];
    const startIndex = videoUrls.length;

    // ISSUE #5: Generate remaining videos in PARALLEL for speed
    // Videos are independent - each uses its own start/end pair
    const remainingSlides = slides.slice(startIndex);
    const remainingUrls = slideUrls.slice(startIndex);
    const remainingDurations = audioDurations.slice(startIndex);

    if (remainingSlides.length > 0) {
      logToFile('Starting PARALLEL video generation', {
        videoRequestId,
        slidesToGenerate: remainingSlides.length,
        isResume: startIndex > 0
      });

      // Build parallel generation promises
      const videoPromises = remainingSlides.map((slide, index) => {
        const urls = remainingUrls[index];
        const audioDuration = remainingDurations[index];
        const slideId = startIndex + index + 1;
        const videoDuration = audioDuration <= 5 ? 5 : 10;

        logToFile(`Queueing video for slide ${slideId}/${slides.length}`, {
          videoRequestId,
          audioDuration,
          videoDuration
        });

        // CRITICAL FIX: Use ephemeral URLs if available (Kie.ai can access their own CDN!)
        // Fall back to R2 URLs if ephemeral not available (resume case)
        const startUrl = urls.startEphemeralUrl || urls.startUrl;
        const endUrl = urls.endEphemeralUrl || urls.endUrl;

        return this.generateVideoWithTaskPersistence(
          startUrl,
          endUrl,
          slide.videoPrompt,
          videoDuration,
          videoRequestId,
          slideId,
          supabase
        );
      });

      // Execute all videos in parallel using Promise.allSettled
      // This ensures we get results for all, even if some fail
      const results = await Promise.allSettled(videoPromises);

      // Process results and handle failures
      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        const slideId = startIndex + i + 1;

        if (result.status === 'fulfilled') {
          videoUrls.push(result.value);
          logToFile(`Slide ${slideId} video complete (parallel)`, {
            videoRequestId,
            videoPath: result.value,
            progress: `${videoUrls.length}/${slides.length}`
          });
        } else {
          // Video generation failed - log and throw
          logToFile('Video generation failed for slide', {
            videoRequestId,
            slideId,
            error: result.reason?.message || 'Unknown error'
          });
          throw new Error(`Video generation failed for slide ${slideId}: ${result.reason?.message}`);
        }
      }

      // PHASE 2: Checkpoint AFTER all parallel videos complete
      await this.saveProgress(videoRequestId, videoUrls, supabase);

      logToFile('All parallel videos complete (checkpointed)', {
        videoRequestId,
        totalVideos: videoUrls.length
      });
    }

    return videoUrls;
  }

  /**
   * Generate a single video with task ID persistence (Phase 3)
   * @param {string} startImageUrl - START frame URL
   * @param {string} endImageUrl - END frame URL (tail_image_url)
   * @param {string} prompt - Video motion prompt
   * @param {number} duration - Duration in seconds (5 or 10)
   * @param {string} videoRequestId - For organizing files
   * @param {number} slideId - Slide number
   * @param {Object} supabase - Supabase client
   * @returns {string} Video path
   */
  static async generateVideoWithTaskPersistence(startImageUrl, endImageUrl, prompt, duration, videoRequestId, slideId, supabase) {
    const filename = `slide_${slideId}_video`;

    // PHASE 3: Check for existing pending task
    const { data: existingTask } = await supabase
      .from('video_tasks')
      .select('task_id, status, result_url')
      .eq('video_request_id', videoRequestId)
      .eq('filename', filename)
      .single();

    // If task completed with permanent R2 URL, download for FFmpeg
    if (existingTask?.status === 'completed' && existingTask.result_url && isPermanentR2Url(existingTask.result_url)) {
      logToFile('Using cached video from R2 (permanent)', {
        videoRequestId,
        slideId,
        taskId: existingTask.task_id,
        r2Url: existingTask.result_url
      });
      // Download for local FFmpeg assembly, return LOCAL PATH (not R2 URL!)
      const localPath = await this.downloadVideoForAssembly(existingTask.result_url, videoRequestId, slideId);
      return localPath;  // FFmpeg needs local path!
    }

    // If task completed but has ephemeral URL, re-upload to R2
    if (existingTask?.status === 'completed' && existingTask.result_url && !isPermanentR2Url(existingTask.result_url)) {
      logToFile('Re-uploading ephemeral video URL to R2', {
        videoRequestId,
        slideId,
        ephemeralUrl: existingTask.result_url
      });
      try {
        const localPath = await this.downloadVideoForAssembly(existingTask.result_url, videoRequestId, slideId);
        const r2Url = await uploadVideoAsset(localPath, videoRequestId, `slide_${slideId}.mp4`);

        // Update DB with R2 URL
        await supabase
          .from('video_tasks')
          .update({ result_url: r2Url })
          .eq('video_request_id', videoRequestId)
          .eq('filename', filename);

        logToFile('Ephemeral video migrated to R2', { videoRequestId, slideId, r2Url });
        return localPath;  // FFmpeg needs local path, not R2 URL!
      } catch (err) {
        logToFile('Failed to migrate ephemeral video, will regenerate', {
          videoRequestId,
          slideId,
          error: err.message
        });
        // Fall through to regeneration
      }
    }

    // If task exists but is still polling, resume polling
    if (existingTask?.task_id && existingTask.status === 'polling') {
      logToFile('Resuming polling for existing video task', {
        videoRequestId,
        slideId,
        taskId: existingTask.task_id
      });
      return await this.pollAndCompleteVideo(existingTask.task_id, videoRequestId, slideId, supabase);
    }

    // Create new task
    logToFile('Creating new video task', { videoRequestId, slideId, duration });

    const enhancedPrompt = `${prompt}. Smooth, gentle motion. Text remains perfectly stable and crisp. NO morphing or distortion of any elements.`;

    // CRITICAL FIX: Detect if URLs are already Kie.ai CDN URLs (ephemeral)
    // If so, use them directly - no presigning needed!
    const isKieStartUrl = startImageUrl.includes('kie.ai') || startImageUrl.includes('kie-ai') || startImageUrl.includes('cdn.kie');
    const isKieEndUrl = endImageUrl.includes('kie.ai') || endImageUrl.includes('kie-ai') || endImageUrl.includes('cdn.kie');

    // Use ephemeral URLs directly if from Kie.ai, otherwise convert to presigned
    const publicStartUrl = isKieStartUrl ? startImageUrl : await toPublicUrl(startImageUrl);
    const publicEndUrl = isKieEndUrl ? endImageUrl : await toPublicUrl(endImageUrl);

    logToFile('URLs prepared for video animation', {
      videoRequestId,
      slideId,
      isKieStartUrl,
      isKieEndUrl,
      startUrl: publicStartUrl.substring(0, 80) + '...',
      endUrl: publicEndUrl.substring(0, 80) + '...'
    });

    const createResponse = await fetch(`${KIE_API_URL}/createTask`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${KIE_API_KEY}`
      },
      body: JSON.stringify({
        model: 'kling/v2-1-pro',
        input: {
          prompt: enhancedPrompt,
          image_url: publicStartUrl,
          tail_image_url: publicEndUrl,
          duration: String(duration),
          aspect_ratio: '16:9',
          cfg_scale: 0.7,
          negative_prompt: 'morphing, transformation, distortion, blurry text, text changes, warping'
        }
      })
    });

    const createData = await createResponse.json();
    const taskId = createData.data?.taskId;

    if (!taskId) {
      throw new Error(`Failed to create video task: ${JSON.stringify(createData)}`);
    }

    // PHASE 3: Store task ID before polling
    await supabase.from('video_tasks').upsert({
      video_request_id: videoRequestId,
      filename,
      task_id: taskId,
      task_type: 'video',
      status: 'polling',
      created_at: new Date().toISOString()
    }, { onConflict: 'video_request_id,filename' });

    logToFile('Video task created and persisted', { videoRequestId, slideId, taskId });

    return await this.pollAndCompleteVideo(taskId, videoRequestId, slideId, supabase);
  }

  /**
   * Poll for task completion, upload to R2, and download for assembly
   * ISSUE #1 FIX: Now uploads to R2 for permanent storage
   */
  static async pollAndCompleteVideo(taskId, videoRequestId, slideId, supabase) {
    const filename = `slide_${slideId}_video`;
    const ephemeralUrl = await this.pollForCompletion(taskId, 60, 5000);

    // Download video locally (needed for FFmpeg assembly)
    const localPath = await this.downloadVideoForAssembly(ephemeralUrl, videoRequestId, slideId);

    // ISSUE #1: Upload to R2 for permanent storage
    let r2Url;
    try {
      r2Url = await uploadVideoAsset(localPath, videoRequestId, `slide_${slideId}.mp4`);
      logToFile('Video segment uploaded to R2', { videoRequestId, slideId, r2Url });
    } catch (err) {
      logToFile('R2 upload failed, using ephemeral URL as fallback', {
        videoRequestId,
        slideId,
        error: err.message
      });
      r2Url = ephemeralUrl; // Fallback to ephemeral if R2 fails
    }

    // PHASE 3: Mark task as completed with R2 URL (for persistence)
    await supabase
      .from('video_tasks')
      .update({
        status: 'completed',
        result_url: r2Url,  // Store R2 URL in DB for long-term storage
        completed_at: new Date().toISOString()
      })
      .eq('video_request_id', videoRequestId)
      .eq('filename', filename);

    logToFile('Video task completed', { videoRequestId, slideId, localPath, r2Url });

    // CRITICAL: Return LOCAL path for FFmpeg assembly (not R2 URL!)
    return localPath;
  }

  /**
   * Download video to local temp directory for FFmpeg assembly
   * Returns local path for FFmpeg, not for storage
   */
  static async downloadVideoForAssembly(videoUrl, videoRequestId, slideId) {
    const tempDir = path.join('/tmp', 'video-generation', videoRequestId, 'videos');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const localPath = path.join(tempDir, `slide_${slideId}_video.mp4`);

    // Check if already downloaded
    if (fs.existsSync(localPath)) {
      logToFile('Video already downloaded for assembly', { videoRequestId, slideId, localPath });
      return localPath;
    }

    const videoResponse = await fetch(videoUrl);
    const videoBuffer = await videoResponse.arrayBuffer();
    fs.writeFileSync(localPath, Buffer.from(videoBuffer));

    logToFile('Video downloaded for assembly', { videoRequestId, slideId, localPath });

    return localPath;
  }

  /**
   * Save progress after each video (Phase 2 checkpoint)
   */
  static async saveProgress(videoRequestId, videoPaths, supabase) {
    await supabase
      .from('video_requests')
      .update({ video_segment_urls: videoPaths })
      .eq('id', videoRequestId);
  }

  /**
   * Poll Kie.ai for task completion
   * @param {string} taskId - Task ID to poll
   * @param {number} maxAttempts - Maximum polling attempts
   * @param {number} intervalMs - Polling interval in milliseconds
   * @returns {string} Result URL
   */
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

        // Log poll progress every 6 attempts or on terminal states
        if (i % 6 === 0 || state === 'success' || state === 'fail') {
          logToFile('Kie.ai video poll status', {
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
          logToFile('Kie.ai VIDEO task FAILED - Full details', {
            taskId,
            failMsg: pollData.data.failMsg,
            fullData: JSON.stringify(pollData.data),
            attempt: i + 1
          });
          throw new Error(`Task failed: ${pollData.data.failMsg}`);
        }
      } catch (error) {
        if (error.message.startsWith('Task failed:')) {
          throw error; // Re-throw Kie.ai failures
        }
        // Log network/parsing errors but continue polling
        logToFile('Kie.ai video poll error (will retry)', {
          taskId,
          attempt: i + 1,
          error: error.message
        });
      }
    }

    logToFile('Kie.ai VIDEO task TIMED OUT', {
      taskId,
      maxAttempts,
      totalTimeMs: maxAttempts * intervalMs
    });
    throw new Error(`Task ${taskId} timed out after ${maxAttempts} attempts`);
  }
}

module.exports = VideoAnimationService;
