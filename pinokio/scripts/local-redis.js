/**
 * Start a local Redis -- but only if Rumi is configured to use one.
 *
 * Rumi reads exactly one Redis setting, REDIS_URL in .env. If it points at
 * this machine (localhost, 127.0.0.1, ::1, or is unset -- Rumi's template
 * default is local), this runs redis-server on that URL's port and stays in
 * the foreground for as long as the Pinokio script that started it. If it
 * points anywhere else (Upstash, Railway, ...), it says so and exits, and no
 * Redis process is started at all.
 *
 * Read at run time, not when Pinokio loads the script, so switching REDIS_URL
 * in the wizard takes effect the next time Start or Doctor runs.
 *
 * Run as a command by scripts/redis.js (Start, Doctor), which waits for the
 * lines it prints. The setup wizard requires it instead, for localRedisPort(),
 * and runs it only when a check actually needs Redis (onboarding/local-redis.js).
 */

const fs = require('fs');
const net = require('net');
const path = require('path');
const { spawn } = require('child_process');

const ENV_PATH = path.join(__dirname, '..', '..', '.env');
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/** The REDIS_URL Rumi will see: the shell's, else the last one in .env. */
function redisUrl() {
  if (process.env.REDIS_URL) return process.env.REDIS_URL;
  let value = '';
  try {
    for (const line of fs.readFileSync(ENV_PATH, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^\s*REDIS_URL\s*=\s*(.*?)\s*$/);
      if (match) value = match[1].replace(/^(['"])(.*)\1$/, '$2');
    }
  } catch {
    // No .env yet: fall through to Rumi's default.
  }
  return value;
}

/**
 * The port of the local Redis a REDIS_URL asks for, or null if it asks for none.
 *
 * @param {string} raw a REDIS_URL value; empty means Rumi's default, localhost:6379
 * @returns {{port: number}|{port: null, reason: string}} reason is safe to print:
 *   it never contains the URL, because a hosted one carries its password
 */
function localRedisPort(raw) {
  let target;
  try {
    target = new URL(raw || 'redis://localhost:6379');
  } catch {
    return { port: null, reason: 'REDIS_URL in .env is not a valid URL, so no local Redis was started.' };
  }
  if (!LOCAL_HOSTS.has(target.hostname)) {
    return { port: null, reason: `REDIS_URL points at ${target.hostname}, so no local Redis was started.` };
  }
  return { port: Number(target.port || 6379) };
}

/** True if nothing is listening on the port right now. */
function isFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.listen(port, '127.0.0.1', () => server.close(() => resolve(true)));
  });
}

async function main() {
  const { port, reason } = localRedisPort(redisUrl());
  if (!port) {
    console.log(reason);
    process.exit(0);
  }
  // A Redis already on the port is normally a pass. But start.js stops the
  // wizard right before this, and a Redis the wizard started takes a moment to
  // exit: treating that one as "already running" would leave the bot with a
  // Redis that is about to disappear. So give a closing one a few seconds to go.
  for (let waited = 0; !(await isFree(port)); waited += 500) {
    if (waited >= 5000) {
      console.log(`Address already in use: a Redis is already running on port ${port}, so it will be used.`);
      process.exit(0);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  run(port);
}

/** Run redis-server in the foreground, tied to this process. */
function run(port) {
  const child = spawn('redis-server', ['--port', String(port), '--bind', '127.0.0.1'], { stdio: 'inherit' });

  // Stopping the Pinokio script must stop Redis too, not orphan it.
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
    process.on(signal, () => child.kill(signal));
  }
  child.on('error', (error) => {
    console.log(`Could not start redis-server: ${error.message}. Run Install again.`);
    process.exit(1);
  });
  child.on('exit', (code) => process.exit(code || 0));
}

if (require.main === module) {
  main();
}

module.exports = { localRedisPort };
