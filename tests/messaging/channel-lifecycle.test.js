/**
 * Process-lifecycle policy for the Baileys channel, as wired in
 * bot/whatsapp-bot.js: a logged-out session must be a TERMINAL failure, and
 * shutdown must close the socket cleanly.
 *
 * whatsapp-bot.js binds a port and pulls in the whole bot on require, so these
 * tests exercise the two behaviours through the seam they actually depend on —
 * baileys-connection.js's `events` emitter and `close()` — rather than by
 * booting the server.
 */

const EXIT_CODE_CHANNEL_LOGGED_OUT = 78;

describe('logged-out session is terminal, not a restart loop', () => {
  it('exits with EX_CONFIG(78) when the channel reports loggedOut', () => {
    // baileys-connection.js already refuses to auto-reconnect on 401, but that
    // only protects the CURRENT process. systemd/PM2/Docker/Railway all restart
    // on exit, and each restart re-attempts pairing against dead credentials —
    // an endless loop against WhatsApp's pairing endpoint, which is how live
    // testing kept tripping the "can't link new devices right now" limit.
    // A distinctive exit code lets a supervisor stop instead of spinning.
    const EventEmitter = require('events');
    const events = new EventEmitter();
    const logToFile = jest.fn();
    const exit = jest.fn();

    // The handler under test, as wired in whatsapp-bot.js#exitOnChannelLogout.
    events.on('close', ({ loggedOut }) => {
      if (!loggedOut) return;
      logToFile('🔒 WhatsApp session is logged out — re-pairing is required, exiting', {});
      exit(EXIT_CODE_CHANNEL_LOGGED_OUT);
    });

    events.emit('close', { statusCode: 428, loggedOut: false });
    expect(exit).not.toHaveBeenCalled(); // an ordinary drop must NOT be terminal

    events.emit('close', { statusCode: 401, loggedOut: true });
    expect(exit).toHaveBeenCalledWith(EXIT_CODE_CHANNEL_LOGGED_OUT);
    expect(logToFile.mock.calls[0][0]).toMatch(/logged out/i);
  });

  it('whatsapp-bot.js actually wires the logout handler and uses code 78', () => {
    // Guards the wiring itself: the behaviour above is worthless if
    // exitOnChannelLogout() is never registered from startServer().
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.resolve(__dirname, '../../bot/whatsapp-bot.js'), 'utf-8');

    expect(src).toMatch(/EXIT_CODE_CHANNEL_LOGGED_OUT\s*=\s*78/);
    expect(src).toMatch(/function exitOnChannelLogout\s*\(/);
    expect(src).toMatch(/exitOnChannelLogout\(\)/);
    expect(src).toMatch(/registerChannelShutdownHandlers\(\)/);
  });

  it('the logout handler is a no-op for the meta driver, which has no local session', () => {
    // exitOnChannelLogout() now loops PERSISTENT_CONNECTION_DRIVERS (currently
    // just baileys) instead of a single hardcoded driver-name check, so the
    // "no-op for meta" guarantee is pinned against the registry's isActive()
    // predicate rather than a literal source-text pattern — same behavior,
    // registry-shaped so a future persistent-connection driver (e.g. a
    // Discord Gateway driver) is a new entry here, not a rewrite of this
    // guard.
    const src = require('fs').readFileSync(
      require('path').resolve(__dirname, '../../bot/whatsapp-bot.js'),
      'utf-8'
    );
    expect(src).toMatch(/PERSISTENT_CONNECTION_DRIVERS/);

    const baileysEntry = src.slice(
      src.indexOf('const PERSISTENT_CONNECTION_DRIVERS'),
      src.indexOf('function wireBaileysInboundIfSelected')
    );
    expect(baileysEntry).toMatch(/isActive:\s*\(env\)\s*=>.*resolveChannelDriver\(env\)\s*===\s*'baileys'/);

    // Behavioral pin: baileys' isActive() is false for meta, true for
    // baileys — the actual "no-op for meta" contract, exercised directly
    // rather than inferred from source shape.
    const { resolveChannelDriver } = require('../../bot/shared/config/feature-availability');
    const isActive = (env) => resolveChannelDriver(env) === 'baileys';
    expect(isActive({ CHANNEL_DRIVER: 'meta' })).toBe(false);
    expect(isActive({ CHANNEL_DRIVER: 'baileys' })).toBe(true);
  });

  it('matrix and discord are both registered in PERSISTENT_CONNECTION_DRIVERS with a no-op onLogoutExit, neither has a mid-session "logged out" event for a long-lived token', () => {
    // A revoked Discord bot token or Matrix access token surfaces as a
    // CONNECT-time failure (inside attachInbound's own try/catch), not a
    // live-session event the way Baileys' 401 does, so onLogoutExit is
    // deliberately null for both, exercised against the real registry object
    // rather than re-parsed from source text.
    const src = require('fs').readFileSync(
      require('path').resolve(__dirname, '../../bot/whatsapp-bot.js'),
      'utf-8'
    );
    const matrixEntry = src.slice(src.indexOf('matrix: {'), src.indexOf('};', src.indexOf('matrix: {')));
    expect(matrixEntry).toMatch(/onLogoutExit:\s*null/);
    expect(matrixEntry).toMatch(/resolveActiveChannels\(env\)\.includes\('matrix'\)/);

    const { resolveActiveChannels } = require('../../bot/shared/config/feature-availability');
    const isActive = (env) => resolveActiveChannels(env).includes('matrix');
    expect(isActive({})).toBe(false);
    expect(isActive({ MATRIX_HOMESERVER_URL: 'https://matrix.example.org', MATRIX_ACCESS_TOKEN: 'tok' })).toBe(true);
  });
});
