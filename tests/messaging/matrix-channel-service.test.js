/**
 * matrix-channel.service.js -- behavior of the REAL (matrix-bot-sdk-backed)
 * methods. matrix-connection.js (the shared sync client owner) is always
 * mocked here so nothing ever opens a real sync connection; pending-options
 * is mocked so a unit test never opens a real Redis connection (same
 * rationale as baileys-channel-service.test.js). tests/messaging/
 * channel-driver-parity.test.js covers the still-stubbed Meta-template-only
 * methods and cross-driver existence.
 */

function loadService({ sendMessageImpl, fetchImpl, dmRoomId = '!room:example.org' } = {}) {
  jest.resetModules();
  const sentMessages = [];
  const client = {
    sendMessage: jest.fn(sendMessageImpl || (async (roomId, content) => {
      sentMessages.push({ roomId, content });
      return '$event123';
    })),
    sendEvent: jest.fn(async () => '$event456'),
    setTyping: jest.fn(async () => {}),
    uploadContent: jest.fn(async () => 'mxc://example.org/abc123'),
    downloadContent: jest.fn(async () => ({ data: Buffer.from('data'), contentType: 'image/png' })),
    createRoom: jest.fn(async () => '!newroom:example.org'),
    dms: { getOrCreateDm: jest.fn(async () => dmRoomId) },
    storageProvider: { readValue: jest.fn(async () => null), storeValue: jest.fn(async () => {}) },
  };

  jest.doMock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
  jest.doMock('../../bot/shared/storage/r2', () => ({
    downloadFromR2: jest.fn(),
    extractKeyFromUrl: jest.fn((url) => url.split('/').pop()),
  }));
  jest.doMock('../../bot/shared/services/messaging/pending-options', () => ({
    remember: jest.fn().mockResolvedValue(undefined),
    get: jest.fn().mockResolvedValue(null),
    clear: jest.fn().mockResolvedValue(undefined),
    resolveSelection: jest.fn(() => null),
  }));
  // text-flow.js lazy-requires the Redis service; reject so its in-memory
  // fallback runs and no socket is opened (same as baileys-socket-adapter.test.js).
  jest.doMock('../../bot/shared/services/cache/railway-redis.service', () => ({
    set: jest.fn().mockRejectedValue(new Error('redis disabled in tests')),
    get: jest.fn().mockRejectedValue(new Error('redis disabled in tests')),
    delete: jest.fn().mockRejectedValue(new Error('redis disabled in tests')),
  }));
  jest.doMock('../../bot/shared/services/messaging/matrix-connection', () => ({
    getClient: jest.fn(async () => client),
    isE2eeActive: jest.fn(() => false),
  }));

  if (fetchImpl) global.fetch = fetchImpl;

  const service = require('../../bot/shared/services/messaging/matrix-channel.service');
  const logger = require('../../bot/shared/utils/logger');
  const pendingOptions = require('../../bot/shared/services/messaging/pending-options');
  return { service, client, logger, sentMessages, pendingOptions };
}

const realFetch = global.fetch;

afterEach(() => {
  jest.resetModules();
  global.fetch = realFetch;
});

const TO = 'matrix:@teacher:example.org';

describe('matrix-channel.service -- identity', () => {
  it('strips the "matrix:" prefix before ever resolving a DM room -- the remainder still carries its own colon', async () => {
    const { service, client } = loadService();
    await service.sendMessage(TO, 'hi');
    expect(client.dms.getOrCreateDm).toHaveBeenCalledWith('@teacher:example.org', expect.any(Function));
  });

  it('caches the resolved DM room so a second send skips getOrCreateDm entirely', async () => {
    const { service, client } = loadService();
    await service.sendMessage(TO, 'first');
    await service.sendMessage(TO, 'second');
    expect(client.dms.getOrCreateDm).toHaveBeenCalledTimes(1);
    expect(client.sendMessage).toHaveBeenCalledTimes(2);
  });
});

describe('matrix-channel.service -- outbound text', () => {
  it('sendMessage sends plain text with no formatted_body when the text is not markdown-ish', async () => {
    const { service, sentMessages } = loadService();
    const result = await service.sendMessage(TO, 'Hello there');
    expect(result).toBe(true);
    expect(sentMessages[0].content).toEqual({ msgtype: 'm.text', body: 'Hello there' });
  });

  it('sendMessage strips emotion tags before sending', async () => {
    const { service, sentMessages } = loadService();
    await service.sendMessage(TO, '[warmly] Hello there');
    expect(sentMessages[0].content.body).toBe('Hello there');
  });

  it('sendMessage adds a formatted_body when the text looks like markdown', async () => {
    const { service, sentMessages } = loadService();
    await service.sendMessage(TO, 'This is **important**');
    expect(sentMessages[0].content).toEqual({
      msgtype: 'm.text',
      body: 'This is **important**',
      format: 'org.matrix.custom.html',
      formatted_body: 'This is <strong>important</strong>',
    });
  });

  describe('WhatsApp formatting markers become Matrix HTML (a single * is BOLD, as on WhatsApp)', () => {
    const html = async (text) => {
      const { service, sentMessages } = loadService();
      await service.sendMessage(TO, text);
      return sentMessages[0].content;
    };

    it('*bold*, _italic_, ~strike~', async () => {
      const content = await html('*Lesson Plan* for _Grade 4_ ~not~ now');
      expect(content.body).toBe('*Lesson Plan* for _Grade 4_ ~not~ now');
      expect(content.format).toBe('org.matrix.custom.html');
      expect(content.formatted_body).toBe('<strong>Lesson Plan</strong> for <em>Grade 4</em> <del>not</del> now');
    });

    it('```monospace``` and `inline code`, with no formatting applied inside code', async () => {
      const content = await html('Run ```a *b* c``` then `x_y_z`');
      expect(content.formatted_body).toBe('Run <pre><code>a *b* c</code></pre> then <code>x_y_z</code>');
    });

    it('multi-line messages keep their line breaks; bold at the start of each line', async () => {
      const content = await html('*Step 1:* Warm up\n*Step 2:* Explain');
      expect(content.formatted_body).toBe('<strong>Step 1:</strong> Warm up<br/><strong>Step 2:</strong> Explain');
    });

    it('bold inside quotes/parentheses and before punctuation', async () => {
      const content = await html('Say "*hello*" (or *salaam*), then *start*!');
      expect(content.formatted_body).toBe('Say &quot;<strong>hello</strong>&quot; (or <strong>salaam</strong>), then <strong>start</strong>!');
    });

    it('arithmetic, snake_case, URLs and a lone tilde are NOT formatted -- plain body, no formatted_body', async () => {
      for (const text of ['2 * 3 * 4 = 24', 'use file_name_here', 'see https://x.org/a_b_c/', 'takes ~ 5 minutes', 'a*b*c']) {
        // eslint-disable-next-line no-await-in-loop
        const content = await html(text);
        expect(content).toEqual({ msgtype: 'm.text', body: text });
      }
    });

    it('HTML in the text is escaped, never injected', async () => {
      const content = await html('*hi* <script>alert(1)</script>');
      expect(content.formatted_body).toBe('<strong>hi</strong> &lt;script&gt;alert(1)&lt;/script&gt;');
    });

    it('only http(s)/mailto markdown links become anchors', async () => {
      // (an all-letters label like "[guide]" is stripped earlier as an emotion tag, on every channel)
      const good = await html('[Guide v2](https://rumi.org/guide)');
      expect(good.formatted_body).toBe('<a href="https://rumi.org/guide">Guide v2</a>');
      const bad = await html('[x1](javascript:alert(1)) and *b*');
      expect(bad.formatted_body).not.toContain('<a ');
    });

    it('Urdu text with bold markers renders too', async () => {
      const content = await html('*لیسن پلان* تیار ہے');
      expect(content.formatted_body).toBe('<strong>لیسن پلان</strong> تیار ہے');
    });
  });

  it('sendMessage returns false (never throws) when the send call rejects', async () => {
    const { service } = loadService({ sendMessageImpl: async () => { throw new Error('boom'); } });
    await expect(service.sendMessage(TO, 'hi')).resolves.toBe(false);
  });

  it('sendTextReturningId returns the sent event id', async () => {
    const { service } = loadService({ sendMessageImpl: async () => '$abc123' });
    const id = await service.sendTextReturningId(TO, 'hi');
    expect(id).toBe('$abc123');
  });

  it('sendTextReturningId sets an m.in_reply_to relation when a contextMessageId is given', async () => {
    const { service, sentMessages } = loadService();
    await service.sendTextReturningId(TO, 'hi', { contextMessageId: '$parent001' });
    expect(sentMessages[0].content['m.relates_to']).toEqual({ 'm.in_reply_to': { event_id: '$parent001' } });
  });
});

describe('matrix-channel.service -- reactions and typing', () => {
  it('sendReaction sends a real m.reaction event with an m.annotation relation', async () => {
    const { service, client } = loadService();
    const result = await service.sendReaction(TO, '$targetEvent', '❤️');
    expect(result).toBe(true);
    expect(client.sendEvent).toHaveBeenCalledWith('!room:example.org', 'm.reaction', {
      'm.relates_to': { rel_type: 'm.annotation', event_id: '$targetEvent', key: '❤️' },
    });
  });

  it('showTypingIndicator is a REAL implementation -- calls setTyping(roomId, true, ...)', async () => {
    const { service, client } = loadService();
    await expect(service.showTypingIndicator(TO)).resolves.toBe(true);
    expect(client.setTyping).toHaveBeenCalledWith('!room:example.org', true, expect.any(Number));
  });

  it('showTypingIndicator(to, eventId) also sends a read receipt for that event -- Meta marks the message read in the same call', async () => {
    const { service, client } = loadService();
    client.sendReadReceipt = jest.fn(async () => ({}));
    await expect(service.showTypingIndicator(TO, '$inbound1')).resolves.toBe(true);
    expect(client.sendReadReceipt).toHaveBeenCalledWith('!room:example.org', '$inbound1');
  });

  it('a failing read receipt never fails the typing indicator', async () => {
    const { service, client } = loadService();
    client.sendReadReceipt = jest.fn(async () => { throw new Error('M_FORBIDDEN'); });
    await expect(service.showTypingIndicator(TO, '$inbound1')).resolves.toBe(true);
    expect(client.setTyping).toHaveBeenCalled();
  });

  it('no read receipt without a Matrix event id (e.g. the continuous typing ticks)', async () => {
    const { service, client } = loadService();
    client.sendReadReceipt = jest.fn(async () => ({}));
    await service.showTypingIndicator(TO);
    await service.showTypingIndicator(TO, 'wamid.not-matrix');
    expect(client.sendReadReceipt).not.toHaveBeenCalled();
  });

  it('startContinuousTypingIndicator returns a real, callable controller, ticks immediately, repeats, and sends a final stop signal', async () => {
    jest.useFakeTimers();
    try {
      const { service, client } = loadService();
      const controller = service.startContinuousTypingIndicator(TO);
      expect(controller).not.toBeInstanceOf(Promise);
      expect(typeof controller.stop).toBe('function');

      await jest.advanceTimersByTimeAsync(0);
      expect(client.setTyping).toHaveBeenCalledWith('!room:example.org', true, expect.any(Number));
      const callsBeforeSecondTick = client.setTyping.mock.calls.length;

      await jest.advanceTimersByTimeAsync(8000);
      expect(client.setTyping.mock.calls.length).toBeGreaterThan(callsBeforeSecondTick);

      controller.stop();
      await jest.advanceTimersByTimeAsync(0);
      expect(client.setTyping).toHaveBeenCalledWith('!room:example.org', false, 0);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('matrix-channel.service -- media (cache-based, not a live API lookup)', () => {
  it('getMediaInfo throws for an id the inbound adapter never cached -- media must be consumed shortly after receipt', async () => {
    const { service } = loadService();
    await expect(service.getMediaInfo('matrix:mxc://example.org/never-cached')).rejects.toThrow(/no cached media info/);
  });

  it('getMediaInfo returns whatever the inbound adapter cached via _cacheIncomingMedia', async () => {
    const { service } = loadService();
    service._cacheIncomingMedia('matrix:mxc://example.org/F1', { url: 'mxc://example.org/F1', mime_type: 'image/png', file_size: 42 });
    const info = await service.getMediaInfo('matrix:mxc://example.org/F1');
    expect(info).toEqual({ url: 'mxc://example.org/F1', mime_type: 'image/png', file_size: 42 });
  });

  it('downloadMedia fetches the cached mxc:// URI via client.downloadContent', async () => {
    const { service, client } = loadService();
    service._cacheIncomingMedia('matrix:mxc://example.org/F1', { url: 'mxc://example.org/F1', mime_type: 'image/png', file_size: 42 });
    const buffer = await service.downloadMedia('matrix:mxc://example.org/F1');
    expect(client.downloadContent).toHaveBeenCalledWith('mxc://example.org/F1');
    expect(buffer).toEqual(Buffer.from('data'));
  });

  it('downloadMedia decrypts an E2EE attachment (cached EncryptedFile) via client.crypto.decryptMedia, never a raw download', async () => {
    const { service, client } = loadService();
    client.crypto = { decryptMedia: jest.fn(async () => Buffer.from('plaintext-voice-note')) };
    const file = { url: 'mxc://example.org/ENC1', key: { k: 'x' }, iv: 'iv', hashes: { sha256: 'h' }, v: 'v2' };
    service._cacheIncomingMedia('matrix:mxc://example.org/ENC1', {
      url: 'mxc://example.org/ENC1', mime_type: 'audio/ogg', file_size: 9, file,
    });
    const buffer = await service.downloadMedia('matrix:mxc://example.org/ENC1');
    expect(client.crypto.decryptMedia).toHaveBeenCalledWith(file);
    expect(client.downloadContent).not.toHaveBeenCalled();
    expect(buffer).toEqual(Buffer.from('plaintext-voice-note'));
  });

  it('downloadMedia refuses (throws) an encrypted attachment when the connection has no crypto provider, rather than handing back ciphertext', async () => {
    const { service, client } = loadService();
    service._cacheIncomingMedia('matrix:mxc://example.org/ENC2', {
      url: 'mxc://example.org/ENC2', mime_type: 'image/jpeg', file: { url: 'mxc://example.org/ENC2' },
    });
    await expect(service.downloadMedia('matrix:mxc://example.org/ENC2')).rejects.toThrow(/encrypted/);
    expect(client.downloadContent).not.toHaveBeenCalled();
  });

  it('sendImage rejects a bare media-id that is not a real file on disk -- Matrix has no reusable media-id upload step', async () => {
    const { service, client } = loadService();
    const result = await service.sendImage(TO, 'F0123FILE_no_slash_and_does_not_exist');
    expect(result).toBe(false);
    expect(client.uploadContent).not.toHaveBeenCalled();
  });

  it('sendImage accepts a bare filename (no slash) that IS a real existing file -- fs.existsSync(), not a slash heuristic, decides', async () => {
    // Regression test: an earlier version used `mediaIdOrPath.includes('/')`
    // to decide "is this a path", which wrongly rejected a real file with no
    // directory component (e.g. one in the process's own cwd) as if it were
    // a bare Meta media ID.
    const fs = require('fs');
    const path = require('path');
    const bareFilename = `matrix-test-bare-${Date.now()}.png`;
    const fullPath = path.join(process.cwd(), bareFilename);
    fs.writeFileSync(fullPath, 'fakeimg');
    try {
      const { service, client } = loadService();
      const result = await service.sendImage(TO, bareFilename, 'caption');
      expect(result).toBe(true);
      expect(client.uploadContent).toHaveBeenCalledWith(expect.any(Buffer), 'image/png', bareFilename);
    } finally {
      fs.unlinkSync(fullPath);
    }
  });
});

describe('matrix-channel.service -- media upload + send', () => {
  it('sendImageFromUrl uploads the fetched bytes and sends an m.image message with the mxc:// url', async () => {
    const fetchImpl = jest.fn(async () => ({ ok: true, arrayBuffer: async () => Buffer.from('img').buffer }));
    const { service, client, sentMessages } = loadService({ fetchImpl });
    const result = await service.sendImageFromUrl(TO, 'https://example.com/x.png', 'a caption');
    expect(result).toBe(true);
    expect(client.uploadContent).toHaveBeenCalledWith(expect.any(Buffer), 'image/png', 'image.png');
    expect(sentMessages[0].content).toEqual(expect.objectContaining({
      msgtype: 'm.image', body: 'a caption', url: 'mxc://example.org/abc123',
    }));
  });

  it('sendImageFromUrl labels a .jpg URL as image/jpeg (query string ignored), not a blanket image/png', async () => {
    const fetchImpl = jest.fn(async () => ({ ok: true, arrayBuffer: async () => Buffer.from('img').buffer }));
    const { service, client } = loadService({ fetchImpl });
    await service.sendImageFromUrl(TO, 'https://example.com/pages/p1.JPG?sig=abc', '');
    expect(client.uploadContent).toHaveBeenCalledWith(expect.any(Buffer), 'image/jpeg', 'image.jpg');
  });

  it('in an E2EE room, an attachment is encrypted before upload and sent as content.file (never a plaintext content.url)', async () => {
    const fs = require('fs');
    const os = require('os');
    const path = require('path');
    const tmpFile = path.join(os.tmpdir(), `matrix-test-enc-${Date.now()}.pdf`);
    fs.writeFileSync(tmpFile, 'pdfdata');
    try {
      const { service, client, sentMessages } = loadService();
      client.crypto = {
        isRoomEncrypted: jest.fn(async () => true),
        encryptMedia: jest.fn(async () => ({
          buffer: Buffer.from('ciphertext'),
          file: { key: { k: 'secret' }, iv: 'iv', hashes: { sha256: 'h' }, v: 'v2' },
        })),
      };
      const result = await service.sendDocument(TO, tmpFile, 'lesson-plan.pdf', 'here you go');
      expect(result).toBe(true);
      expect(client.crypto.encryptMedia).toHaveBeenCalledWith(Buffer.from('pdfdata'));
      expect(client.uploadContent).toHaveBeenCalledWith(Buffer.from('ciphertext'), 'application/octet-stream', 'lesson-plan.pdf');
      const { content } = sentMessages[0];
      expect(content.url).toBeUndefined();
      expect(content.file).toEqual({
        key: { k: 'secret' }, iv: 'iv', hashes: { sha256: 'h' }, v: 'v2', url: 'mxc://example.org/abc123',
      });
      expect(content.info).toEqual({ mimetype: 'application/pdf', size: 7 });
      expect(content.filename).toBe('lesson-plan.pdf');
      expect(content.body).toBe('here you go');
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });

  it('in a plaintext room (crypto present, room not encrypted) the attachment is uploaded as-is with content.url', async () => {
    const { service, client, sentMessages } = loadService();
    client.crypto = { isRoomEncrypted: jest.fn(async () => false), encryptMedia: jest.fn() };
    await service.sendAudio(TO, Buffer.alloc(64));
    expect(client.crypto.encryptMedia).not.toHaveBeenCalled();
    expect(sentMessages[0].content.url).toBe('mxc://example.org/abc123');
  });

  it('if the room-encryption check fails the send fails -- it never falls back to plaintext media', async () => {
    const { service, client } = loadService();
    client.crypto = { isRoomEncrypted: jest.fn(async () => { throw new Error('store locked'); }), encryptMedia: jest.fn() };
    const result = await service.sendAudio(TO, Buffer.alloc(64));
    expect(result).toBe(false);
    expect(client.uploadContent).not.toHaveBeenCalled();
  });

  it('sendDocument reads a local file and sends it as m.file', async () => {
    const fs = require('fs');
    const os = require('os');
    const path = require('path');
    const tmpFile = path.join(os.tmpdir(), `matrix-test-${Date.now()}.pdf`);
    fs.writeFileSync(tmpFile, 'pdfdata');
    try {
      const { service, sentMessages } = loadService();
      const result = await service.sendDocument(TO, tmpFile, 'lesson-plan.pdf', 'here you go');
      expect(result).toBe(true);
      expect(sentMessages[0].content).toEqual(expect.objectContaining({ msgtype: 'm.file', body: 'here you go' }));
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });

  it('sendVideo uploads and sends an m.video message', async () => {
    const { service, sentMessages } = loadService();
    const result = await service.sendVideo(TO, Buffer.alloc(1024), '/tmp', 'caption');
    expect(result).toBe(true);
    expect(sentMessages[0].content.msgtype).toBe('m.video');
  });

  it('sendAudio uploads and sends an m.audio message', async () => {
    const { service, sentMessages } = loadService();
    const result = await service.sendAudio(TO, Buffer.alloc(64));
    expect(result).toBe(true);
    expect(sentMessages[0].content.msgtype).toBe('m.audio');
  });

  it('sendSticker rejects a path that does not exist on disk', async () => {
    const { service, client } = loadService();
    const result = await service.sendSticker(TO, '/tmp/does-not-exist-matrix-sticker.png');
    expect(result).toBe(false);
    expect(client.uploadContent).not.toHaveBeenCalled();
  });

  it('sendSticker sends a real existing file as m.sticker', async () => {
    const fs = require('fs');
    const os = require('os');
    const path = require('path');
    const tmpFile = path.join(os.tmpdir(), `matrix-test-sticker-${Date.now()}.png`);
    fs.writeFileSync(tmpFile, 'stickerdata');
    try {
      const { service, client } = loadService();
      const result = await service.sendSticker(TO, tmpFile);
      expect(result).toBe(true);
      expect(client.sendEvent).toHaveBeenCalledWith('!room:example.org', 'm.sticker', expect.objectContaining({
        url: 'mxc://example.org/abc123',
      }));
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });
});

describe('matrix-channel.service -- interactive surfaces (text-flow degradation, same convention as Baileys)', () => {
  it('sendInteractiveButtons renders a numbered plain-text list and remembers the menu for the reply', async () => {
    const { service, sentMessages, pendingOptions } = loadService();
    const result = await service.sendInteractiveButtons(TO, {
      body: 'Pick one',
      buttons: [{ id: 'menu_lesson_plan', title: 'Lesson Plans' }, { id: 'menu_video', title: 'Video' }],
    });
    expect(result).toBe(true);
    expect(sentMessages[0].content.body).toContain('1. Lesson Plans');
    expect(sentMessages[0].content.body).toContain('2. Video');
    expect(pendingOptions.remember).toHaveBeenCalledWith(TO, expect.objectContaining({ replyType: 'button_reply' }));
  });

  it('sendInteractiveMessage renders a numbered plain-text list from list-picker rows', async () => {
    const { service, sentMessages, pendingOptions } = loadService();
    const result = await service.sendInteractiveMessage(TO, {
      header: 'Pick a language',
      action: { sections: [{ rows: [{ id: 'lang_en', title: 'English' }, { id: 'lang_ur', title: 'Urdu' }] }] },
    });
    expect(result).toBe(true);
    expect(sentMessages[0].content.body).toContain('**Pick a language**');
    expect(pendingOptions.remember).toHaveBeenCalledWith(TO, expect.objectContaining({ replyType: 'list_reply' }));
  });

  it('sendInteractiveMessage has no 25-option cap the way Discord does -- Matrix renders plain text', async () => {
    const { service, sentMessages } = loadService();
    const rows = Array.from({ length: 40 }, (_, i) => ({ id: `opt_${i}`, title: `Option ${i}` }));
    await service.sendInteractiveMessage(TO, { header: 'Many', action: { sections: [{ rows }] } });
    expect(sentMessages[0].content.body).toContain('40. Option 39');
  });
});

describe('matrix-channel.service -- stubbed Meta-template-only methods', () => {
  it('sendFlow resolves false (caller runs its own fallback) when no text flow is registered for the Flow', async () => {
    const { service } = loadService();
    await expect(service.sendFlow(TO, {})).resolves.toBe(false);
    await expect(service.sendFlow(TO, { flowToken: 'u1:no-such-flow:123' })).resolves.toBe(false);
  });

  it('sendFlow degrades a registered Flow (reading assessment) to its text flow and asks the first question', async () => {
    const { service, sentMessages } = loadService();
    const result = await service.sendFlow(TO, { flowKind: 'reading-assessment', flowToken: 'user-1:reading-assessment:1' });
    expect(result).toBe(true);
    expect(sentMessages[0].content.body).toContain('Reading Assessment');
    expect(sentMessages[0].content.body).toContain("student's full name");
    const textFlow = require('../../bot/shared/services/messaging/text-flow');
    expect(await textFlow.isActive(TO)).toBe(true);
  });

  it('_sendTextFlowStep renders a menu step as the numbered list', async () => {
    const { service, sentMessages } = loadService();
    await service._sendTextFlowStep(TO, {
      kind: 'menu', prompt: { body: 'Which language?' }, options: [{ id: 'en', title: 'English' }, { id: 'ur', title: 'Urdu' }],
    });
    expect(sentMessages[0].content.body).toContain('1. English');
    expect(sentMessages[0].content.body).toContain('2. Urdu');
  });

  it('sendTemplate has no equivalent yet -- logs and resolves false', async () => {
    const { service } = loadService();
    await expect(service.sendTemplate(TO, 'x', 'en')).resolves.toBe(false);
  });

  it('sendStyleCarousel goes straight to the numbered style list (what Meta itself falls back to) -- /video has no fallback of its own', async () => {
    const { service, sentMessages, pendingOptions } = loadService();
    await expect(service.sendStyleCarousel(TO)).resolves.toBe(true);
    expect(sentMessages[0].content.body).toContain('1. Photorealistic');
    expect(pendingOptions.remember).toHaveBeenCalledWith(TO, expect.objectContaining({
      replyType: 'list_reply',
      options: expect.arrayContaining([{ id: 'style_cartoon', title: 'Cartoon' }]),
    }));
  });

  it('sendFeatureMenuCarousel goes straight to the numbered feature menu', async () => {
    const { service, sentMessages } = loadService();
    await expect(service.sendFeatureMenuCarousel(TO)).resolves.toBe(true);
    expect(sentMessages[0].content.body).toContain('1. Lesson Plans');
  });

  it('buildStyleCarouselPayload/buildFeatureMenuCarouselPayload have no equivalent yet -- synchronous, return null', () => {
    const { service } = loadService();
    const a = service.buildStyleCarouselPayload(TO);
    const b = service.buildFeatureMenuCarouselPayload(TO);
    expect(a).not.toBeInstanceOf(Promise);
    expect(a).toBeNull();
    expect(b).toBeNull();
  });
});

describe('matrix-channel.service -- pure helpers', () => {
  it('_removeEmotionTags is a real, synchronous reimplementation (pure/channel-agnostic), not a stub', () => {
    const { service } = loadService();
    expect(service._removeEmotionTags('[warmly] hello')).toBe('hello');
  });
});
