/**
 * R2 Storage Service for Observability Portal
 * Proxies authenticated file downloads from private R2 bucket
 * Generates presigned URLs for client-side access
 */

const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
require('dotenv').config();

// Lazy R2 client — resolved on first use, not at module load, so requiring
// this service (e.g. transitively from dashboard/index.js) never depends on
// R2 env vars being set. Mirrors the bot's lazy-client pattern + the
// no-eager-sdk-construction guard contract.
let _r2Client = null;
function getR2Client() {
  if (_r2Client) return _r2Client;
  _r2Client = new S3Client({
    region: 'auto',
    endpoint: process.env.R2_ENDPOINT,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  });
  return _r2Client;
}

const BUCKET_NAME = process.env.R2_BUCKET_NAME;

/**
 * Download file from R2 storage (buffers entire file)
 * Use streamFromR2() for large files like audio to reduce latency
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
 * Stream file from R2 storage (for large files like audio)
 * Reduces latency - client starts receiving data immediately
 * @param {string} key - R2 object key
 * @returns {Promise<{stream: ReadableStream, contentLength: number, contentType: string}>}
 */
async function streamFromR2(key) {
  try {
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });

    const response = await getR2Client().send(command);
    console.log(`✅ Streaming from R2: ${key} (${response.ContentLength} bytes)`);

    return {
      stream: response.Body,
      contentLength: response.ContentLength,
      contentType: response.ContentType || getContentTypeFromKey(key)
    };
  } catch (error) {
    console.error('❌ Error streaming from R2:', error);
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
 * Get content type from R2 key/filename
 * @param {string} key - R2 key
 * @returns {string} MIME type
 */
function getContentTypeFromKey(key) {
  const ext = key.split('.').pop().toLowerCase();
  const types = {
    'pdf': 'application/pdf',
    'mp3': 'audio/mpeg',
    'ogg': 'audio/ogg',
    'opus': 'audio/opus',
    'wav': 'audio/wav',
    'm4a': 'audio/mp4',
    'mp4': 'video/mp4',
    'png': 'image/png',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'doc': 'application/msword',
    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  };
  return types[ext] || 'application/octet-stream';
}

/**
 * Check if URL is a valid R2 URL (not a local path)
 * @param {string} url - URL to check
 * @returns {boolean} True if valid R2 URL
 */
function isValidR2Url(url) {
  if (!url) return false;
  return url.includes('r2.cloudflarestorage.com') ||
         url.includes('.r2.dev') ||
         (process.env.R2_ENDPOINT && url.includes(process.env.R2_ENDPOINT));
}

/**
 * Generate a presigned URL for R2 object
 * Issue #25, #26: Fix videos not playing and downloads returning HTML
 * @param {string} r2Url - Full R2 URL (https://...r2.cloudflarestorage.com/bucket/key)
 * @param {number} expiresIn - Expiry time in seconds (default: 1 hour)
 * @returns {Promise<string|null>} Presigned URL or null if invalid
 */
async function generatePresignedUrl(r2Url, expiresIn = 3600) {
  try {
    // Skip if URL is invalid (local path, null, etc.)
    if (!isValidR2Url(r2Url)) {
      console.warn(`⚠️ Cannot generate presigned URL for invalid R2 URL: ${r2Url}`);
      return null;
    }

    const key = extractKeyFromUrl(r2Url);

    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });

    const presignedUrl = await getSignedUrl(getR2Client(), command, { expiresIn });
    console.log(`✅ Generated presigned URL for: ${key} (expires in ${expiresIn}s)`);
    return presignedUrl;
  } catch (error) {
    console.error('❌ Error generating presigned URL:', error.message);
    return null;
  }
}

/**
 * Generate presigned URLs for an array of R2 URLs
 * Issue #20: Fix thumbnails not appearing
 * @param {string[]} urls - Array of R2 URLs
 * @param {number} expiresIn - Expiry time in seconds
 * @returns {Promise<string[]>} Array of presigned URLs (invalid URLs remain as-is)
 */
async function generatePresignedUrls(urls, expiresIn = 3600) {
  if (!urls || !Array.isArray(urls)) return [];

  const presignedUrls = await Promise.all(
    urls.map(async (url) => {
      if (typeof url !== 'string') return url;
      const presigned = await generatePresignedUrl(url, expiresIn);
      return presigned || url; // Return original if presigning fails
    })
  );

  return presignedUrls;
}

module.exports = {
  downloadFromR2,
  streamFromR2,
  extractKeyFromUrl,
  getContentTypeFromKey,
  isValidR2Url,
  generatePresignedUrl,
  generatePresignedUrls,
};
