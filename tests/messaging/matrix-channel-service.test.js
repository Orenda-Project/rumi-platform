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
  it('sendFlow logs and resolves false -- no modal-workaround renderer exists for this channel', async () => {
    const { service } = loadService();
    await expect(service.sendFlow(TO, {})).resolves.toBe(false);
  });

  it('sendTemplate/sendStyleCarousel/sendFeatureMenuCarousel have no equivalent yet -- log and resolve false', async () => {
    const { service } = loadService();
    await expect(service.sendTemplate(TO, 'x', 'en')).resolves.toBe(false);
    await expect(service.sendStyleCarousel(TO)).resolves.toBe(false);
    await expect(service.sendFeatureMenuCarousel(TO)).resolves.toBe(false);
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
