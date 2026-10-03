/**
 * Internal API: send a portal password reset code.
 * Called by the portal backend (dashboard/services/password-reset.service.js)
 * to send reset codes through the main bot, which owns the messaging channels.
 *
 * Security: API key authentication required (INTERNAL_API_KEY, shared by the
 * portal backend and the bot). With no key set on the bot, every call is
 * refused: an unset key used to equal a missing header, which let anyone who
 * could reach the bot send messages through it.
 *
 * Where the code goes: the person's own channel identity (the channel they
 * last used, from user_channels), not the number they typed. A bare number
 * reaches only WhatsApp, so on a messenger-only deployment (CHANNEL_DRIVER=none)
 * a teacher on Rumi Messenger never got a code. A WhatsApp-only user resolves
 * to their number, as before.
 */

const WhatsAppService = require('../services/whatsapp.service');
const { identityForUser, userIdForIdentity } = require('../services/messaging/user-identity');
const { logToFile } = require('../utils/logger');

async function sendPasswordReset(req, res) {
  try {
    // Verify API key (shared secret between portal and main bot)
    const apiKey = req.headers['x-api-key'];
    const expectedApiKey = process.env.INTERNAL_API_KEY;

    if (!expectedApiKey || apiKey !== expectedApiKey) {
      logToFile('❌ Unauthorized internal API call', {
        endpoint: '/api/internal/send-password-reset',
        ip: req.ip
      });
      return res.status(401).json({
        success: false,
        error: 'Unauthorized'
      });
    }

    const { phoneNumber, userId, code, firstName, language } = req.body;

    if (!phoneNumber || !code || !firstName) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: phoneNumber, code, firstName'
      });
    }

    // The portal backend sends the userId it looked up; an older one sends
    // only the number, which is looked up here.
    const resolvedUserId = userId || await userIdForIdentity(phoneNumber);
    const recipient = (resolvedUserId && await identityForUser(resolvedUserId)) || phoneNumber;

    logToFile('📞 Internal API: Sending password reset code', {
      phoneNumber,
      recipient,
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

    // Through the messaging facade, which routes the identity to its channel
    const sent = await WhatsAppService.sendMessage(recipient, message);

    if (sent) {
      logToFile('✅ Password reset code sent', {
        phoneNumber,
        recipient,
        language
      });
      res.json({
        success: true,
        message: 'Password reset code sent successfully'
      });
    } else {
      logToFile('❌ Failed to send password reset code', {
        phoneNumber,
        recipient
      });
      res.status(500).json({
        success: false,
        error: 'Failed to send the reset code'
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
