/**
 * The console must survive a deployment that cannot boot.
 *
 * bot/shared/config/supabase.js calls `process.exit(78)` AT REQUIRE TIME when
 * the database credentials are missing or wrong. bot/whatsapp-bot.js requires it
 * near the top, so a misconfigured bot never reaches `app.listen()` — and a
 * console that could only be reached through that app would be unavailable in
 * exactly the situation you would open it to fix.
 *
 * `rumi console` exists for that case, and it only works for as long as nothing
 * under bot/console/ pulls in a module that exits, or that freezes env at load.
 * That is easy to break by accident with one convenient `require`, and nothing
 * else in the suite would notice — so it is checked here.
 */

const fs = require('fs');
const path = require('path');

const CONSOLE_DIR = path.join(__dirname, '../../bot/console');

/** Modules that either exit the process or capture env at require time. */
const FORBIDDEN = [
  ['shared/config/supabase', 'calls process.exit(78) at require time when SUPABASE_* is unset'],
  ['shared/utils/constants', 'destructures ~50 env vars into module constants at require time'],
  ['shared/services/llm-client', 'captures LLM_PROVIDER/LLM_MODEL at load and caches a client'],
  ['shared/services/messaging', 'resolves and requires a channel driver at module scope'],
];

function jsFilesIn(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'views' || entry.name === 'assets') continue;
      out.push(...jsFilesIn(full));
    } else if (entry.name.endsWith('.js')) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Strip everything that is not executable at load: comments, and any require
 * that sits inside a function body (those are lazy and therefore fine).
 */
function topLevelRequires(source) {
  const withoutComments = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

  const requires = [];
  let depth = 0;
  for (const line of withoutComments.split('\n')) {
    if (depth === 0) {
      const match = line.match(/require\(['"]([^'"]+)['"]\)/);
      if (match) requires.push(match[1]);
    }
    depth += (line.match(/\{/g) || []).length;
    depth -= (line.match(/\}/g) || []).length;
    if (depth < 0) depth = 0;
  }
  return requires;
}

describe('bot/console never requires a boot-blocking module at load', () => {
  const files = jsFilesIn(CONSOLE_DIR);

  it('finds the console source to check', () => {
    expect(files.length).toBeGreaterThan(4);
  });

  it.each(files.map((f) => [path.relative(CONSOLE_DIR, f), f]))('%s', (_name, file) => {
    const requires = topLevelRequires(fs.readFileSync(file, 'utf8'));
    for (const [module, why] of FORBIDDEN) {
      const offender = requires.find((r) => r.replace(/^(\.\.\/)+/, '').startsWith(module));
      if (offender) {
        throw new Error(
          `${path.relative(CONSOLE_DIR, file)} requires "${offender}" at module scope.\n`
          + `That module ${why}, so the standalone console (\`rumi console\`) would die with the bot.\n`
          + 'Move the require inside the handler that needs it.',
        );
      }
    }
  });
});

describe('the modules the console leans on hardest have no dependencies at all', () => {
  // event-ring is called from logToFile, which runs in 180 files and in every
  // worker; feature-overrides is reached by `rumi doctor` on machines with no
  // database. Neither can afford an import.
  it.each([
    'bot/shared/observability/event-ring.js',
    'bot/shared/config/feature-overrides.js',
  ])('%s imports nothing', (rel) => {
    const src = fs.readFileSync(path.join(__dirname, '../..', rel), 'utf8');
    expect(topLevelRequires(src)).toEqual([]);
  });
});

describe('the standalone entry point behaves like the other rumi commands', () => {
  const server = fs.readFileSync(path.join(CONSOLE_DIR, 'server.js'), 'utf8');

  it('gates listen() behind require.main so importing it starts nothing', () => {
    expect(server).toMatch(/require\.main === module/);
  });

  it('sets RUMI_CLI before its first require, so console output stays human-readable', () => {
    const beforeFirstRequire = server.slice(0, server.indexOf('require('));
    expect(beforeFirstRequire).toMatch(/RUMI_CLI\s*=\s*'1'/);
  });

  it('defaults to binding loopback only', () => {
    expect(server).toMatch(/CONSOLE_BIND\s*\|\|\s*'127\.0\.0\.1'/);
  });
});
