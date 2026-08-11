/**
 * baileys-channel.service.js — behavior of the REAL (connection-backed)
 * methods. baileys-connection.js is always mocked here so nothing ever opens
 * a real socket; tests/messaging/channel-driver-parity.test.js covers the
 * still-stubbed Meta-template-only methods and cross-driver existence.
 */

function loadService({ sendMessageImpl, sendPresenceUpdateImpl } = {}) {
  jest.resetModules();
  const sock = {
    sendMessage: jest.fn(sendMessageImpl || (async () => ({}))),
    sendPresenceUpdate: jest.fn(sendPresenceUpdateImpl || (async () => {})),
  };
  jest.doMock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
  jest.doMock('../../bot/shared/storage/r2', () => ({
    downloadFromR2: jest.fn(),
    extractKeyFromUrl: jest.fn((url) => url.split('/').pop()),
  }));
  // The driver records rendered menus here so numeric replies can be resolved
  // (see pending-options.js). Mocked so a unit test never opens a real Redis
  // connection — that leaks a handle and Jest can't exit.
  jest.doMock('../../bot/shared/services/messaging/pending-options', () => ({
    remember: jest.fn().mockResolvedValue(undefined),
    get: jest.fn().mockResolvedValue(null),
    clear: jest.fn().mockResolvedValue(undefined),
    resolveSelection: jest.fn(() => null),
  }));
  jest.doMock('../../bot/shared/services/messaging/baileys-connection', () => ({
    getSocket: jest.fn().mockResolvedValue(sock),
    isConnected: jest.fn().mockReturnValue(true),
    authDir: jest.fn().mockReturnValue('/tmp/never-used'),
  }));
  const service = require('../../bot/shared/services/messaging/baileys-channel.service');
  const { downloadFromR2 } = require('../../bot/shared/storage/r2');
  return { service, sock, downloadFromR2 };
}

afterEach(() => jest.resetModules());

describe('baileys-channel.service — outbound', () => {
  it('sendMessage sends {text} to the phone-number JID and strips emotion tags', async () => {
    const { service, sock } = loadService();
    const result = await service.sendMessage('923001234567', '[warmly] Hello there');
    expect(result).toBe(true);
    expect(sock.sendMessage).toHaveBeenCalledWith('923001234567@s.whatsapp.net', { text: 'Hello there' });
  });

  it('sendMessage returns false (never throws) when the socket rejects', async () => {
    const { service } = loadService({ sendMessageImpl: async () => { throw new Error('boom'); } });
    await expect(service.sendMessage('923001234567', 'hi')).resolves.toBe(false);
  });

  it('sendReaction sends a react content with fromMe:false against the sender\'s JID', async () => {
    const { service, sock } = loadService();
    const result = await service.sendReaction('923001234567', 'wamid.ABC', '❤️');
    expect(result).toBe(true);
    expect(sock.sendMessage).toHaveBeenCalledWith('923001234567@s.whatsapp.net', {
      react: { text: '❤️', key: { remoteJid: '923001234567@s.whatsapp.net', id: 'wamid.ABC', fromMe: false } },
    });
  });

  it('showTypingIndicator sends a composing presence update to the JID', async () => {
    const { service, sock } = loadService();
    const result = await service.showTypingIndicator('923001234567', 'msg-1');
    expect(result).toBe(true);
    expect(sock.sendPresenceUpdate).toHaveBeenCalledWith('composing', '923001234567@s.whatsapp.net');
  });

  it('startContinuousTypingIndicator fires an immediate typing update and repeats until stop()', async () => {
    jest.useFakeTimers();
    const { service, sock } = loadService();
    const controller = service.startContinuousTypingIndicator('923001234567', 'msg-1');
    expect(typeof controller.stop).toBe('function');
    // advanceTimersByTimeAsync(0) flushes pending microtasks (getSock() then
    // sock.sendPresenceUpdate()) in lockstep with fake timers — a plain
    // Promise.resolve() tick doesn't reliably drain that chain under fake timers.
    await jest.advanceTimersByTimeAsync(0);

    expect(sock.sendPresenceUpdate).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(20000);
    expect(sock.sendPresenceUpdate).toHaveBeenCalledTimes(2);

    controller.stop();
    await jest.advanceTimersByTimeAsync(60000);
    expect(sock.sendPresenceUpdate).toHaveBeenCalledTimes(2); // no further calls after stop
    jest.useRealTimers();
  });
});

describe('baileys-channel.service — inbound media bridge', () => {
  it('getMediaInfo/downloadMedia return the cached buffer once cacheIncomingMedia has been called', async () => {
    const { service } = loadService();
    const buffer = Buffer.from('fake-audio-bytes');
    service._cacheIncomingMedia('synthetic-id-1', buffer, 'audio/ogg');

    const info = await service.getMediaInfo('synthetic-id-1');
    expect(info.mime_type).toBe('audio/ogg');
    expect(info.file_size).toBe(buffer.length);

    const downloaded = await service.downloadMedia('synthetic-id-1');
    expect(downloaded).toBe(buffer);
  });

  it('getMediaInfo/downloadMedia reject with a clear message for an id that was never cached', async () => {
    const { service } = loadService();
    await expect(service.downloadMedia('unknown-id')).rejects.toThrow(/no cached media for id "unknown-id"/);
  });

  it('a cached media entry can be read multiple times (handlers call downloadMedia repeatedly)', async () => {
    const { service } = loadService();
    const buffer = Buffer.from('bytes');
    service._cacheIncomingMedia('id-2', buffer, 'image/jpeg');
    await service.downloadMedia('id-2');
    const second = await service.downloadMedia('id-2');
    expect(second).toBe(buffer);
  });
});

describe('baileys-channel.service — URL-based senders', () => {
  // Two ways to resolve a media URL, and which is right depends on the URL, not
  // on the call site: an authenticated R2 download for a private object, or
  // handing Baileys `{url}` to stream a public one. Live testing found /video
  // dying with "S3Client cannot be constructed — missing env: R2_ENDPOINT…" on a
  // video whose URL was PUBLIC — on a sandbox, which by definition has no R2
  // keys. So the R2 path is exercised with R2 configured, and the direct path
  // without.
  const R2_ENV = {
    R2_ENDPOINT: 'https://acc.r2.cloudflarestorage.com',
    R2_ACCESS_KEY_ID: 'test-key',
    R2_SECRET_ACCESS_KEY: 'test-secret',
  };

  function withR2(enabled) {
    for (const key of Object.keys(R2_ENV)) {
      if (enabled) process.env[key] = R2_ENV[key];
      else delete process.env[key];
    }
  }

  afterEach(() => withR2(false));

  describe('with R2 configured (private objects)', () => {
    it('sendImageFromUrl downloads via R2 then sends an image message', async () => {
      withR2(true);
      const { service, sock, downloadFromR2 } = loadService();
      downloadFromR2.mockResolvedValue(Buffer.from('PNGDATA'));
      const result = await service.sendImageFromUrl('923001234567', 'https://r2.example/bucket/img.png', 'a caption');
      expect(result).toBe(true);
      expect(sock.sendMessage).toHaveBeenCalledWith('923001234567@s.whatsapp.net', {
        image: Buffer.from('PNGDATA'), caption: 'a caption',
      });
    });

    it('sendAudioFromUrl downloads via R2 then sends an audio message', async () => {
      withR2(true);
      const { service, sock, downloadFromR2 } = loadService();
      downloadFromR2.mockResolvedValue(Buffer.from('AUDIODATA'));
      const result = await service.sendAudioFromUrl('923001234567', 'https://r2.example/bucket/a.mp3');
      expect(result).toBe(true);
      expect(sock.sendMessage).toHaveBeenCalledWith('923001234567@s.whatsapp.net', {
        audio: Buffer.from('AUDIODATA'), mimetype: 'audio/mpeg', ptt: false,
      });
    });

    it('falls back to fetching the URL directly when the object is not in R2', async () => {
      // A configured R2 does not mean every URL lives in it — a public CDN URL
      // from another bucket must still send.
      withR2(true);
      const { service, sock, downloadFromR2 } = loadService();
      downloadFromR2.mockRejectedValue(new Error('NoSuchKey'));
      const result = await service.sendImageFromUrl('923001234567', 'https://cdn.example/img.png');
      expect(result).toBe(true);
      expect(sock.sendMessage).toHaveBeenCalledWith('923001234567@s.whatsapp.net', {
        image: { url: 'https://cdn.example/img.png' }, caption: '',
      });
    });
  });

  describe('without R2 configured (the sandbox case)', () => {
    it('hands Baileys the public URL to stream, never touching the R2 client', async () => {
      const { service, sock, downloadFromR2 } = loadService();
      const url = 'https://pub-abc.r2.dev/videos/lesson.mp4';
      const result = await service.sendVideoFromUrl('923001234567', url, 'a caption');
      expect(result).toBe(true);
      expect(downloadFromR2).not.toHaveBeenCalled();
      expect(sock.sendMessage).toHaveBeenCalledWith('923001234567@s.whatsapp.net', {
        video: { url }, caption: 'a caption',
      });
    });

    it('sendImageFromUrl streams a public URL too', async () => {
      const { service, sock } = loadService();
      const result = await service.sendImageFromUrl('923001234567', 'https://cdn.example/i.png');
      expect(result).toBe(true);
      expect(sock.sendMessage.mock.calls[0][1].image).toEqual({ url: 'https://cdn.example/i.png' });
    });

    it('returns false for a non-absolute URL, which nothing here could fetch', async () => {
      const { service, sock } = loadService();
      await expect(service.sendImageFromUrl('923001234567', '/feature_videos/intro.mp4')).resolves.toBe(false);
      expect(sock.sendMessage).not.toHaveBeenCalled();
    });
  });

  describe('file:// URLs — media this deployment generated locally', () => {
    // A deployment with no bucket writes generated media to disk and hands back a
    // file:// URL (see reading/analysis.service.js's report PDF). Without this the
    // report was rendered, then undeliverable.
    const os = require('os');
    const nodeFs = require('fs');
    const nodePath = require('path');

    it('reads the local file and sends its bytes', async () => {
      const { service, sock, downloadFromR2 } = loadService();
      const dir = nodeFs.mkdtempSync(nodePath.join(os.tmpdir(), 'rumi-doc-'));
      const file = nodePath.join(dir, 'report.pdf');
      nodeFs.writeFileSync(file, 'PDFBYTES');

      const result = await service.sendDocumentFromUrl('923001234567', `file://${file}`, 'report.pdf', 'caption');

      expect(result).toBe(true);
      expect(downloadFromR2).not.toHaveBeenCalled();
      expect(sock.sendMessage.mock.calls[0][1].document).toEqual(Buffer.from('PDFBYTES'));
    });

    it('returns false when the local file has been cleaned up', async () => {
      const { service } = loadService();
      await expect(service.sendDocumentFromUrl('923001234567', 'file:///nope/gone.pdf', 'x.pdf'))
        .resolves.toBe(false);
    });
  });

  it('returns false (does not throw) when the R2 download fails and the URL is unusable', async () => {
    withR2(true);
    const { service, downloadFromR2 } = loadService();
    downloadFromR2.mockRejectedValue(new Error('R2 403'));
    await expect(service.sendImageFromUrl('923001234567', 'not-a-url')).resolves.toBe(false);
  });
});

describe('baileys-channel.service — sendImage/sendSticker media-ID limitation', () => {
  it('sendImage refuses a bare media ID (no "/" or "\\\\") — Baileys has no upload-once/reuse-by-id step', async () => {
    const { service, sock } = loadService();
    const result = await service.sendImage('923001234567', '1234567890123456');
    expect(result).toBe(false);
    expect(sock.sendMessage).not.toHaveBeenCalled();
  });
});

describe('baileys-channel.service — interactive/list methods render as numbered plain text', () => {
  it('sendInteractiveButtons renders the body + numbered button titles as text', async () => {
    const { service, sock } = loadService();
    await service.sendInteractiveButtons('923001234567', {
      body: 'Pick one', buttons: [{ id: 'a', title: 'Option A' }, { id: 'b', title: 'Option B' }],
    });
    const [, content] = sock.sendMessage.mock.calls[0];
    expect(content.text).toContain('Pick one');
    expect(content.text).toContain('1. Option A');
    expect(content.text).toContain('2. Option B');
  });

  it('sendLanguageSelectionList renders all language options as a numbered list', async () => {
    const { service, sock } = loadService();
    await service.sendLanguageSelectionList('923001234567');
    const [, content] = sock.sendMessage.mock.calls[0];
    expect(content.text).toContain('1. Auto-detect');
    expect(content.text).toMatch(/اردو/);
  });

  it('sendStyleListFallback and sendFeatureMenuListFallback render their option lists as text', async () => {
    const { service, sock } = loadService();
    await service.sendStyleListFallback('923001234567');
    expect(sock.sendMessage.mock.calls[0][1].text).toContain('Photorealistic');

    sock.sendMessage.mockClear();
    await service.sendFeatureMenuListFallback('923001234567');
    expect(sock.sendMessage.mock.calls[0][1].text).toContain('Lesson Plans');
  });

  describe('rendered menus are recorded so numeric replies can resolve', () => {
    function loadWithStore() {
      jest.resetModules();
      const sock = { sendMessage: jest.fn(async () => ({})), sendPresenceUpdate: jest.fn(async () => {}) };
      const pending = { remember: jest.fn().mockResolvedValue(undefined) };
      jest.doMock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
      jest.doMock('../../bot/shared/storage/r2', () => ({
        downloadFromR2: jest.fn().mockResolvedValue(Buffer.from('IMG')),
        extractKeyFromUrl: jest.fn((u) => u.split('/').pop()),
      }));
      jest.doMock('../../bot/shared/services/messaging/baileys-connection', () => ({
        getSocket: jest.fn().mockResolvedValue(sock), isConnected: jest.fn(), authDir: jest.fn(),
      }));
      jest.doMock('../../bot/shared/services/messaging/pending-options', () => pending);
      return { service: require('../../bot/shared/services/messaging/baileys-channel.service'), pending, sock };
    }

    it('sendInteractiveButtons records the button ids as a button_reply menu', async () => {
      const { service, pending } = loadWithStore();
      await service.sendInteractiveButtons('923001234567', {
        body: 'Confirm?',
        buttons: [{ id: 'coaching_confirm_7', title: 'Yes' }, { id: 'coaching_cancel_7', title: 'No' }],
      });

      expect(pending.remember).toHaveBeenCalledWith('923001234567', {
        replyType: 'button_reply',
        options: [{ id: 'coaching_confirm_7', title: 'Yes' }, { id: 'coaching_cancel_7', title: 'No' }],
      });
    });

    it('sendLanguageSelectionList records the real lang_* ids in render order', async () => {
      // These ids must match meta-channel.service.js exactly — they are what
      // whatsapp-bot.js's `listId.startsWith('lang_')` branch dispatches on.
      const { service, pending } = loadWithStore();
      await service.sendLanguageSelectionList('923001234567');

      const [, menu] = pending.remember.mock.calls[0];
      expect(menu.replyType).toBe('list_reply');
      expect(menu.options[0].id).toBe('lang_auto');
      expect(menu.options[1].id).toBe('lang_en');
      expect(menu.options[2].id).toBe('lang_ur');
      // Render order must match the numbered text the user sees.
      expect(menu.options.map((o) => o.title)).toEqual(
        expect.arrayContaining(['Auto-detect', 'English', 'اردو'])
      );
    });

    it('sendStyleListFallback records the real style_* ids', async () => {
      const { service, pending } = loadWithStore();
      await service.sendStyleListFallback('923001234567');
      const [, menu] = pending.remember.mock.calls[0];
      expect(menu.options.map((o) => o.id)).toEqual([
        'style_photorealistic', 'style_infographic', 'style_cartoon', 'style_sketch',
      ]);
    });

    it('sendFeatureMenuListFallback records the real menu_* ids', async () => {
      const { service, pending } = loadWithStore();
      await service.sendFeatureMenuListFallback('923001234567');
      const [, menu] = pending.remember.mock.calls[0];
      expect(menu.options.map((o) => o.id)).toEqual([
        'menu_lesson_plan', 'menu_coaching', 'menu_reading', 'menu_video', 'menu_other',
      ]);
    });

    it('sendInteractiveMessage records list rows across all sections, flattened in order', async () => {
      const { service, pending } = loadWithStore();
      await service.sendInteractiveMessage('923001234567', {
        body: { text: 'Pick' },
        action: {
          sections: [
            { rows: [{ id: 'reading_lang_en', title: 'English' }] },
            { rows: [{ id: 'reading_lang_ur', title: 'Urdu' }] },
          ],
        },
      });
      const [, menu] = pending.remember.mock.calls[0];
      expect(menu.options.map((o) => o.id)).toEqual(['reading_lang_en', 'reading_lang_ur']);
    });

    it('records nothing when the options carry no ids — there would be nothing to route back to', async () => {
      const { service, pending } = loadWithStore();
      await service.sendInteractiveButtons('923001234567', {
        body: 'Pick', buttons: [{ title: 'No id here' }],
      });
      expect(pending.remember).not.toHaveBeenCalled();
    });
  });

  describe('toJid', () => {
    it('drops a :device suffix instead of folding it into the number', async () => {
      // Live bug: Baileys 7.x can yield device-scoped JIDs like `<number>:0`.
      // Stripping non-digits first turned that into `<number>0` — the real
      // number plus a trailing zero, a nonexistent destination that Baileys
      // still reports as successfully "sent".
      const { service } = loadService();
      expect(service._toJid('923001234567:0')).toBe('923001234567@s.whatsapp.net');
      expect(service._toJid('923001234567:0@s.whatsapp.net')).toBe('923001234567@s.whatsapp.net');
    });

    it('still normalises plain and prettified numbers', async () => {
      const { service } = loadService();
      expect(service._toJid('923001234567')).toBe('923001234567@s.whatsapp.net');
      expect(service._toJid('+92 300 123 4567')).toBe('923001234567@s.whatsapp.net');
    });
  });
});
