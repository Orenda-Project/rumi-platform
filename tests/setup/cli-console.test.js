/**
 * The `rumi` commands must keep a real console.
 *
 * `bot/shared/utils/structured-logger.js` replaces `console.*` with JSON logging
 * the moment it is imported — correct for the bot server, ruinous for a terminal
 * conversation. And it is not opt-in: the WhatsApp connection module reaches it
 * through `logToFile`, so any command that touches WhatsApp inherits it.
 *
 * The sharpest consequence is the QR code. `qrcode-terminal` renders it with
 * `console.log`, so with the override in place the code arrives as one JSON
 * record with `\n` escapes in it — present, plausible-looking in a log, and
 * completely unscannable. Pairing then depends on how the log formatter happens
 * to be configured, which is not a thing pairing should depend on.
 *
 * So: every CLI entry point sets `RUMI_CLI=1` before its first require, and the
 * logger honours it. Both halves are checked here, because either one alone is
 * silently useless.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');

const ENTRY_POINTS = [
  'bin/rumi.js',
  'bot/scripts/setup/interactive-setup.js',
  'bot/scripts/setup/baileys-pair.js',
  'bot/scripts/setup/status.js',
  'bot/scripts/setup/graduate.js',
];

/** Loads structured-logger in isolation and reports whether it took the console. */
function consoleAfterLoading({ asCli }) {
  const saved = {
    log: console.log, error: console.error, warn: console.warn, info: console.info, debug: console.debug,
  };
  const previousFlag = process.env.RUMI_CLI;
  jest.resetModules();
  if (asCli) process.env.RUMI_CLI = '1';
  else delete process.env.RUMI_CLI;

  try {
    require('../../bot/shared/utils/structured-logger');
    return { hijacked: console.log !== saved.log };
  } finally {
    Object.assign(console, saved);
    if (previousFlag === undefined) delete process.env.RUMI_CLI;
    else process.env.RUMI_CLI = previousFlag;
    jest.resetModules();
  }
}

describe('every CLI entry point claims a human console', () => {
  it.each(ENTRY_POINTS)('%s sets RUMI_CLI before its first require', (file) => {
    const source = fs.readFileSync(path.join(ROOT, file), 'utf-8');

    const flagAt = source.indexOf("process.env.RUMI_CLI = '1'");
    expect(flagAt).toBeGreaterThan(-1);

    // Order is the whole point: the override runs at import time, so a flag set
    // after the first require is a flag set too late.
    const firstRequire = source.search(/^\s*(const|let|var)\s.*require\(/m);
    expect(firstRequire).toBeGreaterThan(flagAt);
  });
});

describe('structured-logger honours it', () => {
  it('takes over console.* by default — the bot server still gets JSON', () => {
    expect(consoleAfterLoading({ asCli: false }).hijacked).toBe(true);
  });

  it('leaves console.* alone for a CLI command', () => {
    expect(consoleAfterLoading({ asCli: true }).hijacked).toBe(false);
  });
});

describe('logToFile', () => {
  const withCliFlag = (fn) => {
    const previous = process.env.RUMI_CLI;
    process.env.RUMI_CLI = '1';
    try { return fn(); } finally {
      if (previous === undefined) delete process.env.RUMI_CLI;
      else process.env.RUMI_CLI = previous;
    }
  };

  it('does not echo internal diagnostics onto a CLI\'s screen', () => {
    jest.resetModules();
    const { logToFile } = require('../../bot/shared/utils/logger');
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    withCliFlag(() => logToFile('Baileys: connection closed for shutdown', { flushMs: 500 }));

    expect(logSpy).not.toHaveBeenCalled();
    logSpy.mockRestore();
  });

  it('still writes the line to the log file — nothing is lost, only relocated', () => {
    jest.resetModules();
    const { logToFile, LOGS_DIR } = require('../../bot/shared/utils/logger');
    const logFile = path.join(LOGS_DIR, `bot-${new Date().toISOString().split('T')[0]}.log`);
    const before = fs.existsSync(logFile) ? fs.statSync(logFile).size : 0;

    withCliFlag(() => logToFile('a marker line written during the cli-console test'));

    expect(fs.statSync(logFile).size).toBeGreaterThan(before);
  });

  it('still echoes to console for the bot server', () => {
    jest.resetModules();
    const previous = process.env.RUMI_CLI;
    delete process.env.RUMI_CLI;
    const { logToFile } = require('../../bot/shared/utils/logger');
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    try {
      logToFile('a server-side line');
      expect(logSpy).toHaveBeenCalled();
    } finally {
      logSpy.mockRestore();
      if (previous !== undefined) process.env.RUMI_CLI = previous;
    }
  });
});

describe('the QR code, which is what all of this is protecting', () => {
  // Reading a third-party library's source needs bot/node_modules, and CI runs
  // the root suite BEFORE `cd bot && npm ci` (see tests/setup/worker-boot.test.js
  // for the same pattern). Skipped, not silently passed, when absent.
  const QR_MAIN = path.join(ROOT, 'bot/node_modules/qrcode-terminal/lib/main.js');
  const whenInstalled = fs.existsSync(QR_MAIN) ? it : it.skip;

  whenInstalled('is rendered through console.log — hence the whole arrangement above', () => {
    // Asserted against the library so this test's premise cannot go stale
    // silently: if qrcode-terminal ever switched to process.stdout.write, the
    // console override would stop mattering for pairing and this file could go.
    expect(fs.readFileSync(QR_MAIN, 'utf-8')).toMatch(/console\.log\(output\)/);
  });

  it('survives a multi-line write with its newlines intact under RUMI_CLI', () => {
    const previous = process.env.RUMI_CLI;
    process.env.RUMI_CLI = '1';
    jest.resetModules();
    const saved = console.log;
    const written = [];
    try {
      require('../../bot/shared/utils/structured-logger');
      console.log = (...args) => written.push(args.join(' '));
      console.log('▄▄▄▄▄\n█ ▄ █\n▄▄▄▄▄');
      // A scannable code needs real line breaks. JSON-encoded it would arrive
      // as one line containing a literal backslash-n.
      expect(written[0].split('\n')).toHaveLength(3);
      expect(written[0]).not.toContain('\\n');
    } finally {
      console.log = saved;
      if (previous === undefined) delete process.env.RUMI_CLI;
      else process.env.RUMI_CLI = previous;
      jest.resetModules();
    }
  });
});

describe('Baileys own logger is silenced for an interactive command', () => {
  // Its default logger writes the whole handshake at info level as raw JSON.
  // In a live `rumi pair` that put ~15 lines of it immediately above and below
  // the QR code — the one thing on screen the user actually had to use.
  const connectionSource = fs.readFileSync(
    path.join(ROOT, 'bot/shared/services/messaging/baileys-connection.js'), 'utf-8',
  );

  it('sets the logger key only for a CLI — never as an explicit undefined', () => {
    // `logger: isCli ? quiet : undefined` reads as a no-op for the server but is
    // not: Baileys merges config over its defaults, so an explicit undefined
    // overwrites its default logger and the next `logger.child()` call throws.
    // That took the bot's whole WhatsApp connection down while every other
    // service reported healthy — asserted here on the shape that caused it.
    // Comments stripped first: the file explains this bug in prose that
    // legitimately contains the bad form.
    const code = connectionSource.split('\n')
      .filter((line) => !line.trim().startsWith('//') && !line.trim().startsWith('*'))
      .join('\n');
    expect(code).not.toMatch(/logger:[^\n]*undefined/);
    expect(code).toMatch(/if \(process\.env\.RUMI_CLI === '1'\) socketConfig\.logger = quietBaileysLogger\(\)/);
  });

  it('the quiet logger has the shape Baileys expects, and swallows everything', () => {
    const { quietBaileysLogger } = require('../../bot/shared/services/messaging/baileys-connection');
    const logger = quietBaileysLogger();

    // Baileys calls .child() and every level on whatever it is given; a stub
    // missing one of them takes pairing down with it.
    for (const method of ['fatal', 'error', 'warn', 'info', 'debug', 'trace']) {
      expect(typeof logger[method]).toBe('function');
      expect(() => logger[method]({ a: 1 }, 'msg')).not.toThrow();
    }
    expect(typeof logger.child).toBe('function');
    expect(typeof logger.child({ class: 'baileys' }).info).toBe('function');
  });

  it('does not print the Axiom "logging disabled" warning to a CLI', () => {
    const source = fs.readFileSync(path.join(ROOT, 'bot/shared/utils/structured-logger.js'), 'utf-8');
    expect(source).toMatch(/else if \(process\.env\.RUMI_CLI !== '1'\)/);
  });
});
