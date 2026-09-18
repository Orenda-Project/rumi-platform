'use strict';
/**
 * Exam-deadline reminder worker — Cost Compass opt-in nudges.
 *
 * Shape copied from bot/workers/brief.worker.js on purpose: one-shot, run by a
 * scheduler, and it decides *at run time* what is due rather than trusting that
 * it fired on the day it was scheduled for. A cron that fires late, twice, or
 * in the wrong timezone therefore cannot send "your deadline is in 14 days" for
 * a date that has already passed — `deadlinesDueForReminder()` recomputes the
 * day count from `now` every run.
 *
 * Leads: 14 days and 3 days before a deadline (ExamCostService.REMINDER_LEAD_DAYS).
 *
 * Delivery window: the brief's timing rule ("weekends and evenings only —
 * mid-workday nudges fail for low-resource caregivers") is enforced by
 * withinSendWindow(); pass `force: true` to override it for a manual run.
 *
 * ⚠️ WhatsApp 24-hour window (pre-merge-checklist Class G): a parent who has
 * not messaged Rumi in the last 24h CANNOT receive free-form text — Meta
 * rejects it with 131047. This worker sends free text and checks the boolean
 * return, logging a real failure rather than reporting a phantom success. A
 * Meta-approved UTILITY template is the correct long-term fix and is listed as
 * a TODO in docs/features/exam-cost.md; on the Baileys sandbox driver the
 * window does not apply and free text is delivered normally.
 *
 * Requires are lazy inside the functions (never at module top level) so this
 * entry boots under tests/setup/worker-boot.test.js without the bot's optional
 * native deps — the same stance brief.worker.js takes.
 */

const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

try {
  require('dotenv').config({ path: path.join(REPO_ROOT, '.env'), quiet: true });
} catch {
  // Not installed — run on whatever the environment already carries.
}

/** Hour (0-23) of `date` in `timeZone`; falls back to UTC for an unknown zone. */
function hourIn(date, timeZone) {
  let formatter;
  try {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timeZone || 'UTC', hour: 'numeric', hour12: false,
    });
  } catch {
    formatter = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', hour: 'numeric', hour12: false });
  }
  return parseInt(formatter.format(date), 10) % 24;
}

/** Day of week (0 = Sunday) of `date` in `timeZone`. */
function weekdayIn(date, timeZone) {
  const WEEKDAYS = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  let formatter;
  try {
    formatter = new Intl.DateTimeFormat('en-US', { timeZone: timeZone || 'UTC', weekday: 'short' });
  } catch {
    formatter = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short' });
  }
  return WEEKDAYS[formatter.format(date)];
}

/**
 * Weekend (any hour) or a weekday evening (17:00–21:59) in BRIEF_TZ.
 * Mid-workday weekday runs are skipped, not dropped — the next run picks the
 * same due deadlines up because the window is recomputed from `now`.
 */
function withinSendWindow(now = new Date(), env = process.env) {
  const dow = weekdayIn(now, env.BRIEF_TZ);
  if (dow === 0 || dow === 6) return true;
  const hour = hourIn(now, env.BRIEF_TZ);
  return hour >= 17 && hour <= 21;
}

/**
 * Send every reminder due right now.
 *
 * @param {object} opts
 * @param {Date}    [opts.now]
 * @param {object}  [opts.env]
 * @param {boolean} [opts.force]     ignore withinSendWindow
 * @param {string}  [opts.boardId]   only this board
 * @param {Function}[opts.optIns]    () => [{phone, board_id}] — injectable
 * @param {Function}[opts.send]      (phone, text) => Promise<boolean> — injectable
 * @returns {Promise<{sent:number, failed:number, skipped:string|null, due:number}>}
 */
async function run({
  now = new Date(),
  env = process.env,
  force = false,
  boardId = null,
  optIns,
  send,
  log = console.log,
} = {}) {
  const ExamCostService = require('../shared/services/exam-cost.service');

  if (!force && !withinSendWindow(now, env)) {
    log('exam-deadline-reminder: outside the send window (weekday daytime) — nothing sent');
    return { sent: 0, failed: 0, skipped: 'send_window', due: 0 };
  }

  const readOptIns = optIns || (async () => {
    const DeadlineReminderService = require('../shared/services/deadline-reminder.service');
    return DeadlineReminderService.listAllOptIns();
  });

  const deliver = send || (async (phone, text) => {
    const messaging = require('../shared/services/messaging');
    return messaging.sendMessage(phone, text);
  });

  const rows = await readOptIns();
  const scoped = boardId ? rows.filter((r) => r.board_id === boardId) : rows;

  // One deadline lookup per distinct board, not per opt-in row.
  const dueByBoard = new Map();
  for (const board of new Set(scoped.map((r) => r.board_id))) {
    dueByBoard.set(board, ExamCostService.deadlinesDueForReminder(board, now));
  }

  let sent = 0;
  let failed = 0;
  let due = 0;

  for (const row of scoped) {
    for (const deadline of dueByBoard.get(row.board_id) || []) {
      due += 1;
      const text = ExamCostService.formatReminderMessage(deadline);
      let ok = false;
      try {
        ok = await deliver(row.phone, text);
      } catch (error) {
        log(`exam-deadline-reminder: send threw for ${row.board_id}: ${error.message}`);
      }
      // A `false` return means Meta/Baileys rejected it — count it as failed
      // rather than reporting a send that did not happen.
      if (ok === false) failed += 1;
      else sent += 1;
    }
  }

  log(`exam-deadline-reminder: ${due} due, ${sent} sent, ${failed} failed`);
  return { sent, failed, skipped: null, due };
}

/** Queue-job entry — `case 'exam_deadline_reminder'` in workers/sqs-worker.js. */
async function process_(payload = {}) {
  return run({
    boardId: payload.boardId || null,
    force: !!payload.force,
    now: payload.now ? new Date(payload.now) : new Date(),
  });
}

// Gated — requiring this file as a library (tests, the queue worker) sends nothing.
if (require.main === module) {
  run()
    .then((r) => process.exit(r.failed > 0 ? 1 : 0))
    .catch((error) => {
      console.error('exam-deadline-reminder worker error:', error);
      process.exit(1);
    });
}

module.exports = { REPO_ROOT, hourIn, weekdayIn, withinSendWindow, run, process: process_ };
