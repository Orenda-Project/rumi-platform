/**
 * @ffmpeg-installer/ffmpeg and @ffprobe-installer/ffprobe mock.
 *
 * Both ship a platform binary and live in bot/node_modules only. Callers use
 * just the `.path`, which they hand to fluent-ffmpeg's setters — mocked
 * alongside — so a plausible path string is the whole contract.
 */
module.exports = { path: '/usr/bin/ffmpeg', version: '0.0.0-test' };
