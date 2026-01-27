/**
 * Annotate REAL Student Exam Images
 * Draws handwriting-style marks directly on actual exam scans
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage, registerFont } = require('canvas');

// Register handwriting font
const fontPath = path.join(__dirname, '../assets/fonts/Caveat-Regular.ttf');
registerFont(fontPath, { family: 'Caveat' });

const COLORS = {
  correct: '#16a34a',
  incorrect: '#dc2626',
  partial: '#ea580c',
  feedback: '#1d4ed8',
  score: '#7c3aed'
};

// Drawing functions
function drawTick(ctx, x, y, size = 40) {
  ctx.strokeStyle = COLORS.correct;
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + size * 0.35, y + size * 0.5);
  ctx.lineTo(x + size, y - size * 0.4);
  ctx.stroke();
}

function drawPartial(ctx, x, y, size = 40) {
  ctx.strokeStyle = COLORS.partial;
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, y + size * 0.3);
  ctx.quadraticCurveTo(x + size * 0.25, y - size * 0.1, x + size * 0.5, y + size * 0.3);
  ctx.quadraticCurveTo(x + size * 0.75, y + size * 0.7, x + size, y + size * 0.3);
  ctx.stroke();
}

function drawScoreCircle(ctx, score, max, x, y, radius = 55) {
  ctx.strokeStyle = COLORS.score;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = COLORS.score;
  ctx.font = '38px Caveat';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${score}/${max}`, x, y);
}

function drawText(ctx, text, x, y, color, fontSize = 28) {
  ctx.fillStyle = COLORS[color] || color;
  ctx.font = `${fontSize}px Caveat`;
  ctx.textAlign = 'left';
  ctx.fillText(text, x, y);
}

async function annotatePage(inputPath, outputPath, annotations) {
  const image = await loadImage(inputPath);
  const canvas = createCanvas(image.width, image.height);
  const ctx = canvas.getContext('2d');

  // Draw original image
  ctx.drawImage(image, 0, 0);

  const w = image.width;
  const h = image.height;

  // Draw total score (top right)
  if (annotations.totalScore) {
    const { score, max } = annotations.totalScore;
    drawScoreCircle(ctx, score, max, w - 80, 80);

    // Stars for good performance
    const pct = (score / max) * 100;
    if (pct >= 80) {
      ctx.font = '32px serif';
      ctx.fillText('⭐⭐⭐', w - 120, 160);
    }
  }

  // Draw marks and feedback
  for (const mark of annotations.marks || []) {
    const x = w * mark.x;
    const y = h * mark.y;

    if (mark.type === 'tick') {
      drawTick(ctx, x, y);
    } else if (mark.type === 'partial') {
      drawPartial(ctx, x, y);
    }

    // Draw score next to mark
    if (mark.score) {
      const color = mark.type === 'tick' ? COLORS.correct : COLORS.partial;
      ctx.fillStyle = color;
      ctx.font = '30px Caveat';
      ctx.fillText(mark.score, x - 60, y + 45);
    }
  }

  // Draw feedback comments
  for (const fb of annotations.feedback || []) {
    drawText(ctx, fb.text, w * fb.x, h * fb.y, fb.color || 'feedback', fb.size || 26);
  }

  // Bottom comment
  if (annotations.comment) {
    ctx.fillStyle = COLORS.feedback;
    ctx.font = '28px Caveat';
    ctx.fillText(annotations.comment, 30, h - 30);
  }

  // Rumi branding
  ctx.fillStyle = '#9ca3af';
  ctx.font = '16px sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('Checked by Rumi AI', w - 20, h - 15);

  // Save
  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(outputPath, buffer);
  console.log(`✅ Saved: ${path.basename(outputPath)}`);
}

async function main() {
  console.log('\n🎨 ANNOTATING REAL EXAM IMAGES\n');

  const outputDir = path.join(__dirname, 'output');

  // Page 1 annotations (Q1, Q2, Q3)
  await annotatePage(
    path.join(outputDir, 'real_exam_page-1.png'),
    path.join(outputDir, 'FINAL_page1_annotated.png'),
    {
      totalScore: { score: 24, max: 29 },
      marks: [
        // Q1 - Circle words (all correct) - near the circled words
        { type: 'tick', x: 0.88, y: 0.30, score: '5/5' },
        // Q2 - Tick sounds (3/4) - near checkboxes
        { type: 'partial', x: 0.88, y: 0.52, score: '3/4' },
        // Q3 - Write words (all correct) - near word list
        { type: 'tick', x: 0.88, y: 0.80, score: '4/4' }
      ],
      feedback: [
        { text: 'Perfect! All words correct ⭐', x: 0.02, y: 0.35, color: 'correct' },
        { text: '"sp" not "cl" for spoon', x: 0.02, y: 0.57, color: 'partial' },
        { text: 'Excellent spelling!', x: 0.02, y: 0.92, color: 'correct' }
      ],
      comment: 'Great work, Sameer! Keep it up!'
    }
  );

  // Page 2 annotations (Q4, Q5)
  await annotatePage(
    path.join(outputDir, 'real_exam_page-2.png'),
    path.join(outputDir, 'FINAL_page2_annotated.png'),
    {
      marks: [
        // Q4 - Sort nouns (all correct)
        { type: 'tick', x: 0.88, y: 0.38, score: '5/5' },
        // Q5 - Make words (4/5)
        { type: 'partial', x: 0.88, y: 0.75, score: '4/5' }
      ],
      feedback: [
        { text: 'Great classification!', x: 0.02, y: 0.45, color: 'correct' },
        { text: '"apple" uses 2 p\'s - only 1 available', x: 0.02, y: 0.85, color: 'partial' }
      ]
    }
  );

  // Page 3 annotations (Q6 - comprehension)
  await annotatePage(
    path.join(outputDir, 'real_exam_page-3.png'),
    path.join(outputDir, 'FINAL_page3_annotated.png'),
    {
      marks: [
        // Q6a - correct
        { type: 'tick', x: 0.88, y: 0.48, score: '2/2' },
        // Q6b - correct
        { type: 'tick', x: 0.88, y: 0.62, score: '2/2' },
        // Q6c - partial
        { type: 'partial', x: 0.88, y: 0.78, score: '1/2' }
      ],
      feedback: [
        { text: 'Good comprehension!', x: 0.02, y: 0.50, color: 'correct' },
        { text: 'Need full sentence for Q6c', x: 0.02, y: 0.88, color: 'partial' }
      ],
      comment: 'Review how to write complete answers.'
    }
  );

  console.log('\n✅ All pages annotated!\n');
  console.log('Output files:');
  console.log('  - FINAL_page1_annotated.png');
  console.log('  - FINAL_page2_annotated.png');
  console.log('  - FINAL_page3_annotated.png\n');
}

main().catch(console.error);
