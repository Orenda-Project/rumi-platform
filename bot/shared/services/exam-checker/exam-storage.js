/**
 * Where the exam checker keeps its files: the teacher's photos, the marked
 * pages and the summary PDF.
 *
 * With R2 configured, files go to the bucket as before. Without it — a sandbox,
 * or any deployment that never set up object storage — they are written under
 * TEMP_DIR/exam_checker and passed around as file:// URLs, the same way voice
 * notes, reading reports and lesson-quiz pictures already work without a
 * bucket. The Baileys, Slack, Matrix and Discord drivers send a file:// URL
 * straight off disk; Meta's Cloud API cannot fetch one, so a Meta deployment
 * still needs R2 (warned when it happens). The worker and the bot must share
 * the disk, which they do on one host.
 *
 * Reading goes through here too, so a private bucket is read with the R2
 * client instead of a plain HTTP GET it would refuse.
 */

const fs = require('fs');
const path = require('path');
const r2 = require('../../storage/r2');
const { logToFile } = require('../../utils/logger');

const FOLDER = 'exam_checker';

function rootDir() {
  // Read at call time, so the folder follows TEMP_DIR wherever it is set.
  const { TEMP_DIR } = require('../../utils/constants');
  return path.join(TEMP_DIR, FOLDER);
}

/** One plain path segment: ids and names come from messages and rows. */
function segment(value) {
  return String(value == null ? '' : value).replace(/[^A-Za-z0-9_.-]/g, '_').replace(/^\.+/, '_') || '_';
}

/** Inside the exam checker's folder, or null. */
function insideRoot(filePath) {
  const root = rootDir() + path.sep;
  const resolved = path.resolve(filePath);
  return resolved.startsWith(root) ? resolved : null;
}

function warnIfMeta(what) {
  if (String(process.env.CHANNEL_DRIVER || '').toLowerCase() === 'meta') {
    logToFile('⚠️ exam checker: no object storage — a file is kept on local disk, which the Meta driver cannot send (set R2_*)', {
      what,
    }, 'warn');
  }
}

function writeLocal(relativeSegments, buffer) {
  const file = path.join(rootDir(), ...relativeSegments.map(segment));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, buffer);
  return `file://${file}`;
}

/**
 * Keep a photo the teacher sent.
 * @returns {Promise<string>} an R2 URL, or a file:// URL without R2
 */
async function storeExamImage({ buffer, userId, imageId, mimeType }) {
  if (r2.isR2Configured()) {
    return r2.uploadImageWithRetry(buffer, userId, imageId, mimeType);
  }
  const ext = mimeType === 'image/png' ? 'png'
    : mimeType === 'image/gif' ? 'gif'
      : mimeType === 'image/webp' ? 'webp' : 'jpg';
  warnIfMeta('photo');
  return writeLocal(['images', userId, `${imageId}_${Date.now()}.${ext}`], buffer);
}

/**
 * Keep a file the exam checker made (a marked page, the summary PDF).
 * @param {object} p
 * @param {Buffer} p.buffer
 * @param {string} p.key          the R2 object key, e.g. exams/<session>/annotated_<name>_p1.png
 * @param {string} p.contentType
 * @returns {Promise<string>} an R2 URL, or a file:// URL without R2
 */
async function storeExamFile({ buffer, key, contentType }) {
  if (r2.isR2Configured()) {
    return r2.uploadBuffer(buffer, key, contentType);
  }
  warnIfMeta(key);
  const parts = String(key).split('/').filter((p) => p && p !== '.' && p !== '..');
  return writeLocal(parts.length ? parts : ['file'], buffer);
}

/** Is this URL an object in our own (private) bucket? */
function isOwnBucketUrl(url) {
  const endpoint = process.env.R2_ENDPOINT || '';
  return (endpoint && url.startsWith(endpoint)) || url.includes('.r2.cloudflarestorage.com/');
}

/**
 * Read a file the exam checker stored: off disk for a file:// URL, through the
 * R2 client for our own bucket, over plain HTTP for anything else.
 * @returns {Promise<Buffer>}
 */
async function readExamFile(url) {
  if (typeof url === 'string' && url.startsWith('file://')) {
    const file = insideRoot(url.slice('file://'.length));
    if (!file) throw new Error("Refusing to read a file outside the exam checker's folder");
    return fs.promises.readFile(file);
  }
  if (r2.isR2Configured() && isOwnBucketUrl(url)) {
    return r2.downloadFromR2(r2.extractKeyFromUrl(url));
  }
  const axios = require('axios');
  const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 60000 });
  return Buffer.from(response.data);
}

module.exports = { storeExamImage, storeExamFile, readExamFile, isOwnBucketUrl };
