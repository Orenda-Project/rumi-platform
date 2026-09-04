/**
 * bin/rumi.js — the CLI dispatcher. Command handlers lazily require heavy
 * modules internally, so routing is tested by swapping COMMANDS entries for
 * spies (the module exports COMMANDS for exactly this) rather than mocking
 * the dynamically-computed require paths.
 */

const path = require('path');

function loadCli() {
  jest.resetModules();
  return require('../../bin/rumi.js');
}

const originalArgv = process.argv;
afterEach(() => {
  process.argv = originalArgv;
  process.exitCode = undefined;
  jest.restoreAllMocks();
});

describe('rumi CLI dispatcher', () => {
  it('exposes exactly the documented commands', () => {
    const { COMMANDS } = loadCli();
    expect(Object.keys(COMMANDS).sort()).toEqual(['brief', 'doctor', 'graduate', 'pair', 'setup', 'start', 'status']);
  });

  it('gives every command a one-line summary, since the help screen is built from them', () => {
    const { COMMANDS } = loadCli();
    for (const [name, command] of Object.entries(COMMANDS)) {
      expect(typeof command.summary).toBe('string');
      expect(command.summary.length).toBeGreaterThan(10);
      expect(typeof command.run).toBe('function');
      expect(command.summary).not.toContain(name.toUpperCase());
    }
  });

  it('routes "rumi setup" to COMMANDS.setup', async () => {
    const cli = loadCli();
    const spy = jest.fn().mockResolvedValue(undefined);
    cli.COMMANDS.setup.run = spy;
    process.argv = ['node', 'bin/rumi.js', 'setup'];

    await cli.main();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('routes "rumi graduate" to COMMANDS.graduate', async () => {
    const cli = loadCli();
    const spy = jest.fn().mockResolvedValue(undefined);
    cli.COMMANDS.graduate.run = spy;
    process.argv = ['node', 'bin/rumi.js', 'graduate'];

    await cli.main();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('prints usage and exits non-zero with no command', async () => {
    const cli = loadCli();
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    process.argv = ['node', 'bin/rumi.js'];

    await cli.main();

    const printed = logSpy.mock.calls.join('\n');
    expect(printed).toMatch(/Usage/);
    expect(printed).toMatch(/rumi <command>/);
    expect(process.exitCode).toBe(1);
  });

  it('points a newcomer at `rumi setup` from the help screen', async () => {
    const cli = loadCli();
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    process.argv = ['node', 'bin/rumi.js', '--help'];

    await cli.main();

    expect(logSpy.mock.calls.join('\n')).toMatch(/New here\? Run `rumi setup`/);
  });

  it('reports its version', async () => {
    const cli = loadCli();
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    process.argv = ['node', 'bin/rumi.js', '--version'];

    await cli.main();

    expect(logSpy.mock.calls.join('\n')).toMatch(/^rumi \d+\.\d+/m);
    expect(process.exitCode).toBeUndefined();
  });

  it('prints usage and exits zero for --help', async () => {
    const cli = loadCli();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    process.argv = ['node', 'bin/rumi.js', '--help'];

    await cli.main();
    expect(process.exitCode).toBe(0);
  });

  it('reports an unknown command clearly and exits non-zero', async () => {
    const cli = loadCli();
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    process.argv = ['node', 'bin/rumi.js', 'bogus'];

    await cli.main();

    expect(logSpy.mock.calls.join('\n')).toMatch(/Unknown command: "bogus"/);
    expect(process.exitCode).toBe(1);
  });
});

describe('rumi brief', () => {
  it('is documented as rendering the brief, with --send as the delivery step', () => {
    const { COMMANDS } = loadCli();
    expect(COMMANDS.brief.summary).toBe("Render this morning's brief (add --send to deliver it)");
  });

  it('routes "rumi brief" to COMMANDS.brief', async () => {
    const cli = loadCli();
    const spy = jest.fn().mockResolvedValue(undefined);
    cli.COMMANDS.brief.run = spy;
    process.argv = ['node', 'bin/rumi.js', 'brief', '--send'];

    await cli.main();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('lists --weekly, --send and --dry-run on the help screen', async () => {
    const cli = loadCli();
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    process.argv = ['node', 'bin/rumi.js', '--help'];

    await cli.main();

    const printed = logSpy.mock.calls.join('\n');
    expect(printed).toMatch(/--weekly/);
    expect(printed).toMatch(/--send/);
    expect(printed).toMatch(/--dry-run/);
  });

  it('parses its flags: --weekly picks the weekly brief, --send delivers, --dry-run rehearses', () => {
    const { parseBriefFlags } = loadCli();
    expect(parseBriefFlags([])).toEqual({ kind: 'daily', send: false, dryRun: false });
    expect(parseBriefFlags(['--weekly', '--send', '--dry-run'])).toEqual({ kind: 'weekly', send: true, dryRun: true });
  });

  it('runs the same render step as the worker, then sends only when asked', async () => {
    const cli = loadCli();
    const runner = jest.fn().mockResolvedValue(0);
    const send = jest.fn().mockResolvedValue({ sent: ['a'], skipped: [], failed: [] });
    const log = jest.fn();

    await cli.runBrief(['--weekly'], { runner, send, log, env: {} });
    expect(runner).toHaveBeenCalledWith('python3', ['brief/cli.py', 'render', '--kind', 'weekly'], expect.any(Object));
    expect(send).not.toHaveBeenCalled();
    expect(log.mock.calls.flat().join('\n')).toMatch(/latest[\/\\]weekly/);

    await cli.runBrief(['--send', '--dry-run'], { runner, send, log, env: { BRIEF_RECIPIENTS: 'a' } });
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ dryRun: true, recipients: ['a'] }));
  });

  it('a failed render sets a non-zero exit code and skips sending', async () => {
    const cli = loadCli();
    const runner = jest.fn().mockResolvedValue(1);
    const send = jest.fn();
    await cli.runBrief(['--send'], { runner, send, log: () => {}, env: { BRIEF_RECIPIENTS: 'a' } });
    expect(send).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });
});

describe('rumi start', () => {
  it('runs the bot from the repo root, whatever directory rumi was called from', () => {
    // `cd bot && npm start` ran the bot with bot/ as its working directory,
    // where a relative .env and a relative CHANNEL_STATE_DIR both resolved
    // somewhere else: the bot aborted on "Missing REQUIRED env var(s)" for a
    // fully-configured deployment, and once past that it paired a *second*
    // WhatsApp device and re-synced endlessly. This command exists to make the
    // launch directory irrelevant.
    const src = require('fs').readFileSync(path.resolve(__dirname, '../../bin/rumi.js'), 'utf-8');
    expect(src).toMatch(/cwd: REPO_ROOT/);
    expect(src).toMatch(/whatsapp-bot\.js/);
  });

  it('forwards signals to the bot, so stopping rumi stops the bot', () => {
    // Killing the launcher alone orphaned the bot, which kept the WhatsApp
    // session lock. The next `rumi start` then refused to attach — correctly,
    // but blaming a pid with no visible owner.
    const src = require('fs').readFileSync(path.resolve(__dirname, '../../bin/rumi.js'), 'utf-8');
    expect(src).toMatch(/process\.on\('SIGINT'/);
    expect(src).toMatch(/process\.on\('SIGTERM'/);
    expect(src).toMatch(/child\.kill\(signal\)/);
  });

  it('does not pass RUMI_CLI down to the bot, which wants its structured logging', () => {
    const src = require('fs').readFileSync(path.resolve(__dirname, '../../bin/rumi.js'), 'utf-8');
    expect(src).toMatch(/filter\(\(\[k\]\) => k !== 'RUMI_CLI'\)/);
  });
});

describe('rumi doctor — dotenv resolution (regression)', () => {
  // Real-world discovery from a live `rumi doctor` run: bin/rumi.js sits at
  // the repo root, but dotenv is only a dependency of bot/package.json (not
  // the root package.json). A bare require('dotenv') from bin/rumi.js threw
  // MODULE_NOT_FOUND, silently swallowed by a try/catch — .env never loaded,
  // and every required var reported "missing" even with a fully-configured
  // .env. The fix resolves dotenv via bot/node_modules explicitly, the same
  // place every bot/scripts/setup/*.js file already loads it from.
  it('resolves dotenv via bot/node_modules, not by a bare require', () => {
    // The bug: bin/rumi.js sits at the repo root, but dotenv is a dependency of
    // bot/package.json only — so a bare require('dotenv') there threw
    // MODULE_NOT_FOUND, was swallowed by a try/catch, and .env silently never
    // loaded (every required var reported "missing" on a configured deployment).
    //
    // Asserted against the SOURCE rather than by calling require('dotenv') here:
    // tests/jest.config.js maps '^dotenv$' to a mock, so inside Jest a bare
    // require always succeeds and could never reproduce the real failure.
    const src = require('fs').readFileSync(path.resolve(__dirname, '../../bin/rumi.js'), 'utf-8');
    expect(src).toMatch(/BOT_DIR/);
    expect(src).toMatch(/require\(path\.join\(BOT_DIR, 'node_modules', 'dotenv'\)\)/);

    // And loaded from the REPO's .env, not the working directory's — run from
    // bot/, a bare config() loaded nothing and every command reported a
    // configured deployment as "not configured".
    expect(src).toMatch(/config\(\{ path: path\.join\(REPO_ROOT, '\.env'\)/);

    // Comment lines are stripped first — the file explains the bug in prose that
    // legitimately contains the bad form.
    const code = src.split('\n').filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n');
    expect(code).not.toMatch(/require\('dotenv'\)/);
  });

  it('dotenv is declared as a bot dependency — what makes that path resolvable', () => {
    // The contract, checkable without an install: bin/rumi.js resolves dotenv
    // out of bot/node_modules, which only works because bot/package.json owns
    // it. CI runs the root suite BEFORE `cd bot && npm ci`, so asserting the
    // installed file exists would fail there for reasons unrelated to the bug
    // this protects.
    const botPkg = JSON.parse(require('fs').readFileSync(
      path.resolve(__dirname, '../../bot/package.json'), 'utf-8',
    ));
    expect(botPkg.dependencies.dotenv).toBeDefined();

    const rootPkg = JSON.parse(require('fs').readFileSync(
      path.resolve(__dirname, '../../package.json'), 'utf-8',
    ));
    // And the root does NOT have it — the whole reason the explicit path exists.
    expect((rootPkg.dependencies || {}).dotenv).toBeUndefined();
  });

  const botDepsInstalled = require('fs').existsSync(path.resolve(__dirname, '../../bot/node_modules'));
  const whenInstalled = botDepsInstalled ? it : it.skip;
  whenInstalled('bot/node_modules/dotenv is really there once bot deps are installed', () => {
    const pkg = path.resolve(__dirname, '../../bot/node_modules/dotenv/package.json');
    expect(require('fs').existsSync(pkg)).toBe(true);
  });
});
