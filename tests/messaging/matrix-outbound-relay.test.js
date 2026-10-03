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
  // Both sides derive the request signing key and the key namespace from these.
  process.env.MATRIX_ACCESS_TOKEN = 'syt_test_token';
  process.env.MATRIX_HOMESERVER_URL = 'https://matrix.example.org';
  // eslint-disable-next-line global-require
  relay = require('../../bot/shared/services/messaging/matrix-outbound-relay');
  return relay;
}

const ENV_KEYS = ['REDIS_URL', 'MATRIX_ACCESS_TOKEN', 'MATRIX_HOMESERVER_URL'];
const savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));

afterEach(() => {
  if (relay) relay._resetForTests();
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k]; else process.env[k] = savedEnv[k];
  }
  jest.resetModules();
});

const TO = 'mtx:15550100101';

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

  it('no MATRIX_ACCESS_TOKEN: nothing can be signed, so the call resolves false and the owner does not start', async () => {
    loadRelay();
    delete process.env.MATRIX_ACCESS_TOKEN;
    await expect(relay.call('sendMessage', [TO, 'hi'])).resolves.toBe(false);
    expect(server.lists.size).toBe(0);
    expect(relay.startOwner({})).toBe(false);
  });
});

describe('matrix-outbound-relay -- process roles', () => {
  // Relay is the default: only the bot owns the sync connection. A process
  // that forgot to opt in (the stale-session cron, the brief worker, a
  // script) used to open a second sync on the bot's device, and Synapse
  // refused its key upload while its send still "resolved".
  it('relay mode is ON by default, in any process that has not claimed the connection', () => {
    loadRelay();
    expect(relay.isRelayMode()).toBe(true);
  });

  it('the bot claims the connection with ownConnectionInThisProcess(), which turns relay mode off', () => {
    loadRelay();
    relay.ownConnectionInThisProcess();
    expect(relay.isRelayMode()).toBe(false);
  });

  it('useRelayForThisProcess() still forces relay mode (the worker calls it explicitly), and the owner loop is never relayed', () => {
    loadRelay();
    relay.ownConnectionInThisProcess();
    relay.useRelayForThisProcess();
    expect(relay.isRelayMode()).toBe(true);
    relay.startOwner({});
    expect(relay.isRelayMode()).toBe(false);
  });

  it('a process that never opted in sends a Matrix message over the relay, without opening a client', async () => {
    loadRelay();
    const getClient = jest.fn();
    jest.doMock('../../bot/shared/services/messaging/matrix-connection', () => ({ getClient, isE2eeActive: () => true }));
    jest.doMock('../../bot/shared/storage/r2', () => ({ downloadFromR2: jest.fn(), extractKeyFromUrl: jest.fn() }));
    // eslint-disable-next-line global-require
    const driver = require('../../bot/shared/services/messaging/matrix-channel.service');
    relay._setTimeoutForTests(50);
    try {
      await driver.sendMessage(TO, 'Your session is about to expire');
      const queued = server.lists.get(relay._requestListKey()) || [];
      expect(queued.map((r) => JSON.parse(r).method)).toContain('sendMessage');
      expect(getClient).not.toHaveBeenCalled();
    } finally {
      jest.dontMock('../../bot/shared/services/messaging/matrix-connection');
      jest.dontMock('../../bot/shared/storage/r2');
    }
  });

  it('the bot and the smoke script claim the connection before they connect', () => {
    const read = (rel) => fs.readFileSync(path.join(__dirname, '../..', rel), 'utf8');
    const bot = read('bot/whatsapp-bot.js');
    const matrixEntry = bot.slice(bot.indexOf('  matrix: {'), bot.indexOf('close:', bot.indexOf('  matrix: {')));
    expect(matrixEntry.indexOf('ownConnectionInThisProcess()')).toBeGreaterThan(-1);
    expect(matrixEntry.indexOf('ownConnectionInThisProcess()')).toBeLessThan(matrixEntry.indexOf('.attach(dispatch)'));
    expect(read('bot/scripts/matrix-smoke.js')).toMatch(/ownConnectionInThisProcess\(\)/);
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
    // One call to hold the typing and one to let go; the owner does the refreshing.
    const holder = call.mock.calls.find(([method]) => method === '_holdTyping')[1][1];
    expect(call).toHaveBeenCalledWith('_holdTyping', [TO, holder]);
    expect(call).toHaveBeenCalledWith('_releaseTyping', [TO, holder]);
    expect(getClient).not.toHaveBeenCalled();
  });
});
