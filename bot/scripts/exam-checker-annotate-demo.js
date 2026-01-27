/**
 * Exam Checker Annotation Demo
 * Demonstrates the full pipeline: OCR → Grade → Annotate
 *
 * Usage: node scripts/exam-checker-annotate-demo.js
 * Output: Creates annotated image in scripts/output/
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

// Colors matching annotation.service.js
const COLORS = {
  correct: { r: 0, g: 180, b: 0 },
  partial: { r: 255, g: 165, b: 0 },
  incorrect: { r: 220, g: 0, b: 0 }
};

const SYMBOLS = {
  correct: '✓',
  incorrect: '✗',
  partial: '~'
};

// Sample grading result (from dry run)
const SAMPLE_GRADING = {
  studentName: 'Ayeda Kamran',
  grade: 'A',
  percentage: 92,
  questionResults: [
    { questionNumber: 1, marksAwarded: 4, maxMarks: 4, feedback: 'Matched 4/4 vocabulary items' },
    { questionNumber: 5, marksAwarded: 5, maxMarks: 6, feedback: 'Formed 5 valid words' },
    { questionNumber: 6, marksAwarded: 3, maxMarks: 3, feedback: 'Answer similarity: 100%' }
  ]
};

function getGradeColor(percentage) {
  if (percentage >= 80) return '#22c55e'; // Green
  if (percentage >= 60) return '#eab308'; // Yellow
  if (percentage >= 40) return '#f97316'; // Orange
  return '#ef4444'; // Red
}

function escapeXml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function createSVGOverlay(annotations, width, height) {
  const { studentName, grade, percentage, questionResults } = annotations;
  const headerHeight = 80;
  const gradeColor = getGradeColor(percentage);

  let svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <!-- Header background -->
      <rect x="0" y="0" width="${width}" height="${headerHeight}"
            fill="rgba(255,255,255,0.95)" />

      <!-- Student name -->
      <text x="20" y="40" font-family="Arial, sans-serif" font-size="28" font-weight="bold" fill="#333">
        ${escapeXml(studentName)}
      </text>
      <text x="20" y="65" font-family="Arial, sans-serif" font-size="16" fill="#666">
        Checked by Rumi AI
      </text>

      <!-- Grade badge -->
      <rect x="${width - 160}" y="10" width="140" height="60" rx="10"
            fill="${gradeColor}" />
      <text x="${width - 90}" y="50" font-family="Arial, sans-serif" font-size="28"
            font-weight="bold" fill="white" text-anchor="middle">
        ${grade} (${percentage}%)
      </text>
  `;

  // Add question marks
  let yOffset = headerHeight + 80;
  const xOffset = width - 80;

  for (const qr of questionResults || []) {
    const { questionNumber, marksAwarded, maxMarks } = qr;
    const ratio = maxMarks > 0 ? marksAwarded / maxMarks : 0;

    let color, symbol;
    if (ratio >= 1) {
      color = COLORS.correct;
      symbol = SYMBOLS.correct;
    } else if (ratio > 0) {
      color = COLORS.partial;
      symbol = SYMBOLS.partial;
    } else {
      color = COLORS.incorrect;
      symbol = SYMBOLS.incorrect;
    }

    // Question label
    svg += `
      <text x="${xOffset - 70}" y="${yOffset + 5}" font-family="Arial" font-size="14"
            fill="#666" font-weight="bold">
        Q${questionNumber}:
      </text>
    `;

    // Score circle
    svg += `
      <circle cx="${xOffset}" cy="${yOffset}" r="28"
              fill="rgba(${color.r},${color.g},${color.b},0.95)" />
      <text x="${xOffset}" y="${yOffset + 8}" font-family="Arial" font-size="22"
            fill="white" text-anchor="middle" font-weight="bold">
        ${symbol}
      </text>

      <!-- Score -->
      <text x="${xOffset + 40}" y="${yOffset + 5}" font-family="Arial" font-size="18"
            fill="rgba(${color.r},${color.g},${color.b},1)" font-weight="bold">
        ${marksAwarded}/${maxMarks}
      </text>
    `;

    yOffset += 80;
    if (yOffset > height - 80) break;
  }

  // Footer with branding
  svg += `
      <rect x="0" y="${height - 40}" width="${width}" height="40"
            fill="rgba(255,255,255,0.9)" />
      <text x="15" y="${height - 12}" font-family="Arial" font-size="16" fill="#666">
        Graded by Rumi AI • رومی
      </text>
      <text x="${width - 15}" y="${height - 12}" font-family="Arial" font-size="14" fill="#999" text-anchor="end">
        Total: ${questionResults.reduce((s, q) => s + q.marksAwarded, 0)}/${questionResults.reduce((s, q) => s + q.maxMarks, 0)}
      </text>
    </svg>
  `;

  return svg;
}

async function annotateImage(inputPath, outputPath, annotations) {
  console.log(`\n📸 Reading: ${path.basename(inputPath)}`);

  // Read image and get metadata
  const imageBuffer = fs.readFileSync(inputPath);
  const metadata = await sharp(imageBuffer).metadata();
  const { width, height } = metadata;

  console.log(`   Dimensions: ${width} x ${height}`);

  // Create SVG overlay
  const svgOverlay = createSVGOverlay(annotations, width, height);

  // Composite overlay onto image
  const annotatedBuffer = await sharp(imageBuffer)
    .composite([{
      input: Buffer.from(svgOverlay),
      top: 0,
      left: 0
    }])
    .jpeg({ quality: 90 })
    .toBuffer();

  // Save to output
  fs.writeFileSync(outputPath, annotatedBuffer);
  console.log(`   ✅ Saved: ${outputPath}`);

  return outputPath;
}

async function main() {
  console.log('\n🎨 EXAM CHECKER ANNOTATION DEMO');
  console.log('═'.repeat(50));

  // Create output directory
  const outputDir = path.join(__dirname, 'output');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Use sample exam image (absolute path to avoid path issues)
  const sampleImagePath = '/Users/haroonyasin/Documents/Projects/Rumi 23 Jan 2026/06_Logs & Misc/Reports/Active/Exam_Checker/eval/bbox_output/better_english_surya_p0.png';

  if (!fs.existsSync(sampleImagePath)) {
    console.log('❌ Sample image not found:', sampleImagePath);
    return;
  }

  const outputPath = path.join(outputDir, 'annotated_demo.jpg');

  // Annotate the image
  await annotateImage(sampleImagePath, outputPath, SAMPLE_GRADING);

  console.log('\n' + '═'.repeat(50));
  console.log('📊 GRADING SUMMARY');
  console.log('─'.repeat(50));
  console.log(`Student: ${SAMPLE_GRADING.studentName}`);
  console.log(`Grade: ${SAMPLE_GRADING.grade} (${SAMPLE_GRADING.percentage}%)`);
  console.log('\nQuestion Results:');
  for (const qr of SAMPLE_GRADING.questionResults) {
    const status = qr.marksAwarded === qr.maxMarks ? '✓' : (qr.marksAwarded > 0 ? '~' : '✗');
    console.log(`  Q${qr.questionNumber}: ${qr.marksAwarded}/${qr.maxMarks} ${status} - ${qr.feedback}`);
  }

  console.log('\n' + '═'.repeat(50));
  console.log('📁 OUTPUT FILE:');
  console.log(`   ${outputPath}`);
  console.log('═'.repeat(50));
  console.log('\n✅ Demo complete! Open the output file to see the annotated exam.\n');
}

main().catch(console.error);
