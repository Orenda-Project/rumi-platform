/**
 * Getting a register into the hands of whoever just marked it.
 *
 * Split from attendance-register.service on purpose: that file is pure — people and
 * records in, a buffer out. This one is the I/O, written so that storage, the channel
 * and the disk can each fail without costing the attendance that was just saved.
 *
 * ORDER MATTERS. Callers run this AFTER the write, never before, so the day just
 * marked is in the file. A sheet missing the register the teacher just saved reads
 * as data loss.
 */

const fs = require('fs');
const WhatsAppService = require('./whatsapp.service');
const { logToFile } = require('../utils/logger');
const { uploadBuffer, isR2Configured } = require('../storage/r2');
const { TEMP_DIR } = require('../utils/constants');
const { privateTempPath, removePrivateTemp } = require('../utils/private-temp');
const { shortSha256, takeUploadedSha256 } = require('../utils/upload-digest');

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * Archive a register to R2 when storage is configured, then send it.
 *
 * R2 is the archive, not the delivery: a deployment with no bucket, or a storage
 * outage, must not stop the file reaching the person who just made it. The send
 * result is returned as it came back from the channel — a refused document is not
 * reported as delivered. Never throws.
 *
 * @param {object} p
 * @param {string} p.to        the address the teacher wrote from (any channel)
 * @param {Buffer} p.buffer
 * @param {string} p.fileName
 * @param {string} p.caption
 * @param {string} p.r2Key
 * @returns {Promise<{sent: boolean, url: string|null}>}
 */
async function deliverRegisterFile({ to, buffer, fileName, caption, r2Key }) {
  let url = null;
  if (isR2Configured()) {
    try {
      url = await uploadBuffer(buffer, r2Key, XLSX_MIME);
    } catch (error) {
      logToFile('⚠️ Register upload to R2 failed — sending anyway', { error: error.message });
    }
  }

  let sent = false;
  let temp = null;
  let fileSha256 = null;
  try {
    // ONE DIRECTORY PER DELIVERY. The file name carries no school ("Grade 5 A,
    // September 2026" is the same name everywhere), and the Meta upload reads the file
    // lazily, after the HTTP connection is up. Written straight into TEMP_DIR, a second
    // delivery of the same name overwrote the first one's file before it was read, and
    // the first teacher received the other school's register. The file keeps its
    // display name; only the directory is unique. (privateTempPath also creates
    // TEMP_DIR: whatsapp-bot.js does at boot, but this runs on fresh containers and
    // from tests too, where the register would otherwise be lost to ENOENT.)
    temp = privateTempPath(TEMP_DIR, fileName, 'reg-');
    fs.writeFileSync(temp.filePath, buffer);
    sent = Boolean(await WhatsAppService.sendDocument(to, temp.filePath, fileName, caption));
    // The bytes the driver actually uploaded from this path — hashed where the
    // upload reads them, so a file changed under a lazy read shows as a mismatch
    // with the buffer's sha. null when the driver ran elsewhere (upload-digest.js).
    fileSha256 = takeUploadedSha256(temp.filePath);
  } catch (error) {
    logToFile('❌ Register send failed', { fileName, error: error.message });
  } finally {
    removePrivateTemp(temp);
  }
  // A refused document is logged as refused: a ✅ on a false send made failed
  // uploads look like deliveries. No address in the line, only which bytes.
  logToFile(sent ? '✅ Register delivered' : '⚠️ Register not delivered', {
    fileName, delivered: sent, bufferSha256: shortSha256(buffer), fileSha256,
  });
  return { sent, url };
}

module.exports = { deliverRegisterFile, XLSX_MIME };
