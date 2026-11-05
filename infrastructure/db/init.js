#!/usr/bin/env node
/**
 * `node infrastructure/db/init.js` — prepare the built-in database at install
 * time, without starting it: when no other database is configured
 * (DB_DRIVER resolves to bundled), generate its password into .env.
 *
 * Run by the Pinokio installer, so the setup screens show the built-in
 * database as already configured instead of asking for a password nobody
 * chose. The data folder and tables are created by the first `rumi start`.
 * Safe to run again: an existing password, or another database, is left alone.
 */

const { loadRepoEnv } = require('../scripts/repo-env');
const { resolveDbDriver } = require('../../bot/shared/services/db/pg-adapter/drivers');
const { ensurePassword } = require('./bundled');

function main() {
  loadRepoEnv();
  let driver;
  try {
    driver = resolveDbDriver(process.env);
  } catch (err) {
    console.error(`[db] ${err.message}`);
    process.exit(1);
  }
  if (driver !== 'bundled') {
    console.log(`[db] Using DB_DRIVER=${driver}; the built-in database is not needed.`);
    return;
  }
  const { created } = ensurePassword(process.env);
  console.log(created
    ? '[db] Built-in database prepared (password saved to .env). It starts with Rumi.'
    : '[db] Built-in database already prepared.');
}

main();
