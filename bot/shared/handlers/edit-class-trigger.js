'use strict';
/**
 * Pure, dependency-free keyword detector for the "edit class" intent.
 * Kept separate from text-message.handler so it is unit-testable.
 */

const EDIT_CLASS_KEYWORDS = [
  'edit class',
  'editclass',
  '/editclass',
  '/edit-class',
  'edit roster',
  'manage class',
  'edit students',
  'remove student',
  'delete student',
  'class edit',
  'student edit',
  // Urdu
  'کلاس ایڈٹ',
];

/**
 * @param {string} message
 * @returns {{ detected:boolean, keyword?:string }}
 */
function detectEditClassIntent(message) {
  if (!message || typeof message !== 'string' || message.trim() === '') {
    return { detected: false };
  }
  const lower = message.toLowerCase();
  for (const keyword of EDIT_CLASS_KEYWORDS) {
    if (lower.includes(keyword.toLowerCase())) {
      return { detected: true, keyword };
    }
  }
  return { detected: false };
}

module.exports = { EDIT_CLASS_KEYWORDS, detectEditClassIntent };
