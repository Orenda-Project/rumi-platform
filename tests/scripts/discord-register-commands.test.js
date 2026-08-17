/**
 * discord-register-commands.js — the one-time REST call registering the 9
 * slash commands (unlike Slack, which has no such registration script — its
 * commands are entered by hand, one at a time, in the app config UI).
 * discord.js's REST client is mocked entirely; this suite never makes a
 * real network call.
 */

const { SLACK_SLASH_COMMANDS } = require('../../bot/scripts/setup/fields');

// discord.js is a bot-only dependency (installed under bot/node_modules,
// not the repo root) — mocked virtual: true so this suite runs identically
// whether or not it happens to be resolvable, matching this session's own
// established CI lesson (root `npm test` runs BEFORE `bot/ npm ci`).
function mockDiscordRest() {
  const put = jest.fn().mockResolvedValue([]);
  class FakeREST {
    setToken() { return this; }
    put(...args) { return put(...args); }
  }
  const Routes = {
    applicationCommands: jest.fn((id) => `/applications/${id}/commands`),
    applicationGuildCommands: jest.fn((id, guildId) => `/applications/${id}/guilds/${guildId}/commands`),
  };
  class FakeSlashCommandBuilder {
    setName(name) { this.name = name; return this; }
    setDescription(description) { this.description = description; return this; }
    toJSON() { return { name: this.name, description: this.description, options: [], type: 1 }; }
  }
  jest.doMock('discord.js', () => ({ REST: FakeREST, Routes, SlashCommandBuilder: FakeSlashCommandBuilder }), { virtual: true });
  return { put, Routes };
}

function load() {
  jest.resetModules();
  const rest = mockDiscordRest();
  const mod = require('../../bot/scripts/setup/discord-register-commands');
  return { mod, ...rest };
}

describe('bareCommandNames', () => {
  it('strips the leading "/" off every command in SLACK_SLASH_COMMANDS — the SAME list, not a second hardcoded copy', () => {
    const { mod } = load();
    const bare = mod.bareCommandNames();
    expect(bare).toEqual(SLACK_SLASH_COMMANDS.map((c) => c.slice(1)));
    expect(bare).toHaveLength(SLACK_SLASH_COMMANDS.length);
  });

  it('never drifts from SLACK_SLASH_COMMANDS — adding/removing a command there is the only way to change this list', () => {
    const { mod } = load();
    expect(mod.bareCommandNames().map((c) => `/${c}`)).toEqual(SLACK_SLASH_COMMANDS);
  });
});

describe('buildCommandDefinitions', () => {
  it('builds one {name, description} entry per command, all Discord-legal (lowercase, no spaces)', () => {
    const { mod } = load();
    const defs = mod.buildCommandDefinitions();
    expect(defs).toHaveLength(SLACK_SLASH_COMMANDS.length);
    for (const def of defs) {
      expect(def.name).toMatch(/^[a-z0-9_-]+$/);
      expect(typeof def.description).toBe('string');
      expect(def.description.length).toBeGreaterThan(0);
    }
  });

  it('every command has a real, specific description — not a generic fallback', () => {
    const { mod } = load();
    const defs = mod.buildCommandDefinitions();
    for (const def of defs) {
      expect(mod.COMMAND_DESCRIPTIONS[def.name]).toBe(def.description);
    }
  });
});

describe('registerDiscordCommands', () => {
  it('throws without a bot token', async () => {
    const { mod } = load();
    await expect(mod.registerDiscordCommands({ applicationId: 'app1' })).rejects.toThrow(/DISCORD_BOT_TOKEN/);
  });

  it('throws without an application id', async () => {
    const { mod } = load();
    await expect(mod.registerDiscordCommands({ token: 'tok1' })).rejects.toThrow(/DISCORD_APPLICATION_ID/);
  });

  it('registers globally when no guildId is given', async () => {
    const { mod, put, Routes } = load();
    const result = await mod.registerDiscordCommands({ token: 'tok1', applicationId: 'app1' });

    expect(Routes.applicationCommands).toHaveBeenCalledWith('app1');
    expect(Routes.applicationGuildCommands).not.toHaveBeenCalled();
    expect(put).toHaveBeenCalledWith('/applications/app1/commands', { body: expect.any(Array) });
    expect(result.guildScoped).toBe(false);
    expect(result.registered).toBe(SLACK_SLASH_COMMANDS.length);
    expect(result.commands).toEqual(mod.bareCommandNames());
  });

  it('registers guild-scoped (instant propagation) when a guildId is given', async () => {
    const { mod, put, Routes } = load();
    const result = await mod.registerDiscordCommands({ token: 'tok1', applicationId: 'app1', guildId: 'guild1' });

    expect(Routes.applicationGuildCommands).toHaveBeenCalledWith('app1', 'guild1');
    expect(put).toHaveBeenCalledWith('/applications/app1/guilds/guild1/commands', { body: expect.any(Array) });
    expect(result.guildScoped).toBe(true);
  });

  it('reads the token/applicationId/guildId from env vars when not passed explicitly', async () => {
    const { mod, Routes } = load();
    process.env.DISCORD_BOT_TOKEN = 'env-token';
    process.env.DISCORD_APPLICATION_ID = 'env-app';
    process.env.DISCORD_TEST_GUILD_ID = 'env-guild';

    try {
      await mod.registerDiscordCommands();
      expect(Routes.applicationGuildCommands).toHaveBeenCalledWith('env-app', 'env-guild');
    } finally {
      delete process.env.DISCORD_BOT_TOKEN;
      delete process.env.DISCORD_APPLICATION_ID;
      delete process.env.DISCORD_TEST_GUILD_ID;
    }
  });
});
