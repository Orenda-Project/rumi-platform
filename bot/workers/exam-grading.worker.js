/**
 * Exam Grading Worker
 *
 * Background worker for processing exam grading jobs.
 * Called by the SQS worker when 'exam_grading' jobs are received.
 *
 * Pipeline:
 * 1. Load session from database
 * 2. Run OCR on images (Mistral → Chandra fallback)
 * 3. Detect students and questions
 * 4. Grade with GPT-4o
 * 5. Annotate images
 * 6. Deliver results via WhatsApp
 *
 * Created: 2026-01-24
 * Bead: bd-092
 */

const {
  ExamCheckerOrchestrator,
  ExamSessionService,
  OCRService,
  QuestionDetectorService,
  GradingService,
  AnnotationService,
  DeliveryService
} = require('../shared/services/exam-checker');
const supabase = require('../shared/config/supabase');
const { logToFile } = require('../shared/utils/logger');
const { runWithCorrelation, generateCorrelationId } = require('../shared/utils/structured-logger');

/**
 * Process an exam grading job
 * @param {Object} payload - Job payload from SQS
 * @param {string} payload.sessionId - Exam session ID
 * @param {string} payload.userId - User ID
 * @param {string} [payload.phase] - Which phase to start from (default: 'ocr')
 */
async function process(payload) {
  const { sessionId, userId, phase = 'ocr' } = payload;
  const correlationId = payload.correlationId || generateCorrelationId();

  return runWithCorrelation(correlationId, async () => {
    const startTime = Date.now();

    logToFile('📊 Starting exam grading worker', {
      sessionId,
      userId,
      phase,
      correlationId
    });

    try {
      // Load session
      const session = await ExamSessionService.getById(sessionId);
      if (!session) {
        throw new Error(`Session not found: ${sessionId}`);
      }

      // Validate session state
      if (!['processing_ocr', 'grading'].includes(session.status)) {
        logToFile('⚠️ Session not in grading-ready state', {
          sessionId,
          currentStatus: session.status
        });
        return;
      }

      // Phase 1: OCR Processing
      if (phase === 'ocr') {
        await processOCRPhase(session, sessionId);
      }

      // Phase 2: Grading
      if (phase === 'ocr' || phase === 'grading') {
        await processGradingPhase(session, sessionId, userId);
      }

      // Phase 3: Annotation
      if (phase !== 'delivery') {
        await processAnnotationPhase(session, sessionId);
      }

      // Phase 4: Delivery
      await processDeliveryPhase(session, sessionId, userId);

      // Mark complete
      await ExamSessionService.updateStatus(sessionId, 'completed');

      const durationMs = Date.now() - startTime;
      logToFile('✅ Exam grading job complete', {
        sessionId,
        durationMs,
        studentCount: session.confirmed_students?.length || 0
      });

    } catch (error) {
      logToFile('❌ Exam grading job failed', {
        sessionId,
        error: error.message,
        stack: error.stack
      });

      // Update session with error
      await ExamSessionService.updateStatus(sessionId, 'error', {
        error_message: error.message
      });

      // Notify user of failure
      try {
        const user = await getUser(userId);
        if (user?.phone_number) {
          await DeliveryService.sendErrorNotification(
            user.phone_number,
            sessionId,
            error.message
          );
        }
      } catch (notifyError) {
        logToFile('⚠️ Failed to notify user of error', { error: notifyError.message });
      }

      throw error; // Re-throw for SQS retry
    }
  });
}

/**
 * Process OCR phase - extract text from all images
 */
async function processOCRPhase(session, sessionId) {
  logToFile('🔍 OCR Phase starting', { sessionId, imageCount: session.original_images?.length });

  // Run OCR on all images
  const ocrResults = await OCRService.extractBatch(session.original_images || []);

  // Detect students and questions
  const { students, questions } = await QuestionDetectorService.analyze(ocrResults);

  // Update session
  await ExamSessionService.update(sessionId, {
    ocr_results: ocrResults,
    detected_students: students,
    detected_questions: questions,
    ocr_provider: ocrResults.provider,
    ocr_confidence: ocrResults.averageConfidence
  });

  logToFile('✅ OCR Phase complete', {
    sessionId,
    studentsFound: students.length,
    questionsFound: questions.length,
    provider: ocrResults.provider
  });

  // For auto-processing: if students and questions detected, proceed to grading
  if (students.length > 0 && questions.length > 0) {
    // Auto-confirm students (in background worker, no user interaction)
    await ExamSessionService.update(sessionId, {
      confirmed_students: students
    });
    await ExamSessionService.updateStatus(sessionId, 'grading');
  }
}

/**
 * Process Grading phase - grade all student submissions
 */
async function processGradingPhase(session, sessionId, userId) {
  // Reload session to get latest data
  session = await ExamSessionService.getById(sessionId);

  if (!session.confirmed_students || session.confirmed_students.length === 0) {
    logToFile('⚠️ No confirmed students for grading', { sessionId });
    return;
  }

  logToFile('📊 Grading Phase starting', {
    sessionId,
    studentCount: session.confirmed_students.length
  });

  // Get user phone for progress updates
  const user = await getUser(userId);

  // Grade all students
  const gradingResults = await GradingService.gradeBatch(session, {
    concurrency: 5,
    onProgress: async (progress) => {
      logToFile('📊 Grading progress', { sessionId, ...progress });

      // Send progress update at milestones
      if (user?.phone_number && [25, 50, 75].includes(progress.percentage)) {
        try {
          await DeliveryService.sendProgressUpdate(user.phone_number, progress);
        } catch (e) {
          // Ignore progress notification failures
        }
      }
    }
  });

  // Update session with results
  await ExamSessionService.update(sessionId, {
    grading_results: gradingResults
  });

  logToFile('✅ Grading Phase complete', {
    sessionId,
    successful: gradingResults.successful.length,
    failed: gradingResults.failed.length,
    averageScore: gradingResults.summary.averagePercentage
  });
}

/**
 * Process Annotation phase - annotate graded exams with marks
 */
async function processAnnotationPhase(session, sessionId) {
  // Reload session
  session = await ExamSessionService.getById(sessionId);

  const gradingResults = session.grading_results;
  if (!gradingResults?.successful || gradingResults.successful.length === 0) {
    logToFile('⚠️ No successful grades for annotation', { sessionId });
    return;
  }

  logToFile('🎨 Annotation Phase starting', {
    sessionId,
    resultCount: gradingResults.successful.length
  });

  const annotatedImages = await AnnotationService.annotateBatch(
    session,
    gradingResults.successful
  );

  await ExamSessionService.update(sessionId, {
    annotated_images: annotatedImages
  });

  logToFile('✅ Annotation Phase complete', {
    sessionId,
    annotatedCount: annotatedImages.length
  });
}

/**
 * Process Delivery phase - send results to user
 */
async function processDeliveryPhase(session, sessionId, userId) {
  // Reload session
  session = await ExamSessionService.getById(sessionId);

  logToFile('📤 Delivery Phase starting', { sessionId });

  await DeliveryService.sendResults(session, userId);
  await ExamSessionService.updateStatus(sessionId, 'delivering_results');

  logToFile('✅ Delivery Phase complete', { sessionId });
}

/**
 * Get user from database
 */
async function getUser(userId) {
  const { data, error } = await supabase
    .from('users')
    .select('id, phone_number, preferred_language')
    .eq('id', userId)
    .single();

  if (error) {
    logToFile('⚠️ Failed to get user', { userId, error: error.message });
    return null;
  }

  return data;
}

/**
 * Queue an exam grading job to SQS
 * @param {string} sessionId - Exam session ID
 * @param {string} userId - User ID
 * @param {string} [phase] - Starting phase
 */
async function queueExamGradingJob(sessionId, userId, phase = 'ocr') {
  const SQSQueueService = require('../shared/services/queue/sqs-queue.service');

  const correlationId = generateCorrelationId();

  await SQSQueueService.queueJob(
    sessionId,
    'exam_grading',
    {
      sessionId,
      userId,
      phase,
      correlationId
    }
  );

  logToFile('📤 Exam grading job queued', {
    sessionId,
    userId,
    phase,
    correlationId
  });
}

/**
 * Recover stale exam grading sessions
 * Called by SQS worker on startup and periodically
 */
async function recoverStaleExamSessions() {
  const STALE_THRESHOLD_MINUTES = 15;
  const MAX_RETRIES = 3;

  try {
    logToFile('Checking for stale exam sessions...');

    const staleThreshold = new Date(Date.now() - STALE_THRESHOLD_MINUTES * 60 * 1000).toISOString();

    const { data: staleSessions, error } = await supabase
      .from('exam_check_sessions')
      .select('id, user_id, status, retry_count')
      .in('status', ['processing_ocr', 'grading'])
      .lt('processing_started_at', staleThreshold);

    if (error) {
      logToFile('Error querying stale exam sessions', { error: error.message });
      return;
    }

    if (!staleSessions || staleSessions.length === 0) {
      logToFile('No stale exam sessions found');
      return;
    }

    logToFile(`Found ${staleSessions.length} stale exam sessions`, {
      sessionIds: staleSessions.map(s => s.id)
    });

    for (const session of staleSessions) {
      const retryCount = session.retry_count || 0;

      if (retryCount >= MAX_RETRIES) {
        // Mark as failed
        await ExamSessionService.updateStatus(session.id, 'error', {
          error_message: 'Exceeded max retries'
        });
        logToFile('Stale exam session marked as failed', { sessionId: session.id });
      } else {
        // Increment retry count and re-queue
        await supabase
          .from('exam_check_sessions')
          .update({ retry_count: retryCount + 1 })
          .eq('id', session.id);

        await queueExamGradingJob(session.id, session.user_id, 'ocr');
        logToFile('Stale exam session re-queued', {
          sessionId: session.id,
          retryCount: retryCount + 1
        });
      }
    }
  } catch (error) {
    logToFile('Error recovering stale exam sessions', { error: error.message });
  }
}

module.exports = {
  process,
  queueExamGradingJob,
  recoverStaleExamSessions
};
