/**
 * runtime — the console's own state, and the small amount of the bot's state it
 * is allowed to reach for.
 *
 * Kept apart from the routes so that a route handler never has to know whether
 * it is running inside the bot (where `process.env` is the live truth and the
 * bot has an uptime) or inside `rumi console` (where the bot may not be running
 * at all and the only truth is the file on disk).
 *
 * The distinction between the FILE and the PROCESS is the console's most
 * important idea. `bot/shared/utils/constants.js` destructures ~50 variables
 * into module constants at require time, and `llm-client.js` caches a client
 * built from the values it saw at boot — so saving a key changes the file and
 * changes nothing else until a restart. A console that hid that difference
 * would be lying, and the operator would spend an afternoon finding out.
 *
 * @module console/runtime
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const { readEnvFile, writeEnvVars } = require('../scripts/setup/env-file');
const { isSet } = require('../shared/config/feature-availability');

const REPO_ROOT = path.resolve(__dirname, '../..');
const DEFAULT_ENV_PATH = path.join(REPO_ROOT, '.env');
const TEMPLATE_PATH = path.join(REPO_ROOT, '.env.template');

/**
 * A promise chain that serialises every write to `.env`.
 *
 * Two console tabs saving at once — or a save racing `rumi setup` in another
 * terminal — would otherwise interleave a read-modify-write and lose one of
 * them silently. `writeEnvVars` reads the whole file and rewrites it, so the
 * window is real, not theoretical.
 */
let writeChain = Promise.resolve();

/**
 * Snapshot of the environment the bot actually booted with. Captured once, at
 * mount time, before anything can have changed it — this is what "pending
 * restart" is measured against.
 */
function createRuntime({ envPath = DEFAULT_ENV_PATH, bind = '127.0.0.1', standalone = false } = {}) {
  const bootEnv = { ...process.env };
  const bootedAt = new Date();

  return {
    envPath,
    templatePath: TEMPLATE_PATH,
    repoRoot: REPO_ROOT,
    bind,
    /** True when served by `rumi console` rather than mounted on the bot. */
    standalone,
    bootedAt,
    /** Per-process token for local (loopback, no password) mode. */
    localToken: crypto.randomBytes(32).toString('hex'),

    /** What the `.env` file says right now — re-read every time, never cached. */
    fileEnv() {
      return readEnvFile(this.envPath);
    },

    /** What the running process was started with. */
    bootEnv() {
      return bootEnv;
    },

    /**
     * Variables whose saved value differs from the one the bot is running on.
     *
     * Compared against the BOOT snapshot rather than live `process.env`,
     * because a save mirrors the new value into `process.env` for the benefit
     * of anything that reads it lazily — which would otherwise make the
     * difference disappear the instant it was created.
     *
     * @returns {Array<{key: string, wasSet: boolean, nowSet: boolean}>}
     */
    pendingRestart() {
      if (standalone) return []; // nothing is running here to be out of date
      const file = this.fileEnv();
      const keys = new Set([...Object.keys(file), ...Object.keys(bootEnv)]);
      const pending = [];
      for (const key of keys) {
        // Only variables Rumi actually reads are interesting; the shell
        // contributes PATH, HOME and a hundred others to process.env.
        if (!(key in file) && !(key in bootEnv)) continue;
        if (!(key in file)) continue;
        const before = bootEnv[key] === undefined ? '' : String(bootEnv[key]);
        const after = String(file[key] === undefined ? '' : file[key]);
        if (before !== after) {
          pending.push({ key, wasSet: isSet(before), nowSet: isSet(after) });
        }
      }
      return pending.sort((a, b) => a.key.localeCompare(b.key));
    },

    /**
     * Save values to `.env`, serialised against every other write.
     *
     * Mirrors into `process.env` afterwards so that anything reading lazily
     * (and the probes, which take an env object) sees the new value straight
     * away. Anything that captured its value at require time will not, which is
     * exactly what `pendingRestart()` exists to report.
     *
     * @param {Record<string,string>} updates
     * @returns {Promise<{written: string[]}>}
     */
    save(updates) {
      const run = async () => {
        const keys = Object.keys(updates);
        if (!keys.length) return { written: [] };

        // Back up before the first write of the session. A truncated .env is
        // the loss of every credential this deployment has.
        backupOnce(this.envPath);

        writeEnvVars(this.envPath, updates, { fromTemplatePath: this.templatePath });

        // Verify the round trip: `readEnvFile` does not handle quoted or
        // multi-line values, so a value that cannot survive being written and
        // read back must be reported rather than silently mangled.
        const readBack = readEnvFile(this.envPath);
        const mangled = keys.filter((k) => String(readBack[k]) !== String(updates[k]));
        if (mangled.length) {
          throw new Error(`Saved value could not be read back correctly: ${mangled.join(', ')}`);
        }

        for (const key of keys) process.env[key] = updates[key];
        try { fs.chmodSync(this.envPath, 0o600); } catch { /* best effort; Windows has no mode */ }
        return { written: keys };
      };

      writeChain = writeChain.then(run, run);
      return writeChain;
    },

    /** Uptime of the process serving this console, in seconds. */
    uptimeSeconds() {
      return Math.floor(process.uptime());
    },
  };
}

/** One backup per process, keeping the five most recent. */
let backedUp = false;
function backupOnce(envPath) {
  if (backedUp || !fs.existsSync(envPath)) return;
  backedUp = true;
  try {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    fs.copyFileSync(envPath, `${envPath}.bak.${stamp}`);
    fs.chmodSync(`${envPath}.bak.${stamp}`, 0o600);
    const dir = path.dirname(envPath);
    const base = `${path.basename(envPath)}.bak.`;
    const old = fs.readdirSync(dir).filter((f) => f.startsWith(base)).sort().slice(0, -5);
    for (const f of old) fs.unlinkSync(path.join(dir, f));
  } catch { /* a missing backup must not stop a save the operator asked for */ }
}

module.exports = { createRuntime, DEFAULT_ENV_PATH, TEMPLATE_PATH, REPO_ROOT };
