'use strict';
/**
 * What kind of audio a sender was handed, read from the bytes, never from the caller.
 *
 * Every voice note used to be MP3. The voice gateway (services/tts) can now return Ogg Opus when Soniox
 * speaks, and Ogg Opus is the one format WhatsApp shows as a voice message (waveform, speed button). So a
 * driver asks this once and labels the upload to match: an MP3 is sent exactly as before.
 */

const OGG = Object.freeze({ isOgg: true, ext: 'ogg', mime: 'audio/ogg; codecs=opus' });
const MP3 = Object.freeze({ isOgg: false, ext: 'mp3', mime: 'audio/mpeg' });

function audioKind(buffer) {
  const isOgg = Buffer.isBuffer(buffer) && buffer.length >= 4 && buffer.subarray(0, 4).toString('latin1') === 'OggS';
  return isOgg ? OGG : MP3;
}

module.exports = { audioKind };
