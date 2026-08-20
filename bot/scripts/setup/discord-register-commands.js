/**
 * Registers Discord slash commands via the REST API.
 *
 * Unlike Meta (no slash-command concept) or Slack (a manual app-config-UI
 * step, one command entered by hand at a time), Discord slash-command
 * registration is a single REST call: `PUT /applications/{id}/commands`
 * (global) or `PUT /applications/{id}/guilds/{guildId}/commands`
 * (guild-scoped — instant propagation, vs up to ~1hr for global). This
 * script is what the setup wizard actually runs, not a manual UI step.
 *
 * The command LIST is not a second hardcoded copy — it reuses
 * fields.js's SLACK_SLASH_COMMANDS as the single shared source of truth,
 * stripping the leading "/" (Discord's registration API wants bare names).
 * All 9 existing command names are already Discord-legal (lowercase, no
 * spaces) — confirmed, no renaming needed.
 *
 * @module discord-register-commands
 */

const { SLACK_SLASH_COMMANDS } = require('./fields');

// One-line description per command, shown to the user in Discord's slash
// command autocomplete UI (Discord requires a non-empty description, unlike
// Slack which has no such requirement for its own commands).
const COMMAND_DESCRIPTIONS = {
  portal: 'Open your Rumi teacher portal',
  readingtest: 'Start a reading assessment for a student',
  quiz: 'Create a quiz for your class',
  video: 'Generate a short teaching video',
  menu: 'See everything Rumi can do',
  register: 'Register your teacher profile',
  language: 'Change your reply language',
  settings: 'Update your language and observation framework',
  status: 'Check your account and feature status',
};

/**
 * Strips the leading "/" and builds Discord's bare command list, e.g.
 * ['/portal', '/readingtest', ...] -> ['portal', 'readingtest', ...].
 * Exported so a test can diff this against SLACK_SLASH_COMMANDS directly,
 * structurally guaranteeing the two lists cannot drift apart.
 */
function bareCommandNames() {
  return SLACK_SLASH_COMMANDS.map((cmd) => cmd.replace(/^\//, ''));
}

/**
 * Builds the JSON body every command list needs for the PUT call —
 * {name, description} pairs, one per command. Uses discord.js's
 * SlashCommandBuilder for the same validation Discord's own API applies
 * (name/description length + charset), rather than hand-building plain
 * objects that could pass a typo straight through to a rejected API call.
 * @returns {Array<object>} JSON command definitions, ready for REST#put
 */
function buildCommandDefinitions() {
  const { SlashCommandBuilder } = require('discord.js');
  return bareCommandNames().map((name) => {
    const description = COMMAND_DESCRIPTIONS[name] || `Run the /${name} command`;
    return new SlashCommandBuilder().setName(name).setDescription(description).toJSON();
  });
}

/**
 * Registers every command from fields.js's SLACK_SLASH_COMMANDS list.
 * @param {object} [options]
 * @param {string} [options.token] - defaults to process.env.DISCORD_BOT_TOKEN
 * @param {string} [options.applicationId] - defaults to process.env.DISCORD_APPLICATION_ID
 * @param {string} [options.guildId] - if set, registers guild-scoped (instant propagation,
 *   for fast local iteration); omitted registers globally (production, ~1hr propagation)
 * @returns {Promise<{registered: number, guildScoped: boolean, commands: string[]}>}
 */
async function registerDiscordCommands(options = {}) {
  const { REST, Routes } = require('discord.js');

  const token = options.token || process.env.DISCORD_BOT_TOKEN;
  const applicationId = options.applicationId || process.env.DISCORD_APPLICATION_ID;
  const guildId = options.guildId || process.env.DISCORD_TEST_GUILD_ID || null;

  if (!token) throw new Error('discord-register-commands: DISCORD_BOT_TOKEN is required');
  if (!applicationId) throw new Error('discord-register-commands: DISCORD_APPLICATION_ID is required');

  const commands = buildCommandDefinitions();
  const rest = new REST({ version: '10' }).setToken(token);
  const route = guildId
    ? Routes.applicationGuildCommands(applicationId, guildId)
    : Routes.applicationCommands(applicationId);

  await rest.put(route, { body: commands });

  return { registered: commands.length, guildScoped: Boolean(guildId), commands: commands.map((c) => c.name) };
}

module.exports = { registerDiscordCommands, buildCommandDefinitions, bareCommandNames, COMMAND_DESCRIPTIONS };

if (require.main === module) {
  registerDiscordCommands()
    .then((result) => {
      const scope = result.guildScoped ? 'guild (instant)' : 'global (~1hr propagation)';
      // eslint-disable-next-line no-console -- CLI script, not application logging
      console.log(`✅ Registered ${result.registered} Discord slash commands (${scope}): ${result.commands.map((c) => `/${c}`).join(', ')}`);
    })
    .catch((error) => {
      // eslint-disable-next-line no-console -- CLI script, not application logging
      console.error(`❌ Failed to register Discord slash commands: ${error.message}`);
      process.exitCode = 1;
    });
}
