const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const { logToFile } = require('../utils/logger');
const { TEMP_DIR } = require('../utils/constants');

/**
 * PDF Report Generator Service
 * Generates professional classroom observation reports using PDFKit
 * Zero system dependencies - works on any platform including Railway
 *
 * Updated with perfected design:
 * - Rumi logo aligned with heading
 * - All elements with rounded corners
 * - Improved typography and spacing
 * - Professional timestamp badges
 */
class PDFReportService {
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
   * Generate a classroom observation PDF report
   * @param {Object} reportData - Report data from GPT-5 mini analysis
   * @param {string} reportData.teacherName - Teacher's name
   * @param {string} reportData.observationDate - Date of observation
   * @param {string} reportData.subject - Subject taught
   * @param {string} reportData.topic - Lesson topic (inferred from transcript/lesson plan)
   * @param {string} reportData.observerName - Observer's name
   * @param {number} reportData.totalScore - Total score achieved
   * @param {number} reportData.maxScore - Maximum possible score
   * @param {Object} reportData.priorFeedback - Prior feedback incorporation data
   * @param {Array} reportData.goals - Array of goal objects with criteria
   * @param {Object} reportData.debriefReflection - Debrief & Reflection section data
   * @param {string} reportData.feedback - Overall feedback text
   * @returns {Promise<Buffer>} PDF buffer
   */
  static async generateClassroomObservationReport(reportData) {
    const startTime = Date.now();

    try {
      logToFile('Starting PDF report generation with perfected design', {
        teacher: reportData.teacherName,
        totalScore: reportData.totalScore,
        maxScore: reportData.maxScore
      });

      // Create PDF document
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 70, bottom: 50, left: 50, right: 50 }
      });

      // Register Urdu/Arabic font
      const urduFontPath = path.join(__dirname, '../../fonts/NotoSansArabic.ttf');
      if (fs.existsSync(urduFontPath)) {
        doc.registerFont('UrduFont', urduFontPath);
        logToFile('✓ Urdu font registered');
      }

      // Collect PDF chunks
      const chunks = [];
      doc.on('data', chunk => chunks.push(chunk));

      // Calculate percentage and performance level
      const percentage = Math.round((reportData.totalScore / reportData.maxScore) * 100);
      const performance = this._getPerformanceLevel(percentage);

      // Build PDF content
      let yPos = 50;
      yPos = this._drawHeader(doc, reportData, percentage, performance, yPos);
      yPos = this._drawTeacherInfo(doc, reportData, yPos);

      // Bug #9: Partial report note (if applicable)
      if (reportData.isPartialReport && reportData.partialReportNote) {
        yPos = this._drawPartialReportNote(doc, reportData.partialReportNote, yPos);
      }

      // Prior feedback section
      if (reportData.priorFeedback) {
        yPos = this._drawPriorFeedback(doc, reportData.priorFeedback, yPos);
      }

      // Performance Overview section
      yPos = this._drawPerformanceOverview(doc, reportData.goals, yPos);

      if (reportData.fidelitySection) {
        yPos = this._drawFidelitySection(doc, reportData.fidelitySection, yPos);
      }

      // Debrief & Reflection section (moved before Overall Feedback)
      if (reportData.debriefReflection) {
        yPos = this._drawDebriefReflection(doc, reportData.debriefReflection, yPos);
      }

      // Overall feedback (moved to end, after debrief)
      yPos = this._drawOverallFeedback(doc, reportData.feedback, yPos);

      // Footer
      this._drawFooter(doc, yPos);

      // Finalize PDF
      doc.end();

      // Wait for PDF to finish
      const pdfBuffer = await new Promise(resolve => {
        doc.on('end', () => {
          resolve(Buffer.concat(chunks));
        });
      });

      const duration = Date.now() - startTime;
      logToFile('✅ PDF report generated successfully', {
        teacher: reportData.teacherName,
        percentage: `${percentage}%`,
        performance: performance.label,
        pdfSizeKB: Math.round(pdfBuffer.length / 1024),
        durationMs: duration
      });

      return pdfBuffer;
    } catch (error) {
      logToFile('❌ Error generating PDF report', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
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
   * Render text with proper formatting for evidence lines, including quotes
   * @private
   */
  static _renderMixedText(doc, text, x, y, options = {}) {
    const { width, fontSize = 7, align = 'left', lineGap = 2 } = options;
    const lines = (text || '')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    let currentY = y;

    const renderLine = (content, fontName, color = '#000') => {
      doc.fontSize(fontSize).font(fontName).fillColor(color);
      doc.text(content, x, currentY, { width, align, lineGap });
      currentY = doc.y + 5;
    };

    for (const rawLine of lines) {
      let line = rawLine;
      const isQuote =
        /^quote:/i.test(line) ||
        /^part 2 -\s*quote:/i.test(line);

      line = line.replace(/^Part 1 - [^:]+:/i, '').trim();
      line = line.replace(/^Part 2 -\s*Quote:/i, '').trim();
      line = line.replace(/^Quote:/i, '').trim();

      if (!line) continue;

      if (isQuote) {
        const quoteText = line.replace(/^["“”]|["“”]$/g, '').trim();
        renderLine(`"${quoteText}"`, 'Helvetica-Oblique', '#666');
      } else {
        renderLine(line, 'Helvetica', '#000');
      }
    }
  }

  /**
   * Calculate height needed for text with wrapping (including quotes)
   * @private
   */
  static _calculateTextHeight(doc, text, fontSize, width, lineGap = 2) {
    if (!text) {
      return 0;
    }

    const lines = text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    let totalHeight = 0;

    for (const rawLine of lines) {
      let line = rawLine;
      const isQuote =
        /^quote:/i.test(line) ||
        /^part 2 -\s*quote:/i.test(line);

      line = line.replace(/^Part 1 - [^:]+:/i, '').trim();
      line = line.replace(/^Part 2 -\s*Quote:/i, '').trim();
      line = line.replace(/^Quote:/i, '').trim();

      if (!line) continue;

      const formatted = isQuote ? `"${line.replace(/^["“”]|["“”]$/g, '').trim()}"` : line;
      doc.fontSize(fontSize).font(isQuote ? 'Helvetica-Oblique' : 'Helvetica');
      const lineHeight = doc.heightOfString(formatted, { width, lineGap });
      totalHeight += lineHeight + 5;
    }

    return totalHeight;
  }

  /**
   * Truncate text to keep sections concise
   * @private
   */
  static _truncateText(text, maxChars = 750) {
    if (!text) return '';
    const clean = text.trim();
    if (clean.length <= maxChars) {
      return clean;
    }
    return `${clean.slice(0, maxChars).trim()}…`;
  }

  /**
   * Draw rounded progress bar
   * @private
   */
  static _drawRoundedProgressBar(doc, x, y, width, height, percentage, color, radius = 6) {
    // Background
    doc.roundedRect(x, y, width, height, radius)
       .fillAndStroke(this.COLORS.border, this.COLORS.border);

    // Filled portion
    if (percentage > 0) {
      const fillWidth = (width * percentage) / 100;
      doc.roundedRect(x, y, fillWidth, height, radius)
         .fill(color);
    }
  }

  /**
   * Draw report header with logo
   * @private
   */
  static _drawHeader(doc, reportData, percentage, performance, yPos) {
    // Add Rumi logo (top left) - aligned with heading
    try {
      const logoPath = path.join(__dirname, '../../marketing/Rumi White.jpg');
      if (fs.existsSync(logoPath)) {
        doc.image(logoPath, 50, yPos - 15, { width: 80 });
      }
    } catch (error) {
      logToFile('⚠️  Logo not found, skipping', { error: error.message });
    }

    // Header text (next to logo)
    doc.fontSize(24)
       .fillColor(this.COLORS.primary)
       .font('Helvetica-Bold')
       .text('Classroom Observation', 145, yPos + 5);

    doc.fontSize(10)
       .fillColor(this.COLORS.secondary)
       .font('Helvetica')
       .text('Teacher Performance Evaluation powered by Rumi', 145, yPos + 35);

    // Score badge (top right)
    doc.fontSize(32)
       .fillColor(this.COLORS.primary)
       .font('Helvetica-Bold')
       .text(`${percentage}%`, 450, yPos);

    doc.fontSize(10)
       .fillColor(performance.color)
       .font('Helvetica')
       .text(performance.label, 450, yPos + 40);

    // Horizontal line
    yPos += 70;
    doc.moveTo(50, yPos)
       .lineTo(545, yPos)
       .strokeColor(this.COLORS.primary)
       .lineWidth(2)
       .stroke();

    return yPos + 20;
  }

  /**
   * Draw teacher info section
   * @private
   */
  static _drawTeacherInfo(doc, data, yPos) {
    const boxHeight = 130;

    doc.roundedRect(50, yPos, 495, boxHeight, 8)
       .fillAndStroke(this.COLORS.background, this.COLORS.border);

    doc.fontSize(8)
       .fillColor(this.COLORS.secondary)
       .text('TEACHER', 60, yPos + 10);
    doc.fontSize(10)
       .fillColor('#000')
       .text(data.teacherName, 60, yPos + 25);

    doc.fontSize(8)
       .fillColor(this.COLORS.secondary)
       .text('DATE', 300, yPos + 10);
    doc.fontSize(10)
       .fillColor('#000')
       .text(data.observationDate || new Date().toLocaleDateString(), 300, yPos + 25);

    doc.fontSize(8)
       .fillColor(this.COLORS.secondary)
       .font('Helvetica')
       .text('SUBJECT', 60, yPos + 50);
    doc.fontSize(10)
       .fillColor('#000')
       .font('Helvetica')
       .text(data.subject || 'N/A', 60, yPos + 65);

    doc.fontSize(8)
       .fillColor(this.COLORS.secondary)
       .font('Helvetica')
       .text('TOPIC', 300, yPos + 50);
    doc.fontSize(10)
       .fillColor('#000')
       .font('Helvetica')
       .text(data.topic || 'N/A', 300, yPos + 65);

    doc.fontSize(8)
       .fillColor(this.COLORS.secondary)
       .font('Helvetica')
       .text('LESSON PLAN', 60, yPos + 90);
    doc.fontSize(10)
       .fillColor('#000')
       .font('Helvetica')
       .text(data.hasLessonPlan ? 'Submitted' : 'Not Submitted', 60, yPos + 105);

    return yPos + boxHeight + 20;
  }

  /**
   * Bug #9: Draw partial report note banner
   * @param {PDFDocument} doc - PDF document
   * @param {string} noteText - Partial report note text
   * @param {number} yPos - Current Y position
   * @returns {number} New Y position
   * @private
   */
  static _drawPartialReportNote(doc, noteText, yPos) {
    // Add spacing before the note
    yPos += 15;

    // Calculate text height for dynamic box sizing
    const textHeight = this._calculateTextHeight(doc, noteText, 9, 470, 2);
    const boxHeight = textHeight + 20; // Padding top and bottom

    // Draw orange/amber warning box
    doc.roundedRect(50, yPos, 495, boxHeight, 8)
       .fillAndStroke('#FFF8E1', '#FF9800'); // Amber background with orange border

    // Draw warning icon (exclamation mark)
    doc.fontSize(14)
       .fillColor('#FF6600')
       .font('Helvetica-Bold')
       .text('⚠', 60, yPos + 8);

    // Draw note text
    doc.fontSize(9)
       .fillColor('#6D4C00')
       .font('Helvetica')
       .text(noteText, 80, yPos + 10, {
         width: 450,
         lineGap: 2
       });

    return yPos + boxHeight + 15;
  }

  /**
   * Draw prior feedback section
   * @private
   */
  static _drawPriorFeedback(doc, priorFeedback, yPos) {
    // Add spacing before the section
    yPos += 20;

    // Check if this is first observation (competency_score = 1 and specific evidence pattern)
    const isFirstObservation = priorFeedback.evidence &&
                               priorFeedback.evidence.includes("first observed lesson") &&
                               priorFeedback.competency_score === 1;

    // For first observations, show empty state with explanation
    if (isFirstObservation) {
      const emptyMessage = "This criterion is not applicable because this is the teacher's first observed lesson with Rumi. Future reports will assess how the teacher incorporates feedback from this observation.";
      const evidenceHeight = this._calculateTextHeight(doc, emptyMessage, 7, 470, 2);

      // Include space for the section heading inside the box
      const boxHeight = 35 + 45 + 18 + evidenceHeight + 12;

      doc.roundedRect(50, yPos, 495, boxHeight, 8)
         .fillAndStroke(this.COLORS.background, this.COLORS.border);

      // Draw the section heading INSIDE the box
      doc.fontSize(14)
         .fillColor(this.COLORS.primary)
         .font('Helvetica-Bold')
         .text('Incorporation of Prior Feedback', 60, yPos + 12);

      doc.fontSize(10)
         .fillColor(this.COLORS.secondary)
         .font('Helvetica')
         .text('SCORE', 60, yPos + 45);

      doc.fontSize(12)
         .fillColor('#000')
         .font('Helvetica-Bold')
         .text('N/A', 60, yPos + 60);

      doc.fontSize(7)
         .fillColor(this.COLORS.secondary)
         .font('Helvetica')
         .text('EVIDENCE', 60, yPos + 80);

      doc.fontSize(7)
         .fillColor('#666')
         .font('Helvetica-Oblique')
         .text(emptyMessage, 60, yPos + 98, { width: 470, align: 'left', lineGap: 2 });

      return yPos + boxHeight + 30;
    }

    // Calculate evidence text height for normal case
    const evidence = priorFeedback.evidence || 'N/A';
    const evidenceHeight = this._calculateTextHeight(doc, evidence, 7, 470, 2);

    // Build box height step by step
    let boxHeight = 35; // Space for section heading
    boxHeight += 45; // Space for SCORE label + value + progress bar
    boxHeight += 18; // Space for EVIDENCE label
    boxHeight += evidenceHeight; // Actual evidence text height
    boxHeight += 12; // Bottom padding

    // Prior feedback box with dynamic height
    doc.roundedRect(50, yPos, 495, boxHeight, 8)
       .fillAndStroke(this.COLORS.background, this.COLORS.border);

    // Draw the section heading INSIDE the box
    doc.fontSize(14)
       .fillColor(this.COLORS.primary)
       .font('Helvetica-Bold')
       .text('Incorporation of Prior Feedback', 60, yPos + 12);

    doc.fontSize(10)
       .fillColor(this.COLORS.secondary)
       .font('Helvetica')
       .text('SCORE', 60, yPos + 45);

    const score = priorFeedback.computed_marks || priorFeedback.score || 0;
    const maxScore = priorFeedback.max_marks || priorFeedback.maxScore || 5;

    doc.fontSize(12)
       .fillColor('#000')
       .font('Helvetica-Bold')
       .text(`${score}/${maxScore}`, 60, yPos + 60);

    // Rounded progress bar for prior feedback
    const priorPct = maxScore > 0
      ? Math.round((score / maxScore) * 100)
      : 0;
    const priorBarColor = priorPct >= 85 ? this.COLORS.excellent :
                          priorPct >= 70 ? this.COLORS.proficient :
                          priorPct >= 55 ? this.COLORS.developing : this.COLORS.emerging;

    this._drawRoundedProgressBar(doc, 130, yPos + 60, 200, 10, priorPct, priorBarColor);

    // Evidence label
    doc.fontSize(7)
       .fillColor(this.COLORS.secondary)
       .font('Helvetica')
       .text('EVIDENCE', 60, yPos + 80);

    // Evidence text with mixed English/Urdu rendering
    this._renderMixedText(doc, evidence, 60, yPos + 98, {
      width: 470,
      fontSize: 7,
      lineGap: 2
    });

    return yPos + boxHeight + 20;
  }

  /**
   * Draw performance overview section
   * @private
   */
  static _drawPerformanceOverview(doc, goals, yPos) {
    doc.fontSize(18)
       .fillColor(this.COLORS.primary)
       .font('Helvetica-Bold')
       .text('Performance Overview', 50, yPos);

    yPos += 30;

    // Render each goal
    for (const goal of goals || []) {
      // Check if we need a new page
      if (yPos > 700) {
        doc.addPage();
        yPos = 50;
      }

      const goalPct = Math.round((goal.score / goal.maxScore) * 100);
      const barColor = goalPct >= 85 ? this.COLORS.excellent :
                       goalPct >= 70 ? this.COLORS.proficient :
                       goalPct >= 55 ? this.COLORS.developing : this.COLORS.emerging;

      // Goal header
      doc.fontSize(12)
         .fillColor('#000')
         .font('Helvetica-Bold')
         .text(goal.title, 50, yPos);

      doc.fontSize(10)
         .fillColor(this.COLORS.secondary)
         .font('Helvetica')
         .text(`${goal.score}/${goal.maxScore}`, 450, yPos);

      yPos += 20;

      // Rounded progress bar
      this._drawRoundedProgressBar(doc, 50, yPos, 495, 10, goalPct, barColor);

      yPos += 20;

      // Criteria
      for (const criterion of goal.criteria || []) {
        // Calculate evidence height FIRST before creating box
        const evidenceText = criterion.evidence || '';
        let criterionBoxHeight = 28; // Base height for header (name + score)

        if (evidenceText) {
          // Add space for EVIDENCE label
          criterionBoxHeight += 18;
          // Calculate actual text height
          const evidenceHeight = this._calculateTextHeight(doc, evidenceText, 7, 470, 2);
          // Add text height
          criterionBoxHeight += evidenceHeight;
          // Add bottom padding
          criterionBoxHeight += 12;
        } else {
          criterionBoxHeight += 12; // Just add bottom padding if no evidence
        }

        // Check if the box fits on current page; if not, move to new page
        if (yPos + criterionBoxHeight > 750) {
          doc.addPage();
          yPos = 50;
        }

        // Criterion box with dynamic height
        doc.roundedRect(50, yPos, 495, criterionBoxHeight, 8)
           .fillAndStroke(this.COLORS.background, this.COLORS.border);

        doc.fontSize(9)
           .fillColor('#000')
           .font('Helvetica-Bold')
           .text(criterion.name, 60, yPos + 10);

        doc.fontSize(9)
           .fillColor(this.COLORS.secondary)
           .font('Helvetica')
           .text(`${criterion.score}/${criterion.max}`, 480, yPos + 10);

        // Evidence paragraph
        if (criterion.evidence) {
          doc.fontSize(7)
             .fillColor(this.COLORS.secondary)
             .font('Helvetica')
             .text('EVIDENCE', 60, yPos + 28);

          this._renderMixedText(doc, criterion.evidence, 60, yPos + 46, {
            width: 470,
            fontSize: 7,
            lineGap: 2
          });
        }

        yPos += criterionBoxHeight + 10;
      }

      yPos += 10;
    }

    return yPos;
  }

  /**
   * Draw fidelity to lesson plan section
   * @private
   */
  static _drawFidelitySection(doc, fidelity, yPos) {
    const columnWidths = [120, 160, 190];
    const summaryText = this._truncateText(
      fidelity.commentary || fidelity.note || 'Teacher followed the submitted plan with minor adaptations.',
      600
    );
    const strengthsList = (fidelity.strengths || []).slice(0, 3);
    const gapsList = (fidelity.gaps || []).slice(0, 3);
    const strengthsText = strengthsList.length ? `• ${strengthsList.join('\n• ')}` : '';
    const gapsText = gapsList.length ? `• ${gapsList.join('\n• ')}` : '';
    const evidenceItems = fidelity.evidence || [];

    const summaryHeight = summaryText ? this._calculateTextHeight(doc, summaryText, 8, 470, 2) : 0;
    const strengthsHeight = strengthsText ? this._calculateTextHeight(doc, strengthsText, 8, 470, 2) : 0;
    const gapsHeight = gapsText ? this._calculateTextHeight(doc, gapsText, 8, 470, 2) : 0;
    const evidenceHeight = evidenceItems.length
      ? this._estimateFidelityEvidenceHeight(doc, evidenceItems, columnWidths)
      : 0;

    const scoreBoxHeight = 50;
    let detailBoxHeight = 15;
    if (summaryHeight) {
      detailBoxHeight += 12 + summaryHeight + 10;
    }
    if (strengthsHeight) {
      detailBoxHeight += 12 + strengthsHeight + 10;
    }
    if (gapsHeight) {
      detailBoxHeight += 12 + gapsHeight + 10;
    }
    if (evidenceHeight) {
      detailBoxHeight += 12 + evidenceHeight + 10;
    }
    detailBoxHeight += 5;

    const sectionTotalHeight = 30 + scoreBoxHeight + 15 + detailBoxHeight;
    if (yPos + sectionTotalHeight > 750) {
      doc.addPage();
      yPos = 50;
    }

    doc.fontSize(18)
       .fillColor(this.COLORS.primary)
       .font('Helvetica-Bold')
       .text('Fidelity to Lesson Plan', 50, yPos);

    yPos += 30;

    doc.roundedRect(50, yPos, 495, scoreBoxHeight, 8)
       .fillAndStroke(this.COLORS.background, this.COLORS.border);

    doc.fontSize(10)
       .fillColor(this.COLORS.secondary)
       .font('Helvetica')
       .text('Informational Score (not counted towards total)', 60, yPos + 10);

    const pct = fidelity.maxScore ? Math.round((fidelity.score / fidelity.maxScore) * 100) : 0;
    doc.fontSize(12)
       .fillColor('#000')
       .font('Helvetica-Bold')
       .text(`${fidelity.score || 0}/${fidelity.maxScore || 100}`, 60, yPos + 28);

    const barColor = pct >= 85 ? this.COLORS.excellent :
                     pct >= 70 ? this.COLORS.proficient :
                     pct >= 55 ? this.COLORS.developing : this.COLORS.emerging;
    this._drawRoundedProgressBar(doc, 200, yPos + 30, 300, 10, pct, barColor);

    yPos += scoreBoxHeight + 15;

    doc.roundedRect(50, yPos, 495, detailBoxHeight, 8)
       .fillAndStroke(this.COLORS.background, this.COLORS.border);

    let cursor = yPos + 15;

    if (summaryHeight) {
      doc.fontSize(8)
         .fillColor(this.COLORS.secondary)
         .font('Helvetica-Bold')
         .text('SUMMARY', 60, cursor);
      cursor += 12;
      doc.fontSize(8)
         .fillColor('#000')
         .font('Helvetica')
         .text(summaryText, 60, cursor, { width: 470, align: 'left', lineGap: 2 });
      cursor = doc.y + 10;
    }

    if (strengthsHeight) {
      doc.fontSize(8)
         .fillColor(this.COLORS.secondary)
         .font('Helvetica-Bold')
         .text('STRENGTHS', 60, cursor);
      cursor += 12;
      doc.fontSize(8)
         .fillColor('#000')
         .font('Helvetica')
         .text(strengthsText, 60, cursor, { width: 470, align: 'left', lineGap: 2 });
      cursor = doc.y + 10;
    }

    if (gapsHeight) {
      doc.fontSize(8)
         .fillColor(this.COLORS.secondary)
         .font('Helvetica-Bold')
         .text('GAPS', 60, cursor);
      cursor += 12;
      doc.fontSize(8)
         .fillColor('#000')
         .font('Helvetica')
         .text(gapsText, 60, cursor, { width: 470, align: 'left', lineGap: 2 });
      cursor = doc.y + 10;
    }

    if (evidenceHeight) {
      doc.fontSize(8)
         .fillColor(this.COLORS.secondary)
         .font('Helvetica-Bold')
         .text('EVIDENCE (PLANNED VS EXECUTED)', 60, cursor);
      cursor += 18;
      const tableHeight = this._drawFidelityEvidenceTable(doc, evidenceItems, 60, cursor, columnWidths);
      cursor += tableHeight + 10;
    }

    return yPos + detailBoxHeight + 20;
  }

  /**
   * Estimate table height for fidelity evidence (used for pagination)
   * @private
   */
  static _estimateFidelityEvidenceHeight(doc, items, columnWidths) {
    if (!items.length) {
      return 0;
    }

    const totalWidth = columnWidths.reduce((sum, w) => sum + w, 0);
    let height = 12; // header height + rule

    items.forEach((item) => {
      const aspect = item.aspect || 'Aspect';
      const planned = item.planned || 'N/A';
      const executed = [
        item.executed || 'N/A',
        item.timestamp ? `(Timestamp: ${item.timestamp})` : ''
      ]
        .filter(Boolean)
        .join('\n');

      doc.fontSize(7).font('Helvetica-Bold');
      const aspectHeight = doc.heightOfString(aspect, { width: columnWidths[0], lineGap: 2 });
      doc.font('Helvetica-Oblique');
      const plannedHeight = doc.heightOfString(`"${planned}"`, { width: columnWidths[1], lineGap: 2 });
      doc.font('Helvetica');
      const executedHeight = doc.heightOfString(executed, { width: columnWidths[2], lineGap: 2 });

      const rowHeight = Math.max(aspectHeight, plannedHeight, executedHeight) + 8;
      height += rowHeight;
    });

    // Reset font and add padding underneath table
    doc.font('Helvetica');
    return height + 5;
  }

  /**
   * Draw three-column fidelity evidence table
   * @private
   */
  static _drawFidelityEvidenceTable(doc, items, x, y, columnWidths) {
    const [aspectWidth, plannedWidth, executedWidth] = columnWidths;
    const totalWidth = columnWidths.reduce((sum, w) => sum + w, 0);
    let currentY = y;

    // Header
    doc.fontSize(7)
       .fillColor('#000')
       .font('Helvetica-Bold')
       .text('Aspect', x, currentY, { width: aspectWidth, lineGap: 2 });
    doc.text('Planned', x + aspectWidth, currentY, { width: plannedWidth, lineGap: 2 });
    doc.text('Executed', x + aspectWidth + plannedWidth, currentY, { width: executedWidth, lineGap: 2 });

    const headerBottom = currentY + doc.heightOfString('Aspect', { width: aspectWidth, lineGap: 2 }) + 4;
    doc.moveTo(x, headerBottom)
       .lineTo(x + totalWidth, headerBottom)
       .strokeColor(this.COLORS.border)
       .lineWidth(0.5)
       .stroke()
       .lineWidth(1);

    currentY = headerBottom + 4;

    items.forEach((item) => {
      const aspect = this._formatFidelityAspect(item.aspect);
      const planned = item.planned || 'N/A';
      const executed = [
        item.executed || 'N/A',
        item.timestamp ? `(Timestamp: ${item.timestamp})` : ''
      ]
        .filter(Boolean)
        .join('\n');

      doc.fontSize(7).font('Helvetica-Bold').fillColor('#000');
      const aspectHeight = doc.heightOfString(aspect, { width: aspectWidth, lineGap: 2 });
      doc.text(aspect, x, currentY, { width: aspectWidth, lineGap: 2 });

      doc.font('Helvetica-Oblique');
      const plannedHeight = doc.heightOfString(`"${planned}"`, { width: plannedWidth, lineGap: 2 });
      doc.text(`"${planned}"`, x + aspectWidth, currentY, { width: plannedWidth, lineGap: 2 });

      doc.font('Helvetica').fillColor('#000');
      const executedHeight = doc.heightOfString(executed, { width: executedWidth, lineGap: 2 });
      doc.text(executed, x + aspectWidth + plannedWidth, currentY, { width: executedWidth, lineGap: 2 });

      const rowHeight = Math.max(aspectHeight, plannedHeight, executedHeight) + 8;
      currentY += rowHeight;
    });

    doc.strokeColor(this.COLORS.border);
    doc.font('Helvetica');
    return currentY - y;
  }

  /**
   * Normalize aspect label for fidelity table
   * @private
   */
  static _formatFidelityAspect(aspect) {
    if (!aspect) {
      return 'Aspect';
    }
    return aspect
      .replace(/^\s*planned\s*/i, '')
      .replace(/\s*vs\.?\s*executed.*$/i, '')
      .replace(/\s*vs\s+implemented.*$/i, '')
      .trim() || 'Aspect';
  }

  /**
   * Draw overall feedback section
   * @private
   */
  static _drawOverallFeedback(doc, feedback, yPos) {
    // Check if we need a new page
    if (yPos > 650) {
      doc.addPage();
      yPos = 50;
    }

    // Calculate feedback text height
    const feedbackText = feedback || 'No feedback provided.';
    const feedbackHeight = this._calculateTextHeight(doc, feedbackText, 9, 470, 2);

    // Build box height step by step
    let boxHeight = 30; // Header height (Overall Feedback title)
    boxHeight += feedbackHeight; // Actual feedback text height
    boxHeight += 12; // Bottom padding

    doc.roundedRect(50, yPos, 495, boxHeight, 8)
       .fillAndStroke(this.COLORS.background, this.COLORS.border);

    doc.fontSize(12)
       .fillColor(this.COLORS.primary)
       .font('Helvetica-Bold')
       .text('Overall Feedback', 60, yPos + 10);

    doc.fontSize(9)
       .fillColor('#000')
       .font('Helvetica')
       .text(feedbackText, 60, yPos + 30, { width: 470, align: 'left', lineGap: 2 });

    return yPos + boxHeight + 20;
  }

  /**
   * Draw Debrief & Reflection section
   * @private
   */
  static _drawDebriefReflection(doc, debriefReflection, yPos) {
    // Check if we need a new page
    if (yPos > 650) {
      doc.addPage();
      yPos = 50;
    }

    doc.fontSize(18)
       .fillColor(this.COLORS.primary)
       .font('Helvetica-Bold')
       .text('Debrief & Reflection', 50, yPos);

    yPos += 30;

    // Score summary box
    doc.roundedRect(50, yPos, 495, 40, 8)
       .fillAndStroke(this.COLORS.background, this.COLORS.border);

    doc.fontSize(10)
       .fillColor(this.COLORS.secondary)
       .font('Helvetica')
       .text('TOTAL SCORE', 60, yPos + 10);

    doc.fontSize(12)
       .fillColor('#000')
       .font('Helvetica-Bold')
       .text(`${debriefReflection.score}/${debriefReflection.maxScore}`, 60, yPos + 25);

    // Progress bar for debrief section
    const debriefPct = debriefReflection.maxScore > 0
      ? Math.round((debriefReflection.score / debriefReflection.maxScore) * 100)
      : 0;
    const debriefBarColor = debriefPct >= 85 ? this.COLORS.excellent :
                            debriefPct >= 70 ? this.COLORS.proficient :
                            debriefPct >= 55 ? this.COLORS.developing : this.COLORS.emerging;

    this._drawRoundedProgressBar(doc, 200, yPos + 25, 300, 10, debriefPct, debriefBarColor);

    yPos += 55;

    // Render each criterion
    for (const criterion of debriefReflection.criteria || []) {
      // Check if we need a new page
      if (yPos > 680) {
        doc.addPage();
        yPos = 50;
      }

      // Calculate heights for dynamic box
      const evidenceText = criterion.evidence || '';
      const justificationText = criterion.justification || '';

      // Build box height step by step
      let boxHeight = 28; // Header (criterion name + score)

      let evidenceHeight = 0;
      if (evidenceText) {
        boxHeight += 18; // EVIDENCE label space
        evidenceHeight = this._calculateTextHeight(doc, evidenceText, 7, 470, 2);
        boxHeight += evidenceHeight; // Actual evidence text height
      }

      if (justificationText) {
        boxHeight += 18; // JUSTIFICATION label space
        const justificationHeight = this._calculateTextHeight(doc, justificationText, 7, 380, 2);
        boxHeight += justificationHeight; // Actual justification text height
      }

      boxHeight += 12; // Bottom padding

      // Criterion box with dynamic height
      doc.roundedRect(50, yPos, 495, boxHeight, 8)
         .fillAndStroke(this.COLORS.background, this.COLORS.border);

      doc.fontSize(9)
         .fillColor('#000')
         .font('Helvetica-Bold')
         .text(criterion.name, 60, yPos + 10);

      doc.fontSize(9)
         .fillColor(this.COLORS.secondary)
         .font('Helvetica')
         .text(`${criterion.score}/${criterion.max}`, 480, yPos + 10);

      let currentY = yPos + 28;

      // Evidence section
      if (criterion.evidence) {
        doc.fontSize(7)
           .fillColor(this.COLORS.secondary)
           .font('Helvetica')
           .text('EVIDENCE', 60, currentY);

        this._renderMixedText(doc, criterion.evidence, 60, currentY + 18, {
          width: 470,
          fontSize: 7,
          lineGap: 2
        });

        currentY += 18 + evidenceHeight;
      }

      // Justification section (if provided)
      if (criterion.justification) {
        doc.fontSize(7)
           .fillColor(this.COLORS.secondary)
           .font('Helvetica')
           .text('JUSTIFICATION', 60, currentY);

        doc.fontSize(7)
           .fillColor('#000')
           .font('Helvetica')
           .text(criterion.justification, 150, currentY, {
             width: 380,
             lineGap: 2
           });
      }

      yPos += boxHeight + 10;
    }

    return yPos + 10;
  }

  /**
   * Draw footer
   * @private
   */
  static _drawFooter(doc, yPos) {
    doc.fontSize(7)
       .fillColor(this.COLORS.secondary)
       .text(`Generated by Rumi • Supporting teachers everywhere • ${new Date().toLocaleDateString()}`, 50, yPos, {
         width: 495,
         align: 'center'
       });
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

module.exports = PDFReportService;
