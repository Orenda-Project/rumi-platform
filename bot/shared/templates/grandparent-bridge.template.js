'use strict';
/**
 * Grandparent Bridge one-pager HTML template.
 *
 * Renders the bilingual (English + Urdu) one-pager a parent forwards to a
 * skeptical relative. Uses the same shared/utils/html-to-pdf.js Playwright
 * engine as the quiz / reading / coaching reports, and the same
 * base64-embedded font discipline they use — Chromium's HarfBuzz pipeline is
 * what shapes Nastaliq correctly, which is exactly why this page is HTML→PDF
 * and not PDFKit.
 *
 * Design intent (Sparks "Delivery Engine" register): this must read like a
 * warm note from the family, NOT like a briefing document that wins an
 * argument. Hence: no charts, no score badges, no red/green, generous
 * whitespace, the relative's own concern quoted first and honoured, evidence
 * demoted to small print at the bottom with its own honesty flags visible.
 */

const fs = require('fs');
const path = require('path');

// Lazy-load font + logo bytes once per process (same pattern as
// quiz-report.template.js / reading-report.template.js).
let _assets = null;

function readBase64(relPath) {
  const abs = path.join(__dirname, '..', relPath);
  if (!fs.existsSync(abs)) return null;
  return fs.readFileSync(abs).toString('base64');
}

function ensureAssets() {
  if (_assets) return _assets;
  _assets = {
    logo: readBase64('assets/Rumi Transparent.png') || '',
    lexendRegular: readBase64('fonts/Lexend-Regular.ttf') || '',
    lexendBold: readBase64('fonts/Lexend-Bold.ttf') || '',
    nastaliqRegular: readBase64('fonts/NotoNastaliqUrdu-Regular.ttf') || '',
    nastaliqBold: readBase64('fonts/NotoNastaliqUrdu-Bold.ttf') || '',
  };
  return _assets;
}

function escapeHtml(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildStyles(a) {
  return `
@font-face { font-family:'Lexend'; font-weight:400; src:url(data:font/ttf;base64,${a.lexendRegular}) format('truetype'); }
@font-face { font-family:'Lexend'; font-weight:700; src:url(data:font/ttf;base64,${a.lexendBold}) format('truetype'); }
@font-face { font-family:'Noto Nastaliq Urdu'; font-weight:400; src:url(data:font/ttf;base64,${a.nastaliqRegular}) format('truetype'); }
@font-face { font-family:'Noto Nastaliq Urdu'; font-weight:700; src:url(data:font/ttf;base64,${a.nastaliqBold}) format('truetype'); }

:root { --ink:#1f2937; --primary:#1e3a5f; --soft:#f8fafc; --border:#e2e8f0; --muted:#64748b; }
* { box-sizing:border-box; margin:0; padding:0; }
html, body { font-family:'Lexend', sans-serif; font-size:11pt; color:var(--ink); background:#fff; line-height:1.6;
  -webkit-print-color-adjust:exact; print-color-adjust:exact; }
@page { size:A4; margin:44px 48px; }

.header { display:flex; align-items:center; gap:14px; padding-bottom:10px; }
.header-logo { width:48px; height:auto; display:block; flex-shrink:0; }
.title { font-size:19pt; font-weight:700; color:var(--primary); line-height:1.2; }
.subtitle { font-size:9.5pt; color:var(--muted); margin-top:2px; }
.rule { border:0; border-top:1px solid var(--border); margin:14px 0 18px 0; }

.pane { margin-bottom:26px; }
.quote { background:var(--soft); border-left:3px solid var(--border); border-radius:8px;
  padding:12px 14px; font-size:11pt; margin-bottom:14px; }
.quote-label { font-size:8.5pt; letter-spacing:0.06em; text-transform:uppercase; color:var(--muted); margin-bottom:4px; }
.body-text { margin-bottom:12px; }
.invite { border:1px solid var(--border); border-radius:8px; padding:12px 14px; font-weight:700; color:var(--primary); }

.ur { font-family:'Noto Nastaliq Urdu', 'Lexend', serif; direction:rtl; text-align:right; line-height:2.15; font-size:12pt; }
.ur .quote { border-left:0; border-right:3px solid var(--border); }

.sources { margin-top:6px; }
.sources-head { font-size:9pt; font-weight:700; color:var(--muted); letter-spacing:0.04em;
  text-transform:uppercase; margin-bottom:6px; }
.source-item { font-size:8pt; color:var(--muted); line-height:1.45; margin-bottom:7px; }
.source-item .lean { font-style:italic; }
.footer { margin-top:16px; font-size:8pt; color:var(--muted); text-align:center; }`;
}

/**
 * @param {object} data
 * @param {string} data.objectionEn   the relative's concern, in their words (English)
 * @param {string} data.objectionUr   the same concern in Urdu
 * @param {string} data.bodyEn        the composed English note (LLM or fallback)
 * @param {string} data.bodyUr        the composed Urdu note
 * @param {string} data.invitationEn  the single concrete invitation (English)
 * @param {string} data.invitationUr  the single concrete invitation (Urdu)
 * @param {Array<{claim:string, source:string, lean_flag:string}>} data.evidence
 *        ONLY the matched objection's evidence entries — never the whole library.
 * @param {string} [data.generatedOn] display date
 * @returns {string} full HTML document
 */
function renderGrandparentBridgeHtml(data) {
  const a = ensureAssets();
  const logo = a.logo
    ? `<img class="header-logo" src="data:image/png;base64,${a.logo}" alt="" />`
    : '';

  const paragraphs = (text) => String(text || '')
    .split(/\n{2,}/)
    .filter((p) => p.trim())
    .map((p) => `<p class="body-text">${escapeHtml(p.trim())}</p>`)
    .join('');

  const sources = (data.evidence || []).map((e) => `
    <div class="source-item">
      ${escapeHtml(e.claim)}<br />
      ${escapeHtml(e.source)}<br />
      <span class="lean">Evidence quality: ${escapeHtml(e.lean_flag)}</span>
    </div>`).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8" /><title>Because you care</title><style>${buildStyles(a)}</style></head>
<body>
  <div class="header">
    ${logo}
    <div>
      <div class="title">Because you care</div>
      <div class="subtitle">A note about our child's learning · ہمارے بچے کی پڑھائی کے بارے میں</div>
    </div>
  </div>
  <hr class="rule" />

  <div class="pane">
    <div class="quote">
      <div class="quote-label">What you asked</div>
      ${escapeHtml(data.objectionEn)}
    </div>
    ${paragraphs(data.bodyEn)}
    <div class="invite">${escapeHtml(data.invitationEn)}</div>
  </div>

  <div class="pane ur">
    <div class="quote">
      <div class="quote-label">آپ کا سوال</div>
      ${escapeHtml(data.objectionUr)}
    </div>
    ${paragraphs(data.bodyUr)}
    <div class="invite">${escapeHtml(data.invitationUr)}</div>
  </div>

  <hr class="rule" />
  <div class="sources">
    <div class="sources-head">What we are going on — and how strong it is</div>
    ${sources}
  </div>
  <div class="footer">Prepared with Rumi${data.generatedOn ? ` · ${escapeHtml(data.generatedOn)}` : ''}</div>
</body>
</html>`;
}

module.exports = { renderGrandparentBridgeHtml, escapeHtml };
