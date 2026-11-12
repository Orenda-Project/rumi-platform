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

/** Real timer: resolves 'timed-out' after ms; cancel() clears it. Absent where setTimeout is. */
function realTimer(ms) {
  let id;
  const promise = new Promise((resolve) => { id = setTimeout(() => resolve('timed-out'), ms); });
  return { promise, cancel: () => clearTimeout(id) };
}

/**
 * Poll Rumi's /health until the port answers.
 *
 * The request is no-cors, so the response is opaque: resolving at all means
 * something is listening. Rejections (refused, reset) just mean "not yet".
 * Each attempt is abandoned after `attemptMs` (and never outlasts the overall
 * deadline), so a fetch that never settles cannot hang the screen.
 * `shouldStop()` is checked every loop; true ends the wait with 'stopped'.
 * `timer(ms)` -> { promise, cancel } is injectable for deterministic tests.
 *
 * @returns {Promise<'up'|'timeout'|'stopped'>}
 */
export async function waitForHealth({
  port, fetchFn, sleep, now, timeoutMs = 120000, everyMs = 2000, attemptMs = 5000,
  shouldStop = () => false, timer = typeof setTimeout === 'function' ? realTimer : null,
}) {
  const started = now();
  for (;;) {
    if (shouldStop()) return 'stopped';
    const remaining = timeoutMs - (now() - started);
    if (remaining <= 0) return 'timeout';
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const options = { mode: 'no-cors', cache: 'no-store' };
    if (controller) options.signal = controller.signal;
    const attempt = Promise.resolve()
      .then(() => fetchFn(`http://127.0.0.1:${port}/health`, options))
      .then(() => 'up', () => 'down');
    const limit = timer ? timer(Math.min(attemptMs, remaining)) : null;
    const outcome = limit ? await Promise.race([attempt, limit.promise]) : await attempt;
    if (limit) limit.cancel();
    if (outcome === 'timed-out' && controller) controller.abort();
    if (outcome === 'up') return shouldStop() ? 'stopped' : 'up';
    if (shouldStop()) return 'stopped';
    if (now() - started >= timeoutMs) return 'timeout';
    await sleep(everyMs);
  }
}
