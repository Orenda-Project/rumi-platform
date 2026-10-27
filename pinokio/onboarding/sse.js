/**
 * sse -- a server-sent events channel, with the details that bite you left in.
 *
 * Used for the two steps that take long enough to need narrating: applying the
 * schema, and waiting for someone to scan a QR code.
 *
 * @module onboarding/sse
 */

/** Proxies that buffer would defeat the point of streaming; this asks them not to. */
const HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-store',
  Connection: 'keep-alive',
  'X-Accel-Buffering': 'no',
};

/**
 * Open an event stream and return a writer.
 *
 * @param {object} res express response
 * @returns {{send: Function, close: Function, onClose: Function}}
 */
function open(res) {
  res.writeHead(200, HEADERS);
  // Flush headers immediately so the browser's EventSource fires `onopen`
  // rather than waiting for the first payload, which may be a minute away.
  if (typeof res.flushHeaders === 'function') res.flushHeaders();

  let closed = false;

  // The browser going away closes the socket without telling this code, so every
  // later write would land on a dead response. Applying the schema deliberately
  // keeps going when that happens -- stopping halfway would leave the database
  // half-built -- it just stops narrating.
  res.on('close', () => { closed = true; });

  const send = (event, data) => {
    if (closed) return;
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  const close = () => {
    if (closed) return;
    closed = true;
    res.end();
  };

  return {
    send,
    close,
    /** Run `fn` when the browser goes away, so work can be abandoned. */
    onClose: (fn) => res.on('close', fn),
    get closed() {
      return closed;
    },
  };
}

module.exports = { open };
