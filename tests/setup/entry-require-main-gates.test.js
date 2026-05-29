/**
 * Entry-point require.main gates.
 *
 * Locks the architectural fix: every entry that has a top-level start call
 * (Express listen, worker.start, main()) gates it behind
 * `if (require.main === module) { … }` so the file can be required as a
 * library without side effects.
 *
 * The audit's α.4 worker-boot test (forked) catches gross failures; this
 * source-level test catches a regression where someone re-introduces an
 * un-gated top-level start call.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');

// The entries that had explicit top-level start calls before entry-gating.
// Adding the gate is a non-functional change at run-time (the executable
// `node X.js` behaviour is identical) but makes the file safe to require.
const GATED_ENTRIES = [
  'bot/whatsapp-bot.js',
  'bot/workers/sqs-worker.js',
  'bot/workers/stale-session.worker.js',
];

// The regex catches both:
//   if (require.main === module) { startServer(); }
//   if (require.main === module) { startServer(); }
// but does NOT match comments mentioning `require.main`. Strict — must be
// at column 0 or after whitespace.
const GATE_RE = /^[ \t]*if\s*\(\s*require\.main\s*===\s*module\s*\)/m;

describe('Entry-point require.main gates (entry-gating)', () => {
  for (const entry of GATED_ENTRIES) {
    it(`${entry} gates its top-level start behind require.main === module`, () => {
      const src = fs.readFileSync(path.join(ROOT, entry), 'utf8');
      expect(GATE_RE.test(src)).toBe(true);
    });
  }

  // Companion: the gated entries SHOULD also export their start function so
  // a test / downstream can invoke it explicitly when desired.
  it('every gated entry exports the start function', () => {
    const exportsByFile = {
      'bot/whatsapp-bot.js':           /module\.exports\s*=\s*\{[^}]*startServer/,
      'bot/workers/sqs-worker.js':     /module\.exports\s*=\s*\{[^}]*startWorker/,
      'bot/workers/stale-session.worker.js': /module\.exports\s*=\s*\{[^}]*main/,
    };
    const failures = [];
    for (const [entry, re] of Object.entries(exportsByFile)) {
      const src = fs.readFileSync(path.join(ROOT, entry), 'utf8');
      if (!re.test(src)) failures.push(entry);
    }
    expect(failures).toEqual([]);
  });
});
