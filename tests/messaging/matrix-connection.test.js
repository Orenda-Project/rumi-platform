/**
 * matrix-connection.js -- the persistent Matrix sync connection manager.
 *
 * `matrix-bot-sdk` is a real package that opens real network sync loops, so
 * it's virtually mocked here the same way discord-connection.test.js mocks
 * `discord.js` -- a real sync call must never happen from a unit test
 * regardless of whether the package happens to be installed.
 *
 * The E2EE fallback (buildCryptoProvider) is the fact this suite most cares
 * about pinning down: a missing/broken native crypto module must degrade to
 * plaintext with a warning, never throw and never crash boot.
 */

// matrix-bot-sdk@0.8.0's own real exports for this area are `CryptoClient`,
// `requiresCrypto`, `RustSdkCryptoStorageProvider`, and
// `RustSdkAppserviceCryptoStorageProvider` -- NOT a `StoreType`/
// `RustSdkCryptoStoreType` value. That enum lives on the separate
// `@matrix-org/matrix-sdk-crypto-nodejs` package instead (see
// matrix-connection.js's own header comment for the real bug this was
// getting wrong before). This mock intentionally mirrors ONLY the real
// exports, so a regression back to importing StoreType from matrix-bot-sdk
// fails loudly here instead of silently passing against a too-generous mock.
function mockMatrixSdk({ startImpl, getUserIdImpl } = {}) {
  const client = {
    start: jest.fn(startImpl || (async () => undefined)),
    stop: jest.fn(),
    getUserId: jest.fn(getUserIdImpl || (async () => '@rumi:example.org')),
    on: jest.fn(),
  };
  const MatrixClient = jest.fn(() => client);
  const SimpleFsStorageProvider = jest.fn();
  const AutojoinRoomsMixin = { setupOnClient: jest.fn() };
  const RustSdkCryptoStorageProvider = jest.fn(() => ({}));

  jest.doMock('matrix-bot-sdk', () => ({
    MatrixClient,
    SimpleFsStorageProvider,
    AutojoinRoomsMixin,
    RustSdkCryptoStorageProvider,
  }), { virtual: true });
  jest.doMock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));

  return { MatrixClient, client, SimpleFsStorageProvider, AutojoinRoomsMixin, RustSdkCryptoStorageProvider };
}

function mockCryptoAvailable() {
  jest.doMock('@matrix-org/matrix-sdk-crypto-nodejs', () => ({ StoreType: { Sqlite: 0 } }), { virtual: true });
}

/** Simulates the package genuinely being absent (e.g. Node <24, no matching prebuild): a real MODULE_NOT_FOUND. */
function mockCryptoModuleAbsent() {
  jest.doMock('@matrix-org/matrix-sdk-crypto-nodejs', () => {
    const error = new Error('Cannot find module \'@matrix-org/matrix-sdk-crypto-nodejs\'');
    error.code = 'MODULE_NOT_FOUND';
    throw error;
  }, { virtual: true });
}

/** Simulates a REAL bug (e.g. a wrong import, corrupted store) -- present, but broken for some other reason. */
function mockCryptoModuleBroken() {
  jest.doMock('@matrix-org/matrix-sdk-crypto-nodejs', () => {
    throw new TypeError('boom: some other failure, not a missing module');
  }, { virtual: true });
}

beforeEach(() => {
  jest.resetModules();
  process.env.MATRIX_HOMESERVER_URL = 'https://matrix.example.org';
  process.env.MATRIX_ACCESS_TOKEN = 'test-token';
  delete process.env.MATRIX_USER_ID;
  delete process.env.MATRIX_E2EE;
  delete process.env.MATRIX_STORAGE_DIR;
});

afterEach(() => {
  jest.resetModules();
  delete process.env.MATRIX_HOMESERVER_URL;
  delete process.env.MATRIX_ACCESS_TOKEN;
  delete process.env.MATRIX_USER_ID;
  delete process.env.MATRIX_E2EE;
  delete process.env.MATRIX_STORAGE_DIR;
});

describe('matrix-connection', () => {
  it('connects lazily: requiring the module does not call MatrixClient or start()', () => {
    const { MatrixClient, client } = mockMatrixSdk();
    mockCryptoAvailable();
    require('../../bot/shared/services/messaging/matrix-connection');
    expect(MatrixClient).not.toHaveBeenCalled();
    expect(client.start).not.toHaveBeenCalled();
  });

  it('getClient() resolves once start() resolves, with a working crypto provider when available', async () => {
    const { MatrixClient, client, RustSdkCryptoStorageProvider } = mockMatrixSdk();
    mockCryptoAvailable();
    const conn = require('../../bot/shared/services/messaging/matrix-connection');

    const result = await conn.getClient();
    expect(result).toBe(client);
    expect(client.start).toHaveBeenCalledTimes(1);
    expect(RustSdkCryptoStorageProvider).toHaveBeenCalledTimes(1);
    // StoreType.Sqlite (0) comes from @matrix-org/matrix-sdk-crypto-nodejs,
    // NOT from matrix-bot-sdk -- the exact bug this pins down.
    expect(RustSdkCryptoStorageProvider.mock.calls[0][1]).toBe(0);
    // 4-arg constructor form (homeserverUrl, accessToken, storage, cryptoStore) when crypto is available.
    expect(MatrixClient.mock.calls[0]).toHaveLength(4);
    expect(conn.isE2eeActive()).toBe(true);
  });

  it('MATRIX_E2EE=auto (unset): falls back to plaintext when the crypto module is genuinely absent (MODULE_NOT_FOUND), logged as a warning', async () => {
    const { MatrixClient } = mockMatrixSdk();
    mockCryptoModuleAbsent();
    const logger = require('../../bot/shared/utils/logger');
    const conn = require('../../bot/shared/services/messaging/matrix-connection');

    await conn.getClient();
    expect(MatrixClient.mock.calls[0]).toHaveLength(3);
    expect(conn.isE2eeActive()).toBe(false);
    expect(logger.logToFile).toHaveBeenCalledWith(
      expect.stringContaining('is not installed on this host'),
      expect.objectContaining({ error: expect.any(String), code: 'MODULE_NOT_FOUND' })
    );
  });

  it('MATRIX_E2EE=auto (unset): a REAL bug (not module-absent) still falls back to plaintext, but is logged at error level with the real message/code', async () => {
    const { MatrixClient } = mockMatrixSdk();
    mockCryptoModuleBroken();
    const logger = require('../../bot/shared/utils/logger');
    const conn = require('../../bot/shared/services/messaging/matrix-connection');

    await conn.getClient();
    expect(MatrixClient.mock.calls[0]).toHaveLength(3);
    expect(conn.isE2eeActive()).toBe(false);
    expect(logger.logToFile).toHaveBeenCalledWith(
      expect.stringContaining('this is a bug, not an environment limitation'),
      expect.objectContaining({
        error: expect.stringContaining('boom: some other failure'),
        code: undefined, // TypeError has no .code, distinguishing it from MODULE_NOT_FOUND
        level: 'error',
      })
    );
    // Never the module-absent wording for a real bug.
    expect(logger.logToFile).not.toHaveBeenCalledWith(
      expect.stringContaining('is not installed on this host'),
      expect.anything()
    );
  });

  it('MATRIX_E2EE=on: FAILS startup (throws) instead of silently downgrading when the module is genuinely absent', async () => {
    mockMatrixSdk();
    mockCryptoModuleAbsent();
    process.env.MATRIX_E2EE = 'on';
    const conn = require('../../bot/shared/services/messaging/matrix-connection');

    await expect(conn.getClient()).rejects.toThrow(/MATRIX_E2EE=on was explicitly set/);
    expect(conn.isConnected()).toBe(false);
  });

  it('MATRIX_E2EE=on: FAILS startup (throws) instead of silently downgrading on a real bug too, not just module-absent', async () => {
    mockMatrixSdk();
    mockCryptoModuleBroken();
    process.env.MATRIX_E2EE = 'on';
    const conn = require('../../bot/shared/services/messaging/matrix-connection');

    await expect(conn.getClient()).rejects.toThrow(/MATRIX_E2EE=on was explicitly set/);
  });

  it('MATRIX_E2EE=off skips the crypto attempt entirely, without even trying to require the native module', async () => {
    const { MatrixClient } = mockMatrixSdk();
    process.env.MATRIX_E2EE = 'off';
    // No @matrix-org/matrix-sdk-crypto-nodejs mock at all -- if the code tried
    // to require it, this would blow up with a real MODULE_NOT_FOUND rather
    // than politely no-op, so an unhandled failure here IS the assertion.
    const conn = require('../../bot/shared/services/messaging/matrix-connection');

    await conn.getClient();
    expect(MatrixClient.mock.calls[0]).toHaveLength(3);
    expect(conn.isE2eeActive()).toBe(false);
  });

  it('getClient() is memoized -- a second call reuses the same connection without reconnecting', async () => {
    const { MatrixClient } = mockMatrixSdk();
    mockCryptoAvailable();
    const conn = require('../../bot/shared/services/messaging/matrix-connection');

    const first = await conn.getClient();
    const second = await conn.getClient();
    expect(first).toBe(second);
    expect(MatrixClient).toHaveBeenCalledTimes(1);
  });

  it('AutojoinRoomsMixin is wired onto the client so an invite is auto-accepted', async () => {
    const { AutojoinRoomsMixin, client } = mockMatrixSdk();
    mockCryptoAvailable();
    const conn = require('../../bot/shared/services/messaging/matrix-connection');

    await conn.getClient();
    expect(AutojoinRoomsMixin.setupOnClient).toHaveBeenCalledWith(client);
  });

  it('throws when MATRIX_HOMESERVER_URL is not set', async () => {
    mockMatrixSdk();
    mockCryptoAvailable();
    delete process.env.MATRIX_HOMESERVER_URL;
    const conn = require('../../bot/shared/services/messaging/matrix-connection');

    await expect(conn.getClient()).rejects.toThrow(/MATRIX_HOMESERVER_URL/);
  });

  it('throws when MATRIX_ACCESS_TOKEN is not set', async () => {
    mockMatrixSdk();
    mockCryptoAvailable();
    delete process.env.MATRIX_ACCESS_TOKEN;
    const conn = require('../../bot/shared/services/messaging/matrix-connection');

    await expect(conn.getClient()).rejects.toThrow(/MATRIX_ACCESS_TOKEN/);
  });

  it('propagates a start() rejection (bad/revoked token) rather than hanging', async () => {
    const { client } = mockMatrixSdk({ startImpl: async () => { throw new Error('M_UNKNOWN_TOKEN'); } });
    mockCryptoAvailable();
    const conn = require('../../bot/shared/services/messaging/matrix-connection');

    await expect(conn.getClient()).rejects.toThrow(/M_UNKNOWN_TOKEN/);
    expect(client.start).toHaveBeenCalledTimes(1);
  });

  it('resolves the own user id via whoami when MATRIX_USER_ID is not set', async () => {
    mockMatrixSdk({ getUserIdImpl: async () => '@rumi:example.org' });
    mockCryptoAvailable();
    const conn = require('../../bot/shared/services/messaging/matrix-connection');

    await conn.getClient();
    expect(conn.getCachedUserId()).toBe('@rumi:example.org');
  });

  it('prefers an explicit MATRIX_USER_ID over whoami', async () => {
    const { client } = mockMatrixSdk();
    mockCryptoAvailable();
    process.env.MATRIX_USER_ID = '@configured:example.org';
    const conn = require('../../bot/shared/services/messaging/matrix-connection');

    await conn.getClient();
    expect(conn.getCachedUserId()).toBe('@configured:example.org');
    expect(client.getUserId).not.toHaveBeenCalled();
  });

  it('marks isConnected() true once started, false after close()', async () => {
    mockMatrixSdk();
    mockCryptoAvailable();
    const conn = require('../../bot/shared/services/messaging/matrix-connection');

    expect(conn.isConnected()).toBe(false);
    await conn.getClient();
    expect(conn.isConnected()).toBe(true);

    await conn.close();
    expect(conn.isConnected()).toBe(false);
  });

  it('close() calls client.stop() and lets a fresh getClient() reconnect afterward', async () => {
    const { MatrixClient, client } = mockMatrixSdk();
    mockCryptoAvailable();
    const conn = require('../../bot/shared/services/messaging/matrix-connection');

    await conn.getClient();
    await conn.close();
    expect(client.stop).toHaveBeenCalledTimes(1);

    await conn.getClient();
    expect(MatrixClient).toHaveBeenCalledTimes(2);
  });

  it('close() is safe when no connection was ever opened', async () => {
    mockMatrixSdk();
    mockCryptoAvailable();
    const conn = require('../../bot/shared/services/messaging/matrix-connection');
    await expect(conn.close()).resolves.toBeUndefined();
  });

  it('events emitter fires "open" on connect and "close" on close()', async () => {
    mockMatrixSdk();
    mockCryptoAvailable();
    const conn = require('../../bot/shared/services/messaging/matrix-connection');

    const opens = jest.fn();
    const closes = jest.fn();
    conn.events.on('open', opens);
    conn.events.on('close', closes);

    await conn.getClient();
    expect(opens).toHaveBeenCalledTimes(1);

    await conn.close();
    expect(closes).toHaveBeenCalledTimes(1);
  });
});
