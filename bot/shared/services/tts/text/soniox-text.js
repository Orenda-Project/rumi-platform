'use strict';

/**
 * Soniox text preparation: rewrites a reply written for a WhatsApp screen into the words a
 * listener should hear, immediately before the text goes to Soniox text-to-speech.
 *
 * Soniox reads its input more literally than ElevenLabs did. In side-by-side listening tests it
 * voiced slashes, underscores, arrows and keycap emoji that ElevenLabs skipped, said "hyphen"
 * inside a hyphenated number word, and dropped the point from a decimal written as
 * "thirty-one.three"; its documentation also warns that a bracketed direction it does not know may
 * be read aloud. prepareForSoniox() fixes those with six deterministic steps, in this order:
 *
 *   1. keycap digits become a number word and a stop; other emoji are removed
 *   2. markdown marks are unwrapped, list markers removed, unterminated lines given a stop
 *   3. digit ranges, arrows, plus signs and slashes become words
 *   4. the language's number rule, if it has one (languages.js): Urdu numbers become the English words
 *      the Urdu voice reads correctly; Arabic spells dates and percents
 *   5. our direction tags become Soniox tags; placeholders and unknown brackets are removed
 *   6. every run of whitespace becomes one space
 *
 * splitForSoniox() then cuts the prepared text into request-sized parts at sentence ends.
 *
 * The symbol words and the number rule come from languages.js, keyed by the full Rumi code, and a
 * language whose row has no symbol words keeps its symbols rather than getting English ones. No I/O.
 */

const { symbolRowFor, numberRuleFor } = require('../languages');
const { urduNumbers } = require('./urdu-numbers');

/** Our direction tags, as prompts write them, mapped to the Soniox tag with the same intent; null = drop. */
const TAG_MAP = Object.freeze({
  warmly: 'warm',
  enthusiastically: 'excited',
  enthusiastic: 'excited',
  encouragingly: 'reassuringly',
  encouraging: 'reassuringly',
  thoughtfully: 'calm',
  gently: 'softly',
  gentle: 'softly',
  empathetically: 'sincerely',
  proudly: 'delighted',
  proud: 'delighted',
  methodically: 'calm',
  laughs: 'laughs',
  slowly: 'slowly',
  pause: 'pause',
  excited: 'excited',
  curious: 'curious',
  calm: 'calm',
  happy: 'happy',
  warm: 'warm',
  relieved: 'relieved',
  reassuring: 'reassuringly',
  friendly: 'warm',
  conversational: null,
  clear: null,
  instructional: null,
  confident: null,
  whispers: 'whispering',
});

/** Every direction tag Soniox documents. Nothing outside this list is ever emitted. */
const SONIOX_TAGS = Object.freeze([
  ...('happy sad angry excited nervous fearful surprised annoyed relieved disappointed curious delighted calm '
    + 'warm stern serious playful sarcastic flirty deadpan sincerely reassuringly dramatically mockingly '
    + 'laughs chuckles giggles sobs sniffles whimpers sighs exhales gasps grunts groans coughs yawns '
    + 'whispering softly loudly shouting muttering slowly quickly rushed hesitantly monotone breathy pause').split(' '),
  'clears throat', 'getting louder', 'getting quieter', 'trailing off', 'drawn out', 'high-pitched',
  'low voice', 'trembling voice', 'long pause',
]);
const SONIOX_TAG_SET = new Set(SONIOX_TAGS);

// A "word character" below is [\p{L}\p{N}_]: the rules were tuned with Unicode-aware word boundaries,
// and JavaScript's \w is ASCII-only, so an Urdu letter would otherwise count as a word edge.

// Step 1: keycaps and emoji.
const KEYCAP_RE = /(10|[1-9])\uFE0F?\u20E3|\u{1F51F}/gu;
const EMOJI_RE = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\uFE0F\u200D\u20E3]/gu;

// Step 2: markdown and WhatsApp marks, then line structure.
const DOUBLE_STAR_RE = /\*\*(.+?)\*\*/gu;
const DOUBLE_UNDERSCORE_RE = /(?<![\p{L}\p{N}_])__(\S(?:.*?\S)?)__(?![\p{L}\p{N}_])/gu;
const STAR_RE = /(?<![\p{L}\p{N}_\]])\*(\S(?:.*?\S)?)\*(?![\p{L}\p{N}_])/gu;
const UNDERSCORE_RE = /(?<![\p{L}\p{N}_])_(\S(?:.*?\S)?)_(?![\p{L}\p{N}_])/gu;
const TILDE_RE = /(?<![\p{L}\p{N}_])~(\S(?:.*?\S)?)~(?![\p{L}\p{N}_])/gu;
const LINE_MARKER_RE = /^(?:#{1,6}\s+|[-•]\s+|\p{Nd}+[.)]\s+)/u;
const LINE_END_RE = /[.!?؟۔:،,][”"'’»)\]]*$/u;
const TAGS_ONLY_RE = /^(?:\[[^\]]+\]\s*)+$/u;

// Step 3: symbols.
const RANGE_RE = /(\p{Nd})\s*[–—-]\s*(\p{Nd})/gu;
const ARROW_RE = /\s*(?:→|⇒|->)\s*/gu;
const PLUS_RE = /(?<=\S)\s*\+\s*(?=\S)/gu;
const SLASH_RE = /(?<=[^\s\p{Nd}/])\s*\/\s*(?=[^\s\p{Nd}/])/gu;

// Step 5: bracketed tags.
const TAG_RE = /\[([^\]\n]{1,40})\]/gu;

/** Step 1: keycap digits become a number word and a stop; every other emoji is removed. */
function speakEmoji(text, words) {
  return text
    // Soniox voiced keycap emoji instead of saying the list number they stand for. A language with no
    // number words for them loses the keycap, rather than hearing an English number.
    .replace(KEYCAP_RE, (_, digit) => (
      words.keycaps ? `${words.keycaps[digit ? Number(digit) : 10]}${words.stop} ` : ''))
    // Emoji carry no words, and removing them here means we never rely on Soniox's own filter.
    .replace(EMOJI_RE, '');
}

/** Step 2: formatting marks out, list markers out, a stop on every line that lacks one. */
function unformat(text, words) {
  // Soniox read formatting marks aloud (it said "underscore" for an italic line), so keep only the words.
  const unwrapped = text
    .replace(DOUBLE_STAR_RE, '$1')
    .replace(DOUBLE_UNDERSCORE_RE, '$1')
    .replace(STAR_RE, '$1')
    .replace(UNDERSCORE_RE, '$1')
    .replace(TILDE_RE, '$1');
  return unwrapped.split('\n').map((line) => {
    let s = line.trim();
    // A heading, bullet or list number is layout, not something to say.
    const marker = LINE_MARKER_RE.exec(s);
    if (marker) s = s.slice(marker[0].length).trim();
    // Line breaks are collapsed later, so a heading or bullet with no stop would run into the next line
    // in one breath; a line of tags alone is a direction, not a sentence, and gets no stop.
    if (s && !LINE_END_RE.test(s) && !TAGS_ONLY_RE.test(s)) s += words.stop;
    return s;
  }).join('\n');
}

/**
 * Step 3: symbols a reader skips but Soniox voices are written as the words a speaker would say. A
 * language with no word for a symbol keeps the symbol: an English word inside it would be worse.
 */
function symbolsAsWords(text, words) {
  let out = text;
  // Soniox reads a hyphen aloud, so a range is written as spoken, before any digit becomes a word.
  if (words.to) out = out.replace(RANGE_RE, `$1 ${words.to} $2`);
  // Soniox read an arrow as "se" ("from"), which garbles a sequence such as "I Do → We Do".
  if (words.then) out = out.replace(ARROW_RE, `${words.then} `);
  // Soniox voiced "+" by its symbol name; the word in the reply's language keeps an Urdu sentence in Urdu.
  if (words.plus) out = out.replace(PLUS_RE, ` ${words.plus} `);
  // Soniox read "/" as "slash"; between digits it is a fraction or a date and stays as written.
  if (words.or) out = out.replace(SLASH_RE, ` ${words.or} `);
  return out;
}

/**
 * Step 5: Soniox follows only the tags on its list and may read any other bracketed text aloud, so our
 * tags are mapped and everything else is removed; placeholders are reported because they mean a prompt
 * left a gap unfilled.
 */
function mapTags(text, dropped) {
  return text.replace(TAG_RE, (whole, inner) => {
    const key = inner.trim().toLowerCase();
    if (Object.prototype.hasOwnProperty.call(TAG_MAP, key)) return TAG_MAP[key] ? `[${TAG_MAP[key]}]` : '';
    dropped.push(whole);
    return '';
  });
}

/** True when something other than Soniox direction tags and punctuation is left to say. */
function hasSpeech(text) {
  const words = text.replace(TAG_RE, (whole, inner) => (SONIOX_TAG_SET.has(inner) ? ' ' : whole));
  return /[\p{L}\p{N}]/u.test(words);
}

/**
 * Prepares a reply for Soniox. Total: any non-string input gives { text: '', dropped: [] }.
 * @param {string} text  the reply as written for the screen
 * @param {string} [language]  a Rumi code ('ur', 'pa-PK', 'ar', ...); a code outside languages.js gets the
 *   English words
 * @returns {{ text: string, dropped: string[] }}  `dropped` lists bracketed strings removed because they are
 *   not direction tags (template placeholders, unknown directions); `text` is '' when nothing is left to say
 */
function prepareForSoniox(text, language) {
  if (typeof text !== 'string') return { text: '', dropped: [] };
  const words = symbolRowFor(language);
  const numberRule = numberRuleFor(language);
  let out = text.replace(/\r\n?|[\u2028\u2029]/g, '\n');
  out = speakEmoji(out, words);
  out = unformat(out, words);
  out = symbolsAsWords(out, words);
  // After step 3, so a range is already "2 hadi 3" and each number is spelled on its own.
  if (numberRule) out = numberRule(out);
  const dropped = [];
  out = mapTags(out, dropped);
  // Step 6: the judged renders sent single-spaced text; rhythm comes from the voice, not from line breaks.
  out = out.replace(/\s+/gu, ' ').trim();
  return { text: hasSpeech(out) ? out : '', dropped };
}

// Sentence ends are . ! ? ؟ ۔ followed by whitespace; after collapsing, that whitespace is one space.
const SENTENCE_BREAK_RE = /(?<=[.!?؟۔]) /u;
const CLAUSE_MARKS = new Set(['،', ',', ';', '؛']);

function codePoints(s) {
  return [...s].length;
}

function positiveLimit(value, fallback) {
  return Number.isFinite(value) && value >= 1 ? Math.floor(value) : fallback;
}

/**
 * Cuts one sentence longer than max code points: after the last clause mark in the second half of the
 * window, else at the last space, else (one unbroken token) hard at max.
 */
function breakLongSentence(sentence, max) {
  let cps = [...sentence];
  if (cps.length <= max) return [sentence];
  const pieces = [];
  while (cps.length > max) {
    let cut = -1;
    for (let i = max; i > max / 2 && cut < 0; i -= 1) {
      if (cps[i] === ' ' && CLAUSE_MARKS.has(cps[i - 1])) cut = i;
    }
    for (let i = max; i >= 1 && cut < 0; i -= 1) {
      if (cps[i] === ' ') cut = i;
    }
    if (cut < 0) {
      pieces.push(cps.slice(0, max).join(''));
      cps = cps.slice(max);
    } else {
      pieces.push(cps.slice(0, cut).join(''));
      cps = cps.slice(cut + 1);
    }
  }
  if (cps.length) pieces.push(cps.join(''));
  return pieces;
}

/**
 * Splits text into Soniox request parts at sentence ends. A request stops at two minutes of audio, so no
 * part may exceed maxChars; whole sentences are packed greedily while a part stays within targetChars, and
 * only a single sentence longer than targetChars makes a longer part. Lengths are code points. Joining the
 * parts with one space gives back the input with its whitespace collapsed (the only exception is a single
 * unbroken token longer than maxChars, which has to be cut inside itself).
 * @param {string} text
 * @param {{ targetChars?: number, maxChars?: number }} [options]
 * @returns {string[]}  no empty parts; [] for empty or non-string input
 */
function splitForSoniox(text, options) {
  if (typeof text !== 'string') return [];
  const { targetChars = 300, maxChars = 900 } = options || {};
  const flat = text.replace(/\s+/gu, ' ').trim();
  if (!flat) return [];
  const max = positiveLimit(maxChars, 900);
  const target = Math.min(positiveLimit(targetChars, 300), max);
  const pieces = flat.split(SENTENCE_BREAK_RE).flatMap((sentence) => breakLongSentence(sentence, max));
  const parts = [];
  let current = '';
  let currentLength = 0;
  for (const piece of pieces) {
    const length = codePoints(piece);
    if (currentLength && currentLength + 1 + length <= target) {
      current += ` ${piece}`;
      currentLength += 1 + length;
    } else {
      if (currentLength) parts.push(current);
      current = piece;
      currentLength = length;
    }
  }
  if (currentLength) parts.push(current);
  return parts;
}

module.exports = { prepareForSoniox, splitForSoniox, urduNumbers, TAG_MAP, SONIOX_TAGS };
