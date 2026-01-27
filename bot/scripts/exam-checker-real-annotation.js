/**
 * Exam Checker - REAL Annotation on ACTUAL Student Exam
 *
 * Takes the REAL PDF exam image and draws handwriting-style
 * annotations directly on top of it.
 *
 * Usage: node scripts/exam-checker-real-annotation.js
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage, registerFont } = require('canvas');

// Register handwriting font
const fontPath = path.join(__dirname, '../assets/fonts/Caveat-Regular.ttf');
if (fs.existsSync(fontPath)) {
  registerFont(fontPath, { family: 'Caveat' });
}

// The actual exam PDF path
const EXAM_PDF_PATH = '/Users/haroonyasin/Documents/Projects/Rumi 23 Jan 2026/06_Logs & Misc/Reports/Active/Exam_Checker/AI Evaluation of Exam Checker/Cohort samples/handwritten exam experiment/With_Questions_Paper.pdf';

// Colors for teacher-style annotations
const COLORS = {
  correct: '#16a34a',
  incorrect: '#dc2626',
  partial: '#ea580c',
  feedback: '#1d4ed8',
  score: '#7c3aed'
};

// Grading results based on OCR analysis of Sameer Sheikh's exam
const PAGE_ANNOTATIONS = {
  1: {
    totalScore: { score: 24, max: 29, x: 0.88, y: 0.06 },
    stars: { count: 3, x: 0.85, y: 0.12 },
    questions: [
      {
        // Q1: Circle words - all correct
        marks: [
          { type: 'tick', x: 0.92, y: 0.28 }
        ],
        score: { text: '5/5', x: 0.85, y: 0.32, color: 'correct' },
        feedback: { text: 'Perfect! ⭐', x: 0.05, y: 0.34, color: 'correct' }
      },
      {
        // Q2: Tick sounds - 3/4
        marks: [
          { type: 'partial', x: 0.92, y: 0.52 }
        ],
        score: { text: '3/4', x: 0.85, y: 0.56, color: 'partial' },
        feedback: { text: '"sp" not "cl"', x: 0.05, y: 0.58, color: 'partial' }
      },
      {
        // Q3: Write words - all correct
        marks: [
          { type: 'tick', x: 0.92, y: 0.78 }
        ],
        score: { text: '4/4', x: 0.85, y: 0.82, color: 'correct' },
        feedback: { text: 'Excellent spelling!', x: 0.05, y: 0.92, color: 'correct' }
      }
    ],
    bottomComment: { text: 'Great work, Sameer! Keep it up!', x: 0.05, y: 0.96 }
  },
  2: {
    questions: [
      {
        // Q4: Sort nouns - all correct
        marks: [
          { type: 'tick', x: 0.92, y: 0.35 }
        ],
        score: { text: '5/5', x: 0.85, y: 0.39, color: 'correct' },
        feedback: { text: 'Great classification!', x: 0.05, y: 0.42, color: 'correct' }
      },
      {
        // Q5: Make words - 4/5
        marks: [
          { type: 'partial', x: 0.92, y: 0.72 }
        ],
        score: { text: '4/5', x: 0.85, y: 0.76, color: 'partial' },
        feedback: { text: '"apple" uses 2 p\'s', x: 0.05, y: 0.82, color: 'partial' }
      }
    ]
  },
  3: {
    questions: [
      {
        // Q6a: Where found box - correct
        marks: [
          { type: 'tick', x: 0.92, y: 0.52 }
        ],
        score: { text: '2/2', x: 0.85, y: 0.55, color: 'correct' }
      },
      {
        // Q6b: What jumped out - correct
        marks: [
          { type: 'tick', x: 0.92, y: 0.66 }
        ],
        score: { text: '2/2', x: 0.85, y: 0.69, color: 'correct' }
      },
      {
        // Q6c: Complete sentence - partial
        marks: [
          { type: 'partial', x: 0.92, y: 0.80 }
        ],
        score: { text: '1/2', x: 0.85, y: 0.83, color: 'partial' },
        feedback: { text: 'Need full sentence', x: 0.05, y: 0.88, color: 'partial' }
      }
    ],
    bottomComment: { text: 'Good comprehension! Review Q6c.', x: 0.05, y: 0.96 }
  }
};

// Drawing functions
function drawTick(ctx, x, y, size = 35) {
  ctx.strokeStyle = COLORS.correct;
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + size * 0.35, y + size * 0.5);
  ctx.lineTo(x + size, y - size * 0.4);
  ctx.stroke();
}

function drawCross(ctx, x, y, size = 30) {
  ctx.strokeStyle = COLORS.incorrect;
  ctx.lineWidth = 4;
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

function drawPartialMark(ctx, x, y, size = 35) {
  ctx.strokeStyle = COLORS.partial;
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, y + size * 0.3);
  ctx.quadraticCurveTo(x + size * 0.25, y - size * 0.1, x + size * 0.5, y + size * 0.3);
  ctx.quadraticCurveTo(x + size * 0.75, y + size * 0.7, x + size, y + size * 0.3);
  ctx.stroke();
}

function drawScoreCircle(ctx, score, max, x, y, radius = 50) {
  ctx.strokeStyle = COLORS.score;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = COLORS.score;
  ctx.font = '32px Caveat';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${score}/${max}`, x, y);
}

function drawStars(ctx, count, x, y) {
  ctx.font = '28px serif';
  ctx.fillStyle = '#fbbf24';
  ctx.fillText('⭐'.repeat(count), x, y);
}

function drawText(ctx, text, x, y, color, fontSize = 24) {
  ctx.fillStyle = COLORS[color] || color;
  ctx.font = `${fontSize}px Caveat`;
  ctx.textAlign = 'left';
  ctx.fillText(text, x, y);
}

async function convertPdfPageToImage(pdfPath, pageNum) {
  // Use pdf.js to render PDF page (dynamic import for ESM)
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');

  const data = new Uint8Array(fs.readFileSync(pdfPath));
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const page = await pdf.getPage(pageNum);

  const scale = 2.0; // Higher quality
  const viewport = page.getViewport({ scale });

  const canvas = createCanvas(viewport.width, viewport.height);
  const ctx = canvas.getContext('2d');

  // White background
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, viewport.width, viewport.height);

  // PDF.js render with node-canvas compatibility
  const renderContext = {
    canvasContext: ctx,
    viewport: viewport,
    canvasFactory: {
      create: (w, h) => {
        const c = createCanvas(w, h);
        return { canvas: c, context: c.getContext('2d') };
      },
      reset: (canvasAndContext, w, h) => {
        canvasAndContext.canvas.width = w;
        canvasAndContext.canvas.height = h;
      },
      destroy: (canvasAndContext) => {}
    }
  };

  await page.render(renderContext).promise;

  return { canvas, ctx, width: viewport.width, height: viewport.height };
}

async function annotateRealExam() {
  console.log('\n' + '═'.repeat(60));
  console.log('  🎨 ANNOTATING REAL STUDENT EXAM');
  console.log('  (Sameer Sheikh - Grade 3 English Assessment)');
  console.log('═'.repeat(60));

  const outputDir = path.join(__dirname, 'output');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Process each page
  for (let pageNum = 1; pageNum <= 3; pageNum++) {
    console.log(`\n📄 Processing page ${pageNum}...`);

    try {
      // Convert PDF page to canvas
      const { canvas, ctx, width, height } = await convertPdfPageToImage(EXAM_PDF_PATH, pageNum);

      const annotations = PAGE_ANNOTATIONS[pageNum];
      if (!annotations) continue;

      // Draw total score circle on page 1
      if (annotations.totalScore) {
        const { score, max, x, y } = annotations.totalScore;
        drawScoreCircle(ctx, score, max, width * x, height * y);
      }

      // Draw stars
      if (annotations.stars) {
        drawStars(ctx, annotations.stars.count, width * annotations.stars.x, height * annotations.stars.y);
      }

      // Draw question annotations
      for (const q of annotations.questions || []) {
        // Draw marks (tick/cross/partial)
        for (const mark of q.marks || []) {
          const mx = width * mark.x;
          const my = height * mark.y;
          if (mark.type === 'tick') {
            drawTick(ctx, mx, my);
          } else if (mark.type === 'cross') {
            drawCross(ctx, mx, my);
          } else if (mark.type === 'partial') {
            drawPartialMark(ctx, mx, my);
          }
        }

        // Draw score
        if (q.score) {
          drawText(ctx, q.score.text, width * q.score.x, height * q.score.y, q.score.color, 28);
        }

        // Draw feedback
        if (q.feedback) {
          drawText(ctx, q.feedback.text, width * q.feedback.x, height * q.feedback.y, q.feedback.color, 22);
        }
      }

      // Draw bottom comment
      if (annotations.bottomComment) {
        ctx.fillStyle = COLORS.feedback;
        ctx.font = '24px Caveat';
        ctx.fillText(
          annotations.bottomComment.text,
          width * annotations.bottomComment.x,
          height * annotations.bottomComment.y
        );
      }

      // Add Rumi branding (subtle)
      ctx.fillStyle = '#9ca3af';
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText('Checked by Rumi AI', width - 20, height - 10);

      // Save annotated page
      const outputPath = path.join(outputDir, `real_exam_page${pageNum}_annotated.png`);
      const buffer = canvas.toBuffer('image/png');
      fs.writeFileSync(outputPath, buffer);
      console.log(`   ✅ Saved: ${path.basename(outputPath)}`);

    } catch (error) {
      console.log(`   ❌ Error: ${error.message}`);
    }
  }

  console.log('\n' + '═'.repeat(60));
  console.log('  ✅ ANNOTATION COMPLETE');
  console.log('═'.repeat(60));
  console.log('\n  Output files in: scripts/output/');
  console.log('  - real_exam_page1_annotated.png');
  console.log('  - real_exam_page2_annotated.png');
  console.log('  - real_exam_page3_annotated.png\n');
}

annotateRealExam().catch(console.error);
