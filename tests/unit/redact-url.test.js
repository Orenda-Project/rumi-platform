'use strict';
/**
 * redactUrl — what a log line may say about a file URL: the host and a short
 * hash of the path (enough to correlate with the stored URL), never the
 * query (the signature) and never the openable path.
 *
 * The dashboard deploys from dashboard/ on its own, so it can't require
 * bot/shared; it carries a copy, and this test keeps the two identical.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { redactUrl } = require('../../bot/shared/utils/redact-url');
const dashboard = require('../../dashboard/lib/redact-url');

const sha12 = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 12);

// Every piece of `url` that would help open it: its query, its path, and
// each path segment that carries an id.
function expectNotOpenable(out, url) {
  const u = new URL(url);
  expect(out).not.toContain(url);
  expect(out).not.toContain(u.pathname);
  if (u.search) expect(out).not.toContain(u.search.slice(1));
  for (const seg of u.pathname.split('/').filter((s) => s.length > 6)) {
    expect(out).not.toContain(seg.replace(/\.[a-z0-9]+$/i, ''));
  }
}

describe('redactUrl', () => {
  test('presigned R2/S3 URL: host + hash of the path, no signature, no key', () => {
    const url = 'https://acc123.r2.cloudflarestorage.com/bucket/reports/u-7f3a/s-91c2.pdf'
      + '?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AKIAEXAMPLE%2F20261004&X-Amz-Signature=abc123def456';
    const out = redactUrl(url);
    expect(out).toBe(`acc123.r2.cloudflarestorage.com#sha256:${sha12('/bucket/reports/u-7f3a/s-91c2.pdf')}.pdf`);
    expectNotOpenable(out, url);
    expect(out).not.toMatch(/X-Amz|Signature|Credential/);
  });

  test('the same object presigned twice redacts to the same value (correlatable)', () => {
    const a = redactUrl('https://acc.r2.cloudflarestorage.com/b/k/1.pdf?X-Amz-Signature=one');
    const b = redactUrl('https://acc.r2.cloudflarestorage.com/b/k/1.pdf?X-Amz-Signature=two');
    expect(a).toBe(b);
    expect(redactUrl('https://acc.r2.cloudflarestorage.com/b/k/2.pdf')).not.toBe(a);
  });

  test('public r2.dev URL (openable without any signature): the path does not survive', () => {
    const url = 'https://pub-abc123.r2.dev/reading-reports/u-55aa/assessment-8812.pdf';
    const out = redactUrl(url);
    expect(out).toMatch(/^pub-abc123\.r2\.dev#sha256:[0-9a-f]{12}\.pdf$/);
    expectNotOpenable(out, url);
  });

  test('Gamma export URL (public to anyone holding it)', () => {
    const url = 'https://assets.api.gamma.app/export/pdf/x1y2z3w4/a1b2c3d4e5/Lesson-Plan-Fractions.pdf';
    const out = redactUrl(url);
    expect(out).toMatch(/^assets\.api\.gamma\.app#sha256:[0-9a-f]{12}\.pdf$/);
    expectNotOpenable(out, url);
  });

  test('a URL with no file extension and credentials in the userinfo', () => {
    const out = redactUrl('https://user:secret@gamma.app/docs/abcdef123456?mode=doc');
    expect(out).toMatch(/^gamma\.app#sha256:[0-9a-f]{12}$/);
    expect(out).not.toMatch(/secret|user|abcdef123456|mode/);
  });

  test('a URL embedded in a longer string is redacted in place', () => {
    const out = redactUrl('fetch failed for https://pub-abc.r2.dev/a/b-123456.mp3?x=1 (404)');
    expect(out).toMatch(/^fetch failed for pub-abc\.r2\.dev#sha256:[0-9a-f]{12}\.mp3 \(404\)$/);
  });

  test('a URL inside doubly-stringified JSON: redacted, and the escaped quote after it survives', () => {
    const url = 'https://tempfile.example-cdn.com/k/abc123.mp4';
    const body = JSON.stringify({ data: { resultJson: JSON.stringify({ resultUrls: [url] }) } });
    const out = redactUrl(body);
    expectNotOpenable(out, url);
    expect(JSON.parse(JSON.parse(out).data.resultJson).resultUrls)
      .toEqual([`tempfile.example-cdn.com#sha256:${sha12('/k/abc123.mp4')}.mp4`]);
  });

  test('non-URL values pass through: local paths, null, undefined, numbers', () => {
    expect(redactUrl('/tmp/quiz-report-q1.pdf')).toBe('/tmp/quiz-report-q1.pdf');
    expect(redactUrl('reports/u1/s1.pdf')).toBe('reports/u1/s1.pdf');
    expect(redactUrl(null)).toBeNull();
    expect(redactUrl(undefined)).toBeUndefined();
    expect(redactUrl(42)).toBe(42);
    expect(redactUrl('')).toBe('');
  });

  test('a malformed URL-looking string never comes back raw', () => {
    const out = redactUrl('https://[not-a-host/reports/u1/s1.pdf?X-Amz-Signature=abc');
    expect(out).not.toMatch(/reports|s1|Signature|abc/);
    expect(out).toContain('[unparseable url]');
  });

  test('an array of URLs is redacted element by element', () => {
    const out = redactUrl(['https://pub-a.r2.dev/slides/1-aa11bb22.png', null]);
    expect(out).toEqual([expect.stringMatching(/^pub-a\.r2\.dev#sha256:[0-9a-f]{12}\.png$/), null]);
  });

  test('a URL object is redacted like its string', () => {
    const u = new URL('https://pub-a.r2.dev/k/file-1234567.pdf?sig=1');
    expect(redactUrl(u)).toBe(redactUrl(u.href));
  });
});

describe('dashboard copy', () => {
  test('dashboard/lib/redact-url.js is byte-identical to bot/shared/utils/redact-url.js', () => {
    const root = path.resolve(__dirname, '../..');
    const bot = fs.readFileSync(path.join(root, 'bot/shared/utils/redact-url.js'), 'utf8');
    const dash = fs.readFileSync(path.join(root, 'dashboard/lib/redact-url.js'), 'utf8');
    expect(dash).toBe(bot);
    expect(dashboard.redactUrl('https://pub-a.r2.dev/x/y.pdf')).toBe(redactUrl('https://pub-a.r2.dev/x/y.pdf'));
  });
});
