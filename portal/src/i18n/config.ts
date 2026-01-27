import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import en from './locales/en.json';
import es from './locales/es.json';
import ur from './locales/ur.json';
import ar from './locales/ar.json';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      es: { translation: es },
      ur: { translation: ur },
      ar: { translation: ar },
    },
    fallbackLng: 'en',
    supportedLngs: ['en', 'es', 'ur', 'ar'],
    detection: {
      order: ['localStorage', 'navigator', 'htmlTag'],
      caches: ['localStorage'],
    },
    interpolation: {
      escapeValue: false,
    },
  });

// Function to apply language-specific styling
const applyLanguageStyle = (lng: string) => {
  const htmlElement = document.documentElement;
  
  // Set language attribute
  htmlElement.lang = lng;
  
  // Set direction
  htmlElement.dir = lng === 'ar' || lng === 'ur' ? 'rtl' : 'ltr';
  
  // Apply language-specific font with !important to override all styles
  if (lng === 'ur') {
    htmlElement.style.cssText = 'font-family: "Noto Nastaliq Urdu", serif !important;';
  } else if (lng === 'ar') {
    htmlElement.style.cssText = 'font-family: "Noto Sans Arabic", sans-serif !important;';
  } else {
    htmlElement.style.cssText = 'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif !important;';
  }
};

// Apply on language change
i18n.on('languageChanged', applyLanguageStyle);

// Apply immediately on initialization
i18n.on('initialized', () => {
  applyLanguageStyle(i18n.language);
});

export default i18n;
