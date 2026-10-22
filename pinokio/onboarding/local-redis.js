/**
 * local-redis -- start a local Redis for the wizard only when a check needs one.
 *
 * The wizard opens before the operator has chosen a Redis: .env still has
 * the template's REDIS_URL=redis://localhost:6379, whether they mean to keep it
 * or paste an Upstash URL a minute later. Starting a local Redis when the wizard
 * opens would run one for every Upstash user, for nothing. So it starts here,
 * at the moment something actually tests Redis -- saving the REDIS_URL field,
 * the closing check, or the console's own connection test -- and only if
 * REDIS_URL, as it stands then, points at this machine and nothing answers yet.
 *
 * Once started it lives as long as this server: it is a child of this process,
 * so stopping "Set up Rumi" (or pressing Start, which stops the wizard) ends it.
 *
 * @module onboarding/local-redis
 */

const net = require('net');
const path = require('path');
const { spawn } = require('child_process');
const { localRedisPort } = require('../scripts/local-redis');

const HELPER = path.join(__dirname, '..', 'scripts', 'local-redis.js');
const READY_TIMEOUT_MS = 5000;

/** The Redis this server started, if any. */
let child = null;

/** Resolve true if something accepts a connection on 127.0.0.1:port. */
function answers(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port });
    const done = (result) => { socket.destroy(); resolve(result); };
    socket.setTimeout(500, () => done(false));
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
  });
}

/**
 * Make sure the Redis that `env.REDIS_URL` names is reachable, starting a
 * local one if that is what it names. Never throws: if Redis still is not up,
 * the check that called this reports it, in Rumi's own words.
 *
 * @param {object} env the environment the check will use (.env over process.env)
 */
async function ensureLocalRedis(env) {
  const { port } = localRedisPort(env.REDIS_URL);
  if (!port || await answers(port)) return;

  if (!child || child.exitCode !== null) {
    // The helper rather than redis-server directly: one place decides how a
    // local Redis is run. Its output goes to this server's terminal.
    child = spawn(process.execPath, [HELPER], {
      env: { ...process.env, REDIS_URL: env.REDIS_URL || '' },
      stdio: 'inherit',
    });
    child.on('error', () => { child = null; });
  }

  for (let waited = 0; waited < READY_TIMEOUT_MS; waited += 200) {
    if (await answers(port)) return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

/** Stop the Redis this server started, if any. */
function stopLocalRedis() {
  if (child && child.exitCode === null) child.kill('SIGTERM');
}

for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.once(signal, () => { stopLocalRedis(); process.exit(0); });
}
process.once('exit', stopLocalRedis);

module.exports = { ensureLocalRedis };
