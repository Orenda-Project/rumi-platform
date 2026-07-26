/**
 * Gamma API Language Configuration
 * Language Parameter Passthrough
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
  },

  // ── India market (LTR) ──
  hi: {
    code: 'hi',
    name: 'Hindi',
    textDirection: 'ltr',
    promptSuffix: 'Generate all content in Hindi (हिन्दी). Use simple, clear everyday Hindi (Hindustani), not heavily Sanskritised Hindi, suitable for Indian classrooms.',
    lessonPlanIntro: 'एक व्यापक, कक्षा के लिए तैयार lesson plan हिंदी में बनाएँ',
    presentationIntro: 'एक शैक्षिक प्रस्तुति हिंदी में बनाएँ'
  },
  bn: {
    code: 'bn',
    name: 'Bengali',
    textDirection: 'ltr',
    promptSuffix: 'Generate all content in Bengali (বাংলা). Use simple, clear colloquial (চলিত) Bengali suitable for Indian classrooms.',
    lessonPlanIntro: 'একটি বিস্তারিত, শ্রেণিকক্ষের জন্য প্রস্তুত lesson plan বাংলায় তৈরি করুন',
    presentationIntro: 'একটি শিক্ষামূলক উপস্থাপনা বাংলায় তৈরি করুন'
  },
  mr: {
    code: 'mr',
    name: 'Marathi',
    textDirection: 'ltr',
    promptSuffix: 'Generate all content in Marathi (मराठी) — NOT Hindi. Use simple, clear everyday Marathi suitable for classrooms in Maharashtra.',
    lessonPlanIntro: 'एक सर्वसमावेशक, वर्गासाठी तयार lesson plan मराठीत तयार करा',
    presentationIntro: 'एक शैक्षणिक सादरीकरण मराठीत तयार करा'
  },
  te: {
    code: 'te',
    name: 'Telugu',
    textDirection: 'ltr',
    promptSuffix: 'Generate all content in Telugu (తెలుగు). Use simple, clear spoken (వ్యావహారిక) Telugu suitable for classrooms in Andhra Pradesh / Telangana.',
    lessonPlanIntro: 'ఒక సమగ్రమైన, తరగతికి సిద్ధమైన lesson plan తెలుగులో రూపొందించండి',
    presentationIntro: 'ఒక విద్యా ప్రదర్శన తెలుగులో రూపొందించండి'
  },
  'ta-IN': {
    code: 'ta-IN',
    name: 'Tamil',
    textDirection: 'ltr',
    promptSuffix: 'Generate all content in Tamil (தமிழ்) — Indian Tamil. Use simple, clear Tamil suitable for classrooms in Tamil Nadu.',
    lessonPlanIntro: 'வகுப்பறைக்குத் தயாரான, முழுமையான lesson plan-ஐ தமிழில் உருவாக்குங்கள்',
    presentationIntro: 'ஒரு கல்வி விளக்கக்காட்சியை தமிழில் உருவாக்குங்கள்'
  },
  kn: {
    code: 'kn',
    name: 'Kannada',
    textDirection: 'ltr',
    promptSuffix: 'Generate all content in Kannada (ಕನ್ನಡ). Use simple, clear everyday Kannada suitable for classrooms in Karnataka.',
    lessonPlanIntro: 'ಒಂದು ಸಮಗ್ರವಾದ, ತರಗತಿಗೆ ಸಿದ್ಧವಾದ lesson plan ಅನ್ನು ಕನ್ನಡದಲ್ಲಿ ರಚಿಸಿ',
    presentationIntro: 'ಒಂದು ಶೈಕ್ಷಣಿಕ ಪ್ರಸ್ತುತಿಯನ್ನು ಕನ್ನಡದಲ್ಲಿ ರಚಿಸಿ'
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
