/**
 * Which bytes did a channel's sendDocument actually upload from a path?
 *
 * A caller that writes a file and hands its PATH to sendDocument cannot see what the
 * driver read: the Meta driver streams the file lazily, after the HTTP connection is
 * up, so a hash taken by the caller right after its write always matches its buffer
 * and could never show a swap. The drivers record a short sha of the bytes they read
 * (Meta: as the upload stream is consumed; the others: the buffer they read at the
 * call), keyed by the path, and the caller takes it after the send returns. Paths
 * from privateTempPath are unique per call, so the key is unambiguous.
 *
 * Only for sends made in this process: a send relayed to another process (the Matrix
 * outbound relay) records nothing here, and the caller sees null.
 */

const crypto = require('crypto');
const { Readable } = require('stream');

const MAX_ENTRIES = 200; // paths nobody takes (most sends) must not pile up
const digests = new Map();

/** First 12 hex chars of a sha256 — enough to tell two files apart in a log line. */
function shortSha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex').slice(0, 12);
}

function remember(filePath, sha) {
  digests.delete(filePath);
  digests.set(filePath, sha);
  if (digests.size > MAX_ENTRIES) digests.delete(digests.keys().next().value);
}

/** A driver that read the whole file into `buffer` records what it sent. */
function noteUploadedBytes(filePath, buffer) {
  remember(filePath, shortSha256(buffer));
}

/**
 * Wrap the read stream an upload body consumes: bytes pass through unchanged, and
 * their sha is recorded for `filePath` once the stream has been read to the end.
 * Pull-driven: the file is read only when the upload reads the wrapper (a pipe would
 * start reading at once), so the hash is of what goes out when it goes out. A read
 * error is passed on, so the upload fails as it did on the bare stream.
 */
function digestingStream(source, filePath) {
  const hash = crypto.createHash('sha256');
  let flowing = false;
  const tap = new Readable({
    read() {
      if (flowing) { source.resume(); return; }
      // Listening for 'data' is what starts the file read; do it on the first pull.
      flowing = true;
      source.on('data', (chunk) => {
        hash.update(chunk);
        if (!tap.push(chunk)) source.pause();
      });
    },
  });
  source.on('end', () => {
    remember(filePath, hash.digest('hex').slice(0, 12));
    tap.push(null);
  });
  source.on('error', (error) => tap.destroy(error));
  return tap;
}

/** The short sha a driver recorded for `filePath`, once; null when none did. */
function takeUploadedSha256(filePath) {
  const sha = digests.has(filePath) ? digests.get(filePath) : null;
  digests.delete(filePath);
  return sha;
}

module.exports = { shortSha256, noteUploadedBytes, digestingStream, takeUploadedSha256 };
