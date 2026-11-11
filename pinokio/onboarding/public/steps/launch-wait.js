/**
 * launch-wait -- the two pure pieces of the launching screen.
 *
 * Kept free of imports so Jest can load it (tests/pinokio/_load-esm.js).
 *
 * @module launch-wait
 */

/** Where the operator console opens once Rumi answers. */
export function consoleUrl(port) {
  return `http://127.0.0.1:${port}/console/activity?first-run=1`;
}

/**
 * Poll Rumi's /health until the port answers.
 *
 * The request is no-cors, so the response is opaque: resolving at all means
 * something is listening. Rejections (refused, reset) just mean "not yet".
 *
 * @returns {Promise<'up'|'timeout'>}
 */
export async function waitForHealth({
  port, fetchFn, sleep, now, timeoutMs = 120000, everyMs = 2000,
}) {
  const started = now();
  for (;;) {
    try {
      await fetchFn(`http://127.0.0.1:${port}/health`, { mode: 'no-cors', cache: 'no-store' });
      return 'up';
    } catch { /* not answering yet */ }
    if (now() - started >= timeoutMs) return 'timeout';
    await sleep(everyMs);
  }
}
