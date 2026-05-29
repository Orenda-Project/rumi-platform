/**
 * No-undefined-WhatsAppService-methods conformance.
 *
 * A call to `WhatsAppService.<x>(...)` where `<x>` was never defined on the
 * class throws `TypeError: WhatsAppService.<x> is not a function` the first
 * time that branch runs. Depending on the surrounding try/catch the user sees
 * a crash or silence — either way the feature is dead. This is the exact bug
 * class that left the exam-checker's `sendFlowMessage` silently broken, and
 * (per the audit that produced bd-1881) left voice name-capture, voice
 * attendance, the coaching commitment card, and the out-of-window quiz invite
 * dead too.
 *
 * This guard locks the contract: every `WhatsAppService.<method>(` call site
 * in shipped bot source must name a real static member of the class.
 *
 * Method names are parsed off bot/shared/services/whatsapp.service.js:
 *   - static methods:  ^\s*static\s+(?:async\s+)?(\w+)\s*\(
 *   - static fields:   ^\s*static\s+(\w+)\s*=
 *
 * Scope is SOURCE only. Test files, __tests__ dirs, and the __mocks__ manual
 * mock legitimately reference mock-only members (markAsRead, sendVoiceMessage,
 * ...). The contract we lock is that PRODUCTION code only calls real members —
 * matching how source-hygiene and the other ratchets scope. Files whose names
 * end in .test.js, and anything under tests/ / __tests__/ / __mocks__/, are
 * skipped.
 *
 * Allowlist is empty by design.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const SERVICE = path.join(ROOT, 'bot/shared/services/whatsapp.service.js');
const SCAN_ROOT = path.join(ROOT, 'bot');

// Directories that legitimately reference mock-only or not-yet-real members.
const SKIP_DIRS = new Set(['node_modules', '__tests__', '__mocks__', 'tests', 'coverage', '.git']);

// Call sites allowed to name a non-member. Empty by design — a real undefined
// call is a bug to fix, not to allowlist.
const ALLOWLIST = new Set([
  // None.
]);

function parseMembers(src) {
  const members = new Set();
  const methodRe = /^\s*static\s+(?:async\s+)?(\w+)\s*\(/gm;
  const fieldRe = /^\s*static\s+(\w+)\s*=/gm;
  let m;
  while ((m = methodRe.exec(src))) members.add(m[1]);
  while ((m = fieldRe.exec(src))) members.add(m[1]);
  return members;
}

function findSourceJsFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      out.push(...findSourceJsFiles(path.join(dir, e.name)));
    } else if (e.name.endsWith('.js') && !e.name.endsWith('.test.js')) {
      out.push(path.join(dir, e.name));
    }
  }
  return out;
}

describe('No undefined WhatsAppService methods', () => {
  const members = parseMembers(fs.readFileSync(SERVICE, 'utf-8'));

  it('parser found the real service members (not vacuously passing)', () => {
    // If the parser regex breaks, members is empty and every call looks valid.
    expect(members.has('sendMessage')).toBe(true);
    expect(members.has('sendFlow')).toBe(true);
  });

  it('every WhatsAppService.<method>( call in bot source names a real member', () => {
    const callRe = /WhatsAppService\.(\w+)\s*\(/g;
    const offenders = [];
    const files = findSourceJsFiles(SCAN_ROOT).filter((f) => f !== SERVICE);

    for (const filePath of files) {
      const rel = path.relative(ROOT, filePath);
      if (ALLOWLIST.has(rel)) continue;
      const txt = fs.readFileSync(filePath, 'utf-8');
      let c;
      while ((c = callRe.exec(txt))) {
        const name = c[1];
        if (!members.has(name)) {
          const line = txt.slice(0, c.index).split('\n').length;
          offenders.push(
            `${rel}:${line} — WhatsAppService.${name}() is not a static member of `
            + 'WhatsAppService. Add the method, or fix the call.'
          );
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
