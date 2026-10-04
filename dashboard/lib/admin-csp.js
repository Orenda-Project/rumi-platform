/**
 * Content-Security-Policy for the admin pages (the EJS views under /observability).
 *
 * Every request gets a fresh nonce in res.locals.cspNonce. When the response is
 * a rendered view, the CSP header is set with that nonce, so only the views'
 * own inline <script nonce="<%= cspNonce %>"> blocks run. JSON, files and the
 * portal app (a static SPA) are untouched: the header is set from res.render.
 *
 * script-src has no 'unsafe-inline', no wildcard and no whole-CDN origin. A
 * third-party script is either vendored under public/vendor/ ('self') or listed
 * below as one exact, versioned file the view loads with integrity= (SRI).
 * Inline event handler attributes (onclick=...) and javascript: URLs are blocked
 * by this policy; views bind events from their nonce'd scripts instead
 * (public/js/csp-actions.js handles data-on-* attributes).
 *
 * style-src keeps 'unsafe-inline': the views use style= attributes and <style>
 * blocks throughout. Styles cannot run script.
 */

const crypto = require('crypto');

/** Third-party scripts loaded from a CDN, each pinned to one file with SRI. */
const PINNED_SCRIPTS = Object.freeze([
  Object.freeze({
    // Mermaid (MIT) for the schema page; 3.3 MB, so not vendored.
    url: 'https://cdn.jsdelivr.net/npm/mermaid@10.9.8/dist/mermaid.min.js',
    integrity: 'sha384-N3QqR/7q+xm3BGX+CBbNI8AUmRRqcsDzToy+0z1NLDI0QmTKW8zvwLvqulJgk3dP',
  }),
]);

/** Google Fonts, used by the transcript pages. */
const FONT_STYLES = 'https://fonts.googleapis.com';
const FONT_FILES = 'https://fonts.gstatic.com';

function newNonce() {
  return crypto.randomBytes(16).toString('base64');
}

/** The admin CSP for one response. */
function buildAdminCsp(nonce) {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' ${PINNED_SCRIPTS.map((s) => s.url).join(' ')}`,
    `style-src 'self' 'unsafe-inline' ${FONT_STYLES}`,
    // Slide images and video posters come from presigned object-storage URLs.
    "img-src 'self' data: https:",
    // Session recordings play through /observability/proxy; videos are presigned URLs.
    "media-src 'self' https:",
    `font-src 'self' data: ${FONT_FILES}`,
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
  ].join('; ');
}

/**
 * Express middleware: a nonce per request, and the CSP on every rendered view.
 * Mount it before the routes.
 */
function adminCsp(req, res, next) {
  const nonce = newNonce();
  res.locals.cspNonce = nonce;
  const render = res.render;
  res.render = function renderWithCsp(...args) {
    if (!res.headersSent) res.setHeader('Content-Security-Policy', buildAdminCsp(nonce));
    return render.apply(this, args);
  };
  next();
}

module.exports = { adminCsp, buildAdminCsp, PINNED_SCRIPTS };
