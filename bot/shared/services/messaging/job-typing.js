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
 * Other sends to the room meanwhile (the bot's ack, a reminder) leave it on.
 *
 * Matrix only: WhatsApp's typing call needs the inbound message id (the
 * worker has none) and a Baileys worker owns no socket; Slack has no typing
 * API. Jobs nobody is waiting on right now (nudges, reminders, expiries, the
 * coaching pipeline the teacher was told takes a while, video) are left alone.
 */

const { driverForIdentifier } = require('./channel-registry');
const { forJob } = require('./matrix-outbound-relay');
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

let jobSeq = 0;

/**
 * Runs `fn` with the typing held for the job's teacher (when there is one). Fail-open.
 * The hold and every send the job makes go over the relay tagged with the same
 * job, so the bot ends this typing on the job's own delivery, not on its own
 * "I'm making it…" or on a reminder sent meanwhile.
 */
async function withJobTyping(jobType, payload, fn) {
  const to = typingRecipientForJob(jobType, payload);
  if (!to) return fn();
  jobSeq += 1;
  return forJob(`${jobType}:${process.pid}:${jobSeq}:${Date.now()}`, () => holdTypingWhile(to, jobType, fn));
}

async function holdTypingWhile(to, jobType, fn) {
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
