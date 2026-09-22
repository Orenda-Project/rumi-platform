const fs = require('fs');
const path = require('path');
const { getCurrentCorrelationId } = require('./structured-logger');

// The console's live feed. Off for `rumi` commands (their output is a
// conversation with a person, and no console is watching), and switchable off
// entirely with CONSOLE_RING=0 if it ever needs to be.
const RING_ENABLED = process.env.CONSOLE_RING !== '0' && process.env.RUMI_CLI !== '1';

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

  // Feed the operator console's in-memory ring.
  //
  // Tapped HERE, at the function, rather than at the pino output stream:
  // structured-logger.js only uses its dual-output stream in production, and
  // falls back to a pino-pretty *transport* (a worker thread) in development —
  // so a stream-level tap would work on Railway and silently do nothing on a
  // laptop, which is where the console is most used.
  //
  // event-ring drops everything that is not on its field allowlist, so no
  // phone number, transcript or credential from these 180 call sites can reach
  // a browser. Wrapped because logging must never throw into its caller.
  if (RING_ENABLED) {
    try {
      require('../observability/event-ring').push({
        kind: 'log', message, correlationId, data: enrichedData,
      });
    } catch { /* the console is optional; logging is not */ }
  }

  // Write to file (for local debugging)
  try {
    fs.appendFileSync(logFile, fileMessage);
  } catch (err) {
    // Ignore file write errors in production (Railway has no persistent storage)
  }

  // An interactive `rumi` command keeps the file record but not the console echo.
  // Its terminal is a conversation with a person — a QR code, a wizard, a
  // readiness table — and internal diagnostics interleaved with that read as
  // though something went wrong. The command says what happened in its own
  // words; this line is still in the log file if anyone needs it.
  if (process.env.RUMI_CLI === '1') return;

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
