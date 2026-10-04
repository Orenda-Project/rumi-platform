'use strict';
/**
 * A media send that fails on a file URL doesn't log the URL through the
 * error's message.
 *
 * resolveMediaBuffer tries R2 first; when that throws it logs the error and
 * fetches the URL directly, and sendDocumentFromUrl logs whatever finally
 * failed. Either error message may name the URL (extractKeyFromUrl's used to),
 * so both log lines redact it. matrix-connection and R2 are faked at their
 * boundaries, as in matrix-channel-service.test.js.
 */

const PUBLIC_URL = 'https://pub-abc123.r2.dev/reports/t-42/lesson-plan-9f.pdf';

function loadService({ fetchImpl }) {
  jest.resetModules();
  const client = {
    sendMessage: jest.fn(async () => '$event123'),
    uploadContent: jest.fn(async () => 'mxc://example.org/abc123'),
    dms: { getOrCreateDm: jest.fn(async () => '!room:example.org') },
    crypto: { isRoomEncrypted: jest.fn(async () => false) },
  };
  jest.doMock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
  jest.doMock('../../bot/shared/storage/r2', () => ({
    downloadFromR2: jest.fn(),
    extractKeyFromUrl: jest.fn((url) => { throw new Error(`Could not extract R2 key from URL: ${url}`); }),
  }));
  jest.doMock('../../bot/shared/services/messaging/pending-options', () => ({
    remember: jest.fn().mockResolvedValue(undefined), get: jest.fn().mockResolvedValue(null),
    clear: jest.fn().mockResolvedValue(undefined), resolveSelection: jest.fn(() => null),
  }));
  jest.doMock('../../bot/shared/services/cache/railway-redis.service', () => ({
    set: jest.fn().mockRejectedValue(new Error('redis disabled in tests')),
    get: jest.fn().mockRejectedValue(new Error('redis disabled in tests')),
    delete: jest.fn().mockRejectedValue(new Error('redis disabled in tests')),
  }));
  jest.doMock('../../bot/shared/services/messaging/matrix-connection', () => ({
    getClient: jest.fn(async () => client),
    isE2eeActive: jest.fn(() => false),
    roomIsEncrypted: jest.fn(async (c, roomId) => c.crypto.isRoomEncrypted(roomId)),
  }));
  global.fetch = fetchImpl;
  require('../../bot/shared/services/messaging/matrix-outbound-relay').ownConnectionInThisProcess();
  const service = require('../../bot/shared/services/messaging/matrix-channel.service');
  const { logToFile } = require('../../bot/shared/utils/logger');
  return { service, client, logToFile };
}

const realFetch = global.fetch;
const saved = { ...process.env };
beforeEach(() => {
  process.env.R2_ENDPOINT = 'https://acc123.r2.cloudflarestorage.com';
  process.env.R2_ACCESS_KEY_ID = 'test-key-id';
  process.env.R2_SECRET_ACCESS_KEY = 'test-secret';
});
afterEach(() => {
  jest.resetModules();
  global.fetch = realFetch;
  process.env = { ...saved };
});

describe('matrix sendDocumentFromUrl — a failing R2 read never logs the URL', () => {
  it('falls back to fetching the URL; the fallback log line has the URL redacted', async () => {
    const fetchImpl = jest.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(4) }));
    const { service, client, logToFile } = loadService({ fetchImpl });

    await expect(service.sendDocumentFromUrl('matrix:@teacher:example.org', PUBLIC_URL, 'plan.pdf')).resolves.toBe(true);
    expect(fetchImpl).toHaveBeenCalledWith(PUBLIC_URL);
    expect(client.uploadContent).toHaveBeenCalled();

    const text = JSON.stringify(logToFile.mock.calls);
    expect(text).toContain('R2 download failed');
    expect(text).not.toContain(PUBLIC_URL);
    expect(text).not.toContain('lesson-plan-9f');
  });

  it('when the fetch fails too, the final error line carries no URL either', async () => {
    const fetchImpl = jest.fn(async () => { throw new Error(`fetch failed: ${PUBLIC_URL}`); });
    const { service, logToFile } = loadService({ fetchImpl });

    await expect(service.sendDocumentFromUrl('matrix:@teacher:example.org', PUBLIC_URL, 'plan.pdf')).resolves.toBe(false);

    const text = JSON.stringify(logToFile.mock.calls);
    expect(text).toContain('error sending document from URL');
    expect(text).not.toContain(PUBLIC_URL);
    expect(text).not.toContain('lesson-plan-9f');
  });
});
