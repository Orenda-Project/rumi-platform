/**
 * Reading Assessment Report Generator Service
 * Generates professional reading assessment reports using PDFKit
 *
 * Design Pattern: Follows coaching report design (rounded corners, consistent typography, progress bars)
 *
 * Report Sections:
 * 1. Header with logo + title + WCPM score badge
 * 2. Student & Assessment Info
 * 3. Passage Display (the text that was read)
 * 4. Fluency Metrics (WCPM, accuracy, time)
 * 5. Benchmark Comparison (grade-level expectations)
 * 6. Error Analysis (omissions, insertions, substitutions)
 * 7. Pronunciation Assessment (if English)
 * 8. Diagnostic Summary & Recommendations
 * 9. Footer
 */

const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const { getClient } = require('../llm-client');
const { logToFile } = require('../../utils/logger');
const { TEMP_DIR, OPENAI_API_KEY } = require('../../utils/constants');
const { htmlToPdf } = require('../../utils/html-to-pdf');
const renderReadingReportHtml = require('../../templates/reading-report.template');

// OpenAI client for translating non-Latin text
const openai = getClient();

class ReadingReportService {
  // Brand colors (matching coaching report)
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
   * Bug #22 Fix: Check if text contains non-Latin characters (Arabic/Urdu/etc.)
   * PDFKit cannot render these with standard Helvetica font
   * @param {string} text - Text to check
   * @returns {boolean} True if contains non-Latin characters
   */
  static _containsNonLatinText(text) {
    if (!text) return false;
    // Arabic Unicode range: \u0600-\u06FF (includes Urdu)
    // Also check for common Arabic presentation forms
    return /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/.test(text);
  }

  /**
   * Bug #22 Fix: Translate non-Latin text to English for PDF display
   * @param {string} text - Non-Latin text to translate
   * @returns {Promise<string>} Translated English text
   */
  static async _translateToEnglish(text) {
    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are a translator. Translate the given text to English. Return ONLY the translation, nothing else. Keep it concise.'
          },
          {
            role: 'user',
            content: text
          }
        ],
        temperature: 0.3,
        max_tokens: 100
      });
      return response.choices[0].message.content.trim();
    } catch (error) {
      logToFile('⚠️ Translation failed, using original text', { text, error: error.message });
      return `[Non-Latin text: ${text.length} chars]`;
    }
  }

  /**
   * Generate reading assessment PDF report
   * @param {Object} reportData - Report data
   * @param {string} reportData.studentIdentifier - Student name/identifier
   * @param {string} reportData.teacherName - Teacher's name
   * @param {string} reportData.assessmentDate - Date of assessment
   * @param {string} reportData.language - Language ('en' or 'ur')
   * @param {number} reportData.gradeLevel - Grade level (0-3)
   * @param {string} reportData.passageType - Type of passage
   * @param {string} reportData.passageText - The passage that was read
   * @param {number} reportData.wcpm - Words Correct Per Minute
   * @param {number} reportData.accuracy - Accuracy percentage
   * @param {number} reportData.timeElapsed - Time elapsed in seconds
   * @param {number} reportData.wordsCorrect - Number of correct words
   * @param {number} reportData.totalWords - Total words in passage
   * @param {Object} reportData.benchmark - Benchmark comparison data
   * @param {Array} reportData.errors - Error analysis array
   * @param {Object} reportData.pronunciation - Pronunciation assessment (if English)
   * @param {string} reportData.diagnosticSummary - GPT-4 diagnostic summary
   * @returns {Promise<Buffer>} PDF buffer
   */
  static async generateReadingAssessmentReport(reportData) {
    // HTML→PDF via Playwright is the default — Chromium's HarfBuzz pipeline
    // renders Urdu Nastaliq + RTL correctly. PDFKit is kept as an automatic
    // fallback for any render failure (e.g. Chromium not installed on the host,
    // unexpected data shape), so a deployment without Chromium still gets a report.
    try {
      logToFile('📄 Generating reading report via HTML→PDF', {
        student: reportData.studentIdentifier,
        language: reportData.language,
      });
      const html = renderReadingReportHtml(reportData);
      return await htmlToPdf(html);
    } catch (error) {
      logToFile('⚠️ HTML→PDF render failed, falling back to PDFKit', {
        error: error.message,
        student: reportData.studentIdentifier,
      });
      return this._generateReadingReportPdfKit(reportData);
    }
  }

  /**
   * Status-quo PDFKit renderer. Kept as an automatic fallback for any
   * HTML→PDF render failure (e.g. Chromium unavailable).
   * @private
   */
  static async _generateReadingReportPdfKit(reportData) {
    const startTime = Date.now();

    try {
      logToFile('Starting reading assessment PDF report generation', {
        student: reportData.studentIdentifier,
        wcpm: reportData.wcpm,
        accuracy: reportData.accuracy
      });

      // Create PDF document
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 70, bottom: 50, left: 50, right: 50 }
      });

      // Register Urdu/Arabic font if needed
      const urduFontPath = path.join(__dirname, '../../../fonts/NotoSansArabic.ttf');
      if (fs.existsSync(urduFontPath)) {
        doc.registerFont('UrduFont', urduFontPath);
        logToFile('✓ Urdu font registered');
      }

      // Collect PDF chunks
      const chunks = [];
      doc.on('data', chunk => chunks.push(chunk));

      // Determine performance level based on benchmark
      const performance = this._getPerformanceLevel(
        reportData.benchmark.onTrack,
        reportData.benchmark.percentileRank
      );

      // Build PDF content
      let yPos = 50;
      yPos = this._drawHeader(doc, reportData, performance, yPos);
      yPos = this._drawStudentInfo(doc, reportData, yPos);
      yPos = this._drawPassage(doc, reportData, yPos);
      yPos = this._drawFluencyMetrics(doc, reportData, yPos);
      yPos = this._drawBenchmarkComparison(doc, reportData, yPos);

      if (reportData.errors && reportData.errors.length > 0) {
        yPos = this._drawErrorAnalysis(doc, reportData, yPos);
      }

      // Bug #19 Fix: Add mispronunciation details section (English only)
      if (reportData.pronunciation && reportData.language === 'en') {
        yPos = this._drawMispronunciationDetails(doc, reportData, yPos);
        yPos = this._drawPronunciationAssessment(doc, reportData, yPos);
      }

      // Sprint 1.8: Add comprehension assessment section if completed
      if (reportData.comprehension) {
        yPos = await this._drawComprehensionAssessment(doc, reportData, yPos);
      }

      yPos = this._drawDiagnosticSummary(doc, reportData, yPos);

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
      logToFile('✅ Reading assessment PDF report generated successfully', {
        student: reportData.studentIdentifier,
        wcpm: reportData.wcpm,
        performance: performance.label,
        pdfSizeKB: Math.round(pdfBuffer.length / 1024),
        durationMs: duration
      });

      return pdfBuffer;
    } catch (error) {
      logToFile('❌ Error generating reading assessment PDF report', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Get performance level based on benchmark status
   * @param {boolean} onTrack - Whether student is on track
   * @param {string} percentileRank - Percentile rank ('below', 'at', 'above')
   * @returns {Object} Performance level with label and color
   * @private
   */
  static _getPerformanceLevel(onTrack, percentileRank) {
    if (percentileRank === 'above') return { label: 'Excellent', color: this.COLORS.excellent };
    if (onTrack && percentileRank === 'at') return { label: 'Proficient', color: this.COLORS.proficient };
    if (onTrack && percentileRank === 'below') return { label: 'Developing', color: this.COLORS.developing };
    return { label: 'Emerging', color: this.COLORS.emerging };
  }

  /**
   * Draw rounded progress bar (same as coaching report)
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
   * Calculate height needed for text with wrapping
   * @private
   */
  static _calculateTextHeight(doc, text, fontSize, width, lineGap = 2) {
    doc.fontSize(fontSize).font('Helvetica');
    return doc.heightOfString(text, { width, lineGap });
  }

  /**
   * Draw report header with logo
   * @private
   */
  static _drawHeader(doc, reportData, performance, yPos) {
    // Add Rumi logo (top left)
    try {
      const logoPath = path.join(__dirname, '../../../marketing/Rumi White.jpg');
      if (fs.existsSync(logoPath)) {
        doc.image(logoPath, 50, yPos - 15, { width: 80 });
      }
    } catch (error) {
      logToFile('⚠️ Logo not found, skipping', { error: error.message });
    }

    // Header text (next to logo)
    doc.fontSize(24)
       .fillColor(this.COLORS.primary)
       .font('Helvetica-Bold')
       .text('Reading Assessment', 145, yPos + 5);

    doc.fontSize(10)
       .fillColor(this.COLORS.secondary)
       .font('Helvetica')
       .text('Student Reading Fluency Evaluation powered by Rumi', 145, yPos + 35);

    // Bug #6 Fix: Dynamic metric name based on passage type
    const metricInfo = this._getMetricInfo(reportData.passageType);

    // Fluency score badge (top right) - uses dynamic metric name
    doc.fontSize(32)
       .fillColor(this.COLORS.primary)
       .font('Helvetica-Bold')
       .text(`${Math.round(reportData.wcpm)}`, 460, yPos);

    doc.fontSize(8)
       .fillColor(this.COLORS.secondary)
       .font('Helvetica')
       .text(metricInfo.shortName, 467, yPos + 40);

    doc.fontSize(10)
       .fillColor(performance.color)
       .font('Helvetica')
       .text(performance.label, 450, yPos + 52);

    // Horizontal line
    yPos += 80;
    doc.moveTo(50, yPos)
       .lineTo(545, yPos)
       .strokeColor(this.COLORS.primary)
       .lineWidth(2)
       .stroke();

    return yPos + 20;
  }

  /**
   * Draw student & assessment info section
   * @private
   */
  static _drawStudentInfo(doc, data, yPos) {
    doc.roundedRect(50, yPos, 495, 120, 8)
       .fillAndStroke(this.COLORS.background, this.COLORS.border);

    doc.fontSize(8)
       .fillColor(this.COLORS.secondary)
       .text('STUDENT', 60, yPos + 10);
    doc.fontSize(10)
       .fillColor('#000')
       .text(data.studentIdentifier, 60, yPos + 25);

    doc.fontSize(8)
       .fillColor(this.COLORS.secondary)
       .text('DATE', 300, yPos + 10);
    doc.fontSize(10)
       .fillColor('#000')
       .text(data.assessmentDate || new Date().toLocaleDateString(), 300, yPos + 25);

    doc.fontSize(8)
       .fillColor(this.COLORS.secondary)
       .font('Helvetica')
       .text('GRADE LEVEL', 60, yPos + 50);
    doc.fontSize(10)
       .fillColor('#000')
       .font('Helvetica')
       .text(this._getGradeLabel(data.gradeLevel), 60, yPos + 65);

    doc.fontSize(8)
       .fillColor(this.COLORS.secondary)
       .font('Helvetica')
       .text('LANGUAGE', 200, yPos + 50);
    doc.fontSize(10)
       .fillColor('#000')
       .font('Helvetica')
       .text(data.language === 'ur' ? 'Urdu' : 'English', 200, yPos + 65);

    doc.fontSize(8)
       .fillColor(this.COLORS.secondary)
       .font('Helvetica')
       .text('PASSAGE TYPE', 350, yPos + 50);
    doc.fontSize(10)
       .fillColor('#000')
       .font('Helvetica')
       .text(this._capitalizeFirst(data.passageType), 350, yPos + 65);

    doc.fontSize(8)
       .fillColor(this.COLORS.secondary)
       .text('TEACHER', 60, yPos + 90);
    doc.fontSize(10)
       .fillColor('#000')
       .text(data.teacherName || 'N/A', 60, yPos + 105);

    return yPos + 135;
  }

  /**
   * Draw passage display section
   * @private
   */
  static _drawPassage(doc, data, yPos) {
    // Check if we need a new page
    if (yPos > 650) {
      doc.addPage();
      yPos = 50;
    }

    doc.fontSize(14)
       .fillColor(this.COLORS.primary)
       .font('Helvetica-Bold')
       .text('Reading Passage', 50, yPos);

    yPos += 25;

    const passageText = data.passageText || 'N/A';

    // Bug #28 Fix: Detect words-type passages and render in 2-column layout
    if (data.passageType === 'words') {
      // Words type: 2-column layout (matches WhatsApp image)
      let words = passageText.split('\n').filter(w => w.trim().length > 0);

      // Bug #2a Fix: passageText is now stored in HORIZONTAL reading order
      // (w0, w7, w1, w8, w2, w9, ...) but PDF needs COLUMN order for visual display
      // Convert back: horizontal → column order
      if (words.length === 14) {
        const leftColumn = [];
        const rightColumn = [];
        for (let i = 0; i < 14; i += 2) {
          leftColumn.push(words[i]);      // Even indices: w0, w1, w2, ... (original left)
          rightColumn.push(words[i + 1]); // Odd indices: w7, w8, w9, ... (original right)
        }
        words = [...leftColumn, ...rightColumn]; // Back to column order
      }

      const wordsPerColumn = 7;
      const leftColumn = words.slice(0, wordsPerColumn);
      const rightColumn = words.slice(wordsPerColumn);

      const boxHeight = 200; // Fixed height for 7 words per column

      // Bug #19 Fix: Removed incorrect "words can be read in any order" note
      // Words should be read left-to-right, row by row

      doc.roundedRect(50, yPos, 495, boxHeight, 8)
         .fillAndStroke(this.COLORS.background, this.COLORS.border);

      // Use Urdu font if language is Urdu
      const fontName = (data.language === 'ur' && fs.existsSync(path.join(__dirname, '../../../fonts/NotoSansArabic.ttf')))
        ? 'UrduFont'
        : 'Helvetica';

      const align = data.language === 'ur' ? 'right' : 'left';
      const fontSize = 10;
      const lineGap = 8;

      doc.fontSize(fontSize)
         .fillColor('#000')
         .font(fontName);

      // Calculate column positions
      const columnWidth = 220;
      const leftColumnX = 70;
      const rightColumnX = 310;

      // Draw left column
      let leftY = yPos + 20;
      leftColumn.forEach(word => {
        doc.text(word, leftColumnX, leftY, { width: columnWidth, align: align });
        leftY += fontSize + lineGap;
      });

      // Draw right column
      let rightY = yPos + 20;
      rightColumn.forEach(word => {
        doc.text(word, rightColumnX, rightY, { width: columnWidth, align: align });
        rightY += fontSize + lineGap;
      });

      return yPos + boxHeight + 20;

    } else {
      // Non-words type: Single-column layout (original behavior)
      // BUG #3 FIX: Calculate height with CORRECT font (Urdu font is taller than Helvetica)
      const isUrdu = data.language === 'ur' && fs.existsSync(path.join(__dirname, '../../../fonts/NotoSansArabic.ttf'));
      const fontName = isUrdu ? 'UrduFont' : 'Helvetica';

      // Calculate height with the actual font that will be used
      doc.fontSize(10).font(fontName);
      const passageHeight = doc.heightOfString(passageText, { width: 470, lineGap: 3 });

      // Add extra padding for Urdu (taller glyphs + RTL rendering quirks)
      const extraPadding = isUrdu ? 20 : 0;
      const boxHeight = passageHeight + 30 + extraPadding;

      // Check if we need a new page for long passages
      if (yPos + boxHeight > 700) {
        doc.addPage();
        yPos = 50;
        // Re-draw section header on new page
        doc.fontSize(14)
           .fillColor(this.COLORS.primary)
           .font('Helvetica-Bold')
           .text('Reading Passage (continued)', 50, yPos);
        yPos += 25;
      }

      doc.roundedRect(50, yPos, 495, boxHeight, 8)
         .fillAndStroke(this.COLORS.background, this.COLORS.border);

      // Render text with correct font
      doc.fontSize(10)
         .fillColor('#000')
         .font(fontName)
         .text(passageText, 60, yPos + 15, {
           width: 470,
           align: isUrdu ? 'right' : 'left',
           lineGap: 3
         });

      return yPos + boxHeight + 20;
    }
  }

  /**
   * Draw fluency metrics section
   * @private
   */
  static _drawFluencyMetrics(doc, data, yPos) {
    // Check if we need a new page
    if (yPos > 600) {
      doc.addPage();
      yPos = 50;
    }

    doc.fontSize(14)
       .fillColor(this.COLORS.primary)
       .font('Helvetica-Bold')
       .text('Fluency Metrics', 50, yPos);

    yPos += 25;

    doc.roundedRect(50, yPos, 495, 110, 8)
       .fillAndStroke(this.COLORS.background, this.COLORS.border);

    // Bug #6 Fix: Dynamic metric name (LCPM for letters, WCPM for connected text)
    const metricInfo = this._getMetricInfo(data.passageType);

    // Fluency metric (WCPM or LCPM)
    doc.fontSize(8)
       .fillColor(this.COLORS.secondary)
       .text(metricInfo.displayName.toUpperCase(), 60, yPos + 10);
    doc.fontSize(20)
       .fillColor(this.COLORS.primary)
       .font('Helvetica-Bold')
       .text(`${Math.round(data.wcpm * 10) / 10}`, 60, yPos + 25);

    // Accuracy
    doc.fontSize(8)
       .fillColor(this.COLORS.secondary)
       .font('Helvetica')
       .text('ACCURACY', 250, yPos + 10);
    doc.fontSize(16)
       .fillColor('#000')
       .font('Helvetica-Bold')
       .text(`${Math.round(data.accuracy)}%`, 250, yPos + 28);

    // Time Elapsed
    doc.fontSize(8)
       .fillColor(this.COLORS.secondary)
       .font('Helvetica')
       .text('TIME ELAPSED', 380, yPos + 10);
    doc.fontSize(16)
       .fillColor('#000')
       .font('Helvetica-Bold')
       .text(`${this._formatTime(data.timeElapsed)}`, 380, yPos + 28);

    // Accuracy progress bar
    const accuracyColor = data.accuracy >= 95 ? this.COLORS.excellent :
                         data.accuracy >= 85 ? this.COLORS.proficient :
                         data.accuracy >= 70 ? this.COLORS.developing : this.COLORS.emerging;

    this._drawRoundedProgressBar(doc, 60, yPos + 60, 435, 12, data.accuracy, accuracyColor);

    // Words/Letters breakdown
    // Bug #3b/3c Fix: Use dynamic label based on passage type
    const unit = data.passageType === 'letters' ? 'letters' : 'words';
    doc.fontSize(8)
       .fillColor(this.COLORS.secondary)
       .font('Helvetica')
       .text(`${data.wordsCorrect} correct / ${data.totalWords} total ${unit}`, 60, yPos + 80);

    return yPos + 125;
  }

  /**
   * Draw benchmark comparison section
   * @private
   */
  static _drawBenchmarkComparison(doc, data, yPos) {
    // Check if we need a new page
    if (yPos > 620) {
      doc.addPage();
      yPos = 50;
    }

    doc.fontSize(14)
       .fillColor(this.COLORS.primary)
       .font('Helvetica-Bold')
       .text('Grade-Level Benchmark', 50, yPos);

    yPos += 25;

    doc.roundedRect(50, yPos, 495, 90, 8)
       .fillAndStroke(this.COLORS.background, this.COLORS.border);

    // Bug #6 Fix: Dynamic metric name in benchmark
    const metricInfo = this._getMetricInfo(data.passageType);

    // Benchmark range
    doc.fontSize(8)
       .fillColor(this.COLORS.secondary)
       .text('BENCHMARK RANGE', 60, yPos + 10);
    doc.fontSize(14)
       .fillColor('#000')
       .font('Helvetica-Bold')
       .text(`${data.benchmark.benchmarkMin}-${data.benchmark.benchmarkMax} ${metricInfo.shortName}`, 60, yPos + 25);

    // On track status
    doc.fontSize(8)
       .fillColor(this.COLORS.secondary)
       .font('Helvetica')
       .text('STATUS', 300, yPos + 10);
    doc.fontSize(12)
       .fillColor(data.benchmark.onTrack ? this.COLORS.excellent : this.COLORS.developing)
       .font('Helvetica-Bold')
       .text(data.benchmark.onTrack ? 'On Track' : 'Needs Support', 300, yPos + 28);

    // Percentile rank
    doc.fontSize(8)
       .fillColor(this.COLORS.secondary)
       .font('Helvetica')
       .text('PERCENTILE', 60, yPos + 55);
    doc.fontSize(11)
       .fillColor('#000')
       .font('Helvetica')
       .text(this._getPercentileLabel(data.benchmark.percentileRank), 60, yPos + 70);

    // L2 indicator if applicable
    if (data.language === 'ur') {
      doc.fontSize(7)
         .fillColor(this.COLORS.secondary)
         .font('Helvetica-Oblique')
         .text('* Benchmarks adjusted for second language (L2) learners', 60, yPos + 95);
    }

    return yPos + (data.language === 'ur' ? 115 : 105);
  }

  /**
   * Draw error analysis section
   * @private
   */
  static _drawErrorAnalysis(doc, data, yPos) {
    // Check if we need a new page
    if (yPos > 600) {
      doc.addPage();
      yPos = 50;
    }

    doc.fontSize(14)
       .fillColor(this.COLORS.primary)
       .font('Helvetica-Bold')
       .text('Error Analysis', 50, yPos);

    yPos += 25;

    // Count error types
    const omissions = data.errors.filter(e => e.type === 'omission').length;
    const insertions = data.errors.filter(e => e.type === 'insertion').length;
    const substitutions = data.errors.filter(e => e.type === 'substitution').length;
    const totalErrors = omissions + insertions + substitutions;

    // Calculate box height based on error examples
    const errorExamples = data.errors.slice(0, 5); // Show first 5 errors
    const examplesHeight = Math.min(errorExamples.length * 15 + 20, 100);
    const boxHeight = 110 + examplesHeight;

    doc.roundedRect(50, yPos, 495, boxHeight, 8)
       .fillAndStroke(this.COLORS.background, this.COLORS.border);

    // Error counts
    doc.fontSize(8)
       .fillColor(this.COLORS.secondary)
       .text('TOTAL ERRORS', 60, yPos + 10);
    doc.fontSize(16)
       .fillColor(this.COLORS.emerging)
       .font('Helvetica-Bold')
       .text(totalErrors.toString(), 60, yPos + 25);

    doc.fontSize(8)
       .fillColor(this.COLORS.secondary)
       .font('Helvetica')
       .text('OMISSIONS', 160, yPos + 10);
    doc.fontSize(12)
       .fillColor('#000')
       .font('Helvetica')
       .text(omissions.toString(), 160, yPos + 28);

    doc.fontSize(8)
       .fillColor(this.COLORS.secondary)
       .font('Helvetica')
       .text('INSERTIONS', 260, yPos + 10);
    doc.fontSize(12)
       .fillColor('#000')
       .font('Helvetica')
       .text(insertions.toString(), 260, yPos + 28);

    doc.fontSize(8)
       .fillColor(this.COLORS.secondary)
       .font('Helvetica')
       .text('SUBSTITUTIONS', 360, yPos + 10);
    doc.fontSize(12)
       .fillColor('#000')
       .font('Helvetica')
       .text(substitutions.toString(), 360, yPos + 28);

    // Error examples
    if (errorExamples.length > 0) {
      doc.fontSize(8)
         .fillColor(this.COLORS.secondary)
         .font('Helvetica')
         .text('ERROR EXAMPLES', 60, yPos + 55);

      // BUG #2 FIX: Use UrduFont for Urdu assessments to render Urdu characters correctly
      // Previously used Helvetica which cannot render Arabic/Urdu script
      const isUrdu = data.language === 'ur';
      const errorFont = isUrdu && fs.existsSync(path.join(__dirname, '../../../fonts/NotoSansArabic.ttf'))
        ? 'UrduFont'
        : 'Helvetica';

      let exampleY = yPos + 70;
      for (const error of errorExamples) {
        // Use text arrow for Urdu since UrduFont can't render Unicode arrow (→)
        const errorText = this._formatError(error, isUrdu);
        doc.fontSize(8)
           .fillColor('#000')
           .font(errorFont)
           .text(`• ${errorText}`, 60, exampleY, { width: 470 });
        exampleY += 15;
      }
    }

    return yPos + boxHeight + 20;
  }

  /**
   * Draw mispronunciation details section (Bug #19 fix)
   * Shows which specific words were mispronounced with accuracy scores
   * @private
   */
  static _drawMispronunciationDetails(doc, data, yPos) {
    // Extract mispronunciation errors from Azure pronunciation data
    const mispronunciations = this._extractMispronunciationErrors(data);

    // Skip section if no mispronunciations found
    if (mispronunciations.length === 0) {
      return yPos;
    }

    // Check if we need a new page
    if (yPos > 600) {
      doc.addPage();
      yPos = 50;
    }

    doc.fontSize(14)
       .fillColor(this.COLORS.primary)
       .font('Helvetica-Bold')
       .text('Pronunciation Errors', 50, yPos);

    yPos += 25;

    // Bug #30: Show top 5 errors with phonetic guidance (was 8 without details)
    const topErrors = mispronunciations.slice(0, 5);

    // Calculate dynamic box height based on errors (more space for phoneme breakdowns)
    const errorHeight = topErrors.length * 35; // 35px per error (word + phonemes)
    const boxHeight = 80 + errorHeight;

    doc.roundedRect(50, yPos, 495, boxHeight, 8)
       .fillAndStroke(this.COLORS.background, this.COLORS.border);

    // Mispronunciation count
    doc.fontSize(8)
       .fillColor(this.COLORS.secondary)
       .text('MISPRONOUNCED WORDS', 60, yPos + 10);
    doc.fontSize(16)
       .fillColor(this.COLORS.emerging)
       .font('Helvetica-Bold')
       .text(mispronunciations.length.toString(), 60, yPos + 25);

    // Header
    doc.fontSize(8)
       .fillColor(this.COLORS.secondary)
       .font('Helvetica')
       .text('TOP PRONUNCIATION ERRORS (with phoneme breakdowns)', 60, yPos + 55);

    // Bug #30 Fix: Show detailed phoneme breakdowns for each error
    let exampleY = yPos + 70;
    for (const error of topErrors) {
      // Word and accuracy score
      doc.fontSize(9)
         .fillColor('#000')
         .font('Helvetica-Bold')
         .text(`"${error.word}"`, 60, exampleY);

      doc.fontSize(8)
         .fillColor(this.COLORS.emerging)
         .font('Helvetica')
         .text(`${error.accuracyScore}% accuracy`, 150, exampleY);

      // Enhanced pronunciation guidance with IPA and readable format
      if (error.pronunciationGuide && typeof error.pronunciationGuide === 'object') {
        // Show IPA notation
        doc.fontSize(7)
           .fillColor(this.COLORS.secondary)
           .font('Helvetica-Bold')
           .text('IPA: ', 70, exampleY + 12);

        doc.fontSize(7)
           .fillColor('#000')
           .font('Helvetica')
           .text(error.pronunciationGuide.ipaFormat, 100, exampleY + 12, { width: 430 });

        // Show teacher-friendly format
        doc.fontSize(7)
           .fillColor(this.COLORS.primary)
           .font('Helvetica')
           .text(error.pronunciationGuide.teacherFormat, 70, exampleY + 24, { width: 460 });
      } else if (error.phonemes && error.phonemes.length > 0) {
        // Fallback to phoneme list if no pronunciation guide
        const phonemeText = error.phonemes
          .map(p => `/${p.phoneme}/ (${p.score}%)`)
          .join(', ');

        doc.fontSize(7)
           .fillColor(this.COLORS.secondary)
           .font('Helvetica')
           .text(`Phonemes: ${phonemeText}`, 70, exampleY + 12, { width: 460 });
      }

      exampleY += 35; // Space for next error
    }

    // If more than 5 mispronunciations, show count
    if (mispronunciations.length > 5) {
      doc.fontSize(7)
         .fillColor(this.COLORS.secondary)
         .font('Helvetica-Oblique')
         .text(`...and ${mispronunciations.length - 5} more pronunciation errors`, 60, exampleY);
    }

    return yPos + boxHeight + 20;
  }

  /**
   * Extract mispronunciation errors from Azure pronunciation data
   * Enhanced with IPA and readable pronunciation guides
   * @private
   */
  static _extractMispronunciationErrors(data) {
    // Check if pronunciation data with words exists
    if (!data.pronunciation || !data.pronunciation.words) {
      return [];
    }

    // Filter words with Mispronunciation error type or low accuracy
    const mispronunciations = data.pronunciation.words
      .filter(w => w.errorType === 'Mispronunciation' || w.accuracyScore < 85)
      .map(w => ({
        word: w.word,
        accuracyScore: Math.round(w.accuracyScore || 0),
        errorType: w.errorType,
        // Enhanced: Include IPA representations
        expectedIPA: w.expectedIPA || '',
        actualIPA: w.actualIPA || '',
        // Generate readable pronunciation guides
        pronunciationGuide: this._generatePronunciationGuide(w),
        // Include phoneme breakdowns for detailed analysis
        phonemes: (w.phonemes || []).map(p => ({
          phoneme: p.Phoneme || p.phoneme || '?',
          score: Math.round(p.AccuracyScore || p.accuracyScore || 0)
        }))
      }))
      .sort((a, b) => a.accuracyScore - b.accuracyScore); // Sort by accuracy (lowest first)

    return mispronunciations;
  }

  /**
   * Generate pronunciation guide with IPA and readable format
   * @private
   */
  static _generatePronunciationGuide(wordData) {
    const word = wordData.word;
    const expectedIPA = wordData.expectedIPA;
    const actualIPA = wordData.actualIPA;

    if (!expectedIPA || !actualIPA) {
      return `Practice saying "${word}" clearly`;
    }

    // Convert IPA to readable format for teachers
    const readableExpected = this._ipaToReadable(expectedIPA);
    const readableActual = this._ipaToReadable(actualIPA);

    return {
      ipaFormat: `/${expectedIPA}/ not /${actualIPA}/`,
      teacherFormat: `Say "${readableExpected}" not "${readableActual}"`
    };
  }

  /**
   * Convert IPA to teacher-friendly readable format
   * @private
   */
  static _ipaToReadable(ipa) {
    // Map common IPA symbols to readable equivalents
    const ipaMap = {
      'ə': 'uh',
      'ɛ': 'eh',
      'æ': 'a',
      'ɪ': 'i',
      'ʊ': 'oo',
      'ʌ': 'u',
      'ɔ': 'aw',
      'aɪ': 'eye',
      'aʊ': 'ow',
      'oʊ': 'oh',
      'eɪ': 'ay',
      'ɔɪ': 'oy',
      'θ': 'th',
      'ð': 'th',
      'ʃ': 'sh',
      'ʒ': 'zh',
      'tʃ': 'ch',
      'dʒ': 'j',
      'ŋ': 'ng',
      'ˈ': '-' // Stress marker becomes hyphen
    };

    let readable = ipa;
    for (const [symbol, replacement] of Object.entries(ipaMap)) {
      readable = readable.replace(new RegExp(symbol, 'g'), replacement);
    }

    // Capitalize stressed syllables
    const parts = readable.split('-');
    return parts.map((part, i) => i === 0 ? part.toUpperCase() : part).join('-');
  }

  /**
   * Draw pronunciation assessment section (English only)
   * @private
   */
  static _drawPronunciationAssessment(doc, data, yPos) {
    if (!data.pronunciation) return yPos;

    // Check if we need a new page
    if (yPos > 620) {
      doc.addPage();
      yPos = 50;
    }

    doc.fontSize(14)
       .fillColor(this.COLORS.primary)
       .font('Helvetica-Bold')
       .text('Pronunciation Assessment', 50, yPos);

    yPos += 25;

    doc.roundedRect(50, yPos, 495, 90, 8)
       .fillAndStroke(this.COLORS.background, this.COLORS.border);

    const pron = data.pronunciation.pronunciationData || {};

    // Pronunciation score
    doc.fontSize(8)
       .fillColor(this.COLORS.secondary)
       .text('PRONUNCIATION', 60, yPos + 10);
    doc.fontSize(16)
       .fillColor(this.COLORS.primary)
       .font('Helvetica-Bold')
       .text(`${Math.round(pron.pronunciationScore || 0)}%`, 60, yPos + 25);

    // Fluency score
    doc.fontSize(8)
       .fillColor(this.COLORS.secondary)
       .font('Helvetica')
       .text('FLUENCY', 200, yPos + 10);
    doc.fontSize(14)
       .fillColor('#000')
       .font('Helvetica-Bold')
       .text(`${Math.round(pron.fluencyScore || 0)}%`, 200, yPos + 28);

    // Completeness
    doc.fontSize(8)
       .fillColor(this.COLORS.secondary)
       .font('Helvetica')
       .text('COMPLETENESS', 330, yPos + 10);
    doc.fontSize(14)
       .fillColor('#000')
       .font('Helvetica-Bold')
       .text(`${Math.round(pron.completenessScore || 0)}%`, 330, yPos + 28);

    // Prosody score (if available)
    if (pron.prosodyScore) {
      doc.fontSize(8)
         .fillColor(this.COLORS.secondary)
         .font('Helvetica')
         .text('PROSODY', 60, yPos + 55);
      doc.fontSize(12)
         .fillColor('#000')
         .font('Helvetica')
         .text(`${Math.round(pron.prosodyScore)}%`, 60, yPos + 70);
    }

    // REMOVED (Bug #7): Source indicator is debug text, not needed in teacher-facing reports
    // doc.fontSize(7)
    //    .fillColor(this.COLORS.secondary)
    //    .font('Helvetica-Oblique')
    //    .text(`Assessment source: ${pron.source || 'N/A'}`, 200, yPos + 75);

    return yPos + 105;
  }

  /**
   * Sprint 1.8: Draw comprehension assessment section
   * Bug #22 Fix: Made async to support non-Latin text translation
   * @private
   */
  static async _drawComprehensionAssessment(doc, data, yPos) {
    if (!data.comprehension) return yPos;

    // Check if we need a new page
    if (yPos > 600) {
      doc.addPage();
      yPos = 50;
    }

    const comp = data.comprehension;

    doc.fontSize(14)
       .fillColor(this.COLORS.primary)
       .font('Helvetica-Bold')
       .text('Comprehension Assessment', 50, yPos);

    yPos += 25;

    // Calculate box height based on number of questions (now includes answers, needs more space)
    const questionCount = comp.answers?.length || 0;
    const questionListHeight = Math.min(questionCount * 50 + 20, 280); // Increased from 22 to 50 per question
    const boxHeight = 120 + questionListHeight;

    doc.roundedRect(50, yPos, 495, boxHeight, 8)
       .fillAndStroke(this.COLORS.background, this.COLORS.border);

    // Overall Score
    doc.fontSize(8)
       .fillColor(this.COLORS.secondary)
       .font('Helvetica')
       .text('QUESTIONS CORRECT', 60, yPos + 15);

    doc.fontSize(18)
       .fillColor('#000')
       .font('Helvetica-Bold')
       .text(`${comp.correctAnswers}/${comp.totalQuestions}`, 60, yPos + 30);

    doc.fontSize(10)
       .fillColor(this.COLORS.secondary)
       .font('Helvetica')
       .text(`${comp.score}%`, 60, yPos + 55);

    // Benchmark Status
    doc.fontSize(8)
       .fillColor(this.COLORS.secondary)
       .font('Helvetica')
       .text('BENCHMARK STATUS', 200, yPos + 15);

    const statusColor = comp.benchmarkStatus.color || '#10B981';
    doc.fontSize(11)
       .fillColor(statusColor)
       .font('Helvetica-Bold')
       .text(comp.benchmarkStatus.label, 200, yPos + 30);

    doc.fontSize(8)
       .fillColor('#000')
       .font('Helvetica')
       .text(comp.benchmarkStatus.description, 200, yPos + 48, { width: 280, lineGap: 2 });

    // Question Breakdown
    doc.fontSize(9)
       .fillColor(this.COLORS.secondary)
       .font('Helvetica-Bold')
       .text('Question Breakdown:', 60, yPos + 90);

    let questionY = yPos + 110;
    if (comp.answers && comp.answers.length > 0) {
      // Bug #22 Fix: Use for...of loop to support async translation of non-Latin text
      for (let index = 0; index < Math.min(comp.answers.length, 5); index++) {
        const answer = comp.answers[index];
        const icon = answer.correct ? '✅' : '❌';
        const questionText = `${icon} Q${index + 1} (${answer.questionType}): ${answer.question}`;

        // Question
        doc.fontSize(7)
           .fillColor('#000')
           .font('Helvetica-Bold')
           .text(questionText, 70, questionY, { width: 460 });

        questionY += 12;

        // Student's answer with visual indicators for wrong answers
        // Bug #22 Fix: Translate non-Latin text (Urdu/Arabic) to English for PDF display
        let studentAnswer = answer.studentAnswer || 'No answer';
        let translationNote = '';

        if (this._containsNonLatinText(studentAnswer)) {
          const translatedAnswer = await this._translateToEnglish(studentAnswer);
          translationNote = ' (translated)';
          studentAnswer = translatedAnswer;
          logToFile('📝 Translated non-Latin answer for PDF', {
            original: answer.studentAnswer,
            translated: translatedAnswer
          });
        }

        const answerColor = answer.correct ? '#000000' : '#EF4444'; // Black for correct, red for wrong
        const answerFont = answer.correct ? 'Helvetica' : 'Helvetica-Bold'; // Bold for wrong answers

        doc.fontSize(7)
           .fillColor(answerColor)
           .font(answerFont)
           .text(`Student: ${studentAnswer}${translationNote}`, 80, questionY, { width: 450 });

        // Add underline for wrong answers
        if (!answer.correct) {
          const textWidth = doc.widthOfString(`Student: ${studentAnswer}${translationNote}`);
          doc.strokeColor('#EF4444')
             .lineWidth(0.5)
             .moveTo(80, questionY + 8)
             .lineTo(Math.min(80 + textWidth, 530), questionY + 8)
             .stroke();
        }

        questionY += 12;

        // Expected answer - also translate if non-Latin
        let expectedAnswer = answer.expectedAnswer || '';
        if (expectedAnswer) {
          let expectedNote = '';
          if (this._containsNonLatinText(expectedAnswer)) {
            expectedAnswer = await this._translateToEnglish(expectedAnswer);
            expectedNote = ' (translated)';
          }

          doc.fontSize(7)
             .fillColor('#999999')
             .font('Helvetica')
             .text(`Expected: ${expectedAnswer}${expectedNote}`, 80, questionY, { width: 450 });

          questionY += 14;
        } else {
          questionY += 10;
        }
      }
    }

    // Guidance (if available)
    if (comp.guidance) {
      const guidanceY = yPos + boxHeight - 60;
      doc.fontSize(8)
         .fillColor(this.COLORS.secondary)
         .font('Helvetica-Bold')
         .text('Teacher Guidance:', 60, guidanceY);

      doc.fontSize(7)
         .fillColor('#000')
         .font('Helvetica')
         .text(comp.guidance.substring(0, 200) + (comp.guidance.length > 200 ? '...' : ''), 60, guidanceY + 15, { width: 470, lineGap: 2 });
    }

    return yPos + boxHeight + 20;
  }

  /**
   * Draw diagnostic summary section
   * @private
   */
  static _drawDiagnosticSummary(doc, data, yPos) {
    // Check if we need a new page
    if (yPos > 650) {
      doc.addPage();
      yPos = 50;
    }

    const summaryText = data.diagnosticSummary || 'No diagnostic summary available.';
    const summaryHeight = this._calculateTextHeight(doc, summaryText, 9, 470, 3);

    const boxHeight = summaryHeight + 40;

    doc.fontSize(14)
       .fillColor(this.COLORS.primary)
       .font('Helvetica-Bold')
       .text('Diagnostic Summary & Recommendations', 50, yPos);

    yPos += 25;

    doc.roundedRect(50, yPos, 495, boxHeight, 8)
       .fillAndStroke(this.COLORS.background, this.COLORS.border);

    doc.fontSize(9)
       .fillColor('#000')
       .font('Helvetica')
       .text(summaryText, 60, yPos + 15, { width: 470, align: 'left', lineGap: 3 });

    return yPos + boxHeight + 20;
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
   * Bug #6 Fix: Get metric info based on passage type
   * @param {string} passageType - Passage type (letters, words, sentences, etc.)
   * @returns {Object} Metric info with shortName and displayName
   * @private
   */
  static _getMetricInfo(passageType) {
    // Letters use LCPM (Letters Correct Per Minute), connected text uses WCPM
    if (passageType === 'letters') {
      return {
        shortName: 'LCPM',
        displayName: 'Letters Correct Per Minute (LCPM)'
      };
    }

    // Words, sentences, paragraph, story all use WCPM
    return {
      shortName: 'WCPM',
      displayName: 'Words Correct Per Minute (WCPM)'
    };
  }

  /**
   * Helper: Get grade label
   * @private
   */
  static _getGradeLabel(gradeLevel) {
    const labels = {
      0: 'Early Years (Pre-K)',
      1: 'Grade 1',
      2: 'Grade 2',
      3: 'Grade 3'
    };
    return labels[gradeLevel] || `Grade ${gradeLevel}`;
  }

  /**
   * Helper: Get percentile label
   * Handles both string labels ('above'/'at'/'below') and integer percentiles (10, 25, 50, 75, 90)
   * @private
   */
  static _getPercentileLabel(percentileRank) {
    // Handle null/undefined
    if (!percentileRank) return 'Unknown';

    // Bug #18 Fix: Parse to number if string (database stores as VARCHAR)
    // percentileRank can be: '75' (string), 75 (number), or 'above'/'at'/'below' (legacy)
    const rank = typeof percentileRank === 'string'
      ? parseInt(percentileRank, 10)
      : percentileRank;

    // Handle integer percentiles from database (10, 25, 50, 75, 90)
    if (!isNaN(rank)) {
      // Add ordinal suffix (10th, 25th, 50th, etc.)
      const getOrdinalSuffix = (n) => {
        const s = ['th', 'st', 'nd', 'rd'];
        const v = n % 100;
        return s[(v - 20) % 10] || s[v] || s[0];
      };
      return `${rank}${getOrdinalSuffix(rank)} percentile`;
    }

    // Handle legacy string labels ('above', 'at', 'below')
    const labels = {
      'above': 'Above grade level (top 25%)',
      'at': 'At grade level (middle 50%)',
      'below': 'Below grade level (bottom 25%)'
    };
    return labels[percentileRank] || 'Unknown';
  }

  /**
   * Helper: Format time in seconds to minutes:seconds
   * @private
   */
  static _formatTime(seconds) {
    // Handle null/undefined/NaN values
    if (seconds === null || seconds === undefined || isNaN(seconds)) {
      return '--:--';
    }
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  /**
   * Helper: Format error for display
   * @param {Object} error - Error object
   * @param {boolean} useTextArrow - Use text arrow instead of Unicode (for non-Latin fonts)
   * @private
   */
  static _formatError(error, useTextArrow = false) {
    // Use text arrow for Urdu/Arabic since UrduFont can't render Unicode arrows
    const arrow = useTextArrow ? ' -> ' : ' → ';

    if (error.type === 'omission') {
      return `Omitted: "${error.word}"`;
    } else if (error.type === 'insertion') {
      return `Inserted: "${error.word}"`;
    } else if (error.type === 'substitution') {
      return `Substituted: "${error.expected}"${arrow}"${error.actual}"`;
    }
    return 'Unknown error';
  }

  /**
   * Helper: Capitalize first letter
   * @private
   */
  static _capitalizeFirst(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
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

module.exports = ReadingReportService;
