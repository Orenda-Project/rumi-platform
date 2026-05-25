/**
 * Pic-LP Wait Message Service
 *
 * Builds the upfront wait message we send the teacher RIGHT AFTER they
 * submit the Flow form, BEFORE the SQS job runs. Without this, teachers
 * read a 4-min silent wait as "Rumi is broken" and abandon. With it,
 * they read it as "Rumi is working" and move on.
 *
 * Multilingual — picks copy from a 6-language table. Defaults to English for
 * unknown languages.
 *
 * Optionally uses live p50/p90 from pic-lp-latency.service.js once we have
 * ≥10 samples in lesson_plans for the chosen backend. Until then, falls
 * back to baked-in defaults from pickBackend() in kieai-client.service.js.
 */

const { pickBackend } = require('./kieai-client.service');

/**
 * Build the multilingual wait message.
 *
 * Two language inputs intentionally:
 *   - systemLanguage = user.preferred_language (locked UI language)
 *     → drives the COPY (which translation to render).
 *   - contentLanguage = formData.language (LP output language)
 *     → drives the TIMING (1K vs 2K backend, ~90s vs ~4 min).
 *
 * Without this split, an English-locked teacher who generates a Sindhi LP sees
 * "~90 seconds" in English copy while the actual job takes ~4 minutes — a
 * 3-minute trust gap.
 *
 * Back-compat: callers passing `language` alone still work (used as both).
 *
 * @param {Object} args
 * @param {string} [args.systemLanguage] - 'en'|'ur'|'sd'|'pa'|'sw'|'ar' for copy
 * @param {string} [args.contentLanguage] - same set, for timing
 * @param {string} [args.language] - legacy; sets both if the split fields are absent
 * @param {Object} [args.dbStats] - Optional { p50_ms, p90_ms, sample_size }
 * @returns {string}
 */
function buildWaitMessage({ systemLanguage, contentLanguage, language, dbStats } = {}) {
  const SUPPORTED = ['en', 'ur', 'sd', 'pa', 'sw', 'ar'];
  const sysRaw = systemLanguage || language || 'en';
  const contentRaw = contentLanguage || language || sysRaw;
  const lang = SUPPORTED.includes(sysRaw) ? sysRaw : 'en';
  const contentLang = SUPPORTED.includes(contentRaw) ? contentRaw : lang;
  // Timing is driven by the backend that will actually run, which is selected
  // from the CONTENT language. The text/copy is in `lang`.
  const backend = pickBackend(contentLang);

  // Use live stats only when we have a meaningful sample size — otherwise
  // the fallback values from pickBackend() are calibrated and stable.
  const useDb = dbStats && (dbStats.sample_size || 0) >= 10
    && dbStats.p50_ms > 0 && dbStats.p90_ms > 0;
  const expectedSec = useDb ? Math.round(dbStats.p50_ms / 1000) : backend.expectedSec;
  const upperSec    = useDb ? Math.round(dbStats.p90_ms / 1000) : backend.upperSec;
  const expectedMin = Math.max(1, Math.round(expectedSec / 60));
  const upperMin    = Math.max(2, Math.round(upperSec / 60));

  if (lang === 'en') {
    // English: seconds for the sub-2-min fast path; minutes once we cross 2
    // minutes (else "240 seconds" reads weirdly when actual is 4 min).
    if (expectedSec >= 120) {
      return `⏳ Generating your lesson plan — usually about ${expectedMin}-${expectedMin + 1} minutes (up to ${upperMin} minutes if our servers are busy).\n\nFeel free to keep using Rumi while you wait — your PDF will arrive here when it's ready.`;
    }
    const upper = upperSec >= 120 ? `${Math.round(upperSec / 60)}-${Math.round(upperSec / 60) + 1} minutes` : `${upperSec} seconds`;
    return `⏳ Generating your lesson plan — usually about ${expectedSec} seconds (up to ${upper} if our servers are busy).\n\nFeel free to keep using Rumi while you wait — your PDF will arrive here when it's ready.`;
  }

  if (lang === 'ur') {
    return `⏳ آپ کا منصوبہ تیار کیا جا رہا ہے — عام طور پر ${expectedMin} سے ${expectedMin + 1} منٹ۔ (سرور مصروف ہوں تو ${upperMin} منٹ تک)۔\n\nانتظار کے دوران Rumi استعمال کرتے رہیں — تیار ہوتے ہی PDF یہاں آ جائے گی۔`;
  }

  if (lang === 'sd') {
    return `⏳ توهان جو منصوبو تيار ٿي رهيو آهي — عام طور تي ${expectedMin} کان ${expectedMin + 1} منٽ ۾۔ (سرور مصروف هجن ته ${upperMin} منٽن تائين)۔\n\nانتظار جي دوران Rumi استعمال ڪندا رهو — تيار ٿيندي ئي PDF هتي اچي ويندي۔`;
  }

  if (lang === 'sw') {
    // Kiswahili — for East African teachers. Bilingual with English numbers.
    // Express in minutes when expectedSec >= 120 (Urdu-routed slow path);
    // seconds otherwise (English-routed fast path).
    if (expectedSec >= 120) {
      return `⏳ Mpango wako wa somo unatengenezwa — kawaida dakika ${expectedMin} hadi ${expectedMin + 1} (hadi dakika ${upperMin} ikiwa servers zetu ni busy).\n\nUnaweza kuendelea kutumia Rumi wakati unasubiri — PDF yako itafika hapa ikiwa tayari.`;
    }
    return `⏳ Mpango wako wa somo unatengenezwa — kawaida sekunde ${expectedSec} (hadi dakika ${upperMin} ikiwa servers zetu ni busy).\n\nUnaweza kuendelea kutumia Rumi wakati unasubiri — PDF yako itafika hapa ikiwa tayari.`;
  }

  if (lang === 'ar') {
    // Arabic (Naskh script). RTL, Eastern Arabic numerals NOT used (we keep
    // Hindu-Arabic 0-9 for math notation consistency across languages).
    return `⏳ يتم إعداد خطة الدرس الخاصة بك — عادةً ${expectedMin} إلى ${expectedMin + 1} دقائق. (حتى ${upperMin} دقيقة إذا كانت الخوادم مشغولة).\n\nيمكنك الاستمرار في استخدام Rumi أثناء الانتظار — سيصل ملف PDF هنا فور أن يكون جاهزًا.`;
  }

  // 'pa' — Punjabi (Shahmukhi)
  return `⏳ تہاڈا منصوبہ تیار کیتا جا رہیا اے — عام طور تے ${expectedMin} توں ${expectedMin + 1} منٹ۔ (سرور مصروف ہون تے ${upperMin} منٹاں تک)۔\n\nانتظار وچ Rumi ورتدے رہو — تیار ہوندے ہی PDF ایتھے آ جاوے گی۔`;
}

module.exports = { buildWaitMessage };
