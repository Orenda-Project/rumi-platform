/**
 * MEWAKA Report HTML Template
 *
 * Pure function: takes reportData (from mewaka-report-transformer) and
 * returns an HTML string suitable for Playwright htmlToPdf rendering.
 *
 * Visual target: ANNA_MEWAKA_v2.{html,pdf,png} sample report.
 *
 * Design decisions:
 *   - LTR Latin-script Swahili (no RTL, no Nastaliq fonts).
 *   - Inter font, loaded via Google Fonts <link> (Playwright caches it).
 *   - Inline SVG sparkline — no external image fetches (sample report's
 *     matplotlib chart is a development-time tool only; production renders
 *     the trend as a pure-SVG sparkline so Playwright doesn't need network).
 *   - A4 + 14mm margins matching the sample.
 *   - Layout: header → ▲ strength callout → ▼ focus area callout →
 *     6-domain scorecard with sparkline → footer.
 *   - Defensive against missing fields (focusArea null, strengths [],
 *     trend [], etc.) — partial GPT output should still render.
 *   - User-supplied content escaped against HTML injection.
 *
 * Bead:  (Tanzania Expansion Phase 8.C.1)
 */

// ─── HTML escape helper ─────────────────────────────────────────────

function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const E = escapeHtml;

// ─── Performance band → colors ───────────────────────────────────────

function bandStyle(band, percentage) {
  // Use band name if provided; otherwise derive from percentage.
  const b = band || (percentage >= 85 ? 'bora_sana'
                   : percentage >= 70 ? 'mwenye_uwezo'
                   : percentage >= 55 ? 'inakua'
                   : 'inajitokeza');
  const palette = {
    bora_sana:     { label: 'Bora sana',    color: '#2F855A', bg: '#F0FFF4', dark: '#22543D' },
    mwenye_uwezo:  { label: 'Mwenye uwezo', color: '#2B6CB0', bg: '#EBF4FF', dark: '#2A4365' },
    inakua:        { label: 'Inakua',       color: '#DD6B20', bg: '#FFF7ED', dark: '#9C4221' },
    inajitokeza:   { label: 'Inajitokeza',  color: '#C53030', bg: '#FFF5F5', dark: '#742A2A' },
  };
  return { key: b, ...(palette[b] || palette.inakua) };
}

// ─── Inline SVG sparkline ────────────────────────────────────────────
// Pure SVG, no fonts beyond the parent stylesheet, no network requests.

function renderSparkline(trend, { w = 600, h = 78 } = {}) {
  if (!trend || trend.length === 0) return '';
  // Wider left pad so the first dot + its value label clear the y-axis band
  // labels (55/70/85). Wider SVG (w=600) gives the line horizontal room.
  const pad = { left: 50, right: 40, top: 14, bottom: 20 };
  const innerW = w - pad.left - pad.right;
  const innerH = h - pad.top - pad.bottom;
  const xs = trend.map((_, i) => pad.left + (trend.length === 1 ? innerW / 2 : i * (innerW / (trend.length - 1))));
  const ys = trend.map(t => pad.top + (1 - Math.max(0, Math.min(100, t.pct)) / 100) * innerH);

  const pathD = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' ');

  // Band thresholds at 55 / 70 / 85 — labels sit in the now-wider left margin.
  const yFor = (pct) => pad.top + (1 - pct / 100) * innerH;
  const bandLines = [55, 70, 85].map(pct => `
    <line x1="${pad.left}" y1="${yFor(pct).toFixed(1)}" x2="${(w - pad.right).toFixed(1)}" y2="${yFor(pct).toFixed(1)}" stroke="#E2E8F0" stroke-width="0.6" stroke-dasharray="3,3"/>
    <text x="${(pad.left - 8).toFixed(1)}" y="${(yFor(pct) + 3).toFixed(1)}" font-size="8" fill="#A0AEC0" text-anchor="end">${pct}%</text>
  `).join('');

  const lastIdx = trend.length - 1;
  const isBookend = (i) => i === 0 || i === lastIdx;

  const dots = trend.map((t, i) => {
    const isLast = i === lastIdx;
    return `<circle cx="${xs[i].toFixed(1)}" cy="${ys[i].toFixed(1)}" r="${isLast ? 5 : 3.5}" fill="${isLast ? '#2F855A' : '#A0AEC0'}" stroke="white" stroke-width="${isLast ? 2 : 1.5}"/>`;
  }).join('');

  // x-axis date labels: ONLY on first + last (bookends), so they don't collide.
  const labels = trend.map((t, i) => {
    if (!isBookend(i)) return '';
    const lab = E(t.label || t.date || '');
    const anchor = i === 0 ? 'start' : 'end';
    return `<text x="${xs[i].toFixed(1)}" y="${(h - 5).toFixed(1)}" font-size="9" fill="#718096" text-anchor="${anchor}">${lab}</text>`;
  }).join('');

  // value labels: ONLY on first + last (bookends); middle points stay plain dots.
  const pcts = trend.map((t, i) => {
    if (!isBookend(i)) return '';
    const isLast = i === lastIdx;
    return `<text x="${xs[i].toFixed(1)}" y="${(ys[i] - 9).toFixed(1)}" font-size="${isLast ? 10 : 9}" font-weight="${isLast ? 700 : 500}" fill="${isLast ? '#2F855A' : '#4A5568'}" text-anchor="middle">${Math.round(t.pct)}%</text>`;
  }).join('');

  return `
    <svg width="100%" height="${h}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet" aria-label="Mwelekeo wa Jumla">
      ${bandLines}
      <path d="${pathD}" stroke="#718096" stroke-width="2" fill="none"/>
      ${dots}
      ${pcts}
      ${labels}
    </svg>
  `;
}

// ─── Domain scorecard row ────────────────────────────────────────────

function renderDomainRows(domains) {
  return domains.map(d => {
    const isFocus = d.percentage < 55;
    const color = isFocus ? '#DD6B20' : '#2F855A';
    return `
      <tr>
        <td class="dom-name"><strong>${E(d.name_sw)}</strong> <span class="dom-key">${E(d.key)}</span></td>
        <td class="dom-score">
          <span class="num" style="color:${color}">${d.score}/${d.max}</span>
          <span class="dom-pct">${d.percentage}%</span>
        </td>
        <td class="dom-bar">
          <div class="bar-track">
            <div class="bar-fill" style="width:${d.percentage}%; background:${color}"></div>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// ─── Strength callout ────────────────────────────────────────────────

function renderStrength(strength) {
  if (!strength) return '';
  return `
    <div class="callout callout-strength">
      <div class="callout-label">▲ Nguvu ya Leo</div>
      <div class="callout-title">${E(strength.titleSw)}</div>
      <div class="callout-body">${E(strength.evidenceSw)}</div>
      ${strength.anchorIndicator ? `<span class="anchor anchor-green">${E(strength.anchorIndicator)} · MEWAKA</span>` : ''}
    </div>
  `;
}

// ─── executive summary blurb ────────────────────────────────
//
// 1-line italic narrative below the header. No-op when the field is empty
// or missing. Preserves the operator-locked 1-page layout for sessions
// where GPT didn't emit this field.
function renderExecutiveSummary(summarySw) {
  if (!summarySw || typeof summarySw !== 'string' || summarySw.trim() === '') return '';
  return `
    <p class="exec-summary">${E(summarySw)}</p>
  `;
}

// ─── notable moments strip ──────────────────────────────────
//
// Compact "Vipindi Muhimu" section positioned between the focus area
// (and sparkline) and the scorecard. Up to 2 moments — beyond that the
// 1-page layout overflows. Each moment renders as `MM:SS — "quote"`.
// Section is entirely omitted when no moments are present.
const NOTABLE_MOMENTS_MAX = 2;

function renderNotableMoments(moments) {
  if (!Array.isArray(moments) || moments.length === 0) return '';
  const items = moments
    .slice(0, NOTABLE_MOMENTS_MAX)
    .map(m => {
      const ts = E(m.timestamp || '');
      const q = m.quoteSw || m.quote || '';
      return `
        <div class="moment">
          <span class="moment-ts">${ts}</span>
          ${q ? `<span class="moment-quote">${E(q)}</span>` : ''}
        </div>
      `;
    })
    .join('');
  return `
    <div class="section notable-moments">
      <h2>Vipindi Muhimu</h2>
      ${items}
    </div>
  `;
}

// ─── Focus area callout ──────────────────────────────────────────────

function renderFocus(focus) {
  if (!focus) return '';
  return `
    <div class="callout callout-growth">
      <div class="callout-label">▼ Eneo Kuu la Kuboresha</div>
      <div class="callout-title">${E(focus.titleSw)}</div>
      <div class="callout-body">${E(focus.rationaleSw)}</div>
      ${focus.tryThisTomorrowSw ? `<div class="try"><strong>Jaribu kesho:</strong> ${E(focus.tryThisTomorrowSw)}</div>` : ''}
      ${focus.leverQuestionSw ? `<div class="lever">💭 ${E(focus.leverQuestionSw)}</div>` : ''}
      ${focus.indicator ? `<span class="anchor anchor-orange">${E(focus.indicator)} · MEWAKA</span>` : ''}
    </div>
  `;
}

// ─── Main render function ────────────────────────────────────────────

function renderMewakaReportHtml(reportData) {
  const r = reportData || {};
  const band = bandStyle(r.performanceBand, r.overallPercentage || 0);
  const strength = (r.strengths && r.strengths[0]) || null;
  const focus = r.focusArea || null;
  const sparkline = renderSparkline(r.trend || []);
  //  — previously-dropped LLM fields surfaced as optional sections
  const execSummary = renderExecutiveSummary(r.executiveSummarySw);
  const notableMoments = renderNotableMoments(r.notableMoments);

  return `<!DOCTYPE html>
<html lang="sw">
<head>
<meta charset="UTF-8">
<title>Ripoti ya Mafunzo · ${E(r.teacherName || '')} · MEWAKA</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  @page { size: A4; margin: 11mm 14mm; }
  :root {
    --green: #2F855A; --green-bg: #F0FFF4; --green-dk: #22543D; --green-lt: #C6F6D5;
    --orange: #DD6B20; --orange-bg: #FFF7ED; --orange-dk: #9C4221; --orange-lt: #FBD38D;
    --amber: #ED8936;
    --text: #1A202C; --muted: #4A5568; --faint: #718096;
    --bg: #FBFAF7; --border: #E2E8F0;
    --band: ${band.color}; --band-bg: ${band.bg}; --band-dk: ${band.dark};
  }
  * { box-sizing: border-box; }
  body {
    font-family: 'Inter', system-ui, -apple-system, sans-serif;
    color: var(--text); background: white;
    margin: 0; padding: 0;
    line-height: 1.4;
    font-size: 11px;
  }
  h1 { font-size: 17px; margin: 0; line-height: 1.2; font-weight: 700; letter-spacing: -0.01em; }
  h2 { font-size: 10px; margin: 0 0 4px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.08em; font-weight: 700; }
  .num { font-variant-numeric: tabular-nums; font-weight: 600; }

  .header {
    display: flex; justify-content: space-between; align-items: flex-end;
    border-bottom: 3px solid var(--band);
    padding-bottom: 6px; margin-bottom: 9px;
  }
  .header-meta { font-size: 10px; color: var(--muted); margin-top: 3px; line-height: 1.55; }
  .header-meta .school { font-weight: 600; color: var(--text); font-size: 11px; }
  .score-badge {
    background: var(--band-bg); color: var(--band-dk);
    padding: 8px 16px; border-radius: 20px;
    font-weight: 700; font-size: 12px;
    text-align: center; min-width: 110px;
  }
  .score-badge .pct { font-size: 24px; display: block; line-height: 1; margin-bottom: 2px; }
  .score-badge .ofof { font-size: 9px; opacity: 0.75; margin-top: 4px; font-weight: 500; }

  .callout { padding: 9px 14px; border-radius: 4px; margin-bottom: 8px; }
  .callout-label { font-size: 9.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 3px; }
  .callout-title { font-size: 13.5px; font-weight: 700; color: var(--text); line-height: 1.3; margin-bottom: 4px; }
  .callout-body { font-size: 10.5px; color: var(--muted); line-height: 1.5; }
  .callout-strength { background: linear-gradient(135deg, #F0FFF4 0%, #FAFFF8 100%); border-left: 4px solid var(--green); }
  .callout-strength .callout-label { color: var(--green-dk); }
  .callout-growth { background: linear-gradient(135deg, #FFF7ED 0%, #FEF5E7 100%); border-left: 4px solid var(--orange); }
  .callout-growth .callout-label { color: var(--orange-dk); }
  .try {
    background: white; padding: 6px 11px; border-radius: 4px;
    border-left: 2px solid var(--amber);
    font-size: 10px; line-height: 1.5; margin-top: 5px;
  }
  .try strong { color: var(--orange-dk); font-weight: 700; }
  .lever { margin-top: 5px; font-size: 10px; color: #2A4365; font-style: italic; }
  .anchor {
    display: inline-block; padding: 2px 8px; border-radius: 10px;
    font-size: 9.5px; font-weight: 600; margin-top: 5px;
  }
  .anchor-green { background: var(--green-lt); color: var(--green-dk); }
  .anchor-orange { background: var(--orange-lt); color: var(--orange-dk); }

  .section { margin-top: 9px; }
  /* executive summary blurb — 1 italic line, low visual weight */
  .exec-summary {
    font-style: italic; color: var(--muted);
    font-size: 10.5px; line-height: 1.4;
    margin: 5px 0 8px;
    padding-left: 10px;
    border-left: 2px solid var(--border);
  }
  /* notable moments strip — compact, 2 entries max */
  .notable-moments { padding: 0; }
  .notable-moments .moment {
    display: flex; gap: 8px; align-items: baseline;
    font-size: 10px; line-height: 1.45;
    padding: 2px 0;
  }
  .notable-moments .moment-ts {
    font-variant-numeric: tabular-nums;
    font-weight: 600; color: var(--faint);
    min-width: 42px;
  }
  .notable-moments .moment-quote {
    color: var(--text); font-style: italic;
  }
  .sparkline-wrap {
    background: #FBFAF7; border: 1px solid var(--border);
    border-radius: 6px; padding: 5px 12px 3px;
  }
  .sparkline-wrap .caption {
    font-size: 9px; color: var(--faint); font-style: italic; margin-top: 2px;
  }

  .scorecard table { width: 100%; border-collapse: collapse; font-size: 10.5px; }
  .scorecard th {
    background: #F7FAFC; color: var(--muted);
    text-align: left; padding: 5px 8px;
    font-size: 9px; text-transform: uppercase; letter-spacing: 0.04em; font-weight: 600;
    border-bottom: 1px solid var(--border);
  }
  .scorecard td { padding: 4px 8px; vertical-align: middle; border-bottom: 1px solid #EDF2F7; }
  .scorecard .dom-name { width: 38%; }
  .scorecard .dom-name .dom-key { display: inline-block; font-size: 8.5px; color: var(--faint); background: #F7FAFC; padding: 1px 5px; border-radius: 8px; margin-left: 4px; vertical-align: middle; }
  .scorecard .dom-score { width: 16%; }
  .scorecard .dom-score .num { font-size: 11px; }
  .scorecard .dom-score .dom-pct { font-size: 9px; color: var(--faint); margin-left: 4px; }
  .scorecard .dom-bar { width: 46%; }
  .bar-track { height: 8px; background: #EDF2F7; border-radius: 4px; overflow: hidden; }
  .bar-fill { height: 100%; border-radius: 4px; transition: none; }

  .footer {
    margin-top: 9px; padding-top: 6px;
    border-top: 1px solid var(--border);
    font-size: 8.5px; color: var(--faint);
    display: flex; justify-content: space-between;
  }
  .footer .framework-note { font-style: italic; }
</style>
</head>
<body>

<div class="header">
  <div>
    <h1>Ripoti ya Mafunzo · ${E(r.teacherName || '')}</h1>
    <div class="header-meta">
      <span class="school">${E(r.observerName ? `${r.subject || ''}` : '')}${r.subject ? '' : ''}${E(r.subject || '')}${r.topic ? ' — ' + E(r.topic) : ''}</span><br>
      Tarehe: ${E(r.observationDate || '')}<br>
      <strong>${E(r.frameworkDisplayName || 'MEWAKA')}</strong>
    </div>
  </div>
  <div class="score-badge">
    <span class="pct">${Math.round(r.overallPercentage || 0)}%</span>
    ${E(band.label)}
    <div class="ofof">${r.totalScore || 0}/${r.maxScore || 75} alama</div>
  </div>
</div>

${execSummary}

${renderStrength(strength)}

${renderFocus(focus)}

${sparkline ? `
<div class="section">
  <h2>Maendeleo ya ${E(r.teacherName || 'Mwalimu')}</h2>
  <div class="sparkline-wrap">
    ${sparkline}
    <div class="caption">Alama za jumla katika masomo ya hivi karibuni · maeneo ya MEWAKA ${r.trend && r.trend.length ? `(${r.trend.length} masomo)` : ''}</div>
  </div>
</div>
` : ''}

${notableMoments}

<div class="section scorecard">
  <h2>Maeneo Sita ya MEWAKA</h2>
  <table>
    <thead>
      <tr><th>Eneo</th><th style="text-align:center">Alama</th><th>Maendeleo</th></tr>
    </thead>
    <tbody>
      ${renderDomainRows(r.domains || [])}
    </tbody>
  </table>
</div>

<div class="footer">
  <span>Rumi · Msaidizi wa Mwalimu</span>
  <span class="framework-note">Imepimwa kwa kutumia MEWAKA — Mafunzo Endelevu ya Walimu Kazini (Wizara ya Elimu, Tanzania)</span>
</div>

</body>
</html>`;
}

module.exports = { renderMewakaReportHtml, renderSparkline };
