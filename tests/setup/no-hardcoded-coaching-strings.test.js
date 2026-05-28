/**
 * Coaching i18n contract — no hardcoded English user-facing strings in the
 * pipeline's "new" coaching service files.
 *
 * Every system message the coaching pipeline sends to teachers must flow
 * through `bot/shared/config/coaching-messages.js` so a fork that operates
 * in Urdu / Sindhi / Pashto / Punjabi / Tamil-LK / Kiswahili / Spanish /
 * Arabic / Balochi can ship translations without hunting through eight
 * pipeline files.
 *
 * Detection: scan the actively-maintained coaching/ subdirectory for
 * `WhatsAppService.sendMessage(..., 'literal English string')`. The
 * legacy `coaching.service.js` monolith is allowlisted with an explicit
 * "to be removed in a follow-up cleanup" note — its strings duplicate
 * those already migrated to the catalog and the file is on its way out.
 *
 * Pragmatic regex: we flag a string-literal second argument to
 * `WhatsAppService.sendMessage(` only when it starts with a capital
 * letter or an emoji (the user-facing prose pattern). Variable-bound
 * strings (errorMessage, encouragingMessage, message) are NOT flagged
 * here — they're either composed elsewhere or come from the catalog
 * via a helper. Template literals containing `${...}` are checked
 * separately (any English prose template must also live in the catalog).
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const COACHING_DIR = path.join(ROOT, 'bot/shared/services/coaching');

// Files we deliberately do NOT scan in this guard.
// (Allowlist intent: empty by default. Add an entry only with a justifying
// comment + a follow-up bd to remove the entry.)
const ALLOWLIST = new Map([
  // Legacy monolith — every string here is duplicated in one of the
  // newer files (transcription-processor / analysis-processor /
  // report-generator / coaching-session / reflective-conversation /
  // lesson-plan-processor). The newer files are the path forward; the
  // monolith stays until the coaching-processor worker dispatches to
  // the split services directly. Tracked separately as follow-up.
  [path.join(ROOT, 'bot/shared/services/coaching.service.js'), 'legacy monolith, duplicate strings'],
]);

// Patterns for "user-facing English prose": starts with a capital letter or
// a leading emoji / step symbol. Excludes short tags like 'json', 'png', etc.
const PROSE_LEAD = /^[\s]*(?:[A-Z]|[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}🔄✅🎤📄🎯📊🙏])/u;

// Locate every `WhatsAppService.sendMessage(<args...>` call and, when
// the second arg is a literal (single/double/backtick quoted), check
// whether the literal is user-facing English prose.
//
// Implementation is regex-based but balanced enough for the call shapes
// the codebase uses (no nested calls with literal second args that
// aren't user-facing prose). The shipped code uses simple patterns:
//   sendMessage(from, "literal")
//   sendMessage(from, `template ${var}`)
// — both of which this regex catches.
const SEND_MESSAGE_RE = /WhatsAppService\.sendMessage\(\s*[a-zA-Z_$][\w$.]*\s*,\s*(["'`])([\s\S]*?)\1/g;

function findJsFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '__tests__' || e.name === '__mocks__') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...findJsFiles(full));
    else if (e.name.endsWith('.js')) out.push(full);
  }
  return out;
}

function scanFile(filePath) {
  const src = fs.readFileSync(filePath, 'utf-8');
  const offenders = [];
  let m;
  SEND_MESSAGE_RE.lastIndex = 0;
  while ((m = SEND_MESSAGE_RE.exec(src)) !== null) {
    const literal = m[2];
    if (!literal) continue;
    if (!PROSE_LEAD.test(literal)) continue;
    // Compute the 1-based line number of the match.
    const upTo = src.slice(0, m.index);
    const lineNumber = upTo.split('\n').length;
    const snippet = literal.length > 80 ? literal.slice(0, 77) + '...' : literal;
    offenders.push({ lineNumber, snippet });
  }
  return offenders;
}

describe('Coaching i18n — no hardcoded English sendMessage literals', () => {
  it('every coaching/ service routes user-facing prose through getCoachingMessage()', () => {
    const files = findJsFiles(COACHING_DIR);
    const violations = [];

    for (const filePath of files) {
      if (ALLOWLIST.has(filePath)) continue;
      const offenders = scanFile(filePath);
      for (const o of offenders) {
        const rel = path.relative(ROOT, filePath);
        violations.push(`${rel}:${o.lineNumber} — sendMessage("${o.snippet}")`);
      }
    }

    expect(violations).toEqual([]);
  });

  it('catalog covers every key used at call sites (no dangling lookups)', () => {
    const { COACHING_MESSAGES } = require('../../bot/shared/config/coaching-messages');
    const usedKeys = new Set();
    const KEY_RE = /getCoachingMessage\(\s*['"]([\w_]+)['"]/g;

    for (const filePath of findJsFiles(COACHING_DIR)) {
      const src = fs.readFileSync(filePath, 'utf-8');
      let m;
      while ((m = KEY_RE.exec(src)) !== null) usedKeys.add(m[1]);
    }

    const missing = [...usedKeys].filter((k) => !(k in COACHING_MESSAGES));
    expect(missing).toEqual([]);
  });

  it('every catalog entry carries all 10 supported language slots', () => {
    const { COACHING_MESSAGES, SUPPORTED_LANGUAGES } = require('../../bot/shared/config/coaching-messages');
    for (const [key, entry] of Object.entries(COACHING_MESSAGES)) {
      for (const code of SUPPORTED_LANGUAGES) {
        if (!(code in entry)) {
          throw new Error(`Coaching message "${key}" missing language slot: ${code}`);
        }
      }
    }
  });
});
