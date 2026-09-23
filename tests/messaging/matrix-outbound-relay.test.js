/**
 * matrix-outbound-relay.js -- the worker ships Matrix driver calls over Redis to
 * the one process that owns the sync connection, instead of opening a second
 * MatrixClient on the same token + crypto store. Redis is replaced by an
 * in-memory fake that implements exactly the list commands the relay uses
 * (lpush / brpop / expire), shared by every "connection" like a real server.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

function fakeRedisServer() {
  const lists = new Map();
  class FakeRedis {
    constructor() { this.closed = false; }

    async lpush(key, value) {
      if (!lists.has(key)) lists.set(key, []);
      lists.get(key).unshift(value);
      return lists.get(key).length;
    }

    async brpop(key, timeoutSeconds) {
      const deadline = Date.now() + timeoutSeconds * 1000;
      while (!this.closed) {
        const list = lists.get(key);
        if (list && list.length) return [key, list.pop()];
        if (Date.now() >= deadline) return null;
        // eslint-disable-next-line no-await-in-loop
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      return null;
    }

    async expire() { return 1; }

    disconnect() { this.closed = true; }
  }
  return { FakeRedis, lists };
}

let relay;
let server;

function loadRelay({ redisUrl = 'redis://fake:6379' } = {}) {
  jest.resetModules();
  server = fakeRedisServer();
  jest.doMock('ioredis', () => server.FakeRedis);
  jest.doMock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
  if (redisUrl) process.env.REDIS_URL = redisUrl; else delete process.env.REDIS_URL;
  // eslint-disable-next-line global-require
  relay = require('../../bot/shared/services/messaging/matrix-outbound-relay');
  return relay;
}

const savedRedisUrl = process.env.REDIS_URL;

afterEach(() => {
  if (relay) relay._resetForTests();
  if (savedRedisUrl === undefined) delete process.env.REDIS_URL; else process.env.REDIS_URL = savedRedisUrl;
  jest.resetModules();
});

const TO = 'mtx:923001230001';

describe('matrix-outbound-relay -- round trip through the sync owner', () => {
  it('sendDocument: the worker-local PDF crosses by value and the owner sends it from its own temp copy, then cleans up', async () => {
    loadRelay();
    const seen = {};
    relay.startOwner({
      sendDocument: jest.fn(async (to, filePath, filename, caption) => {
        seen.to = to;
        seen.path = filePath;
        seen.bytes = fs.readFileSync(filePath, 'utf-8');
        seen.filename = filename;
        seen.caption = caption;
        return true;
      }),
    });

    const workerPdf = path.join(os.tmpdir(), `relay-test-${Date.now()}.pdf`);
    fs.writeFileSync(workerPdf, '%PDF-1.4 lesson plan');
    try {
      const result = await relay.call('sendDocument', [TO, workerPdf, 'lesson_plan_Fractions.pdf', 'Your lesson plan']);
      expect(result).toBe(true);
      expect(seen).toEqual(expect.objectContaining({
        to: TO, bytes: '%PDF-1.4 lesson plan', filename: 'lesson_plan_Fractions.pdf', caption: 'Your lesson plan',
      }));
      expect(seen.path).not.toBe(workerPdf); // the owner never assumes a shared filesystem
      expect(fs.existsSync(seen.path)).toBe(false); // its temp copy is removed after the call
    } finally {
      fs.unlinkSync(workerPdf);
    }
  });

  it('a file:// media URL is carried by value too, and arrives as a file:// URL on the owner', async () => {
    loadRelay();
    let received = null;
    relay.startOwner({
      sendAudioFromUrl: jest.fn(async (to, url) => {
        received = { url, bytes: fs.readFileSync(url.slice('file://'.length), 'utf-8') };
        return true;
      }),
    });
    const local = path.join(os.tmpdir(), `relay-test-${Date.now()}.mp3`);
    fs.writeFileSync(local, 'mp3bytes');
    try {
      await expect(relay.call('sendAudioFromUrl', [TO, `file://${local}`])).resolves.toBe(true);
      expect(received.url.startsWith('file://')).toBe(true);
      expect(received.url).not.toBe(`file://${local}`);
      expect(received.bytes).toBe('mp3bytes');
    } finally {
      fs.unlinkSync(local);
    }
  });

  it('Buffers cross in both directions (sendAudio in, downloadMedia out)', async () => {
    loadRelay();
    const sendAudio = jest.fn(async () => true);
    relay.startOwner({ sendAudio, downloadMedia: jest.fn(async () => Buffer.from('decrypted voice note')) });

    await expect(relay.call('sendAudio', [TO, Buffer.from('tts-mp3'), '/tmp'])).resolves.toBe(true);
    expect(Buffer.isBuffer(sendAudio.mock.calls[0][1])).toBe(true);
    expect(sendAudio.mock.calls[0][1].toString()).toBe('tts-mp3');

    const buffer = await relay.call('downloadMedia', ['matrix:mxc://localhost/abc']);
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.toString()).toBe('decrypted voice note');
  });

  it('an id-returning method passes its id back', async () => {
    loadRelay();
    relay.startOwner({ sendTextReturningId: jest.fn(async () => '$event1') });
    await expect(relay.call('sendTextReturningId', [TO, 'hi'])).resolves.toBe('$event1');
  });
});

describe('matrix-outbound-relay -- failures are reported the way the driver reports them', () => {
  it('an owner-side exception becomes false for a send, and a throw for the media lookups', async () => {
    loadRelay();
    relay.startOwner({
      sendMessage: jest.fn(async () => { throw new Error('M_FORBIDDEN'); }),
      getMediaInfo: jest.fn(async () => { throw new Error('no cached media info'); }),
    });
    await expect(relay.call('sendMessage', [TO, 'hi'])).resolves.toBe(false);
    await expect(relay.call('getMediaInfo', ['matrix:mxc://x/1'])).rejects.toThrow(/no cached media info/);
  });

  it('an unknown method is refused by the owner (false), never executed', async () => {
    loadRelay();
    relay.startOwner({});
    await expect(relay.call('sendNothing', [TO])).resolves.toBe(false);
  });

  it('no owner running: the call times out and resolves false / null instead of hanging', async () => {
    loadRelay();
    relay._setTimeoutForTests(50);
    await expect(relay.call('sendMessage', [TO, 'hi'])).resolves.toBe(false);
    await expect(relay.call('sendTextReturningId', [TO, 'hi'])).resolves.toBeNull();
  });

  it('no REDIS_URL: resolves false and startOwner reports it did not start', async () => {
    loadRelay({ redisUrl: null });
    await expect(relay.call('sendMessage', [TO, 'hi'])).resolves.toBe(false);
    expect(relay.startOwner({})).toBe(false);
  });

  it('the owner drops a request its caller has already given up on', async () => {
    loadRelay();
    const sendMessage = jest.fn(async () => true);
    const redis = new server.FakeRedis();
    await redis.lpush(relay.REQUEST_LIST, JSON.stringify({
      id: 'stale', method: 'sendMessage', args: [TO, 'late'], expiresAt: Date.now() - 1000,
    }));
    await relay._runRequest(redis, { id: 'stale', method: 'sendMessage', args: [TO, 'late'], expiresAt: Date.now() - 1000 }, { sendMessage });
    expect(sendMessage).not.toHaveBeenCalled();
  });
});

describe('matrix-outbound-relay -- process roles', () => {
  it('relay mode is off by default, on after useRelayForThisProcess(), and off again in the owner', () => {
    loadRelay();
    expect(relay.isRelayMode()).toBe(false);
    relay.useRelayForThisProcess();
    expect(relay.isRelayMode()).toBe(true);
    relay.startOwner({});
    expect(relay.isRelayMode()).toBe(false);
  });

  it('matrix-connection refuses to open a sync connection in a relay-mode process', async () => {
    loadRelay();
    relay.useRelayForThisProcess();
    // eslint-disable-next-line global-require
    const connection = require('../../bot/shared/services/messaging/matrix-connection');
    await expect(connection.getClient()).rejects.toThrow(/relay/);
  });

  it('the Matrix driver, in relay mode, ships the call to the relay and never touches a local client', async () => {
    loadRelay();
    const getClient = jest.fn();
    jest.doMock('../../bot/shared/services/messaging/matrix-connection', () => ({ getClient, isE2eeActive: () => true }));
    jest.doMock('../../bot/shared/storage/r2', () => ({ downloadFromR2: jest.fn(), extractKeyFromUrl: jest.fn() }));
    // eslint-disable-next-line global-require
    const driver = require('../../bot/shared/services/messaging/matrix-channel.service');
    relay.useRelayForThisProcess();
    const call = jest.spyOn(relay, 'call').mockResolvedValue(true);

    await expect(driver.sendDocument(TO, '/tmp/lp.pdf', 'lp.pdf', 'here')).resolves.toBe(true);
    expect(call).toHaveBeenCalledWith('sendDocument', [TO, '/tmp/lp.pdf', 'lp.pdf', 'here']);

    const controller = driver.startContinuousTypingIndicator(TO);
    controller.stop();
    await new Promise((resolve) => setImmediate(resolve));
    expect(call).toHaveBeenCalledWith('showTypingIndicator', [TO]);
    expect(call).toHaveBeenCalledWith('_stopTypingIndicator', [TO]);
    expect(getClient).not.toHaveBeenCalled();
  });
});
