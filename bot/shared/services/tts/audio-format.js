'use strict';
/**
 * Audio format helpers for the voice gateway.
 *
 * Soniox speaks Ogg Opus, which WhatsApp shows as a voice message. Everything
 * that is stored or edited (R2 for the portals and the partner API, video
 * narration) stays MP3, so a Soniox clip is converted once on those paths.
 *
 * ffmpeg works in a fresh folder under the system temp dir, removed when it is
 * done, and never in the bot's TEMP_DIR: that folder does not exist on the
 * workers, which is exactly why some voice notes fail today. MP3 goes through a
 * real file rather than a pipe so ffmpeg can go back and write the VBR header
 * that tells players (and ffprobe) the true length.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

// Found the same way audio.service.js finds them: the npm static build, or the
// system binary when that optional package is missing.
let ffmpegPath;
let ffprobePath;
try {
  ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
} catch (e) {
  ffmpegPath = 'ffmpeg';
}
try {
  ffprobePath = require('@ffprobe-installer/ffprobe').path;
} catch (e) {
  ffprobePath = 'ffprobe';
}

// Generous for a voice note (a few minutes of audio converts in a second or two),
// but a stuck ffmpeg must not hold a worker forever.
const TOOL_TIMEOUT_MS = 60000;

/**
 * What the bytes are, from their first bytes: 'ogg', 'mp3' or null.
 * Used for telemetry and for choosing how to send; never trusts a file name.
 */
function detectFormat(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 4) return null;
  if (buf.toString('latin1', 0, 4) === 'OggS') return 'ogg';
  if (buf.toString('latin1', 0, 3) === 'ID3') return 'mp3';
  // A bare MPEG audio frame: 11 sync bits, then a layer that is not 0 (layer 0
  // is how AAC's ADTS header looks, and that is not MP3).
  if (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0 && ((buf[1] >> 1) & 0x03) !== 0) return 'mp3';
  return null;
}

function run(bin, args) {
  return new Promise((resolve, reject) => {
    execFile(bin, args, { timeout: TOOL_TIMEOUT_MS, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        const detail = String(stderr || '').trim().split('\n').slice(-2).join(' ');
        reject(new Error(`${path.basename(bin)} failed: ${detail || error.message}`));
      } else {
        resolve(String(stdout));
      }
    });
  });
}

async function inScratchDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tts-'));
  try {
    return await fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function requireBuffer(buf, name) {
  if (!Buffer.isBuffer(buf) || buf.length === 0) throw new Error(`${name} needs a non-empty audio buffer`);
}

/**
 * An Ogg Opus clip as MP3: mono, 44.1 kHz, LAME VBR quality 2 — the shape the
 * stored voice notes have today.
 */
async function toMp3(oggBuf) {
  requireBuffer(oggBuf, 'toMp3');
  return inScratchDir(async (dir) => {
    const input = path.join(dir, 'in.ogg');
    const output = path.join(dir, 'out.mp3');
    fs.writeFileSync(input, oggBuf);
    await run(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-y', '-i', input, '-ac', '1', '-ar', '44100', '-c:a', 'libmp3lame', '-q:a', '2', output]);
    return fs.readFileSync(output);
  });
}

/** How long an MP3 plays, in seconds, as ffprobe reads it. */
async function mp3DurationSec(buf) {
  requireBuffer(buf, 'mp3DurationSec');
  return inScratchDir(async (dir) => {
    const file = path.join(dir, 'in.mp3');
    fs.writeFileSync(file, buf);
    const out = await run(ffprobePath, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', file]);
    const sec = parseFloat(out.trim());
    if (!Number.isFinite(sec)) throw new Error(`ffprobe gave no duration (${out.trim() || 'empty'})`);
    return sec;
  });
}

module.exports = { detectFormat, toMp3, mp3DurationSec };
