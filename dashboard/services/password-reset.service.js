/**
 * Password Reset Service (Portal Backend)
 * Handles password reset flow for teacher portal
 *
 * Responsibilities:
 * - Generate 6-digit verification codes
 * - Call Main Bot's internal API to send codes via WhatsApp
 * - Verify codes within 10-minute expiry window
 * - Rate limiting to prevent abuse
 *
 * Flow:
 * 1. User requests reset on portal (enters phone number)
 * 2. Backend calls sendResetCode() → Calls Main Bot API → WhatsApp message sent
 * 3. User enters code on portal
 * 4. Frontend calls verifyResetCode() → validates code
 * 5. If valid, frontend allows password reset
 *
 * NOTE: Uses Main Bot's /api/internal/send-password-reset endpoint
 * This ensures all WhatsApp messages go through the main bot service
 */

const supabase = require('../config/supabase');
const axios = require('axios');

// Main Bot internal API configuration
// Main Bot public URL: digital-coach-production.up.railway.app:8080
const MAIN_BOT_URL = process.env.MAIN_BOT_URL || 'https://digital-coach-production.up.railway.app';
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || 'rumi-internal-2025';

class PasswordResetService {
  /**
   * Send password reset code via WhatsApp
   * Generates 6-digit code, stores in database, calls Main Bot API to send WhatsApp message
   *
   * @param {string} phoneNumber - User's phone number (format: 923001234567)
   * @param {string} language - User's preferred language ('en', 'ur', 'ar', 'es')
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  static async sendResetCode(phoneNumber, language = 'en') {
    try {
      console.log('🔐 Sending password reset code', { phoneNumber, language });

      // Generate 6-digit code
      const code = Math.floor(100000 + Math.random() * 900000).toString();

      // Set 10-minute expiry
      const expiresAt = new Date();
      expiresAt.setMinutes(expiresAt.getMinutes() + 10);

      // Check if user exists and has activated portal
      const { data: users, error: userError } = await supabase
        .from('users')
        .select('id, first_name, portal_activated')
        .eq('phone_number', phoneNumber);

      // Extract first user from array (or null if empty)
      const user = users && users.length > 0 ? users[0] : null;

      if (userError || !user) {
        console.log('❌ User not found for password reset', {
          phoneNumber,
          supabaseError: userError,
          errorCode: userError?.code,
          errorMessage: userError?.message,
          errorDetails: userError?.details,
          userData: user,
          usersArrayLength: users?.length || 0
        });
        return {
          success: false,
          error: 'No portal account found for this phone number'
        };
      }

      if (!user.portal_activated) {
        console.log('❌ Portal not activated for user', { phoneNumber, userId: user.id });
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
        console.error('❌ Error storing reset code', { userId: user.id, error: updateError });
        throw updateError;
      }

      // Use provided language (default to English if not specified)
      const userLanguage = language || 'en';

      console.log('📞 Calling Main Bot internal API to send WhatsApp message', {
        mainBotUrl: MAIN_BOT_URL,
        phoneNumber,
        language: userLanguage
      });

      // Call Main Bot's internal API to send WhatsApp message
      try {
        const response = await axios.post(
          `${MAIN_BOT_URL}/api/internal/send-password-reset`,
          {
            phoneNumber,
            code,
            firstName: user.first_name,
            language: userLanguage
          },
          {
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': INTERNAL_API_KEY
            },
            timeout: 10000 // 10 second timeout
          }
        );

        if (response.data.success) {
          console.log('✅ Password reset code sent successfully via Main Bot', {
            userId: user.id,
            phoneNumber,
            language: userLanguage,
            expiresAt: expiresAt.toISOString()
          });
          return { success: true };
        } else {
          console.error('❌ Main Bot API returned error', {
            phoneNumber,
            error: response.data.error
          });
          return {
            success: false,
            error: 'Failed to send reset code. Please try again.'
          };
        }
      } catch (apiError) {
        console.error('❌ Main Bot API call failed', {
          phoneNumber,
          error: apiError.message,
          response: apiError.response?.data
        });
        return {
          success: false,
          error: 'Failed to send reset code. Please try again.'
        };
      }
    } catch (error) {
      console.error('❌ Error sending reset code', {
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
      console.log('🔍 Verifying password reset code', { phoneNumber, code });

      // Query user with matching code
      const { data: user, error: queryError } = await supabase
        .from('users')
        .select('id, password_reset_code, password_reset_expires_at, portal_activated')
        .eq('phone_number', phoneNumber)
        .eq('password_reset_code', code)
        .single();

      if (queryError || !user) {
        console.log('❌ Invalid reset code', { phoneNumber, code });
        return {
          valid: false,
          error: 'Invalid reset code. Please check and try again.'
        };
      }

      // Check if code has expired
      const now = new Date();
      const expiresAt = new Date(user.password_reset_expires_at);

      if (now > expiresAt) {
        console.log('❌ Reset code expired', {
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
        console.log('❌ Portal not activated during reset verification', {
          phoneNumber,
          userId: user.id
        });
        return {
          valid: false,
          error: 'Portal not activated. Please use your invitation link first.'
        };
      }

      console.log('✅ Reset code verified successfully', {
        phoneNumber,
        userId: user.id
      });

      return {
        valid: true,
        userId: user.id
      };
    } catch (error) {
      console.error('❌ Error verifying reset code', {
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
      console.log('🧹 Clearing reset code', { userId });

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

      console.log('✅ Reset code cleared', { userId });
      return { success: true };
    } catch (error) {
      console.error('❌ Error clearing reset code', {
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
        console.log('⚠️ Rate limit hit for password reset', {
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
      console.error('❌ Error checking rate limit', {
        phoneNumber,
        error: error.message
      });

      // On error, allow request (fail open)
      return { allowed: true };
    }
  }
}

module.exports = PasswordResetService;
