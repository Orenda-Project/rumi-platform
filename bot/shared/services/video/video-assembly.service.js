/**
 * Video Assembly Service
 *
 * Assembles final video using FFmpeg, generates PDF, and delivers to user.
 */

const { logToFile } = require('../../utils/logger');
const { uploadVideoAsset } = require('../../storage/r2');
const WhatsAppService = require('../whatsapp.service');
const { getUserLanguage } = require('../../utils/language-cache');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

// Use ffmpeg/ffprobe from npm packages (cross-platform compatible)
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const ffprobePath = require('@ffprobe-installer/ffprobe').path;

const PORTAL_URL = process.env.PORTAL_URL || 'https://your-portal-domain.com';

class VideoAssemblyService {

  /**
   * Generate and send PDF immediately after images are ready
   * Called from worker after Step 2 (image generation)
   * ISSUE #1 FIX: Now uploads to R2 for permanent storage
   * @param {string} videoRequestId - Video request UUID
   * @param {Object} options - { from, language, slideUrls }
   * @returns {string} R2 PDF URL (or local path as fallback)
   */
  static async generateAndSendPDF(videoRequestId, { from, language, slideUrls }) {
    const tempDir = path.join('/tmp', 'video-generation', videoRequestId);
    const pdfPath = path.join(tempDir, 'slides.pdf');

    logToFile('Generating PDF after image step', { videoRequestId, slideCount: slideUrls.length });

    try {
      // Generate PDF from END frames (they have labels)
      await this.generatePDF(slideUrls, pdfPath);

      // ISSUE #1: Upload to R2 for permanent storage
      let pdfUrl;
      try {
        pdfUrl = await uploadVideoAsset(pdfPath, videoRequestId, 'slides.pdf');
        logToFile('PDF uploaded to R2', { videoRequestId, pdfUrl });
      } catch (err) {
        logToFile('R2 upload failed for PDF, using local path', {
          videoRequestId,
          error: err.message
        });
        pdfUrl = pdfPath; // Fallback to local path
      }

      // Send PDF to user immediately
      const VideoSessionService = require('./video-session.service');
      const messages = VideoSessionService.getProgressMessages(language);

      await WhatsAppService.sendDocument(from, pdfPath, 'slides.pdf', messages.pdfReady);
      logToFile('PDF sent to user immediately after images', { videoRequestId, from, pdfUrl });

      return pdfUrl;
    } catch (error) {
      logToFile('Error generating/sending PDF after images', {
        videoRequestId,
        error: error.message,
        stack: error.stack
      });
      // Don't throw - PDF failure shouldn't stop video generation
      return null;
    }
  }

  /**
   * Assemble final video and deliver to user
   * NOTE: PDF is now sent immediately after image generation (Step 2)
   * This method only handles video assembly and delivery
   * @param {string} videoRequestId - Video request UUID
   * @param {Object} options - { from, userId, language, videoPaths, audioPaths, slideUrls }
   */
  static async assembleAndDeliver(videoRequestId, { from, userId, language, videoPaths, audioPaths, slideUrls }) {
    const supabase = require('../../config/supabase');
    const startTime = Date.now();

    logToFile('Starting video assembly', { videoRequestId, videoCount: videoPaths.length });

    // Define tempDir outside try block so cleanup can happen in catch (Issue #45)
    const tempDir = path.join('/tmp', 'video-generation', videoRequestId);

    try {

      // Step 1: Validate audio-video sync and adjust if needed
      const adjustedVideos = await this.syncAudioVideo(videoPaths, audioPaths, tempDir);

      // Step 2: Concatenate all videos
      const concatVideoPath = path.join(tempDir, 'concat_video.mp4');
      await this.concatenateVideos(adjustedVideos, concatVideoPath);

      // Step 3: Concatenate all audio
      const concatAudioPath = path.join(tempDir, 'concat_audio.mp3');
      await this.concatenateAudio(audioPaths, concatAudioPath);

      // Step 4: Merge video and audio
      const mergedVideoPath = path.join(tempDir, 'merged.mp4');
      await this.mergeVideoAudio(concatVideoPath, concatAudioPath, mergedVideoPath);

      // Step 5: Add watermark (ISSUE #39 - NON-BLOCKING)
      // If watermarking fails, the merged video is used as-is
      const finalVideoPath = path.join(tempDir, 'final.mp4');
      const VideoWatermarkService = require('./video-watermark.service');
      const watermarkResult = await VideoWatermarkService.addWatermark(
        mergedVideoPath,
        finalVideoPath
      );

      if (!watermarkResult.success) {
        logToFile('Watermark failed, using unwatermarked video (non-blocking)', {
          videoRequestId,
          error: watermarkResult.error
        });
        // Copy merged video to final path without watermark
        fs.copyFileSync(mergedVideoPath, finalVideoPath);
      } else {
        logToFile('Watermark applied successfully', { videoRequestId });
      }

      // NOTE: PDF was already sent immediately after image generation (Step 2 in worker)
      // No need to generate/send PDF here anymore

      // ISSUE #1: Upload final video to R2 for permanent storage
      // ISSUE #21: Never store local paths - retry or fail
      let finalVideoUrl;
      const MAX_UPLOAD_RETRIES = 3;
      let uploadAttempt = 0;

      while (uploadAttempt < MAX_UPLOAD_RETRIES) {
        uploadAttempt++;
        try {
          finalVideoUrl = await uploadVideoAsset(finalVideoPath, videoRequestId, 'final.mp4');
          logToFile('Final video uploaded to R2', { videoRequestId, finalVideoUrl, attempt: uploadAttempt });
          break; // Success!
        } catch (err) {
          logToFile('R2 upload attempt failed', {
            videoRequestId,
            attempt: uploadAttempt,
            maxRetries: MAX_UPLOAD_RETRIES,
            error: err.message
          });

          if (uploadAttempt >= MAX_UPLOAD_RETRIES) {
            // Don't store local path - mark as failed instead
            logToFile('R2 upload failed after all retries - video will not be accessible in portal', {
              videoRequestId,
              error: err.message
            });
            finalVideoUrl = null; // Don't store local path
          } else {
            // Wait before retry
            await new Promise(resolve => setTimeout(resolve, 2000 * uploadAttempt));
          }
        }
      }

      // Step 5: Send final video to user
      const VideoSessionService = require('./video-session.service');
      const messages = VideoSessionService.getProgressMessages(language);

      await WhatsAppService.sendVideo(from, fs.readFileSync(finalVideoPath), tempDir, messages.complete);
      logToFile('Video sent to user', { videoRequestId, from });

      // Issue #7: Send portal prompt after video delivery (using user's preferred language)
      const userPreferredLanguage = userId ? await getUserLanguage(userId) : language;

      // Portal prompts in all 9 supported languages
      const portalPrompts = {
        en: `📚 Your videos are also available on the Rumi Portal!\n\n👉 ${PORTAL_URL}\n\nYou can view and download all your videos and slides there.`,
        ur: `📚 آپ کی ویڈیوز Rumi Portal پر بھی دستیاب ہیں!\n\n👉 ${PORTAL_URL}\n\nوہاں آپ اپنی تمام ویڈیوز اور سلائیڈز دیکھ سکتے ہیں۔`,
        ar: `📚 فيديوهاتك متاحة أيضاً على بوابة رومي!\n\n👉 ${PORTAL_URL}\n\nيمكنك مشاهدة وتحميل جميع فيديوهاتك وشرائحك هناك.`,
        es: `📚 ¡Tus videos también están disponibles en el Portal Rumi!\n\n👉 ${PORTAL_URL}\n\nPuedes ver y descargar todos tus videos y diapositivas allí.`,
        'ps-PK': `📚 ستاسو ویډیوګانې په رومي پورټل کې هم شتون لري!\n\n👉 ${PORTAL_URL}\n\nتاسو کولی شئ هلته خپل ټول ویډیوګانې او سلایډونه وګورئ او ډاونلوډ کړئ.`,
        'pa-PK': `📚 تہاڈیاں ویڈیوز رومی پورٹل تے وی دستیاب نیں!\n\n👉 ${PORTAL_URL}\n\nاوتھے تسی اپنیاں ساریاں ویڈیوز تے سلائیڈز ویکھ تے ڈاؤنلوڈ کر سکدے او۔`,
        'sd-PK': `📚 توهان جون وڊيوز رومي پورٽل تي پڻ موجود آهن!\n\n👉 ${PORTAL_URL}\n\nاتي توهان پنهنجون سڀ وڊيوز ۽ سلائيڊون ڏسي ۽ ڊائونلوڊ ڪري سگهو ٿا.`,
        'bal-PK': `📚 شمی ویڈیوز رومی پورٹل ءَ ہم داب انت!\n\n👉 ${PORTAL_URL}\n\nادان شما تمام ویڈیوز و سلائڈز گندگ و ڈاؤنلوڈ کن اِت۔`,
        'ta-LK': `📚 உங்கள் வீடியோக்கள் ரூமி போர்ட்டலிலும் கிடைக்கின்றன!\n\n👉 ${PORTAL_URL}\n\nஅங்கு உங்கள் அனைத்து வீடியோக்களையும் ஸ்லைடுகளையும் பார்க்கலாம் மற்றும் பதிவிறக்கலாம்.`
      };

      const portalPrompt = portalPrompts[userPreferredLanguage] || portalPrompts.en;

      // Small delay before portal prompt
      await new Promise(resolve => setTimeout(resolve, 2000));
      await WhatsAppService.sendMessage(from, portalPrompt);
      logToFile('Portal prompt sent after video delivery', { videoRequestId, from, userPreferredLanguage });

      // Step 6: Update database with R2 video URL
      // NOTE: pdf_url was already stored by worker after image generation
      // ISSUE #21: Only store valid R2 URLs, never local paths
      const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);

      if (finalVideoUrl && finalVideoUrl.includes('r2.cloudflarestorage.com')) {
        await supabase
          .from('video_requests')
          .update({
            video_url: finalVideoUrl  // Verified R2 URL
          })
          .eq('id', videoRequestId);

        logToFile('Video assembly complete with R2 URL', {
          videoRequestId,
          elapsedSeconds,
          r2Url: finalVideoUrl
        });
      } else {
        // Video was sent to user but not stored in R2 for portal
        logToFile('Video assembly complete but R2 upload failed - portal will not have video', {
          videoRequestId,
          elapsedSeconds,
          note: 'User received video via WhatsApp, but portal access unavailable'
        });
      }

      // Step 7: Clean up temp files (Issue #45: CRITICAL - ~260MB per video)
      // Must happen before return to prevent Railway storage exhaustion
      this.cleanup(tempDir);

      // Return R2 URL for worker to use (may be null)
      return { videoUrl: finalVideoUrl };

    } catch (error) {
      logToFile('Error in video assembly', {
        videoRequestId,
        error: error.message,
        stack: error.stack
      });

      // Update database with error
      await supabase
        .from('video_requests')
        .update({
          status: 'failed',
          error_message: error.message
        })
        .eq('id', videoRequestId);

      // Notify user of failure
      await WhatsAppService.sendMessage(from,
        "Sorry, there was an error generating your video. Please try again later."
      );

      // Issue #45: Clean up temp files even on error to prevent storage exhaustion
      this.cleanup(tempDir);

      throw error;
    }
  }

  /**
   * Sync video and audio durations using tpad/trim
   * @param {Array} videoPaths - Array of video file paths
   * @param {Array} audioPaths - Array of audio file paths
   * @param {string} tempDir - Temp directory for output
   * @returns {Array} Array of adjusted video paths
   */
  static async syncAudioVideo(videoPaths, audioPaths, tempDir) {
    const adjustedPaths = [];

    for (let i = 0; i < videoPaths.length; i++) {
      const videoPath = videoPaths[i];
      const audioPath = audioPaths[i];

      const videoDuration = this.getMediaDuration(videoPath);
      const audioDuration = this.getMediaDuration(audioPath);

      logToFile(`Slide ${i + 1} sync check`, {
        videoDuration,
        audioDuration
      });

      const adjustedPath = path.join(tempDir, `adjusted_${i + 1}.mp4`);

      if (audioDuration > videoDuration + 0.5) {
        // Audio is longer - extend video with tpad (freeze last frame)
        const padDuration = audioDuration - videoDuration;
        execSync(
          `"${ffmpegPath}" -y -i "${videoPath}" -vf "tpad=stop_mode=clone:stop_duration=${padDuration}" -c:a copy "${adjustedPath}"`,
          { stdio: 'pipe' }
        );
      } else if (audioDuration < videoDuration - 0.5) {
        // Video is longer - trim to audio duration
        execSync(
          `"${ffmpegPath}" -y -i "${videoPath}" -t ${audioDuration} -c copy "${adjustedPath}"`,
          { stdio: 'pipe' }
        );
      } else {
        // Close enough - just copy
        fs.copyFileSync(videoPath, adjustedPath);
      }

      adjustedPaths.push(adjustedPath);
    }

    return adjustedPaths;
  }

  /**
   * Concatenate videos using FFmpeg
   * @param {Array} videoPaths - Array of video paths
   * @param {string} outputPath - Output file path
   */
  static async concatenateVideos(videoPaths, outputPath) {
    const listPath = path.join(path.dirname(outputPath), 'video_list.txt');
    const listContent = videoPaths.map(p => `file '${p}'`).join('\n');
    fs.writeFileSync(listPath, listContent);

    execSync(
      `"${ffmpegPath}" -y -f concat -safe 0 -i "${listPath}" -c copy "${outputPath}"`,
      { stdio: 'pipe' }
    );
  }

  /**
   * Concatenate audio files using FFmpeg
   * ISSUE #31 FIX: Add silence buffer between clips and re-encode to prevent clipping
   * The old `-c copy` approach caused first syllables to be cut off at boundaries
   * @param {Array} audioPaths - Array of audio paths
   * @param {string} outputPath - Output file path
   */
  static async concatenateAudio(audioPaths, outputPath) {
    const tempDir = path.dirname(outputPath);
    const silencePath = path.join(tempDir, 'silence_50ms.mp3');

    // Step 1: Generate 50ms silence file (prevents audio boundary clipping)
    execSync(
      `"${ffmpegPath}" -y -f lavfi -i anullsrc=r=44100:cl=stereo -t 0.05 -c:a libmp3lame -q:a 9 "${silencePath}"`,
      { stdio: 'pipe' }
    );

    // Step 2: Build list with silence buffers between each audio file
    const listPath = path.join(tempDir, 'audio_list.txt');
    const listEntries = [];

    for (let i = 0; i < audioPaths.length; i++) {
      // Add silence BEFORE each audio file (including first)
      // This gives the codec time to "wake up" and prevents initial syllable clipping
      listEntries.push(`file '${silencePath}'`);
      listEntries.push(`file '${audioPaths[i]}'`);
    }
    // Add trailing silence for clean ending
    listEntries.push(`file '${silencePath}'`);

    fs.writeFileSync(listPath, listEntries.join('\n'));

    // Step 3: Concatenate with RE-ENCODING (not -c copy)
    // Re-encoding ensures clean boundaries without codec artifacts
    execSync(
      `"${ffmpegPath}" -y -f concat -safe 0 -i "${listPath}" -c:a libmp3lame -q:a 2 "${outputPath}"`,
      { stdio: 'pipe' }
    );

    logToFile('Audio concatenated with silence buffers', {
      audioCount: audioPaths.length,
      outputPath
    });
  }

  /**
   * Merge video and audio tracks
   * @param {string} videoPath - Video file path
   * @param {string} audioPath - Audio file path
   * @param {string} outputPath - Output file path
   */
  static async mergeVideoAudio(videoPath, audioPath, outputPath) {
    const videoDuration = this.getMediaDuration(videoPath);
    const audioDuration = this.getMediaDuration(audioPath);

    logToFile('Merging video and audio', { videoDuration, audioDuration });

    // ISSUE #59 FIX: WhatsApp mobile compatibility flags
    // -pix_fmt yuv420p: Required for mobile playback (prevents black screen)
    // -profile:v main: Widely compatible H.264 profile
    // -level 3.1: Supports 720p @ 30fps (safe for most devices)
    const mobileCompatFlags = '-pix_fmt yuv420p -profile:v main -level 3.1';

    // If video is shorter than audio, pad it
    if (audioDuration > videoDuration + 0.5) {
      const padDuration = audioDuration - videoDuration;
      execSync(
        `"${ffmpegPath}" -y -i "${videoPath}" -i "${audioPath}" ` +
        `-filter_complex "[0:v]tpad=stop_mode=clone:stop_duration=${padDuration}[v]" ` +
        `-map "[v]" -map 1:a ` +
        `-c:v libx264 -preset medium -crf 23 ${mobileCompatFlags} ` +
        `-c:a aac -b:a 128k -movflags +faststart ` +
        `"${outputPath}"`,
        { stdio: 'pipe' }
      );
    } else {
      execSync(
        `"${ffmpegPath}" -y -i "${videoPath}" -i "${audioPath}" ` +
        `-map 0:v -map 1:a ` +
        `-c:v libx264 -preset medium -crf 23 ${mobileCompatFlags} ` +
        `-c:a aac -b:a 128k -movflags +faststart ` +
        `"${outputPath}"`,
        { stdio: 'pipe' }
      );
    }
  }

  /**
   * Generate PDF from slide images
   * ISSUE #3 FIX: Use PDFKit instead of ImageMagick (works on all platforms including Railway)
   * @param {Array} slideUrls - Array of { slideId, startUrl, endUrl }
   * @param {string} outputPath - Output PDF path
   */
  static async generatePDF(slideUrls, outputPath) {
    // Use END frames for PDF (they have labels)
    const tempDir = path.dirname(outputPath);
    const imagePaths = [];

    for (const slide of slideUrls) {
      const localPath = path.join(tempDir, 'slides', `slide_${slide.slideId}_end.png`);
      if (fs.existsSync(localPath)) {
        imagePaths.push(localPath);
      }
    }

    if (imagePaths.length === 0) {
      logToFile('No slide images found for PDF', { slideUrls });
      return;
    }

    // ISSUE #3: Use PDFKit instead of ImageMagick (cross-platform compatible)
    return new Promise((resolve, reject) => {
      try {
        // Create PDF in landscape for 16:9 slides
        const doc = new PDFDocument({
          size: 'A4',
          layout: 'landscape',
          margins: { top: 0, bottom: 0, left: 0, right: 0 }
        });

        const writeStream = fs.createWriteStream(outputPath);
        doc.pipe(writeStream);

        // Add each slide image as a page
        for (let i = 0; i < imagePaths.length; i++) {
          if (i > 0) {
            doc.addPage();
          }

          // Fit image to full page width maintaining aspect ratio
          const pageWidth = doc.page.width;
          const pageHeight = doc.page.height;

          doc.image(imagePaths[i], 0, 0, {
            width: pageWidth,
            height: pageHeight,
            fit: [pageWidth, pageHeight],
            align: 'center',
            valign: 'center'
          });
        }

        doc.end();

        writeStream.on('finish', () => {
          logToFile('PDF generated with PDFKit', { outputPath, slideCount: imagePaths.length });
          resolve();
        });

        writeStream.on('error', (err) => {
          logToFile('Error writing PDF', { outputPath, error: err.message });
          reject(err);
        });
      } catch (err) {
        logToFile('Error generating PDF with PDFKit', { outputPath, error: err.message });
        reject(err);
      }
    });
  }

  /**
   * Get media duration using ffprobe
   * @param {string} filePath - Media file path
   * @returns {number} Duration in seconds
   */
  static getMediaDuration(filePath) {
    try {
      const result = execSync(
        `"${ffprobePath}" -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`,
        { encoding: 'utf8' }
      );
      return parseFloat(result.trim());
    } catch (error) {
      logToFile('Error getting media duration', { filePath, error: error.message });
      return 10;
    }
  }

  /**
   * Clean up temp files
   * @param {string} tempDir - Directory to clean
   */
  static cleanup(tempDir) {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
      logToFile('Temp files cleaned up', { tempDir });
    } catch (error) {
      logToFile('Error cleaning up temp files', { tempDir, error: error.message });
    }
  }
}

module.exports = VideoAssemblyService;
