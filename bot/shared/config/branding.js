/**
 * Branding Configuration
 *
 * Centralizes all customizable branding for clone deployments.
 * All values can be overridden via environment variables.
 *
 * Clone users: Set BOT_NAME, ORG_NAME, SUPPORT_CONTACT in your .env
 * to personalize the bot for your organization.
 */

const botName = process.env.BOT_NAME || 'Rumi';
const orgName = process.env.ORG_NAME || 'Rumi Education';
const supportContact = process.env.SUPPORT_CONTACT || 'support@rumi.education';
const defaultLanguage = 'en';

const supportedLanguages = [
  { code: 'en', name: 'English', direction: 'ltr' },
  { code: 'ur', name: 'Urdu', direction: 'rtl' },
  { code: 'ar', name: 'Arabic', direction: 'rtl' },
  { code: 'es', name: 'Spanish', direction: 'ltr' },
];

const welcomeMessages = {
  en: `Welcome! I'm ${botName}, your AI teaching assistant. I'm here to help you become a better teacher.`,
  ur: `!خوش آمدید! میں ${botName} ہوں، آپ کی AI تدریسی معاون۔ میں آپ کی مدد کے لیے حاضر ہوں`,
  ar: `!مرحبا! أنا ${botName}، مساعدك التعليمي بالذكاء الاصطناعي. أنا هنا لمساعدتك`,
  es: `Bienvenido! Soy ${botName}, tu asistente de enseñanza con IA. Estoy aquí para ayudarte.`,
};

function getWelcomeMessage(languageCode) {
  return welcomeMessages[languageCode] || welcomeMessages[defaultLanguage];
}

function isLanguageSupported(languageCode) {
  return supportedLanguages.some(l => l.code === languageCode);
}

module.exports = {
  botName,
  orgName,
  supportContact,
  defaultLanguage,
  supportedLanguages,
  getWelcomeMessage,
  isLanguageSupported,
};
