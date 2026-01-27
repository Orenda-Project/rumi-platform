/**
 * Exam Checker Dry Run Test
 * Tests the OCR + Grading pipeline with a sample exam image
 *
 * Usage: node scripts/exam-checker-dry-run.js
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const axios = require('axios');

// Mistral API configuration
const MISTRAL_API_URL = 'https://api.mistral.ai/v1/chat/completions';
const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY;

// OpenAI API configuration for grading
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Sample marking scheme for the test
const SAMPLE_MARKING_SCHEME = {
  questions: [
    { number: 1, type: 'vocabulary', maxMarks: 4, correctAnswers: ['learn = gain knowledge', 'through = from one side to another', 'activity = a thing that a person does', 'poem = a piece of writing'] },
    { number: 5, type: 'word_formation', maxMarks: 6, correctAnswers: ['map', 'keep', 'soap', 'look', 'pay'] },
    { number: 6, type: 'short_answer', maxMarks: 3, correctAnswer: 'Talha found a big red box in the garden' }
  ]
};

async function runOCR(imageUrl) {
  console.log('\n📸 Step 1: Running OCR on sample exam image...\n');

  if (!MISTRAL_API_KEY) {
    console.log('⚠️  MISTRAL_API_KEY not set. Using cached OCR result.\n');
    return getCachedOCRResult();
  }

  try {
    const response = await axios.post(
      MISTRAL_API_URL,
      {
        model: 'pixtral-large-latest',
        messages: [
          {
            role: 'system',
            content: `You are an expert OCR system specialized in reading handwritten exam papers.
Extract ALL text from this exam paper image, including:
1. Student name (usually at top)
2. Question numbers and text
3. Student's handwritten answers

Format your response as JSON:
{
  "studentName": "name if visible",
  "questions": [
    {
      "number": "1",
      "questionText": "question text",
      "studentAnswer": "handwritten answer",
      "confidence": 0.0-1.0
    }
  ]
}`
          },
          {
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: imageUrl } },
              { type: 'text', text: 'Extract all text from this exam paper. Return JSON format.' }
            ]
          }
        ],
        max_tokens: 4096,
        temperature: 0.1,
        response_format: { type: 'json_object' }
      },
      {
        headers: {
          'Authorization': `Bearer ${MISTRAL_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 60000
      }
    );

    const content = response.data.choices?.[0]?.message?.content;
    console.log('✅ OCR Complete!\n');
    return JSON.parse(content);
  } catch (error) {
    console.log(`❌ OCR Error: ${error.message}`);
    console.log('Using cached OCR result instead.\n');
    return getCachedOCRResult();
  }
}

function getCachedOCRResult() {
  // Simulated OCR result based on the sample exam
  return {
    studentName: 'Ayeda Kamran',
    questions: [
      {
        number: '1',
        questionText: 'Write the words / meanings',
        studentAnswer: 'Learn = gain knowledge, Through = from one side to another, activity = a thing that a person does, poem = a piece of writing',
        confidence: 0.9
      },
      {
        number: '5',
        questionText: 'Make 5 words with these letters',
        studentAnswer: 'map, keep, soap, look, pay',
        confidence: 0.85
      },
      {
        number: '6',
        questionText: 'Where did Talha find the box?',
        studentAnswer: 'Talha found a big red box in the garden',
        confidence: 0.95
      }
    ]
  };
}

async function gradeExam(ocrResult, markingScheme) {
  console.log('📝 Step 2: Grading exam answers...\n');

  const results = [];

  for (const schemeQuestion of markingScheme.questions) {
    const studentQuestion = ocrResult.questions.find(q => q.number === String(schemeQuestion.number));

    if (!studentQuestion) {
      results.push({
        questionNumber: schemeQuestion.number,
        status: 'NOT_FOUND',
        marksAwarded: 0,
        maxMarks: schemeQuestion.maxMarks,
        feedback: 'Question not found in student submission'
      });
      continue;
    }

    // Simple grading logic (in production, this would use GPT-4o)
    let marksAwarded = 0;
    let feedback = '';

    if (schemeQuestion.type === 'vocabulary') {
      // Check each vocab answer
      const correct = schemeQuestion.correctAnswers.filter(ans =>
        studentQuestion.studentAnswer.toLowerCase().includes(ans.split('=')[0].trim().toLowerCase())
      ).length;
      marksAwarded = correct;
      feedback = `Matched ${correct}/${schemeQuestion.correctAnswers.length} vocabulary items correctly.`;
    } else if (schemeQuestion.type === 'word_formation') {
      const words = studentQuestion.studentAnswer.split(',').map(w => w.trim().toLowerCase());
      const correct = words.filter(w => schemeQuestion.correctAnswers.includes(w)).length;
      marksAwarded = Math.min(correct, schemeQuestion.maxMarks);
      feedback = `Formed ${correct} valid words.`;
    } else if (schemeQuestion.type === 'short_answer') {
      // Fuzzy match for short answers
      const similarity = calculateSimilarity(
        studentQuestion.studentAnswer.toLowerCase(),
        schemeQuestion.correctAnswer.toLowerCase()
      );
      marksAwarded = Math.round(similarity * schemeQuestion.maxMarks);
      feedback = `Answer similarity: ${Math.round(similarity * 100)}%`;
    }

    results.push({
      questionNumber: schemeQuestion.number,
      questionText: studentQuestion.questionText,
      studentAnswer: studentQuestion.studentAnswer,
      marksAwarded,
      maxMarks: schemeQuestion.maxMarks,
      feedback,
      confidence: studentQuestion.confidence
    });
  }

  return results;
}

function calculateSimilarity(str1, str2) {
  const words1 = new Set(str1.split(/\s+/));
  const words2 = new Set(str2.split(/\s+/));
  const intersection = [...words1].filter(w => words2.has(w)).length;
  const union = new Set([...words1, ...words2]).size;
  return intersection / union;
}

function generateReport(studentName, gradingResults) {
  console.log('📊 Step 3: Generating report...\n');

  const totalMarks = gradingResults.reduce((sum, r) => sum + r.marksAwarded, 0);
  const maxMarks = gradingResults.reduce((sum, r) => sum + r.maxMarks, 0);
  const percentage = Math.round((totalMarks / maxMarks) * 100);

  console.log('═'.repeat(60));
  console.log(`  EXAM CHECKER RESULT - ${studentName}`);
  console.log('═'.repeat(60));
  console.log(`\n  Total Score: ${totalMarks}/${maxMarks} (${percentage}%)\n`);

  if (percentage >= 85) {
    console.log('  Grade: A - Excellent! 🌟\n');
  } else if (percentage >= 70) {
    console.log('  Grade: B - Good work! ✅\n');
  } else if (percentage >= 50) {
    console.log('  Grade: C - Needs improvement 📚\n');
  } else {
    console.log('  Grade: D - Please review material ⚠️\n');
  }

  console.log('─'.repeat(60));
  console.log('  QUESTION-BY-QUESTION BREAKDOWN');
  console.log('─'.repeat(60));

  for (const result of gradingResults) {
    console.log(`\n  Q${result.questionNumber}: ${result.marksAwarded}/${result.maxMarks}`);
    if (result.questionText) {
      console.log(`  Question: ${result.questionText.substring(0, 50)}...`);
    }
    if (result.studentAnswer) {
      console.log(`  Answer: ${result.studentAnswer.substring(0, 50)}...`);
    }
    console.log(`  Feedback: ${result.feedback}`);
  }

  console.log('\n' + '═'.repeat(60));
  console.log('  END OF REPORT');
  console.log('═'.repeat(60) + '\n');

  return { totalMarks, maxMarks, percentage, gradingResults };
}

async function main() {
  console.log('\n🔬 EXAM CHECKER DRY RUN TEST');
  console.log('═'.repeat(40));
  console.log('Testing OCR + Grading pipeline with sample exam\n');

  // Use a sample image URL (in production, this would be from R2)
  const sampleImagePath = path.join(__dirname, '../../../06_Logs & Misc/Reports/Active/Exam_Checker/eval/bbox_output/better_english_surya_p0.png');

  console.log(`Sample exam: ${path.basename(sampleImagePath)}`);

  // Step 1: OCR
  const ocrResult = await runOCR(sampleImagePath);
  console.log('OCR Result:');
  console.log(`  Student: ${ocrResult.studentName}`);
  console.log(`  Questions found: ${ocrResult.questions.length}`);

  // Step 2: Grade
  const gradingResults = await gradeExam(ocrResult, SAMPLE_MARKING_SCHEME);

  // Step 3: Generate Report
  const report = generateReport(ocrResult.studentName, gradingResults);

  console.log('✅ Dry run complete!\n');
  console.log('In production, this would:');
  console.log('  1. Receive images via WhatsApp');
  console.log('  2. Upload to R2 storage');
  console.log('  3. Process via SQS worker');
  console.log('  4. Send annotated images + PDF back to teacher');

  return report;
}

main().catch(console.error);
