/**
 * bot/workers/brief.worker.js — the one-shot cron entry for the Morning
 * Brief. Decides daily/weekly/off-day in the configured time zone, runs the
 * Python renderer, then hands the result to send-brief. The renderer is
 * never spawned here — a runner is injected — and so is the sender.
 */

const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '../..');

function load() {
  jest.resetModules();
  return require('../../bot/workers/brief.worker');
}

// 2026-09-07 is a Monday; 09-04 Friday; 09-05 Saturday; 09-06 Sunday.
const MON = new Date('2026-09-07T06:00:00Z');
const TUE = new Date('2026-09-08T06:00:00Z');
const THU = new Date('2026-09-10T06:00:00Z');
const FRI = new Date('2026-09-04T06:00:00Z');
const SAT = new Date('2026-09-05T06:00:00Z');
const SUN = new Date('2026-09-06T06:00:00Z');

describe('decideKind', () => {
  it('Mon–Thu are daily by default', () => {
    const { decideKind } = load();
    expect(decideKind(MON, {})).toBe('daily');
    expect(decideKind(TUE, {})).toBe('daily');
    expect(decideKind(THU, {})).toBe('daily');
  });

  it('Friday is weekly by default', () => {
    const { decideKind } = load();
    expect(decideKind(FRI, {})).toBe('weekly');
  });

  it('Saturday and Sunday are off-days (null)', () => {
    const { decideKind } = load();
    expect(decideKind(SAT, {})).toBeNull();
    expect(decideKind(SUN, {})).toBeNull();
  });

  it('honours custom BRIEF_DAILY_DOWS and BRIEF_WEEKLY_DOW', () => {
    const { decideKind } = load();
    const env = { BRIEF_DAILY_DOWS: '0, 1,2', BRIEF_WEEKLY_DOW: '6' };
    expect(decideKind(SUN, env)).toBe('daily');
    expect(decideKind(SAT, env)).toBe('weekly');
    expect(decideKind(FRI, env)).toBeNull();
    expect(decideKind(THU, env)).toBeNull();
  });

  it('weekly wins when the same day is listed in both', () => {
    const { decideKind } = load();
    expect(decideKind(MON, { BRIEF_DAILY_DOWS: '1,2,3,4', BRIEF_WEEKLY_DOW: '1' })).toBe('weekly');
  });

  it('an empty BRIEF_DAILY_DOWS means no daily briefs at all', () => {
    const { decideKind } = load();
    expect(decideKind(MON, { BRIEF_DAILY_DOWS: '' })).toBeNull();
    expect(decideKind(FRI, { BRIEF_DAILY_DOWS: '' })).toBe('weekly');
  });

  it('ignores junk in the day lists rather than throwing', () => {
    const { decideKind } = load();
    expect(decideKind(MON, { BRIEF_DAILY_DOWS: 'mon,1,x', BRIEF_WEEKLY_DOW: 'friday' })).toBe('daily');
  });

  it('evaluates the weekday in BRIEF_TZ, not the process zone (late Friday UTC is already Saturday east of it)', () => {
    const { decideKind } = load();
    const lateFridayUtc = new Date('2026-09-04T22:00:00Z');
    expect(decideKind(lateFridayUtc, {})).toBe('weekly');
    expect(decideKind(lateFridayUtc, { BRIEF_TZ: 'Asia/Karachi' })).toBeNull();

    const lateSundayUtc = new Date('2026-09-06T21:00:00Z');
    expect(decideKind(lateSundayUtc, {})).toBeNull();
    expect(decideKind(lateSundayUtc, { BRIEF_TZ: 'Pacific/Auckland' })).toBe('daily');
  });

  it('falls back to UTC when BRIEF_TZ is not a real zone', () => {
    const { decideKind } = load();
    expect(decideKind(MON, { BRIEF_TZ: 'Mars/Olympus' })).toBe('daily');
  });
});

describe('renderCommand', () => {
  it('runs the Python renderer from the repo root with python3 by default', () => {
    const { renderCommand } = load();
    expect(renderCommand('daily', {})).toEqual({
      cmd: 'python3',
      args: ['brief/cli.py', 'render', '--kind', 'daily'],
      cwd: REPO_ROOT,
    });
  });

  it('BRIEF_PYTHON overrides the interpreter', () => {
    const { renderCommand } = load();
    expect(renderCommand('weekly', { BRIEF_PYTHON: '/opt/venv/bin/python' }).cmd).toBe('/opt/venv/bin/python');
  });
});

describe('main', () => {
  it('on an off-day logs and exits 0 without rendering or sending', async () => {
    const { main } = load();
    const runner = jest.fn();
    const send = jest.fn();
    const log = jest.fn();
    const code = await main({ now: SAT, env: {}, runner, send, log });
    expect(code).toBe(0);
    expect(runner).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
    expect(log.mock.calls.flat().join('\n')).toMatch(/off-day, skipping/);
  });

  it('on a daily day renders then sends from the latest/daily directory', async () => {
    const { main } = load();
    const runner = jest.fn(async () => 0);
    const send = jest.fn(async () => ({ sent: ['a'], skipped: [], failed: [] }));
    const env = { BRIEF_RECIPIENTS: 'a', BRIEF_PYTHON: 'python3' };
    const code = await main({ now: MON, env, runner, send, log: () => {} });

    expect(code).toBe(0);
    expect(runner).toHaveBeenCalledWith(
      'python3',
      ['brief/cli.py', 'render', '--kind', 'daily'],
      expect.objectContaining({ cwd: REPO_ROOT }),
    );
    expect(send).toHaveBeenCalledWith(expect.objectContaining({
      manifestDir: path.join(REPO_ROOT, 'brief', 'out', 'latest', 'daily'),
      recipients: ['a'],
    }));
  });

  it('on Friday renders and sends the weekly brief', async () => {
    const { main } = load();
    const runner = jest.fn(async () => 0);
    const send = jest.fn(async () => ({ sent: ['a'], skipped: [], failed: [] }));
    await main({ now: FRI, env: { BRIEF_RECIPIENTS: 'a' }, runner, send, log: () => {} });
    expect(runner.mock.calls[0][1]).toEqual(['brief/cli.py', 'render', '--kind', 'weekly']);
    expect(send.mock.calls[0][0].manifestDir).toBe(path.join(REPO_ROOT, 'brief', 'out', 'latest', 'weekly'));
  });

  it('a failed render exits 1 and never sends', async () => {
    const { main } = load();
    const runner = jest.fn(async () => 2);
    const send = jest.fn();
    const code = await main({ now: MON, env: {}, runner, send, log: () => {} });
    expect(code).toBe(1);
    expect(send).not.toHaveBeenCalled();
  });

  it('propagates the sender exit code (all targets failed → 1)', async () => {
    const { main } = load();
    const runner = jest.fn(async () => 0);
    const send = jest.fn(async () => ({ sent: [], skipped: [], failed: [{ target: 'a', reason: 'x' }] }));
    const code = await main({ now: MON, env: { BRIEF_RECIPIENTS: 'a' }, runner, send, log: () => {} });
    expect(code).toBe(1);
  });
});
