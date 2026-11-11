const path = require('path');
const { loadEsm } = require('./_load-esm');

const { waitForHealth, consoleUrl } = loadEsm(
  path.join(__dirname, '../../pinokio/onboarding/public/steps/launch-wait.js'),
);

describe('consoleUrl', () => {
  it('points at the activity page with the first-run flag', () => {
    expect(consoleUrl(51234)).toBe('http://127.0.0.1:51234/console/activity?first-run=1');
  });
});

describe('waitForHealth', () => {
  it('resolves up on the first fetch that resolves, sleeping 2000 between tries', async () => {
    const fetchFn = jest.fn()
      .mockRejectedValueOnce(new Error('refused'))
      .mockRejectedValueOnce(new Error('refused'))
      .mockResolvedValueOnce({ type: 'opaque' });
    const sleep = jest.fn().mockResolvedValue();
    const result = await waitForHealth({ port: 4000, fetchFn, sleep, now: () => 0 });
    expect(result).toBe('up');
    expect(fetchFn).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls).toEqual([[2000], [2000]]);
    expect(fetchFn).toHaveBeenCalledWith('http://127.0.0.1:4000/health', { mode: 'no-cors', cache: 'no-store' });
  });

  it('times out once the clock passes 120000 ms', async () => {
    let t = 0;
    const fetchFn = jest.fn().mockRejectedValue(new Error('refused'));
    const sleep = jest.fn(async (ms) => { t += ms; });
    const result = await waitForHealth({ port: 4000, fetchFn, sleep, now: () => t });
    expect(result).toBe('timeout');
    expect(t).toBeGreaterThanOrEqual(120000);
  });
});

describe('waitForHealth robustness', () => {
  function fakeClock() {
    const clock = { t: 0 };
    clock.now = () => clock.t;
    clock.sleep = jest.fn(async (ms) => { clock.t += ms; });
    // A timer that "fires" at once, having advanced the clock by its delay.
    clock.timer = jest.fn((ms) => ({ promise: Promise.resolve().then(() => { clock.t += ms; return 'timed-out'; }), cancel() {} }));
    return clock;
  }

  it('still times out by the deadline when fetch never settles', async () => {
    const c = fakeClock();
    const fetchFn = jest.fn(() => new Promise(() => {}));
    const result = await waitForHealth({ port: 1, fetchFn, sleep: c.sleep, now: c.now, timer: c.timer });
    expect(result).toBe('timeout');
    expect(c.t).toBeGreaterThanOrEqual(120000);
    expect(c.timer.mock.calls[0][0]).toBe(5000);
  });

  it('returns stopped without further fetches once shouldStop is true', async () => {
    const c = fakeClock();
    let calls = 0;
    const fetchFn = jest.fn().mockRejectedValue(new Error('refused'));
    const shouldStop = () => calls++ >= 2;
    const result = await waitForHealth({ port: 1, fetchFn, sleep: c.sleep, now: c.now, timer: c.timer, shouldStop });
    expect(result).toBe('stopped');
    expect(fetchFn.mock.calls.length).toBeLessThanOrEqual(2);
    const before = fetchFn.mock.calls.length;
    expect(await waitForHealth({ port: 1, fetchFn, sleep: c.sleep, now: c.now, shouldStop: () => true })).toBe('stopped');
    expect(fetchFn.mock.calls.length).toBe(before);
  });
});
