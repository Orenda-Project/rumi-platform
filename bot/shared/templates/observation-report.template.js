/**
 * Observation Report Template
 * Generates HTML for classroom observation reports with standard Rumi branding
 */

const fs = require('fs');
const path = require('path');

// Load Rumi logo as base64
const RUMI_LOGO_PATH = path.join(__dirname, '../../marketing/Rumi Transparent.png');
let RUMI_LOGO_BASE64 = null;

try {
  const logoBuffer = fs.readFileSync(RUMI_LOGO_PATH);
  RUMI_LOGO_BASE64 = logoBuffer.toString('base64');
} catch (error) {
  console.error('Warning: Could not load Rumi logo', error.message);
  RUMI_LOGO_BASE64 = ''; // Fallback to empty
}

/**
 * Generate Observation Report HTML
 * @param {object} data - Report data
 * @returns {string} HTML content
 */
function generateObservationReport(data) {
  const {
    teacherName,
    teacherPhone,
    reportDate,
    lessonDate,
    grade,
    subject,
    audioDuration,
    analysis,
    scores,
    charts
  } = data;

  // Format dates
  const formattedReportDate = new Date(reportDate).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const formattedLessonDate = new Date(lessonDate).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Classroom Observation Report - ${teacherName}</title>
  <style>
    @page {
      margin: 2cm;
      size: A4;
    }

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      line-height: 1.6;
      color: #333;
      background: white;
    }

    .header {
      text-align: center;
      border-bottom: 3px solid #4A90E2;
      padding-bottom: 20px;
      margin-bottom: 30px;
    }

    .rumi-logo {
      width: 120px;
      margin-bottom: 15px;
    }

    h1 {
      color: #4A90E2;
      font-size: 2em;
      margin-bottom: 10px;
    }

    h2 {
      color: #4A90E2;
      border-bottom: 2px solid #e0e0e0;
      padding-bottom: 8px;
      margin-top: 30px;
      margin-bottom: 15px;
      font-size: 1.5em;
    }

    h3 {
      color: #333;
      margin-top: 20px;
      margin-bottom: 10px;
      font-size: 1.2em;
    }

    .frontmatter {
      background: #f8f9fa;
      padding: 20px;
      border-left: 4px solid #4A90E2;
      margin-bottom: 30px;
      border-radius: 4px;
    }

    .frontmatter-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 15px;
    }

    .frontmatter-item {
      margin: 5px 0;
    }

    .frontmatter-label {
      font-weight: 600;
      color: #666;
      font-size: 0.9em;
      margin-bottom: 2px;
    }

    .frontmatter-value {
      color: #333;
      font-size: 1em;
    }

    .executive-summary {
      background: #e3f2fd;
      padding: 20px;
      border-left: 4px solid #4A90E2;
      margin: 20px 0;
      font-size: 1.05em;
      line-height: 1.7;
    }

    .chart-container {
      margin: 30px 0;
      text-align: center;
      page-break-inside: avoid;
    }

    .chart-container img {
      max-width: 100%;
      height: auto;
      border: 1px solid #ddd;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }

    .strength {
      background: #e8f5e9;
      border-left: 4px solid #4caf50;
      padding: 15px;
      margin: 15px 0;
      border-radius: 4px;
      page-break-inside: avoid;
    }

    .strength-title {
      font-weight: 600;
      color: #2e7d32;
      font-size: 1.1em;
      margin-bottom: 8px;
    }

    .growth-area {
      background: #fff3e0;
      border-left: 4px solid #ff9800;
      padding: 15px;
      margin: 15px 0;
      border-radius: 4px;
      page-break-inside: avoid;
    }

    .growth-title {
      font-weight: 600;
      color: #e65100;
      font-size: 1.1em;
      margin-bottom: 8px;
    }

    .evidence {
      background: #f5f5f5;
      padding: 12px;
      margin: 10px 0;
      font-style: italic;
      border-left: 3px solid #999;
      border-radius: 3px;
      color: #555;
    }

    .strategies {
      margin-top: 10px;
    }

    .strategies ul {
      margin-left: 20px;
      margin-top: 8px;
    }

    .strategies li {
      margin: 5px 0;
      line-height: 1.5;
    }

    .scores-container {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 15px;
      margin: 20px 0;
    }

    .score-box {
      background: #f8f9fa;
      padding: 15px;
      border-radius: 8px;
      text-align: center;
      border: 2px solid #e0e0e0;
    }

    .score-box.overall {
      background: #e3f2fd;
      border-color: #4A90E2;
    }

    .score-label {
      font-size: 0.9em;
      color: #666;
      margin-bottom: 8px;
    }

    .score-value {
      font-size: 2.5em;
      font-weight: bold;
      color: #4A90E2;
    }

    .score-description {
      font-size: 0.85em;
      color: #777;
      margin-top: 5px;
    }

    .recommendations {
      background: #fafafa;
      padding: 20px;
      border-radius: 4px;
      margin: 20px 0;
    }

    .recommendations ul {
      margin-left: 20px;
      margin-top: 10px;
    }

    .recommendations li {
      margin: 10px 0;
      line-height: 1.6;
    }

    .footer {
      margin-top: 50px;
      padding-top: 20px;
      border-top: 2px solid #e0e0e0;
      text-align: center;
      font-size: 0.9em;
      color: #666;
    }

    .page-break {
      page-break-after: always;
    }

    p {
      margin: 10px 0;
    }

    .section-intro {
      color: #555;
      font-size: 0.95em;
      margin-bottom: 15px;
      line-height: 1.6;
    }
  </style>
</head>
<body>
  <!-- Header -->
  <div class="header">
    ${RUMI_LOGO_BASE64 ? `<img src="data:image/png;base64,${RUMI_LOGO_BASE64}" class="rumi-logo" alt="Rumi Logo">` : ''}
    <h1>Classroom Observation Report</h1>
  </div>

  <!-- Frontmatter -->
  <div class="frontmatter">
    <div class="frontmatter-grid">
      <div class="frontmatter-item">
        <div class="frontmatter-label">Teacher Name</div>
        <div class="frontmatter-value">${teacherName || 'N/A'}</div>
      </div>
      <div class="frontmatter-item">
        <div class="frontmatter-label">Phone Number</div>
        <div class="frontmatter-value">${teacherPhone || 'N/A'}</div>
      </div>
      <div class="frontmatter-item">
        <div class="frontmatter-label">Report Generated</div>
        <div class="frontmatter-value">${formattedReportDate}</div>
      </div>
      <div class="frontmatter-item">
        <div class="frontmatter-label">Lesson Date</div>
        <div class="frontmatter-value">${formattedLessonDate}</div>
      </div>
      <div class="frontmatter-item">
        <div class="frontmatter-label">Grade / Subject</div>
        <div class="frontmatter-value">${grade ? `Grade ${grade}` : 'N/A'} - ${subject || 'N/A'}</div>
      </div>
      <div class="frontmatter-item">
        <div class="frontmatter-label">Lesson Duration</div>
        <div class="frontmatter-value">${Math.round(audioDuration / 60)} minutes</div>
      </div>
    </div>
  </div>

  <!-- Executive Summary -->
  <h2>Executive Summary</h2>
  <div class="executive-summary">
    ${analysis.executive_summary}
  </div>

  <!-- Classroom Metrics -->
  <h2>Classroom Metrics</h2>

  ${charts.talkTimePie ? `
  <div class="chart-container">
    <img src="${charts.talkTimePie}" alt="Talk Time Distribution">
  </div>
  ` : ''}

  ${charts.questionTypesBar ? `
  <div class="chart-container">
    <img src="${charts.questionTypesBar}" alt="Questioning Techniques">
  </div>
  ` : ''}

  <!-- Scores -->
  <h2>Danielson Framework Scores</h2>
  <p class="section-intro">
    Scores are based on the Danielson Framework for Teaching, using a 4-point scale:
    1 (Unsatisfactory), 2 (Basic), 3 (Proficient), 4 (Distinguished)
  </p>

  <div class="scores-container">
    <div class="score-box">
      <div class="score-label">Planning & Preparation</div>
      <div class="score-value">${scores.planning}</div>
      <div class="score-description">${getScoreLabel(scores.planning)}</div>
    </div>
    <div class="score-box">
      <div class="score-label">Classroom Environment</div>
      <div class="score-value">${scores.environment}</div>
      <div class="score-description">${getScoreLabel(scores.environment)}</div>
    </div>
    <div class="score-box">
      <div class="score-label">Instruction</div>
      <div class="score-value">${scores.instruction}</div>
      <div class="score-description">${getScoreLabel(scores.instruction)}</div>
    </div>
    <div class="score-box overall">
      <div class="score-label">Overall</div>
      <div class="score-value">${scores.overall}</div>
      <div class="score-description">${getScoreLabel(scores.overall)}</div>
    </div>
  </div>

  ${charts.scoresRadar ? `
  <div class="chart-container">
    <img src="${charts.scoresRadar}" alt="Danielson Framework Scores">
  </div>
  ` : ''}

  <p><strong>Justification:</strong> ${scores.justification || 'N/A'}</p>

  <!-- Page Break -->
  <div class="page-break"></div>

  <!-- Strengths -->
  <h2>Strengths</h2>
  <p class="section-intro">
    The following strengths were observed during your lesson, demonstrating effective teaching practices:
  </p>

  ${analysis.strengths.map(strength => `
    <div class="strength">
      <div class="strength-title">${strength.title}</div>
      <div class="evidence">
        <strong>Evidence:</strong> ${strength.evidence}
      </div>
      <p><strong>Analysis:</strong> ${strength.analysis}</p>
      <p><strong>Impact on Learning:</strong> ${strength.impact}</p>
    </div>
  `).join('')}

  <!-- Growth Opportunities -->
  <h2>Growth Opportunities</h2>
  <p class="section-intro">
    These areas present opportunities for further professional development and enhanced teaching effectiveness:
  </p>

  ${analysis.growth_opportunities.map(growth => `
    <div class="growth-area">
      <div class="growth-title">${growth.area}</div>
      <p><strong>Observation:</strong> ${growth.observation}</p>
      <p><strong>Rationale:</strong> ${growth.rationale}</p>
      <div class="strategies">
        <strong>Suggested Strategies:</strong>
        <ul>
          ${growth.strategies.map(strategy => `<li>${strategy}</li>`).join('')}
        </ul>
      </div>
    </div>
  `).join('')}

  <!-- Recommendations -->
  <h2>Recommendations</h2>
  <div class="recommendations">
    <p class="section-intro">
      Based on this observation, I recommend focusing on the following actionable steps:
    </p>
    <ul>
      ${analysis.recommendations.map(rec => `<li>${rec}</li>`).join('')}
    </ul>
  </div>

  <!-- Footer -->
  <div class="footer">
    <p><strong>Generated by Rumi Digital Coach</strong> | ${formattedReportDate}</p>
    <p>This report is for professional development purposes only.</p>
    <p style="margin-top: 10px; font-size: 0.85em; color: #999;">
      Based on the Danielson Framework for Teaching and S.T.I.C.K.S. coaching principles
    </p>
  </div>
</body>
</html>
  `;
}

/**
 * Get score label from numeric score
 * @param {number} score - Score (1-4)
 * @returns {string} Score label
 */
function getScoreLabel(score) {
  const labels = {
    1: 'Unsatisfactory',
    2: 'Basic',
    3: 'Proficient',
    4: 'Distinguished'
  };
  return labels[Math.round(score)] || 'N/A';
}

module.exports = {
  generateObservationReport
};
