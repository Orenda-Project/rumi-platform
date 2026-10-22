/**
 * api -- talking to the onboarding server.
 *
 * Every mutating call carries `X-Rumi-Onboarding: 1`. The server sends no CORS
 * headers, so no other origin can set that header without a preflight it will
 * never get an answer to -- which is what makes it worth checking. Event streams
 * are GET, so they need nothing extra.
 *
 * @module api
 */

const HEADER = 'X-Rumi-Onboarding';

async function parse(response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
  return body;
}

export function get(path) {
  return fetch(path, { headers: { Accept: 'application/json' } }).then(parse);
}

export function post(path, body) {
  return fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', [HEADER]: '1' },
    body: JSON.stringify(body || {}),
  }).then(parse);
}

/**
 * Subscribe to a server-sent event stream.
 *
 * @param {string} path
 * @param {Record<string, Function>} handlers one per event name
 * @returns {EventSource} close it to abandon the work
 */
export function stream(path, handlers) {
  const source = new EventSource(path);
  for (const [event, handler] of Object.entries(handlers)) {
    source.addEventListener(event, (message) => handler(JSON.parse(message.data)));
  }
  return source;
}
