/**
 * The built-in database's settings (RUMI_DB_*) from the repo-root .env.
 *
 * `rumi setup` / `rumi start` save the built-in database's password in the
 * repo-root .env, but the dashboard loads `.env` from the directory it is
 * started in (dashboard/). Only RUMI_DB_* is taken from the root file, and
 * only when not already set — a dashboard configured for Supabase or
 * DATABASE_URL in its own .env is not switched over. A dashboard deployed on
 * its own has no root .env, so this does nothing there.
 */

const fs = require('fs');
const path = require('path');

const ROOT_ENV_PATH = path.resolve(__dirname, '../../.env');
const BUNDLED_DB_KEY = /^RUMI_DB_/;

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @param {string} [envPath]
 */
function loadBundledDbEnv(env = process.env, envPath = ROOT_ENV_PATH) {
  let content;
  try {
    content = fs.readFileSync(envPath, 'utf8');
  } catch {
    return; // no repo-root .env: a standalone deployment
  }
  for (const line of content.split('\n')) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=(.*)$/);
    if (!match || !BUNDLED_DB_KEY.test(match[1]) || env[match[1]]) continue;
    const value = match[2].trim().replace(/^["']|["']$/g, '');
    if (value) env[match[1]] = value;
  }
}

module.exports = { loadBundledDbEnv };
