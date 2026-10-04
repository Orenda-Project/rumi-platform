'use strict';
/**
 * LESSON-PLAN AVAILABILITY — can this deployment make the lesson plan or
 * presentation a teacher just asked for?
 *
 * Plans from a typed or spoken request are made by Gamma
 * (lesson-plan-generation.worker.js → content.service.js), so without
 * GAMMA_API_KEY, or with the operator's lesson_plans_gamma switch off, a
 * queued request can only fail. Found on a public instance with no key: the
 * request was queued, Gamma answered 401, and the teacher was told to "please
 * try again", a retry that can never work. The request paths ask here first
 * and say so plainly: no job, no model call, no retry advice.
 */

const { FEATURES, isFeatureAvailable } = require('../config/feature-availability');
const { resolveUx } = require('../config/ux-strings');
const { logToFile } = require('../utils/logger');

const GAMMA = FEATURES.find((f) => f.id === 'lesson_plans_gamma');

/** @returns {boolean} Gamma lesson plans are configured and switched on */
function lessonPlansAvailable(env = process.env) {
  return isFeatureAvailable(GAMMA, env);
}

/**
 * When lesson plans are not available, tell the teacher (in their language,
 * through the messaging facade, so every channel) and return true: the
 * caller stops there. Otherwise return false and send nothing.
 *
 * @param {string} to the teacher's identifier
 * @param {object} [opts]
 * @param {object} [opts.user] users row (preferred_language)
 * @param {string} [opts.language] explicit language, wins over user
 * @param {boolean} [opts.available] the caller's own answer (e.g. a path with another backend)
 * @returns {Promise<boolean>}
 */
async function explainIfUnavailable(to, { user, language, available = lessonPlansAvailable() } = {}) {
  if (available) return false;
  logToFile('🚧 Lesson plan asked for, but lesson-plan generation is not configured (GAMMA_API_KEY)', { userId: user && user.id });
  try {
    // eslint-disable-next-line global-require -- lazy, like daily-caps.js: the facade pulls in every channel
    await require('./whatsapp.service').sendMessage(to, resolveUx('lessonPlansUnavailable', { user, language }));
  } catch (_) { /* the refusal stands even if the explanation could not be sent */ }
  return true;
}

module.exports = { lessonPlansAvailable, explainIfUnavailable };
