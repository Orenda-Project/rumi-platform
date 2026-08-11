/**
 * baileys-connection.js — the persistent-socket manager.
 *
 * `baileys` is pure ESM (real callers load it via ./baileys-lib.js's dynamic
 * import() — see that file). Jest's config here can't execute a real dynamic
 * import (tests/jest.config.js sets experimentalVmModules: false), so tests
 * mock baileys-lib.js's loadBaileys() directly instead of the `baileys`
 * package itself — the real import() statement is then never reached.
 * `qrcode-terminal` is a normal CJS package and is virtually mocked as usual.
 * A real socket/QR/network call must never happen from a unit test regardless.
 *
 * getSocket() now resolves ONLY once the connection reaches "open" (a real
 * bug this fixes — see baileys-connection.js's connect() doc comment), so
 * every test that needs a resolved socket must simulate `open` WHILE the
 * promise is still pending, not after awaiting it (that would deadlock).
 * connectAndOpen() below is the shared helper for that.
 */

function mockBaileysPackage({ qr } = {}) {
  const sockEventHandlers = {};
  const sock = {
    ev: {
      on: jest.fn((event, handler) => { sockEventHandlers[event] = handler; }),
    },
    sendMessage: jest.fn(),
    sendPresenceUpdate: jest.fn(),
  };

  const saveCreds = jest.fn();
  const makeWASocket = jest.fn(() => sock);
  const useMultiFileAuthState = jest.fn().mockResolvedValue({ state: {}, saveCreds });
  const fetchLatestBaileysVersion = jest.fn().mockResolvedValue({ version: [2, 3000, 0], isLatest: true });
  const DisconnectReason = { loggedOut: 401 };

  jest.doMock('../../bot/shared/services/messaging/baileys-lib', () => ({
    loadBaileys: jest.fn().mockResolvedValue({
      makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason,
    }),
  }));
  jest.doMock('qrcode-terminal', () => ({ generate: jest.fn() }), { virtual: true });
  jest.doMock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));

  return {
    sock, sockEventHandlers, saveCreds, makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion,
  };
}

/** Flushes microtask ticks until sockEventHandlers[event] has been registered by connect(). */
async function waitForHandler(sockEventHandlers, event = 'connection.update') {
  for (let i = 0; i < 20 && !sockEventHandlers[event]; i += 1) await Promise.resolve();
  if (!sockEventHandlers[event]) throw new Error(`${event} handler was never registered`);
}

/** Calls getSocket(), waits for connect() to register its listener, then simulates a clean "open". */
async function connectAndOpen(conn, sockEventHandlers, opts) {
  const socketPromise = conn.getSocket(opts);
  await waitForHandler(sockEventHandlers);
  sockEventHandlers['connection.update']({ connection: 'open' });
  return socketPromise;
}

// Every test gets a FRESH, EMPTY channel-state dir. Without this, authDir()
// falls back to the repo's real `.channel-state/`, so tests behaved differently
// depending on whether the developer happened to have a live paired session on
// disk — which is how two of them started failing the moment connect() began
// distinguishing "no credentials yet" from "credentials were invalidated".
beforeEach(() => {
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  process.env.CHANNEL_STATE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rumi-chan-empty-'));
});

afterEach(() => {
  jest.resetModules();
  // Repo-anchored, matching authDir() — cwd-relative cleanup would miss the
  // folder connect() actually created for its instance lock.
  const relativeStateDir = require('path').resolve(__dirname, '../..', '.test-channel-state');
  require('fs').rmSync(relativeStateDir, { recursive: true, force: true });
  delete process.env.CHANNEL_STATE_DIR;
});

describe('baileys-connection', () => {
  it('connects lazily: requiring the module does not call makeWASocket', () => {
    jest.resetModules();
    const { makeWASocket } = mockBaileysPackage();
    require('../../bot/shared/services/messaging/baileys-connection');
    expect(makeWASocket).not.toHaveBeenCalled();
  });

  it('getSocket() resolves only once "open" fires — not as soon as makeWASocket() returns', async () => {
    jest.resetModules();
    const { makeWASocket, sockEventHandlers } = mockBaileysPackage();
    const conn = require('../../bot/shared/services/messaging/baileys-connection');

    let resolved = false;
    const socketPromise = conn.getSocket().then((sock) => { resolved = true; return sock; });
    await waitForHandler(sockEventHandlers);
    expect(makeWASocket).toHaveBeenCalledTimes(1);
    expect(resolved).toBe(false); // socket shell exists, but not yet "open"

    sockEventHandlers['connection.update']({ connection: 'open' });
    await socketPromise;
    expect(resolved).toBe(true);
  });

  it('getSocket() calls useMultiFileAuthState with CHANNEL_STATE_DIR/baileys, and makeWASocket with the resulting auth + version', async () => {
    jest.resetModules();
    // A RELATIVE value on purpose: CHANNEL_STATE_DIR defaults to the relative
    // '.channel-state', and the behaviour under test is that it resolves against
    // the REPO, not the working directory.
    //
    // Resolved against cwd, the session moved whenever the launch directory did:
    // `cd bot && npm start` used an empty bot/.channel-state, so Baileys
    // registered a *second* device and re-synced from scratch, endlessly, with
    // two devices fighting over one account. Seen live on a real account —
    // device :13 at the repo root and :14 under bot/.
    process.env.CHANNEL_STATE_DIR = '.test-channel-state';
    const { makeWASocket, useMultiFileAuthState, sockEventHandlers } = mockBaileysPackage();
    const conn = require('../../bot/shared/services/messaging/baileys-connection');

    await connectAndOpen(conn, sockEventHandlers);

    expect(useMultiFileAuthState).toHaveBeenCalledTimes(1);
    const authPath = useMultiFileAuthState.mock.calls[0][0];
    expect(authPath).toMatch(/\.test-channel-state[/\\]baileys$/);
    // Anchored to the repo root, whatever the working directory is.
    expect(authPath).toBe(require('path').resolve(__dirname, '../..', '.test-channel-state', 'baileys'));
    expect(makeWASocket).toHaveBeenCalledTimes(1);
  });

  it('authDir() ignores the working directory entirely', () => {
    const fs = require('fs');
    const os = require('os');
    const path = require('path');
    jest.resetModules();
    process.env.CHANNEL_STATE_DIR = '.test-channel-state';
    const conn = require('../../bot/shared/services/messaging/baileys-connection');
    const fromRepoRoot = conn.authDir();

    const original = process.cwd();
    const elsewhere = fs.mkdtempSync(path.join(os.tmpdir(), 'rumi-authdir-cwd-'));
    process.chdir(elsewhere);
    try {
      expect(conn.authDir()).toBe(fromRepoRoot);
    } finally {
      process.chdir(original);
      fs.rmSync(elsewhere, { recursive: true, force: true });
    }
  });

  it('does not hand Baileys an undefined logger — it would overwrite their default', async () => {
    // The bug: `logger: isCli ? quiet : undefined`. Baileys merges config over
    // its defaults, so an explicit undefined replaced its default logger and the
    // next `logger.child()` call threw "Cannot read properties of undefined".
    // The bot booted, reported every other service healthy, and had no WhatsApp
    // connection at all. Checked as a property of the config actually passed,
    // since the source read as though it were a no-op.
    jest.resetModules();
    delete process.env.RUMI_CLI;
    const { makeWASocket, sockEventHandlers } = mockBaileysPackage();
    const conn = require('../../bot/shared/services/messaging/baileys-connection');

    await connectAndOpen(conn, sockEventHandlers);

    const config = makeWASocket.mock.calls[0][0];
    expect(Object.prototype.hasOwnProperty.call(config, 'logger')).toBe(false);
  });

  it('gives Baileys a silent logger when an interactive command is driving', async () => {
    jest.resetModules();
    process.env.RUMI_CLI = '1';
    const { makeWASocket, sockEventHandlers } = mockBaileysPackage();
    const conn = require('../../bot/shared/services/messaging/baileys-connection');

    try {
      await connectAndOpen(conn, sockEventHandlers);
      const { logger } = makeWASocket.mock.calls[0][0];
      expect(logger).toBeDefined();
      expect(typeof logger.child).toBe('function');
      expect(typeof logger.child({ class: 'baileys' }).info).toBe('function');
    } finally {
      delete process.env.RUMI_CLI;
    }
  });

  it('honours an ABSOLUTE CHANNEL_STATE_DIR as given', () => {
    const fs = require('fs');
    const os = require('os');
    const path = require('path');
    jest.resetModules();
    const absolute = fs.mkdtempSync(path.join(os.tmpdir(), 'rumi-authdir-abs-'));
    process.env.CHANNEL_STATE_DIR = absolute;
    const conn = require('../../bot/shared/services/messaging/baileys-connection');

    expect(conn.authDir()).toBe(path.join(absolute, 'baileys'));
    fs.rmSync(absolute, { recursive: true, force: true });
  });

  it('getSocket() is memoized — a second call reuses the same connection without reconnecting', async () => {
    jest.resetModules();
    const { makeWASocket, sockEventHandlers } = mockBaileysPackage();
    const conn = require('../../bot/shared/services/messaging/baileys-connection');

    const first = await connectAndOpen(conn, sockEventHandlers);
    const second = await conn.getSocket(); // already resolved — no new registration needed

    expect(first).toBe(second);
    expect(makeWASocket).toHaveBeenCalledTimes(1);
  });

  it('registers a creds.update listener that calls saveCreds', async () => {
    jest.resetModules();
    const { sockEventHandlers, saveCreds } = mockBaileysPackage();
    const conn = require('../../bot/shared/services/messaging/baileys-connection');

    await connectAndOpen(conn, sockEventHandlers);
    expect(typeof sockEventHandlers['creds.update']).toBe('function');
    expect(sockEventHandlers['creds.update']).toBe(saveCreds);
  });

  it('renders a QR code via qrcode-terminal and invokes onQr when one is issued', async () => {
    jest.resetModules();
    const { sockEventHandlers } = mockBaileysPackage();
    const qrcodeTerminal = require('qrcode-terminal');
    const conn = require('../../bot/shared/services/messaging/baileys-connection');

    const onQr = jest.fn();
    const socketPromise = conn.getSocket({ onQr });
    await waitForHandler(sockEventHandlers);
    sockEventHandlers['connection.update']({ qr: 'raw-qr-payload' });

    expect(qrcodeTerminal.generate).toHaveBeenCalledWith('raw-qr-payload', expect.any(Object));
    expect(onQr).toHaveBeenCalledWith('raw-qr-payload');

    sockEventHandlers['connection.update']({ connection: 'open' }); // let the promise settle cleanly
    await socketPromise;
  });

  it('marks isConnected() true on connection open and false on close', async () => {
    jest.resetModules();
    const { sockEventHandlers } = mockBaileysPackage();
    const conn = require('../../bot/shared/services/messaging/baileys-connection');

    const socketPromise = conn.getSocket();
    await waitForHandler(sockEventHandlers);
    expect(conn.isConnected()).toBe(false);

    sockEventHandlers['connection.update']({ connection: 'open' });
    await socketPromise;
    expect(conn.isConnected()).toBe(true);

    sockEventHandlers['connection.update']({ connection: 'close', lastDisconnect: { error: { output: { statusCode: 408 } } } });
    expect(conn.isConnected()).toBe(false);
  });

  it('reconnects automatically on a non-logout close AFTER an established connection (statusCode !== 401)', async () => {
    jest.resetModules();
    const { sockEventHandlers, makeWASocket } = mockBaileysPackage();
    const conn = require('../../bot/shared/services/messaging/baileys-connection');

    await connectAndOpen(conn, sockEventHandlers);
    expect(makeWASocket).toHaveBeenCalledTimes(1);

    sockEventHandlers['connection.update']({ connection: 'close', lastDisconnect: { error: { output: { statusCode: 408 } } } });
    // The reconnect fires an async getSocket() internally, which now chains
    // through loadBaileys() too — flush enough microtask ticks for the whole thing.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(makeWASocket).toHaveBeenCalledTimes(2);
  });

  it('a close BEFORE ever opening chains this attempt\'s promise onto the internal reconnect, instead of hanging forever', async () => {
    // Real-world shape: the very first attempt hits a transient close (not a
    // logout) before "open" ever fires. A caller awaiting THIS getSocket()
    // call must still eventually resolve once the internal reconnect (a
    // fresh socket) actually opens — not hang on the abandoned first attempt.
    jest.resetModules();
    const { sockEventHandlers, makeWASocket } = mockBaileysPackage();
    const conn = require('../../bot/shared/services/messaging/baileys-connection');

    const socketPromise = conn.getSocket();
    await waitForHandler(sockEventHandlers);

    sockEventHandlers['connection.update']({ connection: 'close', lastDisconnect: { error: { output: { statusCode: 515 } } } });
    // Internal reconnect: flush ticks so the new connect() attempt registers its own handler.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(makeWASocket).toHaveBeenCalledTimes(2);

    sockEventHandlers['connection.update']({ connection: 'open' });
    const sock = await socketPromise; // resolves via the chained reconnect, not the abandoned first attempt
    expect(sock).toBeTruthy();
  });

  it('events emitter survives an internal reconnect — the exact bug a live pairing run caught', async () => {
    // Real-world discovery: baileys-pair.js used to attach its success
    // listener to the FIRST socket's own `sock.ev`. After a live pairing,
    // Baileys closes with "restart required" (515) and this module
    // reconnects internally with a brand-new socket — a listener on the old
    // socket never sees the real, second "open" and times out despite the
    // pairing having actually succeeded. `events` must not have that problem:
    // a listener registered once must fire for every subsequent "open",
    // including ones after an internal reconnect.
    jest.resetModules();
    const { sockEventHandlers, makeWASocket } = mockBaileysPackage();
    const conn = require('../../bot/shared/services/messaging/baileys-connection');

    const opens = jest.fn();
    conn.events.on('open', opens);

    await connectAndOpen(conn, sockEventHandlers);
    expect(opens).toHaveBeenCalledTimes(1);

    // "restart required" close — not a logout, triggers an internal reconnect.
    sockEventHandlers['connection.update']({
      connection: 'close', lastDisconnect: { error: { output: { statusCode: 515 } } },
    });
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(makeWASocket).toHaveBeenCalledTimes(2); // the internal reconnect really happened

    // The reconnected socket opens for real — the SAME `events` listener
    // (registered before any of this happened) must fire again.
    sockEventHandlers['connection.update']({ connection: 'open' });
    expect(opens).toHaveBeenCalledTimes(2);
  });

  it('passes a getMessage hook to makeWASocket so Baileys can answer retry receipts', async () => {
    // The real bug: the paired phone showed "Waiting for this message. This
    // may take a while." forever. WhatsApp's recovery path is a retry receipt,
    // which Baileys answers in sendMessagesAgain() by calling the `getMessage`
    // config hook to recover the original content. The library default is
    // `async () => undefined`, so nothing was ever resent.
    jest.resetModules();
    const { makeWASocket, sockEventHandlers } = mockBaileysPackage();
    const conn = require('../../bot/shared/services/messaging/baileys-connection');

    await connectAndOpen(conn, sockEventHandlers);

    const opts = makeWASocket.mock.calls[0][0];
    expect(typeof opts.getMessage).toBe('function');
  });

  it('pins the socket options that differ from Baileys 7.x defaults', async () => {
    // Baileys 7.x defaults syncFullHistory AND markOnlineOnConnect to true.
    // Both are wrong for this bot: it only acts on messages received while
    // running, and marking the account online suppresses push notifications on
    // the operator's own phone for as long as the bot is up.
    jest.resetModules();
    const { makeWASocket, sockEventHandlers } = mockBaileysPackage();
    const conn = require('../../bot/shared/services/messaging/baileys-connection');

    await connectAndOpen(conn, sockEventHandlers);

    const opts = makeWASocket.mock.calls[0][0];
    expect(opts.syncFullHistory).toBe(false);
    expect(opts.markOnlineOnConnect).toBe(false);
    expect(opts.browser).toEqual(['Rumi', 'Chrome', '120.0']);
  });

  it('records sent messages and serves them back to getMessage() by id', async () => {
    jest.resetModules();
    const { sock, sockEventHandlers } = mockBaileysPackage();
    const content = { conversation: 'the original reply' };
    sock.sendMessage = jest.fn().mockResolvedValue({ key: { id: 'sent-1' }, message: content });
    const conn = require('../../bot/shared/services/messaging/baileys-connection');
    conn._resetForTests();

    const connected = await connectAndOpen(conn, sockEventHandlers);
    await connected.sendMessage('923001234567@s.whatsapp.net', { text: 'the original reply' });

    // This is what Baileys calls on a retry receipt — it must find the content.
    await expect(conn.getStoredMessage({ id: 'sent-1' })).resolves.toBe(content);
  });

  it('getMessage() resolves undefined for an unknown id rather than throwing', async () => {
    jest.resetModules();
    mockBaileysPackage();
    const conn = require('../../bot/shared/services/messaging/baileys-connection');
    conn._resetForTests();

    await expect(conn.getStoredMessage({ id: 'never-sent' })).resolves.toBeUndefined();
    await expect(conn.getStoredMessage(undefined)).resolves.toBeUndefined();
  });

  it('bounds the sent-message store, evicting oldest first', async () => {
    jest.resetModules();
    mockBaileysPackage();
    const conn = require('../../bot/shared/services/messaging/baileys-connection');
    conn._resetForTests();

    for (let i = 0; i < 260; i += 1) {
      conn.rememberSentMessage({ key: { id: `m${i}` }, message: { conversation: `#${i}` } });
    }

    await expect(conn.getStoredMessage({ id: 'm0' })).resolves.toBeUndefined(); // evicted
    await expect(conn.getStoredMessage({ id: 'm259' })).resolves.toEqual({ conversation: '#259' });
  });

  it('serialises overlapping sends so no two encrypt concurrently — the "Waiting for this message" bug', async () => {
    // Concurrent sends on one Baileys socket corrupt Signal ratchet state: two
    // encryptions advance from the same chain key and the loser is
    // undecryptable, showing "Waiting for this message. This may take a while."
    // This bot overlaps sends by default (reaction + typing presence + reply,
    // with the continuous typing indicator firing on a timer during the send).
    jest.resetModules();
    const { sock, sockEventHandlers } = mockBaileysPackage();

    let inFlight = 0;
    let maxConcurrent = 0;
    const release = [];
    // Keep our own handle: trackSentMessages REPLACES sock.sendMessage with its
    // serialising wrapper, so sock.sendMessage is no longer this mock.
    const rawSend = jest.fn(() => {
      inFlight += 1;
      maxConcurrent = Math.max(maxConcurrent, inFlight);
      return new Promise((resolve) => {
        release.push(() => { inFlight -= 1; resolve({ key: { id: `id-${release.length}` }, message: {} }); });
      });
    });
    sock.sendMessage = rawSend;

    const conn = require('../../bot/shared/services/messaging/baileys-connection');
    conn._resetForTests();
    const connected = await connectAndOpen(conn, sockEventHandlers);

    // Fire three sends without awaiting — the overlapping real-world pattern.
    const sends = [
      connected.sendMessage('a@s.whatsapp.net', { text: '1' }),
      connected.sendMessage('a@s.whatsapp.net', { text: '2' }),
      connected.sendMessage('a@s.whatsapp.net', { text: '3' }),
    ];

    // Drain: only one should ever be in flight, so release them one at a time.
    for (let i = 0; i < 3; i += 1) {
      for (let tick = 0; tick < 10; tick += 1) await Promise.resolve();
      expect(release.length).toBe(i + 1); // the next send hasn't started yet
      release[i]();
    }
    await Promise.all(sends);

    expect(rawSend).toHaveBeenCalledTimes(3);
    expect(maxConcurrent).toBe(1);
  });

  it('a failed send does not wedge the serialised queue for later sends', async () => {
    jest.resetModules();
    const { sock, sockEventHandlers } = mockBaileysPackage();
    sock.sendMessage = jest.fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ key: { id: 'after-failure' }, message: { conversation: 'ok' } });

    const conn = require('../../bot/shared/services/messaging/baileys-connection');
    conn._resetForTests();
    const connected = await connectAndOpen(conn, sockEventHandlers);

    await expect(connected.sendMessage('a@s.whatsapp.net', { text: 'fails' })).rejects.toThrow('boom');
    await expect(connected.sendMessage('a@s.whatsapp.net', { text: 'works' })).resolves.toMatchObject({
      key: { id: 'after-failure' },
    });
  });

  it('close() ends the socket cleanly WITHOUT logging out, and does not reconnect', async () => {
    // Real-world discovery: the process was SIGTERM'd with no shutdown
    // handling, so Baileys' not-yet-flushed Signal session state was lost and
    // the paired phone could no longer decrypt the bot's replies ("Waiting
    // for this message. This may take a while."). close() exists to make a
    // restart safe. sock.end(undefined) must be a clean close, NOT a logout —
    // a logout would destroy the pairing and force a re-scan.
    jest.resetModules();
    const { sock, sockEventHandlers, makeWASocket } = mockBaileysPackage();
    sock.end = jest.fn();
    sock.logout = jest.fn();
    const conn = require('../../bot/shared/services/messaging/baileys-connection');

    await connectAndOpen(conn, sockEventHandlers);
    expect(conn.isConnected()).toBe(true);

    await conn.close({ flushMs: 0 });

    expect(sock.end).toHaveBeenCalledWith(undefined);
    expect(sock.logout).not.toHaveBeenCalled();
    expect(conn.isConnected()).toBe(false);

    // The real sock.end() emits a 'close' connection.update. That must NOT be
    // treated as a network blip and trigger the usual auto-reconnect.
    sockEventHandlers['connection.update']({
      connection: 'close', lastDisconnect: { error: { output: { statusCode: 428 } } },
    });
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(makeWASocket).toHaveBeenCalledTimes(1); // no resurrection
  });

  it('close() waits out its flush window so pending auth-state writes can land', async () => {
    jest.resetModules();
    const { sock, sockEventHandlers } = mockBaileysPackage();
    sock.end = jest.fn();
    const conn = require('../../bot/shared/services/messaging/baileys-connection');

    await connectAndOpen(conn, sockEventHandlers);

    let settled = false;
    const closing = conn.close({ flushMs: 40 }).then(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false); // still inside the flush window

    await closing;
    expect(settled).toBe(true);
  });

  it('close() is safe when no connection was ever opened', async () => {
    jest.resetModules();
    mockBaileysPackage();
    const conn = require('../../bot/shared/services/messaging/baileys-connection');

    await expect(conn.close({ flushMs: 0 })).resolves.toBeUndefined();
  });

  it('does NOT reconnect on a logout close (statusCode === 401), and rejects this attempt cleanly', async () => {
    jest.resetModules();
    const { sockEventHandlers, makeWASocket } = mockBaileysPackage();
    const conn = require('../../bot/shared/services/messaging/baileys-connection');

    const socketPromise = conn.getSocket();
    await waitForHandler(sockEventHandlers);
    sockEventHandlers['connection.update']({ connection: 'close', lastDisconnect: { error: { output: { statusCode: 401 } } } });

    await expect(socketPromise).rejects.toThrow(/logged out/i);
    expect(makeWASocket).toHaveBeenCalledTimes(1);
  });
});

describe('a QR when credentials already exist is terminal, not a retry loop', () => {
  // The failure this prevents, observed live: WhatsApp invalidated the session
  // ("Stream Errored (conflict)" — two processes had shared one auth folder).
  // Baileys then re-issued a pairing QR every ~20 seconds indefinitely into a
  // terminal nobody was watching. That is not recovery, it is hammering
  // WhatsApp's pairing endpoint, and it is exactly how this project repeatedly
  // tripped the "can't link new devices right now" rate limit. A human with the
  // phone is required, so the only correct behaviour is to stop and say so.
  const fs = require('fs');
  const os = require('os');
  const path = require('path');

  function stateDirWithCreds(withCreds) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rumi-chan-'));
    if (withCreds) {
      fs.mkdirSync(path.join(dir, 'baileys'), { recursive: true });
      fs.writeFileSync(path.join(dir, 'baileys', 'creds.json'), '{"me":{"id":"1@s.whatsapp.net"}}');
    }
    process.env.CHANNEL_STATE_DIR = dir;
    return dir;
  }

  it('rejects, emits a logged-out close, and renders NO QR', async () => {
    stateDirWithCreds(true);
    const { sockEventHandlers } = mockBaileysPackage();
    const qrTerminal = require('qrcode-terminal');
    const conn = require('../../bot/shared/services/messaging/baileys-connection');

    const closes = [];
    conn.events.on('close', (payload) => closes.push(payload));

    const pending = conn.getSocket();
    await waitForHandler(sockEventHandlers);
    sockEventHandlers['connection.update']({ qr: 'QR-PAYLOAD-1' });

    await expect(pending).rejects.toThrow(/session invalidated/i);
    expect(qrTerminal.generate).not.toHaveBeenCalled();
    // Reported as logged-out so whatsapp-bot.js's exitOnChannelLogout() exits 78
    // and the supervisor stops instead of restarting into the same loop.
    expect(closes).toEqual([expect.objectContaining({ loggedOut: true })]);
  });

  it('never asks WhatsApp for a second QR', async () => {
    stateDirWithCreds(true);
    const { sockEventHandlers } = mockBaileysPackage();
    const qrTerminal = require('qrcode-terminal');
    const conn = require('../../bot/shared/services/messaging/baileys-connection');

    const pending = conn.getSocket();
    await waitForHandler(sockEventHandlers);
    sockEventHandlers['connection.update']({ qr: 'QR-1' });
    sockEventHandlers['connection.update']({ qr: 'QR-2' });
    sockEventHandlers['connection.update']({ qr: 'QR-3' });

    await expect(pending).rejects.toThrow();
    expect(qrTerminal.generate).not.toHaveBeenCalled();
  });

  it('STILL shows a QR for genuine first-time pairing (no credentials yet)', async () => {
    stateDirWithCreds(false);
    const { sockEventHandlers } = mockBaileysPackage();
    const qrTerminal = require('qrcode-terminal');
    const conn = require('../../bot/shared/services/messaging/baileys-connection');

    const onQr = jest.fn();
    const pending = connectAndOpen(conn, sockEventHandlers, { onQr });
    await waitForHandler(sockEventHandlers);
    sockEventHandlers['connection.update']({ qr: 'QR-FIRST-TIME' });

    await pending;
    expect(qrTerminal.generate).toHaveBeenCalledWith('QR-FIRST-TIME', { small: true });
    expect(onQr).toHaveBeenCalledWith('QR-FIRST-TIME');
  });

  it('allowRepair lets the pairing script re-pair over stale credentials', async () => {
    // `npm run pair:baileys` exists precisely to recover this state, so it opts
    // in — while the bot, which passes no flag, still refuses to loop.
    stateDirWithCreds(true);
    const { sockEventHandlers } = mockBaileysPackage();
    const qrTerminal = require('qrcode-terminal');
    const conn = require('../../bot/shared/services/messaging/baileys-connection');

    const pending = connectAndOpen(conn, sockEventHandlers, { allowRepair: true });
    await waitForHandler(sockEventHandlers);
    sockEventHandlers['connection.update']({ qr: 'QR-REPAIR' });

    await pending;
    expect(qrTerminal.generate).toHaveBeenCalledWith('QR-REPAIR', { small: true });
  });
});

describe('single-instance guard on the auth folder', () => {
  // Why this exists, observed live: two processes briefly shared one auth folder
  // during a fast restart, WhatsApp rejected the duplicate with "Stream Errored
  // (conflict)", and the SESSION ITSELF was invalidated — recovery needed a human
  // re-scanning a QR. Overlapping restarts are routine (supervisor restart-on-exit,
  // a PaaS rolling deploy draining the old container), so refusing to boot is
  // vastly better than destroying the pairing.
  const fs = require('fs');
  const path = require('path');

  it('claims the folder with a lock naming this process', async () => {
    const { sockEventHandlers } = mockBaileysPackage();
    const conn = require('../../bot/shared/services/messaging/baileys-connection');

    await connectAndOpen(conn, sockEventHandlers);

    const holder = JSON.parse(fs.readFileSync(conn.lockPath(), 'utf-8'));
    expect(holder.pid).toBe(process.pid);
    expect(typeof holder.since).toBe('string');
  });

  it('REFUSES to connect when a live process already holds the folder', async () => {
    mockBaileysPackage();
    const conn = require('../../bot/shared/services/messaging/baileys-connection');

    // A live pid that is not us: the test runner's own parent is guaranteed alive.
    fs.mkdirSync(conn.authDir(), { recursive: true });
    fs.writeFileSync(conn.lockPath(), JSON.stringify({ pid: process.ppid, since: 'earlier' }));

    await expect(conn.getSocket()).rejects.toThrow(/Another Rumi instance \(pid \d+/);
    // and it names the remedy rather than just failing
    await expect(conn.getSocket()).rejects.toThrow(/Stop the other instance first/);
  });

  it('takes over a STALE lock whose holder is gone', async () => {
    const { sockEventHandlers } = mockBaileysPackage();
    const conn = require('../../bot/shared/services/messaging/baileys-connection');

    // pid 0 is never a live process we can signal — stands in for a crashed one.
    fs.mkdirSync(conn.authDir(), { recursive: true });
    fs.writeFileSync(conn.lockPath(), JSON.stringify({ pid: 0, since: 'long ago' }));

    await connectAndOpen(conn, sockEventHandlers);

    expect(JSON.parse(fs.readFileSync(conn.lockPath(), 'utf-8')).pid).toBe(process.pid);
  });

  it('treats a corrupt lock file as stale rather than deadlocking forever', async () => {
    const { sockEventHandlers } = mockBaileysPackage();
    const conn = require('../../bot/shared/services/messaging/baileys-connection');

    fs.mkdirSync(conn.authDir(), { recursive: true });
    fs.writeFileSync(conn.lockPath(), 'not json at all');

    await connectAndOpen(conn, sockEventHandlers);
    expect(JSON.parse(fs.readFileSync(conn.lockPath(), 'utf-8')).pid).toBe(process.pid);
  });

  it('releases the lock on close(), so a restart can claim it', async () => {
    const { sockEventHandlers } = mockBaileysPackage();
    const conn = require('../../bot/shared/services/messaging/baileys-connection');

    await connectAndOpen(conn, sockEventHandlers);
    expect(fs.existsSync(conn.lockPath())).toBe(true);

    await conn.close({ flushMs: 0 });
    expect(fs.existsSync(conn.lockPath())).toBe(false);
  });

  it('does not delete a lock that belongs to somebody else', async () => {
    mockBaileysPackage();
    const conn = require('../../bot/shared/services/messaging/baileys-connection');

    fs.mkdirSync(conn.authDir(), { recursive: true });
    fs.writeFileSync(conn.lockPath(), JSON.stringify({ pid: process.ppid, since: 'earlier' }));

    conn.releaseInstanceLock();
    expect(fs.existsSync(conn.lockPath())).toBe(true);
  });

  it('is idempotent — claiming twice from one process is fine', async () => {
    mockBaileysPackage();
    const conn = require('../../bot/shared/services/messaging/baileys-connection');

    expect(() => conn.acquireInstanceLock()).not.toThrow();
    expect(() => conn.acquireInstanceLock()).not.toThrow();
    expect(JSON.parse(fs.readFileSync(conn.lockPath(), 'utf-8')).pid).toBe(process.pid);
  });

  it('puts the lock inside the driver subfolder, not the shared state root', () => {
    mockBaileysPackage();
    const conn = require('../../bot/shared/services/messaging/baileys-connection');
    expect(conn.lockPath()).toBe(path.join(conn.authDir(), '.instance.lock'));
    expect(conn.authDir().endsWith(path.join('baileys'))).toBe(true);
  });
});
