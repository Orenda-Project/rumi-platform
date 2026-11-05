/**
 * Starts a throwaway bundled Postgres for tests that need a real database.
 *
 * Spawns infrastructure/db/embedded-postgres.mjs (ESM, so it runs outside
 * Jest's CommonJS sandbox) on a free port with a temp data dir, and resolves
 * once it prints its ready line. stop() kills it; the data dir is ephemeral.
 */

const { spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');

const SERVER = path.resolve(__dirname, '../../infrastructure/db/embedded-postgres.mjs');
const READY_TIMEOUT_MS = 60000;

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

const START_ATTEMPTS = 3;

/**
 * Jest runs suites in parallel, so another suite can take the port between
 * freePort() and Postgres binding it; on an early exit, retry on a new port.
 */
async function startEmbeddedPostgres() {
  let lastError;
  for (let attempt = 1; attempt <= START_ATTEMPTS; attempt += 1) {
    try {
      return await startOnce();
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

async function startOnce() {
  const port = await freePort();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rumi-pg-'));
  const password = crypto.randomBytes(12).toString('hex');
  const child = spawn(
    process.execPath,
    [SERVER, '--dir', dir, '--port', String(port), '--ephemeral', '--exit-on-stdin-end'],
    { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, RUMI_DB_PASSWORD: password } }
  );

  const url = await new Promise((resolve, reject) => {
    let out = '';
    let err = '';
    const timer = setTimeout(() => reject(new Error(`Postgres did not start: ${err}`)), READY_TIMEOUT_MS);
    child.stdout.on('data', (chunk) => {
      out += chunk;
      const line = out.split('\n').find((l) => l.startsWith('{'));
      if (!line) return;
      clearTimeout(timer);
      resolve(`postgres://postgres:${password}@127.0.0.1:${JSON.parse(line).port}/postgres`);
    });
    child.stderr.on('data', (chunk) => { err += chunk; });
    child.on('exit', (code) => {
      clearTimeout(timer);
      fs.rmSync(dir, { recursive: true, force: true });
      reject(new Error(`Postgres exited early (code ${code}): ${err}`));
    });
  }).catch((startErr) => {
    child.kill('SIGTERM');
    throw startErr;
  });

  const stop = () => new Promise((resolve) => {
    if (child.exitCode !== null) return resolve();
    child.once('exit', () => {
      fs.rmSync(dir, { recursive: true, force: true });
      resolve();
    });
    child.kill('SIGTERM');
  });

  return { url, stop };
}

module.exports = { startEmbeddedPostgres };
