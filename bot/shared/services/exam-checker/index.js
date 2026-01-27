/**
 * Exam Checker Services - Barrel Export
 *
 * Created: 2026-01-24
 * Updated: 2026-01-25 (Added Surya, GradingScale, Feedback services)
 * Beads: bd-081, bd-166, bd-173, bd-176, bd-177
 */

const { ExamCheckerOrchestrator, SESSION_STATES } = require('./exam-checker.orchestrator');
const ExamSessionService = require('./exam-session.service');
const OCRService = require('./ocr.service');
const QuestionDetectorService = require('./question-detector.service');
const GradingService = require('./grading.service');
const AnnotationService = require('./annotation.service');
const DeliveryService = require('./delivery.service');
const SuryaService = require('./surya.service');
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
  SuryaService,
  GradingScaleService,
  FeedbackService
};
