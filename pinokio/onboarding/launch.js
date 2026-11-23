/**
 * launch -- picks the bot's port and starts Rumi through Pinokio.
 *
 * The port is chosen BEFORE the spawn so the page knows where to look, and so
 * start.js's own `pick-port.js bot` finds the same remembered port free and
 * reuses it. Nothing from a request reaches a command: the pterm and script
 * paths come from the environment and the argument lists are fixed.
 *
 * Pure apart from the injected `spawn`, `execFile` and `pickPort`.
 *
 * @module onboarding/launch
 */

const path = require('path');

/** A second launch inside this window is refused: Rumi takes about a minute to come up. */
const COOLDOWN_MS = 120000;

/**
 * Run `node <scriptsDir>/pick-port.js bot` and return the port it prints.
 * @param {{execFile: Function, scriptsDir: string}} deps
 * @returns {Promise<number>}
 */
function pickBotPort({ execFile, scriptsDir }) {
  return new Promise((resolve, reject) => {
    execFile(process.execPath, [path.join(scriptsDir, 'pick-port.js'), 'bot'], (error, stdout) => {
      if (error) return reject(error);
      const match = /port=(\d+)/.exec(String(stdout || ''));
      if (!match) return reject(new Error('pick-port printed no port'));
      return resolve(Number(match[1]));
    });
  });
}

/**
 * Two ways to start Rumi, checked in this order:
 *
 *  - Desktop (RUMI_DESKTOP=1): a desktop app wrapping this wizard started
 *    this server as its child, and starts Rumi itself. Launch only picks the
 *    port and tells the app through `notify` (the IPC channel to the parent).
 *  - Pinokio (RUMI_PTERM + RUMI_START_SCRIPT): `pterm start start.js`.
 *
 * With neither, the port is reported and the person starts Rumi by hand.
 *
 * @param {{env: object, spawn: Function, pickPort: () => Promise<number>,
 *   notify?: ((message: object) => void)|null, now?: () => number}} deps
 */
function createLauncher({ env, spawn, pickPort, notify = null, now = Date.now }) {
  let busy = false;
  let lastAt = null;
  // The port handed out for the last launch, and whether Rumi was spawned on it.
  // Once spawned, relaunches reuse it: pick-port would hand out a different
  // port while the first Rumi still holds the remembered one.
  let lastPort = null;
  let spawned = false;
  const pterm = env && env.RUMI_PTERM;
  const script = env && env.RUMI_START_SCRIPT;
  const underPinokio = Boolean(pterm && script && path.isAbsolute(pterm) && path.isAbsolute(script));
  const underDesktop = Boolean(env && env.RUMI_DESKTOP === '1' && typeof notify === 'function');

  return {
    async launch() {
      const t = now();
      if (busy || (lastAt !== null && t - lastAt < COOLDOWN_MS)) return { ok: false, reason: 'already-launching', ...(lastPort ? { port: lastPort } : {}) };
      busy = true;
      try {
        let port;
        try {
          port = spawned ? lastPort : await pickPort();
        } catch {
          return { ok: false, reason: 'no-port' };
        }
        lastPort = port;
        if (underDesktop) {
          try {
            notify({ type: 'rumi:launch', port });
          } catch (err) {
            console.error(`Launch could not reach the desktop app: ${err && err.message ? err.message : 'notify failed'}`);
            lastPort = null;
            return { ok: false, reason: 'no-desktop' };
          }
          lastAt = now();
          spawned = true;
          return { ok: true, port };
        }
        if (!underPinokio) return { ok: true, port, manual: true };
        lastAt = now();
        spawned = true;
        const child = spawn(pterm, ['start', script], { detached: true, stdio: 'ignore' });
        // A failed spawn emits 'error'; unhandled it would crash the wizard.
        // Log the code and free the guard so a retry works.
        if (child && typeof child.on === 'function') {
          child.on('error', (err) => {
            console.error(`Launch could not start Rumi: ${err && err.code ? err.code : 'spawn failed'}`);
            lastAt = null;
            lastPort = null;
            spawned = false;
          });
        }
        if (child && typeof child.unref === 'function') child.unref();
        return { ok: true, port };
      } finally {
        busy = false;
      }
    },
  };
}

module.exports = { pickBotPort, createLauncher, COOLDOWN_MS };
