/**
 * fluent-ffmpeg mock for the OSS test suite.
 *
 * fluent-ffmpeg (with its @ffmpeg-installer / @ffprobe-installer companions) is
 * a runtime dependency in bot/node_modules but not the root, and CI runs the
 * ROOT suite before `cd bot && npm ci` — so any test that reaches
 * bot/shared/services/audio.service.js needs this or the suite fails in CI for
 * reasons unrelated to the test.
 *
 * audio.service.js configures the binary paths at import time
 * (`setFfmpegPath` / `setFfprobePath` on the module itself) and then builds
 * per-file command chains, so the export has to be callable *and* carry those
 * setters. Every chain method returns `this` so a chain of any length works;
 * `.run()` and `.save()` invoke the registered `end` handler on the next tick,
 * which is enough for code that awaits a completion callback.
 */

function createCommand() {
  const handlers = {};
  const command = {
    on: jest.fn((event, callback) => { handlers[event] = callback; return command; }),
    run: jest.fn(() => { setImmediate(() => handlers.end && handlers.end()); return command; }),
    save: jest.fn(() => { setImmediate(() => handlers.end && handlers.end()); return command; }),
  };

  // Chainable no-ops: anything audio.service.js calls to describe a conversion.
  for (const method of [
    'input', 'output', 'inputFormat', 'outputFormat', 'audioCodec', 'audioBitrate',
    'audioChannels', 'audioFrequency', 'videoCodec', 'format', 'duration', 'seek',
    'seekInput', 'size', 'fps', 'noVideo', 'noAudio', 'outputOptions', 'inputOptions',
    'complexFilter', 'audioFilters', 'videoFilters', 'toFormat', 'pipe', 'kill',
  ]) {
    command[method] = jest.fn(() => command);
  }
  return command;
}

const ffmpeg = jest.fn(() => createCommand());

// Module-level configuration audio.service.js performs on import.
ffmpeg.setFfmpegPath = jest.fn();
ffmpeg.setFfprobePath = jest.fn();
ffmpeg.setFlvtoolPath = jest.fn();

// Probing, used to read a recording's duration.
ffmpeg.ffprobe = jest.fn((_file, callback) => {
  if (typeof callback === 'function') {
    callback(null, { streams: [{ codec_type: 'audio', duration: '1.0' }], format: { duration: '1.0' } });
  }
});

ffmpeg.getAvailableFormats = jest.fn((callback) => callback && callback(null, {}));
ffmpeg.getAvailableCodecs = jest.fn((callback) => callback && callback(null, {}));

module.exports = ffmpeg;
