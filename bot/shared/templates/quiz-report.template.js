'use strict';
/**
 * Quiz Report HTML Template —
 *
 * Renders the 12-hour quiz report PDF for the teacher. Uses the same
 * shared/utils/html-to-pdf.js engine as UGLP. When the Playwright migration
 * lands, this template inherits Playwright transparently — no
 * change here required.
 *
 * Design is intentionally close to coaching/reading reports for visual
 * consistency in the teacher's portfolio: Lexend body, Nastaliq for Urdu,
 * card-based sections, Rumi logo header.
 */

const fs = require('fs');
const path = require('path');

// Lazy-load font + logo bytes once per process
let _logoB64 = null;
let _lexendRegB64 = null;
let _lexendBoldB64 = null;
let _nastaliqRegB64 = null;
let _nastaliqBoldB64 = null;

function readBase64(relPath) {
  const abs = path.join(__dirname, '..', relPath);
  if (!fs.existsSync(abs)) return null;
  return fs.readFileSync(abs).toString('base64');
}

function ensureAssets() {
  if (_logoB64 === null) {
    _logoB64 = readBase64('assets/Rumi Transparent.png') || '';
    _lexendRegB64 = readBase64('fonts/Lexend-Regular.ttf') || '';
    _lexendBoldB64 = readBase64('fonts/Lexend-Bold.ttf') || '';
    _nastaliqRegB64 = readBase64('fonts/NotoNastaliqUrdu-Regular.ttf') || '';
    _nastaliqBoldB64 = readBase64('fonts/NotoNastaliqUrdu-Bold.ttf') || '';
  }
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

function masteryBadge(level) {
  if (level === 'mastered') return { color: '#16a34a', bg: '#dcfce7', label: 'Mastered' };
  if (level === 'developing') return { color: '#ca8a04', bg: '#fef9c3', label: 'Developing' };
  if (level === 'needs_practice') return { color: '#dc2626', bg: '#fee2e2', label: 'Needs Practice' };
  return { color: '#6b7280', bg: '#f3f4f6', label: 'Not Started' };
}

function pctBar(pct, color) {
  const safe = Math.max(0, Math.min(100, Math.round(pct || 0)));
  return `
    <div class="bar-track">
      <div class="bar-fill" style="width:${safe}%; background:${color};"></div>
    </div>`;
}

/**
 * @param {Object} reportData
 * @param {Object}   reportData.quiz       - { topic, grade, subject, created_at }
 * @param {string}   reportData.classDisplay - "5 - A"
 * @param {string}   reportData.teacherName
 * @param {number}   reportData.totalSent
 * @param {number}   reportData.totalCompleted
 * @param {Object}   reportData.stats      - { avgScore, masteredCount, developingCount, needsPracticeCount }
 * @param {Array}    reportData.sessions   - completed quiz_sessions with student_name
 * @param {Array=}   reportData.topMissed  - [{ question_text, correct_count, total }]
 * @param {string=}  reportData.insight    - LLM-generated 1-2 sentence teacher insight
 * @param {string=}  reportData.language   - 'en' | 'ur' (currently English-only template)
 * @returns {string} HTML
 */
function renderQuizReportHtml(reportData) {
  ensureAssets();

  const {
    quiz = {},
    classDisplay = '',
    teacherName = '',
    totalSent = 0,
    totalCompleted = 0,
    stats = {},
    sessions = [],
    topMissed = [],
    allQuestions = [],
    insight = ''
  } = reportData || {};

  const dateStr = new Date().toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric' });
  const completionPct = totalSent > 0 ? Math.round((totalCompleted / totalSent) * 100) : 0;
  const avgScore = stats.avgScore || 0;

  // Sort sessions by score desc so the report leads with successes
  const sortedSessions = [...sessions].sort((a, b) => {
    const ap = a.total_questions_answered ? (a.correct_answers || 0) / a.total_questions_answered : 0;
    const bp = b.total_questions_answered ? (b.correct_answers || 0) / b.total_questions_answered : 0;
    return bp - ap;
  });

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Quiz Report — ${escapeHtml(quiz.topic || '')}</title>
<style>
  @font-face { font-family: 'Lexend'; src: url(data:font/ttf;base64,${_lexendRegB64}) format('truetype'); font-weight: 400; }
  @font-face { font-family: 'Lexend'; src: url(data:font/ttf;base64,${_lexendBoldB64}) format('truetype'); font-weight: 700; }
  @font-face { font-family: 'Noto Nastaliq Urdu'; src: url(data:font/ttf;base64,${_nastaliqRegB64}) format('truetype'); font-weight: 400; }
  @font-face { font-family: 'Noto Nastaliq Urdu'; src: url(data:font/ttf;base64,${_nastaliqBoldB64}) format('truetype'); font-weight: 700; }

  :root {
    --ink:#111827; --muted:#6b7280; --line:#e5e7eb; --bg:#f9fafb;
    --excellent:#16a34a; --developing:#ca8a04; --emerging:#dc2626;
    --rumi-blue:#2563eb;
  }
  * { box-sizing: border-box; }
  html, body { margin:0; padding:0; }
  body {
    font-family: 'Lexend', -apple-system, system-ui, sans-serif;
    color: var(--ink);
    font-size: 11pt;
    line-height: 1.45;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .page { padding: 36px 48px 56px; }

  /* Header */
  header { display:flex; align-items:center; gap:16px; padding-bottom:16px; border-bottom:2px solid var(--line); margin-bottom:24px; }
  .header-logo { width:56px; height:56px; object-fit:contain; }
  header h1 { margin:0; font-size:20pt; font-weight:700; letter-spacing:-0.01em; }
  header .subtitle { margin:2px 0 0; color:var(--muted); font-size:10pt; }

  /* Cards */
  .card { background: var(--bg); border:1px solid var(--line); border-radius:8px; padding:16px 18px; margin-bottom:16px; }
  .section-heading { font-size:13pt; font-weight:700; margin: 22px 0 8px; }
  .label { font-size:9pt; color:var(--muted); text-transform:uppercase; letter-spacing:0.04em; font-weight:700; }
  .value { font-size:12pt; font-weight:500; }

  /* Info grid */
  .info-grid { display:grid; grid-template-columns: repeat(3, 1fr); gap:14px 24px; }

  /* Stats row */
  .stats-grid { display:grid; grid-template-columns: repeat(4, 1fr); gap:12px; }
  .stat { background:#fff; border:1px solid var(--line); border-radius:8px; padding:12px 14px; }
  .stat .num { font-size:20pt; font-weight:700; line-height:1.1; margin-top:4px; }
  .stat .num.green { color: var(--excellent); }
  .stat .num.amber { color: var(--developing); }
  .stat .num.red   { color: var(--emerging); }

  /* Bar */
  .bar-track { position:relative; height:8px; background:#e5e7eb; border-radius:4px; overflow:hidden; }
  .bar-fill { position:absolute; left:0; top:0; bottom:0; border-radius:4px; }

  /* Student rows */
  table.students { width:100%; border-collapse: collapse; }
  table.students th, table.students td { text-align:left; padding:8px 6px; border-bottom:1px solid var(--line); font-size:10.5pt; }
  table.students th { color:var(--muted); font-size:9pt; text-transform:uppercase; letter-spacing:0.04em; }
  table.students td.score { font-weight:700; }
  table.students td .badge { display:inline-block; padding:2px 8px; border-radius:999px; font-size:9pt; font-weight:600; }

  /* Insight callout */
  .insight { background:#eff6ff; border:1px solid #bfdbfe; border-radius:8px; padding:14px 16px; }
  .insight .label { color:var(--rumi-blue); }
  .insight p { margin:6px 0 0; font-size:11pt; line-height:1.55; }

  /* Top missed */
  .missed-row { padding:10px 0; border-bottom:1px solid var(--line); }
  .missed-row:last-child { border-bottom:none; }
  .missed-q { font-weight:600; margin:0 0 4px; }
  .missed-meta { font-size:9.5pt; color:var(--muted); }

  /* All questions list */
  .all-q { padding:14px 0; border-bottom:1px solid var(--line); page-break-inside: avoid; }
  .all-q:last-child { border-bottom:none; }
  .all-q-text { font-weight:600; margin:0 0 8px; font-size:11pt; }
  .all-opts { display:flex; flex-direction:column; gap:5px; margin:6px 0 8px; }
  .all-opt { display:flex; gap:8px; align-items:flex-start; padding:6px 10px; border-radius:5px; background:#f9fafb; font-size:10pt; }
  .all-opt.correct { background:#dcfce7; border:1px solid #86efac; }
  .all-opt-letter { font-weight:700; min-width:14px; color:var(--muted); }
  .all-opt.correct .all-opt-letter { color:#16a34a; }
  .all-opt-text { flex:1; }
  .all-opt-meta { font-size:9pt; color:var(--muted); white-space:nowrap; }
  .all-opt.correct .all-opt-meta { color:#16a34a; font-weight:600; }
  .all-q-meta { font-size:9.5pt; color:var(--muted); margin-top:4px; }

  /* Footer */
  footer { margin-top:36px; padding-top:14px; border-top:1px solid var(--line); color:var(--muted); font-size:9pt; }

  /* RTL helper for Urdu fragments */
  [lang="ur"] { font-family: 'Noto Nastaliq Urdu', 'Lexend', serif; direction:rtl; text-align:right; }

  @page { size: A4; margin: 0; }
</style>
</head>
<body>
<div class="page">
  <header>
    ${_logoB64 ? `<img class="header-logo" src="data:image/png;base64,${_logoB64}" alt="Rumi">` : ''}
    <div>
      <h1>Quiz Report</h1>
      <p class="subtitle">${escapeHtml(quiz.topic || '')} ${classDisplay ? `— ${escapeHtml(classDisplay)}` : ''}</p>
    </div>
  </header>

  <div class="card">
    <div class="info-grid">
      <div><div class="label">Topic</div><div class="value">${escapeHtml(quiz.topic || '—')}</div></div>
      <div><div class="label">Class</div><div class="value">${escapeHtml(classDisplay || '—')}</div></div>
      <div><div class="label">Date</div><div class="value">${escapeHtml(dateStr)}</div></div>
      ${quiz.subject ? `<div><div class="label">Subject</div><div class="value">${escapeHtml(quiz.subject)}</div></div>` : ''}
      ${teacherName ? `<div><div class="label">Teacher</div><div class="value">${escapeHtml(teacherName)}</div></div>` : ''}
      ${quiz.grade ? `<div><div class="label">Grade</div><div class="value">${escapeHtml(String(quiz.grade))}</div></div>` : ''}
    </div>
  </div>

  <div class="section-heading">Results Summary</div>
  <div class="stats-grid">
    <div class="stat">
      <div class="label">Average Score</div>
      <div class="num ${avgScore >= 80 ? 'green' : avgScore >= 60 ? 'amber' : 'red'}">${avgScore}%</div>
      ${pctBar(avgScore, avgScore >= 80 ? 'var(--excellent)' : avgScore >= 60 ? 'var(--developing)' : 'var(--emerging)')}
    </div>
    <div class="stat">
      <div class="label">Completion</div>
      <div class="num">${totalCompleted}<span style="font-size:12pt;color:var(--muted);">/${totalSent}</span></div>
      ${pctBar(completionPct, 'var(--rumi-blue)')}
    </div>
    <div class="stat">
      <div class="label">Mastered</div>
      <div class="num green">${stats.masteredCount || 0}</div>
    </div>
    <div class="stat">
      <div class="label">Need Practice</div>
      <div class="num red">${stats.needsPracticeCount || 0}</div>
    </div>
  </div>

  ${insight ? `
  <div class="section-heading">Teaching Insight</div>
  <div class="insight">
    <div class="label">From Rumi</div>
    <p>${escapeHtml(insight)}</p>
  </div>` : ''}

  ${sortedSessions.length > 0 ? `
  <div class="section-heading">Student Results</div>
  <div class="card" style="padding:8px 18px;">
    <table class="students">
      <thead>
        <tr><th>Student</th><th>Score</th><th>%</th><th>Mastery</th></tr>
      </thead>
      <tbody>
        ${sortedSessions.map((s) => {
          const name = s.students?.student_name || s.student_name || 'Unknown';
          const correct = s.correct_answers || 0;
          const answered = s.total_questions_answered || 0;
          const pct = answered > 0 ? Math.round((correct / answered) * 100) : 0;
          const badge = masteryBadge(s.mastery_level);
          return `
            <tr>
              <td>${escapeHtml(name)}</td>
              <td class="score">${correct}/${answered}</td>
              <td class="score">${pct}%</td>
              <td><span class="badge" style="background:${badge.bg};color:${badge.color};">${badge.label}</span></td>
            </tr>`;
        }).join('')}
      </tbody>
    </table>
  </div>` : `
  <div class="section-heading">Student Results</div>
  <div class="card"><em>No students completed this quiz yet.</em></div>`}

  ${topMissed && topMissed.length > 0 ? `
  <div class="section-heading">Most Missed Questions</div>
  <div class="card">
    ${topMissed.map((m, i) => `
      <div class="missed-row">
        <p class="missed-q">${i + 1}. ${escapeHtml(m.question_text || '')}</p>
        <div class="missed-meta">${m.correct_count || 0} of ${m.total || 0} students answered correctly</div>
      </div>
    `).join('')}
  </div>` : ''}

  ${allQuestions && allQuestions.length > 0 ? `
  <div class="section-heading">All Questions</div>
  <div class="card">
    ${allQuestions.map((q) => {
      const opts = ['A', 'B', 'C'].map(opt => {
        const isCorrect = q.correct_option === opt;
        const picks = (q.pick_counts && q.pick_counts[opt]) || 0;
        const text = (q.options && q.options[opt]) || '';
        return `
          <div class="all-opt${isCorrect ? ' correct' : ''}">
            <span class="all-opt-letter">${opt}.</span>
            <span class="all-opt-text">${escapeHtml(text)}</span>
            <span class="all-opt-meta">${picks} pick${picks === 1 ? '' : 's'}${isCorrect ? ' · correct' : ''}</span>
          </div>`;
      }).join('');
      const pctText = q.percent_correct != null ? ` · ${q.percent_correct}%` : '';
      const corr = q.correct_count || 0;
      const tot = q.total_attempted || 0;
      // display_index is the 1-based array position post-filter.
      // Falls back to sort_order+1 if a caller hasn't migrated yet.
      const displayNum = q.display_index != null ? q.display_index : ((q.sort_order || 0) + 1);
      return `
        <div class="all-q">
          <p class="all-q-text">${displayNum}. ${escapeHtml(q.question_text || '')}</p>
          <div class="all-opts">${opts}</div>
          <div class="all-q-meta">${corr} of ${tot} answered correctly${pctText}</div>
        </div>`;
    }).join('')}
  </div>` : ''}

  <footer>
    Generated by Rumi · ${escapeHtml(dateStr)} · Quiz on ${escapeHtml(quiz.topic || '')}
  </footer>
</div>
</body>
</html>`;
}

module.exports = renderQuizReportHtml;
