'use strict';
/**
 * Video-quiz class report.
 *
 * The teacher's copy of "how did my class do, and what do I do about it".
 * Deliberately the same visual language as the /quiz report so a teacher does
 * not have to learn two formats for the same question.
 *
 * The ordering is the argument: what to reteach comes FIRST, above the scores.
 * A report that opens with a ranked list of children invites her to read it as
 * a league table; one that opens with "these three questions, this wrong answer,
 * here is why" invites her to change tomorrow's lesson. Scores are underneath,
 * because she does still need them.
 */

const fs = require('fs');
const path = require('path');

let _assets = null;

function readBase64(relPath) {
  const abs = path.join(__dirname, '..', relPath);
  try {
    return fs.existsSync(abs) ? fs.readFileSync(abs).toString('base64') : '';
  } catch { return ''; }
}

function assets() {
  if (!_assets) {
    _assets = {
      logo: readBase64('assets/Rumi Transparent.png'),
      lexend: readBase64('fonts/Lexend-Regular.ttf'),
      lexendBold: readBase64('fonts/Lexend-Bold.ttf'),
      nastaliq: readBase64('fonts/NotoNastaliqUrdu-Regular.ttf'),
    };
  }
  return _assets;
}

function esc(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function band(pct) {
  if (pct >= 80) return { c: '#16a34a', bg: '#dcfce7', label: 'Strong' };
  if (pct >= 60) return { c: '#ca8a04', bg: '#fef9c3', label: 'Getting there' };
  return { c: '#dc2626', bg: '#fee2e2', label: 'Needs practice' };
}

function renderVideoQuizReportHtml(d) {
  const a = assets();
  const {
    topic = 'Video quiz', teacherName = '', grade = '',
    started = 0, finished = 0, average = 0,
    students = [], hardest = [], guidance = null, unfinished = [],
    generatedAt = '',
  } = d || {};

  const missedCards = hardest.map((h, i) => {
    const pct = h.total ? Math.round((h.wrong / h.total) * 100) : 0;
    // Only claim a shared mistake when the class actually agreed on one —
    // hardestQuestions() nulls these when the wrong answers were scattered.
    const chose = h.top_wrong_text ? `
      <div class="chose">
        <span class="lbl">Most chose</span>
        <span class="wrongpill">${esc(h.top_wrong_text)}</span>
        <span class="arrow">&rarr;</span>
        <span class="lbl">answer was</span>
        <span class="rightpill">${esc(h.correct_text || '')}</span>
      </div>` : '';
    const why = h.misconception ? `
      <div class="why"><b>Why this happens:</b> ${esc(h.misconception)}</div>` : '';
    return `
      <div class="missed">
        <div class="mhead"><span class="num">${i + 1}</span>
          <span class="qtext">${esc(h.question_text)}</span></div>
        <div class="mstat">${h.wrong} of ${h.total} got this wrong &middot; ${pct}%</div>
        ${chose}${why}
      </div>`;
  }).join('');

  const rows = students.map((s) => {
    const pct = s.mastery_percentage || 0;
    const b = band(pct);
    return `<tr>
      <td class="nm">${esc(s.student_name || 'Unnamed')}</td>
      <td class="cl">${esc(s.student_class || '')}</td>
      <td class="sc">${s.correct_answers || 0}/${s.total_questions_answered || 0}</td>
      <td class="pc"><span class="pill" style="color:${b.c};background:${b.bg}">${pct}%</span></td>
    </tr>`;
  }).join('');

  const notFinished = unfinished.length ? `
    <div class="card soft">
      <h2>Not finished yet</h2>
      <p class="muted">${esc(unfinished.join(', '))}</p>
    </div>` : '';

  const guidanceBlock = guidance ? `
    <div class="card guide">
      <h2>For tomorrow</h2>
      <p>${esc(guidance)}</p>
    </div>` : '';

  return `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:Lexend;src:url(data:font/ttf;base64,${a.lexend}) format('truetype');font-weight:400}
@font-face{font-family:Lexend;src:url(data:font/ttf;base64,${a.lexendBold}) format('truetype');font-weight:700}
@font-face{font-family:Nastaliq;src:url(data:font/ttf;base64,${a.nastaliq}) format('truetype')}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:Lexend,'Helvetica Neue',Arial,sans-serif;color:#1f2937;font-size:12px;background:#fff}
.page{padding:34px 40px}
.hdr{display:flex;align-items:center;gap:14px;border-bottom:3px solid #0b1f33;padding-bottom:14px}
.hdr img{width:42px;height:42px;object-fit:contain}
.hdr .t{font-size:20px;font-weight:700;color:#0b1f33;line-height:1.2}
.hdr .s{font-size:11.5px;color:#6b7280;margin-top:2px}
.stats{display:flex;gap:10px;margin:20px 0 6px}
.stat{flex:1;border:1px solid #e5e7eb;border-radius:9px;padding:11px 13px}
.stat .v{font-size:21px;font-weight:700;color:#0b1f33}
.stat .k{font-size:10.5px;color:#6b7280;margin-top:2px;text-transform:uppercase;letter-spacing:.4px}
.card{border:1px solid #e5e7eb;border-radius:10px;padding:15px 17px;margin-top:15px}
.card.guide{border-color:#f5b301;background:#fffbeb}
.card.soft{background:#f9fafb}
h2{font-size:13.5px;font-weight:700;color:#0b1f33;margin-bottom:9px}
.missed{border-left:3px solid #dc2626;padding:8px 0 10px 12px;margin-bottom:13px}
.missed:last-child{margin-bottom:0}
.mhead{display:flex;gap:8px;align-items:flex-start}
.num{background:#0b1f33;color:#fff;width:17px;height:17px;border-radius:50%;
 display:inline-flex;align-items:center;justify-content:center;font-size:10px;flex:0 0 17px;margin-top:1px}
.qtext{font-weight:700;font-size:12.4px;line-height:1.42}
.mstat{color:#6b7280;font-size:11px;margin:4px 0 0 25px}
.chose{margin:7px 0 0 25px;font-size:11.5px;display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.lbl{color:#6b7280}
.arrow{color:#9ca3af}
.wrongpill{background:#fee2e2;color:#b91c1c;padding:2px 8px;border-radius:20px;font-weight:700}
.rightpill{background:#dcfce7;color:#15803d;padding:2px 8px;border-radius:20px;font-weight:700}
.why{margin:7px 0 0 25px;font-size:11.5px;line-height:1.5;color:#374151;
 background:#f3f4f6;border-radius:7px;padding:7px 10px}
table{width:100%;border-collapse:collapse;margin-top:3px}
th{text-align:left;font-size:10px;color:#6b7280;text-transform:uppercase;
 letter-spacing:.4px;padding:0 7px 6px;border-bottom:1px solid #e5e7eb}
td{padding:6px 7px;border-bottom:1px solid #f3f4f6;font-size:11.6px}
td.sc,td.pc,th.r{text-align:right}
.nm{font-weight:700}
.cl{color:#6b7280}
.pill{padding:2px 9px;border-radius:20px;font-weight:700;font-size:11px}
.muted{color:#6b7280;font-size:11.5px;line-height:1.55}
.foot{margin-top:22px;padding-top:11px;border-top:1px solid #e5e7eb;
 color:#9ca3af;font-size:10px;display:flex;justify-content:space-between}
</style></head><body><div class="page">

  <div class="hdr">
    ${a.logo ? `<img src="data:image/png;base64,${a.logo}">` : ''}
    <div><div class="t">${esc(topic)}</div>
    <div class="s">Class quiz results${teacherName ? ` &middot; ${esc(teacherName)}` : ''}${grade ? ` &middot; Grade ${esc(grade)}` : ''}</div></div>
  </div>

  <div class="stats">
    <div class="stat"><div class="v">${finished}<span style="font-size:13px;color:#9ca3af">/${started}</span></div><div class="k">Finished</div></div>
    <div class="stat"><div class="v">${average}%</div><div class="k">Class average</div></div>
    <div class="stat"><div class="v">${hardest.length}</div><div class="k">To reteach</div></div>
  </div>

  ${hardest.length ? `<div class="card">
    <h2>Worth reteaching</h2>
    ${missedCards}
  </div>` : ''}

  ${guidanceBlock}

  ${students.length ? `<div class="card">
    <h2>How each child did</h2>
    <table><thead><tr><th>Name</th><th>Class</th><th class="r">Score</th><th class="r">&nbsp;</th></tr></thead>
    <tbody>${rows}</tbody></table>
  </div>` : ''}

  ${notFinished}

  <div class="foot"><span>${esc(require('../config/branding').botName)} &middot; ${esc(require('../config/branding').orgName)}</span><span>${esc(generatedAt)}</span></div>
</div></body></html>`;
}

module.exports = renderVideoQuizReportHtml;
