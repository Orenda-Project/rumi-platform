/**
 * Ratchet: the legacy coaching monolith stays deleted.
 *
 * `bot/shared/services/coaching.service.js` (1,287-line monolith) and its
 * worker `bot/workers/coaching-processor.js` were dead code in the OSS
 * distribution — the live coaching path is
 *   sqs-worker.js → coaching-orchestrator.service.js → coaching/*.service.js
 * (started by infrastructure/railway/Procfile). The monolith's worker
 * consumed a separate PostgreSQL job queue (`claim_next_coaching_job`)
 * that NOTHING in JS ever enqueued to (`queue_coaching_job()` has zero
 * callers), so it idle-polled forever and was started by no deploy.
 *
 * Both files were removed in Wave 6 (bd-1873). This guard prevents either
 * from being reintroduced, and prevents any code from importing the
 * deleted monolith. See WAVE_6_SCOPING.md §A for the full call-graph proof.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const BOT_DIR = path.join(ROOT, 'bot');

function findJsFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '__mocks__') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...findJsFiles(full));
    else if (e.name.endsWith('.js')) out.push(full);
  }
  return out;
}

describe('Legacy coaching monolith stays deleted (bd-1873)', () => {
  it('the monolith file does not exist', () => {
    expect(fs.existsSync(path.join(ROOT, 'bot/shared/services/coaching.service.js'))).toBe(false);
  });

  it('its dead PG-queue worker does not exist', () => {
    expect(fs.existsSync(path.join(ROOT, 'bot/workers/coaching-processor.js'))).toBe(false);
  });

  it('nothing imports the deleted monolith (only the coaching/ split services exist)', () => {
    // Match require('.../coaching.service') but NOT '.../coaching/<x>.service'.
    const RE = /require\(\s*['"][^'"]*\/coaching\.service['"]\s*\)/;
    const offenders = [];
    for (const file of findJsFiles(BOT_DIR)) {
      const src = fs.readFileSync(file, 'utf8');
      if (RE.test(src)) offenders.push(path.relative(ROOT, file));
    }
    expect(offenders).toEqual([]);
  });
});
