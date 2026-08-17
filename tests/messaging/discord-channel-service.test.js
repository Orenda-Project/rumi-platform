/**
 * discord-channel.service.js — behavior of the REAL (discord.js-backed)
 * methods. discord-connection.js (the shared Gateway client owner) is always
 * mocked here so nothing ever opens a real socket; the builder classes
 * (ActionRowBuilder, ButtonBuilder, etc.) are the REAL discord.js exports —
 * they are pure data builders with no network calls, so mocking them would
 * just reimplement discord.js badly. tests/messaging/channel-driver-parity.test.js
 * covers the still-stubbed Meta-template-only methods and cross-driver
 * existence.
 */

function loadService({ sendImpl, fetchImpl } = {}) {
  jest.resetModules();
  const sentMessages = [];
  const user = {
    id: 'U0123ABC',
    send: jest.fn(sendImpl || (async (payload) => {
      sentMessages.push(payload);
      return { id: '1699999999123' };
    })),
    dmChannel: null,
    createDM: jest.fn(async () => user.dmChannel),
  };
  const message = { react: jest.fn(async () => ({})) };
  const dmChannel = {
    sendTyping: jest.fn(async () => {}),
    messages: { fetch: jest.fn(async () => message) },
  };
  user.dmChannel = dmChannel;

  const client = { users: { fetch: jest.fn(async () => user) } };

  jest.doMock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
  jest.doMock('../../bot/shared/storage/r2', () => ({
    downloadFromR2: jest.fn(),
    extractKeyFromUrl: jest.fn((url) => url.split('/').pop()),
  }));
  jest.doMock('../../bot/shared/services/messaging/discord-connection', () => ({
    getClient: jest.fn(async () => client),
  }));

  if (fetchImpl) global.fetch = fetchImpl;

  const service = require('../../bot/shared/services/messaging/discord-channel.service');
  const logger = require('../../bot/shared/utils/logger');
  return { service, client, user, dmChannel, message, logger, sentMessages };
}

const realFetch = global.fetch;

afterEach(() => {
  jest.resetModules();
  global.fetch = realFetch;
});

const TO = 'discord:U0123ABC';

describe('discord-channel.service — identity', () => {
  it('strips the "discord:" prefix before ever touching the Discord API', async () => {
    const { service, client } = loadService();
    await service.sendMessage(TO, 'hi');
    expect(client.users.fetch).toHaveBeenCalledWith('U0123ABC');
  });
});

describe('discord-channel.service — outbound', () => {
  it('sendMessage sends to the resolved user and strips emotion tags', async () => {
    const { service, user } = loadService();
    const result = await service.sendMessage(TO, '[warmly] Hello there');
    expect(result).toBe(true);
    expect(user.send).toHaveBeenCalledWith({ content: 'Hello there' });
  });

  it('sendMessage returns false (never throws) when the send call rejects', async () => {
    const { service } = loadService({ sendImpl: async () => { throw new Error('boom'); } });
    await expect(service.sendMessage(TO, 'hi')).resolves.toBe(false);
  });

  it('sendTextReturningId returns the sent message id', async () => {
    const { service } = loadService({ sendImpl: async () => ({ id: '169999' }) });
    const id = await service.sendTextReturningId(TO, 'hi');
    expect(id).toBe('169999');
  });

  it('sendTextReturningId replies via messageReference when a contextMessageId is given', async () => {
    const { service, user } = loadService();
    await service.sendTextReturningId(TO, 'hi', { contextMessageId: '169.001' });
    expect(user.send).toHaveBeenCalledWith(
      expect.objectContaining({ reply: { messageReference: '169.001' } })
    );
  });

  it('sendReaction reacts with the literal unicode emoji — no shortcode translation needed', async () => {
    const { service, message } = loadService();
    const result = await service.sendReaction(TO, '169.001', '❤️');
    expect(result).toBe(true);
    expect(message.react).toHaveBeenCalledWith('❤️');
  });

  it('showTypingIndicator is a REAL implementation — calls the DM channel\'s sendTyping', async () => {
    const { service, dmChannel } = loadService();
    await expect(service.showTypingIndicator(TO)).resolves.toBe(true);
    expect(dmChannel.sendTyping).toHaveBeenCalledTimes(1);
  });

  it('startContinuousTypingIndicator returns a real, callable controller, ticks immediately, and repeats under Discord\'s ~10s auto-expiry', async () => {
    jest.useFakeTimers();
    try {
      const { service, dmChannel } = loadService();
      const controller = service.startContinuousTypingIndicator(TO);
      expect(controller).not.toBeInstanceOf(Promise);
      expect(typeof controller.stop).toBe('function');

      // advanceTimersByTimeAsync (unlike advanceTimersByTime) also flushes
      // the microtask queue between ticks, which the first tick's async
      // showTypingIndicator() call needs to actually resolve.
      await jest.advanceTimersByTimeAsync(0);
      expect(dmChannel.sendTyping).toHaveBeenCalledTimes(1);

      await jest.advanceTimersByTimeAsync(8000);
      expect(dmChannel.sendTyping).toHaveBeenCalledTimes(2);

      controller.stop();
      await jest.advanceTimersByTimeAsync(16000);
      expect(dmChannel.sendTyping).toHaveBeenCalledTimes(2); // no further ticks after stop()
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('discord-channel.service — media (cache-based, not a live API lookup)', () => {
  it('getMediaInfo throws for an id the inbound adapter never cached — media must be consumed shortly after receipt', async () => {
    const { service } = loadService();
    await expect(service.getMediaInfo('discord:F0123FILE')).rejects.toThrow(/no cached media info/);
  });

  it('getMediaInfo returns whatever the inbound adapter cached via _cacheIncomingMedia', async () => {
    const { service } = loadService();
    service._cacheIncomingMedia('discord:F0123FILE', { url: 'https://cdn.discordapp.com/x', mime_type: 'image/png', file_size: 42 });
    const info = await service.getMediaInfo('discord:F0123FILE');
    expect(info).toEqual({ url: 'https://cdn.discordapp.com/x', mime_type: 'image/png', file_size: 42 });
  });

  it('downloadMedia fetches the cached URL with NO Bearer auth header — Discord CDN URLs are pre-signed/public', async () => {
    const fetchImpl = jest.fn(async () => ({ ok: true, arrayBuffer: async () => Buffer.from('data') }));
    const { service } = loadService({ fetchImpl });
    service._cacheIncomingMedia('discord:F0123FILE', { url: 'https://cdn.discordapp.com/x', mime_type: 'image/png', file_size: 42 });

    await service.downloadMedia('discord:F0123FILE');

    expect(fetchImpl).toHaveBeenCalledWith('https://cdn.discordapp.com/x');
    const [, options] = fetchImpl.mock.calls[0];
    expect(options).toBeUndefined();
  });

  it('sendImage rejects a bare media-id (no file path/URL) — Discord has no reusable media-id upload step', async () => {
    const { service, user } = loadService();
    const result = await service.sendImage(TO, 'F0123FILE_no_slash');
    expect(result).toBe(false);
    expect(user.send).not.toHaveBeenCalled();
  });
});

describe('discord-channel.service — video delivery (size-gated upload + URL-based primary path)', () => {
  it('sendVideo uploads directly when the buffer is under the safe size ceiling', async () => {
    const { service, user } = loadService();
    const smallBuffer = Buffer.alloc(1024);
    const result = await service.sendVideo(TO, smallBuffer, '/tmp', 'caption');
    expect(result).toBe(true);
    expect(user.send).toHaveBeenCalledWith(expect.objectContaining({
      content: 'caption',
      files: [{ attachment: smallBuffer, name: 'video.mp4' }],
    }));
  });

  it('sendVideo refuses to upload an oversized buffer and returns false rather than attempting a likely-failing upload', async () => {
    const { service, user, logger } = loadService();
    const oversizedBuffer = Buffer.alloc(9 * 1024 * 1024); // > 8MB safe ceiling
    const result = await service.sendVideo(TO, oversizedBuffer, '/tmp');
    expect(result).toBe(false);
    expect(user.send).not.toHaveBeenCalled();
    expect(logger.logToFile).toHaveBeenCalledWith(
      expect.stringContaining('exceeds the safe DM upload size'),
      expect.objectContaining({ sizeBytes: oversizedBuffer.length })
    );
  });

  it('sendVideoFromUrl sends an embed + the bare URL, never uploading raw bytes', async () => {
    const { service, user } = loadService();
    const result = await service.sendVideoFromUrl(TO, 'https://r2.example.com/video.mp4', 'Here it is');
    expect(result).toBe(true);
    const call = user.send.mock.calls[0][0];
    expect(call.content).toBe('https://r2.example.com/video.mp4');
    expect(call.files).toBeUndefined();
    expect(call.embeds).toHaveLength(1);
  });
});

describe('discord-channel.service — interactive components (real discord.js components, not text degradation)', () => {
  it('sendInteractiveButtons sends real button components carrying the Meta-shaped id as `customId`', async () => {
    const { service, user } = loadService();
    const result = await service.sendInteractiveButtons(TO, {
      body: 'Pick one',
      buttons: [{ id: 'menu_lesson_plan', title: 'Lesson Plans' }, { id: 'menu_video', title: 'Video' }],
    });
    expect(result).toBe(true);
    const call = user.send.mock.calls[0][0];
    const row = call.components[0];
    const buttonsJson = row.components.map((c) => c.toJSON());
    expect(buttonsJson).toHaveLength(2);
    expect(buttonsJson[0].custom_id).toBe('menu_lesson_plan');
    expect(buttonsJson[0].label).toBe('Lesson Plans');
  });

  it('sendInteractiveMessage sends a real select menu with the Meta-shaped row ids as option values', async () => {
    const { service, user } = loadService();
    const result = await service.sendInteractiveMessage(TO, {
      header: 'Pick a language',
      action: { button: 'Languages', sections: [{ rows: [{ id: 'lang_en', title: 'English' }, { id: 'lang_ur', title: 'Urdu' }] }] },
    });
    expect(result).toBe(true);
    const call = user.send.mock.calls[0][0];
    const menuJson = call.components[0].components[0].toJSON();
    expect(menuJson.options.map((o) => o.value)).toEqual(['lang_en', 'lang_ur']);
  });

  it('sendInteractiveMessage caps at 25 options — Discord\'s StringSelectMenu hard limit (Slack allows 100)', async () => {
    const { service, user } = loadService();
    const rows = Array.from({ length: 40 }, (_, i) => ({ id: `opt_${i}`, title: `Option ${i}` }));
    await service.sendInteractiveMessage(TO, { header: 'Many', action: { sections: [{ rows }] } });
    const call = user.send.mock.calls[0][0];
    const menuJson = call.components[0].components[0].toJSON();
    expect(menuJson.options).toHaveLength(25);
  });

  it('sendInteractiveMessage returns false when no rows are provided', async () => {
    const { service } = loadService();
    const result = await service.sendInteractiveMessage(TO, { header: 'Empty', action: { sections: [] } });
    expect(result).toBe(false);
  });

  it('sendImageWithButtons sends files AND components in ONE message — a real simplification over Slack\'s forced two-message split', async () => {
    const fetchImpl = jest.fn(async () => ({ ok: true, arrayBuffer: async () => Buffer.from('img') }));
    const { service, user } = loadService({ fetchImpl });
    const result = await service.sendImageWithButtons(TO, 'https://example.com/x.png', 'Look', [{ id: 'btn_1', title: 'Go' }]);
    expect(result).toBe(true);
    const call = user.send.mock.calls[0][0];
    expect(call.files).toHaveLength(1);
    expect(call.components).toHaveLength(1);
  });
});

describe('discord-channel.service — stubbed Flow', () => {
  it('sendFlow logs and resolves false — the modal-workaround renderer is a separate concern, not this call', async () => {
    const { service } = loadService();
    await expect(service.sendFlow(TO, {})).resolves.toBe(false);
  });
});
