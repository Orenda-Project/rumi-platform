/**
 * Discord screen mapping for the registration Flow-equivalent — the
 * counterpart to slack-views/registration.view.js, shaped for
 * discord-modal-flow.js's screenToSteps()/mergeScreenData() contract.
 *
 * Two genuinely new pieces with no Slack equivalent (Slack's static_select
 * caps at 100 options, so it renders these as one dropdown each):
 *   - PERSONAL_INFO's `country` field: 164 options, over Discord's 25-option
 *     StringSelectMenu cap — resolved as a 2-step picker (pick a continent-ish
 *     bucket from discord-country-regions.js, then a country within it).
 *   - REGION_INFO's `region` field: 29 options (7 Pakistan + 22 India) — also
 *     over the cap, but needs NO new lookup table: registration-data.js's
 *     REGIONS_DROPDOWN already distinguishes the two by `in_`-prefixed ids,
 *     so this is a clean 2-step "Pakistan or India?" picker over existing data.
 *
 * PROFESSIONAL_INFO's `subjects` field is a REAL multi-select
 * (setMinValues/setMaxValues), matching WhatsApp/Slack's multi-select
 * semantics exactly — not a text-degradation.
 */

const { StringSelectMenuBuilder } = require('discord.js');
const { buildBuckets } = require('../../config/discord-country-regions');
const { REGIONS_DROPDOWN } = require('../../config/registration-data');

const BUCKET_FIELD = '_country_bucket';
const PK_IN_FIELD = '_pk_or_india';

function toOption(row) {
  return { label: String(row.title).slice(0, 100), value: String(row.id).slice(0, 100) };
}

function buildBucketMenu() {
  const buckets = buildBuckets(require('../../config/registration-data').COUNTRIES_DROPDOWN);
  return new StringSelectMenuBuilder()
    .setCustomId(BUCKET_FIELD)
    .setPlaceholder('Pick a region')
    .addOptions(buckets.map((b) => ({ label: b.title.slice(0, 100), value: b.id })));
}

function buildCountryMenu(answersSoFar) {
  const bucketId = answersSoFar[BUCKET_FIELD];
  const buckets = buildBuckets(require('../../config/registration-data').COUNTRIES_DROPDOWN);
  const bucket = buckets.find((b) => b.id === bucketId) || buckets[0];
  return new StringSelectMenuBuilder()
    .setCustomId('country')
    .setPlaceholder('Pick your country')
    .addOptions(bucket.countries.map(toOption));
}

function buildPkOrIndiaMenu() {
  return new StringSelectMenuBuilder()
    .setCustomId(PK_IN_FIELD)
    .setPlaceholder('Pakistan or India?')
    .addOptions([{ label: 'Pakistan', value: 'PK' }, { label: 'India', value: 'IN' }]);
}

function buildRegionMenu(answersSoFar) {
  const wantsIndia = answersSoFar[PK_IN_FIELD] === 'IN';
  const rows = REGIONS_DROPDOWN.filter((r) => String(r.id).startsWith('in_') === wantsIndia);
  return new StringSelectMenuBuilder()
    .setCustomId('region')
    .setPlaceholder('Pick your region')
    .addOptions(rows.map(toOption));
}

function buildOrganizationMenu(data) {
  return new StringSelectMenuBuilder()
    .setCustomId('organization')
    .setPlaceholder('Organization')
    .addOptions(data.organizations.map(toOption));
}

function buildGradeMenu(data) {
  return new StringSelectMenuBuilder()
    .setCustomId('grade')
    .setPlaceholder('Grade')
    .addOptions(data.grades.map(toOption));
}

function buildSubjectsMenu(data) {
  return new StringSelectMenuBuilder()
    .setCustomId('subjects')
    .setPlaceholder('Subjects (select all that apply)')
    .setMinValues(1)
    .setMaxValues(Math.min(data.subjects.length, 25))
    .addOptions(data.subjects.slice(0, 25).map(toOption));
}

function screenToSteps(screen, data) {
  if (screen === 'PERSONAL_INFO') {
    return {
      steps: [
        { fieldName: BUCKET_FIELD, promptText: 'Let’s start with where you’re based. Pick a region:', buildMenu: buildBucketMenu },
        { fieldName: 'country', promptText: 'Now pick your country:', buildMenu: buildCountryMenu },
      ],
      textFields: [{ name: 'full_name', label: 'Full name', required: true }],
      title: 'Register with Rumi',
    };
  }

  if (screen === 'REGION_INFO') {
    return {
      steps: [
        { fieldName: PK_IN_FIELD, promptText: 'Which region are you registering from?', buildMenu: buildPkOrIndiaMenu },
        { fieldName: 'region', promptText: 'Pick your region:', buildMenu: buildRegionMenu },
      ],
      textFields: [],
      title: 'Register with Rumi',
    };
  }

  if (screen === 'PROFESSIONAL_INFO') {
    return {
      steps: [
        { fieldName: 'organization', promptText: 'Pick your organization:', buildMenu: () => buildOrganizationMenu(data) },
        { fieldName: 'grade', promptText: 'Pick the grade you teach:', buildMenu: () => buildGradeMenu(data) },
        { fieldName: 'subjects', promptText: 'Pick the subjects you teach:', buildMenu: () => buildSubjectsMenu(data), multi: true },
      ],
      textFields: [{ name: 'school_name', label: 'School name (optional)', required: false }],
      title: 'Register with Rumi',
    };
  }

  if (screen === 'ORG_DETAILS') {
    return {
      steps: [],
      textFields: [{ name: 'organization_other', label: 'Organization name', required: true }],
      title: 'Register with Rumi',
    };
  }

  throw new Error(`discord-views/registration: no screen mapping for "${screen}"`);
}

function mergeScreenData(screen, enumAnswers, textAnswers) {
  if (screen === 'PERSONAL_INFO') {
    return { full_name: textAnswers.full_name || '', country: enumAnswers.country || '' };
  }
  if (screen === 'REGION_INFO') {
    return { region: enumAnswers.region || null };
  }
  if (screen === 'PROFESSIONAL_INFO') {
    return {
      organization: enumAnswers.organization || '',
      school_name: textAnswers.school_name || '',
      grade: enumAnswers.grade || '',
      subjects: enumAnswers.subjects || [],
    };
  }
  if (screen === 'ORG_DETAILS') {
    return { organization_other: textAnswers.organization_other || '' };
  }
  return {};
}

module.exports = { screenToSteps, mergeScreenData, toOption, BUCKET_FIELD, PK_IN_FIELD };
