/**
 * Annotation Service for Exam Checker
 * Generates annotated exam images with grades and feedback
 *
 * REWRITTEN: 2026-01-25
 * Original Bead: bd-085
 * Fix Beads: bd-165 (larger marks), bd-167 (Caveat font), bd-168 (margin feedback),
 *            bd-169 (score circle), bd-170 (tick/cross), bd-174 (Canvas migration),
 *            bd-175 (Noto Nastaliq for Urdu)
 *
 * CHANGES FROM ORIGINAL:
 * - Migrated from Sharp+SVG to Canvas+registerFont
 * - Added Caveat handwriting font for English
 * - Added Noto Nastaliq font for Urdu
 * - Increased mark sizes (r=60 instead of r=25)
 * - Hand-drawn score circle instead of header badge
 * - Proper tick/cross shapes instead of text symbols
 * - Margin feedback with handwriting font
 */

const { createCanvas, loadImage, registerFont } = require('canvas');
const axios = require('axios');
const path = require('path');
const PDFDocument = require('pdfkit');
const r2Service = require('../../storage/r2');
const { logToFile } = require('../../utils/logger');

// Register handwriting fonts
const FONTS_DIR = path.join(__dirname, '../../../');
try {
  registerFont(path.join(FONTS_DIR, 'assets/fonts/Caveat-Regular.ttf'), { family: 'Caveat' });
  registerFont(path.join(FONTS_DIR, 'fonts/NotoNastaliqUrdu.ttf'), { family: 'NotoNastaliq' });
  registerFont(path.join(FONTS_DIR, 'shared/fonts/NotoNastaliqUrdu-Regular.ttf'), { family: 'NotoNastaliqUrdu' });
  logToFile('🎨 Annotation fonts registered successfully');
} catch (fontError) {
  logToFile('⚠️ Font registration warning', { error: fontError.message });
}

// Annotation colors (hex for Canvas)
const COLORS = {
  correct: '#16a34a',      // Green
  partial: '#ea580c',      // Orange
  incorrect: '#dc2626',    // Red
  feedback: '#1d4ed8',     // Blue
  score: '#7c3aed',        // Purple
  stars: '#fbbf24',        // Gold
  muted: '#9ca3af'         // Gray
};

class AnnotationService {
  /**
   * Annotate a batch of graded submissions
   * @param {object} session - Exam session
   * @param {Array} gradingResults - Array of successful grading results
   * @returns {Array} Annotated image URLs
   */
  static async annotateBatch(session, gradingResults) {
    logToFile('🎨 Starting batch annotation (Canvas engine)', {
      sessionId: session.id,
      resultCount: gradingResults.length
    });

    const annotatedImages = [];

    for (const result of gradingResults) {
      try {
        const studentImages = await this.annotateStudent(session, result);
        annotatedImages.push({
          student: result.student.name,
          images: studentImages
        });
      } catch (error) {
        logToFile('⚠️ Annotation failed for student', {
          student: result.student.name,
          error: error.message
        });
        // Continue with other students
      }
    }

    logToFile('✅ Batch annotation complete', {
      sessionId: session.id,
      annotatedCount: annotatedImages.length
    });

    return annotatedImages;
  }

  /**
   * Annotate all pages for a single student
   * @param {object} session - Exam session
   * @param {object} gradingResult - Student's grading result
   * @returns {Array} Annotated image URLs
   */
  static async annotateStudent(session, gradingResult) {
    const { student, questionResults, percentage, grade, totalMarks, marksAwarded } = gradingResult;
    const pageNumbers = student.pageNumbers || [];
    const originalImages = session.original_images || [];

    const annotatedUrls = [];
    const isFirstPage = true;

    for (let i = 0; i < pageNumbers.length; i++) {
      const pageNum = pageNumbers[i];
      const originalImage = originalImages.find(img => img.pageNumber === pageNum);
      if (!originalImage) continue;

      try {
        // Filter questions for this page (if bounding box info available)
        const pageQuestions = questionResults.filter(q => {
          if (q.pageNumber !== undefined) {
            return q.pageNumber === pageNum;
          }
          // Fallback: distribute questions across pages
          const questionsPerPage = Math.ceil(questionResults.length / pageNumbers.length);
          const startIdx = i * questionsPerPage;
          const endIdx = startIdx + questionsPerPage;
          const qIdx = questionResults.indexOf(q);
          return qIdx >= startIdx && qIdx < endIdx;
        });

        const annotatedUrl = await this.annotateImage(
          originalImage.url,
          {
            pageNumber: pageNum,
            studentName: student.name,
            grade,
            percentage,
            totalMarks: totalMarks || 0,
            marksAwarded: marksAwarded || 0,
            questionResults: pageQuestions,
            isFirstPage: i === 0,
            language: session.language || 'en'
          },
          session.id
        );
        annotatedUrls.push(annotatedUrl);
      } catch (error) {
        logToFile('⚠️ Failed to annotate page', { pageNum, error: error.message });
      }
    }

    return annotatedUrls;
  }

  /**
   * Annotate a single image with grades using Canvas
   * @param {string} imageUrl - Original image URL
   * @param {object} annotations - Annotation data
   * @param {string} sessionId - Session ID for storage
   * @returns {string} Annotated image URL
   */
  static async annotateImage(imageUrl, annotations, sessionId) {
    // Download original image
    const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
    const imageBuffer = Buffer.from(response.data);

    // Load image into canvas
    const image = await loadImage(imageBuffer);
    const canvas = createCanvas(image.width, image.height);
    const ctx = canvas.getContext('2d');

    // Draw original image
    ctx.drawImage(image, 0, 0);

    const { width, height } = image;
    const { studentName, grade, percentage, questionResults, isFirstPage, language, totalMarks, marksAwarded } = annotations;

    // Draw score circle on first page (top-right corner) - bd-169
    if (isFirstPage) {
      this._drawScoreCircle(ctx, marksAwarded || 0, totalMarks || 0, width - 90, 90);

      // Add stars for good performance
      if (percentage >= 80) {
        this._drawStars(ctx, 3, width - 140, 170);
      } else if (percentage >= 60) {
        this._drawStars(ctx, 2, width - 120, 170);
      }
    }

    // Draw question marks and feedback - bd-165, bd-170
    for (let i = 0; i < (questionResults || []).length; i++) {
      const qr = questionResults[i];
      const { marksAwarded: qMarks, maxMarks, feedback, bbox } = qr;
      const ratio = maxMarks > 0 ? qMarks / maxMarks : 0;

      // Calculate position - use bbox if available, otherwise use relative positioning
      let x, y;
      if (bbox && bbox.x !== undefined && bbox.y !== undefined) {
        // Use Surya bounding box coordinates (normalized 0-1)
        x = width * bbox.x;
        y = height * bbox.y;
      } else {
        // Fallback: position on right side, distributed vertically
        x = width * 0.88;
        y = height * (0.25 + i * 0.15);
      }

      // Draw tick/cross/partial mark
      if (ratio >= 1) {
        this._drawTick(ctx, x, y);
      } else if (ratio > 0) {
        this._drawPartialMark(ctx, x, y);
      } else {
        this._drawCross(ctx, x, y);
      }

      // Draw score next to mark
      const scoreColor = ratio >= 1 ? COLORS.correct : ratio > 0 ? COLORS.partial : COLORS.incorrect;
      ctx.fillStyle = scoreColor;
      ctx.font = '36px Caveat';
      ctx.textAlign = 'left';
      ctx.fillText(`${qMarks}/${maxMarks}`, x - 70, y + 50);

      // Draw margin feedback - bd-168
      if (feedback) {
        this._drawMarginFeedback(ctx, feedback, x - 200, y + 20, language);
      }
    }

    // Draw bottom comment/branding
    this._drawBottomBranding(ctx, width, height);

    // Export as PNG buffer
    const annotatedBuffer = canvas.toBuffer('image/png');

    // Upload to R2
    const safeName = (studentName || 'unknown').replace(/[^a-zA-Z0-9]/g, '_');
    const filename = `exams/${sessionId}/annotated_${safeName}_p${annotations.pageNumber}.png`;
    const url = await r2Service.uploadBuffer(annotatedBuffer, filename, 'image/png');

    logToFile('📷 Annotated image uploaded (Canvas)', { filename, url });

    return url;
  }

  /**
   * Draw a hand-drawn style tick mark (bd-170)
   */
  static _drawTick(ctx, x, y, size = 50) {
    ctx.strokeStyle = COLORS.correct;
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + size * 0.35, y + size * 0.5);
    ctx.lineTo(x + size, y - size * 0.4);
    ctx.stroke();
  }

  /**
   * Draw a hand-drawn style cross mark (bd-170)
   */
  static _drawCross(ctx, x, y, size = 40) {
    ctx.strokeStyle = COLORS.incorrect;
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + size, y + size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + size, y);
    ctx.lineTo(x, y + size);
    ctx.stroke();
  }

  /**
   * Draw a partial credit wavy mark (bd-170)
   */
  static _drawPartialMark(ctx, x, y, size = 50) {
    ctx.strokeStyle = COLORS.partial;
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x, y + size * 0.3);
    ctx.quadraticCurveTo(x + size * 0.25, y - size * 0.1, x + size * 0.5, y + size * 0.3);
    ctx.quadraticCurveTo(x + size * 0.75, y + size * 0.7, x + size, y + size * 0.3);
    ctx.stroke();
  }

  /**
   * Draw hand-drawn score circle (bd-169)
   */
  static _drawScoreCircle(ctx, score, max, x, y, radius = 65) {
    // Draw circle
    ctx.strokeStyle = COLORS.score;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.stroke();

    // Draw score text
    ctx.fillStyle = COLORS.score;
    ctx.font = '48px Caveat';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${score}/${max}`, x, y);
  }

  /**
   * Draw stars for good performance
   */
  static _drawStars(ctx, count, x, y) {
    ctx.font = '36px serif';
    ctx.fillStyle = COLORS.stars;
    ctx.fillText('⭐'.repeat(count), x, y);
  }

  /**
   * Draw margin feedback text (bd-168)
   */
  static _drawMarginFeedback(ctx, feedback, x, y, language = 'en') {
    if (!feedback) return;

    // Choose font based on language
    const isUrdu = language === 'ur' || /[\u0600-\u06FF]/.test(feedback);
    ctx.font = isUrdu ? '28px NotoNastaliq' : '28px Caveat';
    ctx.fillStyle = COLORS.feedback;
    ctx.textAlign = isUrdu ? 'right' : 'left';

    // Word wrap feedback
    const maxWidth = 180;
    const words = feedback.split(' ');
    let line = '';
    let lineY = y;

    for (const word of words) {
      const testLine = line + word + ' ';
      const metrics = ctx.measureText(testLine);
      if (metrics.width > maxWidth && line !== '') {
        ctx.fillText(line.trim(), x, lineY);
        line = word + ' ';
        lineY += 30;
      } else {
        line = testLine;
      }
    }
    ctx.fillText(line.trim(), x, lineY);
  }

  /**
   * Draw bottom branding
   */
  static _drawBottomBranding(ctx, width, height) {
    // Semi-transparent background
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.fillRect(0, height - 35, width, 35);

    // Branding text
    ctx.fillStyle = COLORS.muted;
    ctx.font = '18px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('Checked by Rumi AI', width - 20, height - 12);
  }

  /**
   * Get color for grade percentage
   */
  static _getGradeColor(percentage) {
    if (percentage >= 80) return COLORS.correct;
    if (percentage >= 60) return COLORS.partial;
    if (percentage >= 40) return COLORS.partial;
    return COLORS.incorrect;
  }

  /**
   * Generate a summary PDF with all grades (bd-171)
   * @param {object} session - Exam session
   * @param {Array} gradingResults - All grading results
   * @returns {string} PDF URL
   */
  static async generateSummaryPDF(session, gradingResults) {
    logToFile('📄 Generating PDF summary', { sessionId: session.id });

    try {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks = [];

      doc.on('data', chunk => chunks.push(chunk));

      // Title
      doc.fontSize(24).font('Helvetica-Bold')
        .text('Exam Results Summary', { align: 'center' });
      doc.moveDown();

      // Session info
      doc.fontSize(12).font('Helvetica')
        .text(`Subject: ${session.subject || 'N/A'}`)
        .text(`Class: ${session.class_name || 'N/A'}`)
        .text(`Date: ${new Date().toLocaleDateString()}`)
        .text(`Total Students: ${gradingResults.length}`);
      doc.moveDown();

      // Calculate summary stats
      const percentages = gradingResults.map(r => r.percentage || 0);
      const avgPercentage = percentages.length > 0
        ? Math.round(percentages.reduce((a, b) => a + b, 0) / percentages.length)
        : 0;
      const highest = Math.max(...percentages, 0);
      const lowest = Math.min(...percentages, 100);

      doc.fontSize(14).font('Helvetica-Bold').text('Summary Statistics');
      doc.fontSize(12).font('Helvetica')
        .text(`Average: ${avgPercentage}%`)
        .text(`Highest: ${highest}%`)
        .text(`Lowest: ${lowest}%`);
      doc.moveDown();

      // Grade distribution
      const distribution = {};
      for (const r of gradingResults) {
        const grade = r.grade || 'N/A';
        distribution[grade] = (distribution[grade] || 0) + 1;
      }
      doc.fontSize(14).font('Helvetica-Bold').text('Grade Distribution');
      for (const [grade, count] of Object.entries(distribution)) {
        doc.fontSize(12).font('Helvetica').text(`${grade}: ${count} students`);
      }
      doc.moveDown();

      // Student results table
      doc.addPage();
      doc.fontSize(14).font('Helvetica-Bold').text('Individual Results');
      doc.moveDown();

      // Table header
      const tableTop = doc.y;
      doc.fontSize(10).font('Helvetica-Bold')
        .text('Student', 50, tableTop)
        .text('Score', 250, tableTop)
        .text('Percentage', 350, tableTop)
        .text('Grade', 450, tableTop);

      doc.moveTo(50, tableTop + 15).lineTo(550, tableTop + 15).stroke();

      // Table rows
      let y = tableTop + 25;
      for (const result of gradingResults) {
        if (y > 750) {
          doc.addPage();
          y = 50;
        }

        doc.fontSize(10).font('Helvetica')
          .text(result.student?.name || 'Unknown', 50, y)
          .text(`${result.marksAwarded || 0}/${result.totalMarks || 0}`, 250, y)
          .text(`${result.percentage || 0}%`, 350, y)
          .text(result.grade || 'N/A', 450, y);

        y += 20;
      }

      // Footer
      doc.fontSize(8).font('Helvetica')
        .text('Generated by Rumi AI', 50, 780, { align: 'center' });

      doc.end();

      // Wait for PDF to finish
      const pdfBuffer = await new Promise((resolve, reject) => {
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);
      });

      // Upload to R2
      const filename = `exams/${session.id}/summary_report.pdf`;
      const url = await r2Service.uploadBuffer(pdfBuffer, filename, 'application/pdf');

      logToFile('📄 PDF summary generated', { filename, url });
      return url;

    } catch (error) {
      logToFile('❌ PDF generation failed', { error: error.message });
      return null;
    }
  }
}

module.exports = AnnotationService;
