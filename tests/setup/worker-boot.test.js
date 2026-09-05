/**
 * Worker-boot audit.
 *
 * For every Node entry point (web + workers), fork a child process with a
 * minimum-shaped env and assert the require chain resolves without load-time
 * errors. The check is forked, not in-process, because some workers do not yet
 * gate on `require.main === module` — requiring them starts the loop.
 *
 * Pass criteria:
 *   - Child is still alive at the 2s timeout (require chain resolved, the
 *     main loop kicked in) → PASS, kill it
 *   - Child exited with code 0 in < 2s → PASS (clean require + early exit)
 *   - Child exited with code ≠ 0 in < 2s, no load-time error in stderr → PASS
 *     for a CRON_WORKER entry (cron workers correctly exit non-zero when their
 *     dependencies are unreachable; that's not a boot failure), FAIL otherwise
 *
 * Load-time errors are detected by patterns Node prints at column 0 when the
 * require chain itself fails. Runtime errors that the worker handles
 * gracefully (e.g. a TypeError from a Supabase fetch during the poll loop,
 * logged via pino as `"error": "TypeError: fetch failed"`) are NOT load-time
 * errors and do not fail the audit.
 */

const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { ROOT, BOT_ROOT } = require('./_audit-helpers/require-graph');

// Minimum-shaped env — placeholders that pass presence-gating without dialling
// real services.
const MINIMUM_ENV = {
  NODE_ENV: 'test',
  PORT: '0',
  SUPABASE_URL: 'http://localhost:54321',
  SUPABASE_SERVICE_ROLE_KEY: 'eyJ-test-placeholder',
  OPENROUTER_API_KEY: 'sk-or-v1-placeholder',
  OPENAI_API_KEY: 'sk-placeholder',
  REDIS_URL: 'redis://localhost:6379',
  WHATSAPP_TOKEN: 'EAA-test',
  PHONE_NUMBER_ID: '0000000000',
  WABA_ID: '1111111111',
  WEBHOOK_VERIFY_TOKEN: 'test-verify-token',
};

// Only TRUE load-time failures count — patterns Node prints at column 0 when
// the require chain itself fails. Runtime errors logged via structured logger
// (which prepend whitespace and emit JSON) do not match.
const LOAD_TIME_ERROR_RE =
  /^(SyntaxError|TypeError|ReferenceError|Cannot find module|Error \[ERR_)/m;

// CRON-style workers: they're expected to exit. A non-zero exit is acceptable
// when their dependencies are unreachable (the cron scheduler will retry on
// the next tick — same shape as Railway / Kubernetes restart policies).
const CRON_WORKERS = new Set([
  path.join(BOT_ROOT, 'workers', 'stale-session.worker.js'),
  // The Morning Brief worker is a one-shot cron: with no BRIEF_DATABASE_URL it reports
  // "nothing sent" and exits 1 so the scheduler can see the failed run — that is the
  // contract, not a boot failure.
  path.join(BOT_ROOT, 'workers', 'brief.worker.js'),
]);

function discoverWorkerEntries() {
  const list = [];
  const web = path.join(BOT_ROOT, 'whatsapp-bot.js');
  if (fs.existsSync(web)) list.push(web);
  const workersDir = path.join(BOT_ROOT, 'workers');
  if (fs.existsSync(workersDir)) {
    for (const f of fs.readdirSync(workersDir)) {
      if (f.endsWith('.js')) list.push(path.join(workersDir, f));
    }
  }
  return list;
}

function bootCheck(entry, timeoutMs = 2000) {
  return new Promise((resolve) => {
    let out = '';
    const child = spawn('node', [entry], {
      cwd: ROOT,
      env: { ...process.env, ...MINIMUM_ENV },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', (d) => { out += d.toString(); });
    child.stderr.on('data', (d) => { out += d.toString(); });
    const t = setTimeout(() => {
      try { child.kill('SIGTERM'); } catch { /* already dead */ }
      const errorLine = LOAD_TIME_ERROR_RE.test(out) ? out.match(LOAD_TIME_ERROR_RE)[0] : null;
      resolve({ status: errorLine ? 'fail' : 'pass', errorLine, code: null, out });
    }, timeoutMs);
    child.on('exit', (code) => {
      clearTimeout(t);
      const errorLine = LOAD_TIME_ERROR_RE.test(out) ? out.match(LOAD_TIME_ERROR_RE)[0] : null;
      // CRON workers may legitimately exit non-zero on missing deps; only
      // load-time errors fail them.
      const isCron = CRON_WORKERS.has(entry);
      const ok = isCron
        ? !errorLine
        : (code === 0 || code === null) && !errorLine;
      resolve({ status: ok ? 'pass' : 'fail', errorLine, code, out });
    });
  });
}

// Booting workers requires the bot's own node_modules. CI runs the root test
// suite BEFORE `cd bot && npm ci`, so on first-pass we skip the test
// gracefully — it runs after bot deps are installed.
const BOT_NODE_MODULES_PRESENT = fs.existsSync(path.join(BOT_ROOT, 'node_modules'));

describe('Worker-boot audit — every entry loads (forked)', () => {
  const entries = discoverWorkerEntries();

  if (!BOT_NODE_MODULES_PRESENT) {
    it.skip('SKIPPED — bot/node_modules absent (CI first-pass); run after `cd bot && npm ci`', () => {});
    return;
  }

  for (const entry of entries) {
    const rel = entry.replace(ROOT + '/', '');
    it(
      rel,
      async () => {
        const r = await bootCheck(entry, 2000);
        if (r.status !== 'pass') {
          throw new Error(
            `${rel} failed boot:\n  ${r.errorLine || 'exit code ' + r.code}\n  ` +
              `stderr/stdout tail:\n${r.out.split('\n').slice(-5).join('\n')}`
          );
        }
      },
      5000
    );
  }
});
