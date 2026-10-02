/**
 * Cost Compass reminder worker — the send decision.
 *
 * Both the opt-in read and the send are injected, so this suite needs neither
 * Supabase nor a channel driver (the same testability stance brief.worker.js
 * takes for its renderer and sender).
 */

const path = require('path');
const ExamCostService = require('../../bot/shared/services/exam-cost.service');
const worker = require('../../bot/workers/exam-deadline-reminder.worker');

// Fixed deadline dates make the 14/3-day lead assertions meaningful.
ExamCostService.useDataDir(path.join(__dirname, 'fixtures'));
afterAll(() => ExamCostService.resetDataDir());

const OPTINS = [
  { phone: '923001234567', board_id: 'cambridge' },
  { phone: '923009876543', board_id: 'cambridge' },
  { phone: '923005555555', board_id: 'bise-lahore' },
];

// Friday 20:00 — a weekday EVENING, i.e. inside the send window, and exactly
// 14 days before the fixture's 2027-02-12 Cambridge deadline, so the window
// logic never masks a send test.
const FRIDAY_EVENING_14_DAYS_OUT = new Date('2027-01-29T20:00:00Z');

function harness(overrides = {}) {
  const sends = [];
  return {
    sends,
    opts: {
      now: FRIDAY_EVENING_14_DAYS_OUT,
      env: { BRIEF_TZ: 'UTC' },
      optIns: async () => OPTINS,
      send: async (phone, text) => { sends.push({ phone, text }); return true; },
      log: () => {},
      ...overrides,
    },
  };
}

describe('withinSendWindow — evening/weekend delivery rule', () => {
  const env = { BRIEF_TZ: 'UTC' };

  it('allows any hour at the weekend', () => {
    expect(worker.withinSendWindow(new Date('2027-01-30T09:00:00Z'), env)).toBe(true); // Sat
    expect(worker.withinSendWindow(new Date('2027-01-31T13:00:00Z'), env)).toBe(true); // Sun
  });

  it('blocks a weekday mid-morning and mid-afternoon', () => {
    expect(worker.withinSendWindow(new Date('2027-02-01T10:00:00Z'), env)).toBe(false);
    expect(worker.withinSendWindow(new Date('2027-02-01T15:30:00Z'), env)).toBe(false);
  });

  it('allows a weekday evening, 17:00 to 21:59', () => {
    expect(worker.withinSendWindow(new Date('2027-02-01T17:00:00Z'), env)).toBe(true);
    expect(worker.withinSendWindow(new Date('2027-02-01T21:59:00Z'), env)).toBe(true);
    expect(worker.withinSendWindow(new Date('2027-02-01T22:00:00Z'), env)).toBe(false);
  });

  it('reads the clock in BRIEF_TZ, not the process zone', () => {
    const at = new Date('2027-02-01T13:00:00Z'); // 18:00 in Karachi
    expect(worker.withinSendWindow(at, { BRIEF_TZ: 'UTC' })).toBe(false);
    expect(worker.withinSendWindow(at, { BRIEF_TZ: 'Asia/Karachi' })).toBe(true);
  });

  it('falls back to UTC for a junk timezone rather than throwing', () => {
    expect(() => worker.withinSendWindow(new Date('2027-01-30T09:00:00Z'), { BRIEF_TZ: 'Mars/Olympus' }))
      .not.toThrow();
  });
});

describe('run — who gets a reminder', () => {
  it('sends to every phone opted in to a board with a deadline 14 days out', async () => {
    const h = harness();
    const result = await worker.run(h.opts);

    expect(result.due).toBe(2);
    expect(result.sent).toBe(2);
    expect(result.failed).toBe(0);
    expect(h.sends.map((s) => s.phone).sort())
      .toEqual(['923001234567', '923009876543']);
    expect(h.sends[0].text).toContain('2027-02-12');
  });

  it('sends nothing when no deadline sits on a lead day', async () => {
    const h = harness({ now: new Date('2027-02-06T09:00:00Z') }); // Sat, 6 days out
    const result = await worker.run(h.opts);
    expect(result).toMatchObject({ due: 0, sent: 0, failed: 0 });
    expect(h.sends).toHaveLength(0);
  });

  it('never messages a phone opted in to a different board', async () => {
    const h = harness();
    await worker.run(h.opts);
    expect(h.sends.some((s) => s.phone === '923005555555')).toBe(false);
  });

  it('scopes a run to one board when asked', async () => {
    const h = harness({ boardId: 'bise-lahore' });
    const result = await worker.run(h.opts);
    expect(result.sent).toBe(0);
    expect(h.sends).toHaveLength(0);
  });

  it('skips the whole run outside the send window, and reports why', async () => {
    const h = harness({ now: new Date('2027-01-29T10:00:00Z') }); // Fri mid-morning, 14 days out
    const result = await worker.run(h.opts);
    expect(result.skipped).toBe('send_window');
    expect(h.sends).toHaveLength(0);
  });

  it('force overrides the send window', async () => {
    const h = harness({ now: new Date('2027-01-29T10:00:00Z'), force: true });
    const result = await worker.run(h.opts);
    expect(result.skipped).toBeNull();
    expect(result.sent).toBe(2);
  });

  it('counts a rejected send as failed rather than sent', async () => {
    const h = harness({ send: async () => false });
    const result = await worker.run(h.opts);
    expect(result.sent).toBe(0);
    expect(result.failed).toBe(2);
  });

  it('keeps going when one send throws', async () => {
    let call = 0;
    const h = harness({
      send: async () => { call += 1; if (call === 1) throw new Error('131047'); return true; },
    });
    const result = await worker.run(h.opts);
    expect(call).toBe(2);
    expect(result.sent).toBe(1);
  });

  it('handles an empty opt-in list', async () => {
    const h = harness({ optIns: async () => [] });
    await expect(worker.run(h.opts)).resolves.toMatchObject({ due: 0, sent: 0 });
  });

  it('looks up deadlines once per board, not once per opt-in row', async () => {
    const ExamCostService = require('../../bot/shared/services/exam-cost.service');
    const spy = jest.spyOn(ExamCostService, 'deadlinesDueForReminder');
    const h = harness();
    await worker.run(h.opts);
    // 3 opt-in rows, 2 distinct boards.
    expect(spy).toHaveBeenCalledTimes(2);
    spy.mockRestore();
  });
});

describe('process — the queue-job entry', () => {
  it('is wired as a job type the sqs worker dispatches', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(
      path.resolve(__dirname, '../../bot/workers/sqs-worker.js'), 'utf8',
    );
    expect(src).toContain("case 'exam_deadline_reminder'");
    expect(src).toContain("require('./exam-deadline-reminder.worker')");
  });

  it('exposes process() for that case to call', () => {
    expect(typeof worker.process).toBe('function');
  });
});
