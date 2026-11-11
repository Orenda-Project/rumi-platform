const { EventEmitter } = require('events');
const { pickBotPort, createLauncher } = require('../../pinokio/onboarding/launch');

function fakeChild() {
  const child = new EventEmitter();
  child.unref = jest.fn();
  return child;
}

describe('pickBotPort', () => {
  test('parses port= from pick-port stdout and runs node on the bot name', async () => {
    const execFile = jest.fn((file, args, cb) => cb(null, 'port=51234\n', ''));
    await expect(pickBotPort({ execFile, scriptsDir: '/s' })).resolves.toBe(51234);
    expect(execFile.mock.calls[0][0]).toBe(process.execPath);
    expect(execFile.mock.calls[0][1]).toEqual([require('path').join('/s', 'pick-port.js'), 'bot']);
  });

  test('rejects when no port is printed', async () => {
    const execFile = (file, args, cb) => cb(null, 'pick-port: could not find a free port', '');
    await expect(pickBotPort({ execFile, scriptsDir: '/s' })).rejects.toThrow();
  });

  test('rejects when the process fails', async () => {
    const execFile = (file, args, cb) => cb(new Error('boom'), '', '');
    await expect(pickBotPort({ execFile, scriptsDir: '/s' })).rejects.toThrow();
  });
});

describe('createLauncher', () => {
  const env = { RUMI_PTERM: '/p/pterm', RUMI_START_SCRIPT: '/p/start.js' };

  test('picks a port, spawns pterm start detached, unrefs', async () => {
    const child = fakeChild();
    const spawn = jest.fn(() => child);
    const launcher = createLauncher({ env, spawn, pickPort: async () => 51234 });
    await expect(launcher.launch()).resolves.toEqual({ ok: true, port: 51234 });
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(spawn).toHaveBeenCalledWith('/p/pterm', ['start', '/p/start.js'], { detached: true, stdio: 'ignore' });
    expect(child.unref).toHaveBeenCalled();
  });

  test('a second launch is refused while the first is in flight', async () => {
    const spawn = jest.fn(() => fakeChild());
    const launcher = createLauncher({ env, spawn, pickPort: async () => 51234 });
    await launcher.launch();
    await expect(launcher.launch()).resolves.toEqual({ ok: false, reason: 'already-launching' });
    expect(spawn).toHaveBeenCalledTimes(1);
  });

  test('concurrent launches: only one spawns', async () => {
    const spawn = jest.fn(() => fakeChild());
    const launcher = createLauncher({ env, spawn, pickPort: async () => 51234 });
    const [a, b] = await Promise.all([launcher.launch(), launcher.launch()]);
    expect([a.ok, b.ok].sort()).toEqual([false, true]);
    expect(spawn).toHaveBeenCalledTimes(1);
  });

  test('without Pinokio env it reports the port and does not spawn', async () => {
    const spawn = jest.fn();
    const launcher = createLauncher({ env: {}, spawn, pickPort: async () => 51234 });
    await expect(launcher.launch()).resolves.toEqual({ ok: true, port: 51234, manual: true });
    expect(spawn).not.toHaveBeenCalled();
  });

  test('pickPort failure gives no-port and a later launch can retry', async () => {
    const spawn = jest.fn(() => fakeChild());
    let fail = true;
    const pickPort = async () => { if (fail) throw new Error('x'); return 51234; };
    const launcher = createLauncher({ env, spawn, pickPort });
    await expect(launcher.launch()).resolves.toEqual({ ok: false, reason: 'no-port' });
    fail = false;
    await expect(launcher.launch()).resolves.toEqual({ ok: true, port: 51234 });
  });

  test('a child error event does not throw and frees the guard', async () => {
    const first = fakeChild();
    const spawn = jest.fn().mockReturnValueOnce(first).mockReturnValue(fakeChild());
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const launcher = createLauncher({ env, spawn, pickPort: async () => 51234 });
    await launcher.launch();
    expect(() => first.emit('error', Object.assign(new Error('nope'), { code: 'ENOENT' }))).not.toThrow();
    expect(errSpy.mock.calls[0][0]).toContain('ENOENT');
    await expect(launcher.launch()).resolves.toEqual({ ok: true, port: 51234 });
    expect(spawn).toHaveBeenCalledTimes(2);
    errSpy.mockRestore();
  });
});
