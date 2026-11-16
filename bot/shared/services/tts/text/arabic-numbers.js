'use strict';

/**
 * The Arabic number rule on the Soniox path. Layla read "13/9" with the slash and "60%"
 * with the sign's name, so a bare a/b and a whole percentage up to 100 are written as words.
 * A bare a/b is a fraction ("1/2" → "واحد على اثنين"); it is a day and a month only when a date cue
 * stands directly before it (chief's ruling after the T3.4 review: in a teaching bot fractions are far
 * more common than dates, and "1/2" had been read as "the first of February").
 * Nothing else changes: a bare count, a clock time, a version, a decimal, a fraction with a side above
 * 100 or a full date with a year stays as written, because Layla reads digits right.
 */

const UNITS = ['صفر', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة', 'عشرة'];
const TEENS = ['أحد عشر', 'اثنا عشر'];
const TENS = ['', '', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون'];
// The same words after على, in the genitive: only the dual and the -oon tens change their ending.
const GENITIVE_UNITS = ['صفر', 'واحد', 'اثنين', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة', 'عشرة'];
const GENITIVE_TEENS = ['أحد عشر', 'اثني عشر'];
const GENITIVE_TENS = ['', '', 'عشرين', 'ثلاثين', 'أربعين', 'خمسين', 'ستين', 'سبعين', 'ثمانين', 'تسعين'];
const NOMINATIVE = { units: UNITS, teens: TEENS, tens: TENS };
const GENITIVE = { units: GENITIVE_UNITS, teens: GENITIVE_TEENS, tens: GENITIVE_TENS };

const ORDINALS = ['', 'الأول', 'الثاني', 'الثالث', 'الرابع', 'الخامس', 'السادس', 'السابع', 'الثامن', 'التاسع',
  'العاشر'];
const ORDINAL_TENS = ['', '', 'العشرون', 'الثلاثون'];
// Gregorian month names as written in Yemen and the Gulf.
const MONTHS = ['', 'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر',
  'نوفمبر', 'ديسمبر'];

// ASCII digits and the Arabic-Indic digits an Arabic reply may use.
const D = '[0-9٠-٩]';
// Not inside a longer number, a time, a decimal or a date with a year.
const SLASH_RE = new RegExp(`(?<!${D}|[/.:,٫]|${D}[/.:,٫])(${D}{1,3})/(${D}{1,3})(?!${D}|/|[.:,٫]${D})`, 'gu');
// The words that make the next a/b a date: the chief's four and the seven weekdays. تاريخ is a cue only
// without its article, because التاريخ is also the school subject history ("درس التاريخ 1/2 ساعة" is a
// fraction). A cue may carry the letters that attach to it in writing (و or ف, then ب, ل or ك: "وبتاريخ",
// "فيوم"), and only spaces, a comma or a colon may stand between it and the pair ("يوم الأحد، 5/9"); not a
// line break, because a line ending "يوم الأحد،" is not closed before the next line's numbers. With any
// other word between them the pair is a fraction again.
const DATE_CUES = ['تاريخ', 'يوم', 'الموافق', 'الأحد', 'الاحد', 'الاثنين', 'الإثنين', 'الثلاثاء',
  'الأربعاء', 'الاربعاء', 'الخميس', 'الجمعة', 'السبت'];
const CUE_BEFORE_RE = new RegExp(`(?:^|[^\\p{L}\\p{M}])[وف]?[بلك]?(?:${DATE_CUES.join('|')})[ \\t\\u00A0،,:]*$`, 'u');
const PERCENT_RE = new RegExp(`(?<!${D}|${D}[.,٫])(${D}{1,3}) ?[%٪]`, 'gu');

function toNumber(digits) {
  return Number([...digits].map((d) => (d >= '٠' && d <= '٩' ? d.charCodeAt(0) - 0x0660 : d)).join(''));
}

function cardinal(n, { units, teens, tens } = NOMINATIVE) {
  if (n <= 10) return units[n];
  if (n <= 12) return teens[n - 11];
  if (n < 20) return `${units[n - 10]} عشر`;
  if (n === 100) return 'مئة';
  const unit = n % 10;
  return unit ? `${units[unit]} و${tens[Math.floor(n / 10)]}` : tens[n / 10];
}

function dayOrdinal(n) {
  if (n <= 10) return ORDINALS[n];
  const unit = n % 10;
  // 11, 21 and 31 use الحادي, not الأول.
  const unitWord = unit === 1 ? 'الحادي' : ORDINALS[unit];
  if (n < 20) return `${unitWord} عشر`;
  return unit ? `${unitWord} و${ORDINAL_TENS[Math.floor(n / 10)]}` : ORDINAL_TENS[n / 10];
}

function arabicNumbers(text) {
  if (typeof text !== 'string') return text;
  return text
    .replace(SLASH_RE, (whole, a, b, offset, all) => {
      const first = toNumber(a);
      const second = toNumber(b);
      if (CUE_BEFORE_RE.test(all.slice(0, offset))) {
        if (first < 1 || first > 31 || second < 1 || second > 12) return whole;
        return `${dayOrdinal(first)} من ${MONTHS[second]}`;
      }
      if (first < 1 || first > 100 || second < 1 || second > 100) return whole;
      return `${cardinal(first)} على ${cardinal(second, GENITIVE)}`;
    })
    .replace(PERCENT_RE, (whole, digits) => {
      const n = toNumber(digits);
      return n <= 100 ? `${cardinal(n)} بالمئة` : whole;
    });
}

module.exports = { arabicNumbers };
