/**
 * Escaping for HTML that the admin views build in their scripts.
 *
 * Names, messages, transcripts and model replies come from teachers, public
 * sign-ups and models. A view that builds HTML from them (innerHTML = `...`)
 * passes every such value through one of these:
 *
 *   `<div title="${escapeHtml(name)}">${escapeHtml(name)}</div>`
 *   `<a href="${safeUrl(url)}">`
 *
 * escapeHtml(value): the value as text, for element content and for quoted
 * attribute values (escapes & < > " '). null and undefined become ''.
 *
 * safeUrl(value): for href/src. The URL escaped as escapeHtml does, when it is
 * http(s) or relative; '' for any other scheme (javascript:, data:, ...).
 *
 * Load it before the view's own script: <script src="/js/escape-html.js"></script>
 */
(function () {
  'use strict';

  var ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

  function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value).replace(/[&<>"']/g, function (c) { return ENTITIES[c]; });
  }

  function safeUrl(value) {
    if (value === null || value === undefined) return '';
    var url = String(value);
    var parsed;
    try {
      parsed = new URL(url, window.location.href);
    } catch (e) {
      return '';
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
    return escapeHtml(url);
  }

  window.escapeHtml = escapeHtml;
  window.safeUrl = safeUrl;
}());
