/**
 * Question Detector Service for Exam Checker
 * Analyzes OCR results to detect students and question types
 *
 * Created: 2026-01-24
 * Bead: bd-083 (OCR dependency)
 */

const { logToFile } = require('../../utils/logger');

// Question type patterns
const QUESTION_TYPE_PATTERNS = {
  mcq: [
    /\([A-D]\)/i,
    /\b[A-D]\.\s/,
    /circle.*correct/i,
    /choose.*correct/i,
    /tick.*correct/i
  ],
  true_false: [
    /true\s*\/\s*false/i,
    /T\s*\/\s*F/,
    /mark.*true.*false/i
  ],
  fill_blank: [
    /_+/,
    /fill.*blank/i,
    /complete.*sentence/i
  ],
  short_answer: [
    /answer.*briefly/i,
    /write.*short/i,
    /in.*words/i,
    /\(\d+\s*marks?\)/i
  ],
  essay: [
    /explain.*detail/i,
    /discuss/i,
    /describe.*length/i,
    /write.*essay/i,
    /\(10\+?\s*marks?\)/i
  ],
  math: [
    /solve/i,
    /calculate/i,
    /find.*value/i,
    /simplify/i,
    /evaluate/i,
    /\d+\s*[+\-×÷=]\s*\d+/
  ]
};

class QuestionDetectorService {
  /**
   * Analyze OCR results to extract students and questions
   * @param {object} ocrResults - Batch OCR results from OCRService
   * @returns {object} { students, questions }
   */
  static async analyze(ocrResults) {
    logToFile('🔍 Analyzing OCR results', {
      pageCount: ocrResults.totalPages,
      successRate: ocrResults.successRate
    });

    const students = this._detectStudents(ocrResults.pages);
    const questions = this._detectQuestions(ocrResults.pages);

    logToFile('✅ Analysis complete', {
      studentsFound: students.length,
      questionsFound: questions.length
    });

    return { students, questions };
  }

  /**
   * Detect students from OCR pages
   * @param {Array} pages - OCR page results
   * @returns {Array} Detected students
   */
  static _detectStudents(pages) {
    const studentMap = new Map();

    for (const page of pages) {
      if (!page.success) continue;

      // Try to find student name from structured data
      if (page.studentName) {
        const key = page.studentName.toLowerCase().trim();
        if (!studentMap.has(key)) {
          studentMap.set(key, {
            name: page.studentName,
            rollNumber: page.rollNumber,
            pageNumbers: [page.pageNumber],
            confidence: page.confidence || 0.7
          });
        } else {
          studentMap.get(key).pageNumbers.push(page.pageNumber);
        }
        continue;
      }

      // Try to extract from raw text
      const extracted = this._extractStudentFromText(page.rawText);
      if (extracted) {
        const key = extracted.name.toLowerCase().trim();
        if (!studentMap.has(key)) {
          studentMap.set(key, {
            ...extracted,
            pageNumbers: [page.pageNumber],
            confidence: 0.6
          });
        } else {
          studentMap.get(key).pageNumbers.push(page.pageNumber);
        }
      }
    }

    return Array.from(studentMap.values());
  }

  /**
   * Extract student info from raw text
   * @param {string} text - Raw OCR text
   * @returns {object|null} Student info or null
   */
  static _extractStudentFromText(text) {
    if (!text) return null;

    // Common patterns for student names
    const namePatterns = [
      /name[:\s]+([A-Za-z\s]+?)(?:\n|roll|class|date)/i,
      /student[:\s]+([A-Za-z\s]+?)(?:\n|roll|class)/i,
      /نام[:\s]+([^\n]+)/,  // Urdu
    ];

    const rollPatterns = [
      /roll\s*(?:no\.?|number)?[:\s]+(\d+)/i,
      /id[:\s]+(\d+)/i,
      /رول\s*نمبر[:\s]+(\d+)/
    ];

    let name = null;
    let rollNumber = null;

    for (const pattern of namePatterns) {
      const match = text.match(pattern);
      if (match) {
        name = match[1].trim();
        break;
      }
    }

    for (const pattern of rollPatterns) {
      const match = text.match(pattern);
      if (match) {
        rollNumber = match[1].trim();
        break;
      }
    }

    return name ? { name, rollNumber } : null;
  }

  /**
   * Detect questions from OCR pages
   * @param {Array} pages - OCR page results
   * @returns {Array} Detected questions with types
   */
  static _detectQuestions(pages) {
    const allQuestions = [];
    let questionCounter = 1;

    for (const page of pages) {
      if (!page.success) continue;

      // Use pre-parsed questions if available
      if (page.questions && page.questions.length > 0) {
        for (const q of page.questions) {
          allQuestions.push({
            id: `Q${questionCounter}`,
            number: q.number || questionCounter,
            text: q.questionText || '',
            type: this._detectQuestionType(q.questionText || ''),
            studentAnswer: q.studentAnswer || '',
            pageNumber: page.pageNumber,
            confidence: q.confidence || 0.7
          });
          questionCounter++;
        }
        continue;
      }

      // Parse questions from raw text
      const parsedQuestions = this._parseQuestionsFromRawText(page.rawText, page.pageNumber);
      for (const q of parsedQuestions) {
        q.id = `Q${questionCounter}`;
        allQuestions.push(q);
        questionCounter++;
      }
    }

    // Deduplicate similar questions
    return this._deduplicateQuestions(allQuestions);
  }

  /**
   * Parse questions from raw text
   * @param {string} text - Raw OCR text
   * @param {number} pageNumber - Page number
   * @returns {Array} Parsed questions
   */
  static _parseQuestionsFromRawText(text, pageNumber) {
    if (!text) return [];

    const questions = [];
    const lines = text.split('\n');

    let currentQuestion = null;
    let currentAnswer = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Check if this is a new question
      const qMatch = trimmed.match(/^(?:Q\.?\s*)?(\d+)[.):\s]/i);
      if (qMatch) {
        // Save previous question
        if (currentQuestion) {
          currentQuestion.studentAnswer = currentAnswer.join('\n').trim();
          questions.push(currentQuestion);
        }

        // Start new question
        currentQuestion = {
          number: parseInt(qMatch[1]),
          text: trimmed.substring(qMatch[0].length).trim(),
          type: this._detectQuestionType(trimmed),
          pageNumber,
          confidence: 0.7
        };
        currentAnswer = [];
      } else if (currentQuestion) {
        // Add to current answer
        currentAnswer.push(trimmed);
      }
    }

    // Don't forget the last question
    if (currentQuestion) {
      currentQuestion.studentAnswer = currentAnswer.join('\n').trim();
      questions.push(currentQuestion);
    }

    return questions;
  }

  /**
   * Detect question type from text
   * @param {string} text - Question text
   * @returns {string} Question type
   */
  static _detectQuestionType(text) {
    if (!text) return 'short_answer';

    for (const [type, patterns] of Object.entries(QUESTION_TYPE_PATTERNS)) {
      for (const pattern of patterns) {
        if (pattern.test(text)) {
          return type;
        }
      }
    }

    // Default based on text length
    if (text.length < 50) return 'short_answer';
    return 'essay';
  }

  /**
   * Deduplicate similar questions
   * @param {Array} questions - All detected questions
   * @returns {Array} Deduplicated questions
   */
  static _deduplicateQuestions(questions) {
    const seen = new Map();

    for (const q of questions) {
      const key = `${q.number}-${q.text?.substring(0, 50)}`;
      if (!seen.has(key) || q.confidence > seen.get(key).confidence) {
        seen.set(key, q);
      }
    }

    return Array.from(seen.values()).sort((a, b) => a.number - b.number);
  }
}

module.exports = QuestionDetectorService;
