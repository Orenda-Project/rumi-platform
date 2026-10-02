'use strict';
/**
 * Pure, dependency-free keyword detector for the Grandparent Bridge intent —
 * same shape as edit-class-trigger.js / attendance-detector.service.js, kept
 * out of text-message.handler.js so it is unit-testable.
 *
 * HIGH keywords are explicit ("/bridge", "grandparent bridge"): start the
 * three questions straight away. MEDIUM keywords are the way a parent
 * actually mentions the problem in passing ("my in-laws think…", "saas keeps
 * saying…") — the caller offers the feature rather than hijacking the
 * conversation, because the parent may just be venting.
 */

const HIGH_KEYWORDS = [
  '/bridge',
  'grandparent bridge',
  'one pager for my in-laws',
  'one-pager for my in-laws',
];

const MEDIUM_KEYWORDS = [
  // English — the phrasings from the research sweep's own quotes
  'in-laws',
  'in laws',
  'inlaws',
  'relatives',
  'grandparents',
  'grandparent',
  "family doesn't support",
  'family does not support',
  "family doesn't understand",
  'skeptical relatives',
  'sceptical relatives',
  // Roman Urdu / Urdu — how it is said at home
  'saas',
  'sasu',
  'ساس',
  'سسرال',
  'رشتہ دار',
  'رشتے دار',
  'دادی',
  'نانی',
  'دادا',
  'نانا',
];

/**
 * @param {string} message
 * @returns {{ detected:boolean, confidence?:'high'|'medium', keyword?:string }}
 */
function detectGrandparentBridgeIntent(message) {
  if (!message || typeof message !== 'string' || message.trim() === '') {
    return { detected: false };
  }
  const lower = message.toLowerCase();

  for (const keyword of HIGH_KEYWORDS) {
    if (lower.includes(keyword.toLowerCase())) {
      return { detected: true, confidence: 'high', keyword };
    }
  }
  for (const keyword of MEDIUM_KEYWORDS) {
    if (lower.includes(keyword.toLowerCase())) {
      return { detected: true, confidence: 'medium', keyword };
    }
  }
  return { detected: false };
}

module.exports = {
  HIGH_KEYWORDS,
  MEDIUM_KEYWORDS,
  detectGrandparentBridgeIntent,
};
