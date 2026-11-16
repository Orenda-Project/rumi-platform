'use strict';
/**
 * The Urdu number rule on the Soniox path (step 4 of prepareForSoniox for ur): numbers in the form the Urdu
 * voice reads correctly. Its own file so languages.js can load it without loading the text pipeline, which
 * itself reads languages.js.
 */

const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven',
  'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const NUM_TENS = 'twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety';
const NUM_UNITS = 'one|two|three|four|five|six|seven|eight|nine';
const NUM_WORD = `(?:${NUM_TENS}|${NUM_UNITS}|zero|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen`
  + '|seventeen|eighteen|nineteen)';
// JavaScript's \b is ASCII-only, so an Urdu letter next to a number word counts as a boundary. That is
// intended: "ninety-nine" glued to Urdu text is still a number word whose hyphen would be read aloud.
const WORD_DECIMAL_RE = new RegExp(`\\b(${NUM_WORD}(?:[- ]${NUM_WORD})*)\\.(${NUM_WORD})\\b`, 'g');
const WORD_HYPHEN_RE = new RegExp(`\\b(${NUM_TENS})-(${NUM_UNITS})\\b`, 'gi');
const NUMBER_TOKEN_RE = /[0-9]+(?:[.,:/][0-9]+)*/g;
const PERCENT_RE = new RegExp(`(?<=\\p{Nd}|\\b${NUM_WORD}) ?[%\u066A]`, 'giu');

function twoDigitWords(digits) {
  const n = Number(digits);
  if (n < 20) return ONES[n];
  return n % 10 ? `${TENS[Math.floor(n / 10)]} ${ONES[n % 10]}` : TENS[n / 10];
}

function spellNumberToken(token, offset, source) {
  const before = source.slice(Math.max(0, offset - 2), offset);
  const after = source.slice(offset + token.length, offset + token.length + 2);
  // A digit run glued to a Latin letter, directly or through a hyphen, is part of a name (v8, COVID-19, 4th).
  if (/(?:[A-Za-z_]-?|\p{Nd})$/u.test(before) || /^(?:-?[A-Za-z_]|\p{Nd})/u.test(after)) return token;
  // 0 to 99 go as English words without a hyphen, the form Ishita read without error; 100 and up stay digits.
  if (/^[0-9]{1,2}$/.test(token)) return twoDigitWords(token);
  const decimal = /^([0-9]+)\.([0-9]+)$/.exec(token);
  if (decimal) {
    // Fraction digits are said one by one, so 2.05 keeps its zero ("two point zero five").
    const whole = decimal[1].length <= 2 ? twoDigitWords(decimal[1]) : decimal[1];
    return `${whole} point ${[...decimal[2]].map((d) => ONES[Number(d)]).join(' ')}`;
  }
  // Thousands, times, fractions and dotted versions stay digits: spelling one piece would split the token,
  // and Ishita read digit forms right.
  return token;
}

/** The Urdu number rule (step 4 for ur): numbers in the form the Urdu voice reads correctly. */
function urduNumbers(text) {
  return text
    // Every voice dropped the point in "thirty-one.three", the decimal form an older clean-up produced.
    .replace(WORD_DECIMAL_RE, '$1 point $2')
    // Ishita read the hyphen in "ninety-nine" aloud ("ninety hyphen nine").
    .replace(WORD_HYPHEN_RE, '$1 $2')
    .replace(NUMBER_TOKEN_RE, spellNumberToken)
    // The percent sign becomes the word the judged renders said, so Soniox never has to voice the symbol.
    .replace(PERCENT_RE, (sign, offset, source) => {
      const next = source.slice(offset + sign.length, offset + sign.length + 1);
      return /[\p{L}\p{N}]/u.test(next) ? ' فیصد ' : ' فیصد';
    });
}

module.exports = { urduNumbers };
