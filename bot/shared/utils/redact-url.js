'use strict';
/**
 * redactUrl — what a log line may say about a file URL.
 *
 * Teachers' files sit behind URLs that open for anyone holding them: a
 * presigned R2/S3 URL carries its signature in the query string, a public
 * r2.dev URL needs no signature at all (its path IS the key), and a Gamma
 * export URL is public. So a log keeps only the host and a short hash of the
 * path — enough to tell two files apart, or to match a log line to a stored
 * URL (hash that URL's path the same way), and never enough to open one —
 * plus the file extension, which says what kind of file it was.
 *
 *   https://pub-abc.r2.dev/reports/u1/s1.pdf?X-Amz-Signature=…
 *     → 'pub-abc.r2.dev#sha256:1a2b3c4d5e6f.pdf'
 *
 * Only what is logged changes: store and send the full URL as before.
 *
 * Any string may be passed: each URL inside it is redacted in place and the
 * rest is kept, so a local path ('/tmp/report.pdf') or an error message comes
 * back unchanged. null/undefined/numbers pass through; an array is redacted
 * element by element.
 *
 * bot/shared/utils/redact-url.js and dashboard/lib/redact-url.js are the same
 * file (the dashboard deploys on its own and can't require bot/shared);
 * tests/unit/redact-url.test.js keeps them identical.
 */

const crypto = require('crypto');

// scheme://… up to whitespace, a quote, an angle bracket or a backslash (so a
// URL inside JSON that was stringified twice — `\"https://…\"` — ends before
// its escaped closing quote, which is kept).
const URL_IN_TEXT_RE = /\b[a-z][a-z0-9+.-]*:\/\/[^\s"'<>\\]+/gi;

function redactOne(raw) {
  let u;
  try {
    u = new URL(raw);
  } catch {
    return '[unparseable url]';
  }
  const hash = crypto.createHash('sha256').update(u.pathname).digest('hex').slice(0, 12);
  const ext = (u.pathname.match(/\.([a-z0-9]{1,5})$/i) || [''])[0].toLowerCase();
  return `${u.host}#sha256:${hash}${ext}`;
}

/**
 * @param {*} value  a URL, a string that may contain URLs, an array of them, or anything else
 * @returns {*} the same shape with every URL reduced to `host#sha256:<12 hex>[.ext]`
 */
function redactUrl(value) {
  if (Array.isArray(value)) return value.map(redactUrl);
  if (value instanceof URL) return redactOne(value.href);
  if (typeof value !== 'string') return value;
  return value.replace(URL_IN_TEXT_RE, redactOne);
}

module.exports = { redactUrl };
