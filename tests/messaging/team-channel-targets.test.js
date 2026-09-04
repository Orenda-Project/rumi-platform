/**
 * Team targets for the additive drivers — a Slack CHANNEL, a Discord CHANNEL,
 * and a WhatsApp GROUP (Baileys). Every driver already addresses a person;
 * these tests lock the small, additive extension that lets the same send
 * methods reach a team (used by bot/scripts/brief/send-brief.js). The
 * existing person-addressing behaviour is re-asserted alongside so the
 * extension can never regress it.
 *
 * Same mocked-client harnesses as slack-channel-service.test.js,
 * discord-channel-service.test.js and baileys-channel-service.test.js —
 * nothing here touches a real network.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

let tmpDir;
let pngPath;

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rumi-team-targets-'));
  pngPath = path.join(tmpDir, 'panel.png');
  fs.writeFileSync(pngPath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

afterEach(() => {
  jest.resetModules();
  delete process.env.SLACK_BOT_TOKEN;
});

// ── Slack ────────────────────────────────────────────────────────────────────

function loadSlack() {
  jest.resetModules();
  const client = {
    conversations: { open: jest.fn(async () => ({ channel: { id: 'D0123DM' } })) },
    chat: { postMessage: jest.fn(async () => ({ ts: '169.001' })) },
    reactions: { add: jest.fn(async () => ({})) },
    files: {
      uploadV2: jest.fn(async () => ({ files: [{ id: 'F0123FILE' }] })),
      info: jest.fn(async () => ({ file: {} })),
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

describe('slack-channel.service — channel targets', () => {
  const CHANNEL = 'slack:channel:C0123ABC';

  it('sendMessage to a "slack:channel:<id>" target posts straight to that channel, never opening a DM', async () => {
    const { service, client } = loadSlack();
    const result = await service.sendMessage(CHANNEL, 'Morning');
    expect(result).toBe(true);
    expect(client.conversations.open).not.toHaveBeenCalled();
    expect(client.chat.postMessage).toHaveBeenCalledWith({ channel: 'C0123ABC', text: 'Morning' });
  });

  it('sendImage to a channel target uploads with the channel id as channel_id', async () => {
    const { service, client } = loadSlack();
    const result = await service.sendImage(CHANNEL, pngPath, 'The cover');
    expect(result).toBe(true);
    expect(client.conversations.open).not.toHaveBeenCalled();
    expect(client.files.uploadV2).toHaveBeenCalledWith(expect.objectContaining({
      channel_id: 'C0123ABC',
      filename: 'panel.png',
      initial_comment: 'The cover',
    }));
  });

  it('sendTextReturningId and sendInteractiveButtons resolve the same way — one helper for every send path', async () => {
    const { service, client } = loadSlack();
    await service.sendTextReturningId(CHANNEL, 'hi');
    await service.sendInteractiveButtons(CHANNEL, { body: 'Pick', buttons: [{ id: 'a', title: 'A' }] });
    expect(client.conversations.open).not.toHaveBeenCalled();
    for (const call of client.chat.postMessage.mock.calls) {
      expect(call[0].channel).toBe('C0123ABC');
    }
  });

  it('a person target ("slack:U…") still opens a DM exactly as before', async () => {
    const { service, client } = loadSlack();
    await service.sendMessage('slack:U0123ABC', 'hi');
    expect(client.conversations.open).toHaveBeenCalledWith({ users: 'U0123ABC' });
    expect(client.chat.postMessage).toHaveBeenCalledWith({ channel: 'D0123DM', text: 'hi' });
  });

  it('exposes the resolver so the contract is inspectable', async () => {
    const { service, client } = loadSlack();
    await expect(service._resolveConversationId(CHANNEL)).resolves.toBe('C0123ABC');
    await expect(service._resolveConversationId('slack:U0123ABC')).resolves.toBe('D0123DM');
    expect(client.conversations.open).toHaveBeenCalledTimes(1);
  });
});

// ── Discord ──────────────────────────────────────────────────────────────────

function loadDiscord() {
  jest.resetModules();
  const user = {
    id: 'U0123ABC',
    send: jest.fn(async () => ({ id: '1699999999123' })),
    dmChannel: null,
    createDM: jest.fn(async () => user.dmChannel),
  };
  user.dmChannel = { sendTyping: jest.fn(async () => {}), messages: { fetch: jest.fn() } };
  const channel = {
    id: '987654321',
    send: jest.fn(async () => ({ id: '1699999999456' })),
    sendTyping: jest.fn(async () => {}),
  };
  const client = {
    users: { fetch: jest.fn(async () => user) },
    channels: { fetch: jest.fn(async () => channel) },
  };
  jest.doMock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
  jest.doMock('../../bot/shared/storage/r2', () => ({
    downloadFromR2: jest.fn(),
    extractKeyFromUrl: jest.fn((url) => url.split('/').pop()),
  }));
  jest.doMock('../../bot/shared/services/messaging/discord-connection', () => ({
    getClient: jest.fn(async () => client),
  }));
  const service = require('../../bot/shared/services/messaging/discord-channel.service');
  return { service, client, user, channel };
}

describe('discord-channel.service — channel targets', () => {
  const CHANNEL = 'discord:channel:987654321';

  it('sendMessage to a "discord:channel:<id>" target fetches the channel and sends there, never a user DM', async () => {
    const { service, client, channel, user } = loadDiscord();
    const result = await service.sendMessage(CHANNEL, 'Morning');
    expect(result).toBe(true);
    expect(client.channels.fetch).toHaveBeenCalledWith('987654321');
    expect(client.users.fetch).not.toHaveBeenCalled();
    expect(channel.send).toHaveBeenCalledWith({ content: 'Morning' });
    expect(user.send).not.toHaveBeenCalled();
  });

  it('sendImage to a channel target attaches the file to the channel message', async () => {
    const { service, channel } = loadDiscord();
    const result = await service.sendImage(CHANNEL, pngPath, 'The cover');
    expect(result).toBe(true);
    expect(channel.send).toHaveBeenCalledWith(expect.objectContaining({
      content: 'The cover',
      files: [expect.objectContaining({ name: 'panel.png' })],
    }));
  });

  it('a person target ("discord:<id>") still DMs the user exactly as before', async () => {
    const { service, client, user } = loadDiscord();
    await service.sendMessage('discord:U0123ABC', 'hi');
    expect(client.users.fetch).toHaveBeenCalledWith('U0123ABC');
    expect(client.channels.fetch).not.toHaveBeenCalled();
    expect(user.send).toHaveBeenCalledWith({ content: 'hi' });
  });
});

// ── Baileys ──────────────────────────────────────────────────────────────────

function loadBaileys() {
  jest.resetModules();
  const sock = {
    sendMessage: jest.fn(async () => ({})),
    sendPresenceUpdate: jest.fn(async () => {}),
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
  jest.doMock('../../bot/shared/services/messaging/baileys-connection', () => ({
    getSocket: jest.fn().mockResolvedValue(sock),
    isConnected: jest.fn().mockReturnValue(true),
    authDir: jest.fn().mockReturnValue('/tmp/never-used'),
  }));
  const service = require('../../bot/shared/services/messaging/baileys-channel.service');
  return { service, sock };
}

describe('baileys-channel.service — group targets', () => {
  const GROUP = '120363012345678901@g.us';

  it('passes a WhatsApp group JID (…@g.us) through untouched instead of digit-mangling it', async () => {
    const { service, sock } = loadBaileys();
    const result = await service.sendMessage(GROUP, 'Morning');
    expect(result).toBe(true);
    expect(sock.sendMessage).toHaveBeenCalledWith(GROUP, { text: 'Morning' });
  });

  it('sendImage to a group sends the image to the group JID', async () => {
    const { service, sock } = loadBaileys();
    const result = await service.sendImage(GROUP, pngPath, 'The cover');
    expect(result).toBe(true);
    expect(sock.sendMessage).toHaveBeenCalledWith(GROUP, expect.objectContaining({ caption: 'The cover' }));
  });

  it('_toJid keeps the group JID and still normalises a person number as before', () => {
    const { service } = loadBaileys();
    expect(service._toJid(GROUP)).toBe(GROUP);
    expect(service._toJid('15550100000')).toBe('15550100000@s.whatsapp.net');
    expect(service._toJid('15550100000:0@s.whatsapp.net')).toBe('15550100000@s.whatsapp.net');
  });
});
