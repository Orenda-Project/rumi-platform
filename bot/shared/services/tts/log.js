'use strict';
/**
 * The two log levels the voice gateway writes, on top of the repo logger (which has one, logToFile).
 * Each line keeps its event name as the message, so a search for "tts.synthesize.fallback" finds it,
 * and carries `level` so the error lines (a fallback, a failure, a bad setting) can be told apart.
 */

const { logToFile } = require('../../utils/logger');

function logError(message, data = {}) {
  logToFile(`❌ ${message}`, { level: 'error', ...data });
}

function logWarn(message, data = {}) {
  logToFile(`⚠️ ${message}`, { level: 'warn', ...data });
}

module.exports = { logError, logWarn };
