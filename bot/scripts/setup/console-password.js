#!/usr/bin/env node
/**
 * `rumi console --set-password` — the one credential the console ever needs.
 *
 * On a laptop the console is bound to loopback and asks for nothing: the person
 * at the keyboard already owns the machine and the `.env` file on it, and
 * demanding an invented password there buys no security while costing us the
 * non-technical operator this whole thing is for.
 *
 * The moment it is reachable from a network, that reasoning stops holding, and
 * the console refuses to serve anything until a password exists. This is how you
 * give it one.
 *
 * @module console-password
 */

process.env.RUMI_CLI = '1';

const crypto = require('crypto');
const path = require('path');

const ui = require('./ui');
const prompt = require('./prompt');
const { writeEnvVars, readEnvFile } = require('./env-file');

const ROOT = path.resolve(__dirname, '../../..');
const ENV_PATH = path.join(ROOT, '.env');

/** Cost 10: about 100ms to verify, which is slow enough to matter for guessing. */
const BCRYPT_COST = 10;

async function main() {
  const io = prompt.createIo();
  try {
    console.log(ui.logo());
    console.log(`  ${ui.bold('Set a console password')}`);
    console.log('');
    console.log(ui.dim('  You only need this if Rumi is deployed somewhere other people can reach.'));
    console.log(ui.dim('  On your own machine the console opens without one.'));
    console.log('');

    const password = await io.ask('Choose a password', { secret: true });
    if (!password || password.length < 10) {
      console.log(ui.fail('Use at least 10 characters — this guards every API key you have.'));
      process.exitCode = 1;
      return;
    }
    const again = await io.ask('Type it again', { secret: true });
    if (again !== password) {
      console.log(ui.fail('Those did not match. Nothing was changed.'));
      process.exitCode = 1;
      return;
    }

    const bcrypt = require(path.join(ROOT, 'bot', 'node_modules', 'bcryptjs'));
    const updates = {
      ADMIN_PASSWORD_HASH: bcrypt.hashSync(password, BCRYPT_COST),
    };

    // A session secret is needed alongside the hash, and asking a person to
    // invent 32 random bytes is how you get "password123" in production.
    const existing = readEnvFile(ENV_PATH);
    if (!existing.SESSION_SECRET || existing.SESSION_SECRET.length < 32) {
      updates.SESSION_SECRET = crypto.randomBytes(32).toString('hex');
    }

    writeEnvVars(ENV_PATH, updates, { fromTemplatePath: path.join(ROOT, '.env.template') });

    console.log('');
    console.log(ui.ok('Saved. Restart Rumi and the console will ask for this password.'));
    console.log(ui.dim('  The password itself is not stored — only a hash of it.'));
    console.log('');
  } finally {
    if (typeof io.close === 'function') io.close();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.log(ui.fail(`Could not set the password: ${err.message}`));
    process.exitCode = 1;
  });
}

module.exports = { main, BCRYPT_COST };
