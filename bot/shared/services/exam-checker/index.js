/**
 * Exam Checker Services - Barrel Export
 *
 * Created: 2026-01-24
 * Updated: 2026-01-25 (Added GradingScale, Feedback services)
 * Updated: 2026-10-19 (Added the exam-vision engine; Surya removed)
 */

const { ExamCheckerOrchestrator, SESSION_STATES } = require('./exam-checker.orchestrator');
const ExamSessionService = require('./exam-session.service');
const OCRService = require('./ocr.service');
const QuestionDetectorService = require('./question-detector.service');
const GradingService = require('./grading.service');
const AnnotationService = require('./annotation.service');
const DeliveryService = require('./delivery.service');
const ExamVisionService = require('./exam-vision.service');
const GradingScaleService = require('./grading-scale.service');
const FeedbackService = require('./feedback.service');

module.exports = {
  // Main orchestrator
  ExamCheckerOrchestrator,
  SESSION_STATES,

  // Services
  ExamSessionService,
  OCRService,
  QuestionDetectorService,
  GradingService,
  AnnotationService,
  DeliveryService,
  ExamVisionService,
  GradingScaleService,
  FeedbackService
};
