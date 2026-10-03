/**
 * Internal API: send a portal password reset code.
 * Called by the portal backend (dashboard/services/password-reset.service.js)
 * to send reset codes through the main bot, which owns the messaging channels.
 *
 * Security: API key authentication required (INTERNAL_API_KEY, shared by the
 * portal backend and the bot).
 */

const WhatsAppService = require('../services/whatsapp.service');
const { logToFile } = require('../utils/logger');

async function sendPasswordReset(req, res) {
  try {
    // Verify API key (shared secret between portal and main bot)
    const apiKey = req.headers['x-api-key'];
    const expectedApiKey = process.env.INTERNAL_API_KEY;

    if (apiKey !== expectedApiKey) {
      logToFile('❌ Unauthorized internal API call', {
        endpoint: '/api/internal/send-password-reset',
        ip: req.ip
      });
      return res.status(401).json({
        success: false,
        error: 'Unauthorized'
      });
    }

    const { phoneNumber, code, firstName, language } = req.body;

    if (!phoneNumber || !code || !firstName) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: phoneNumber, code, firstName'
      });
    }

    logToFile('📞 Internal API: Sending password reset code', {
      phoneNumber,
      language,
      caller: 'portal-backend'
    });

    // Multilingual reset code messages
    const messages = {
      en: `Hi ${firstName}! 👋

Your Rumi portal password reset code is:

*${code}*

This code expires in 10 minutes.

If you didn't request this, please ignore this message.`,

      ur: `ہیلو ${firstName}! 👋

آپ کا Rumi پورٹل پاسورڈ ری سیٹ کوڈ ہے:

*${code}*

یہ کوڈ 10 منٹ میں ختم ہو جائے گا۔

اگر آپ نے یہ درخواست نہیں کی تو براہ کرم اس پیغام کو نظر انداز کریں۔`,

      ar: `مرحباً ${firstName}! 👋

رمز إعادة تعيين كلمة مرور بوابة Rumi الخاص بك هو:

*${code}*

تنتهي صلاحية هذا الرمز خلال 10 دقائق.

إذا لم تطلب ذلك، يرجى تجاهل هذه الرسالة.`,

      es: `¡Hola ${firstName}! 👋

Tu código de restablecimiento de contraseña del portal Rumi es:

*${code}*

Este código expira en 10 minutos.

Si no solicitaste esto, ignora este mensaje.`
    };

    // Get localized message (fallback to English)
    const message = messages[language] || messages.en;

    // Send WhatsApp message using main bot's WhatsApp service
    const sent = await WhatsAppService.sendMessage(phoneNumber, message);

    if (sent) {
      logToFile('✅ Password reset code sent via WhatsApp', {
        phoneNumber,
        language
      });
      res.json({
        success: true,
        message: 'Password reset code sent successfully'
      });
    } else {
      logToFile('❌ Failed to send password reset code', {
        phoneNumber
      });
      res.status(500).json({
        success: false,
        error: 'Failed to send WhatsApp message'
      });
    }
  } catch (error) {
    logToFile('❌ Internal API error', {
      endpoint: '/api/internal/send-password-reset',
      error: error.message,
      stack: error.stack
    });
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}

module.exports = { sendPasswordReset };
