/**
 * Settings Flow Data Configuration
 *
 * Static data for the WhatsApp Flow settings form — {id, title} arrays used as
 * Flow dropdown data-sources.
 *
 * Flow JSON references:
 *   SETTINGS_MAIN: ${data.languages}, ${data.frameworks}
 *
 * Region-agnostic: the language list defaults to a broad multilingual set, and
 * a deployment can narrow it to the languages it actually supports by setting
 * SETTINGS_LANGUAGES to a JSON array of {id,title} objects. The framework list
 * is derived from region-config FRAMEWORK_LABELS.
 */

const { FRAMEWORK_LABELS } = require('./region-config');

// Default language options. Override via SETTINGS_LANGUAGES (JSON array).
const DEFAULT_LANGUAGES = [
  { id: 'en', title: 'English' },
  { id: 'ur', title: 'اردو (Urdu)' },
  { id: 'sw', title: 'Kiswahili' },
  { id: 'ar', title: 'العربية (Arabic)' },
  { id: 'es', title: 'Español' },
];

function parseLanguagesEnv() {
  try {
    const parsed = JSON.parse(process.env.SETTINGS_LANGUAGES || '[]');
    if (Array.isArray(parsed) && parsed.length && parsed.every(o => o && o.id && o.title)) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

const LANGUAGES_DROPDOWN = parseLanguagesEnv() || DEFAULT_LANGUAGES;

// Observation framework options — built from region-config labels.
const FRAMEWORKS_DROPDOWN = Object.entries(FRAMEWORK_LABELS).map(([id, title]) => ({
  id,
  title,
}));

module.exports = {
  LANGUAGES_DROPDOWN,
  FRAMEWORKS_DROPDOWN,
};
