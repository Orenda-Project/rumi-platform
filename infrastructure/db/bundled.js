/**
 * The bundled Postgres (DB_DRIVER=bundled): where its data lives, its
 * password, and starting it — or finding it already running.
 *
 * The server itself is embedded-postgres.mjs (real Postgres binaries for
 * Windows, macOS and Linux, from npm). This module is the CommonJS side that
 * `npm run db:start`, `rumi start`, `rumi setup` and bootstrap use.
 */

const { spawn } = require('child_process');
const crypto = require('crypto');
const path = require('path');
const { Client } = require('pg');
const { bundledDbSettings, databaseUrlFor } = require('../../bot/shared/services/db/pg-adapter/drivers');
const { writeEnvVars } = require('../../bot/scripts/setup/env-file');

const REPO_ROOT = path.resolve(__dirname, '../..');
const ENV_PATH = path.join(REPO_ROOT, '.env');
const ENV_TEMPLATE_PATH = path.join(REPO_ROOT, '.env.template');
const SERVER_SCRIPT = path.join(__dirname, 'embedded-postgres.mjs');
const DEFAULT_DATA_DIR = '.rumi-db';
const READY_TIMEOUT_MS = 120000;
const PROBE_TIMEOUT_MS = 3000;
const PASSWORD_BYTES = 24;
const STOP_TIMEOUT_MS = 30000;

/**
 * The data directory: RUMI_DB_DIR, relative paths taken from the repo root.
 * @param {NodeJS.ProcessEnv} env
 */
function dataDir(env = process.env) {
  return path.resolve(REPO_ROOT, String(env.RUMI_DB_DIR || '').trim() || DEFAULT_DATA_DIR);
}

/**
 * Make sure the bundled database has a password, generating and saving one
 * to .env the first time. Mutates `env` so the caller's next step sees it.
 *
 * Only the password is written, not DB_DRIVER: left unset, the driver stays
 * "bundled until another database is configured", so an operator who later
 * adds Supabase or DATABASE_URL settings is switched over without editing
 * DB_DRIVER too. (`rumi setup` writes DB_DRIVER when someone chooses.)
 * @param {NodeJS.ProcessEnv} env
 * @param {{ envPath?: string }} [opts]
 * @returns {{ created: boolean }}
 */
function ensurePassword(env = process.env, { envPath = ENV_PATH } = {}) {
  if (env.RUMI_DB_PASSWORD) return { created: false };
  const password = crypto.randomBytes(PASSWORD_BYTES).toString('hex');
  writeEnvVars(envPath, { RUMI_DB_PASSWORD: password }, { fromTemplatePath: ENV_TEMPLATE_PATH });
  Object.assign(env, { RUMI_DB_PASSWORD: password });
  return { created: true };
}

/**
 * Is the bundled database answering with this password?
 * @param {NodeJS.ProcessEnv} env
 * @returns {Promise<{ ok: boolean, detail: string }>}
 */
async function probe(env = process.env) {
  const client = new Client({ connectionString: databaseUrlFor(env), connectionTimeoutMillis: PROBE_TIMEOUT_MS });
  try {
    await client.connect();
    await client.query('SELECT 1');
    return { ok: true, detail: 'running' };
  } catch (err) {
    return { ok: false, detail: err.message };
  } finally {
    await client.end().catch(() => {});
  }
}

/**
 * Start the bundled Postgres as a child of this process.
 *
 * It stops when this process exits: the server watches its stdin, which
 * closes with us (--exit-on-stdin-end). stop() closes it on purpose — the one
 * way to ask for a clean shutdown that works on Windows too, where a signal
 * would kill the wrapper and leave postgres.exe running.
 *
 * @param {NodeJS.ProcessEnv} env
 * @param {{ onOutput?: (line: string) => void }} [opts]
 * @returns {Promise<{ child: import('child_process').ChildProcess, stop: () => Promise<void> }>}
 */
function startServer(env = process.env, { onOutput = () => {} } = {}) {
  const { port } = bundledDbSettings(env);
  const args = [SERVER_SCRIPT, '--dir', dataDir(env), '--port', String(port), '--exit-on-stdin-end'];
  const child = spawn(process.execPath, args, {
    stdio: ['pipe', 'pipe', 'pipe'],
    // From `env`, not just process.env: `rumi start` reads .env into an object.
    env: { ...process.env, RUMI_DB_PASSWORD: env.RUMI_DB_PASSWORD, RUMI_DB_RUN_AS_ROOT: env.RUMI_DB_RUN_AS_ROOT || '' },
  });

  const stop = () => new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) return resolve();
    const force = setTimeout(() => child.kill('SIGKILL'), STOP_TIMEOUT_MS);
    child.once('exit', () => {
      clearTimeout(force);
      resolve();
    });
    child.stdin.end();
  });

  return new Promise((resolve, reject) => {
    let out = '';
    let err = '';
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`The database did not start within ${READY_TIMEOUT_MS / 1000}s. ${err.trim()}`));
    }, READY_TIMEOUT_MS);
    child.stdout.on('data', (chunk) => {
      out += chunk;
      if (!out.includes('"ready":true')) return;
      clearTimeout(timer);
      resolve({ child, stop });
    });
    child.stderr.on('data', (chunk) => {
      err += chunk;
      String(chunk).split('\n').filter(Boolean).forEach(onOutput);
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`The database stopped while starting (exit ${code}). ${err.trim()}`));
    });
  });
}

/**
 * Reuse a running bundled database, or start one.
 * @param {NodeJS.ProcessEnv} env
 * @param {{ onOutput?: (line: string) => void }} [opts]
 * @returns {Promise<{ started: boolean, stop: () => Promise<void> }>}
 *   stop() is a no-op when an already-running server was reused.
 */
async function ensureRunning(env = process.env, opts = {}) {
  const existing = await probe(env);
  if (existing.ok) return { started: false, stop: async () => {} };
  if (/password authentication failed|does not exist/i.test(existing.detail)) {
    const { port } = bundledDbSettings(env);
    throw new Error(
      `A different database is already using port ${port} (${existing.detail}). `
      + 'Stop it, or set RUMI_DB_PORT in .env to a free port.'
    );
  }
  const { stop } = await startServer(env, opts);
  return { started: true, stop };
}

module.exports = {
  DEFAULT_DATA_DIR, ENV_PATH, dataDir, ensurePassword, ensureRunning, probe, startServer,
};
