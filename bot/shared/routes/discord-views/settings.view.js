/**
 * Discord screen mapping for the settings Flow-equivalent — the counterpart
 * to slack-views/settings.view.js, but shaped for discord-modal-flow.js's
 * screenToSteps()/mergeScreenData() contract instead of Slack's one-shot
 * screenToView()/viewToScreenData().
 *
 * Both fields (language, observation_framework) are enums with zero free
 * text — a REAL simplification over Slack's own settings renderer (which
 * always opens a modal, even though it has nothing but selects): Discord's
 * settings screen needs no modal at all, just two sequential
 * collectEnumAnswers() steps followed directly by exchange().
 */

const { StringSelectMenuBuilder } = require('discord.js');

function toOption(row) {
  // Discord select option label caps at 100 chars, value at 100 chars.
  return { label: String(row.title).slice(0, 100), value: String(row.id).slice(0, 100) };
}

/**
 * Deliberately does NOT mark the current value as a pre-selected `default`
 * option. Discord's own client treats re-picking an already-selected option
 * as no change at all — it never sends a fresh interaction back to Discord's
 * servers, so a teacher who wants to KEEP their current language and simply
 * confirms it would produce no interaction, leaving awaitMessageComponent()
 * waiting until it times out. Showing the current value in the placeholder
 * instead still tells the teacher what they have, without ever letting a
 * "no-op" selection silently stall the flow.
 */
function buildLanguageMenu(data) {
  const current = data.languages.find((row) => row.id === data.current_language);
  const placeholder = current ? `Reply language (current: ${current.title})` : 'Reply language';
  return new StringSelectMenuBuilder()
    .setCustomId('language')
    .setPlaceholder(placeholder.slice(0, 150))
    .addOptions(data.languages.map(toOption));
}

function buildFrameworkMenu(data) {
  const current = data.frameworks.find((row) => row.id === data.current_framework);
  const placeholder = current ? `Observation framework (current: ${current.title})` : 'Observation framework';
  return new StringSelectMenuBuilder()
    .setCustomId('observation_framework')
    .setPlaceholder(placeholder.slice(0, 150))
    .addOptions(data.frameworks.map(toOption));
}

function screenToSteps(screen, data) {
  if (screen === 'SETTINGS_MAIN') {
    return {
      steps: [
        { fieldName: 'language', promptText: 'Pick your reply language:', buildMenu: () => buildLanguageMenu(data) },
        { fieldName: 'observation_framework', promptText: 'Pick your observation framework:', buildMenu: () => buildFrameworkMenu(data) },
      ],
      textFields: [],
      title: 'Settings',
    };
  }

  throw new Error(`discord-views/settings: no screen mapping for "${screen}"`);
}

function mergeScreenData(screen, enumAnswers) {
  if (screen === 'SETTINGS_MAIN') {
    return {
      language: enumAnswers.language || 'en',
      observation_framework: enumAnswers.observation_framework || 'oecd',
    };
  }
  return {};
}

module.exports = { screenToSteps, mergeScreenData, toOption };
