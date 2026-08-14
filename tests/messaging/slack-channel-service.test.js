/**
 * slack-channel.service.js — behavior of the REAL (Slack Web API-backed)
 * methods. @slack/web-api is always mocked here so nothing ever hits the
 * real network; tests/messaging/channel-driver-parity.test.js covers the
 * still-stubbed Meta-template-only methods and cross-driver existence.
 */

function loadService({ postMessageImpl, conversationsOpenImpl } = {}) {
  jest.resetModules();
  const client = {
    conversations: {
      open: jest.fn(conversationsOpenImpl || (async () => ({ channel: { id: 'D0123DM' } }))),
    },
    chat: {
      postMessage: jest.fn(postMessageImpl || (async () => ({ ts: '169.001' }))),
    },
    reactions: { add: jest.fn(async () => ({})) },
    files: {
      uploadV2: jest.fn(async () => ({ files: [{ id: 'F0123FILE' }] })),
      info: jest.fn(async () => ({ file: { url_private: 'https://files.slack.com/x', mimetype: 'image/png', size: 42 } })),
    },
  };
  jest.doMock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
  jest.doMock('../../bot/shared/storage/r2', () => ({
    downloadFromR2: jest.fn(),
    extractKeyFromUrl: jest.fn((url) => url.split('/').pop()),
  }));
  jest.doMock('@slack/web-api', () => ({
    WebClient: jest.fn().mockImplementation(() => client),
  }), { virtual: true });

  process.env.SLACK_BOT_TOKEN = 'xoxb-test-token';
  const service = require('../../bot/shared/services/messaging/slack-channel.service');
  return { service, client };
}

afterEach(() => {
  jest.resetModules();
  delete process.env.SLACK_BOT_TOKEN;
});

const TO = 'slack:U0123ABC';

describe('slack-channel.service — identity', () => {
  it('strips the "slack:" prefix before ever touching the Slack API', async () => {
    const { service, client } = loadService();
    await service.sendMessage(TO, 'hi');
    expect(client.conversations.open).toHaveBeenCalledWith({ users: 'U0123ABC' });
  });

  it('caches the DM channel id — a second send does not re-open the conversation', async () => {
    const { service, client } = loadService();
    await service.sendMessage(TO, 'first');
    await service.sendMessage(TO, 'second');
    expect(client.conversations.open).toHaveBeenCalledTimes(1);
  });
});

describe('slack-channel.service — outbound', () => {
  it('sendMessage posts to the resolved DM channel and strips emotion tags', async () => {
    const { service, client } = loadService();
    const result = await service.sendMessage(TO, '[warmly] Hello there');
    expect(result).toBe(true);
    expect(client.chat.postMessage).toHaveBeenCalledWith({ channel: 'D0123DM', text: 'Hello there' });
  });

  it('sendMessage returns false (never throws) when the API call rejects', async () => {
    const { service } = loadService({ postMessageImpl: async () => { throw new Error('boom'); } });
    await expect(service.sendMessage(TO, 'hi')).resolves.toBe(false);
  });

  it('sendTextReturningId returns the message ts', async () => {
    const { service } = loadService({ postMessageImpl: async () => ({ ts: '169.999' }) });
    const id = await service.sendTextReturningId(TO, 'hi');
    expect(id).toBe('169.999');
  });

  it('sendTextReturningId threads via thread_ts when a contextMessageId is given', async () => {
    const { service, client } = loadService();
    await service.sendTextReturningId(TO, 'hi', { contextMessageId: '169.001' });
    expect(client.chat.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ thread_ts: '169.001' })
    );
  });

  it('sendReaction maps a known unicode emoji to its Slack shortcode name', async () => {
    const { service, client } = loadService();
    const result = await service.sendReaction(TO, '169.001', '❤️');
    expect(result).toBe(true);
    expect(client.reactions.add).toHaveBeenCalledWith({ channel: 'D0123DM', timestamp: '169.001', name: 'heart' });
  });

  it('showTypingIndicator is a documented no-op — resolves true without calling the Slack API', async () => {
    const { service, client } = loadService();
    await expect(service.showTypingIndicator(TO)).resolves.toBe(true);
    expect(client.chat.postMessage).not.toHaveBeenCalled();
  });

  it('startContinuousTypingIndicator returns a synchronous, real, callable no-op controller', () => {
    const { service } = loadService();
    const controller = service.startContinuousTypingIndicator(TO);
    expect(controller).not.toBeInstanceOf(Promise);
    expect(typeof controller.stop).toBe('function');
    expect(() => controller.stop()).not.toThrow();
  });
});

describe('slack-channel.service — media', () => {
  it('getMediaInfo returns Slack file metadata mapped to the Meta-shaped fields', async () => {
    const { service } = loadService();
    const info = await service.getMediaInfo('F0123FILE');
    expect(info).toEqual({ url: 'https://files.slack.com/x', mime_type: 'image/png', file_size: 42 });
  });

  it('sendImage rejects a bare media-id (no file path/URL) — Slack has no reusable media-id upload step', async () => {
    const { service, client } = loadService();
    const result = await service.sendImage(TO, 'F0123FILE_no_slash');
    expect(result).toBe(false);
    expect(client.files.uploadV2).not.toHaveBeenCalled();
  });
});

describe('slack-channel.service — interactive components (real Block Kit, not text degradation)', () => {
  it('sendInteractiveButtons posts real Block Kit action buttons carrying the Meta-shaped id as `value`', async () => {
    const { service, client } = loadService();
    const result = await service.sendInteractiveButtons(TO, {
      body: 'Pick one',
      buttons: [{ id: 'menu_lesson_plan', title: 'Lesson Plans' }, { id: 'menu_video', title: 'Video' }],
    });
    expect(result).toBe(true);
    const call = client.chat.postMessage.mock.calls[0][0];
    const actionsBlock = call.blocks.find((b) => b.type === 'actions');
    expect(actionsBlock.elements).toHaveLength(2);
    expect(actionsBlock.elements[0].value).toBe('menu_lesson_plan');
    expect(actionsBlock.elements[0].action_id).toBe('menu_lesson_plan');
  });

  it('sendInteractiveMessage posts a static_select with the Meta-shaped row ids as option values', async () => {
    const { service, client } = loadService();
    const result = await service.sendInteractiveMessage(TO, {
      header: 'Pick a language',
      action: { button: 'Languages', sections: [{ rows: [{ id: 'lang_en', title: 'English' }, { id: 'lang_ur', title: 'Urdu' }] }] },
    });
    expect(result).toBe(true);
    const call = client.chat.postMessage.mock.calls[0][0];
    const actionsBlock = call.blocks.find((b) => b.type === 'actions');
    const select = actionsBlock.elements[0];
    expect(select.type).toBe('static_select');
    expect(select.options.map((o) => o.value)).toEqual(['lang_en', 'lang_ur']);
  });

  it('sendInteractiveMessage returns false when no rows are provided', async () => {
    const { service } = loadService();
    const result = await service.sendInteractiveMessage(TO, { header: 'Empty', action: { sections: [] } });
    expect(result).toBe(false);
  });
});

describe('slack-channel.service — stubbed Flow', () => {
  it('sendFlow logs and resolves false — the modal renderer is a separate concern, not this call', async () => {
    const { service } = loadService();
    await expect(service.sendFlow(TO, {})).resolves.toBe(false);
  });
});
