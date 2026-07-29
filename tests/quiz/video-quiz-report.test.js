'use strict';
/**
 * bd-2334 — the class report fired seconds after the first child joined, saying
 * "0 of 1 students finished".
 *
 * Three compounding causes, each with a test here:
 *
 *  1. SCHEDULING LOST THE TARGET TIME. scheduleForShareCode passed `targetAt`
 *     in the OPTIONS argument, but queueJob builds its message body from
 *     {groupId, jobType, payload, ...} and drops opts entirely. The worker
 *     reads body.payload.targetAt to decide "not morning yet, re-queue" — so
 *     the cascade could never fire and the first delivery generated the report.
 *
 *  2. THE DELAY WAS SILENTLY DROPPED. jobType 'video_quiz_report' does not
 *     start with 'quiz_', so it routed to SQS_QUEUE_URL — a FIFO queue, and
 *     queueJob deliberately drops delaySeconds on FIFO ("FIFO rejects it
 *     per-message"). So the job was delivered immediately, not in 15 minutes.
 *
 *  3. NOTHING STOPPED A SECOND SEND. generate()'s docstring claimed "Safe to
 *     call twice — guarded on report_sent_at", but no such column existed and
 *     no guard was implemented.
 *
 * The through-line: a teacher must get ONE report, and it must contain results.
 */

jest.mock('../../bot/shared/config/supabase', () => ({ from: jest.fn() }));
jest.mock('../../bot/shared/services/whatsapp.service', () => ({
  sendMessage: jest.fn().mockResolvedValue(true),
  sendDocument: jest.fn().mockResolvedValue(true),
}));
jest.mock('../../bot/shared/services/queue/sqs-queue.service', () => ({
  queueJob: jest.fn().mockResolvedValue({ MessageId: 'm1' }),
}));
jest.mock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
jest.mock('../../bot/shared/utils/structured-logger', () => ({ logEvent: jest.fn() }));

const supabase = require('../../bot/shared/config/supabase');
const WhatsAppService = require('../../bot/shared/services/whatsapp.service');
const SQSQueueService = require('../../bot/shared/services/queue/sqs-queue.service');
const report = require('../../bot/shared/services/quiz/video-quiz-report.service');

const SHARE_CODE_ID = 'sc-1';

/**
 * Minimal Supabase stub. `rows` maps table -> the array a select resolves to;
 * `updates` records what the guard writes back.
 */
function stubSupabase({ shareCode, teacher, sessions, answers = [] }) {
  const updates = [];
  supabase.from.mockImplementation((table) => {
    const chain = {
      select: () => chain,
      eq: () => chain,
      in: () => chain,
      is: () => chain,
      maybeSingle: async () => {
        if (table === 'quiz_share_codes') return { data: shareCode };
        if (table === 'users') return { data: teacher };
        return { data: null };
      },
      update: (patch) => {
        updates.push({ table, patch });
        return chain;
      },
      then: undefined,
    };
    // A bare select().eq() resolves to a list for the tables we read as lists.
    chain.eq = () => {
      const listy = {
        ...chain,
        then: (resolve) => resolve({
          data: table === 'quiz_sessions' ? sessions
            : table === 'quiz_answers' ? answers : [],
        }),
      };
      listy.eq = () => listy;
      listy.in = () => listy;
      listy.select = () => listy;
      listy.maybeSingle = chain.maybeSingle;
      listy.update = chain.update;
      return listy;
    };
    return chain;
  });
  return updates;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('bd-2334 — scheduling must survive the queue', () => {
  test('targetAt travels in the PAYLOAD, where the worker actually reads it', async () => {
    await report.scheduleForShareCode(SHARE_CODE_ID);

    expect(SQSQueueService.queueJob).toHaveBeenCalled();
    const [, , payload] = SQSQueueService.queueJob.mock.calls[0];
    // The worker does `body.payload.targetAt` — an options-only targetAt is
    // dropped by queueJob and the morning cascade never fires.
    expect(payload).toHaveProperty('targetAt');
    expect(new Date(payload.targetAt).getTime()).toBeGreaterThan(Date.now());
  });

  test('the job is queued on a lane that honours a delay, not the FIFO queue', async () => {
    await report.scheduleForShareCode(SHARE_CODE_ID);
    const [, jobType, , opts] = SQSQueueService.queueJob.mock.calls[0];

    // queueJob routes by prefix: only `quiz_*` reaches the standard (delay-
    // capable) queue. Anything else lands on the FIFO queue, which silently
    // discards delaySeconds — the job then runs immediately.
    expect(jobType.startsWith('quiz_')).toBe(true);
    expect(opts.delaySeconds).toBeGreaterThan(0);
  });
});

describe('bd-2334 — a report with nothing in it must not be sent', () => {
  const shareCode = {
    id: SHARE_CODE_ID, code: 'K7RM2', quiz_id: 'q1', teacher_user_id: 'u1',
    teacher_name: 'Miss Ayesha', topic: 'Who Is Outside', language: 'en',
    report_sent_at: null,
  };
  const teacher = { phone_number: '923001234567', preferred_language: 'en' };

  test('an early trigger with every child still mid-quiz sends nothing', async () => {
    stubSupabase({
      shareCode, teacher,
      sessions: [{ id: 's1', student_name: 'Mahrah Ashraf', status: 'in_progress' }],
    });

    const sent = await report.generate(SHARE_CODE_ID, { reason: 'all_finished' });

    expect(sent).toBe(false);
    // This is the exact message the operator received and should not have.
    expect(WhatsAppService.sendMessage).not.toHaveBeenCalled();
  });

  test('the scheduled morning run still reports on a class that never finished', async () => {
    stubSupabase({
      shareCode, teacher,
      sessions: [{ id: 's1', student_name: 'Mahrah Ashraf', status: 'in_progress' }],
    });

    const sent = await report.generate(SHARE_CODE_ID, { reason: 'scheduled' });

    // Morning is the teacher's promised moment — she hears something even if
    // the class did not finish. Silence there would be its own bug.
    expect(sent).toBe(true);
    expect(WhatsAppService.sendMessage).toHaveBeenCalled();
  });
});

describe('bd-2334 — one report, once', () => {
  test('a share code already reported on does not send again', async () => {
    stubSupabase({
      shareCode: {
        id: SHARE_CODE_ID, code: 'K7RM2', quiz_id: 'q1', teacher_user_id: 'u1',
        teacher_name: 'Miss Ayesha', topic: 'Who Is Outside', language: 'en',
        report_sent_at: '2026-07-28T02:00:00.000Z',   // already went out
      },
      teacher: { phone_number: '923001234567' },
      sessions: [{ id: 's1', student_name: 'Mahrah', status: 'completed',
                   total_questions_answered: 8, correct_answers: 6,
                   mastery_percentage: 75 }],
    });

    const sent = await report.generate(SHARE_CODE_ID, { reason: 'scheduled' });

    expect(sent).toBe(false);
    expect(WhatsAppService.sendMessage).not.toHaveBeenCalled();
  });

  test('sending stamps report_sent_at so the next call is a no-op', async () => {
    const updates = stubSupabase({
      shareCode: {
        id: SHARE_CODE_ID, code: 'K7RM2', quiz_id: 'q1', teacher_user_id: 'u1',
        teacher_name: 'Miss Ayesha', topic: 'Who Is Outside', language: 'en',
        report_sent_at: null,
      },
      teacher: { phone_number: '923001234567' },
      sessions: [{ id: 's1', student_name: 'Mahrah', status: 'completed',
                   total_questions_answered: 8, correct_answers: 6,
                   mastery_percentage: 75 }],
    });

    await report.generate(SHARE_CODE_ID, { reason: 'all_finished' });

    const stamp = updates.find((u) => u.table === 'quiz_share_codes'
      && Object.keys(u.patch).includes('report_sent_at'));
    expect(stamp).toBeDefined();
  });
});
