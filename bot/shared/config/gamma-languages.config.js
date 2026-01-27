/**
 * Gamma API Language Configuration
 * Bug #10: Language Parameter Passthrough
 *
 * Supports:
 * - English (default)
 * - Urdu (RTL, Naskh font - tested Nov 30, 2025)
 * - Arabic (RTL, Arabic font - tested Nov 30, 2025)
 * - Spanish (LTR)
 *
 * Created: November 30, 2025
 */

const GAMMA_LANGUAGE_CONFIG = {
  en: {
    code: 'en',
    name: 'English',
    textDirection: 'ltr',
    promptSuffix: 'Generate all content in English.',
    lessonPlanIntro: 'Create a comprehensive, classroom-ready lesson plan in English',
    presentationIntro: 'Create an educational presentation in English'
  },
  ur: {
    code: 'ur',
    name: 'Urdu',
    textDirection: 'rtl',
    promptSuffix: 'Generate all content in Urdu (اردو). Use simple, clear Urdu vocabulary suitable for Pakistani classrooms.',
    lessonPlanIntro: 'ایک جامع، کلاس روم کے لیے تیار لیسن پلان اردو میں بنائیں',
    presentationIntro: 'ایک تعلیمی پریزنٹیشن اردو میں بنائیں'
  },
  ar: {
    code: 'ar',
    name: 'Arabic',
    textDirection: 'rtl',
    promptSuffix: 'Generate all content in Arabic (العربية). Use Modern Standard Arabic suitable for educational contexts.',
    lessonPlanIntro: 'إنشاء خطة درس شاملة وجاهزة للفصل الدراسي باللغة العربية',
    presentationIntro: 'إنشاء عرض تقديمي تعليمي باللغة العربية'
  },
  es: {
    code: 'es',
    name: 'Spanish',
    textDirection: 'ltr',
    promptSuffix: 'Generate all content in Spanish (Español).',
    lessonPlanIntro: 'Crear un plan de lección completo y listo para el aula en español',
    presentationIntro: 'Crear una presentación educativa en español'
  }
};

/**
 * Get language configuration
 * @param {string} languageCode - Language code (en, ur, ar, es)
 * @returns {object} Language configuration object
 */
function getLanguageConfig(languageCode) {
  return GAMMA_LANGUAGE_CONFIG[languageCode] || GAMMA_LANGUAGE_CONFIG.en;
}

/**
 * Get supported language codes
 * @returns {string[]} Array of supported language codes
 */
function getSupportedLanguages() {
  return Object.keys(GAMMA_LANGUAGE_CONFIG);
}

module.exports = {
  GAMMA_LANGUAGE_CONFIG,
  getLanguageConfig,
  getSupportedLanguages
};
