/**
 * dashboard/public/js/escape-html.js: the one escaping helper the admin views'
 * scripts use when they build HTML (window.escapeHtml, window.safeUrl).
 */

const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');
const { maybe } = require('../helpers/render-admin-view');

const DASHBOARD = path.join(__dirname, '../../../dashboard');
const SCRIPT = path.join(DASHBOARD, 'public', 'js', 'escape-html.js');

function load() {
  const { JSDOM } = createRequire(path.join(DASHBOARD, 'package.json'))('jsdom');
  const dom = new JSDOM('<!doctype html><body></body>', { url: 'http://admin.test/observability/users', runScripts: 'outside-only' });
  dom.window.eval(fs.readFileSync(SCRIPT, 'utf8'));
  return dom.window;
}

describe('escape-html.js', () => {
  maybe('escapeHtml escapes & < > " \' and keeps the text', () => {
    const window = load();
    expect(window.escapeHtml(`a&b <i>"x"</i> 'y'`)).toBe('a&amp;b &lt;i&gt;&quot;x&quot;&lt;/i&gt; &#39;y&#39;');
    expect(window.escapeHtml(null)).toBe('');
    expect(window.escapeHtml(undefined)).toBe('');
    expect(window.escapeHtml(0)).toBe('0');
    expect(window.escapeHtml('Plain text')).toBe('Plain text');
  });

  maybe('escaped values stay text in element content and in either attribute quote', () => {
    const window = load();
    const value = `"'><b id=b2>x</b><img src=x id=pwn>`;
    const div = window.document.createElement('div');
    div.innerHTML = `<p title="${window.escapeHtml(value)}" data-x='${window.escapeHtml(value)}'>${window.escapeHtml(value)}</p>`;
    expect(div.querySelector('#b2, #pwn')).toBeNull();
    const p = div.querySelector('p');
    expect(p.textContent).toBe(value);
    expect(p.getAttribute('title')).toBe(value);
    expect(p.getAttribute('data-x')).toBe(value);
  });

  maybe('safeUrl keeps http(s) and relative URLs, escaped; drops other schemes', () => {
    const window = load();
    expect(window.safeUrl('https://example.com/a?b=1&c="2"')).toBe('https://example.com/a?b=1&amp;c=&quot;2&quot;');
    expect(window.safeUrl('http://example.com/')).toBe('http://example.com/');
    expect(window.safeUrl('/observability/proxy/file.pdf')).toBe('/observability/proxy/file.pdf');
    expect(window.safeUrl('report.pdf')).toBe('report.pdf');
    for (const bad of ['javascript:alert(1)', ' JaVaScRiPt:alert(1)', 'java\tscript:alert(1)', 'data:text/html,<b>x</b>', 'vbscript:x', 'blob:http://admin.test/x']) {
      expect(window.safeUrl(bad)).toBe('');
    }
    expect(window.safeUrl(null)).toBe('');
    expect(window.safeUrl('')).toBe('');
  });
});
