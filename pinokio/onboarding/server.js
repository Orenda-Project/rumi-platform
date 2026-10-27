/**
 * server -- the GUI onboarding for Rumi, served beside Rumi's own console.
 *
 * Rumi ships a web console that already writes `.env` through the same validators
 * as the terminal wizard. It cannot be driven from another origin -- it sends no
 * CORS headers by design and sets `frame-ancestors 'none'` -- so this does not try
 * to. It mounts the console into *this* express app instead, which the bot itself
 * does too. One process, one port, one origin:
 *
 *   /          the five-step wizard
 *   /api/*     its endpoints, calling the console's runtime in-process
 *   /console/* the real console, for everything after setup
 *
 * @module onboarding/server
 */

const path = require('path');

const bridge = require('./bridge');
const guards = require('./guards');
const { ensureLocalRedis } = require('./local-redis');
const { credentialsRoutes } = require('./routes/credentials');
const { databaseRoutes } = require('./routes/database');
const { whatsappRoutes } = require('./routes/whatsapp');

/** Loopback only. The console's own posture check reads this to decide it needs no password. */
const HOST = '127.0.0.1';
const DEFAULT_PORT = 4180;
const BODY_LIMIT = '64kb';

/** @param {string[]} argv @returns {number} */
function parsePort(argv) {
  const flag = argv.find((arg) => arg.startsWith('--port='));
  const value = flag ? Number(flag.split('=')[1]) : NaN;
  return Number.isInteger(value) && value > 0 ? value : DEFAULT_PORT;
}

/**
 * Mount Rumi's console, and get back the runtime that owns `.env`.
 *
 * Falls back to building the runtime alone if the console will not mount: saving
 * credentials is the point of this app, and it should survive losing the part
 * that is only there for afterwards.
 *
 * @returns {{runtime: object|null, mode: string|null}}
 */
function attachConsole(app) {
  if (bridge.capabilities.console) {
    try {
      // standalone: this process is not the bot. Without it the console compares
      // the .env file against THIS server's environment and reports sixty
      // variables as "pending restart", which is noise and, worse, wrong.
      const mounted = bridge.modules.console.mountConsole(app, { envPath: bridge.ENV_PATH, bind: HOST, standalone: true });
      return { runtime: mounted.runtime, mode: mounted.mode };
    } catch (error) {
      bridge.problems.push(`The console could not be mounted: ${error.message}`);
      bridge.capabilities.console = false;
    }
  }

  if (bridge.modules.runtime) {
    const runtime = bridge.modules.runtime.createRuntime({
      envPath: bridge.ENV_PATH,
      bind: HOST,
      standalone: true,
    });
    return { runtime, mode: null };
  }

  return { runtime: null, mode: null };
}

function buildApp() {
  const express = bridge.loadExpress();
  const app = express();
  app.disable('x-powered-by');

  // Registered before the console mounts, but asks at request time whether the
  // console is really there -- so a failed mount does not leave /console
  // unguarded.
  let consoleMounted = false;
  app.use(guards.securityHeaders({ hasConsole: () => consoleMounted }));

  // The console's own "test this connection" for Redis needs a Redis to test.
  // It only peeks: the console still answers the request, after its own
  // guards. `runtime` is read at request time; it exists by then.
  app.post('/console/api/probe/redis', (req, res, next) => {
    ensureLocalRedis({ ...process.env, ...(runtime ? runtime.fileEnv() : {}) }).then(() => next(), next);
  });

  // Before the body parser and the wizard's own routes, so the console keeps
  // full ownership of everything under its mount.
  const { runtime, mode } = attachConsole(app);
  consoleMounted = bridge.capabilities.console;

  app.use(express.json({ limit: BODY_LIMIT }));
  app.use('/api', guards.requireOwnOrigin);
  app.use('/api', credentialsRoutes({ express, bridge, runtime }));
  app.use('/api/db', databaseRoutes({ express, bridge, runtime }));
  app.use('/api/whatsapp', whatsappRoutes({ express, bridge }));
  app.use('/api', (req, res) => res.status(404).json({ error: 'No such endpoint' }));

  app.use(express.static(path.join(__dirname, 'public'), { index: 'index.html' }));

  // eslint-disable-next-line no-unused-vars -- express identifies error handlers by arity
  app.use((error, req, res, next) => {
    console.error(`[onboarding] ${req.method} ${req.originalUrl}: ${error.message}`);
    res.status(500).json({ error: error.message });
  });

  return { app, mode };
}

function main() {
  if (!bridge.isInstalled()) {
    console.error('Rumi is not installed yet. Run Install from the Pinokio sidebar first.');
    process.exit(1);
  }

  const port = parsePort(process.argv.slice(2));
  const { app, mode } = buildApp();

  app.listen(port, HOST, () => {
    // Pinokio watches this line to learn where the app is; keep the URL on it.
    console.log('');
    console.log(`  Rumi setup is ready at http://${HOST}:${port}`);
    console.log(`  Console: http://${HOST}:${port}/console${mode ? ` (${mode} access)` : ''}`);
    reportProblems();
    console.log('');
  });
}

function reportProblems() {
  if (!bridge.problems.length) return;
  console.log('');
  console.log('  Some steps are unavailable and will point at the terminal instead:');
  for (const problem of bridge.problems) console.log(`    - ${problem}`);
}

if (require.main === module) main();

module.exports = { buildApp, parsePort, HOST };
