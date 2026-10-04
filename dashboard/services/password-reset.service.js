/**
 * Password Reset Service (Portal Backend)
 * Handles password reset flow for teacher portal
 *
 * Responsibilities:
 * - Generate 6-digit verification codes (crypto.randomInt)
 * - Call Main Bot's internal API to send codes on the user's own channel
 * - Verify codes within 10-minute expiry window, at most
 *   PORTAL_RESET_CODE_MAX_ATTEMPTS (default 5) tries per code
 * - Never log a code
 * - Rate limiting to prevent abuse
 *
 * Flow:
 * 1. User requests reset on portal (enters phone number)
 * 2. Backend calls sendResetCode() → Calls Main Bot API → the bot sends the code
 *    to the channel the user last used (WhatsApp, or their Rumi Messenger DM)
 * 3. User enters code on portal
 * 4. Frontend calls verifyResetCode() → validates code
 * 5. If valid, frontend allows password reset
 *
 * NOTE: Uses Main Bot's /api/internal/send-password-reset endpoint
 * This ensures all WhatsApp messages go through the main bot service
 */

const crypto = require('crypto');
const supabase = require('../config/supabase');
const axios = require('axios');

// Main Bot internal API configuration
const MAIN_BOT_URL = process.env.MAIN_BOT_URL || '';
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || '';

// How long a code lives, and how many tries one code allows. Six digits is a
// one-in-a-million guess, which is only worth anything if the guesses are few:
// after this many tries the code is dead, even for the right digits.
const CODE_TTL_MINUTES = 10;
const DEFAULT_MAX_ATTEMPTS = 5;
// Tries at claiming an attempt when parallel guesses keep changing the count.
const CLAIM_RETRIES = 3;

// The one answer for every failed verification (wrong, expired, used up,
// unknown number), so a response never says which it was.
const GENERIC_ERROR = 'Invalid or expired code. Please request a new reset code.';

function maxAttempts() {
  const n = parseInt(process.env.PORTAL_RESET_CODE_MAX_ATTEMPTS, 10);
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_MAX_ATTEMPTS;
}

/** A 6-digit code from the CSPRNG; zero-padded, so every draw is 6 digits. */
function generateCode() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

/** Constant-time compare (the lengths of the two are not secret). */
function codesMatch(stored, given) {
  const a = Buffer.from(String(stored));
  const b = Buffer.from(String(given));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** For logs: the last 4 digits only. The code itself is never logged. */
function maskPhone(phoneNumber) {
  return phoneNumber ? `***${String(phoneNumber).slice(-4)}` : phoneNumber;
}

const failed = () => ({ valid: false, error: GENERIC_ERROR });

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
    const phone = maskPhone(phoneNumber);
    try {
      console.log('🔐 Sending password reset code', { phone, language });

      const code = generateCode();

      const expiresAt = new Date();
      expiresAt.setMinutes(expiresAt.getMinutes() + CODE_TTL_MINUTES);

      // Check if user exists and has activated portal
      const { data: users, error: userError } = await supabase
        .from('users')
        .select('id, first_name, portal_activated')
        .eq('phone_number', phoneNumber);

      // Extract first user from array (or null if empty)
      const user = users && users.length > 0 ? users[0] : null;

      if (userError || !user) {
        console.log('❌ User not found for password reset', {
          phone,
          errorCode: userError?.code,
          errorMessage: userError?.message,
          usersArrayLength: users?.length || 0
        });
        return {
          success: false,
          error: 'No portal account found for this phone number'
        };
      }

      if (!user.portal_activated) {
        console.log('❌ Portal not activated for user', { userId: user.id });
        return {
          success: false,
          error: 'Portal not activated. Please use your invitation link first.'
        };
      }

      // Store reset code in database; a new code starts a fresh attempt count.
      const { error: updateError } = await supabase
        .from('users')
        .update({
          password_reset_code: code,
          password_reset_expires_at: expiresAt.toISOString(),
          password_reset_attempts: 0
        })
        .eq('id', user.id);

      if (updateError) {
        console.error('❌ Error storing reset code', { userId: user.id, error: updateError.message });
        throw updateError;
      }

      // Use provided language (default to English if not specified)
      const userLanguage = language || 'en';

      console.log('📞 Calling Main Bot internal API to send the reset code', {
        mainBotUrl: MAIN_BOT_URL,
        userId: user.id,
        language: userLanguage
      });

      // Call Main Bot's internal API to send WhatsApp message
      try {
        const response = await axios.post(
          `${MAIN_BOT_URL}/api/internal/send-password-reset`,
          {
            // userId lets the bot send to this person's own channel (their
            // Matrix DM on a messenger-only deployment), not to a bare number.
            userId: user.id,
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
            language: userLanguage,
            expiresAt: expiresAt.toISOString()
          });
          return { success: true };
        } else {
          console.error('❌ Main Bot API returned error', {
            userId: user.id,
            error: response.data.error
          });
          await this.clearResetCode(user.id);
          return {
            success: false,
            error: 'Failed to send reset code. Please try again.'
          };
        }
      } catch (apiError) {
        // Not the error object or the request config: those carry the code.
        console.error('❌ Main Bot API call failed', {
          userId: user.id,
          error: apiError.message,
          response: apiError.response?.data
        });
        // No code reached them: drop it, or its expiry would rate-limit their
        // next request for 10 minutes (checkRateLimit).
        await this.clearResetCode(user.id);
        return {
          success: false,
          error: 'Failed to send reset code. Please try again.'
        };
      }
    } catch (error) {
      console.error('❌ Error sending reset code', {
        phone,
        error: error.message
      });

      return {
        success: false,
        error: 'Failed to send reset code. Please try again.'
      };
    }
  }

  /**
   * Verify password reset code
   *
   * The user is found by phone number alone and the code compared in constant
   * time. Each code allows maxAttempts() tries (PORTAL_RESET_CODE_MAX_ATTEMPTS,
   * default 5), counted in users.password_reset_attempts. A try is CLAIMED
   * before the code is compared: a conditional update moves the count from
   * the value just read to one more (`.eq('password_reset_attempts', n)`), so
   * of several parallel guesses only one gets each number, and a code can never
   * be compared more than maxAttempts() times. A guess that loses that race
   * re-reads and tries again (CLAIM_RETRIES); if it keeps losing it fails
   * without being compared at all. (supabase-js has no atomic increment, so
   * this compare-and-set is what keeps the count honest.)
   *
   * On the last wrong try the code is cleared but its expiry is KEPT: the
   * right digits then fail too, and checkRateLimit (which reads the expiry)
   * still refuses a new code until the 10 minutes are up. Clearing the expiry
   * as well would let a guesser draw a fresh code, and 5 fresh tries, at once.
   *
   * The right code is single-use: it is cleared on success.
   * Every failure returns the same generic error.
   *
   * @param {string} phoneNumber - User's phone number
   * @param {string} code - 6-digit code entered by user
   * @returns {Promise<{valid: boolean, userId?: string, error?: string}>}
   */
  static async verifyResetCode(phoneNumber, code) {
    const phone = maskPhone(phoneNumber);
    try {
      const max = maxAttempts();

      for (let claim = 0; claim < CLAIM_RETRIES; claim += 1) {
        const { data: user, error: queryError } = await supabase
          .from('users')
          .select('id, password_reset_code, password_reset_expires_at, password_reset_attempts, portal_activated')
          .eq('phone_number', phoneNumber)
          .maybeSingle();

        if (queryError || !user || !user.password_reset_code) {
          console.log('❌ Reset code verification failed: no code pending', { phone });
          return failed();
        }

        if (!user.password_reset_expires_at || new Date() > new Date(user.password_reset_expires_at)) {
          console.log('❌ Reset code expired', { userId: user.id });
          return failed();
        }

        if (!user.portal_activated) {
          console.log('❌ Portal not activated during reset verification', { userId: user.id });
          return failed();
        }

        const used = user.password_reset_attempts || 0;
        if (used >= max) {
          console.log('❌ Reset code has no tries left', { userId: user.id });
          return failed();
        }

        // Claim try number used+1. Matching the stored code too means a code
        // re-issued meanwhile (count back to 0) is not claimed by mistake.
        const { data: claimed, error: claimError } = await supabase
          .from('users')
          .update({ password_reset_attempts: used + 1 })
          .eq('id', user.id)
          .eq('password_reset_code', user.password_reset_code)
          .eq('password_reset_attempts', used)
          .select('id');

        if (claimError) throw claimError;
        if (!claimed || claimed.length === 0) continue; // lost the race: re-read

        if (codesMatch(user.password_reset_code, code)) {
          // Single use: the session now carries the reset (resetUserId).
          await this.clearResetCode(user.id);
          console.log('✅ Reset code verified successfully', { userId: user.id });
          return { valid: true, userId: user.id };
        }

        if (used + 1 >= max) {
          // Out of tries: the code dies. Expiry kept (see above).
          const { error: lockError } = await supabase
            .from('users')
            .update({ password_reset_code: null })
            .eq('id', user.id)
            .eq('password_reset_code', user.password_reset_code);
          if (lockError) throw lockError;
          console.log('🔒 Reset code invalidated after too many wrong tries', { userId: user.id, attempts: used + 1 });
        } else {
          console.log('❌ Wrong reset code', { userId: user.id, attempts: used + 1, max });
        }
        return failed();
      }

      console.log('❌ Reset code verification lost the race too often', { phone });
      return failed();
    } catch (error) {
      // Never the code, and not the error's stack/config either.
      console.error('❌ Error verifying reset code', {
        phone,
        error: error.message
      });

      return failed();
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
          password_reset_expires_at: null,
          password_reset_attempts: 0
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
          phone: maskPhone(phoneNumber),
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
        phone: maskPhone(phoneNumber),
        error: error.message
      });

      // On error, allow request (fail open)
      return { allowed: true };
    }
  }
}

module.exports = PasswordResetService;
