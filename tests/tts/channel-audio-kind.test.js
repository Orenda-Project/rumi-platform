/**
 * Soniox speaks in Ogg Opus; every other voice is MP3. The channel drivers read which one they were handed
 * from the bytes, so an Ogg note goes out labelled as Ogg (a voice message on WhatsApp) and an MP3 goes out
 * exactly as it always has.
 */

const { audioKind } = require('../../bot/shared/services/messaging/audio-kind');
const { tinyOggOpus } = require('./_ogg');

describe('audioKind', () => {
  it('recognises Ogg Opus by its OggS capture pattern', () => {
    expect(audioKind(tinyOggOpus())).toMatchObject({ isOgg: true, ext: 'ogg', mime: 'audio/ogg; codecs=opus' });
  });

  it('treats everything else as MP3, as before', () => {
    expect(audioKind(Buffer.from('ID3....'))).toMatchObject({ isOgg: false, ext: 'mp3', mime: 'audio/mpeg' });
    expect(audioKind(Buffer.alloc(2))).toMatchObject({ isOgg: false });
    expect(audioKind(undefined)).toMatchObject({ isOgg: false });
  });
});

describe('baileys driver sendAudio', () => {
  function loadBaileys() {
    jest.resetModules();
    const sock = { sendMessage: jest.fn(async () => ({})), sendPresenceUpdate: jest.fn(async () => {}) };
    jest.doMock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
    jest.doMock('../../bot/shared/storage/r2', () => ({ downloadFromR2: jest.fn(), extractKeyFromUrl: jest.fn() }));
    jest.doMock('../../bot/shared/services/messaging/pending-options', () => ({
      remember: jest.fn(), get: jest.fn(), clear: jest.fn(), resolveSelection: jest.fn(() => null),
    }));
    jest.doMock('../../bot/shared/services/messaging/baileys-connection', () => ({
      getSocket: jest.fn().mockResolvedValue(sock),
      isConnected: jest.fn().mockReturnValue(true),
      authDir: jest.fn().mockReturnValue('/tmp/never-used'),
    }));
    return { service: require('../../bot/shared/services/messaging/baileys-channel.service'), sock };
  }

  afterEach(() => jest.resetModules());

  it('sends an Ogg Opus note as a WhatsApp voice message (ptt)', async () => {
    const { service, sock } = loadBaileys();
    const ogg = tinyOggOpus();
    await expect(service.sendAudio('923001234567', ogg)).resolves.toBe(true);
    expect(sock.sendMessage).toHaveBeenCalledWith('923001234567@s.whatsapp.net', {
      audio: ogg, mimetype: 'audio/ogg; codecs=opus', ptt: true,
    });
  });

  it('sends an MP3 exactly as before', async () => {
    const { service, sock } = loadBaileys();
    const mp3 = Buffer.from('ID3-mp3');
    await service.sendAudio('923001234567', mp3);
    expect(sock.sendMessage).toHaveBeenCalledWith('923001234567@s.whatsapp.net', {
      audio: mp3, mimetype: 'audio/mpeg', ptt: false,
    });
  });
});
