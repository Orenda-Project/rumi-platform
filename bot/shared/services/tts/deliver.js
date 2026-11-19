/**
 * Hands a voice note from the TTS gateway to the right WhatsApp sender.
 *
 * Routes on WHO SPOKE, never on the bytes: every legacy result goes back to the site's own sender,
 * so with no TTS_* variable set a site delivers exactly as it does today and sendOgg is never called.
 */

const structured = require('../../utils/structured-logger');

// The log line is written after the send, so it must never throw: a site counts a throw as "not sent" and
// would send the text too, and after a sender's throw it would replace that error. Called by name on the
// module object so a test's spy still sees it.
function quietly(target, name, ...args) {
  try {
    if (typeof target[name] === 'function') target[name](...args);
  } catch (_) { /* bookkeeping only */ }
}

async function deliverTts(result, { sendOgg, legacySend, meta = {} }) {
  const provider = result.provider;
  // The gateway result names its use case and site, so a site need not repeat them in meta.
  const delivered = (fields) => quietly(structured, 'logEvent', 'tts.delivered', {
    useCase: meta.useCase || result.useCase, site: meta.site || result.site, provider, ...fields,
  });
  let ok;
  try {
    ok = provider === 'soniox' ? await sendOgg(result.audio) : await legacySend(result.audio);
  } catch (error) {
    // A note that failed by throwing did not go either: the field gate counts ok false, so it is logged
    // here too. The sender's own error still reaches the site, whose try handles it.
    delivered({ ok: false, threw: true });
    throw error;
  }
  // Senders return false on failure and something else (true, a response) on success.
  delivered({ ok: ok !== false });
  return ok;
}

module.exports = { deliverTts };
