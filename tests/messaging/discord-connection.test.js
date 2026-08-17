/**
 * discord-connection.js — the persistent Gateway connection manager.
 *
 * `discord.js` is a real, heavy package (opens real sockets), so it's
 * virtually mocked here the same way baileys-connection.test.js mocks
 * `baileys` via baileys-lib.js — a real socket/Gateway call must never
 * happen from a unit test regardless.
 *
 * The 'clientReady' event name (NOT 'ready' — discord.js renamed it) is the
 * one fact this whole test suite exists to pin down; getting it wrong here
 * would mean getClient() never resolves against the real package.
 */

function mockDiscordPackage() {
  const clientEventHandlers = {};
  const onceHandlers = {};
  const client = {
    on: jest.fn((event, handler) => { clientEventHandlers[event] = handler; }),
    once: jest.fn((event, handler) => { onceHandlers[event] = handler; }),
    login: jest.fn().mockResolvedValue('logged-in'),
    destroy: jest.fn().mockResolvedValue(undefined),
    user: { tag: 'RumiBot#0001' },
  };

  const Client = jest.fn(() => client);
  const GatewayIntentBits = { Guilds: 1, GuildMessages: 2, DirectMessages: 4, MessageContent: 8 };
  const Partials = { Channel: 1, Message: 2 };
  const Events = {
    ClientReady: 'clientReady',
    Error: 'error',
    ShardDisconnect: 'shardDisconnect',
    ShardReconnecting: 'shardReconnecting',
    ShardResume: 'shardResume',
  };

  jest.doMock('discord.js', () => ({ Client, GatewayIntentBits, Partials, Events }), { virtual: true });
  jest.doMock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));

  return { Client, client, clientEventHandlers, onceHandlers };
}

/** Flushes microtask ticks until once('clientReady', ...) has been registered. */
async function waitForReadyHandler(onceHandlers) {
  for (let i = 0; i < 20 && !onceHandlers.clientReady; i += 1) await Promise.resolve();
  if (!onceHandlers.clientReady) throw new Error('clientReady handler was never registered');
}

/** Calls getClient(), waits for connect() to register its ready handler, then fires it. */
async function connectAndReady(conn, onceHandlers) {
  const clientPromise = conn.getClient();
  await waitForReadyHandler(onceHandlers);
  onceHandlers.clientReady();
  return clientPromise;
}

beforeEach(() => {
  jest.resetModules();
  process.env.DISCORD_BOT_TOKEN = 'test-token';
});

afterEach(() => {
  jest.resetModules();
  delete process.env.DISCORD_BOT_TOKEN;
});

describe('discord-connection', () => {
  it('connects lazily: requiring the module does not call Client or login', () => {
    const { Client, client } = mockDiscordPackage();
    require('../../bot/shared/services/messaging/discord-connection');
    expect(Client).not.toHaveBeenCalled();
    expect(client.login).not.toHaveBeenCalled();
  });

  it('getClient() resolves only once clientReady fires — not as soon as the Client is constructed', async () => {
    const { client, onceHandlers } = mockDiscordPackage();
    const conn = require('../../bot/shared/services/messaging/discord-connection');

    let resolved = false;
    const clientPromise = conn.getClient().then((c) => { resolved = true; return c; });
    await waitForReadyHandler(onceHandlers);
    expect(client.login).toHaveBeenCalledWith('test-token');
    expect(resolved).toBe(false);

    onceHandlers.clientReady();
    await clientPromise;
    expect(resolved).toBe(true);
  });

  it('uses the "clientReady" event, not "ready" — discord.js renamed it in the pinned version', async () => {
    const { onceHandlers } = mockDiscordPackage();
    const conn = require('../../bot/shared/services/messaging/discord-connection');

    conn.getClient();
    await waitForReadyHandler(onceHandlers);
    expect(onceHandlers.clientReady).toBeDefined();
    expect(onceHandlers.ready).toBeUndefined();
  });

  it('getClient() is memoized — a second call reuses the same connection without reconnecting', async () => {
    const { Client, onceHandlers } = mockDiscordPackage();
    const conn = require('../../bot/shared/services/messaging/discord-connection');

    const first = await connectAndReady(conn, onceHandlers);
    const second = await conn.getClient();

    expect(first).toBe(second);
    expect(Client).toHaveBeenCalledTimes(1);
  });

  it('throws when DISCORD_BOT_TOKEN is not set', async () => {
    mockDiscordPackage();
    delete process.env.DISCORD_BOT_TOKEN;
    const conn = require('../../bot/shared/services/messaging/discord-connection');

    await expect(conn.getClient()).rejects.toThrow(/DISCORD_BOT_TOKEN/);
  });

  it('propagates a login rejection (bad/revoked token) rather than hanging', async () => {
    const { client } = mockDiscordPackage();
    client.login.mockRejectedValue(new Error('401: Unauthorized'));
    const conn = require('../../bot/shared/services/messaging/discord-connection');

    await expect(conn.getClient()).rejects.toThrow(/Unauthorized/);
  });

  it('marks isConnected() true once ready, false after close()', async () => {
    const { onceHandlers } = mockDiscordPackage();
    const conn = require('../../bot/shared/services/messaging/discord-connection');

    expect(conn.isConnected()).toBe(false);
    await connectAndReady(conn, onceHandlers);
    expect(conn.isConnected()).toBe(true);

    await conn.close();
    expect(conn.isConnected()).toBe(false);
  });

  it('close() calls client.destroy() and lets a fresh getClient() reconnect afterward', async () => {
    const { Client, client, onceHandlers } = mockDiscordPackage();
    const conn = require('../../bot/shared/services/messaging/discord-connection');

    await connectAndReady(conn, onceHandlers);
    await conn.close();
    expect(client.destroy).toHaveBeenCalledTimes(1);

    // A fresh getClient() after close() must reconnect (new Client()), not
    // return a stale resolved reference to the destroyed client.
    const secondReadyHandlers = {};
    client.once = jest.fn((event, handler) => { secondReadyHandlers[event] = handler; });
    const secondPromise = conn.getClient();
    await waitForReadyHandler(secondReadyHandlers);
    secondReadyHandlers.clientReady();
    await secondPromise;
    expect(Client).toHaveBeenCalledTimes(2);
  });

  it('close() is safe when no connection was ever opened', async () => {
    mockDiscordPackage();
    const conn = require('../../bot/shared/services/messaging/discord-connection');
    await expect(conn.close()).resolves.toBeUndefined();
  });

  it('events emitter fires "open" on ready', async () => {
    const { onceHandlers } = mockDiscordPackage();
    const conn = require('../../bot/shared/services/messaging/discord-connection');

    const opens = jest.fn();
    conn.events.on('open', opens);
    await connectAndReady(conn, onceHandlers);
    expect(opens).toHaveBeenCalledTimes(1);
  });

  it('events emitter fires "close" on a shard disconnect', async () => {
    const { onceHandlers, clientEventHandlers } = mockDiscordPackage();
    const conn = require('../../bot/shared/services/messaging/discord-connection');

    const closes = jest.fn();
    conn.events.on('close', closes);
    await connectAndReady(conn, onceHandlers);

    clientEventHandlers.shardDisconnect({ code: 1006 }, 0);
    expect(closes).toHaveBeenCalledWith(expect.objectContaining({ code: 1006 }));
    expect(conn.isConnected()).toBe(false);
  });
});
