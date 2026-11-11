/**
 * Restart from the console: only under Pinokio, never standalone, never twice
 * in a row, and no request input reaches the command.
 */

const { restartConfig, createRestarter } = require('../../bot/console/restart');

const ENV = { RUMI_PTERM: '/x/pterm', RUMI_RESTART_SCRIPT: '/x/restart.js' };

describe('restartConfig', () => {
  it('is null when the variables are missing', () => {
    expect(restartConfig({}, { standalone: false })).toBeNull();
    expect(restartConfig({ RUMI_PTERM: '/x/pterm' }, { standalone: false })).toBeNull();
    expect(restartConfig({ RUMI_RESTART_SCRIPT: '/x/restart.js' }, { standalone: false })).toBeNull();
  });
  it('is null when standalone, even with both variables', () => {
    expect(restartConfig(ENV, { standalone: true })).toBeNull();
  });
  it('returns the pterm and script when both are set and not standalone', () => {
    expect(restartConfig(ENV, { standalone: false })).toEqual({ pterm: '/x/pterm', script: '/x/restart.js' });
  });
  it('is null for relative paths', () => {
    expect(restartConfig({ RUMI_PTERM: 'pterm', RUMI_RESTART_SCRIPT: '/x/restart.js' }, { standalone: false })).toBeNull();
    expect(restartConfig({ RUMI_PTERM: '/x/pterm', RUMI_RESTART_SCRIPT: 'restart.js' }, { standalone: false })).toBeNull();
  });
});

describe('createRestarter', () => {
  it('spawns pterm detached once, then refuses a second call', () => {
    const child = { unref: jest.fn() };
    const spawn = jest.fn(() => child);
    const r = createRestarter({ config: { pterm: '/x/pterm', script: '/x/restart.js' }, spawn });
    expect(r.restart()).toEqual({ ok: true });
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(spawn).toHaveBeenCalledWith('/x/pterm', ['start', '/x/restart.js'], { detached: true, stdio: 'ignore' });
    expect(child.unref).toHaveBeenCalled();
    expect(r.restart()).toEqual({ ok: false, reason: 'already-restarting' });
    expect(spawn).toHaveBeenCalledTimes(1);
  });
  it('allows another restart after 120 s', () => {
    const spawn = jest.fn(() => ({ unref() {} }));
    let t = 1000;
    const r = createRestarter({ config: { pterm: '/x/pterm', script: '/x/restart.js' }, spawn, now: () => t });
    r.restart();
    t += 120001;
    expect(r.restart()).toEqual({ ok: true });
    expect(spawn).toHaveBeenCalledTimes(2);
  });
  it('is unavailable without a config', () => {
    const spawn = jest.fn();
    expect(createRestarter({ config: null, spawn }).restart()).toEqual({ ok: false, reason: 'unavailable' });
    expect(spawn).not.toHaveBeenCalled();
  });
});
