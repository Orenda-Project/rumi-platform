/**
 * Portal Command Handler
 * Handles /portal command for teacher portal access
 *
 * Flow:
 * 1. User sends /portal command in WhatsApp
 * 2. Check if portal already activated
 * 3. If yes: Send login link
 * 4. If no: Generate unique token and send setup link
 *
 * Related: portal-invite.service.js, portal.routes.js
 */

const PortalInviteService = require('../services/portal-invite.service');
const { logToFile } = require('../utils/logger');

const PORTAL_URL = process.env.PORTAL_URL || 'https://your-portal-domain.com';

/**
 * Handle /portal command
 *
 * @param {object} user - User object from database (must include id, portal_activated, preferred_language)
 * @param {string} phoneNumber - User's WhatsApp phone number (format: 923001234567)
 * @returns {Promise<string>} - Message to send to user in their language
 */
async function handlePortalCommand(user, phoneNumber) {
  try {
    logToFile('📱 Processing /portal command', {
      userId: user.id,
      phoneNumber,
      portalActivated: user.portal_activated,
      language: user.preferred_language
    });

    const language = user.preferred_language || 'en';

    // Multilingual messages
    const messages = {
      // Already activated messages
      alreadyActivated: {
        en: `Your Rumi portal is already active!\n\n🔗 *Log in here:*\n${PORTAL_URL}/portal/login\n\nUse your phone number and the password you created.`,

        ur: `آپ کا Rumi پورٹل پہلے سے فعال ہے!\n\n🔗 *یہاں لاگ ان کریں:*\n${PORTAL_URL}/portal/login\n\nاپنا فون نمبر اور پاسورڈ استعمال کریں۔`,

        ar: `بوابة Rumi الخاصة بك نشطة بالفعل!\n\n🔗 *سجل الدخول هنا:*\n${PORTAL_URL}/portal/login\n\nاستخدم رقم هاتفك وكلمة المرور التي أنشأتها.`,

        es: `¡Tu portal de Rumi ya está activo!\n\n🔗 *Inicia sesión aquí:*\n${PORTAL_URL}/portal/login\n\nUsa tu número de teléfono y la contraseña que creaste.`
      },

      // Error sending invitation
      error: {
        en: `Sorry, I couldn't create your portal invitation right now. Please try again in a few minutes or contact support.\n\nمعذرت، میں ابھی آپ کا پورٹل دعوت نامہ نہیں بنا سکا۔ براہ کرم کچھ منٹوں میں دوبارہ کوشش کریں۔`,

        ur: `معذرت، میں ابھی آپ کا پورٹل دعوت نامہ نہیں بنا سکا۔ براہ کرم کچھ منٹوں میں دوبارہ کوشش کریں یا سپورٹ سے رابطہ کریں۔\n\nSorry, I couldn't create your portal invitation. Please try again in a few minutes.`,

        ar: `عذرًا، لم أتمكن من إنشاء دعوة البوابة الخاصة بك الآن. يرجى المحاولة مرة أخرى خلال بضع دقائق أو الاتصال بالدعم.\n\nSorry, I couldn't create your portal invitation right now.`,

        es: `Lo siento, no pude crear tu invitación al portal en este momento. Por favor intenta de nuevo en unos minutos o contacta con soporte.\n\nSorry, I couldn't create your portal invitation right now.`
      }
    };

    // Check if portal already activated
    if (user.portal_activated) {
      logToFile('✅ Portal already activated, sending login link', { userId: user.id });
      return messages.alreadyActivated[language] || messages.alreadyActivated.en;
    }

    // Send portal invitation (generates token, stores in DB, sends WhatsApp message)
    const result = await PortalInviteService.sendPortalInvite(
      user.id,
      phoneNumber,
      language
    );

    if (result.success) {
      logToFile('✅ Portal invitation sent via /portal command', {
        userId: user.id,
        phoneNumber,
        token: result.token,
        expiresAt: result.expiresAt
      });

      // Return empty string because PortalInviteService.sendPortalInvite already sends the WhatsApp message
      // The message includes the setup link and expiry information in the user's language
      return '';
    } else {
      logToFile('❌ Failed to send portal invitation', {
        userId: user.id,
        error: result.error
      });

      return messages.error[language] || messages.error.en;
    }
  } catch (error) {
    logToFile('❌ Error in handlePortalCommand', {
      userId: user?.id,
      phoneNumber,
      error: error.message,
      stack: error.stack
    });

    const language = user?.preferred_language || 'en';
    const errorMessages = {
      en: `Sorry, something went wrong. Please try again later or contact support.\n\nمعذرت، کچھ غلط ہو گیا۔ براہ کرم بعد میں دوبارہ کوشش کریں۔`,
      ur: `معذرت، کچھ غلط ہو گیا۔ براہ کرم بعد میں دوبارہ کوشش کریں یا سپورٹ سے رابطہ کریں۔\n\nSorry, something went wrong. Please try again later.`,
      ar: `عذرًا، حدث خطأ ما. يرجى المحاولة مرة أخرى لاحقًا أو الاتصال بالدعم.\n\nSorry, something went wrong. Please try again later.`,
      es: `Lo siento, algo salió mal. Por favor intenta de nuevo más tarde o contacta con soporte.\n\nSorry, something went wrong. Please try again later.`
    };

    return errorMessages[language] || errorMessages.en;
  }
}

module.exports = { handlePortalCommand };
