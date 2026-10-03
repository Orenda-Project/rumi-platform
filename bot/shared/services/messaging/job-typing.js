/**
 * "Rumi is typing…" while the worker runs a job a teacher is waiting on.
 *
 * A lesson plan, a test paper or a lesson quiz is answered by the worker,
 * minutes after the bot's "I'm preparing it..." -- and until the file arrived
 * the room looked dead. sqs-worker.js wraps every job in withJobTyping(): for
 * the job types below whose recipient is a Matrix identity, the worker holds
 * the typing in that teacher's room for as long as the job runs. The hold goes
 * through the Matrix relay to the bot, which owns the connection and does the
 * refreshing; the first file or message the job delivers ends the typing
 * there (matrix-channel.service.js), and the job's end lets go either way.
 *
 * Matrix only: WhatsApp's typing call needs the inbound message id (the
 * worker has none) and a Baileys worker owns no socket; Slack has no typing
 * API. Jobs nobody is waiting on right now (nudges, reminders, expiries, the
 * coaching pipeline the teacher was told takes a while, video) are left alone.
 */

const { driverForIdentifier } = require('./channel-registry');
const { logToFile } = require('../../utils/logger');

// job type -> the payload field naming the teacher who asked.
const TYPING_JOB_RECIPIENT = {
  lesson_plan_generation: 'phoneNumber',
  pic_lp_kieai_generation: 'from',
  testpaper_generate: 'to',
  testpaper_revise: 'to',
  quiz_generate: 'phone',
  homework_bundle_generation: 'phone',
};

/** The Matrix identity to show typing to while this job runs, or null. */
function typingRecipientForJob(jobType, payload) {
  const field = TYPING_JOB_RECIPIENT[jobType];
  if (!field || !payload) return null;
  // Quiz jobs carry their fields inside the v2 envelope's payload.
  const fields = payload.payload && typeof payload.payload === 'object' ? payload.payload : payload;
  const to = fields[field];
  if (!to || driverForIdentifier(to) !== 'matrix') return null;
  return String(to);
}

/** Runs `fn` with the typing held for the job's teacher (when there is one). Fail-open. */
async function withJobTyping(jobType, payload, fn) {
  const to = typingRecipientForJob(jobType, payload);
  if (!to) return fn();
  let controller = null;
  try {
    // eslint-disable-next-line global-require -- lazy: the facade loads every configured driver
    controller = require('../whatsapp.service').startContinuousTypingIndicator(to);
  } catch (error) {
    logToFile('⚠️ Job typing: could not start the typing indicator (job continues)', { jobType, error: error.message });
  }
  try {
    return await fn();
  } finally {
    try {
      if (controller) controller.stop();
    } catch (error) {
      logToFile('⚠️ Job typing: could not stop the typing indicator', { jobType, error: error.message });
    }
  }
}

module.exports = { typingRecipientForJob, withJobTyping, TYPING_JOB_RECIPIENT };
