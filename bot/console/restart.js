/**
 * restart — lets the console restart Rumi, but only under Pinokio.
 *
 * Elsewhere a button could stop the bot and not start it again (a laptop
 * terminal), or stop it for good (Railway's ON_FAILURE policy). Under Pinokio
 * `pinokio/start.js` hands the bot the two variables below, and Pinokio itself
 * does the stop-then-start through `pinokio/restart.js`.
 *
 * Nothing from a request ever reaches the command: both paths come from the
 * environment and the argument list is fixed.
 *
 * @module console/restart
 */

const path = require('path');

/** A second press inside this window is refused: a restart takes about a minute. */
const COOLDOWN_MS = 120000;

/**
 * @param {object} env
 * @param {{standalone: boolean}} opts
 * @returns {null | {pterm: string, script: string}}
 */
function restartConfig(env, { standalone }) {
  if (standalone) return null;
  const pterm = env && env.RUMI_PTERM;
  const script = env && env.RUMI_RESTART_SCRIPT;
  if (!pterm || !script) return null;
  if (!path.isAbsolute(pterm) || !path.isAbsolute(script)) return null;
  return { pterm, script };
}

/**
 * @param {{config: null|{pterm: string, script: string}, spawn: Function, now?: () => number}} deps
 */
function createRestarter({ config, spawn, now = Date.now }) {
  let lastAt = null;
  return {
    restart() {
      if (!config) return { ok: false, reason: 'unavailable' };
      const t = now();
      if (lastAt !== null && t - lastAt < COOLDOWN_MS) return { ok: false, reason: 'already-restarting' };
      lastAt = t;
      const child = spawn(config.pterm, ['start', config.script], { detached: true, stdio: 'ignore' });
      // A failed spawn (pterm moved, no permission) emits 'error'; unhandled it
      // would take the bot down. Log it and free the cooldown so a retry works.
      if (child && typeof child.on === 'function') {
        child.on('error', (err) => {
          console.error(`Console restart could not start: ${err && err.code ? err.code : 'spawn failed'}`);
          lastAt = null;
        });
      }
      if (child && typeof child.unref === 'function') child.unref();
      return { ok: true };
    },
  };
}

module.exports = { restartConfig, createRestarter, COOLDOWN_MS };
