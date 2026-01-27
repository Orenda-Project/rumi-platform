const fs = require('fs');
const path = require('path');
const { getCurrentCorrelationId } = require('./structured-logger');

// Create logs directory if it doesn't exist
const LOGS_DIR = path.join(__dirname, '../../logs');
if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}

/**
 * Write a log message to file and console (structured)
 *
 * IMPORTANT: This function now outputs structured JSON for Railway/Axiom.
 * The data object is passed directly to console.log for structured logging,
 * NOT pretty-printed into multiple lines.
 *
 * Auto-includes correlationId from AsyncLocalStorage context if available.
 *
 * @param {string} message - The log message
 * @param {Object|null} data - Optional data to log (will be included as structured fields)
 */
function logToFile(message, data = null) {
  const correlationId = getCurrentCorrelationId();
  const timestamp = new Date().toISOString();
  const logFile = path.join(LOGS_DIR, `bot-${new Date().toISOString().split('T')[0]}.log`);

  // Enrich data with correlationId if available (handle null case properly)
  let enrichedData = data;
  if (correlationId) {
    if (data && typeof data === 'object' && !data.correlationId) {
      enrichedData = { correlationId, ...data };
    } else if (!data) {
      enrichedData = { correlationId };
    }
  }

  // For local file: still write detailed format
  let fileMessage = `[${timestamp}] ${message}`;
  if (enrichedData) {
    fileMessage += `\n${JSON.stringify(enrichedData, null, 2)}`;
  }
  fileMessage += '\n' + '='.repeat(80) + '\n';

  // Write to file (for local debugging)
  try {
    fs.appendFileSync(logFile, fileMessage);
  } catch (err) {
    // Ignore file write errors in production (Railway has no persistent storage)
  }

  // For console: output structured (single-line JSON via structured-logger)
  // The structured-logger will intercept this and format it properly
  if (enrichedData) {
    console.log(message, enrichedData);
  } else {
    console.log(message);
  }
}

module.exports = {
  logToFile,
  LOGS_DIR
};
