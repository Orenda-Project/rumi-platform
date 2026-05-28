/**
 * Exam Checker Orchestrator Service
 * High-level coordinator for exam checking workflow
 *
 * DESIGN: This is a THIN COORDINATOR, NOT a God Object.
 * - It delegates ALL work to specialized services
 * - It only manages workflow state transitions
 * - Each method is <20 lines (mostly delegation)
 *
 * Created: 2026-01-24
 */

const { runWithCorrelation, getCurrentCorrelationId } = require('../../utils/structured-logger');
const { logToFile } = require('../../utils/logger');

// Service imports (to be created)
// const ExamSessionService = require('./exam-session.service');
// const OCRService = require('./ocr.service');
// const QuestionDetectorService = require('./question-detector.service');
// const GradingService = require('./grading.service');
// const AnnotationService = require('./annotation.service');
// const DeliveryService = require('./delivery.service');
// const ProgressService = require('./progress.service');

/**
 * Session states for the exam checker workflow
 */
const SESSION_STATES = {
  IDLE: 'idle',
  COLLECTING_IMAGES: 'collecting_images',
  PROCESSING_OCR: 'processing_ocr',
  CONFIRMING_STUDENTS: 'confirming_students',
  DETECTING_QUESTIONS: 'detecting_questions',
  COLLECTING_ANSWERS: 'collecting_answers',
  CONFIRMING_SCHEME: 'confirming_scheme',
  GRADING: 'grading',
  DELIVERING_RESULTS: 'delivering_results',
  COMPLETED: 'completed',
  ERROR: 'error',
  CANCELLED: 'cancelled'
};

class ExamCheckerOrchestrator {
  /**
   * Main entry point - delegates to appropriate handler based on session state
   * @param {object} message - WhatsApp message object
   * @param {string} userId - User UUID
   * @returns {object} Response to send back
   */
  static async process(message, userId) {
    const correlationId = getCurrentCorrelationId() || `ech-${Date.now()}`;

    return runWithCorrelation(correlationId, async () => {
      // Get or create session (delegate to session service)
      const ExamSessionService = require('./exam-session.service');
      const session = await ExamSessionService.getOrCreate(userId);

      logToFile('📝 Processing exam checker message', {
        state: session.status,
        messageType: message.type,
        correlationId
      });

      // State machine - delegate to appropriate handler
      const handlers = {
        [SESSION_STATES.IDLE]: () => this.handleStart(session, message, userId),
        [SESSION_STATES.COLLECTING_IMAGES]: () => this.handleImageCollection(session, message, userId),
        [SESSION_STATES.PROCESSING_OCR]: () => this.handleOCRProcessing(session, userId),
        [SESSION_STATES.CONFIRMING_STUDENTS]: () => this.handleStudentConfirmation(session, message, userId),
        [SESSION_STATES.DETECTING_QUESTIONS]: () => this.handleQuestionDetection(session, userId),
        [SESSION_STATES.COLLECTING_ANSWERS]: () => this.handleAnswerCollection(session, message, userId),
        [SESSION_STATES.CONFIRMING_SCHEME]: () => this.handleSchemeConfirmation(session, message, userId),
        [SESSION_STATES.GRADING]: () => this.handleGrading(session, userId),
        [SESSION_STATES.DELIVERING_RESULTS]: () => this.handleDelivery(session, userId),
      };

      const handler = handlers[session.status];
      if (!handler) {
        logToFile('⚠️ Unknown session state', { state: session.status, sessionId: session.id });
        return { text: 'Something went wrong. Please try again with "check exams".' };
      }

      return handler();
    });
  }

  // ==================== STATE HANDLERS (Each <20 lines) ====================

  /**
   * Handle initial start - user says "check exams" or sends first image
   */
  static async handleStart(session, message, userId) {
    if (message.type !== 'image') {
      return {
        text: '📷 Send photos of student exams to get started!\n\nYou can send multiple images at once.',
      };
    }
    // If image, delegate to image collection
    return this.handleImageCollection(session, message, userId);
  }

  /**
   * Handle image collection phase - accumulate images until user clicks Process
   */
  static async handleImageCollection(session, message, userId) {
    const ExamSessionService = require('./exam-session.service');

    if (message.type === 'image') {
      // Add image to session
      await ExamSessionService.addImage(session.id, message.mediaUrl);
      const imageCount = (session.original_images?.length || 0) + 1;

      logToFile('📷 Image added to exam session', { sessionId: session.id, imageCount });

      return {
        text: `📷 Got ${imageCount} image${imageCount > 1 ? 's' : ''}!`,
        interactive: {
          type: 'button',
          body: { text: `Send more images or tap Process when ready.` },
          action: {
            buttons: [
              { type: 'reply', reply: { id: 'ech_add_more', title: '📷 Add more' } },
              { type: 'reply', reply: { id: 'ech_process_now', title: '✅ Process now' } }
            ]
          }
        }
      };
    }

    // Handle button clicks
    if (message.buttonId === 'ech_process_now') {
      await ExamSessionService.updateStatus(session.id, SESSION_STATES.PROCESSING_OCR);
      return this.handleOCRProcessing(session, userId);
    }

    if (message.buttonId === 'ech_add_more') {
      return { text: '📷 Send more exam images.' };
    }

    // Default: prompt for more images
    return {
      text: 'Send more exam images or tap "Process now" when ready.',
      interactive: {
        type: 'button',
        body: { text: `You have ${session.original_images?.length || 0} images.` },
        action: {
          buttons: [
            { type: 'reply', reply: { id: 'ech_add_more', title: '📷 Add more' } },
            { type: 'reply', reply: { id: 'ech_process_now', title: '✅ Process now' } }
          ]
        }
      }
    };
  }

  /**
   * Handle OCR processing - extract text and detect students
   */
  static async handleOCRProcessing(session, userId) {
    const ExamSessionService = require('./exam-session.service');
    const OCRService = require('./ocr.service');
    const QuestionDetectorService = require('./question-detector.service');

    logToFile('⏳ Starting OCR processing', { sessionId: session.id, imageCount: session.original_images?.length });

    try {
      // Extract text from all images (with Mistral → Chandra fallback)
      const ocrResults = await OCRService.extractBatch(session.original_images);

      // Detect students and questions from OCR results
      const { students, questions } = await QuestionDetectorService.analyze(ocrResults);

      // Update session with detected data
      await ExamSessionService.update(session.id, {
        detected_students: students,
        detected_questions: questions,
        ocr_provider: ocrResults.provider,
        ocr_confidence: ocrResults.averageConfidence
      });
      await ExamSessionService.updateStatus(session.id, SESSION_STATES.CONFIRMING_STUDENTS);

      logToFile('✅ OCR processing complete', {
        sessionId: session.id,
        studentsFound: students.length,
        questionsFound: questions.length
      });

      // Launch WhatsApp Flow for student confirmation
      return {
        text: `✅ Found ${students.length} student${students.length !== 1 ? 's' : ''} in your exams!`,
        flow: {
          id: process.env.EXAM_CHECKER_STUDENTS_FLOW_ID || 'exam_checker_confirm_students',
          data: {
            students: students.map((s, i) => ({
              id: i,
              name: s.name,
              pages: s.pageNumbers?.length || 1,
              confidence: s.confidence
            }))
          }
        }
      };
    } catch (error) {
      logToFile('❌ OCR processing failed', { sessionId: session.id, error: error.message });
      await ExamSessionService.updateStatus(session.id, SESSION_STATES.ERROR, { error_message: error.message });
      return { text: '❌ Sorry, I had trouble reading the exam images. Please try again with clearer photos.' };
    }
  }

  /**
   * Handle student confirmation from WhatsApp Flow
   */
  static async handleStudentConfirmation(session, message, userId) {
    const ExamSessionService = require('./exam-session.service');

    if (message.flowResponse) {
      const confirmedStudents = message.flowResponse.confirmed_students;
      await ExamSessionService.update(session.id, { confirmed_students: confirmedStudents });
      await ExamSessionService.updateStatus(session.id, SESSION_STATES.DETECTING_QUESTIONS);

      logToFile('✅ Students confirmed', { sessionId: session.id, count: confirmedStudents.length });

      return this.handleQuestionDetection(session, userId);
    }

    return { text: 'Please confirm the student names in the form.' };
  }

  /**
   * Handle question detection display and confirmation
   */
  static async handleQuestionDetection(session, userId) {
    const ExamSessionService = require('./exam-session.service');
    const questions = session.detected_questions || [];

    const questionSummary = questions.map((q, i) =>
      `Q${i + 1}: ${q.type} ${q.text ? `- "${q.text.substring(0, 30)}..."` : ''}`
    ).join('\n');

    return {
      text: `📝 Detected ${questions.length} questions:\n\n${questionSummary}\n\nIs this correct?`,
      interactive: {
        type: 'button',
        body: { text: 'Confirm or edit the questions.' },
        action: {
          buttons: [
            { type: 'reply', reply: { id: 'ech_questions_correct', title: '✅ Yes, correct' } },
            { type: 'reply', reply: { id: 'ech_questions_edit', title: '✏️ Edit Qs' } }
          ]
        }
      }
    };
  }

  /**
   * Handle answer collection for marking scheme
   */
  static async handleAnswerCollection(session, message, userId) {
    const ExamSessionService = require('./exam-session.service');
    const currentQuestion = this._getNextUnansweredQuestion(session);

    if (!currentQuestion) {
      // All answers collected
      await ExamSessionService.updateStatus(session.id, SESSION_STATES.CONFIRMING_SCHEME);
      return this.handleSchemeConfirmation(session, message, userId);
    }

    // If user provided an answer
    if (message.answer || message.buttonId || message.text) {
      await ExamSessionService.addAnswer(session.id, currentQuestion.id, {
        answer: message.answer || message.text,
        buttonId: message.buttonId
      });
      // Recurse for next question
      return this.handleAnswerCollection(session, {}, userId);
    }

    // Generate prompt based on question type
    return this._generateAnswerPrompt(currentQuestion);
  }

  /**
   * Handle marking scheme confirmation before grading
   */
  static async handleSchemeConfirmation(session, message, userId) {
    const ExamSessionService = require('./exam-session.service');

    if (message.buttonId === 'ech_start_grading') {
      await ExamSessionService.updateStatus(session.id, SESSION_STATES.GRADING);
      return this.handleGrading(session, userId);
    }

    const scheme = session.marking_scheme || { questions: [], totalMarks: 0 };
    const summary = this._formatSchemeSummary(scheme);

    return {
      text: `📋 Marking scheme ready:\n\n${summary}\n\n📊 Total: ${scheme.totalMarks} marks`,
      interactive: {
        type: 'button',
        body: { text: 'Start grading or edit the scheme.' },
        action: {
          buttons: [
            { type: 'reply', reply: { id: 'ech_start_grading', title: '✅ Start grading' } },
            { type: 'reply', reply: { id: 'ech_edit_scheme', title: '✏️ Edit scheme' } }
          ]
        }
      }
    };
  }

  /**
   * Handle grading phase - grade all student submissions
   */
  static async handleGrading(session, userId) {
    const ExamSessionService = require('./exam-session.service');
    const GradingService = require('./grading.service');
    const AnnotationService = require('./annotation.service');

    logToFile('📊 Starting grading', {
      sessionId: session.id,
      studentCount: session.confirmed_students?.length
    });

    try {
      // Grade all submissions (concurrent with progress tracking)
      const gradingResults = await GradingService.gradeBatch(session, {
        concurrency: 5,
        onProgress: (progress) => {
          logToFile('📊 Grading progress', { sessionId: session.id, ...progress });
        }
      });

      // Annotate all graded submissions
      const annotatedImages = await AnnotationService.annotateBatch(session, gradingResults.successful);

      // Update session
      await ExamSessionService.update(session.id, {
        grading_results: gradingResults,
        annotated_images: annotatedImages
      });
      await ExamSessionService.updateStatus(session.id, SESSION_STATES.DELIVERING_RESULTS);

      logToFile('✅ Grading complete', {
        sessionId: session.id,
        successful: gradingResults.successful.length,
        failed: gradingResults.failed.length
      });

      return this.handleDelivery(session, userId);
    } catch (error) {
      logToFile('❌ Grading failed', { sessionId: session.id, error: error.message });
      await ExamSessionService.updateStatus(session.id, SESSION_STATES.ERROR, { error_message: error.message });
      return { text: '❌ Sorry, grading failed. Please try again.' };
    }
  }

  /**
   * Handle delivery of results
   */
  static async handleDelivery(session, userId) {
    const ExamSessionService = require('./exam-session.service');
    const DeliveryService = require('./delivery.service');

    try {
      // Deliver annotated images and PDF
      await DeliveryService.sendResults(session, userId);
      await ExamSessionService.updateStatus(session.id, SESSION_STATES.COMPLETED);

      const studentCount = session.confirmed_students?.length || 0;
      const portalBase = require('../../config/branding').portalUrl();
      // Omit the portal line entirely when unset — grading still completes;
      // we just don't dangle a placeholder URL at the teacher.
      const portalLine = portalBase
        ? `\n\n📱 View details and edit grades:\n${portalBase}/portal/exams/${session.id}`
        : '';

      return {
        text: `✅ Done! Graded ${studentCount} exam${studentCount !== 1 ? 's' : ''}.${portalLine}`
      };
    } catch (error) {
      logToFile('❌ Delivery failed', { sessionId: session.id, error: error.message });
      return { text: '❌ Grading complete but delivery failed. View results in the portal.' };
    }
  }

  // ==================== HELPER METHODS ====================

  /**
   * Get next question that doesn't have an answer yet
   */
  static _getNextUnansweredQuestion(session) {
    const questions = session.detected_questions || [];
    const scheme = session.marking_scheme || { questions: [] };
    return questions.find(q => !scheme.questions.find(a => a.id === q.id));
  }

  /**
   * Generate answer prompt based on question type
   */
  static _generateAnswerPrompt(question) {
    const questionNum = question.id || 'Q?';

    if (question.type === 'mcq') {
      return {
        text: `${questionNum}: What's the correct answer?`,
        interactive: {
          type: 'button',
          body: { text: question.text || 'Select the correct option:' },
          action: {
            buttons: [
              { type: 'reply', reply: { id: 'ech_ans_A', title: 'A' } },
              { type: 'reply', reply: { id: 'ech_ans_B', title: 'B' } },
              { type: 'reply', reply: { id: 'ech_ans_C', title: 'C' } },
              { type: 'reply', reply: { id: 'ech_ans_D', title: 'D' } }
            ]
          }
        }
      };
    }

    // For short answer, essay, math - ask for text or voice
    return {
      text: `${questionNum}: ${question.text || 'What is the correct answer?'}\n\n💡 Type your answer or send a 🎤 voice note.`
    };
  }

  /**
   * Format marking scheme summary
   */
  static _formatSchemeSummary(scheme) {
    if (!scheme.questions || scheme.questions.length === 0) {
      return 'No questions defined yet.';
    }
    return scheme.questions.map(q =>
      `${q.id}: ${q.type} (${q.marks} mark${q.marks !== 1 ? 's' : ''})`
    ).join('\n');
  }

  // ==================== CANCEL/RESET ====================

  /**
   * Cancel an active session
   */
  static async cancelSession(sessionId) {
    const ExamSessionService = require('./exam-session.service');
    await ExamSessionService.updateStatus(sessionId, SESSION_STATES.CANCELLED);
    logToFile('🚫 Exam session cancelled', { sessionId });
    return { text: 'Exam checking cancelled. Send "check exams" to start again.' };
  }

  /**
   * Get session state for external queries
   */
  static async getSessionState(userId) {
    const ExamSessionService = require('./exam-session.service');
    const session = await ExamSessionService.getActive(userId);
    return session ? { active: true, state: session.status, sessionId: session.id } : { active: false };
  }
}

module.exports = { ExamCheckerOrchestrator, SESSION_STATES };
