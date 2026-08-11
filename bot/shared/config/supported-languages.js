/**
 * Supported Languages — single source of truth
 *
 * The canonical list of language codes the platform accepts, plus their
 * display names. Historically this list was duplicated across
 * language-cache.js, language-detector.service.js, the WhatsApp language
 * picker, and a DB CHECK constraint, which drifted out of sync. This module
 * consolidates the *code list + display names*; provider-specific routing
 * (Soniox hints, TTS voice IDs) still lives with each provider's config but
 * validates codes against SUPPORTED_LANGUAGES.
 *
 * Support notes:
 * - Full support (conversation + reading assessment): en, ur
 * - Conversation only (coaching/chat/LP/quiz/voice): every other code
 * - Reading-assessment norms (WCPM/LCPM) exist only for en/ur today; the
 *   Indian languages are conversation-only at launch (see the India language
 *   expansion plan).
 *
 * Tamil disambiguation: `ta-LK` is Sri Lankan Tamil (pre-existing); `ta-IN`
 * is Indian Tamil. Both normalize to Soniox `ta` via `.split('-')[0]`.
 */

// Ordered map: code -> display names. Order is used as the default picker order.
const LANGUAGES = {
  // Full support
  en: { native: 'English', english: 'English' },
  ur: { native: 'اردو', english: 'Urdu' },

  // Pakistan regional (conversation only)
  'pa-PK': { native: 'پنجابی', english: 'Punjabi' },
  'sd-PK': { native: 'سنڌي', english: 'Sindhi' },
  'ps-PK': { native: 'پښتو', english: 'Pashto' },
  'bal-PK': { native: 'بلوچی', english: 'Balochi' },
  'ta-LK': { native: 'தமிழ்', english: 'Tamil (Sri Lanka)' },

  // India (conversation only)
  hi: { native: 'हिन्दी', english: 'Hindi' },
  bn: { native: 'বাংলা', english: 'Bengali' },
  mr: { native: 'मराठी', english: 'Marathi' },
  te: { native: 'తెలుగు', english: 'Telugu' },
  'ta-IN': { native: 'தமிழ்', english: 'Tamil' },
  kn: { native: 'ಕನ್ನಡ', english: 'Kannada' },

  // Other
  ar: { native: 'العربية', english: 'Arabic' },
  es: { native: 'Español', english: 'Spanish' },
  fr: { native: 'Français', english: 'French' },
};

const SUPPORTED_LANGUAGES = Object.keys(LANGUAGES);
const DEFAULT_LANGUAGE = 'en';

// Codes whose scripts are right-to-left (Perso-Arabic). Indian (Brahmic)
// scripts are LTR, so they are intentionally excluded.
const RTL_LANGUAGES = ['ur', 'ar', 'pa-PK', 'sd-PK', 'ps-PK', 'bal-PK'];

/**
 * @param {string} code
 * @returns {boolean} whether the code is a supported language
 */
function isSupported(code) {
  return typeof code === 'string' && SUPPORTED_LANGUAGES.includes(code);
}

/**
 * Human-readable label for a code, e.g. "हिन्दी (Hindi)".
 * Falls back to the raw code for unknown values.
 * @param {string} code
 * @returns {string}
 */
function getLabel(code) {
  const entry = LANGUAGES[code];
  if (!entry) return code;
  return entry.native === entry.english
    ? entry.native
    : `${entry.native} (${entry.english})`;
}

/**
 * English name for a code (used in logs / LLM prompts).
 * @param {string} code
 * @returns {string}
 */
function getEnglishName(code) {
  return LANGUAGES[code]?.english || code;
}

/**
 * Build a WhatsApp/settings dropdown ({id,title}) from a list of codes,
 * skipping unknown codes. Order follows the input array.
 * @param {string[]} codes
 * @returns {{id: string, title: string}[]}
 */
function toDropdown(codes) {
  return (Array.isArray(codes) ? codes : [])
    .filter((c) => LANGUAGES[c])
    .map((c) => ({ id: c, title: getLabel(c) }));
}

/**
 * @param {string} code
 * @returns {boolean} whether the code's script is right-to-left
 */
function isRTL(code) {
  return RTL_LANGUAGES.includes(code);
}

module.exports = {
  LANGUAGES,
  SUPPORTED_LANGUAGES,
  DEFAULT_LANGUAGE,
  RTL_LANGUAGES,
  isSupported,
  getLabel,
  getEnglishName,
  toDropdown,
  isRTL,
};
