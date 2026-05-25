/**
 * LP Localization Service
 *
 * Single source of truth for the cultural-context table shared by BOTH
 * lesson-plan generation paths:
 *   - the pic-LP image builder (shared/services/pic-to-lp/kieai-prompt-builder.service.js)
 *   - the Gamma text-LP builder
 *
 * `characterCastFor` + `classroomContextFor` were lifted out of the pic-LP
 * builder (which now re-exports them from here) so the two paths can never
 * drift.
 *
 * The cultural context is keyed by LANGUAGE, not by deployment region — the
 * script/language a teacher chose for the lesson plan implies the cultural
 * cast (e.g. Kiswahili → East African, Arabic → MENA, Urdu/Sindhi/Punjabi →
 * Pakistani). English is script-ambiguous, so it gets a neutral, region-free
 * classroom cast.
 */

// Per-language character cast used in the HOOK section.
function characterCastFor(language) {
  switch (language) {
    case 'sw':
      return { region: 'East African (Kenyan/Tanzanian/Ugandan)', boy: 'Juma', girl: 'Amina', girlDress: 'colorful kanga or simple uniform' };
    case 'ar':
      return { region: 'Arab (Levantine/Gulf-style)', boy: 'Ahmad', girl: 'Layla', girlDress: 'modest school uniform with hijab' };
    case 'ur':
    case 'sd':
    case 'pa':
      // Urdu / Sindhi / Punjabi are Pakistani languages — language-implied cast.
      return { region: 'Pakistani', boy: 'Ali', girl: 'Sara', girlDress: 'white dupatta' };
    default:
      // en (script-ambiguous) — a neutral, region-free classroom cast.
      return { region: 'local primary-school', boy: 'Sam', girl: 'Mia', girlDress: 'school uniform' };
  }
}

// Cultural context per language. Kept language-keyed (not region-keyed) so no
// single country is hardcoded as a global default.
function classroomContextFor(language) {
  if (language === 'sw') return 'East African (Kenya/Tanzania/Uganda)';
  if (language === 'ar') return 'MENA region';
  if (language === 'ur' || language === 'sd' || language === 'pa') return 'Pakistani';
  return 'local'; // en — script-ambiguous, region-neutral
}

// Local currency for money word-problems, keyed by language.
function currencyFor(language) {
  if (language === 'sw') return 'Tanzanian Shilling (TSh)';
  if (language === 'ar') return 'local currency (e.g. dirham/riyal as appropriate)';
  if (language === 'ur' || language === 'sd' || language === 'pa') return 'Pakistani Rupee (PKR)';
  return 'the local currency'; // en — region-neutral
}

// Callout-prefix translations. The text-LP prompt's additionalInstructions used
// to hardcode English "Teacher says:" / "MODEL ANSWER:" / "Watch out:" which
// leaked English into non-English output. en + the PK regional languages
// (ur/sd/pa) keep the English prefixes (they already mix English structural
// labels by design); sw + ar translate.
function calloutPrefixesFor(language) {
  switch (language) {
    case 'sw':
      return { teacherSays: 'Mwalimu anasema:', modelAnswer: 'JIBU MFANO:', watchOut: 'Angalia:' };
    case 'ar':
      return { teacherSays: 'يقول المعلّم:', modelAnswer: 'إجابة نموذجية:', watchOut: 'انتبه:' };
    default:
      // en, ur, sd, pa
      return { teacherSays: 'Teacher says:', modelAnswer: 'MODEL ANSWER:', watchOut: 'Watch out:' };
  }
}

// One composed instruction line for the Gamma prompt — names the region,
// currency, and the two-student cast so worked examples are culturally
// grounded for the teacher's chosen language.
function buildRegionContextLine(language) {
  const context = classroomContextFor(language);
  const cast = characterCastFor(language);
  const currency = currencyFor(language);
  const marketWord = language === 'sw'
    ? 'local market/duka'
    : language === 'ar'
      ? 'local market/souq'
      : 'local market';
  return `CULTURAL CONTEXT: Ground every example, name, and word problem in a ${context} classroom. Use ${currency} for money problems and the ${marketWord} for shopping/measurement contexts. Name the two recurring students "${cast.boy}" and "${cast.girl}". Use locally familiar foods, places, and situations — never foreign or out-of-region references.`;
}

module.exports = {
  characterCastFor,
  classroomContextFor,
  currencyFor,
  calloutPrefixesFor,
  buildRegionContextLine,
};
