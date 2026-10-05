/**
 * A temp file path that no other call can share.
 *
 * Every media send writes its bytes to disk and hands the PATH to the channel's upload,
 * which may open a read stream that is consumed only when the HTTP body goes out — some
 * time after the write. A path built from a display name ("Attendance_Grade_5_A_
 * September_2026.xlsx") or from the clock alone (`audio_${Date.now()}.ogg`) is shared
 * by any two sends that use the same name or land in the same millisecond: the second
 * write overwrites the first, and the first recipient is sent the second recipient's
 * file — another school's register, another teacher's voice note — with no error
 * anywhere. The same holds for inbound media written to disk before transcription.
 *
 * mkdtempSync makes a fresh directory per call, so the file inside it can keep the
 * name the recipient should see while the PATH is unique. Remove the whole directory
 * when done.
 */

const fs = require('fs');
const path = require('path');

/**
 * @param {string} baseDir   where the private directory is created (made if absent)
 * @param {string} fileName  the file's name inside it — keep the display name here
 * @param {string} [prefix]  mkdtemp prefix, for whoever reads a directory listing
 * @returns {{dir: string, filePath: string}}
 */
function privateTempPath(baseDir, fileName, prefix = 'send-') {
  if (!fs.existsSync(baseDir)) fs.mkdirSync(baseDir, { recursive: true });
  const dir = fs.mkdtempSync(path.join(baseDir, prefix));
  // basename keeps a user-typed name inside the directory; a name with nothing
  // left ('', '.', '..', 'a/..') would be the directory itself or its parent,
  // so it falls back to 'file' (as materialise() in the matrix relay does).
  const base = fileName == null ? '' : path.basename(String(fileName));
  return { dir, filePath: path.join(dir, base && base !== '.' && base !== '..' ? base : 'file') };
}

/** Remove what privateTempPath made. Never throws: a temp file is not worth an error. */
function removePrivateTemp(handle) {
  if (!handle || !handle.dir) return;
  try { fs.rmSync(handle.dir, { recursive: true, force: true }); } catch { /* best effort */ }
}

module.exports = { privateTempPath, removePrivateTemp };
