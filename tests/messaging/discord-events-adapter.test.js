/**
 * discord-events.adapter.js — mapping Discord Gateway events (messageCreate,
 * interactionCreate) into the Meta-webhook-shaped payload whatsapp-bot.js's
 * handleWebhookPost already dispatches on. Mirrors baileys-socket.adapter.js's
 * own test coverage style (a persistent-listener attach(), not an HTTP route
 * handler like Slack's adapter) — synthetic discord.js-shaped event objects
 * are fed directly to the mapping functions and to attach()'s registered
 * listeners, never a real Client/Gateway connection.
 */

jest.mock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
jest.mock('../../bot/shared/services/messaging/discord-channel.service', () => ({
  _cacheIncomingMedia: jest.fn(),
}));

const {
  mapMessageToMetaShape,
  mapAttachmentToMetaShape,
  mapInteractionToMetaShape,
  mapSlashCommandToMetaShape,
  toPrefixedIdentity,
  toPrefixedMediaId,
  isDuplicateDelivery,
  attach,
  _resetSeenIdsForTests,
} = require('../../bot/shared/services/messaging/inbound/discord-events.adapter');

afterEach(() => {
  _resetSeenIdsForTests();
  jest.clearAllMocks();
});

describe('toPrefixedIdentity', () => {
  it('prefixes a bare Discord snowflake with "discord:"', () => {
    expect(toPrefixedIdentity('918273645')).toBe('discord:918273645');
  });
});

describe('toPrefixedMediaId', () => {
  it('prefixes a bare Discord attachment id with "discord:" — required so the messaging router (channel-registry.js#driverForIdentifier) sends getMediaInfo/downloadMedia to the Discord driver, not the WhatsApp one', () => {
    expect(toPrefixedMediaId('1122334455')).toBe('discord:1122334455');
  });
});

describe('mapMessageToMetaShape', () => {
  it('maps a plain user DM text message to the Meta text shape, with the prefixed identity', () => {
    const message = {
      author: { id: '918273645', bot: false },
      channel: { type: 1 },
      content: 'Hello Rumi',
      id: '1699999999123',
      createdTimestamp: 1699999999000,
      attachments: { first: () => undefined },
    };
    const mapped = mapMessageToMetaShape(message);
    expect(mapped).toEqual({
      from: 'discord:918273645',
      id: '1699999999123',
      timestamp: 1699999999,
      type: 'text',
      text: { body: 'Hello Rumi' },
    });
  });

  it('skips a bot-authored message', () => {
    const message = {
      author: { id: '1', bot: true }, channel: { type: 1 }, content: 'echo',
      id: '1', createdTimestamp: Date.now(), attachments: { first: () => undefined },
    };
    expect(mapMessageToMetaShape(message)).toBeNull();
  });

  it('skips a non-DM channel (guild text channel)', () => {
    const message = {
      author: { id: '1', bot: false }, channel: { type: 0 }, content: 'hi',
      id: '1', createdTimestamp: Date.now(), attachments: { first: () => undefined },
    };
    expect(mapMessageToMetaShape(message)).toBeNull();
  });

  it('skips a message with no text and no attachment', () => {
    const message = {
      author: { id: '1', bot: false }, channel: { type: 1 }, content: '',
      id: '1', createdTimestamp: Date.now(), attachments: { first: () => undefined },
    };
    expect(mapMessageToMetaShape(message)).toBeNull();
  });

  it('delegates to attachment mapping when the message carries a file', () => {
    const attachment = { id: 'F1', url: 'https://cdn.discordapp.com/x', contentType: 'audio/ogg', size: 42, name: 'voice.ogg' };
    const message = {
      author: { id: '918273645', bot: false }, channel: { type: 1 }, content: '',
      id: '169', createdTimestamp: 169000, attachments: { first: () => attachment },
    };
    const mapped = mapMessageToMetaShape(message);
    expect(mapped.type).toBe('audio');
    expect(mapped.audio.id).toBe('discord:F1');
  });

  it('returns null for a nullish message', () => {
    expect(mapMessageToMetaShape(null)).toBeNull();
    expect(mapMessageToMetaShape(undefined)).toBeNull();
  });
});

describe('mapAttachmentToMetaShape', () => {
  const discordChannel = require('../../bot/shared/services/messaging/discord-channel.service');

  function baseMessage(content = '') {
    return { author: { id: '918273645' }, content, id: '169.100', createdTimestamp: 169100 };
  }

  it('maps an audio attachment to the Meta audio shape, with the media id prefixed for router dispatch, and caches its metadata (NOT a downloaded buffer)', () => {
    const attachment = { id: 'F0123FILE', url: 'https://cdn.discordapp.com/x', contentType: 'audio/ogg', size: 42, name: 'voice.ogg' };
    const mapped = mapAttachmentToMetaShape(baseMessage(), attachment);
    expect(mapped).toEqual({
      from: 'discord:918273645',
      id: '169.100',
      timestamp: 169,
      type: 'audio',
      audio: { id: 'discord:F0123FILE', mime_type: 'audio/ogg' },
    });
    expect(discordChannel._cacheIncomingMedia).toHaveBeenCalledWith('discord:F0123FILE', {
      url: 'https://cdn.discordapp.com/x', mime_type: 'audio/ogg', file_size: 42,
    });
  });

  it('maps an image attachment to the Meta image shape, carrying the message content as the caption', () => {
    const attachment = { id: 'F0456FILE', url: 'https://cdn.discordapp.com/y', contentType: 'image/png', size: 100, name: 'photo.png' };
    const mapped = mapAttachmentToMetaShape(baseMessage('look at this'), attachment);
    expect(mapped).toEqual({
      from: 'discord:918273645',
      id: '169.100',
      timestamp: 169,
      type: 'image',
      image: { id: 'discord:F0456FILE', mime_type: 'image/png', caption: 'look at this' },
    });
  });

  it('maps anything else (e.g. a PDF) to the Meta document shape', () => {
    const attachment = { id: 'F0789FILE', url: 'https://cdn.discordapp.com/z', contentType: 'application/pdf', size: 200, name: 'lesson-plan.pdf' };
    const mapped = mapAttachmentToMetaShape(baseMessage(), attachment);
    expect(mapped).toEqual({
      from: 'discord:918273645',
      id: '169.100',
      timestamp: 169,
      type: 'document',
      document: { id: 'discord:F0789FILE', mime_type: 'application/pdf', filename: 'lesson-plan.pdf' },
    });
  });
});

describe('mapInteractionToMetaShape', () => {
  it('maps a button click to the Meta button_reply shape, using customId as both id and title directly (no menu bookkeeping)', () => {
    const interaction = {
      user: { id: '918273645' },
      message: { id: '169.010' },
      isButton: () => true,
      isStringSelectMenu: () => false,
      customId: 'menu_lesson_plan',
    };
    const mapped = mapInteractionToMetaShape(interaction);
    expect(mapped).toEqual({
      from: 'discord:918273645',
      id: '169.010',
      timestamp: expect.any(Number),
      type: 'interactive',
      interactive: { type: 'button_reply', button_reply: { id: 'menu_lesson_plan', title: 'menu_lesson_plan' } },
    });
  });

  it('maps a select-menu choice to the Meta list_reply shape', () => {
    const interaction = {
      user: { id: '918273645' },
      message: { id: '169.020' },
      isButton: () => false,
      isStringSelectMenu: () => true,
      values: ['lang_ur'],
    };
    const mapped = mapInteractionToMetaShape(interaction);
    expect(mapped.interactive).toEqual({ type: 'list_reply', list_reply: { id: 'lang_ur', title: 'lang_ur' } });
  });

  it('returns null for an unhandled interaction type', () => {
    const interaction = { user: { id: '1' }, isButton: () => false, isStringSelectMenu: () => false };
    expect(mapInteractionToMetaShape(interaction)).toBeNull();
  });

  it('returns null for a select menu with no chosen value', () => {
    const interaction = { user: { id: '1' }, isButton: () => false, isStringSelectMenu: () => true, values: [] };
    expect(mapInteractionToMetaShape(interaction)).toBeNull();
  });
});

describe('mapSlashCommandToMetaShape', () => {
  it('maps a slash command with a registered trailing-text option to the Meta text shape', () => {
    const interaction = {
      commandName: 'quiz',
      user: { id: '918273645' },
      options: { getString: (name) => (name === 'text' ? 'fractions for grade 5' : null) },
    };
    const mapped = mapSlashCommandToMetaShape(interaction);
    expect(mapped).toEqual({
      from: 'discord:918273645',
      id: expect.stringMatching(/^slash-\d+-918273645$/),
      timestamp: expect.any(Number),
      type: 'text',
      text: { body: '/quiz fractions for grade 5' },
    });
  });

  it('maps a slash command with no trailing text to just the bare command', () => {
    const interaction = { commandName: 'menu', user: { id: '918273645' }, options: { getString: () => null } };
    const mapped = mapSlashCommandToMetaShape(interaction);
    expect(mapped.text).toEqual({ body: '/menu' });
  });

  it('drops any trailing text for /readingtest — text-message.handler.js matches it via an exact string, not a prefix', () => {
    const interaction = {
      commandName: 'readingtest', user: { id: '918273645' },
      options: { getString: () => 'grade 5 english' },
    };
    const mapped = mapSlashCommandToMetaShape(interaction);
    expect(mapped.text).toEqual({ body: '/readingtest' });
  });

  it('returns null when commandName or user id is missing', () => {
    expect(mapSlashCommandToMetaShape({ user: { id: '1' } })).toBeNull();
    expect(mapSlashCommandToMetaShape({ commandName: 'quiz' })).toBeNull();
    expect(mapSlashCommandToMetaShape(null)).toBeNull();
  });
});

describe('isDuplicateDelivery', () => {
  it('returns false for an unseen id and true for the same id seen again', () => {
    expect(isDuplicateDelivery('msg-1')).toBe(false);
    expect(isDuplicateDelivery('msg-1')).toBe(true);
  });

  it('treats an absent id as never a duplicate (never records it)', () => {
    expect(isDuplicateDelivery(undefined)).toBe(false);
    expect(isDuplicateDelivery(undefined)).toBe(false);
  });
});

describe('attach', () => {
  function mockDiscordModalInteractions(overrides = {}) {
    const mod = {
      handleModalSubmit: jest.fn().mockResolvedValue(undefined),
      tryHandleCollected: jest.fn().mockReturnValue(false),
      tryHandleStartFlow: jest.fn().mockResolvedValue(false),
      tryHandleAttendanceLoopButton: jest.fn().mockResolvedValue(false),
      ...overrides,
    };
    jest.doMock('../../bot/shared/routes/discord-modal-interactions.handler', () => mod, { virtual: true });
    return mod;
  }

  function mockConnection() {
    const handlers = {};
    const client = { on: jest.fn((event, handler) => { handlers[event] = handler; }) };
    jest.doMock('../../bot/shared/services/messaging/discord-connection', () => ({
      getClient: jest.fn().mockResolvedValue(client),
    }));
    return { client, handlers };
  }

  beforeEach(() => jest.resetModules());

  it('registers messageCreate and interactionCreate listeners on the shared client', async () => {
    mockDiscordModalInteractions();
    const { handlers } = mockConnection();
    const { attach: freshAttach } = require('../../bot/shared/services/messaging/inbound/discord-events.adapter');

    const dispatch = jest.fn();
    await freshAttach(dispatch);

    expect(typeof handlers.messageCreate).toBe('function');
    expect(typeof handlers.interactionCreate).toBe('function');
  });

  it('dispatches a mapped text message on messageCreate', async () => {
    mockDiscordModalInteractions();
    const { handlers } = mockConnection();
    const { attach: freshAttach } = require('../../bot/shared/services/messaging/inbound/discord-events.adapter');

    const dispatch = jest.fn().mockResolvedValue(undefined);
    await freshAttach(dispatch);

    const message = {
      author: { id: '918273645', bot: false }, channel: { type: 1 }, content: 'hi',
      id: '169.001', createdTimestamp: 169001, attachments: { first: () => undefined },
    };
    await handlers.messageCreate(message);

    expect(dispatch).toHaveBeenCalledTimes(1);
    const [dispatchReq] = dispatch.mock.calls[0];
    expect(dispatchReq.body.entry[0].changes[0].value.messages[0]).toEqual(
      expect.objectContaining({ from: 'discord:918273645', type: 'text', text: { body: 'hi' } })
    );
  });

  it('does not dispatch twice for a redelivered message id', async () => {
    mockDiscordModalInteractions();
    const { handlers } = mockConnection();
    const { attach: freshAttach } = require('../../bot/shared/services/messaging/inbound/discord-events.adapter');

    const dispatch = jest.fn().mockResolvedValue(undefined);
    await freshAttach(dispatch);
    const message = {
      author: { id: '1', bot: false }, channel: { type: 1 }, content: 'hi',
      id: 'dup-1', createdTimestamp: Date.now(), attachments: { first: () => undefined },
    };
    await handlers.messageCreate(message);
    await handlers.messageCreate(message);
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it('acks a slash command (deferReply) and dispatches the mapped command', async () => {
    mockDiscordModalInteractions();
    const { handlers } = mockConnection();
    const { attach: freshAttach } = require('../../bot/shared/services/messaging/inbound/discord-events.adapter');

    const dispatch = jest.fn().mockResolvedValue(undefined);
    await freshAttach(dispatch);

    const interaction = {
      id: 'int-1',
      isChatInputCommand: () => true,
      isModalSubmit: () => false,
      isButton: () => false,
      isStringSelectMenu: () => false,
      deferReply: jest.fn().mockResolvedValue(undefined),
      commandName: 'settings',
      user: { id: '918273645' },
      options: { getString: () => null },
    };
    await handlers.interactionCreate(interaction);

    // Regression test: discord.js deprecated the `ephemeral: true` shorthand
    // in favor of `flags: MessageFlags.Ephemeral` — using the old shape
    // logged a deprecation warning on every single slash command.
    const { MessageFlags } = require('discord.js');
    expect(interaction.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it('routes a modal submission to discord-modal-interactions.handler#handleModalSubmit, never through ordinary dispatch', async () => {
    const modalInteractions = mockDiscordModalInteractions();
    const { handlers } = mockConnection();
    const { attach: freshAttach } = require('../../bot/shared/services/messaging/inbound/discord-events.adapter');

    const dispatch = jest.fn();
    await freshAttach(dispatch);

    const interaction = {
      isChatInputCommand: () => false, isModalSubmit: () => true,
      isButton: () => false, isStringSelectMenu: () => false,
    };
    await handlers.interactionCreate(interaction);

    expect(modalInteractions.handleModalSubmit).toHaveBeenCalledWith(interaction);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('offers a button/select interaction to the pending-collector registry FIRST — claimed interactions never reach ordinary chat mapping', async () => {
    const modalInteractions = mockDiscordModalInteractions({ tryHandleCollected: jest.fn().mockResolvedValue(true) });
    const { handlers } = mockConnection();
    const { attach: freshAttach } = require('../../bot/shared/services/messaging/inbound/discord-events.adapter');

    const dispatch = jest.fn();
    await freshAttach(dispatch);

    const interaction = {
      isChatInputCommand: () => false, isModalSubmit: () => false,
      isButton: () => true, isStringSelectMenu: () => false,
      user: { id: '1' }, customId: 'menu_video',
      deferUpdate: jest.fn(),
    };
    await handlers.interactionCreate(interaction);

    expect(modalInteractions.tryHandleCollected).toHaveBeenCalledWith(interaction);
    expect(interaction.deferUpdate).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('falls through to ordinary chat button mapping when no collector claims the interaction', async () => {
    mockDiscordModalInteractions({ tryHandleCollected: jest.fn().mockReturnValue(false) });
    const { handlers } = mockConnection();
    const { attach: freshAttach } = require('../../bot/shared/services/messaging/inbound/discord-events.adapter');

    const dispatch = jest.fn().mockResolvedValue(undefined);
    await freshAttach(dispatch);

    const interaction = {
      id: 'int-2',
      isChatInputCommand: () => false, isModalSubmit: () => false,
      isButton: () => true, isStringSelectMenu: () => false,
      user: { id: '918273645' }, customId: 'menu_video', message: { id: '169.030' },
      deferUpdate: jest.fn().mockResolvedValue(undefined),
    };
    await handlers.interactionCreate(interaction);

    expect(interaction.deferUpdate).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledTimes(1);
    const [dispatchReq] = dispatch.mock.calls[0];
    expect(dispatchReq.body.entry[0].changes[0].value.messages[0]).toEqual(
      expect.objectContaining({ from: 'discord:918273645', type: 'interactive' })
    );
  });
});
