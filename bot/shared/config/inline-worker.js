/**
 * Whether the background worker (workers/sqs-worker.js) runs inside the bot
 * process instead of as its own process.
 *
 * Lesson plans, coaching/quiz reports, video and exam results are delivered
 * FROM the worker. On the Meta Cloud API that is fine: a send is an HTTP call
 * any process can make. A linked WhatsApp session (CHANNEL_DRIVER=baileys) can
 * be open in exactly one process, and the bot holds it
 * (baileys-connection.js#acquireInstanceLock) -- so a separate worker's sends
 * were refused and the teacher never got the result. In that mode the bot runs
 * the worker itself, sharing its one connection, and a standalone worker stands
 * down. RUMI_INLINE_WORKER=off restores the separate-process behaviour.
 */

const { resolveChannelDriver } = require('./feature-availability');

/**
 * @param {NodeJS.ProcessEnv} env
 * @returns {boolean}
 */
function shouldRunWorkerInBot(env = process.env) {
  if (String(env.RUMI_INLINE_WORKER || '').toLowerCase() === 'off') return false;
  return resolveChannelDriver(env) === 'baileys';
}

module.exports = { shouldRunWorkerInBot };
