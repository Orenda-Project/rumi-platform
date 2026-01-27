/**
 * PDF Service
 * Generates professional classroom observation reports using PDFKit
 */

const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const { logToFile } = require('../utils/logger');

// Colors matching the HTML template
const COLORS = {
  primary: '#4A90E2',      // Blue
  success: '#4caf50',      // Green
  warning: '#ff9800',      // Orange
  lightBlue: '#e3f2fd',
  lightGreen: '#e8f5e9',
  lightOrange: '#fff3e0',
  gray: '#f8f9fa',
  darkGray: '#666',
  text: '#333',
  border: '#e0e0e0'
};

// Load Rumi logo
const RUMI_LOGO_PATH = path.join(__dirname, '../../marketing/Rumi Transparent.png');

// Font paths for multilingual support (Urdu/Arabic)
const FONTS = {
  arabicRegular: path.join(__dirname, '../fonts/NotoSansArabic-Regular.ttf'),
  arabicBold: path.join(__dirname, '../fonts/NotoSansArabic-Bold.ttf')
};

/**
 * PDF Service
 * Creates structured PDF reports with professional formatting
 */
class PDFService {
  /**
   * Mask phone number for privacy
   * @param {string} phone - Phone number to mask
   * @returns {string} Masked phone number
   * @private
   */
  static _maskPhoneNumber(phone) {
    if (!phone || phone === 'N/A') return 'N/A';
    // Format: 92XXXXXXXXxx (show first 2 and last 2 digits)
    if (phone.length < 4) return phone;
    return phone.slice(0, 2) + 'X'.repeat(phone.length - 4) + phone.slice(-2);
  }

  /**
   * Generate observation report PDF
   * @param {object} data - Report data (same structure as HTML template expects)
   * @returns {Promise<Buffer>} PDF buffer
   */
  static async generateObservationReport(data) {
    return new Promise((resolve, reject) => {
      try {
        logToFile('Starting PDFKit report generation', {
          teacher: data.teacherName,
          hasCharts: !!data.charts
        });

        const doc = new PDFDocument({
          size: 'A4',
          margins: { top: 50, bottom: 50, left: 50, right: 50 },
          info: {
            Title: `Classroom Observation Report - ${data.teacherName}`,
            Author: 'Rumi Digital Coach'
          }
        });

        // Register Arabic fonts for Urdu/Arabic text support
        doc.registerFont('NotoArabic', FONTS.arabicRegular);
        doc.registerFont('NotoArabic-Bold', FONTS.arabicBold);

        const buffers = [];
        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => {
          const pdfBuffer = Buffer.concat(buffers);
          logToFile('✅ PDF generated', {
            size: pdfBuffer.length,
            sizeKB: (pdfBuffer.length / 1024).toFixed(2)
          });
          resolve(pdfBuffer);
        });
        doc.on('error', reject);

        // Generate report sections
        this._drawHeader(doc, data);
        this._drawFrontmatter(doc, data);
        this._drawExecutiveSummary(doc, data);
        this._drawCharts(doc, data);
        this._drawScores(doc, data);

        // Domain 4 (Professional Responsibilities) if present
        if (data.analysis && data.analysis.domain4_professional_responsibilities) {
          doc.addPage();
          this._drawDomain4(doc, data);
        }

        // New page for strengths and growth
        doc.addPage();
        this._drawStrengths(doc, data);
        this._drawGrowthOpportunities(doc, data);
        this._drawRecommendations(doc, data);
        this._drawFooter(doc, data);

        doc.end();
      } catch (error) {
        logToFile('❌ Error generating PDF', {
          error: error.message,
          stack: error.stack
        });
        reject(error);
      }
    });
  }

  /**
   * Draw header with logo and title
   */
  static _drawHeader(doc, data) {
    // Add Rumi logo if available
    if (fs.existsSync(RUMI_LOGO_PATH)) {
      const logoWidth = 80;
      const logoX = (doc.page.width - logoWidth) / 2;
      doc.image(RUMI_LOGO_PATH, logoX, 50, { width: logoWidth });
      doc.moveDown(4);
    } else {
      doc.moveDown(2);
    }

    // Title
    doc.fontSize(24)
       .fillColor(COLORS.primary)
       .font('Helvetica-Bold')
       .text('Classroom Observation Report', { align: 'center' });

    doc.moveDown(1);

    // Draw line under header
    doc.strokeColor(COLORS.primary)
       .lineWidth(3)
       .moveTo(50, doc.y)
       .lineTo(doc.page.width - 50, doc.y)
       .stroke();

    doc.moveDown(2);
  }

  /**
   * Draw frontmatter with teacher info
   */
  static _drawFrontmatter(doc, data) {
    const startY = doc.y;
    const boxPadding = 15;
    const boxWidth = doc.page.width - 100;

    // Draw background box
    doc.rect(50, startY, boxWidth, 120)
       .fillAndStroke(COLORS.gray, COLORS.primary);

    doc.fillColor(COLORS.text);

    // Format dates
    const reportDate = new Date(data.reportDate).toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric'
    });
    const lessonDate = new Date(data.lessonDate).toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric'
    });

    // Draw info in 2 columns
    const leftX = 65;
    const rightX = doc.page.width / 2 + 25;
    let infoY = startY + boxPadding;

    const items = [
      { label: 'Teacher Name', value: data.teacherName || 'N/A', x: leftX },
      { label: 'Phone Number', value: this._maskPhoneNumber(data.teacherPhone), x: rightX },
      { label: 'Report Generated', value: reportDate, x: leftX },
      { label: 'Lesson Date', value: lessonDate, x: rightX },
      { label: 'Lesson Duration', value: `${Math.round(data.audioDuration / 60)} minutes`, x: leftX }
    ];

    items.forEach((item, index) => {
      if (index % 2 === 0 && index > 0) {
        infoY += 25;
      }

      doc.fontSize(9)
         .fillColor(COLORS.darkGray)
         .font('Helvetica-Bold')
         .text(item.label, item.x, infoY, { continued: false });

      doc.fontSize(10)
         .fillColor(COLORS.text)
         .font('Helvetica')
         .text(item.value, item.x, infoY + 10, { continued: false });
    });

    doc.y = startY + 130;
    doc.moveDown(1);
  }

  /**
   * Draw executive summary box
   */
  static _drawExecutiveSummary(doc, data) {
    doc.fontSize(16)
       .fillColor(COLORS.primary)
       .font('Helvetica-Bold')
       .text('Executive Summary');

    doc.moveDown(0.5);

    const startY = doc.y;
    const summary = data.analysis.executive_summary || 'No summary available.';
    const boxWidth = doc.page.width - 100;

    // Calculate box height
    const textHeight = doc.heightOfString(summary, {
      width: boxWidth - 30,
      align: 'left'
    });

    // Draw background box
    doc.rect(50, startY, boxWidth, textHeight + 25)
       .fillAndStroke(COLORS.lightBlue, COLORS.primary);

    // Draw text
    doc.fillColor(COLORS.text)
       .fontSize(11)
       .font('NotoArabic')  // Use Arabic font to support Urdu/Arabic text
       .text(summary, 65, startY + 12, {
         width: boxWidth - 30,
         align: 'left'
       });

    doc.y = startY + textHeight + 30;
    doc.moveDown(1);
  }

  /**
   * Draw embedded chart images
   */
  static _drawCharts(doc, data) {
    if (!data.charts) return;

    doc.fontSize(16)
       .fillColor(COLORS.primary)
       .font('Helvetica-Bold')
       .text('Classroom Metrics');

    doc.moveDown(0.5);

    const chartWidth = doc.page.width - 100;
    const charts = [
      data.charts.talkTimePie,
      data.charts.questionTypesBar
    ];

    charts.forEach(chartData => {
      if (chartData && chartData.startsWith('data:image')) {
        // Extract base64 data
        const base64Data = chartData.split(',')[1];
        const buffer = Buffer.from(base64Data, 'base64');

        doc.image(buffer, 50, doc.y, { width: chartWidth });
        doc.moveDown(1);
      }
    });
  }

  /**
   * Draw Danielson scores
   */
  static _drawScores(doc, data) {
    doc.fontSize(16)
       .fillColor(COLORS.primary)
       .font('Helvetica-Bold')
       .text('Danielson Framework Scores');

    doc.moveDown(0.3);

    doc.fontSize(9)
       .fillColor(COLORS.text)
       .font('Helvetica')
       .text('Scores are based on the Danielson Framework for Teaching, using a 4-point scale: ' +
             '1 (Unsatisfactory), 2 (Basic), 3 (Proficient), 4 (Distinguished)');

    doc.moveDown(1);

    const startY = doc.y;
    const boxWidth = (doc.page.width - 140) / 4;
    const boxHeight = 80;

    const scores = [
      { label: 'Planning &\nPreparation', score: data.scores.planning },
      { label: 'Classroom\nEnvironment', score: data.scores.environment },
      { label: 'Instruction', score: data.scores.instruction },
      { label: 'Overall', score: data.scores.overall, highlight: true }
    ];

    scores.forEach((item, index) => {
      const x = 50 + (index * (boxWidth + 10));

      // Draw box
      if (item.highlight) {
        doc.rect(x, startY, boxWidth, boxHeight)
           .fillAndStroke(COLORS.lightBlue, COLORS.primary);
      } else {
        doc.rect(x, startY, boxWidth, boxHeight)
           .fillAndStroke(COLORS.gray, COLORS.border);
      }

      // Label
      doc.fontSize(8)
         .fillColor(COLORS.darkGray)
         .font('Helvetica')
         .text(item.label, x, startY + 10, {
           width: boxWidth,
           align: 'center'
         });

      // Score
      doc.fontSize(28)
         .fillColor(COLORS.primary)
         .font('Helvetica-Bold')
         .text(item.score.toFixed(1), x, startY + 35, {
           width: boxWidth,
           align: 'center'
         });

      // Description
      doc.fontSize(7)
         .fillColor(COLORS.darkGray)
         .font('Helvetica')
         .text(this._getScoreLabel(item.score), x, startY + 65, {
           width: boxWidth,
           align: 'center'
         });
    });

    doc.y = startY + boxHeight + 10;
    doc.moveDown(1);

    // Radar chart if available
    if (data.charts && data.charts.scoresRadar) {
      const chartData = data.charts.scoresRadar;
      if (chartData.startsWith('data:image')) {
        const base64Data = chartData.split(',')[1];
        const buffer = Buffer.from(base64Data, 'base64');
        doc.image(buffer, 50, doc.y, { width: doc.page.width - 100 });
        doc.moveDown(1);
      }
    }

    // Justification - full width
    doc.moveDown(1);

    doc.fontSize(10)
       .fillColor(COLORS.text)
       .font('Helvetica-Bold')
       .text('Justification:');

    doc.moveDown(0.3);

    doc.fontSize(10)
       .font('NotoArabic')  // Use Arabic font to support Urdu/Arabic text
       .text(data.scores.justification || 'N/A', {
         width: doc.page.width - 100,
         align: 'left'
       });

    doc.moveDown(2);
  }

  /**
   * Draw Domain 4 (Professional Responsibilities) section
   */
  static _drawDomain4(doc, data) {
    const domain4 = data.analysis.domain4_professional_responsibilities;

    // Header
    doc.fontSize(16)
       .fillColor(COLORS.primary)
       .font('Helvetica-Bold')
       .text('Domain 4: Professional Responsibilities');

    doc.moveDown(0.5);

    doc.fontSize(9)
       .fillColor(COLORS.text)
       .font('Helvetica')
       .text('Assessment of professional growth, reflection quality, and commitment to continuous improvement based on the reflective conversation:');

    doc.moveDown(1);

    const boxWidth = doc.page.width - 100;
    const fields = [
      { label: 'Reflection Quality', key: 'reflection_quality' },
      { label: 'Self-Awareness', key: 'self_awareness' },
      { label: 'Growth Orientation', key: 'growth_orientation' },
      { label: 'Professional Learning Needs', key: 'professional_learning_needs' }
    ];

    fields.forEach(field => {
      if (domain4[field.key]) {
        const textHeight = doc.heightOfString(domain4[field.key], { width: boxWidth - 30 });
        const startY = doc.y;

        // Background box
        doc.rect(50, startY, boxWidth, textHeight + 25)
           .fillAndStroke(COLORS.lightBlue, COLORS.primary);

        // Label
        doc.fontSize(11)
           .fillColor(COLORS.primary)
           .font('Helvetica-Bold')
           .text(field.label, 65, startY + 10);

        // Content
        doc.fontSize(10)
           .fillColor(COLORS.text)
           .font('NotoArabic')  // Support Urdu/Arabic text
           .text(domain4[field.key], 65, startY + 25, {
             width: boxWidth - 30
           });

        doc.y = startY + textHeight + 35;
        doc.moveDown(0.5);
      }
    });

    // Domain 4 Score
    if (domain4.score) {
      doc.moveDown(0.5);

      const startY = doc.y;
      const scoreBoxWidth = 150;

      doc.rect(50, startY, scoreBoxWidth, 60)
         .fillAndStroke(COLORS.lightGreen, COLORS.success);

      doc.fontSize(10)
         .fillColor(COLORS.text)
         .font('Helvetica-Bold')
         .text('Domain 4 Score', 65, startY + 10);

      doc.fontSize(24)
         .fillColor(COLORS.success)
         .font('Helvetica-Bold')
         .text(domain4.score.toFixed(1), 65, startY + 28);

      doc.fontSize(8)
         .fillColor(COLORS.darkGray)
         .font('Helvetica')
         .text(this._getScoreLabel(domain4.score), 65, startY + 48);

      // Justification
      if (domain4.justification) {
        doc.fontSize(10)
           .fillColor(COLORS.text)
           .font('Helvetica-Bold')
           .text('Justification:', scoreBoxWidth + 70, startY + 10);

        doc.fontSize(9)
           .font('NotoArabic')
           .text(domain4.justification, scoreBoxWidth + 70, startY + 25, {
             width: boxWidth - scoreBoxWidth - 30
           });
      }

      doc.y = startY + 70;
    }

    doc.moveDown(2);
  }

  /**
   * Draw strengths section
   */
  static _drawStrengths(doc, data) {
    doc.fontSize(16)
       .fillColor(COLORS.primary)
       .font('Helvetica-Bold')
       .text('Strengths');

    doc.moveDown(0.3);

    doc.fontSize(9)
       .fillColor(COLORS.text)
       .font('Helvetica')
       .text('The following strengths were observed during your lesson, demonstrating effective teaching practices:');

    doc.moveDown(1);

    data.analysis.strengths.forEach((strength, index) => {
      if (doc.y > doc.page.height - 150) {
        doc.addPage();
      }

      const startY = doc.y;
      const boxWidth = doc.page.width - 100;

      // Calculate height
      const titleHeight = doc.heightOfString(strength.title, { width: boxWidth - 30 });
      const evidenceHeight = doc.heightOfString(`Evidence: ${strength.evidence}`, { width: boxWidth - 30 });
      const analysisHeight = doc.heightOfString(`Analysis: ${strength.analysis}`, { width: boxWidth - 30 });
      const impactHeight = doc.heightOfString(`Impact on Learning: ${strength.impact}`, { width: boxWidth - 30 });

      const totalHeight = titleHeight + evidenceHeight + analysisHeight + impactHeight + 40;

      // Draw box
      doc.rect(50, startY, boxWidth, totalHeight)
         .fillAndStroke(COLORS.lightGreen, COLORS.success);

      let textY = startY + 12;

      // Title
      doc.fontSize(12)
         .fillColor('#2e7d32')
         .font('Helvetica-Bold')
         .text(strength.title, 65, textY, { width: boxWidth - 30 });

      textY += titleHeight + 8;

      // Evidence (gray box)
      doc.rect(65, textY, boxWidth - 30, evidenceHeight + 10)
         .fill('#f5f5f5');

      doc.fontSize(10)
         .fillColor('#555')
         .font('Helvetica-Bold')
         .text('Evidence: ', 75, textY + 5, { continued: true })
         .font('NotoArabic')  // Use Arabic font for Urdu/Arabic evidence text
         .text(strength.evidence, { width: boxWidth - 50 });

      textY += evidenceHeight + 18;

      // Analysis
      doc.fillColor(COLORS.text)
         .fontSize(10)
         .font('Helvetica-Bold')
         .text('Analysis: ', 65, textY, { continued: true })
         .font('Helvetica')
         .text(strength.analysis, { width: boxWidth - 30 });

      textY += analysisHeight + 8;

      // Impact
      doc.fontSize(10)
         .font('Helvetica-Bold')
         .text('Impact on Learning: ', 65, textY, { continued: true })
         .font('Helvetica')
         .text(strength.impact, { width: boxWidth - 30 });

      doc.y = startY + totalHeight + 10;
      doc.moveDown(0.5);
    });

    doc.moveDown(1);
  }

  /**
   * Draw growth opportunities section
   */
  static _drawGrowthOpportunities(doc, data) {
    if (doc.y > doc.page.height - 200) {
      doc.addPage();
    }

    doc.fontSize(16)
       .fillColor(COLORS.primary)
       .font('Helvetica-Bold')
       .text('Growth Opportunities');

    doc.moveDown(0.3);

    doc.fontSize(9)
       .fillColor(COLORS.text)
       .font('Helvetica')
       .text('These areas present opportunities for further professional development and enhanced teaching effectiveness:');

    doc.moveDown(1);

    data.analysis.growth_opportunities.forEach((growth, index) => {
      if (doc.y > doc.page.height - 180) {
        doc.addPage();
      }

      const startY = doc.y;
      const boxWidth = doc.page.width - 100;

      // Calculate height
      const titleHeight = doc.heightOfString(growth.area, { width: boxWidth - 30 });
      const obsHeight = doc.heightOfString(`Observation: ${growth.observation}`, { width: boxWidth - 30 });
      const ratHeight = doc.heightOfString(`Rationale: ${growth.rationale}`, { width: boxWidth - 30 });

      let strategiesHeight = 20;
      growth.strategies.forEach(strategy => {
        strategiesHeight += doc.heightOfString(`• ${strategy}`, { width: boxWidth - 50 }) + 3;
      });

      const totalHeight = titleHeight + obsHeight + ratHeight + strategiesHeight + 40;

      // Draw box
      doc.rect(50, startY, boxWidth, totalHeight)
         .fillAndStroke(COLORS.lightOrange, COLORS.warning);

      let textY = startY + 12;

      // Title
      doc.fontSize(12)
         .fillColor('#e65100')
         .font('Helvetica-Bold')
         .text(growth.area, 65, textY, { width: boxWidth - 30 });

      textY += titleHeight + 8;

      // Observation
      doc.fontSize(10)
         .fillColor(COLORS.text)
         .font('Helvetica-Bold')
         .text('Observation: ', 65, textY, { continued: true })
         .font('NotoArabic')  // Use Arabic font for Urdu/Arabic observation text
         .text(growth.observation, { width: boxWidth - 30 });

      textY += obsHeight + 8;

      // Rationale
      doc.fontSize(10)
         .font('Helvetica-Bold')
         .text('Rationale: ', 65, textY, { continued: true })
         .font('Helvetica')
         .text(growth.rationale, { width: boxWidth - 30 });

      textY += ratHeight + 12;

      // Strategies
      doc.fontSize(10)
         .font('Helvetica-Bold')
         .text('Suggested Strategies:', 65, textY);

      textY += 15;

      growth.strategies.forEach(strategy => {
        const stratHeight = doc.heightOfString(`• ${strategy}`, { width: boxWidth - 50 });
        doc.fontSize(10)
           .font('Helvetica')
           .text(`• ${strategy}`, 75, textY, { width: boxWidth - 50 });
        textY += stratHeight + 3;
      });

      doc.y = startY + totalHeight + 10;
      doc.moveDown(0.5);
    });

    doc.moveDown(1);
  }

  /**
   * Draw recommendations section
   */
  static _drawRecommendations(doc, data) {
    if (doc.y > doc.page.height - 150) {
      doc.addPage();
    }

    doc.fontSize(16)
       .fillColor(COLORS.primary)
       .font('Helvetica-Bold')
       .text('Recommendations');

    doc.moveDown(0.5);

    const startY = doc.y;
    let recHeight = 30;
    data.analysis.recommendations.forEach(rec => {
      recHeight += doc.heightOfString(`• ${rec}`, { width: doc.page.width - 140 }) + 5;
    });

    // Draw box
    doc.rect(50, startY, doc.page.width - 100, recHeight)
       .fill(COLORS.gray);

    doc.fillColor(COLORS.text)
       .fontSize(9)
       .font('Helvetica')
       .text('Based on this observation, I recommend focusing on the following actionable steps:', 65, startY + 12, {
         width: doc.page.width - 130
       });

    let textY = startY + 30;

    data.analysis.recommendations.forEach(rec => {
      const itemHeight = doc.heightOfString(`• ${rec}`, { width: doc.page.width - 140 });
      doc.fontSize(10)
         .font('Helvetica')
         .text(`• ${rec}`, 75, textY, { width: doc.page.width - 140 });
      textY += itemHeight + 5;
    });

    doc.y = startY + recHeight + 10;
    doc.moveDown(2);
  }

  /**
   * Draw footer
   */
  static _drawFooter(doc, data) {
    const footerY = doc.page.height - 80;

    doc.strokeColor(COLORS.border)
       .lineWidth(2)
       .moveTo(50, footerY)
       .lineTo(doc.page.width - 50, footerY)
       .stroke();

    const reportDate = new Date(data.reportDate).toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric'
    });

    doc.fontSize(10)
       .fillColor(COLORS.darkGray)
       .font('Helvetica-Bold')
       .text('Generated by Rumi Digital Coach', 50, footerY + 10, { align: 'center' });

    doc.fontSize(9)
       .font('Helvetica')
       .text(`${reportDate}`, { align: 'center' });

    doc.fontSize(8)
       .fillColor('#999')
       .text('Based on the Danielson Framework for Teaching and S.T.I.C.K.S. coaching principles', {
         align: 'center'
       });
  }

  /**
   * Get score label from numeric score
   */
  static _getScoreLabel(score) {
    const labels = {
      1: 'Unsatisfactory',
      2: 'Basic',
      3: 'Proficient',
      4: 'Distinguished'
    };
    return labels[Math.round(score)] || 'N/A';
  }

  /**
   * Legacy method for backward compatibility
   * Converts HTML to structured data and generates PDF
   */
  static async generatePDF(htmlContent, options = {}) {
    // For now, this is deprecated - use generateObservationReport directly
    throw new Error('generatePDF(htmlContent) is deprecated. Use generateObservationReport(data) instead.');
  }
}

module.exports = PDFService;
