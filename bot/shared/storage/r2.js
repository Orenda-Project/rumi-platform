/**
 * Cloudflare R2 Storage Helper
 * Handles audio file uploads to R2 storage
 */

const { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const fs = require('fs');
const path = require('path');
const { lazyClient } = require('../utils/lazy-client');

// R2 client is lazy-initialised. The bot can boot without R2 credentials set —
// every R2 helper below calls getR2Client() at the moment the actual S3-API
// command is sent. If R2 isn't configured, the upload throws a structured
// "missing env" error that the caller can catch (or surface to the user).
const getR2Client = lazyClient(S3Client, ['R2_ENDPOINT', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY'], (env) => ({
  region: 'auto',
  endpoint: env.R2_ENDPOINT,
  credentials: {
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  },
}));

const BUCKET_NAME = process.env.R2_BUCKET_NAME;

/**
 * Upload audio file to R2 storage
 * @param {string} filePath - Local file path
 * @param {string} userId - User's phone number (for organizing files)
 * @param {string} messageId - WhatsApp message ID
 * @returns {Promise<string>} Public URL of uploaded file
 */
async function uploadAudio(filePath, userId, messageId) {
  try {
    const fileContent = fs.readFileSync(filePath);
    const fileExt = path.extname(filePath);
    const timestamp = Date.now();

    // Create organized path: audio/{userId}/{timestamp}_{messageId}.ext
    const key = `audio/${userId}/${timestamp}_${messageId}${fileExt}`;

    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: fileContent,
      ContentType: getContentType(fileExt),
    });

    await getR2Client().send(command);

    // Construct public URL
    const publicUrl = `${process.env.R2_ENDPOINT}/${BUCKET_NAME}/${key}`;

    console.log(`✅ Audio uploaded to R2: ${key}`);
    return publicUrl;
  } catch (error) {
    console.error('❌ Error uploading to R2:', error);
    throw error;
  }
}

/**
 * Get content type based on file extension
 */
function getContentType(ext) {
  const types = {
    '.ogg': 'audio/ogg',
    '.opus': 'audio/opus',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.m4a': 'audio/mp4',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
  };
  return types[ext.toLowerCase()] || 'application/octet-stream';
}

function buildR2PublicUrl(key) {
  return `${process.env.R2_ENDPOINT}/${BUCKET_NAME}/${key}`;
}

async function uploadLessonPlanBuffer({ buffer, userId, sessionId, fileType = 'pdf' }) {
  const normalizedExt = fileType.startsWith('.') ? fileType.toLowerCase() : `.${fileType.toLowerCase()}`;
  const key = `lesson_plans/${userId}/${sessionId}_lesson_plan${normalizedExt}`;

  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    Body: buffer,
    ContentType: getContentType(normalizedExt),
    Metadata: {
      userId,
      sessionId,
      uploadedAt: new Date().toISOString()
    }
  });

  await getR2Client().send(command);
  console.log(`✅ Lesson plan buffer uploaded to R2: ${key}`);
  return key;
}

/**
 * Delete audio file from R2 (for cleanup)
 * @param {string} url - Full URL of the file
 */
async function deleteAudio(url) {
  try {
    // Extract key from URL
    const urlParts = url.split(`/${BUCKET_NAME}/`);
    if (urlParts.length < 2) {
      throw new Error('Invalid R2 URL format');
    }
    const key = urlParts[1];

    const command = new DeleteObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });

    await getR2Client().send(command);
    console.log(`✅ Audio deleted from R2: ${key}`);
    return true;
  } catch (error) {
    console.error('❌ Error deleting from R2:', error);
    return false;
  }
}

/**
 * Upload classroom audio to R2 (organized by date)
 * @param {string} filePath - Local file path
 * @param {string} userId - User's phone number
 * @param {string} sessionId - Coaching session ID
 * @param {object} metadata - Additional metadata (duration, language, format)
 * @returns {Promise<string>} Public URL of uploaded file
 */
async function uploadClassroomAudio(filePath, userId, sessionId, metadata = {}) {
  try {
    const fileContent = fs.readFileSync(filePath);
    const fileExt = path.extname(filePath);
    const timestamp = Date.now();

    // Get current year-month for organization
    const date = new Date();
    const yearMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

    // Create organized path: classroom_audio/{userId}/{YYYY-MM}/{sessionId}_{timestamp}.ext
    const key = `classroom_audio/${userId}/${yearMonth}/${sessionId}_${timestamp}${fileExt}`;

    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: fileContent,
      ContentType: getContentType(fileExt),
      Metadata: {
        userId: userId,
        sessionId: sessionId,
        duration: String(metadata.duration || ''),
        language: metadata.language || '',
        format: metadata.format || '',
        uploadedAt: new Date().toISOString()
      }
    });

    await getR2Client().send(command);

    // Construct public URL
    const publicUrl = `${process.env.R2_ENDPOINT}/${BUCKET_NAME}/${key}`;

    console.log(`✅ Classroom audio uploaded to R2: ${key}`);
    return publicUrl;
  } catch (error) {
    console.error('❌ Error uploading classroom audio to R2:', error);
    throw error;
  }
}

/**
 * Upload lesson plan document to R2
 * @param {string} filePath - Local file path
 * @param {string} userId - User's phone number
 * @param {string} sessionId - Coaching session ID
 * @returns {Promise<string>} Public URL of uploaded file
 */
async function uploadLessonPlan(filePath, userId, sessionId) {
  try {
    const fileContent = fs.readFileSync(filePath);
    const fileExt = path.extname(filePath);

    // Create path: lesson_plans/{userId}/{sessionId}_lesson_plan.{ext}
    const key = `lesson_plans/${userId}/${sessionId}_lesson_plan${fileExt}`;

    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: fileContent,
      ContentType: getContentType(fileExt),
      Metadata: {
        userId: userId,
        sessionId: sessionId,
        uploadedAt: new Date().toISOString()
      }
    });

    await getR2Client().send(command);

    const publicUrl = `${process.env.R2_ENDPOINT}/${BUCKET_NAME}/${key}`;

    console.log(`✅ Lesson plan uploaded to R2: ${key}`);
    return publicUrl;
  } catch (error) {
    console.error('❌ Error uploading lesson plan to R2:', error);
    throw error;
  }
}

/**
 * Upload voice debrief audio to R2
 * @param {Buffer} audioBuffer - Audio buffer from TTS
 * @param {string} userId - User's phone number
 * @param {string} sessionId - Coaching session ID
 * @param {string} language - Language code ('en', 'ur')
 * @returns {Promise<string>} Public URL of uploaded file
 */
async function uploadVoiceDebrief(audioBuffer, userId, sessionId, language) {
  try {
    // Create path: voice_debriefs/{userId}/{sessionId}_debrief.mp3
    const key = `voice_debriefs/${userId}/${sessionId}_debrief.mp3`;

    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: audioBuffer,
      ContentType: 'audio/mpeg',
      Metadata: {
        userId: userId,
        sessionId: sessionId,
        language: language,
        generatedAt: new Date().toISOString()
      }
    });

    await getR2Client().send(command);

    const publicUrl = `${process.env.R2_ENDPOINT}/${BUCKET_NAME}/${key}`;

    console.log(`✅ Voice debrief uploaded to R2: ${key}`);
    return publicUrl;
  } catch (error) {
    console.error('❌ Error uploading voice debrief to R2:', error);
    throw error;
  }
}

/**
 * Upload observation report PDF to R2
 * @param {Buffer} pdfBuffer - PDF buffer
 * @param {string} userId - User's phone number
 * @param {string} sessionId - Coaching session ID
 * @returns {Promise<string>} Public URL of uploaded file
 */
async function uploadReportPDF(pdfBuffer, userId, sessionId) {
  try {
    // Create path: reports/{userId}/{sessionId}_report.pdf
    const key = `reports/${userId}/${sessionId}_report.pdf`;

    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: pdfBuffer,
      ContentType: 'application/pdf',
      Metadata: {
        userId: userId,
        sessionId: sessionId,
        generatedAt: new Date().toISOString()
      }
    });

    await getR2Client().send(command);

    const publicUrl = `${process.env.R2_ENDPOINT}/${BUCKET_NAME}/${key}`;

    console.log(`✅ Report PDF uploaded to R2: ${key}`);
    return publicUrl;
  } catch (error) {
    console.error('❌ Error uploading report PDF to R2:', error);
    throw error;
  }
}

/**
 * Upload image buffer to R2 (for Gemini-generated vocabulary images)
 * Word-level comprehension assessment
 * @param {Buffer} imageBuffer - Image buffer (PNG from Gemini)
 * @param {string} key - R2 object key (e.g., "vocab_images/tree_1234567890.png")
 * @returns {Promise<string>} R2 key
 */
async function uploadImageBuffer(imageBuffer, key) {
  try {
    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: imageBuffer,
      ContentType: 'image/png',
      Metadata: {
        generatedAt: new Date().toISOString()
      }
    });

    await getR2Client().send(command);
    console.log(`✅ Vocabulary image uploaded to R2: ${key}`);
    return key;
  } catch (error) {
    console.error('❌ Error uploading vocabulary image to R2:', error);
    throw error;
  }
}

/**
 * Upload feature introduction video to R2
 * Used for onboarding/feature discovery videos
 * @param {string} filePath - Local file path to the video
 * @param {string} featureName - Feature name (e.g., 'reading', 'coaching', 'lesson_plan')
 * @returns {Promise<string>} Public URL of uploaded video
 */
async function uploadFeatureVideo(filePath, featureName) {
  try {
    const fileContent = fs.readFileSync(filePath);
    const fileExt = path.extname(filePath);

    // Create path: feature_videos/{featureName}_intro.mp4
    const key = `feature_videos/${featureName}_intro${fileExt}`;

    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: fileContent,
      ContentType: getContentType(fileExt),
      Metadata: {
        featureName: featureName,
        uploadedAt: new Date().toISOString()
      }
    });

    await getR2Client().send(command);

    const publicUrl = `${process.env.R2_ENDPOINT}/${BUCKET_NAME}/${key}`;

    console.log(`✅ Feature video uploaded to R2: ${key}`);
    return publicUrl;
  } catch (error) {
    console.error('❌ Error uploading feature video to R2:', error);
    throw error;
  }
}

/**
 * Download file from R2 storage
 * @param {string} key - R2 object key (e.g., "reports/userId/sessionId_report.pdf")
 * @returns {Promise<Buffer>} File buffer
 */
async function downloadFromR2(key) {
  try {
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });

    const response = await getR2Client().send(command);

    // Convert stream to buffer
    const chunks = [];
    for await (const chunk of response.Body) {
      chunks.push(chunk);
    }

    const buffer = Buffer.concat(chunks);
    console.log(`✅ Downloaded from R2: ${key} (${buffer.length} bytes)`);
    return buffer;
  } catch (error) {
    console.error('❌ Error downloading from R2:', error);
    throw error;
  }
}

/**
 * Extract R2 key from public URL
 * @param {string} url - R2 URL (e.g., "https://...r2.../bucket/key")
 * @returns {string} R2 key
 */
function extractKeyFromUrl(url) {
  // URL format: https://endpoint/bucket/key
  // We need to extract everything after the bucket name
  const bucketIndex = url.indexOf(`/${BUCKET_NAME}/`);
  if (bucketIndex === -1) {
    throw new Error(`Could not extract R2 key from URL: ${url}`);
  }
  return url.substring(bucketIndex + `/${BUCKET_NAME}/`.length);
}

/**
 * Upload video generation asset to R2 with organized folder structure
 * Issue #1: R2 Persistence for video generation pipeline
 *
 * Folder structure:
 * videos/{videoRequestId}/
 * ├── audio/      - TTS audio files (.mp3)
 * ├── images/     - Slide images (.png, .jpg)
 * ├── segments/   - Individual slide videos (.mp4 with slide_ prefix)
 * ├── final/      - Final assembled video (.mp4)
 * ├── pdf/        - Slide PDF (.pdf)
 * └── misc/       - Other files
 *
 * @param {string|Buffer} filePathOrBuffer - Local file path or buffer
 * @param {string} videoRequestId - Video request UUID
 * @param {string} filename - Filename with extension (e.g., "slide_1.mp3")
 * @returns {Promise<string>} Public R2 URL
 */
async function uploadVideoAsset(filePathOrBuffer, videoRequestId, filename) {
  const { logToFile } = require('../utils/logger');

  // Determine subfolder based on file extension and name
  const fileExt = path.extname(filename).toLowerCase();
  let subfolder = 'misc';

  if (fileExt === '.mp3' || fileExt === '.wav' || fileExt === '.ogg') {
    subfolder = 'audio';
  } else if (fileExt === '.png' || fileExt === '.jpg' || fileExt === '.jpeg') {
    subfolder = 'images';
  } else if (fileExt === '.mp4' && filename.includes('slide_')) {
    subfolder = 'segments';
  } else if (fileExt === '.mp4') {
    subfolder = 'final';
  } else if (fileExt === '.pdf') {
    subfolder = 'pdf';
  }

  const key = `videos/${videoRequestId}/${subfolder}/${filename}`;

  // Get file content (either from path or buffer)
  let fileContent;
  if (Buffer.isBuffer(filePathOrBuffer)) {
    fileContent = filePathOrBuffer;
  } else {
    fileContent = fs.readFileSync(filePathOrBuffer);
  }

  // Extended content type mapping for video assets
  const contentTypes = {
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.mp4': 'video/mp4',
    '.pdf': 'application/pdf'
  };
  const contentType = contentTypes[fileExt] || 'application/octet-stream';

  // Retry logic with exponential backoff
  const maxRetries = 2;
  const baseDelayMs = 2000;
  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const command = new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        Body: fileContent,
        ContentType: contentType,
        Metadata: {
          videoRequestId,
          filename,
          uploadedAt: new Date().toISOString()
        }
      });

      await getR2Client().send(command);

      const publicUrl = `${process.env.R2_ENDPOINT}/${BUCKET_NAME}/${key}`;
      logToFile('Video asset uploaded to R2', {
        videoRequestId,
        filename,
        key,
        subfolder,
        attempt: attempt + 1
      });

      return publicUrl;
    } catch (error) {
      lastError = error;
      logToFile('R2 upload failed, retrying...', {
        videoRequestId,
        filename,
        attempt: attempt + 1,
        error: error.message
      });

      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, baseDelayMs * (attempt + 1)));
      }
    }
  }

  // Fallback: return local path if all retries fail
  logToFile('R2 upload failed after retries, using local path', {
    videoRequestId,
    filename,
    error: lastError?.message
  });

  // If input was a path, return it as fallback; otherwise throw
  if (typeof filePathOrBuffer === 'string') {
    return filePathOrBuffer;
  }
  throw lastError;
}

/**
 * Check if a URL is a permanent R2 URL (vs ephemeral /tmp or Kie.ai URL)
 * @param {string} url - URL to check
 * @returns {boolean} True if permanent R2 URL
 */
function isPermanentR2Url(url) {
  if (!url) return false;
  return url.includes('r2.cloudflarestorage.com') ||
         url.includes('.r2.dev') ||
         (process.env.R2_ENDPOINT && url.includes(process.env.R2_ENDPOINT)) ||
         (process.env.R2_PUBLIC_URL && url.includes(process.env.R2_PUBLIC_URL));
}

/**
 * Generate a presigned URL for temporary external access to R2 objects
 * This is the SECURE approach - no need to make bucket public
 *
 * Use this when external services (like Kie.ai) need to access R2 files
 * URLs are temporary and expire after the specified time
 *
 * @param {string} r2Url - R2 URL (private S3 API format)
 * @param {number} expiresIn - Expiration time in seconds (default: 3600 = 1 hour)
 * @returns {Promise<string>} Presigned URL with temporary access
 */
async function getPresignedUrl(r2Url, expiresIn = 3600) {
  if (!r2Url) return r2Url;

  // If it's already a presigned URL or not an R2 URL, return as-is
  if (r2Url.includes('X-Amz-Signature') || !isPermanentR2Url(r2Url)) {
    console.log(`⏭️ Skipping presign (already signed or not R2): ${r2Url.substring(0, 80)}...`);
    return r2Url;
  }

  // Extract the key from the R2 URL
  // Format: https://xxx.r2.cloudflarestorage.com/bucket-name/path/to/file.ext
  const bucketName = BUCKET_NAME;
  const bucketIndex = r2Url.indexOf(`/${bucketName}/`);

  console.log(`🔑 Presigned URL generation:`, {
    r2Url: r2Url.substring(0, 100),
    bucketName,
    bucketIndex,
    r2Endpoint: process.env.R2_ENDPOINT?.substring(0, 50)
  });

  if (bucketIndex === -1) {
    console.warn('⚠️ Could not extract key from R2 URL - bucket pattern not found:', {
      r2Url,
      bucketName,
      lookingFor: `/${bucketName}/`
    });
    return r2Url;
  }

  const key = r2Url.substring(bucketIndex + `/${bucketName}/`.length);
  console.log(`🔑 Extracted key: ${key}`);

  try {
    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: key,
    });

    const presignedUrl = await getSignedUrl(getR2Client(), command, { expiresIn });

    console.log(`✅ Generated presigned URL for ${key}:`);
    console.log(`   Original: ${r2Url.substring(0, 80)}...`);
    console.log(`   Presigned: ${presignedUrl.substring(0, 100)}...`);
    console.log(`   Expires in: ${expiresIn}s`);
    console.log(`   Has signature: ${presignedUrl.includes('X-Amz-Signature')}`);

    return presignedUrl;
  } catch (error) {
    console.error('❌ Error generating presigned URL:', {
      error: error.message,
      key,
      bucketName,
      stack: error.stack?.substring(0, 300)
    });
    return r2Url; // Fallback to original URL
  }
}

/**
 * Synchronous wrapper that returns a promise for presigned URL
 * For backward compatibility with code expecting sync toPublicUrl
 * NOTE: This is async - callers must await the result!
 *
 * @deprecated Use getPresignedUrl directly
 * @param {string} privateUrl - Private R2 URL
 * @returns {Promise<string>} Presigned URL
 */
async function toPublicUrl(privateUrl) {
  return getPresignedUrl(privateUrl, 3600); // 1 hour default
}

/**
 * Upload image to R2 with retry and exponential backoff
 * Used for multimodal vision feature - stores images for analysis
 *
 * @param {Buffer} imageBuffer - Image data buffer
 * @param {string} userId - User UUID
 * @param {string} imageId - WhatsApp media ID
 * @param {string} mimeType - MIME type (image/jpeg, image/png, etc.)
 * @returns {Promise<string>} Public URL of uploaded image
 */
async function uploadImageWithRetry(imageBuffer, userId, imageId, mimeType) {
  const { logToFile } = require('../utils/logger');

  const MAX_RETRIES = 2;
  const BASE_DELAY_MS = 2000;

  const extension = mimeType === 'image/png' ? 'png' :
                    mimeType === 'image/gif' ? 'gif' :
                    mimeType === 'image/webp' ? 'webp' : 'jpg';
  const timestamp = Date.now();
  const key = `images/${userId}/${imageId}_${timestamp}.${extension}`;

  let lastError;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const command = new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        Body: imageBuffer,
        ContentType: mimeType,
        Metadata: {
          userId,
          whatsappMediaId: imageId,
          uploadedAt: new Date().toISOString(),
          sizeBytes: String(imageBuffer.length),
        },
      });

      await getR2Client().send(command);

      const publicUrl = buildR2PublicUrl(key);

      logToFile('Image uploaded to R2', {
        key,
        publicUrl,
        attempt: attempt + 1,
        sizeBytes: imageBuffer.length,
      });

      return publicUrl;

    } catch (error) {
      lastError = error;

      logToFile('R2 image upload failed, retrying', {
        attempt: attempt + 1,
        maxRetries: MAX_RETRIES,
        error: error.message,
      });

      if (attempt < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, BASE_DELAY_MS * (attempt + 1)));
      }
    }
  }

  throw new Error(`Failed to upload image to R2 after ${MAX_RETRIES + 1} attempts: ${lastError.message}`);
}

/**
 * Generic buffer upload to R2
 * Used by attendance delivery and other services
 * @param {Buffer} buffer - File buffer
 * @param {string} key - R2 object key
 * @param {string} contentType - MIME content type
 * @returns {Promise<string>} Public URL of uploaded file
 */
async function uploadBuffer(buffer, key, contentType = 'application/octet-stream') {
  try {
    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      Metadata: {
        uploadedAt: new Date().toISOString()
      }
    });

    await getR2Client().send(command);
    const publicUrl = buildR2PublicUrl(key);

    console.log(`✅ Buffer uploaded to R2: ${key} (${buffer.length} bytes)`);
    return publicUrl;
  } catch (error) {
    console.error('❌ Error uploading buffer to R2:', error);
    throw error;
  }
}

module.exports = {
  uploadAudio,
  deleteAudio,
  uploadClassroomAudio,
  uploadLessonPlan,
  uploadLessonPlanBuffer,
  uploadVoiceDebrief,
  uploadReportPDF,
  uploadImageBuffer, // Word-level comprehension vocabulary images
  uploadImageWithRetry, // Multimodal vision: upload with retry
  uploadFeatureVideo, // Feature introduction videos for onboarding
  downloadFromR2,
  extractKeyFromUrl,
  buildR2PublicUrl,
  // Issue #1: Video generation R2 persistence
  uploadVideoAsset,
  isPermanentR2Url,
  getPresignedUrl,  // SECURE: Generate temporary presigned URLs for external access
  toPublicUrl,  // Alias for getPresignedUrl (backward compat, async!)
  uploadBuffer, // Generic buffer upload for attendance Excel
};
