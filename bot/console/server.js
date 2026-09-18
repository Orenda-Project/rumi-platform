#!/usr/bin/env node
/**
 * `rumi console` — the console on its own, when the bot will not start.
 *
 * bot/shared/config/supabase.js calls process.exit(78) at REQUIRE time when the
 * database credentials are missing or wrong, and bot/whatsapp-bot.js requires it
 * near the top. So a bot with a bad Supabase key never reaches app.listen(), and
 * a console mounted only on that app would be unreachable in precisely the
 * situation you would open it to fix.
 *
 * This process requires none of that. It binds to loopback, reads and writes the
 * same .env, and runs the same probes — enough to get the credentials right and
 * then start the bot properly.
 *
 * @module console/server
 */

process.env.RUMI_CLI = '1'; // keep console.* human-readable, as every rumi command does

const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '../..');
try {
  require(path.join(REPO_ROOT, 'bot', 'node_modules', 'dotenv'))
    .config({ path: path.join(REPO_ROOT, '.env'), quiet: true });
} catch { /* not installed yet; process.env is still valid, just bare */ }

const DEFAULT_PORT = Number(process.env.CONSOLE_PORT) || 4173;
const DEFAULT_BIND = process.env.CONSOLE_BIND || '127.0.0.1';

/**
 * @param {{port?: number, bind?: string}} [opts]
 * @returns {Promise<import('http').Server>}
 */
function start(opts = {}) {
  const express = require('express');
  const { mountConsole } = require('./index');

  const port = opts.port || DEFAULT_PORT;
  const bind = opts.bind || DEFAULT_BIND;

  const app = express();
  app.disable('x-powered-by');
  // Deliberately NOT `app.set('trust proxy', …)`. With it on, `req.ip` becomes
  // attacker-controlled through X-Forwarded-For, and the loopback test that
  // decides whether this console needs a password would trust a header.
  app.get('/', (req, res) => res.redirect('/console/'));

  const { mode, posture } = mountConsole(app, { bind, standalone: true });

  return new Promise((resolve) => {
    const server = app.listen(port, bind, () => {
      const ui = require('../scripts/setup/ui');
      console.log('');
      console.log(`  ${ui.bold('Rumi console')} ${ui.dim(`— ${mode} access, ${posture.reason}`)}`);
      console.log(`  ${ui.paint('brand', `http://${bind}:${port}/console`)}`);
      console.log('');
      console.log(ui.dim('  The bot is not running in this process. Fix what you need here,'));
      console.log(ui.dim('  then start it with `rumi start`.'));
      console.log('');
      resolve(server);
    });
  });
}

if (require.main === module) {
  start().catch((err) => {
    console.error(`Could not start the console: ${err.message}`);
    process.exitCode = 1;
  });
}

module.exports = { start, DEFAULT_PORT, DEFAULT_BIND };
