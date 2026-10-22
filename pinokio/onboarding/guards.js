/**
 * guards -- the same security posture the Rumi console enforces, applied to the
 * pages this launcher serves alongside it.
 *
 * The console protects itself (bot/console/index.js) but only under its own mount
 * point. These routes sit at the root of the same app, outside that router, so
 * they need their own copy of the reasoning rather than inheriting it:
 *
 *   - Bound to loopback, with a Host allowlist, so a DNS-rebinding page cannot
 *     reach a server that is only supposed to answer this machine.
 *   - No CORS headers, ever. That is what makes the header check below
 *     unforgeable: a cross-origin caller cannot set a custom header without a
 *     preflight, and nothing here answers one.
 *   - A restrictive CSP, and `img-src data:` only because the QR is rendered
 *     into a data URL.
 *
 * @module onboarding/guards
 */

/** Hosts this server will answer to. Anything else is a rebinding attempt. */
const ALLOWED_HOSTS = new Set(['127.0.0.1', '::1', 'localhost', '[::1]']);

/** Custom header required on every mutating call. Unforgeable without CORS. */
const REQUEST_HEADER = 'X-Rumi-Onboarding';

const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
].join('; ');

/** Strip the port from a Host header, leaving bare IPv6 in brackets intact. */
function hostname(header) {
  const value = String(header || '');
  if (value.startsWith('[')) return value.slice(0, value.indexOf(']') + 1);
  const colon = value.lastIndexOf(':');
  return colon === -1 ? value : value.slice(0, colon);
}

/**
 * Security headers plus the Host allowlist.
 *
 * Requests under /console are left to the console's own, stricter middleware --
 * but only when something is actually mounted there. If the console failed to
 * load, that path has no protection of its own, so it keeps ours instead of
 * falling through a hole shaped like an assumption.
 *
 * @param {{hasConsole: () => boolean}} deps resolved per request, since the
 *   console mounts after this middleware is registered
 */
function securityHeaders({ hasConsole }) {
  return (req, res, next) => {
    if (req.path.startsWith('/console') && hasConsole()) return next();

    res.setHeader('Content-Security-Policy', CSP);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cache-Control', 'no-store');

    if (!ALLOWED_HOSTS.has(hostname(req.headers.host))) {
      return res.status(403).type('text/plain').send('Host not allowed');
    }
    return next();
  };
}

/**
 * Reject state-changing requests that did not come from our own page.
 *
 * Mirrors the console's `X-Console-Request` check for the same reason: a form
 * post or an image tag from a hostile local page cannot set this header, and a
 * fetch that could would need a preflight this server never answers.
 */
function requireOwnOrigin(req, res, next) {
  if (req.method === 'GET' || req.method === 'HEAD') return next();
  if (req.get(REQUEST_HEADER) !== '1') {
    return res.status(403).json({ error: `Missing ${REQUEST_HEADER} header` });
  }
  return next();
}

module.exports = { securityHeaders, requireOwnOrigin, ALLOWED_HOSTS, REQUEST_HEADER };
