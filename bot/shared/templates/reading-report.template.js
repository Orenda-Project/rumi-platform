/**
 * Reading-assessment HTML report template.
 *
 * Rendered to PDF via Playwright/Chromium (see shared/utils/html-to-pdf.js),
 * which has HarfBuzz, so Urdu Nastaliq + RTL bidi shape correctly. The PDFKit
 * renderer in reading/report.service.js is kept as an automatic fallback.
 *
 * Public API:
 *   renderReadingReportHtml(reportData) → string  (full HTML doc)
 *
 * Conditional sections (gated explicitly):
 *   - Pronunciation Errors + Pronunciation Assessment: only when
 *     language='en' AND pronunciation_data is present
 *   - Comprehension Assessment: only when comprehension is present
 *   - Words passage layout: when passageType='words'
 *
 * The subtitle reflects whether comprehension was tested:
 *   - fluency-only:          "Student Reading Fluency Evaluation powered by Rumi"
 *   - fluency+comprehension: "Student Reading Fluency & Comprehension Evaluation powered by Rumi"
 */

const fs = require('fs');
const path = require('path');

const FONT_DIR = path.join(__dirname, '..', 'fonts');
const ASSETS_DIR = path.join(__dirname, '..', 'assets');

// ─── Asset loading (cached) ──────────────────────────────────────────
function b64(p) {
  try { return fs.readFileSync(p).toString('base64'); }
  catch { return null; }
}

let _fontCache;
function getFonts() {
  if (_fontCache) return _fontCache;
  _fontCache = {
    lexendRegular: b64(path.join(FONT_DIR, 'Lexend-Regular.ttf')),
    lexendBold: b64(path.join(FONT_DIR, 'Lexend-Bold.ttf')),
    nastaliqRegular: b64(path.join(FONT_DIR, 'NotoNastaliqUrdu-Regular.ttf')),
    nastaliqBold: b64(path.join(FONT_DIR, 'NotoNastaliqUrdu-Bold.ttf')),
  };
  return _fontCache;
}

let _logoCache;
function getLogo() {
  if (_logoCache !== undefined) return _logoCache;
  _logoCache = b64(path.join(ASSETS_DIR, 'Rumi Transparent.png'));
  return _logoCache;
}

// ─── Formatting helpers ──────────────────────────────────────────────
function fmtTime(seconds) {
  const m = Math.floor((seconds || 0) / 60);
  const s = Math.floor((seconds || 0) % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function fmtDate(iso) {
  const d = iso ? new Date(iso) : new Date();
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
}

function ordinal(n) {
  if (typeof n !== 'number') return n;
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function getPerformanceLevel(onTrack, percentileRank) {
  // Handles numeric percentileRank (1-95) from the benchmark-status function.
  //
  // Tier rules (consistent with the "On Track" Status badge underneath):
  //   percentile >= 75 ........... Excellent (top quartile, far above)
  //   onTrack && percentile >= 50  Proficient (meets grade expectation)
  //   onTrack ................... Developing (in band but lower half)
  //   else ...................... Emerging (below benchmark)
  //
  // Legacy string percentileRank ('above'/'at'/'below') still accepted.
  if (typeof percentileRank === 'string') {
    if (percentileRank === 'above') return { label: 'Excellent', color: '#16a34a' };
    if (onTrack && percentileRank === 'at') return { label: 'Proficient', color: '#2563eb' };
    if (onTrack && percentileRank === 'below') return { label: 'Developing', color: '#f59e0b' };
    return { label: 'Emerging', color: '#ef4444' };
  }
  const p = typeof percentileRank === 'number' ? percentileRank : 0;
  if (p >= 75) return { label: 'Excellent', color: '#16a34a' };
  if (onTrack && p >= 50) return { label: 'Proficient', color: '#2563eb' };
  if (onTrack) return { label: 'Developing', color: '#f59e0b' };
  return { label: 'Emerging', color: '#ef4444' };
}

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ─── Section renderers ───────────────────────────────────────────────

function renderHeader(data, logoB64) {
  const wcpmInt = Math.round(data.wcpm || 0);
  const performance = getPerformanceLevel(data.benchmark?.onTrack, data.benchmark?.percentileRank);
  // Subtitle reflects whether comprehension was tested.
  const subtitle = data.comprehension
    ? 'Student Reading Fluency &amp; Comprehension Evaluation powered by Rumi'
    : 'Student Reading Fluency Evaluation powered by Rumi';
  return `
<div class="header">
  <div class="header-left">
    ${logoB64 ? `<img src="data:image/png;base64,${logoB64}" alt="Rumi" class="header-logo">` : ''}
    <div class="header-text-block">
      <div class="header-title">Reading Assessment</div>
      <div class="header-subtitle">${subtitle}</div>
    </div>
  </div>
  <div class="header-right">
    <div class="header-wcpm-num">${wcpmInt}</div>
    <div class="header-wcpm-label">WCPM</div>
    <div class="header-perf" style="color: ${performance.color}">${performance.label}</div>
  </div>
</div>
<hr class="header-rule">`;
}

function renderStudentInfo(data) {
  const langLabel = data.language === 'ur' ? 'Urdu' : 'English';
  const passageType = (data.passageType || 'story').replace(/^./, (c) => c.toUpperCase());
  const reportDate = fmtDate(data.completedAt);
  return `
<div class="card">
  <div class="grid-3">
    <div><div class="label">Student</div><div class="value">${escapeHtml(data.studentIdentifier || '—')}</div></div>
    <div><div class="label">Date</div><div class="value">${reportDate}</div></div>
    <div></div>
    <div><div class="label">Grade Level</div><div class="value">Grade ${data.gradeLevel}</div></div>
    <div><div class="label">Language</div><div class="value">${langLabel}</div></div>
    <div><div class="label">Passage Type</div><div class="value">${passageType}</div></div>
    <div><div class="label">Teacher</div><div class="value">${escapeHtml(data.teacherName || '—')}</div></div>
  </div>
</div>`;
}

function renderPassage(data) {
  const isUrdu = data.language === 'ur';
  if (data.passageType === 'words') {
    const words = (data.passageText || '').split(/[\s\n،,]+/).filter(Boolean);
    return `
<div class="section-heading">Reading Passage</div>
<div class="card">
  <div class="passage passage-words" ${isUrdu ? 'lang="ur"' : ''}>
    ${words.map((w) => `<span class="passage-word">${escapeHtml(w)}</span>`).join('')}
  </div>
</div>`;
  }
  return `
<div class="section-heading">Reading Passage</div>
<div class="card">
  <div class="passage" ${isUrdu ? 'lang="ur"' : ''}>${escapeHtml(data.passageText || '')}</div>
</div>`;
}

function renderFluencyMetrics(data) {
  const accuracyPct = Math.round(data.accuracy || 0);
  const onTrack = data.benchmark?.onTrack;
  const barColor = onTrack ? 'var(--excellent)' : 'var(--emerging)';
  return `
<div class="section-heading">Fluency Metrics</div>
<div class="card">
  <div class="grid-3">
    <div><div class="label">Words Correct Per Minute (WCPM)</div><div class="fluency-bignum">${(data.wcpm || 0).toFixed(1)}</div></div>
    <div><div class="label">Accuracy</div><div class="fluency-pct">${accuracyPct}%</div></div>
    <div><div class="label">Time Elapsed</div><div class="fluency-time">${fmtTime(data.timeElapsed)}</div></div>
  </div>
  <div class="bar-wrap"><div class="bar-fill" style="width:${accuracyPct}%;background:${barColor}"></div></div>
  <div class="fluency-foot">${data.wordsCorrect || 0} correct / ${data.totalWords || 0} total words</div>
</div>`;
}

function renderBenchmark(data) {
  const b = data.benchmark || {};
  // Accept both shapes — analysis service feeds {benchmarkMin, benchmarkMax},
  // the legacy PDFKit branch fed {min, max}.
  const min = b.benchmarkMin != null ? b.benchmarkMin : (b.min != null ? b.min : '—');
  const max = b.benchmarkMax != null ? b.benchmarkMax : (b.max != null ? b.max : '—');
  const pctStr = typeof b.percentileRank === 'number' ? `${ordinal(b.percentileRank)} percentile` : (b.percentileRank || '—');
  return `
<div class="section-heading">Grade-Level Benchmark</div>
<div class="card">
  <div class="grid-2" style="margin-bottom:8px">
    <div><div class="label">Benchmark Range</div><div class="benchmark-range">${min}-${max} WCPM</div></div>
    <div><div class="label">Status</div><div class="benchmark-status" style="color:${b.onTrack ? 'var(--excellent)' : 'var(--emerging)'}">${b.onTrack ? 'On Track' : 'Below Benchmark'}</div></div>
  </div>
  <div><div class="label">Percentile</div><div class="benchmark-pct">${pctStr}</div></div>
  ${data.isSecondLanguage ? '<div class="benchmark-foot">* Benchmarks adjusted for second language (L2) learners</div>' : ''}
</div>`;
}

function renderErrors(data) {
  const errors = data.errors || [];
  if (errors.length === 0) {
    return `
<div class="section-heading">Error Analysis</div>
<div class="card">
  <div class="grid-4">
    <div><div class="label">Total Errors</div><div class="errors-bignum">0</div></div>
    <div><div class="label">Omissions</div><div class="errors-num">0</div></div>
    <div><div class="label">Insertions</div><div class="errors-num">0</div></div>
    <div><div class="label">Substitutions</div><div class="errors-num">0</div></div>
  </div>
</div>`;
  }
  const omissions = errors.filter((e) => e.type === 'omission').length;
  const insertions = errors.filter((e) => e.type === 'insertion').length;
  const substitutions = errors.filter((e) => e.type === 'substitution').length;
  const total = errors.length;
  const isUrdu = data.language === 'ur';
  const examples = errors.slice(0, 4).map((e) => {
    const verb = e.type === 'insertion' ? 'Inserted' : e.type === 'omission' ? 'Omitted' : 'Substituted';
    return { verb, word: e.word };
  });

  return `
<div class="section-heading">Error Analysis</div>
<div class="card">
  <div class="grid-4">
    <div><div class="label">Total Errors</div><div class="errors-bignum">${total}</div></div>
    <div><div class="label">Omissions</div><div class="errors-num">${omissions}</div></div>
    <div><div class="label">Insertions</div><div class="errors-num">${insertions}</div></div>
    <div><div class="label">Substitutions</div><div class="errors-num">${substitutions}</div></div>
  </div>
  <div class="label" style="margin-top:14px">Error Examples</div>
  <ul class="errors-list">
    ${examples.map((e) => isUrdu
      ? `<li>${e.verb}: "<span class="ur-word">${escapeHtml(e.word)}</span>"</li>`
      : `<li>${e.verb}: "${escapeHtml(e.word)}"</li>`
    ).join('')}
  </ul>
</div>`;
}

function renderPronunciation(data) {
  if (data.language !== 'en') return '';

  const mispron = data.mispronunciations || [];
  const mispronCount = data.mispronunciationCount != null ? data.mispronunciationCount : mispron.length;
  const pron = data.pronunciation?.pronunciationData;

  if (mispron.length === 0 && !pron) return '';

  let html = '';

  // ── Pronunciation Errors ────────────────────────────────────────
  if (mispron.length > 0) {
    const topErrors = mispron.slice(0, 5);
    const moreCount = Math.max(0, mispronCount - topErrors.length);
    html += `
<div class="section-heading">Pronunciation Errors</div>
<div class="card">
  <div><div class="label">Mispronounced Words</div>
    <div class="errors-bignum">${mispronCount}</div></div>
  <div class="label" style="margin-top:14px">Top Pronunciation Errors (with phoneme breakdowns)</div>
  <div class="pron-error-list">
    ${topErrors.map((e) => `
      <div class="pron-error-row">
        <span class="pron-error-word">"${escapeHtml(e.word)}"</span>
        <span class="pron-error-acc">${e.accuracyScore != null ? Math.round(e.accuracyScore) : 0}% accuracy</span>
      </div>
    `).join('')}
  </div>
  ${moreCount > 0 ? `<div class="pron-error-foot">…and ${moreCount} more pronunciation errors</div>` : ''}
</div>`;
  }

  // ── Pronunciation Assessment ────────────────────────────────────
  if (pron) {
    html += `
<div class="section-heading">Pronunciation Assessment</div>
<div class="card">
  <div class="grid-3">
    <div><div class="label">Pronunciation</div><div class="pron-pct">${Math.round(pron.pronunciationScore || 0)}%</div></div>
    <div><div class="label">Fluency</div><div class="pron-pct">${Math.round(pron.fluencyScore || 0)}%</div></div>
    <div><div class="label">Completeness</div><div class="pron-pct">${Math.round(pron.completenessScore || 0)}%</div></div>
  </div>
  ${pron.prosodyScore != null ? `
    <div style="margin-top:12px">
      <div class="label">Prosody</div>
      <div class="pron-pct-small">${Math.round(pron.prosodyScore)}%</div>
    </div>
  ` : ''}
</div>`;
  }

  return html;
}

function renderComprehension(data) {
  const comp = data.comprehension;
  if (!comp) return '';

  const isUrdu = data.language === 'ur';
  const score = Math.round(comp.score || 0);
  const correct = comp.correctAnswers != null
    ? comp.correctAnswers
    : (comp.answers || []).filter((a) => a.correct).length;
  const total = comp.totalQuestions != null
    ? comp.totalQuestions
    : (comp.answers || []).length;
  const status = comp.benchmarkStatus || { label: '—', color: 'var(--secondary)', description: '' };

  const answers = comp.answers || [];
  const questions = comp.questions || [];
  const limited = answers.slice(0, 5);

  return `
<div class="section-heading">Comprehension Assessment</div>
<div class="card">
  <div class="grid-2 comp-header" style="margin-bottom:14px">
    <div>
      <div class="label">Questions Correct</div>
      <div class="comp-bignum">${correct}/${total}</div>
      <div class="comp-pct">${score}%</div>
    </div>
    <div>
      <div class="label">Benchmark Status</div>
      <div class="comp-status" style="color:${status.color}">${escapeHtml(status.label)}</div>
      <div class="comp-status-sub">${escapeHtml(status.description || '')}</div>
    </div>
  </div>
  <div class="comp-breakdown-heading">Question Breakdown:</div>
  ${limited.map((ans, i) => {
    const q = questions[i] || {};
    const icon = ans.correct ? '✓' : '✗';
    const iconColor = ans.correct ? 'var(--excellent)' : 'var(--emerging)';
    const studentColor = ans.correct ? 'var(--excellent)' : 'var(--emerging)';
    const qText = q.question || ans.question || '';
    const qType = q.type || ans.questionType || 'literal';
    const studentAns = ans.studentAnswer || ans.answer || '—';
    const expected = q.expected_answer || '';
    return `
      <div class="comp-q-row">
        <div class="comp-q-line">
          <span class="comp-icon" style="color:${iconColor}">${icon}</span>
          <span class="comp-q-num">Q${i + 1}</span>
          <span class="comp-q-type">(${escapeHtml(qType)})</span>:
          <span class="comp-q-text" ${isUrdu ? 'lang="ur"' : ''}>${escapeHtml(qText)}</span>
        </div>
        <div class="comp-student" style="color:${studentColor}">Student: ${escapeHtml(studentAns)}</div>
        ${expected ? `<div class="comp-expected">Expected: ${escapeHtml(expected)}</div>` : ''}
      </div>`;
  }).join('')}
</div>`;
}

function renderDiagnostic(data) {
  const isUrdu = data.language === 'ur';
  const text = data.diagnosticSummary || '—';
  return `
<div class="section-heading">Diagnostic Summary &amp; Recommendations</div>
<div class="card">
  <div class="diag" ${isUrdu ? 'lang="ur"' : ''}>${escapeHtml(text)}</div>
</div>`;
}

function renderFooter(data) {
  const reportDate = fmtDate(data.completedAt);
  return `<div class="footer">Generated by Rumi • Supporting teachers everywhere • ${reportDate}</div>`;
}

// ─── Stylesheet ──────────────────────────────────────────────────────
function buildStyles(fonts) {
  return `
@font-face { font-family:'Lexend'; font-weight:400; src:url(data:font/ttf;base64,${fonts.lexendRegular}) format('truetype'); }
@font-face { font-family:'Lexend'; font-weight:700; src:url(data:font/ttf;base64,${fonts.lexendBold}) format('truetype'); }
@font-face { font-family:'Noto Nastaliq Urdu'; font-weight:400; src:url(data:font/ttf;base64,${fonts.nastaliqRegular}) format('truetype'); }
@font-face { font-family:'Noto Nastaliq Urdu'; font-weight:700; src:url(data:font/ttf;base64,${fonts.nastaliqBold}) format('truetype'); }

:root { --primary:#1e3a5f; --secondary:#64748b; --background:#f8fafc; --border:#e2e8f0; --excellent:#16a34a; --proficient:#2563eb; --developing:#f59e0b; --emerging:#ef4444; }
* { box-sizing:border-box; margin:0; padding:0; }
html, body { font-family:'Lexend', sans-serif; font-size:10pt; color:#000; background:#fff; -webkit-print-color-adjust:exact; print-color-adjust:exact; line-height:1.5; }
@page { size:A4; margin:50px 50px; }

.header { display:flex; justify-content:space-between; align-items:center; padding-bottom:16px; }
.header-left { display:flex; align-items:center; gap:14px; }
.header-logo { width:60px; height:auto; display:block; flex-shrink:0; }
.header-text-block { display:flex; flex-direction:column; }
.header-title { font-size:24pt; font-weight:700; color:var(--primary); line-height:1.1; }
.header-subtitle { font-size:10pt; color:var(--secondary); margin-top:4px; }
.header-right { text-align:right; }
.header-wcpm-num { font-size:32pt; font-weight:700; color:var(--primary); line-height:1; }
.header-wcpm-label { font-size:8pt; color:var(--secondary); letter-spacing:0.05em; margin-top:4px; }
.header-perf { font-size:10pt; font-weight:700; margin-top:2px; }
.header-rule { border:0; border-top:1px solid var(--border); margin:12px 0 20px 0; }

.card { background:var(--background); border:1px solid var(--border); border-radius:8px; padding:16px 18px; margin-bottom:18px; }
.section-heading { font-size:14pt; font-weight:700; color:var(--primary); margin:4px 0 10px 0; }
.label { font-size:8pt; color:var(--secondary); letter-spacing:0.05em; text-transform:uppercase; margin-bottom:4px; }
.value { font-size:10pt; color:#000; line-height:1.3; }

.grid-3 { display:grid; grid-template-columns:repeat(3, 1fr); gap:12px 24px; }
.grid-4 { display:grid; grid-template-columns:repeat(4, 1fr); gap:12px 24px; }
.grid-2 { display:grid; grid-template-columns:1fr 1fr; gap:12px 24px; }

.passage { font-size:11pt; line-height:1.9; }
.passage[lang="ur"] { font-family:'Noto Nastaliq Urdu', serif; direction:rtl; text-align:right; unicode-bidi:plaintext; font-size:13pt; line-height:2.4; }
.passage-words { display:grid; grid-template-columns:repeat(2, 1fr); gap:8px 32px; padding:8px 0; font-size:14pt; }
.passage-words[lang="ur"] { font-family:'Noto Nastaliq Urdu', serif; direction:rtl; text-align:center; font-size:14pt; }
.passage-word { padding:4px 0; }

.fluency-bignum { font-size:20pt; font-weight:700; color:#000; line-height:1; }
.fluency-pct { font-size:16pt; font-weight:700; color:#000; line-height:1; }
.fluency-time { font-size:16pt; font-weight:700; color:#000; line-height:1; }
.bar-wrap { background:var(--border); border-radius:4px; height:6px; margin-top:12px; }
.bar-fill { background:var(--excellent); height:100%; border-radius:4px; }
.fluency-foot { font-size:8pt; color:var(--secondary); margin-top:6px; }

.benchmark-range { font-size:14pt; font-weight:700; color:#000; line-height:1.1; }
.benchmark-status { font-size:14pt; font-weight:700; line-height:1.1; }
.benchmark-pct { font-size:10pt; color:#000; }
.benchmark-foot { font-size:7pt; color:var(--secondary); font-style:italic; margin-top:6px; }

.errors-bignum { font-size:24pt; font-weight:700; color:var(--emerging); line-height:1; }
.errors-num { font-size:18pt; font-weight:400; color:#000; line-height:1; }
.errors-list { margin-top:12px; padding-left:0; list-style:none; }
.errors-list li { font-size:9pt; color:var(--secondary); margin:2px 0; }
.errors-list li::before { content:"\\2022 "; color:var(--secondary); }
.errors-list .ur-word { font-family:'Noto Nastaliq Urdu', serif; unicode-bidi:isolate; direction:rtl; }

.pron-error-list { margin-top:8px; }
.pron-error-row { display:flex; align-items:baseline; gap:24px; padding:6px 0; border-bottom:1px solid var(--border); }
.pron-error-row:last-child { border-bottom:none; }
.pron-error-word { font-size:11pt; font-weight:700; color:#000; min-width:120px; }
.pron-error-acc { font-size:10pt; color:var(--emerging); }
.pron-error-foot { font-size:8pt; color:var(--secondary); font-style:italic; margin-top:8px; }
.pron-pct { font-size:18pt; font-weight:700; color:#000; line-height:1; }
.pron-pct-small { font-size:14pt; font-weight:400; color:#000; line-height:1; }

.comp-bignum { font-size:24pt; font-weight:700; color:#000; line-height:1; }
.comp-pct { font-size:10pt; color:var(--secondary); margin-top:4px; }
.comp-status { font-size:14pt; font-weight:700; line-height:1.1; }
.comp-status-sub { font-size:9pt; color:var(--secondary); margin-top:4px; line-height:1.3; }
.comp-breakdown-heading { font-size:10pt; font-weight:700; color:var(--secondary); margin:14px 0 8px 0; }
.comp-q-row { margin:10px 0; padding-bottom:8px; border-bottom:1px solid var(--border); }
.comp-q-row:last-child { border-bottom:none; }
.comp-q-line { font-size:9.5pt; color:#000; line-height:1.5; }
.comp-icon { font-weight:700; margin-right:6px; }
.comp-q-num { font-weight:700; }
.comp-q-type { font-size:8.5pt; color:var(--secondary); margin-left:2px; }
.comp-q-text[lang="ur"] { font-family:'Noto Nastaliq Urdu', serif; unicode-bidi:isolate; direction:rtl; }
.comp-student { font-size:9pt; margin-top:4px; }
.comp-expected { font-size:8.5pt; color:var(--secondary); margin-top:2px; }

.diag { font-size:10pt; line-height:1.6; }
.diag[lang="ur"] { font-family:'Noto Nastaliq Urdu', serif; direction:rtl; text-align:right; unicode-bidi:plaintext; font-size:12pt; line-height:2.2; }

.footer { text-align:center; font-size:8pt; color:var(--secondary); margin-top:24px; }
.page-break { page-break-before:always; }`;
}

// ─── Public API ──────────────────────────────────────────────────────
function renderReadingReportHtml(reportData) {
  const fonts = getFonts();
  const logo = getLogo();

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Reading Assessment — ${escapeHtml(reportData.studentIdentifier || '')}</title>
<style>${buildStyles(fonts)}</style>
</head>
<body>
${renderHeader(reportData, logo)}
${renderStudentInfo(reportData)}
${renderPassage(reportData)}
${renderFluencyMetrics(reportData)}
${renderBenchmark(reportData)}
${renderErrors(reportData)}
${renderPronunciation(reportData)}
${renderComprehension(reportData)}
${renderDiagnostic(reportData)}
${renderFooter(reportData)}
</body>
</html>`;
}

module.exports = renderReadingReportHtml;
