const PdfPrinter = require('pdfmake');
const fs = require('fs');
const path = require('path');
const { logToFile } = require('../utils/logger');
const { TEMP_DIR } = require('../utils/constants');

/**
 * PDF Report Generator Service using pdfmake
 * Generates professional classroom observation reports with RTL support for Urdu
 *
 * Features:
 * - Proper Urdu/Arabic font rendering with RTL support
 * - Rounded corners and professional design
 * - Dynamic content sizing
 * - Progress bars and timestamp badges
 */
class PDFReportPdfMakeService {
  // Brand colors (OECD template colors)
  static COLORS = {
    primary: '#1e3a5f',      // Navy blue
    secondary: '#64748b',    // Slate gray
    background: '#f8fafc',   // Light gray
    border: '#e2e8f0',       // Border gray
    excellent: '#16a34a',    // Green
    proficient: '#2563eb',   // Blue
    developing: '#f59e0b',   // Orange
    emerging: '#ef4444'      // Red
  };

  /**
   * Initialize pdfmake with custom fonts including Urdu
   * @private
   */
  static _initializePrinter() {
    const fonts = {
      Helvetica: {
        normal: 'Helvetica',
        bold: 'Helvetica-Bold',
      },
      NotoSansArabic: {
        normal: path.join(__dirname, '../../fonts/NotoSansArabic.ttf'),
        bold: path.join(__dirname, '../../fonts/NotoSansArabic.ttf'),
      }
    };

    return new PdfPrinter(fonts);
  }

  /**
   * Get performance level based on percentage
   * @param {number} percentage - Score percentage
   * @returns {Object} Performance level with label and color
   * @private
   */
  static _getPerformanceLevel(percentage) {
    if (percentage >= 85) return { label: 'Excellent', color: this.COLORS.excellent };
    if (percentage >= 70) return { label: 'Proficient', color: this.COLORS.proficient };
    if (percentage >= 55) return { label: 'Developing', color: this.COLORS.developing };
    return { label: 'Emerging', color: this.COLORS.emerging };
  }

  /**
   * Split evidence text into English and Urdu parts
   * @private
   */
  static _splitEvidenceText(text) {
    const parts = text.split(/Quote:\s*/);
    const result = [];

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i].trim();
      if (!part) continue;

      if (i === 0) {
        // English part
        result.push({ text: part, fontSize: 7, font: 'Helvetica', margin: [0, 0, 0, 3] });
      } else {
        // Urdu quote part
        const urduText = part.replace(/^[""]|[""]$/g, '').trim();
        result.push({
          text: urduText,
          fontSize: 10,
          font: 'NotoSansArabic',
          color: '#555',
          alignment: 'right',
          margin: [0, 3, 0, 0]
        });
      }
    }

    return result;
  }

  /**
   * Create timestamp badge with rounded corners
   * @private
   */
  static _createTimestampBadge(timestamp) {
    return {
      text: timestamp,
      fontSize: 7,
      color: '#ffffff',
      background: this.COLORS.primary,
      margin: [0, 0, 5, 0],
      width: 'auto'
    };
  }

  /**
   * Create progress bar
   * @private
   */
  static _createProgressBar(percentage, color, width = 200) {
    const fillWidth = (width * percentage) / 100;

    return {
      canvas: [
        // Background
        {
          type: 'rect',
          x: 0,
          y: 0,
          w: width,
          h: 10,
          r: 6,
          color: this.COLORS.border
        },
        // Fill
        {
          type: 'rect',
          x: 0,
          y: 0,
          w: fillWidth,
          h: 10,
          r: 6,
          color: color
        }
      ]
    };
  }

  /**
   * Generate a classroom observation PDF report
   * @param {Object} reportData - Report data from analysis
   * @returns {Promise<Buffer>} PDF buffer
   */
  static async generateClassroomObservationReport(reportData) {
    const startTime = Date.now();

    try {
      logToFile('Starting PDF report generation with pdfmake', {
        teacher: reportData.teacherName,
        totalScore: reportData.totalScore,
        maxScore: reportData.maxScore
      });

      // Calculate percentage and performance level
      const percentage = Math.round((reportData.totalScore / reportData.maxScore) * 100);
      const performance = this._getPerformanceLevel(percentage);

      // Build document definition
      const docDefinition = {
        pageSize: 'A4',
        pageMargins: [50, 70, 50, 50],
        defaultStyle: {
          font: 'Helvetica',
          fontSize: 10
        },
        styles: {
          header: {
            fontSize: 24,
            bold: true,
            color: this.COLORS.primary,
            margin: [0, 0, 0, 5]
          },
          subheader: {
            fontSize: 10,
            color: this.COLORS.secondary,
            margin: [0, 0, 0, 20]
          },
          sectionTitle: {
            fontSize: 18,
            bold: true,
            color: this.COLORS.primary,
            margin: [0, 20, 0, 10]
          },
          goalTitle: {
            fontSize: 12,
            bold: true,
            margin: [0, 10, 0, 5]
          },
          criterionName: {
            fontSize: 9,
            bold: true
          },
          evidenceLabel: {
            fontSize: 7,
            color: this.COLORS.secondary,
            margin: [0, 5, 0, 2]
          },
          evidenceText: {
            fontSize: 7,
            margin: [0, 0, 0, 5]
          },
          timestampBadge: {
            fontSize: 7,
            color: '#ffffff',
            background: this.COLORS.primary,
            margin: [5, 0, 0, 0]
          },
          score: {
            fontSize: 9,
            color: this.COLORS.secondary
          },
          urduText: {
            fontSize: 8,
            font: 'Helvetica', // Will be replaced with Urdu font
            alignment: 'right'
          }
        },
        content: []
      };

      // Add logo to images if available
      const logoPath = path.join(__dirname, '../../marketing/Rumi White.jpg');
      if (fs.existsSync(logoPath)) {
        docDefinition.images = {
          logo: logoPath
        };
      }

      // Header section with logo
      const headerColumns = [];

      // Logo (if available)
      if (fs.existsSync(logoPath)) {
        headerColumns.push({
          image: 'logo',
          width: 60,
          margin: [0, -10, 15, 0]
        });
      }

      // Header text
      headerColumns.push({
        width: '*',
        stack: [
          { text: 'Classroom Observation', style: 'header' },
          { text: 'Teacher Performance Evaluation powered by Rumi', style: 'subheader' }
        ]
      });

      // Score badge
      headerColumns.push({
        width: 100,
        stack: [
          { text: `${percentage}%`, fontSize: 32, bold: true, color: this.COLORS.primary, alignment: 'right' },
          { text: performance.label, fontSize: 10, color: performance.color, alignment: 'right', margin: [0, 5, 0, 0] }
        ]
      });

      docDefinition.content.push({
        columns: headerColumns,
        margin: [0, 0, 0, 20]
      });

      // Horizontal line
      docDefinition.content.push({
        canvas: [
          {
            type: 'line',
            x1: 0, y1: 0,
            x2: 495, y2: 0,
            lineWidth: 2,
            lineColor: this.COLORS.primary
          }
        ],
        margin: [0, 0, 0, 20]
      });

      // Teacher info box
      docDefinition.content.push(this._createTeacherInfoBox(reportData));

      // Prior feedback section
      if (reportData.priorFeedback) {
        docDefinition.content.push(this._createPriorFeedbackSection(reportData.priorFeedback));
      }

      // Performance Overview
      docDefinition.content.push({ text: 'Performance Overview', style: 'sectionTitle' });

      // Goals
      for (const goal of reportData.goals || []) {
        docDefinition.content.push(this._createGoalSection(goal));
      }

      // Overall Feedback
      docDefinition.content.push(this._createOverallFeedbackSection(reportData.feedback));

      // Debrief & Reflection
      if (reportData.debriefReflection) {
        docDefinition.content.push(this._createDebriefSection(reportData.debriefReflection));
      }

      // Footer
      docDefinition.content.push({
        text: `Generated by Rumi • Supporting teachers everywhere • ${new Date().toLocaleDateString()}`,
        fontSize: 7,
        color: this.COLORS.secondary,
        alignment: 'center',
        margin: [0, 30, 0, 0]
      });

      // Generate PDF
      const printer = this._initializePrinter();
      const pdfDoc = printer.createPdfKitDocument(docDefinition);

      const chunks = [];
      pdfDoc.on('data', chunk => chunks.push(chunk));

      const pdfBuffer = await new Promise((resolve, reject) => {
        pdfDoc.on('end', () => resolve(Buffer.concat(chunks)));
        pdfDoc.on('error', reject);
        pdfDoc.end();
      });

      const duration = Date.now() - startTime;
      logToFile('✅ PDF report generated successfully with pdfmake', {
        teacher: reportData.teacherName,
        percentage: `${percentage}%`,
        performance: performance.label,
        pdfSizeKB: Math.round(pdfBuffer.length / 1024),
        durationMs: duration
      });

      return pdfBuffer;
    } catch (error) {
      logToFile('❌ Error generating PDF report with pdfmake', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Create teacher info box
   * @private
   */
  static _createTeacherInfoBox(data) {
    return {
      table: {
        widths: ['*', '*'],
        body: [
          [
            { text: 'TEACHER', fontSize: 8, color: this.COLORS.secondary, border: [false, false, false, false] },
            { text: 'DATE', fontSize: 8, color: this.COLORS.secondary, border: [false, false, false, false] }
          ],
          [
            { text: data.teacherName, fontSize: 10, bold: true, border: [false, false, false, false] },
            { text: data.observationDate || new Date().toLocaleDateString(), fontSize: 10, bold: true, border: [false, false, false, false] }
          ],
          [
            { text: 'SUBJECT', fontSize: 8, color: this.COLORS.secondary, border: [false, false, false, false], margin: [0, 10, 0, 0] },
            { text: 'GRADE', fontSize: 8, color: this.COLORS.secondary, border: [false, false, false, false], margin: [0, 10, 0, 0] }
          ],
          [
            { text: data.subject || 'N/A', fontSize: 10, border: [false, false, false, false] },
            { text: data.grade || 'N/A', fontSize: 10, border: [false, false, false, false] }
          ],
          [
            { text: 'LESSON', fontSize: 8, color: this.COLORS.secondary, border: [false, false, false, false], margin: [0, 10, 0, 0], colSpan: 2 },
            {}
          ],
          [
            { text: data.lessonTitle || 'Classroom Observation', fontSize: 10, border: [false, false, false, false], colSpan: 2 },
            {}
          ]
        ]
      },
      layout: {
        fillColor: this.COLORS.background,
        hLineWidth: () => 0,
        vLineWidth: () => 0,
        paddingLeft: () => 10,
        paddingRight: () => 10,
        paddingTop: () => 10,
        paddingBottom: () => 10
      },
      margin: [0, 0, 0, 20]
    };
  }

  /**
   * Create prior feedback section
   * @private
   */
  static _createPriorFeedbackSection(priorFeedback) {
    const percentage = priorFeedback.maxScore > 0
      ? Math.round((priorFeedback.score / priorFeedback.maxScore) * 100)
      : 0;
    const barColor = percentage >= 85 ? this.COLORS.excellent :
                     percentage >= 70 ? this.COLORS.proficient :
                     percentage >= 55 ? this.COLORS.developing : this.COLORS.emerging;

    return {
      stack: [
        { text: 'Incorporation of Prior Feedback', style: 'sectionTitle' },
        {
          table: {
            widths: ['*'],
            body: [[
              {
                stack: [
                  { text: 'SCORE', fontSize: 8, color: this.COLORS.secondary, margin: [0, 0, 0, 5] },
                  {
                    columns: [
                      { text: `${priorFeedback.score}/${priorFeedback.maxScore}`, fontSize: 12, bold: true, width: 60 },
                      { width: '*', margin: [10, 5, 0, 0], stack: [this._createProgressBar(percentage, barColor)] }
                    ]
                  },
                  {
                    columns: [
                      { text: 'EVIDENCE', fontSize: 7, color: this.COLORS.secondary, width: 'auto' },
                      priorFeedback.timestamp ? this._createTimestampBadge(priorFeedback.timestamp) : { text: '', width: '*' }
                    ],
                    margin: [0, 15, 0, 5]
                  },
                  priorFeedback.evidence
                    ? { stack: this._splitEvidenceText(priorFeedback.evidence), margin: [0, 5, 0, 0] }
                    : { text: 'N/A', fontSize: 7, margin: [0, 5, 0, 0] }
                ],
                border: [false, false, false, false]
              }
            ]]
          },
          layout: {
            fillColor: this.COLORS.background,
            hLineWidth: () => 0,
            vLineWidth: () => 0,
            paddingLeft: () => 10,
            paddingRight: () => 10,
            paddingTop: () => 10,
            paddingBottom: () => 10
          },
          margin: [0, 0, 0, 20]
        }
      ]
    };
  }

  /**
   * Create goal section
   * @private
   */
  static _createGoalSection(goal) {
    const percentage = Math.round((goal.score / goal.maxScore) * 100);
    const barColor = percentage >= 85 ? this.COLORS.excellent :
                     percentage >= 70 ? this.COLORS.proficient :
                     percentage >= 55 ? this.COLORS.developing : this.COLORS.emerging;

    const section = {
      stack: [
        {
          columns: [
            { text: goal.title, style: 'goalTitle', width: '*' },
            { text: `${goal.score}/${goal.maxScore}`, fontSize: 10, color: this.COLORS.secondary, width: 'auto' }
          ]
        },
        this._createProgressBar(percentage, barColor, 495),
        { text: '', margin: [0, 10, 0, 0] }
      ]
    };

    // Add criteria
    for (const criterion of goal.criteria || []) {
      section.stack.push(this._createCriterionBox(criterion));
    }

    return section;
  }

  /**
   * Create criterion box
   * @private
   */
  static _createCriterionBox(criterion) {
    const content = [
      {
        columns: [
          { text: criterion.name, fontSize: 9, bold: true, width: '*' },
          { text: `${criterion.score}/${criterion.max}`, fontSize: 9, color: this.COLORS.secondary, width: 'auto' }
        ]
      }
    ];

    if (criterion.evidence) {
      content.push({ text: '', margin: [0, 5, 0, 0] });
      content.push({
        columns: [
          { text: 'EVIDENCE', fontSize: 7, color: this.COLORS.secondary, width: 'auto' },
          criterion.timestamp ? this._createTimestampBadge(criterion.timestamp) : { text: '', width: '*' }
        ]
      });
      // Split evidence into English and Urdu parts
      const evidenceParts = this._splitEvidenceText(criterion.evidence);
      content.push({ stack: evidenceParts, margin: [0, 5, 0, 0] });
    }

    return {
      table: {
        widths: ['*'],
        body: [[
          {
            stack: content,
            border: [false, false, false, false]
          }
        ]]
      },
      layout: {
        fillColor: this.COLORS.background,
        hLineWidth: () => 0,
        vLineWidth: () => 0,
        paddingLeft: () => 10,
        paddingRight: () => 10,
        paddingTop: () => 10,
        paddingBottom: () => 10
      },
      margin: [0, 0, 0, 10]
    };
  }

  /**
   * Create overall feedback section
   * @private
   */
  static _createOverallFeedbackSection(feedback) {
    return {
      stack: [
        {
          table: {
            widths: ['*'],
            body: [[
              {
                stack: [
                  { text: 'Overall Feedback', fontSize: 12, bold: true, color: this.COLORS.primary, margin: [0, 0, 0, 10] },
                  { text: feedback || 'No feedback provided.', fontSize: 9 }
                ],
                border: [false, false, false, false]
              }
            ]]
          },
          layout: {
            fillColor: this.COLORS.background,
            hLineWidth: () => 0,
            vLineWidth: () => 0,
            paddingLeft: () => 10,
            paddingRight: () => 10,
            paddingTop: () => 10,
            paddingBottom: () => 10
          },
          margin: [0, 20, 0, 20]
        }
      ]
    };
  }

  /**
   * Create debrief & reflection section
   * @private
   */
  static _createDebriefSection(debriefReflection) {
    const percentage = debriefReflection.maxScore > 0
      ? Math.round((debriefReflection.score / debriefReflection.maxScore) * 100)
      : 0;
    const barColor = percentage >= 85 ? this.COLORS.excellent :
                     percentage >= 70 ? this.COLORS.proficient :
                     percentage >= 55 ? this.COLORS.developing : this.COLORS.emerging;

    const section = {
      stack: [
        { text: 'Debrief & Reflection', style: 'sectionTitle' },
        {
          table: {
            widths: ['*'],
            body: [[
              {
                stack: [
                  { text: 'TOTAL SCORE', fontSize: 8, color: this.COLORS.secondary, margin: [0, 0, 0, 5] },
                  {
                    columns: [
                      { text: `${debriefReflection.score}/${debriefReflection.maxScore}`, fontSize: 12, bold: true, width: 80 },
                      { width: '*', margin: [10, 5, 0, 0], stack: [this._createProgressBar(percentage, barColor, 300)] }
                    ]
                  }
                ],
                border: [false, false, false, false]
              }
            ]]
          },
          layout: {
            fillColor: this.COLORS.background,
            hLineWidth: () => 0,
            vLineWidth: () => 0,
            paddingLeft: () => 10,
            paddingRight: () => 10,
            paddingTop: () => 10,
            paddingBottom: () => 10
          },
          margin: [0, 0, 0, 10]
        }
      ]
    };

    // Add criteria
    for (const criterion of debriefReflection.criteria || []) {
      section.stack.push(this._createDebriefCriterionBox(criterion));
    }

    return section;
  }

  /**
   * Create debrief criterion box
   * @private
   */
  static _createDebriefCriterionBox(criterion) {
    const content = [
      {
        columns: [
          { text: criterion.name, fontSize: 9, bold: true, width: '*' },
          { text: `${criterion.score}/${criterion.max}`, fontSize: 9, color: this.COLORS.secondary, width: 'auto' }
        ]
      }
    ];

    if (criterion.evidence) {
      content.push({ text: '', margin: [0, 5, 0, 0] });
      content.push({
        columns: [
          { text: 'EVIDENCE', fontSize: 7, color: this.COLORS.secondary, width: 'auto' },
          criterion.timestamp ? this._createTimestampBadge(criterion.timestamp) : { text: '', width: '*' }
        ]
      });
      // Split evidence into English and Urdu parts
      const evidenceParts = this._splitEvidenceText(criterion.evidence);
      content.push({ stack: evidenceParts, margin: [0, 5, 0, 0] });
    }

    if (criterion.justification) {
      content.push({ text: '', margin: [0, 5, 0, 0] });
      content.push({ text: 'JUSTIFICATION', fontSize: 7, color: this.COLORS.secondary });
      content.push({ text: criterion.justification, fontSize: 7, margin: [0, 5, 0, 0] });
    }

    return {
      table: {
        widths: ['*'],
        body: [[
          {
            stack: content,
            border: [false, false, false, false]
          }
        ]]
      },
      layout: {
        fillColor: this.COLORS.background,
        hLineWidth: () => 0,
        vLineWidth: () => 0,
        paddingLeft: () => 10,
        paddingRight: () => 10,
        paddingTop: () => 10,
        paddingBottom: () => 10
      },
      margin: [0, 0, 0, 10]
    };
  }

  /**
   * Save PDF buffer to file (for testing/debugging)
   * @param {Buffer} pdfBuffer - PDF buffer
   * @param {string} filename - Output filename
   * @returns {Promise<string>} File path
   */
  static async savePDF(pdfBuffer, filename) {
    const filePath = path.join(TEMP_DIR, filename);
    fs.writeFileSync(filePath, pdfBuffer);
    logToFile('PDF saved to file', { filePath, sizeKB: Math.round(pdfBuffer.length / 1024) });
    return filePath;
  }
}

module.exports = PDFReportPdfMakeService;
