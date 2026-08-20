/**
 * Discord screen mapping for the reading-assessment Flow-equivalent — the
 * counterpart to reading-assessment-endpoint.js's {init, exchange} contract.
 * No Slack renderer exists yet for this endpoint (explicitly deferred per
 * the integration plan) — this is Discord-only for now, matching the
 * endpoint's own renderer-agnostic design.
 *
 * BASIC_INFO: language + assessment_mode (both enums, 2 options each) plus
 * one text field (student_full_name) — a collector step then a modal.
 *
 * OPTIONS (manual mode only): reading level + scope (both enums, 4 and 2
 * options) — pure enum, no modal needed for this screen at all.
 */

const { StringSelectMenuBuilder } = require('discord.js');

function toOption(row) {
  return { label: String(row.title).slice(0, 100), value: String(row.id).slice(0, 100) };
}

function buildLanguageMenu(data) {
  return new StringSelectMenuBuilder()
    .setCustomId('assessment_mode_language')
    .setPlaceholder('Assessment language')
    .addOptions(data.languages.map(toOption));
}

function buildAssessmentModeMenu(data) {
  return new StringSelectMenuBuilder()
    .setCustomId('assessment_mode')
    .setPlaceholder('Assessment type')
    .addOptions(data.assessment_modes.map(toOption));
}

function buildLevelMenu(data) {
  return new StringSelectMenuBuilder()
    .setCustomId('select_the_reading_level')
    .setPlaceholder('Reading level')
    .addOptions(data.levels.map(toOption));
}

function buildScopeMenu(data) {
  return new StringSelectMenuBuilder()
    .setCustomId('scope_of_assessment')
    .setPlaceholder('Assessment scope')
    .addOptions(data.scopes.map(toOption));
}

function screenToSteps(screen, data) {
  if (screen === 'BASIC_INFO') {
    return {
      steps: [
        { fieldName: 'assessment_mode_language', promptText: 'Pick the assessment language:', buildMenu: () => buildLanguageMenu(data) },
        { fieldName: 'assessment_mode', promptText: 'Pick the assessment type:', buildMenu: () => buildAssessmentModeMenu(data) },
      ],
      textFields: [{ name: 'student_full_name', label: 'Student name', required: true }],
      title: 'Reading Assessment',
    };
  }

  if (screen === 'OPTIONS') {
    return {
      steps: [
        { fieldName: 'select_the_reading_level', promptText: 'Pick the reading level:', buildMenu: () => buildLevelMenu(data) },
        { fieldName: 'scope_of_assessment', promptText: 'Pick the assessment scope:', buildMenu: () => buildScopeMenu(data) },
      ],
      textFields: [],
      title: 'Assessment Options',
    };
  }

  throw new Error(`discord-views/reading-assessment: no screen mapping for "${screen}"`);
}

function mergeScreenData(screen, enumAnswers, textAnswers, carriedData = {}) {
  if (screen === 'BASIC_INFO') {
    return {
      student_full_name: textAnswers.student_full_name || '',
      Language: enumAnswers.assessment_mode_language || '',
      assessment_mode: enumAnswers.assessment_mode || '',
    };
  }
  if (screen === 'OPTIONS') {
    return {
      ...carriedData,
      select_the_reading_level: enumAnswers.select_the_reading_level || '',
      scope_of_assessment_: enumAnswers.scope_of_assessment || '',
    };
  }
  return {};
}

module.exports = { screenToSteps, mergeScreenData, toOption };
