/**
 * pair-worker -- WhatsApp pairing, quarantined in a child process.
 *
 * Requiring `link-whatsapp` pulls in baileys, pino and Rumi's structured logger,
 * which between them replace global `console.*` at import time, create a logs
 * directory, take an instance lock, register a `process.once('exit')` handler and
 * memoise the socket promise so a second pairing attempt silently ignores its new
 * `onQr` callback. None of that belongs in a long-lived web server.
 *
 * Here it is all disposable: the parent forks this file, relays what it reports,
 * and kills it to cancel. A repeat pairing is a brand new process, so the
 * memoisation trap never fires.
 *
 * Talks to the parent over the fork IPC channel rather than stdout, because the
 * connection module writes an ASCII QR to stdout unconditionally and would
 * corrupt a line-delimited protocol.
 *
 * @module onboarding/pair-worker
 */

// Before the first require: Rumi's structured logger hijacks console.* at import
// time unless this is set, and the CLI does exactly the same thing for the same
// reason (see bot/scripts/setup/interactive-setup.js).
process.env.RUMI_CLI = '1';

const path = require('path');

const APP_ROOT = process.env.RUMI_APP_ROOT;

/** Send a message to the parent, tolerating a channel that has already closed. */
function emit(message) {
  if (process.send) process.send(message);
}

/** Set once the link module is loaded, so the shutdown path can release it. */
let release = null;

/**
 * Shut down on request instead of being killed outright.
 *
 * A default `child.kill()` sends SIGTERM, and a Node process with no SIGTERM
 * listener dies on the OS default disposition: a pending `finally` never runs
 * and neither does `process.once('exit')`. That skipped `releaseWhatsApp()`
 * every time a pairing attempt was cancelled, superseded or navigated away from.
 * With a listener installed, SIGTERM becomes ours to handle.
 */
async function shutdown() {
  try {
    if (release) await release();
  } catch {
    /* best effort -- we are on our way out regardless */
  }
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

async function main() {
  if (!APP_ROOT) {
    emit({ type: 'result', ok: false, reason: 'error', detail: 'RUMI_APP_ROOT was not set' });
    return;
  }

  const linkModule = path.join(APP_ROOT, 'bot', 'scripts', 'setup', 'link-whatsapp.js');
  let linkWhatsApp;
  let releaseWhatsApp;

  try {
    ({ linkWhatsApp, releaseWhatsApp } = require(linkModule));
    release = releaseWhatsApp;
  } catch (error) {
    emit({ type: 'result', ok: false, reason: 'error', detail: error.message });
    return;
  }

  try {
    // onQr fires on every code WhatsApp issues, not just the first -- they rotate
    // roughly every twenty seconds -- so the parent replaces what it is showing.
    const result = await linkWhatsApp({ onQr: (qr) => emit({ type: 'qr', data: qr }) });
    emit({ type: 'result', ...result });
  } catch (error) {
    emit({ type: 'result', ok: false, reason: 'error', detail: error.message });
  } finally {
    // Without this the paired socket keeps the event loop alive and the child
    // never exits. It swallows its own errors.
    try {
      await releaseWhatsApp();
    } catch {
      /* best effort -- we are on our way out regardless */
    }
  }
}

main()
  .catch((error) => emit({ type: 'result', ok: false, reason: 'error', detail: error.message }))
  .finally(() => process.exit(0));
