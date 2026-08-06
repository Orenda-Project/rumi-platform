/**
 * link-whatsapp.js — pairs the sandbox channel by QR, shared by `rumi setup`
 * (as its last step) and `rumi pair` (to re-link later).
 *
 * It deliberately drives the *same* connection module the running bot uses
 * (`shared/services/messaging/baileys-connection`) rather than opening a socket
 * of its own. Two code paths writing one WhatsApp session is how a session gets
 * invalidated, and the recovery is manual re-pairing — so there is exactly one
 * place that ever touches it.
 *
 * @module link-whatsapp
 */

const fs = require('fs');
const path = require('path');

/** A human has to pick up a phone, find Linked Devices, and scan. Be generous. */
const DEFAULT_TIMEOUT_MS = 150_000;

/** "923001234567:12@s.whatsapp.net" → "923001234567" */
function numberFromId(id) {
  if (typeof id !== 'string') return null;
  const digits = id.split(':')[0].split('@')[0].replace(/\D/g, '');
  return digits || null;
}

/**
 * The linked account's number, so the caller can say *which* account got linked
 * rather than just "done".
 *
 * @param {object} sock
 * @returns {string|null}
 */
function linkedNumber(sock) {
  return numberFromId(sock && sock.user && sock.user.id);
}

/**
 * The same, read from the stored session on disk.
 *
 * This exists because the socket is not a reliable source at the moment pairing
 * completes. `connection.events.emit('open')` fires *synchronously* just before
 * getSocket()'s promise resolves, so a `.then()` that captures the socket has
 * not run yet — and immediately after a fresh pairing Baileys tears the socket
 * down with "restart required" and reconnects with a different one anyway. Seen
 * live: a successful pairing reported "✔ Linked" with no number, and the
 * closing screen then said "not linked yet".
 *
 * @param {object} connection
 * @returns {string|null}
 */
function storedNumber(connection) {
  try {
    const credsPath = path.join(connection.authDir(), 'creds.json');
    const creds = JSON.parse(fs.readFileSync(credsPath, 'utf-8'));
    return numberFromId(creds && creds.me && creds.me.id);
  } catch {
    return null;
  }
}

/**
 * Opens the connection, prints a QR if pairing is needed, and resolves once
 * WhatsApp reports the link is live.
 *
 * @param {object}   [opts]
 * @param {Function} [opts.onQr]      called the first time a QR is rendered
 * @param {number}   [opts.timeoutMs]
 * @param {object}   [opts.connection] injectable for tests
 * @returns {Promise<{ok: boolean, number?: string, reason?: string, detail?: string}>}
 */
async function linkWhatsApp(opts = {}) {
  const connection = opts.connection || require('../../shared/services/messaging/baileys-connection');
  const timeoutMs = opts.timeoutMs || DEFAULT_TIMEOUT_MS;

  let sock = null;
  let settled = false;
  let onOpen;
  let onClose;

  const outcome = await new Promise((resolve) => {
    const timer = setTimeout(() => settle({ ok: false, reason: 'timeout' }), timeoutMs);
    if (typeof timer.unref === 'function') timer.unref();

    function settle(value) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    }

    // Subscribed on `connection.events`, which survives the internal reconnect
    // Baileys forces immediately after a fresh pairing ("restart required").
    // A listener on the first socket alone would miss the second, real open.
    onOpen = () => settle({ ok: true });
    onClose = ({ loggedOut }) => {
      if (loggedOut) settle({ ok: false, reason: 'logged-out' });
      // Any other close is the expected post-pairing restart — the connection
      // module reconnects on its own and the timeout is the backstop.
    };
    connection.events.on('open', onOpen);
    connection.events.on('close', onClose);

    connection
      // `allowRepair` lets a QR appear even when a now-invalid creds.json is
      // still on disk — exactly the state re-pairing starts from. The bot never
      // passes it, so it still refuses to sit in a QR loop unattended.
      .getSocket({ allowRepair: true, onQr: opts.onQr })
      .then((opened) => { sock = opened; })
      .catch((err) => {
        const busy = /already using|instance lock/i.test(err.message);
        settle({ ok: false, reason: busy ? 'busy' : 'error', detail: err.message });
      });
  });

  connection.events.removeListener('open', onOpen);
  connection.events.removeListener('close', onClose);

  if (!outcome.ok) return outcome;
  return { ok: true, number: linkedNumber(sock) || storedNumber(connection) };
}

/**
 * Hands the WhatsApp session back. A paired socket keeps the event loop alive,
 * so a wizard that forgets this appears to hang after saying it succeeded.
 */
async function releaseWhatsApp(connection = require('../../shared/services/messaging/baileys-connection')) {
  try {
    await connection.close();
  } catch {
    // Already closed, or never opened — nothing to hand back.
  }
}

module.exports = {
  linkWhatsApp, releaseWhatsApp, linkedNumber, storedNumber, numberFromId, DEFAULT_TIMEOUT_MS,
};
