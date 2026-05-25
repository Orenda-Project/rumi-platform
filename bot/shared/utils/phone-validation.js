'use strict';
/**
 * Phone number validation + normalization to E.164.
 *
 * Region-agnostic: teachers enter international format (e.g. +14155550123).
 * A deployment that wants to accept a local format (e.g. a leading 0) can set
 * DEFAULT_PHONE_COUNTRY_CODE (digits only, no +) — a leading 0 is then replaced
 * with that country code. Numbers to Meta-blocked country codes are rejected.
 */

// Country codes WhatsApp cannot deliver to.
const META_BLOCKED_COUNTRY_CODES = ['+53', '+98', '+850', '+963', '+7978'];

/**
 * @param {string|null|undefined} rawPhone
 * @returns {{ valid: boolean, normalized?: string, error?: string }}
 */
function validateAndNormalizePhone(rawPhone) {
  if (rawPhone === null || rawPhone === undefined || rawPhone === '') {
    return { valid: false, error: 'Phone number is required' };
  }

  // Strip spaces, dashes, parentheses.
  let phone = String(rawPhone).replace(/[\s\-()]/g, '');

  if (/[a-zA-Z]/.test(phone)) {
    return { valid: false, error: 'Invalid phone number — letters are not allowed' };
  }

  // Optional local-format expansion: a leading 0 → the deployment's default
  // country code (digits only, no +). E.g. DEFAULT_PHONE_COUNTRY_CODE=44 turns
  // 07911123456 into +447911123456.
  const cc = (process.env.DEFAULT_PHONE_COUNTRY_CODE || '').replace(/\D/g, '');
  if (cc && /^0\d{6,}$/.test(phone)) {
    phone = `+${cc}${phone.substring(1)}`;
  }

  // A bare number with a + is assumed already-international.
  if (!phone.startsWith('+')) {
    // If it's all digits and long enough, treat it as already carrying a
    // country code (prepend +). Otherwise it's ambiguous → error below.
    if (/^\d{7,15}$/.test(phone)) {
      phone = `+${phone}`;
    }
  }

  // E.164: + followed by 7-15 digits, first digit 1-9.
  if (!/^\+[1-9]\d{6,14}$/.test(phone)) {
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 7) {
      return { valid: false, error: 'Phone number is too short. Please include the country code.' };
    }
    if (digits.length > 15) {
      return { valid: false, error: 'Phone number is too long. Maximum 15 digits allowed.' };
    }
    return { valid: false, error: 'Invalid phone number. Use international format, e.g. +14155550123' };
  }

  for (const blocked of META_BLOCKED_COUNTRY_CODES) {
    if (phone.startsWith(blocked)) {
      return {
        valid: false,
        error: `WhatsApp cannot send messages to this country code (${blocked}).`,
      };
    }
  }

  return { valid: true, normalized: phone };
}

module.exports = { validateAndNormalizePhone, META_BLOCKED_COUNTRY_CODES };
