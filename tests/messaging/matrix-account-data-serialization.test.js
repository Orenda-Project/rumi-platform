/**
 * Covers the crash fix in matrix-connection.js's wrapSetAccountDataSerialized():
 * a burst of Matrix room invites (matrix-bot-sdk's own internal `DMs` class,
 * see matrix-connection.js's file header) fired N concurrent
 * `setAccountData('m.direct', ...)` writes at the SAME account-data row,
 * which Synapse/Postgres turned into a SerializationFailure -> 500 -> an
 * unhandled rejection that killed the whole bot process (reproduced live).
 *
 * These tests exercise the wrapper directly (jest.fn() standing in for the
 * real matrix-bot-sdk client's setAccountData) rather than the network, since
 * that's the actual seam this fix lives at -- see matrix-connection.test.js
 * for the (separately covered) connect()/E2EE/lifecycle behavior. The
 * `queue`/backoff state wrapSetAccountDataSerialized() closes over lives per
 * CALL (a fresh `client` object each time), not on the module, so the same
 * required module instance is safely reused across every test below.
 */

jest.mock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
jest.mock('matrix-bot-sdk', () => ({
  MatrixClient: jest.fn(),
  SimpleFsStorageProvider: jest.fn(),
  AutojoinRoomsMixin: { setupOnClient: jest.fn() },
  RustSdkCryptoStorageProvider: jest.fn(),
}), { virtual: true });
jest.mock('../../bot/shared/services/messaging/matrix-channel.service', () => ({
  _cacheIncomingMedia: jest.fn(),
  sendMessage: jest.fn().mockResolvedValue(true),
  _resolveDmRoomId: jest.fn().mockResolvedValue('!dm:example.org'),
}));

const { logToFile } = require('../../bot/shared/utils/logger');
const connection = require('../../bot/shared/services/messaging/matrix-connection');
const adapter = require('../../bot/shared/services/messaging/inbound/matrix-events.adapter');

const wrapSetAccountDataSerialized = connection._wrapSetAccountDataSerialized;

function makeMatrixError(statusCode, errcode) {
  const error = new Error(`MatrixError: ${errcode}: Internal server error`);
  error.statusCode = statusCode;
  error.body = { errcode };
  return error;
}

describe('matrix-connection: serialized/retried account-data writes', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    logToFile.mockClear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('a 500 (SerializationFailure) from the account-data write does not reject out of our handler', async () => {
    const original = jest.fn(async () => { throw makeMatrixError(500, 'M_UNKNOWN'); });
    const client = { setAccountData: original };
    wrapSetAccountDataSerialized(client);

    const pending = client.setAccountData('m.direct', { '@teacher:example.org': ['!room:example.org'] });
    await jest.runAllTimersAsync();

    await expect(pending).resolves.toBeUndefined(); // never rejects
    expect(original).toHaveBeenCalledTimes(4); // ACCOUNT_DATA_RETRY_ATTEMPTS
    expect(logToFile).toHaveBeenCalledWith(
      expect.stringContaining('account-data write failed after retries'),
      expect.objectContaining({ channel: 'matrix', accountDataType: 'm.direct' })
    );
  });

  it('N concurrent invites result in serialized (non-overlapping) account-data writes', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const original = jest.fn(async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      // Yield to the microtask queue so a non-serialized implementation would overlap here.
      await Promise.resolve();
      await Promise.resolve();
      inFlight -= 1;
      return undefined;
    });
    const client = { setAccountData: original };
    wrapSetAccountDataSerialized(client);

    const N = 15; // matches the burst size used in the live reproduction script
    const calls = Array.from({ length: N }, (_, i) =>
      client.setAccountData('m.direct', { [`@user${i}:example.org`]: [`!room${i}:example.org`] }));

    await jest.runAllTimersAsync();
    await Promise.all(calls);

    expect(original).toHaveBeenCalledTimes(N);
    expect(maxInFlight).toBe(1); // never more than one write in flight at a time
  });

  it('a transient failure is retried and then succeeds', async () => {
    let attempts = 0;
    const original = jest.fn(async () => {
      attempts += 1;
      if (attempts < 3) throw makeMatrixError(500, 'M_UNKNOWN');
      return { ok: true };
    });
    const client = { setAccountData: original };
    wrapSetAccountDataSerialized(client);

    const pending = client.setAccountData('m.direct', { '@teacher:example.org': ['!room:example.org'] });
    await jest.runAllTimersAsync();

    await expect(pending).resolves.toEqual({ ok: true });
    expect(original).toHaveBeenCalledTimes(3);
    // Retries logged as warnings, not the final "swallowed" error path.
    expect(logToFile).toHaveBeenCalledWith(
      expect.stringContaining('account-data write failed, retrying'),
      expect.objectContaining({ accountDataType: 'm.direct' })
    );
    expect(logToFile).not.toHaveBeenCalledWith(
      expect.stringContaining('account-data write failed after retries'),
      expect.anything()
    );
  });

  it('one failing write does not poison the queue for the next one', async () => {
    const original = jest.fn()
      .mockRejectedValueOnce(makeMatrixError(500, 'M_UNKNOWN'))
      .mockRejectedValueOnce(makeMatrixError(500, 'M_UNKNOWN'))
      .mockRejectedValueOnce(makeMatrixError(500, 'M_UNKNOWN'))
      .mockRejectedValueOnce(makeMatrixError(500, 'M_UNKNOWN')) // first write exhausts all 4 attempts and is swallowed
      .mockResolvedValueOnce({ ok: true }); // second write succeeds first try
    const client = { setAccountData: original };
    wrapSetAccountDataSerialized(client);

    const first = client.setAccountData('m.direct', { a: ['!a'] });
    const second = client.setAccountData('m.direct', { b: ['!b'] });
    await jest.runAllTimersAsync();

    await expect(first).resolves.toBeUndefined();
    await expect(second).resolves.toEqual({ ok: true });
    expect(original).toHaveBeenCalledTimes(5);
  });

  it('the greeted-marker write failing does not throw (matrix-events.adapter#markGreeted, via handleWelcomeRoomJoin)', async () => {
    const original = jest.fn(async () => { throw makeMatrixError(500, 'M_UNKNOWN'); });
    const client = {
      storageProvider: null, // force the account-data path, not the local cache
      getAccountData: jest.fn(async () => { throw makeMatrixError(500, 'M_UNKNOWN'); }), // fetchGreetedMap also fails
      setAccountData: original, // markGreeted's write fails every attempt
    };
    wrapSetAccountDataSerialized(client);

    const event = { type: 'm.room.member', state_key: '@teacher:example.org', content: { membership: 'join' } };
    const pending = adapter.handleWelcomeRoomJoin(client, '!welcome:example.org', '!welcome:example.org', event, '@rumi:example.org');
    await jest.runAllTimersAsync();

    await expect(pending).resolves.toBeUndefined(); // does not throw despite every account-data write failing
    // Exhausted all retries before giving up (ACCOUNT_DATA_RETRY_ATTEMPTS).
    expect(original).toHaveBeenCalledTimes(4);
  });
});
