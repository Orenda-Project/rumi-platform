/**
 * Ratchet: every Procfile process command points at a file that exists.
 *
 * `bot/Procfile` shipped `worker: node workers/bullmq-worker.js` — a file
 * that exists NOWHERE in the repo (bullmq is only a queue *driver*, not a
 * worker entrypoint). A Railway service rooted at `bot/` reads that Procfile
 * and its `worker` process fails to boot with "Cannot find module". Fixed in
 * Wave 6 (bd-1874) → `worker: node workers/sqs-worker.js` (the
 * queue-driver-agnostic worker).
 *
 * This guard parses every Procfile and asserts each `name: node <path>`
 * command's script resolves to a real file. Procfiles use different path
 * roots depending on the service's configured root directory:
 *   - bot/Procfile               → paths relative to bot/ (web: node whatsapp-bot.js)
 *   - infrastructure/railway/...  → paths relative to repo root (web: node bot/whatsapp-bot.js)
 * so we accept a command if its script resolves relative to EITHER the
 * Procfile's own directory OR the repo root. The real bug class — a path
 * that resolves to nothing anywhere — still fails. Empty allowlist.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');

function findProcfiles(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.git', 'dist', 'build', 'coverage'].includes(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...findProcfiles(full));
    else if (e.name === 'Procfile') out.push(full);
  }
  return out;
}

// Parse "name: command" lines; extract the `node <script>` script path.
function nodeScripts(procfilePath) {
  const src = fs.readFileSync(procfilePath, 'utf8');
  const scripts = [];
  for (const line of src.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const m = trimmed.match(/^[\w-]+:\s*node\s+(\S+)/);
    if (m) scripts.push({ line: trimmed, script: m[1] });
  }
  return scripts;
}

describe('Procfile process targets resolve (bd-1874)', () => {
  const procfiles = findProcfiles(ROOT);

  it('finds at least one Procfile to check', () => {
    expect(procfiles.length).toBeGreaterThan(0);
  });

  it('every `node <script>` in every Procfile resolves to a real file', () => {
    const unresolved = [];
    for (const pf of procfiles) {
      const pfDir = path.dirname(pf);
      for (const { line, script } of nodeScripts(pf)) {
        const relToProcfile = path.resolve(pfDir, script);
        const relToRoot = path.resolve(ROOT, script);
        if (!fs.existsSync(relToProcfile) && !fs.existsSync(relToRoot)) {
          unresolved.push(`${path.relative(ROOT, pf)} — "${line}" → ${script} (resolves nowhere)`);
        }
      }
    }
    expect(unresolved).toEqual([]);
  });
});
