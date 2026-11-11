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
