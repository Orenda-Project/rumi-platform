'use strict';

/**
 * The voice language table: for each Rumi language code, the script it is written in, the language code
 * and default voice Soniox uses for it, the words that replace symbols in a reply before Soniox reads it,
 * and the number rule that runs on the Soniox path. This is the one place per-language voice data lives
 * so the gateway, the provider and the text pipeline ask this file, never their own map.
 *
 * A null Soniox code means Soniox does not speak that language at all, so a note in it always
 * takes today's vendor. No default voice means the language is held back until an operator names one
 * with SONIOX_TTS_VOICE_<CODE>.
 */

const ENGLISH_ROW = Object.freeze({
  stop: '.',
  or: 'or',
  then: ', then',
  plus: 'plus',
  to: 'to',
  // Indexed by the number on the keycap; 0 is here so every row indexes the same way.
  keycaps: Object.freeze(['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten']),
});

const URDU_ROW = Object.freeze({
  stop: '۔',
  or: 'یا',
  then: '، پھر',
  plus: 'جمع',
  to: 'سے',
  keycaps: Object.freeze(['صفر', 'ایک', 'دو', 'تین', 'چار', 'پانچ', 'چھ', 'سات', 'آٹھ', 'نو', 'دس']),
});

const ARABIC_ROW = Object.freeze({
  stop: '.',
  or: 'أو',
  then: '، ثم',
  plus: 'زائد',
  to: 'إلى',
  keycaps: Object.freeze(['صفر', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة', 'عشرة']),
});

// A language whose symbol words nobody has written yet: end each line with a stop and drop keycaps, but
// never put an English word into a Tamil or Spanish sentence.
const STOP_ONLY_ROW = Object.freeze({ stop: '.', or: null, then: null, plus: null, to: null, keycaps: null });

function row({ script, sonioxCode = null, voice = null, symbols = null, numbers = null }) {
  return Object.freeze({ script, sonioxCode, voice, symbols, numbers });
}

const LANGUAGES = Object.freeze({
  en: row({ script: 'Latin', sonioxCode: 'en', voice: 'Grace', symbols: ENGLISH_ROW }),
  ur: row({ script: 'Arabic', sonioxCode: 'ur', voice: 'Ishita', symbols: URDU_ROW, numbers: 'urdu' }),
  // Ishita reads Shahmukhi Punjabi with the Soniox code pa; it shares the Urdu symbol words.
  'pa-PK': row({ script: 'Arabic', sonioxCode: 'pa', voice: 'Ishita', symbols: URDU_ROW }),
  ar: row({ script: 'Arabic', sonioxCode: 'ar', voice: 'Layla', symbols: ARABIC_ROW, numbers: 'arabic' }),
  'ps-PK': row({ script: 'Arabic' }),
  'sd-PK': row({ script: 'Arabic' }),
  'bal-PK': row({ script: 'Arabic' }),
  'ta-LK': row({ script: 'Tamil', sonioxCode: 'ta' }),
  es: row({ script: 'Latin', sonioxCode: 'es' }),
});

// Loaded on first use, so a note in a language with no number rule never loads one.
const NUMBER_RULES = Object.freeze({
  urdu: () => require('./text/urdu-numbers').urduNumbers,
  arabic: () => require('./text/arabic-numbers').arabicNumbers,
});

/**
 * The table key for a code: an exact match ignoring case ('pa-pk' → 'pa-PK'), else the part before a
 * region suffix when that is itself a key ('ur-PK' → 'ur'). 'pa' is not a Rumi code and finds nothing.
 */
function tableKey(language) {
  if (typeof language !== 'string') return null;
  const wanted = language.trim().toLowerCase();
  const keys = Object.keys(LANGUAGES);
  const exact = keys.find((k) => k.toLowerCase() === wanted);
  if (exact) return exact;
  const base = wanted.split(/[-_]/)[0];
  return keys.find((k) => k === base) || null;
}

function entryFor(language) {
  const key = tableKey(language);
  return key ? LANGUAGES[key] : null;
}

/** The Soniox language code, or null when Soniox does not speak it. */
function sonioxCodeFor(language) {
  const entry = entryFor(language);
  return entry ? entry.sonioxCode : null;
}

/** SONIOX_TTS_VOICE_ + the Rumi code upper-cased with '-' as '_' (pa-PK → SONIOX_TTS_VOICE_PA_PK). */
function voiceVariableName(key) {
  return `SONIOX_TTS_VOICE_${key.toUpperCase().replace(/-/g, '_')}`;
}

/** The Soniox voice for a language: its override variable if set, else the table's default, else null. */
function sonioxVoiceFor(language, env = process.env) {
  const key = tableKey(language);
  if (!key || !LANGUAGES[key].sonioxCode) return null;
  const override = String((env || {})[voiceVariableName(key)] || '').trim();
  return override || LANGUAGES[key].voice;
}

/** Voice variables set for a language Soniox cannot speak; the gateway reports these once as ignored. */
function ignoredVoiceVariables(env = process.env) {
  return Object.keys(LANGUAGES)
    .filter((key) => !LANGUAGES[key].sonioxCode)
    .map(voiceVariableName)
    .filter((name) => String((env || {})[name] || '').trim());
}

/** False only when SONIOX_TTS_LANGUAGES lists languages and this one is not among them. */
function sonioxAllowsLanguage(language, env = process.env) {
  const listed = String((env || {}).SONIOX_TTS_LANGUAGES || '')
    .split(',')
    .map((code) => tableKey(code.trim()) || code.trim().toLowerCase())
    .filter(Boolean);
  if (!listed.length) return true;
  return listed.includes(tableKey(language));
}

/** Why Soniox will not speak this language, for the gateway's skipReason; null when it will. */
function sonioxSkipReason(language, env = process.env) {
  if (!sonioxCodeFor(language)) return 'no_soniox_code';
  if (!sonioxVoiceFor(language, env)) return 'no_voice';
  if (!sonioxAllowsLanguage(language, env)) return 'not_in_allowlist';
  return null;
}

/** 'Latin', 'Arabic' or 'Tamil' for a table language; null for a code outside the table. */
function nativeScript(language) {
  const entry = entryFor(language);
  return entry ? entry.script : null;
}

// Direction tags and links are not words anyone hears in a language, so they must not tip the count.
const NOT_LETTERS_RE = /\[[^\]\n]{1,40}\]|https?:\/\/\S+|www\.\S+/giu;
const SCRIPTS = Object.freeze([
  ['Latin', /\p{Script=Latin}/u],
  ['Arabic', /\p{Script=Arabic}/u],
  ['Tamil', /\p{Script=Tamil}/u],
]);

function letterCounts(text) {
  const counts = { total: 0 };
  if (typeof text !== 'string') return counts;
  for (const ch of text.replace(NOT_LETTERS_RE, ' ')) {
    if (!/\p{L}/u.test(ch)) continue;
    counts.total += 1;
    const hit = SCRIPTS.find(([, re]) => re.test(ch));
    const name = hit ? hit[0] : 'Other';
    counts[name] = (counts[name] || 0) + 1;
  }
  return counts;
}

/** The script most of the text's letters are written in, ignoring tags and links; null with no letters. */
function dominantScript(text) {
  const { total, ...byScript } = letterCounts(text);
  if (!total) return null;
  return Object.entries(byScript).sort((a, b) => b[1] - a[1])[0][0];
}

// Below this share of letters of its own script, a reply on a non-Latin language is English text and
// Grace reads it. Only the language's own script counts: a Greek π or a modifier apostrophe in an English
// maths answer is not Urdu or Arabic (T3.4b). Not 50%: an Urdu sentence carrying English terms is mostly Latin letters, because the
// English words are long and Urdu script leaves out short vowels (a staging answer had 140 of 255), and
// Ishita must still speak it. Not 15–20% either: an Urdu frame around English maths terms sits at 19%.
// Of 1,000 production replies, those under 5% were English or Roman Urdu with one name or word in Urdu.
const MIN_NATIVE_LETTER_PERCENT = 5;

/**
 * The language the note should be spoken in . On a
 * language with another script, text is read by the English voice only when that script is all but
 * absent (English text on the Arabic route, Roman Urdu on the Urdu route; letters of another script,
 * such as Greek or Tamil, do not count as native); a code-switched reply keeps
 * its own voice, English terms included. A Latin-script language is left alone, and so is one Soniox
 * cannot speak: that note goes to today's vendor whatever the text says.
 */
function effectiveLanguage({ language, text } = {}) {
  const script = nativeScript(language);
  if (!script || script === 'Latin' || !sonioxCodeFor(language)) return language;
  const counts = letterCounts(text);
  const native = counts[script] || 0;
  // Whole numbers on both sides, so the line falls exactly at 5% (text with no letters stays as it is).
  return native * 100 < counts.total * MIN_NATIVE_LETTER_PERCENT ? 'en' : language;
}

/**
 * The symbol words for a language. A table language without its own words gets a stop and nothing else;
 * a code outside the table gets the English words.
 */
function symbolRowFor(language) {
  const entry = entryFor(language);
  if (!entry) return LANGUAGES.en.symbols;
  return entry.symbols || STOP_ONLY_ROW;
}

/** The function that rewrites numbers for this language on the Soniox path, or null for none. */
function numberRuleFor(language) {
  const entry = entryFor(language);
  return entry && entry.numbers ? NUMBER_RULES[entry.numbers]() : null;
}

module.exports = {
  LANGUAGES,
  sonioxCodeFor,
  sonioxVoiceFor,
  ignoredVoiceVariables,
  sonioxAllowsLanguage,
  sonioxSkipReason,
  nativeScript,
  dominantScript,
  effectiveLanguage,
  symbolRowFor,
  numberRuleFor,
};
