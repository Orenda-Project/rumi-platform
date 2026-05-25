/**
 * Image Batch Coalescer
 *
 * Per-user webhook-layer buffer for pic-to-LP image arrivals. WhatsApp delivers
 * an album/batch send as N independent webhooks within ~1 second. Without this
 * service, each webhook would independently run through the pic-LP entry path,
 * race to create its own pic_lp_session, and most would either fall through to
 * generic vision-feedback or accumulate as stale sessions.
 *
 * This service collects per-user webhooks into a 2.5-second sliding window and
 * fires a single `onFlush(batch)` callback. The caller (image-message.handler)
 * picks the primary (caption-carrying) photo, runs the classifier ONCE, creates
 * ONE pic_lp_session, and appends the rest as pages.
 *
 * Design notes:
 *  - Trailing-edge debounce per user: each new image refreshes the timer.
 *    Slow-drip senders still get one-batch-per-photo behavior.
 *  - mediaId dedupe inside the buffer (Meta occasionally retries webhooks).
 *  - Caption picker: any image carrying a caption wins primary status; the
 *    earliest such caption is preserved. If no captions, first-arriving wins.
 *  - MAX_BATCH_SIZE (5) matches MAX_PIC_LP_PAGES — overflow immediately flushes
 *    the current batch and starts a new one.
 *  - Per-user isolation via Map<userId, BatchState>.
 *  - Errors from onFlush are caught + logged; subsequent batches keep working.
 */

const { logToFile } = require('../../utils/logger');

const BATCH_WINDOW_MS = 2500;
const MAX_BATCH_SIZE = 5;

/** @typedef {{ mediaId: string, mimeType?: string, caption?: string, receivedAt?: number }} ImageEvent */
/** @typedef {{ userId: string, images: ImageEvent[], primary: ImageEvent, caption: string }} Batch */

/** @type {Map<string, { images: ImageEvent[], onFlush: Function, timer: NodeJS.Timeout }>} */
const buffers = new Map();

/**
 * Enqueue an image for this user. If a buffer exists for the user, append and
 * reset the timer; otherwise start a new buffer. If MAX_BATCH_SIZE is reached
 * BEFORE the incoming image, flush the current buffer immediately and start a
 * fresh one with the incoming image.
 *
 * @param {object} args
 * @param {string} args.userId   - Teacher UUID
 * @param {ImageEvent} args.image
 * @param {(batch: Batch) => void | Promise<void>} args.onFlush - fires on window close or max-batch
 */
function enqueue({ userId, image, onFlush }) {
  if (!userId || !image || !image.mediaId) {
    throw new Error('image-batch-coalescer: userId, image, image.mediaId all required');
  }

  let state = buffers.get(userId);

  // Cap-reached: flush current + start fresh batch with this image as the seed.
  if (state && state.images.length >= MAX_BATCH_SIZE) {
    fireFlush(userId);
    state = undefined; // a fresh batch follows
  }

  if (!state) {
    state = { images: [], onFlush, timer: null };
    buffers.set(userId, state);
  } else {
    // Refresh the registered callback in case the caller's closure changed
    // (e.g. test re-enqueue across calls). Practically always identical.
    state.onFlush = onFlush;
  }

  // Dedupe by mediaId — Meta sometimes retries webhooks for the same image.
  const alreadyHave = state.images.some((i) => i.mediaId === image.mediaId);
  if (!alreadyHave) {
    state.images.push({
      mediaId: image.mediaId,
      mimeType: image.mimeType,
      caption: image.caption || '',
      receivedAt: image.receivedAt || Date.now(),
    });
  }

  // (Re)arm the trailing-edge debounce timer.
  if (state.timer) clearTimeout(state.timer);
  state.timer = setTimeout(() => fireFlush(userId), BATCH_WINDOW_MS);
}

/**
 * Force-fire any pending batch for this user. No-op if no buffer.
 * Useful for graceful shutdown, error paths, or tests.
 */
function flushNow(userId) {
  if (buffers.has(userId)) {
    fireFlush(userId);
  }
}

function fireFlush(userId) {
  const state = buffers.get(userId);
  if (!state) return;

  if (state.timer) clearTimeout(state.timer);
  buffers.delete(userId);

  const { images, onFlush } = state;
  if (images.length === 0) return;

  // Primary = first image with a caption (preserve arrival order); else first.
  let primary = images.find((i) => (i.caption || '').trim().length > 0);
  if (!primary) primary = images[0];
  const caption = primary.caption || '';

  const batch = { userId, images, primary, caption };

  try {
    onFlush(batch);
  } catch (err) {
    logToFile('image-batch-coalescer: onFlush callback threw', {
      userId,
      error: err.message,
      batchSize: images.length,
    });
  }
}

/**
 * Test-only: reset all internal state. Do NOT call from production paths —
 * a real-world reset would orphan in-flight batches.
 */
function __resetForTest() {
  for (const state of buffers.values()) {
    if (state.timer) clearTimeout(state.timer);
  }
  buffers.clear();
}

module.exports = {
  BATCH_WINDOW_MS,
  MAX_BATCH_SIZE,
  enqueue,
  flushNow,
  __resetForTest,
};
