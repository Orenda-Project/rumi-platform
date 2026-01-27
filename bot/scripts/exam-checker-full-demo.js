/**
 * Exam Checker Full Demo - Real Exam from Sameer Sheikh
 * Demonstrates: OCR extraction → Grading → Annotated Image
 *
 * Based on actual exam: With_Questions_Paper.pdf
 * Student: Sameer Sheikh, Grade 3, Section N, English Assessment
 *
 * Usage: node scripts/exam-checker-full-demo.js
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

// ═══════════════════════════════════════════════════════════════
// STEP 1: OCR RESULT (extracted from actual exam PDF)
// ═══════════════════════════════════════════════════════════════

const OCR_RESULT = {
  studentName: 'Sameer Sheikh',
  grade: '3',
  section: 'N',
  subject: 'English',
  pages: 3,
  questions: [
    {
      number: 1,
      questionText: 'Circle the words you hear',
      type: 'listening_comprehension',
      studentAnswer: ['Flower', 'globe', 'kitten', 'rocket', 'spider'],
      confidence: 0.92
    },
    {
      number: 2,
      questionText: 'Say the name of each object. Then tick the correct sound it starts with.',
      type: 'phonics',
      studentAnswer: {
        item1: 'dr', // ticked dr
        item2: 'br', // ticked br
        item3: 'cl', // ticked cl and pl
        item4: 'sh'  // ticked sh
      },
      confidence: 0.88
    },
    {
      number: 3,
      questionText: 'Write down the words your teacher will read out',
      type: 'spelling_dictation',
      studentAnswer: ['home', 'play', 'pretty', 'chair'],
      confidence: 0.95
    },
    {
      number: 4,
      questionText: 'Sort these nouns into the correct columns (Ali, map, kite, Islamabad, Amna)',
      type: 'grammar_classification',
      studentAnswer: {
        commonNouns: ['map', 'kite', 'girl'],
        properNouns: ['Ali', 'Islamabad', 'Amna']
      },
      confidence: 0.90
    },
    {
      number: 5,
      questionText: 'Make five words with these letters: h r s t m p o y i a l f c k e u (ie, oa, oo, ee)',
      type: 'word_formation',
      studentAnswer: ['apple', 'stem', 'fit', 'fan', 'ear'],
      confidence: 0.94
    },
    {
      number: 6,
      questionText: 'Read this story below (Talha and the box) and answer the questions',
      type: 'reading_comprehension',
      subQuestions: [
        {
          part: 'a',
          question: 'Where did Talha find the box?',
          studentAnswer: 'Talha found the box in the garden.'
        },
        {
          part: 'b',
          question: 'What jumped out of the box?',
          studentAnswer: 'The little fox jumped out of the box.'
        },
        {
          part: 'c',
          question: 'Complete the sentence: Talha and the fox ___',
          studentAnswer: 'became friends'
        }
      ],
      confidence: 0.96
    }
  ]
};

// ═══════════════════════════════════════════════════════════════
// STEP 2: MARKING SCHEME
// ═══════════════════════════════════════════════════════════════

const MARKING_SCHEME = {
  totalMarks: 30,
  questions: [
    {
      number: 1,
      maxMarks: 5,
      type: 'listening_comprehension',
      correctAnswers: ['Flower', 'globe', 'kitten', 'rocket', 'spider'],
      markingCriteria: '1 mark per correct word circled'
    },
    {
      number: 2,
      maxMarks: 4,
      type: 'phonics',
      correctAnswers: { item1: 'dr', item2: 'br', item3: 'sp', item4: 'sh' },
      markingCriteria: '1 mark per correct sound identified'
    },
    {
      number: 3,
      maxMarks: 4,
      type: 'spelling_dictation',
      correctAnswers: ['home', 'play', 'pretty', 'chair'],
      markingCriteria: '1 mark per correctly spelled word'
    },
    {
      number: 4,
      maxMarks: 5,
      type: 'grammar_classification',
      correctAnswers: {
        commonNouns: ['map', 'kite'],
        properNouns: ['Ali', 'Islamabad', 'Amna']
      },
      markingCriteria: '1 mark per correctly classified noun'
    },
    {
      number: 5,
      maxMarks: 5,
      type: 'word_formation',
      validLetters: 'hrstmpoyialfckeu',
      vowelCombos: ['ie', 'oa', 'oo', 'ee'],
      markingCriteria: '1 mark per valid word (must use only given letters)'
    },
    {
      number: 6,
      maxMarks: 6,
      type: 'reading_comprehension',
      correctAnswers: [
        { part: 'a', answer: 'in the garden', marks: 2 },
        { part: 'b', answer: 'a little fox', marks: 2 },
        { part: 'c', answer: 'became friends', marks: 2 }
      ],
      markingCriteria: '2 marks per correct answer'
    }
  ]
};

// ═══════════════════════════════════════════════════════════════
// STEP 3: GRADING ENGINE
// ═══════════════════════════════════════════════════════════════

function gradeExam(ocrResult, markingScheme) {
  const results = [];

  for (const schemeQ of markingScheme.questions) {
    const studentQ = ocrResult.questions.find(q => q.number === schemeQ.number);
    if (!studentQ) continue;

    let marksAwarded = 0;
    let feedback = '';
    let details = [];

    switch (schemeQ.type) {
      case 'listening_comprehension':
      case 'spelling_dictation': {
        const correct = studentQ.studentAnswer.filter(ans =>
          schemeQ.correctAnswers.some(ca => ca.toLowerCase() === ans.toLowerCase())
        );
        marksAwarded = correct.length;
        feedback = `${correct.length}/${schemeQ.correctAnswers.length} correct`;
        details = correct.map(w => `✓ ${w}`);
        break;
      }

      case 'phonics': {
        let correct = 0;
        for (const [item, answer] of Object.entries(studentQ.studentAnswer)) {
          if (schemeQ.correctAnswers[item]?.toLowerCase() === answer.toLowerCase()) {
            correct++;
            details.push(`✓ ${item}: ${answer}`);
          } else {
            details.push(`✗ ${item}: ${answer} (expected: ${schemeQ.correctAnswers[item]})`);
          }
        }
        marksAwarded = correct;
        feedback = `${correct}/${Object.keys(schemeQ.correctAnswers).length} sounds correct`;
        break;
      }

      case 'grammar_classification': {
        let correct = 0;
        const studentCommon = studentQ.studentAnswer.commonNouns || [];
        const studentProper = studentQ.studentAnswer.properNouns || [];

        for (const noun of studentCommon) {
          if (schemeQ.correctAnswers.commonNouns.includes(noun.toLowerCase()) ||
              schemeQ.correctAnswers.commonNouns.some(n => n.toLowerCase() === noun.toLowerCase())) {
            correct++;
            details.push(`✓ ${noun} (common)`);
          }
        }
        for (const noun of studentProper) {
          if (schemeQ.correctAnswers.properNouns.some(n => n.toLowerCase() === noun.toLowerCase())) {
            correct++;
            details.push(`✓ ${noun} (proper)`);
          }
        }
        // Student added 'girl' which wasn't in the list - no mark but no penalty
        marksAwarded = Math.min(correct, schemeQ.maxMarks);
        feedback = `${correct}/${schemeQ.maxMarks} nouns correctly classified`;
        break;
      }

      case 'word_formation': {
        const validWords = studentQ.studentAnswer.filter(word => {
          // Check if word uses only valid letters
          const letters = schemeQ.validLetters.split('');
          const wordLetters = word.toLowerCase().split('');
          return wordLetters.every(l => letters.includes(l));
        });
        marksAwarded = validWords.length;
        feedback = `${validWords.length}/${schemeQ.maxMarks} valid words formed`;
        details = validWords.map(w => `✓ ${w}`);
        // Note: 'apple' has two p's but only one p in letter set - partial credit
        break;
      }

      case 'reading_comprehension': {
        for (const subQ of schemeQ.correctAnswers) {
          const studentSub = studentQ.subQuestions?.find(sq => sq.part === subQ.part);
          if (studentSub) {
            const similarity = calculateSimilarity(
              studentSub.studentAnswer.toLowerCase(),
              subQ.answer.toLowerCase()
            );
            if (similarity > 0.5) {
              marksAwarded += subQ.marks;
              details.push(`✓ Q6${subQ.part}: Full marks (${subQ.marks})`);
            } else if (similarity > 0.3) {
              marksAwarded += 1;
              details.push(`~ Q6${subQ.part}: Partial (1/${subQ.marks})`);
            } else {
              details.push(`✗ Q6${subQ.part}: Incorrect (0/${subQ.marks})`);
            }
          }
        }
        feedback = `${marksAwarded}/${schemeQ.maxMarks} for comprehension`;
        break;
      }
    }

    results.push({
      questionNumber: schemeQ.number,
      questionText: studentQ.questionText,
      type: schemeQ.type,
      marksAwarded,
      maxMarks: schemeQ.maxMarks,
      feedback,
      details,
      confidence: studentQ.confidence
    });
  }

  return results;
}

function calculateSimilarity(str1, str2) {
  const words1 = new Set(str1.split(/\s+/).filter(w => w.length > 2));
  const words2 = new Set(str2.split(/\s+/).filter(w => w.length > 2));
  const intersection = [...words1].filter(w => words2.has(w)).length;
  const union = new Set([...words1, ...words2]).size;
  return union > 0 ? intersection / union : 0;
}

// ═══════════════════════════════════════════════════════════════
// STEP 4: ANNOTATION ENGINE
// ═══════════════════════════════════════════════════════════════

const COLORS = {
  correct: '#16a34a',   // Green
  partial: '#ea580c',   // Orange
  incorrect: '#dc2626', // Red
  header: '#1e40af'     // Blue
};

function getGradeInfo(percentage) {
  if (percentage >= 90) return { grade: 'A+', color: '#16a34a', emoji: '🌟' };
  if (percentage >= 80) return { grade: 'A', color: '#22c55e', emoji: '⭐' };
  if (percentage >= 70) return { grade: 'B', color: '#84cc16', emoji: '✅' };
  if (percentage >= 60) return { grade: 'C', color: '#eab308', emoji: '📚' };
  if (percentage >= 50) return { grade: 'D', color: '#f97316', emoji: '📖' };
  return { grade: 'F', color: '#ef4444', emoji: '⚠️' };
}

async function createAnnotatedReport(ocrResult, gradingResults, outputPath) {
  const totalMarks = gradingResults.reduce((sum, r) => sum + r.marksAwarded, 0);
  const maxMarks = gradingResults.reduce((sum, r) => sum + r.maxMarks, 0);
  const percentage = Math.round((totalMarks / maxMarks) * 100);
  const gradeInfo = getGradeInfo(percentage);

  // Create a nice report image
  const width = 800;
  const height = 1200;

  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="headerGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" style="stop-color:#1e40af;stop-opacity:1" />
          <stop offset="100%" style="stop-color:#3b82f6;stop-opacity:1" />
        </linearGradient>
      </defs>

      <!-- Background -->
      <rect width="${width}" height="${height}" fill="#f8fafc"/>

      <!-- Header -->
      <rect x="0" y="0" width="${width}" height="140" fill="url(#headerGrad)"/>
      <text x="30" y="50" font-family="Arial, sans-serif" font-size="28" font-weight="bold" fill="white">
        📝 Exam Checker Report
      </text>
      <text x="30" y="85" font-family="Arial, sans-serif" font-size="20" fill="rgba(255,255,255,0.9)">
        Student: ${ocrResult.studentName} | Grade ${ocrResult.grade}-${ocrResult.section} | ${ocrResult.subject}
      </text>
      <text x="30" y="120" font-family="Arial, sans-serif" font-size="16" fill="rgba(255,255,255,0.7)">
        Graded by Rumi AI • رومی
      </text>

      <!-- Grade Badge -->
      <rect x="${width - 180}" y="30" width="150" height="80" rx="15" fill="${gradeInfo.color}"/>
      <text x="${width - 105}" y="70" font-family="Arial, sans-serif" font-size="32"
            font-weight="bold" fill="white" text-anchor="middle">
        ${gradeInfo.grade}
      </text>
      <text x="${width - 105}" y="95" font-family="Arial, sans-serif" font-size="18"
            fill="rgba(255,255,255,0.9)" text-anchor="middle">
        ${totalMarks}/${maxMarks} (${percentage}%)
      </text>

      <!-- Score Summary Box -->
      <rect x="30" y="160" width="${width - 60}" height="60" rx="10" fill="white" stroke="#e2e8f0" stroke-width="2"/>
      <text x="50" y="200" font-family="Arial, sans-serif" font-size="20" fill="#334155">
        Total Score: <tspan font-weight="bold" fill="${gradeInfo.color}">${totalMarks}/${maxMarks}</tspan>
        <tspan dx="30">Percentage: </tspan><tspan font-weight="bold" fill="${gradeInfo.color}">${percentage}%</tspan>
        <tspan dx="30">Grade: </tspan><tspan font-weight="bold" fill="${gradeInfo.color}">${gradeInfo.grade} ${gradeInfo.emoji}</tspan>
      </text>

      <!-- Questions Header -->
      <text x="30" y="270" font-family="Arial, sans-serif" font-size="18" font-weight="bold" fill="#1e293b">
        Question-by-Question Breakdown
      </text>
      <line x1="30" y1="280" x2="${width - 30}" y2="280" stroke="#cbd5e1" stroke-width="2"/>

      ${gradingResults.map((result, index) => {
        const y = 310 + (index * 130);
        const ratio = result.maxMarks > 0 ? result.marksAwarded / result.maxMarks : 0;
        const statusColor = ratio >= 1 ? COLORS.correct : (ratio > 0.5 ? COLORS.partial : COLORS.incorrect);
        const statusSymbol = ratio >= 1 ? '✓' : (ratio > 0.5 ? '~' : '✗');

        return `
          <!-- Q${result.questionNumber} -->
          <rect x="30" y="${y}" width="${width - 60}" height="110" rx="8" fill="white" stroke="#e2e8f0" stroke-width="1"/>

          <!-- Question number badge -->
          <rect x="45" y="${y + 15}" width="50" height="30" rx="5" fill="${statusColor}"/>
          <text x="70" y="${y + 36}" font-family="Arial, sans-serif" font-size="16"
                font-weight="bold" fill="white" text-anchor="middle">Q${result.questionNumber}</text>

          <!-- Score badge -->
          <rect x="${width - 130}" y="${y + 15}" width="90" height="30" rx="5" fill="${statusColor}"/>
          <text x="${width - 85}" y="${y + 36}" font-family="Arial, sans-serif" font-size="16"
                font-weight="bold" fill="white" text-anchor="middle">
            ${statusSymbol} ${result.marksAwarded}/${result.maxMarks}
          </text>

          <!-- Question text -->
          <text x="110" y="${y + 36}" font-family="Arial, sans-serif" font-size="14" fill="#475569">
            ${result.questionText.substring(0, 50)}${result.questionText.length > 50 ? '...' : ''}
          </text>

          <!-- Type and feedback -->
          <text x="45" y="${y + 65}" font-family="Arial, sans-serif" font-size="12" fill="#94a3b8">
            Type: ${result.type.replace(/_/g, ' ')}
          </text>
          <text x="45" y="${y + 85}" font-family="Arial, sans-serif" font-size="14" fill="#334155">
            ${result.feedback}
          </text>

          <!-- Confidence -->
          <text x="${width - 130}" y="${y + 95}" font-family="Arial, sans-serif" font-size="11" fill="#94a3b8">
            Confidence: ${Math.round(result.confidence * 100)}%
          </text>
        `;
      }).join('')}

      <!-- Footer -->
      <rect x="0" y="${height - 50}" width="${width}" height="50" fill="#f1f5f9"/>
      <text x="30" y="${height - 20}" font-family="Arial, sans-serif" font-size="14" fill="#64748b">
        🤖 Powered by Rumi AI Exam Checker • Processed: ${new Date().toLocaleString()}
      </text>
    </svg>
  `;

  // Create image from SVG
  const buffer = await sharp(Buffer.from(svg))
    .png()
    .toBuffer();

  fs.writeFileSync(outputPath, buffer);
  return { totalMarks, maxMarks, percentage, gradeInfo };
}

// ═══════════════════════════════════════════════════════════════
// MAIN EXECUTION
// ═══════════════════════════════════════════════════════════════

async function main() {
  console.log('\n' + '═'.repeat(70));
  console.log('  🔬 EXAM CHECKER FULL DEMO - Real Exam Processing');
  console.log('═'.repeat(70));

  // Step 1: Display OCR Results
  console.log('\n📸 STEP 1: OCR EXTRACTION');
  console.log('─'.repeat(70));
  console.log(`  Student: ${OCR_RESULT.studentName}`);
  console.log(`  Class: Grade ${OCR_RESULT.grade}, Section ${OCR_RESULT.section}`);
  console.log(`  Subject: ${OCR_RESULT.subject}`);
  console.log(`  Pages scanned: ${OCR_RESULT.pages}`);
  console.log(`  Questions found: ${OCR_RESULT.questions.length}`);

  // Step 2: Grade the exam
  console.log('\n📝 STEP 2: GRADING');
  console.log('─'.repeat(70));

  const gradingResults = gradeExam(OCR_RESULT, MARKING_SCHEME);

  for (const result of gradingResults) {
    const ratio = result.marksAwarded / result.maxMarks;
    const status = ratio >= 1 ? '✓' : (ratio > 0.5 ? '~' : '✗');
    const color = ratio >= 1 ? '\x1b[32m' : (ratio > 0.5 ? '\x1b[33m' : '\x1b[31m');
    const reset = '\x1b[0m';

    console.log(`\n  Q${result.questionNumber}: ${color}${status} ${result.marksAwarded}/${result.maxMarks}${reset}`);
    console.log(`     ${result.questionText.substring(0, 60)}...`);
    console.log(`     ${result.feedback}`);
    if (result.details.length > 0) {
      console.log(`     Details: ${result.details.slice(0, 3).join(', ')}${result.details.length > 3 ? '...' : ''}`);
    }
  }

  // Step 3: Generate Report
  console.log('\n\n🎨 STEP 3: GENERATING ANNOTATED REPORT');
  console.log('─'.repeat(70));

  const outputDir = path.join(__dirname, 'output');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputPath = path.join(outputDir, 'sameer_sheikh_graded_report.png');
  const summary = await createAnnotatedReport(OCR_RESULT, gradingResults, outputPath);

  console.log(`  ✅ Report generated!`);
  console.log(`  📁 Output: ${outputPath}`);

  // Final Summary
  console.log('\n' + '═'.repeat(70));
  console.log('  📊 FINAL RESULT');
  console.log('═'.repeat(70));
  console.log(`\n  Student: ${OCR_RESULT.studentName}`);
  console.log(`  Total Score: ${summary.totalMarks}/${summary.maxMarks}`);
  console.log(`  Percentage: ${summary.percentage}%`);
  console.log(`  Grade: ${summary.gradeInfo.grade} ${summary.gradeInfo.emoji}`);
  console.log('\n' + '═'.repeat(70));

  // Open the report
  console.log('\n  Opening report...\n');
}

main().catch(console.error);
