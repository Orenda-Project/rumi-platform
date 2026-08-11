/**
 * Conformance guard: every `redisService.<method>(` call in the bot must refer
 * to a method railway-redis.service.js actually exports.
 *
 * Same shape, and the same motivation, as no-undefined-whatsapp-methods.test.js.
 * This bug class keeps shipping because the call sites are wrapped in try/catch
 * "for resilience", so a missing method looks like a transient Redis problem
 * instead of a typo:
 *
 *  - `redisService.setexWithCeiling(...)` was called from 10+ places across the
 *    whole quiz subsystem (session, delivery, follow-up) and did not exist, so
 *    NO quiz could be delivered on any deployment — picking a class after /quiz
 *    just said "Sorry, something went wrong."
 *  - `redisService.getClient()` was called three times by the exam checker and
 *    did not exist, so its cache silently never worked.
 *
 * Both were found by running the bot, not by reading it. This test finds the next
 * one at CI time.
 */

const fs = require('fs');
const path = require('path');

const BOT_DIR = path.resolve(__dirname, '../../bot');
const SERVICE_PATH = path.join(BOT_DIR, 'shared/services/cache/railway-redis.service.js');

/** Directories walked for call sites. */
const SEARCH_DIRS = ['shared', 'workers', 'scripts'].map((d) => path.join(BOT_DIR, d));

function listJsFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '__mocks__') continue;
      out.push(...listJsFiles(full));
    } else if (entry.name.endsWith('.js')) {
      out.push(full);
    }
  }
  return out;
}

/** Method names declared on the service class (`async name(` / `name(`). */
function declaredMethods(src) {
  const names = new Set();
  const re = /^\s{2}(?:static\s+)?(?:async\s+)?([a-zA-Z_$][\w$]*)\s*\(/gm;
  let m;
  while ((m = re.exec(src))) names.add(m[1]);
  names.delete('constructor');
  names.delete('if');
  names.delete('for');
  names.delete('while');
  names.delete('catch');
  names.delete('switch');
  names.delete('return');
  return names;
}

/** Non-method members assigned in the constructor (e.g. `this.redis = …`). */
function declaredProperties(src) {
  const names = new Set();
  const re = /this\.([a-zA-Z_$][\w$]*)\s*=/g;
  let m;
  while ((m = re.exec(src))) names.add(m[1]);
  return names;
}

const serviceSource = fs.readFileSync(SERVICE_PATH, 'utf-8');
const METHODS = declaredMethods(serviceSource);
const PROPERTIES = declaredProperties(serviceSource);

describe('railway-redis.service surface', () => {
  it('exports a single instance whose methods this test can enumerate', () => {
    expect(serviceSource).toMatch(/module\.exports\s*=\s*new RailwayRedisService\(\)/);
    // sanity: the well-known ones are found by the parser
    for (const name of ['get', 'set', 'setex', 'delete', 'isAvailable']) {
      expect(METHODS).toContain(name);
    }
  });

  it('implements setexWithCeiling, which the entire quiz subsystem depends on', () => {
    expect(METHODS).toContain('setexWithCeiling');
  });

  it('implements setNX, which every inbound image depends on', () => {
    expect(METHODS).toContain('setNX');
  });
});

describe('every redisService.<method>() call resolves to a real method', () => {
  const files = SEARCH_DIRS.flatMap(listJsFiles);

  it('finds call sites to check (guards against a silently empty sweep)', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it('has no call to a method or property that does not exist', () => {
    // Comments are stripped first: these files legitimately DESCRIBE the wrong
    // calls in prose ("previously called redisService.getClient()"), and a guard
    // that flagged its own explanation would be unfixable.
    const stripComments = (src) => src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .map((line) => (/^\s*(\/\/|\*)/.test(line) ? '' : line))
      .join('\n');

    // Matches redisService.foo( and redisService.foo. — the alias forms used in
    // the codebase are `redisService` and `redis` (the latter is often the raw
    // ioredis client, so only the explicit service name is checked here).
    const callRe = /\bredisService\s*\.\s*([a-zA-Z_$][\w$]*)/g;
    const violations = [];

    for (const file of files) {
      const src = stripComments(fs.readFileSync(file, 'utf-8'));
      let m;
      while ((m = callRe.exec(src))) {
        const member = m[1];
        if (METHODS.has(member) || PROPERTIES.has(member)) continue;
        const line = src.slice(0, m.index).split('\n').length;
        violations.push(`${path.relative(BOT_DIR, file)}:${line} → redisService.${member}`);
      }
    }

    expect(violations).toEqual([]);
  });
});
