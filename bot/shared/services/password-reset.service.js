/**
 * Password Reset Service
 * Handles teacher portal password reset via WhatsApp verification codes
 *
 * Responsibilities:
 * - Generate 6-digit verification codes
 * - Send codes via WhatsApp in user's preferred language
 * - Verify codes within 10-minute expiry window
 * - Support password updates after successful verification
 *
 * Flow:
 * 1. User requests reset on portal (enters phone number)
 * 2. Backend calls sendResetCode() → 6-digit code sent to WhatsApp
 * 3. User enters code on portal
 * 4. Frontend calls verifyResetCode() → validates code
 * 5. If valid, frontend allows password reset
 *
 * Related: TEACHER_PORTAL_IMPLEMENTATION_PLAN.md
 */

const supabase = require('../config/supabase');
const { logToFile } = require('../utils/logger');
const WhatsAppService = require('./whatsapp.service');

class PasswordResetService {
  /**
   * Send password reset code via WhatsApp
   * Generates 6-digit code, stores in database with 10-minute expiry, sends WhatsApp message
   *
   * @param {string} phoneNumber - User's phone number (format: 923001234567)
   * @param {string} language - User's preferred language ('en', 'ur', 'ar', 'es')
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  static async sendResetCode(phoneNumber, language = 'en') {
    try {
      logToFile('🔐 Sending password reset code', { phoneNumber, language });

      // Generate 6-digit code
      const code = Math.floor(100000 + Math.random() * 900000).toString();

      // Set 10-minute expiry
      const expiresAt = new Date();
      expiresAt.setMinutes(expiresAt.getMinutes() + 10);

      // Check if user exists and has activated portal
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('id, first_name, portal_activated, language')
        .eq('phone_number', phoneNumber)
        .single();

      if (userError || !user) {
        logToFile('❌ User not found for password reset', { phoneNumber });
        return {
          success: false,
          error: 'No portal account found for this phone number'
        };
      }

      if (!user.portal_activated) {
        logToFile('❌ Portal not activated for user', { phoneNumber, userId: user.id });
        return {
          success: false,
          error: 'Portal not activated. Please use your invitation link first.'
        };
      }

      // Store reset code in database
      const { error: updateError } = await supabase
        .from('users')
        .update({
          password_reset_code: code,
          password_reset_expires_at: expiresAt.toISOString()
        })
        .eq('id', user.id);

      if (updateError) {
        logToFile('❌ Error storing reset code', { userId: user.id, error: updateError });
        throw updateError;
      }

      // Use user's preferred language if not provided
      const userLanguage = language || user.language || 'en';

      // Multilingual reset code messages
      const messages = {
        en: `Hi ${user.first_name}! 👋

Your Rumi portal password reset code is:

*${code}*

This code expires in 10 minutes.

If you didn't request this, please ignore this message.`,

        ur: `ہیلو ${user.first_name}! 👋

آپ کا Rumi پورٹل پاسورڈ ری سیٹ کوڈ ہے:

*${code}*

یہ کوڈ 10 منٹ میں ختم ہو جائے گا۔

اگر آپ نے یہ درخواست نہیں کی تو براہ کرم اس پیغام کو نظر انداز کریں۔`,

        ar: `مرحباً ${user.first_name}! 👋

رمز إعادة تعيين كلمة مرور بوابة Rumi الخاص بك هو:

*${code}*

تنتهي صلاحية هذا الرمز خلال 10 دقائق.

إذا لم تطلب ذلك، يرجى تجاهل هذه الرسالة.`,

        es: `¡Hola ${user.first_name}! 👋

Tu código de restablecimiento de contraseña del portal Rumi es:

*${code}*

Este código expira en 10 minutos.

Si no solicitaste esto, ignora este mensaje.`
      };

      // Get localized message (fallback to English)
      const message = messages[userLanguage] || messages.en;

      if (!messages[userLanguage]) {
        logToFile('⚠️ Unsupported language for reset code, using English', {
          language: userLanguage,
          userId: user.id
        });
      }

      // Send WhatsApp message
      await WhatsAppService.sendMessage(phoneNumber, message);

      logToFile('✅ Password reset code sent successfully', {
        userId: user.id,
        phoneNumber,
        language: userLanguage,
        expiresAt: expiresAt.toISOString()
      });

      return { success: true };
    } catch (error) {
      logToFile('❌ Error sending reset code', {
        phoneNumber,
        error: error.message,
        stack: error.stack
      });

      return {
        success: false,
        error: 'Failed to send reset code. Please try again.'
      };
    }
  }

  /**
   * Verify password reset code
   * Checks if code matches and hasn't expired
   *
   * @param {string} phoneNumber - User's phone number
   * @param {string} code - 6-digit code entered by user
   * @returns {Promise<{valid: boolean, userId?: string, error?: string}>}
   */
  static async verifyResetCode(phoneNumber, code) {
    try {
      logToFile('🔍 Verifying password reset code', { phoneNumber, code });

      // Query user with matching code
      const { data: user, error: queryError } = await supabase
        .from('users')
        .select('id, password_reset_code, password_reset_expires_at, portal_activated')
        .eq('phone_number', phoneNumber)
        .eq('password_reset_code', code)
        .single();

      if (queryError || !user) {
        logToFile('❌ Invalid reset code', { phoneNumber, code });
        return {
          valid: false,
          error: 'Invalid reset code. Please check and try again.'
        };
      }

      // Check if code has expired
      const now = new Date();
      const expiresAt = new Date(user.password_reset_expires_at);

      if (now > expiresAt) {
        logToFile('❌ Reset code expired', {
          phoneNumber,
          userId: user.id,
          expiresAt: expiresAt.toISOString(),
          now: now.toISOString()
        });
        return {
          valid: false,
          error: 'Reset code has expired. Please request a new code.'
        };
      }

      // Double-check portal activation
      if (!user.portal_activated) {
        logToFile('❌ Portal not activated during reset verification', {
          phoneNumber,
          userId: user.id
        });
        return {
          valid: false,
          error: 'Portal not activated. Please use your invitation link first.'
        };
      }

      logToFile('✅ Reset code verified successfully', {
        phoneNumber,
        userId: user.id
      });

      return {
        valid: true,
        userId: user.id
      };
    } catch (error) {
      logToFile('❌ Error verifying reset code', {
        phoneNumber,
        code,
        error: error.message,
        stack: error.stack
      });

      return {
        valid: false,
        error: 'An error occurred while verifying your code. Please try again.'
      };
    }
  }

  /**
   * Clear reset code after successful password update
   * Removes code and expiry from database
   *
   * @param {string} userId - User's UUID
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  static async clearResetCode(userId) {
    try {
      logToFile('🧹 Clearing reset code', { userId });

      const { error } = await supabase
        .from('users')
        .update({
          password_reset_code: null,
          password_reset_expires_at: null
        })
        .eq('id', userId);

      if (error) {
        throw error;
      }

      logToFile('✅ Reset code cleared', { userId });
      return { success: true };
    } catch (error) {
      logToFile('❌ Error clearing reset code', {
        userId,
        error: error.message
      });

      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Rate limit check for reset requests
   * Prevents abuse by limiting requests per phone number
   *
   * @param {string} phoneNumber - User's phone number
   * @returns {Promise<{allowed: boolean, error?: string}>}
   */
  static async checkRateLimit(phoneNumber) {
    try {
      // Get user's last reset request time
      const { data: user, error } = await supabase
        .from('users')
        .select('password_reset_expires_at')
        .eq('phone_number', phoneNumber)
        .single();

      if (error || !user) {
        // User not found - allow request
        return { allowed: true };
      }

      if (!user.password_reset_expires_at) {
        // No recent reset request - allow
        return { allowed: true };
      }

      // Check if previous code is still valid (within 10 minutes)
      const expiresAt = new Date(user.password_reset_expires_at);
      const now = new Date();

      if (now < expiresAt) {
        // Code still valid - don't allow new request yet
        const minutesRemaining = Math.ceil((expiresAt - now) / 1000 / 60);
        logToFile('⚠️ Rate limit hit for password reset', {
          phoneNumber,
          minutesRemaining
        });

        return {
          allowed: false,
          error: `Please wait ${minutesRemaining} minute(s) before requesting a new code.`
        };
      }

      // Code expired - allow new request
      return { allowed: true };
    } catch (error) {
      logToFile('❌ Error checking rate limit', {
        phoneNumber,
        error: error.message
      });

      // On error, allow request (fail open)
      return { allowed: true };
    }
  }
}

module.exports = PasswordResetService;
