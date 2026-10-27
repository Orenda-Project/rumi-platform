/**
 * whatsapp -- pairing, as a picture instead of terminal art.
 *
 * Rumi links your own number the way WhatsApp Web does, so the only thing that
 * can be improved here is the rendering: upstream draws the code with
 * `qrcode-terminal` and needs a real terminal, but it also hands the raw payload
 * to an `onQr` callback, which is all a browser needs to draw it properly.
 *
 * The pairing itself runs in a forked child (see pair-worker.js) and talks back
 * over the IPC channel, because the module it depends on is not safe to load into
 * a long-lived server. Killing the child is how "cancel" is implemented, and it is
 * also what makes a second attempt work.
 *
 * @module onboarding/routes/whatsapp
 */

const { fork } = require('child_process');
const QRCode = require('qrcode');

const { asyncRoute } = require('../async-route');
const sse = require('../sse');

/** Rendering options: quiet margin and a size that scans from a phone held at arm's length. */
const QR_RENDER = { margin: 2, width: 320, errorCorrectionLevel: 'M' };

/** How long a worker gets to release the WhatsApp session before it is killed outright. */
const SHUTDOWN_GRACE_MS = 4000;

/** Explanations for the reasons `linkWhatsApp` can fail, in the operator's terms. */
const REASONS = {
  timeout: 'The code expired before it was scanned. Start again when you have the phone to hand.',
  'logged-out': 'WhatsApp rejected the link. Remove Rumi from Linked Devices on your phone, then try again.',
  busy: 'Rumi is already running and holding the WhatsApp session. Stop it first, then pair.',
  error: 'Pairing failed.',
};

function whatsappRoutes({ express, bridge }) {
  const router = express.Router();
  const { capabilities, PAIR_WORKER, APP_ROOT } = bridge;

  /** At most one pairing attempt at a time -- the session lock allows no more. */
  let child = null;

  /**
   * Ask the worker to stop, and insist if it will not.
   *
   * SIGTERM rather than a bare `kill()` because the worker now handles it and
   * releases the WhatsApp session on the way out; without that release the
   * session lock outlives the process. SIGKILL is the backstop for a worker
   * wedged inside the link module, and cannot be handled or skipped.
   */
  function stopChild() {
    if (!child) return;
    const leaving = child;
    child = null;

    leaving.kill('SIGTERM');
    const force = setTimeout(() => leaving.kill('SIGKILL'), SHUTDOWN_GRACE_MS);
    force.unref(); // never hold the server open just to police a dying child
    leaving.once('exit', () => clearTimeout(force));
  }

  router.get('/pair', (req, res) => {
    if (!capabilities.whatsapp) {
      return res.status(503).json({ error: 'Pairing is unavailable -- use Re-pair WhatsApp in the sidebar.' });
    }

    stopChild(); // a stale attempt still holds the lock the new one needs
    const stream = sse.open(res);
    child = fork(PAIR_WORKER, [], {
      env: { ...process.env, RUMI_APP_ROOT: APP_ROOT },
      // The connection module writes an ASCII QR to stdout no matter what, so the
      // real messages come over IPC and stdio is left to the server's own log.
      stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
    });

    relay(child, stream, () => { child = null; });
    stream.onClose(stopChild);
    return undefined;
  });

  router.post('/cancel', asyncRoute(async (req, res) => {
    stopChild();
    res.json({ cancelled: true });
  }));

  return router;
}

/**
 * Wire a pairing child to a browser stream.
 *
 * @param {object} worker the forked child
 * @param {object} stream an sse writer
 * @param {Function} onFinished called once the child is gone
 */
function relay(worker, stream, onFinished) {
  worker.on('message', (message) => {
    if (message.type === 'qr') {
      renderQr(message.data)
        .then((image) => stream.send('qr', { image }))
        .catch((error) => stream.send('failed', { error: error.message }));
      return;
    }
    if (message.type === 'result') {
      stream.send(message.ok ? 'linked' : 'failed', describeResult(message));
    }
  });

  worker.on('error', (error) => stream.send('failed', { error: error.message }));

  worker.on('exit', () => {
    onFinished();
    stream.close();
  });
}

/** Turn the raw pairing payload into something an `<img>` can show. */
function renderQr(payload) {
  return QRCode.toDataURL(payload, QR_RENDER);
}

function describeResult(message) {
  if (message.ok) return { number: message.number || null };
  const explanation = REASONS[message.reason] || REASONS.error;
  return {
    reason: message.reason,
    error: message.detail ? `${explanation} (${message.detail})` : explanation,
  };
}

module.exports = { whatsappRoutes };
