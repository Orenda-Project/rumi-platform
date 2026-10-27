/**
 * The local Redis step, shared by every script that needs Redis up:
 * start.js (the bot), onboard.js (the wizard's connection checks) and
 * doctor.js. One definition, so they can't drift apart.
 *
 * Whether a local Redis is needed at all is decided by scripts/local-redis.js
 * from REDIS_URL in .env: with a hosted Redis (Upstash, Railway, ...) it
 * starts nothing. When it does start one, Redis lives as long as the script
 * that started it -- for a daemon (start.js, onboard.js) until it is stopped;
 * for doctor.js, until the check finishes.
 *
 * The step moves on when any of these appears:
 *   - Redis is up
 *   - one is already running ("Address already in use" -- a pass, not a failure)
 *   - REDIS_URL is hosted, or unusable, so nothing was started
 *
 * Skipped on Windows, where conda-forge has no redis-server build and REDIS_URL
 * has to point at a hosted Redis anyway.
 */
module.exports = {
  when: "{{platform !== 'win32'}}",
  method: "shell.run",
  params: {
    message: "node scripts/local-redis.js",
    on: [{
      "event": "/(Ready to accept connections|Address already in use|no local Redis was started)/",
      "done": true
    }, {
      // Not installed (or removed by hand): stop with a clear error, rather
      // than letting the script wait for a Redis that will never come.
      "event": "/Could not start redis-server/",
      "break": true
    }]
  }
}
