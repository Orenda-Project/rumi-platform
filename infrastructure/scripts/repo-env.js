const fs = require('fs');
const path = require('path');

/**
 * Read the repo's .env into the environment, for the infrastructure scripts
 * (bootstrap-db.js, migrate.js) that run from the repo root, where dotenv is
 * not installed. KEY=value lines only; surrounding quotes are stripped; a
 * variable already set in the shell wins over the file. A missing .env is
 * not an error (a fresh clone has none yet).
 *
 * @param {string} [envPath] - defaults to <repo root>/.env
 * @param {object} [env]     - defaults to process.env
 */
function loadRepoEnv(envPath = path.resolve(__dirname, '../../.env'), env = process.env) {
  let content;
  try {
    content = fs.readFileSync(envPath, 'utf8');
  } catch {
    return; // .env might not exist yet
  }
  content.split('\n').forEach((line) => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match && !env[match[1]]) {
      env[match[1]] = match[2].replace(/^["']|["']$/g, '');
    }
  });
}

module.exports = { loadRepoEnv };
