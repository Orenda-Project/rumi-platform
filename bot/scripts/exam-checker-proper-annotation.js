/**
 * Exam Checker - PROPER Annotation (Following INVESTIGATION.md Plan)
 *
 * This draws DIRECTLY on the exam image with:
 * - Handwriting-style ✓/✗ marks near each answer
 * - Handwriting font for feedback
 * - Score circle in top-right corner
 * - Margin notes with teacher feedback
 * - Red for wrong, green for correct, orange for partial
 *
 * Usage: node scripts/exam-checker-proper-annotation.js
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage, registerFont } = require('canvas');

// Register handwriting font
const fontPath = path.join(__dirname, '../assets/fonts/Caveat-Regular.ttf');
if (fs.existsSync(fontPath)) {
  registerFont(fontPath, { family: 'Caveat' });
  console.log('✅ Caveat handwriting font loaded');
} else {
  console.log('⚠️ Caveat font not found, using fallback');
}

// Colors matching teacher pen styles
const COLORS = {
  correct: '#16a34a',      // Green pen
  incorrect: '#dc2626',    // Red pen
  partial: '#ea580c',      // Orange pen
  feedback: '#1d4ed8',     // Blue pen for notes
  scoreCircle: '#7c3aed'   // Purple for score circle
};

// Grading results for Sameer Sheikh's exam (from OCR + grading)
const GRADING_RESULTS = {
  studentName: 'Sameer Sheikh',
  totalScore: 24,
  maxScore: 29,
  questions: [
    {
      number: 1,
      text: 'Circle the words you hear',
      awarded: 5,
      max: 5,
      status: 'correct',
      position: { x: 50, y: 180 },  // Near Q1 answers
      feedback: 'Perfect! All words correct ⭐'
    },
    {
      number: 2,
      text: 'Tick the correct sound',
      awarded: 3,
      max: 4,
      status: 'partial',
      position: { x: 50, y: 420 },  // Near Q2 checkboxes
      feedback: 'Good! "sp" not "cl" for spoon'
    },
    {
      number: 3,
      text: 'Write words teacher reads',
      awarded: 4,
      max: 4,
      status: 'correct',
      position: { x: 50, y: 620 },  // Near Q3 answers
      feedback: 'Excellent spelling!'
    }
  ]
};

// Page 2 results
const PAGE2_RESULTS = {
  questions: [
    {
      number: 4,
      text: 'Sort nouns',
      awarded: 5,
      max: 5,
      status: 'correct',
      position: { x: 50, y: 200 },
      feedback: 'Great classification!'
    },
    {
      number: 5,
      text: 'Make five words',
      awarded: 4,
      max: 5,
      status: 'partial',
      position: { x: 50, y: 480 },
      feedback: '"apple" needs 2 p\'s - only 1 in letters'
    }
  ]
};

// Page 3 results
const PAGE3_RESULTS = {
  questions: [
    {
      number: 6,
      text: 'Reading comprehension',
      awarded: 5,
      max: 6,
      status: 'partial',
      position: { x: 50, y: 350 },
      subResults: [
        { part: 'a', awarded: 2, max: 2, status: 'correct', y: 480 },
        { part: 'b', awarded: 2, max: 2, status: 'correct', y: 560 },
        { part: 'c', awarded: 1, max: 2, status: 'partial', y: 640 }
      ],
      feedback: 'Q6c: Full sentence needed'
    }
  ]
};

/**
 * Draw a handwriting-style tick mark
 */
function drawTick(ctx, x, y, size = 30) {
  ctx.strokeStyle = COLORS.correct;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Slightly wobbly tick for handwritten look
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + size * 0.3, y + size * 0.5);
  ctx.lineTo(x + size, y - size * 0.3);
  ctx.stroke();
}

/**
 * Draw a handwriting-style cross mark
 */
function drawCross(ctx, x, y, size = 25) {
  ctx.strokeStyle = COLORS.incorrect;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';

  // X mark
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
 * Draw a tilde for partial credit
 */
function drawPartial(ctx, x, y, size = 30) {
  ctx.strokeStyle = COLORS.partial;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';

  // Wavy line ~
  ctx.beginPath();
  ctx.moveTo(x, y + size * 0.3);
  ctx.quadraticCurveTo(x + size * 0.25, y, x + size * 0.5, y + size * 0.3);
  ctx.quadraticCurveTo(x + size * 0.75, y + size * 0.6, x + size, y + size * 0.3);
  ctx.stroke();
}

/**
 * Draw score circle in corner (teacher style)
 */
function drawScoreCircle(ctx, score, max, x, y) {
  const radius = 45;

  // Circle with purple stroke
  ctx.strokeStyle = COLORS.scoreCircle;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.stroke();

  // Score text in handwriting font
  ctx.fillStyle = COLORS.scoreCircle;
  ctx.font = '28px Caveat';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${score}/${max}`, x, y);
}

/**
 * Draw feedback text in margin (handwriting style)
 */
function drawFeedback(ctx, text, x, y, color = COLORS.feedback) {
  ctx.fillStyle = color;
  ctx.font = '20px Caveat';
  ctx.textAlign = 'left';
  ctx.fillText(text, x, y);
}

/**
 * Draw score for a question
 */
function drawQuestionScore(ctx, awarded, max, x, y, status) {
  const color = status === 'correct' ? COLORS.correct :
                status === 'partial' ? COLORS.partial : COLORS.incorrect;

  ctx.fillStyle = color;
  ctx.font = '22px Caveat';
  ctx.textAlign = 'left';
  ctx.fillText(`${awarded}/${max}`, x, y);
}

/**
 * Annotate a single exam page
 */
async function annotatePage(imagePath, results, pageNum, totalScore, maxScore, outputPath) {
  console.log(`\n📝 Annotating page ${pageNum}...`);

  // Load the exam image
  const image = await loadImage(imagePath);
  const canvas = createCanvas(image.width, image.height);
  const ctx = canvas.getContext('2d');

  // Draw original image
  ctx.drawImage(image, 0, 0);

  // Add annotations for each question
  for (const q of results.questions) {
    const { position, awarded, max, status, feedback } = q;
    const rightMargin = image.width - 80;

    // Draw tick/cross/partial near the answer
    if (status === 'correct') {
      drawTick(ctx, rightMargin, position.y);
    } else if (status === 'partial') {
      drawPartial(ctx, rightMargin, position.y);
    } else {
      drawCross(ctx, rightMargin, position.y);
    }

    // Draw question score
    drawQuestionScore(ctx, awarded, max, rightMargin - 50, position.y + 40, status);

    // Draw feedback in margin
    if (feedback) {
      const feedbackColor = status === 'correct' ? COLORS.correct :
                           status === 'partial' ? COLORS.partial : COLORS.incorrect;
      drawFeedback(ctx, feedback, 20, position.y + 70, feedbackColor);
    }

    // Handle sub-results (for Q6)
    if (q.subResults) {
      for (const sub of q.subResults) {
        const subX = rightMargin;
        if (sub.status === 'correct') {
          drawTick(ctx, subX, sub.y, 25);
        } else if (sub.status === 'partial') {
          drawPartial(ctx, subX, sub.y, 25);
        } else {
          drawCross(ctx, subX, sub.y, 20);
        }
        drawQuestionScore(ctx, sub.awarded, sub.max, subX - 40, sub.y + 30, sub.status);
      }
    }
  }

  // Draw score circle on first page only
  if (pageNum === 1) {
    drawScoreCircle(ctx, totalScore, maxScore, image.width - 70, 70);

    // Add stars for good performance
    const percentage = (totalScore / maxScore) * 100;
    if (percentage >= 80) {
      ctx.font = '24px serif';
      ctx.fillText('⭐⭐⭐', image.width - 100, 130);
    } else if (percentage >= 60) {
      ctx.fillText('⭐⭐', image.width - 85, 130);
    }

    // Teacher comment at bottom
    ctx.fillStyle = COLORS.feedback;
    ctx.font = '22px Caveat';
    const comment = percentage >= 80 ? 'Excellent work, Sameer! Keep it up!' :
                    percentage >= 60 ? 'Good effort! Review Q6 comprehension.' :
                    'Please see me for extra help.';
    ctx.fillText(comment, 30, image.height - 40);

    // Rumi branding (small)
    ctx.fillStyle = '#9ca3af';
    ctx.font = '14px sans-serif';
    ctx.fillText('Checked by Rumi AI', image.width - 130, image.height - 15);
  }

  // Save annotated image
  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(outputPath, buffer);
  console.log(`   ✅ Saved: ${path.basename(outputPath)}`);

  return outputPath;
}

/**
 * Convert PDF page to image (using Sharp since we don't have pdftoppm)
 * For demo, we'll create a mock exam page
 */
async function createMockExamPage(pageNum) {
  const width = 800;
  const height = 1100;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // White background with lined paper effect
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  // Draw lines
  ctx.strokeStyle = '#e5e7eb';
  ctx.lineWidth = 1;
  for (let y = 60; y < height; y += 30) {
    ctx.beginPath();
    ctx.moveTo(50, y);
    ctx.lineTo(width - 50, y);
    ctx.stroke();
  }

  // Left margin
  ctx.strokeStyle = '#fca5a5';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(70, 0);
  ctx.lineTo(70, height);
  ctx.stroke();

  // Handwriting-style text
  ctx.fillStyle = '#1f2937';
  ctx.font = '24px Caveat';

  if (pageNum === 1) {
    // Header
    ctx.fillText('Sameer Sheikh', 100, 50);
    ctx.fillText('Grade 3', 400, 50);
    ctx.fillText('Section: N', 550, 50);
    ctx.font = '20px Caveat';
    ctx.fillText('Assessment: English', 300, 80);

    // Q1
    ctx.font = '22px sans-serif';
    ctx.fillText('Q1  Circle the words you hear.', 80, 150);
    ctx.font = '24px Caveat';
    ctx.fillText('Creek   (Flower)  globe  (kitten)', 100, 200);
    ctx.fillText('puzzle  (rocket)  (spider)', 100, 240);

    // Q2
    ctx.font = '22px sans-serif';
    ctx.fillText('Q2  Tick the correct sound each object starts with.', 80, 320);
    ctx.font = '20px Caveat';
    ctx.fillText('dr  tr     fl  br     sp  cl     pl  br     sh  fr', 100, 380);
    ctx.fillText('☑  ☐     ☐  ☑     ☐  ☑     ☑  ☐     ☑  ☐', 100, 420);

    // Q3
    ctx.font = '22px sans-serif';
    ctx.fillText('Q3  Write down the words your teacher will read out.', 80, 500);
    ctx.font = '24px Caveat';
    ctx.fillText('1) home', 100, 560);
    ctx.fillText('2) play', 100, 600);
    ctx.fillText('3) pretty', 100, 640);
    ctx.fillText('4) chair', 100, 680);
  } else if (pageNum === 2) {
    // Q4
    ctx.font = '22px sans-serif';
    ctx.fillText('Q4  Sort these nouns: Ali, map, kite, Islamabad, Amna', 80, 100);
    ctx.font = '20px Caveat';
    ctx.fillText('Common Nouns    |    Proper Nouns', 150, 160);
    ctx.fillText('map             |    Ali', 150, 200);
    ctx.fillText('kite            |    Islamabad', 150, 240);
    ctx.fillText('girl            |    Amna', 150, 280);

    // Q5
    ctx.font = '22px sans-serif';
    ctx.fillText('Q5  Make five words with: h r s t m p o y i a l f c k e u', 80, 380);
    ctx.font = '24px Caveat';
    ctx.fillText('1) apple', 100, 440);
    ctx.fillText('2) stem', 100, 480);
    ctx.fillText('3) fit', 100, 520);
    ctx.fillText('4) fan', 100, 560);
    ctx.fillText('5) ear', 100, 600);
  } else if (pageNum === 3) {
    // Q6 - Reading comprehension
    ctx.font = '22px sans-serif';
    ctx.fillText('Q6  Read this story and answer:', 80, 80);
    ctx.font = '18px Caveat';
    ctx.fillStyle = '#4b5563';
    ctx.fillText('"Talha and the Box"', 250, 120);
    ctx.fillText('Once upon a time, Talha found a big red box in the garden.', 100, 160);
    ctx.fillText('The box began to shake. Talha was scared. Suddenly,', 100, 190);
    ctx.fillText('a little fox jumped out! Talha and the fox became friends.', 100, 220);
    ctx.fillText('They played together all day.', 100, 250);

    ctx.fillStyle = '#1f2937';
    ctx.font = '20px sans-serif';
    ctx.fillText('a) Where did Talha find the box?', 80, 320);
    ctx.font = '24px Caveat';
    ctx.fillText('Talha found the box in the garden.', 100, 360);

    ctx.font = '20px sans-serif';
    ctx.fillText('b) What jumped out of the box?', 80, 420);
    ctx.font = '24px Caveat';
    ctx.fillText('The little fox jumped out of the box.', 100, 460);

    ctx.font = '20px sans-serif';
    ctx.fillText('c) Complete: Talha and the fox ________', 80, 520);
    ctx.font = '24px Caveat';
    ctx.fillText('became friends', 100, 560);
  }

  const outputDir = path.join(__dirname, 'output');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputPath = path.join(outputDir, `exam_page_${pageNum}.png`);
  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(outputPath, buffer);

  return outputPath;
}

async function main() {
  console.log('\n' + '═'.repeat(60));
  console.log('  🎨 EXAM CHECKER - PROPER ANNOTATION DEMO');
  console.log('  (Handwriting-style marks directly on exam image)');
  console.log('═'.repeat(60));

  const outputDir = path.join(__dirname, 'output');

  // Create mock exam pages (simulating PDF conversion)
  console.log('\n📄 Creating exam pages...');
  const page1 = await createMockExamPage(1);
  const page2 = await createMockExamPage(2);
  const page3 = await createMockExamPage(3);

  // Annotate each page
  const annotated1 = await annotatePage(
    page1,
    GRADING_RESULTS,
    1,
    GRADING_RESULTS.totalScore,
    GRADING_RESULTS.maxScore,
    path.join(outputDir, 'sameer_page1_annotated.png')
  );

  const annotated2 = await annotatePage(
    page2,
    PAGE2_RESULTS,
    2,
    GRADING_RESULTS.totalScore,
    GRADING_RESULTS.maxScore,
    path.join(outputDir, 'sameer_page2_annotated.png')
  );

  const annotated3 = await annotatePage(
    page3,
    PAGE3_RESULTS,
    3,
    GRADING_RESULTS.totalScore,
    GRADING_RESULTS.maxScore,
    path.join(outputDir, 'sameer_page3_annotated.png')
  );

  console.log('\n' + '═'.repeat(60));
  console.log('  📊 ANNOTATION COMPLETE');
  console.log('═'.repeat(60));
  console.log(`\n  Student: ${GRADING_RESULTS.studentName}`);
  console.log(`  Score: ${GRADING_RESULTS.totalScore}/${GRADING_RESULTS.maxScore} (${Math.round(GRADING_RESULTS.totalScore/GRADING_RESULTS.maxScore*100)}%)`);
  console.log('\n  Annotated pages:');
  console.log(`    📝 ${annotated1}`);
  console.log(`    📝 ${annotated2}`);
  console.log(`    📝 ${annotated3}`);
  console.log('\n' + '═'.repeat(60));

  // Open first page
  console.log('\n  Opening annotated exam...\n');
}

main().catch(console.error);
