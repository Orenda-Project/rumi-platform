/**
 * Unit Tests: Lesson Plan Worker Idempotency
 * TDD for fix: Prevent duplicate lesson plan delivery
 */

describe('LessonPlanGenerationWorker - Idempotency', () => {
  let mockGetRequest;
  let mockMarkProcessing;
  let mockGenerateLessonPlan;
  let mockSendDocument;
  let mockLogToFile;

  beforeEach(() => {
    jest.resetModules();

    // Mock LessonPlanQueueService
    jest.doMock('../../shared/services/lesson-plan-queue.service', () => ({
      getRequest: jest.fn(),
      markProcessing: jest.fn(),
      markCompleted: jest.fn(),
      markFailed: jest.fn()
    }));
    const LessonPlanQueueService = require('../../shared/services/lesson-plan-queue.service');
    mockGetRequest = LessonPlanQueueService.getRequest;
    mockMarkProcessing = LessonPlanQueueService.markProcessing;

    // Mock ContentService
    jest.doMock('../../shared/services/content.service', () => ({
      generateLessonPlan: jest.fn(),
      generatePresentation: jest.fn(),
      downloadPDF: jest.fn()
    }));
    mockGenerateLessonPlan = require('../../shared/services/content.service').generateLessonPlan;

    // Mock WhatsAppService
    jest.doMock('../../shared/services/whatsapp.service', () => ({
      sendDocument: jest.fn(),
      sendMessage: jest.fn()
    }));
    mockSendDocument = require('../../shared/services/whatsapp.service').sendDocument;

    // Mock logger
    jest.doMock('../../shared/utils/logger', () => ({
      logToFile: jest.fn()
    }));
    mockLogToFile = require('../../shared/utils/logger').logToFile;

    // Mock other dependencies
    jest.doMock('../../shared/config/supabase', () => ({ from: jest.fn() }));
    jest.doMock('../../shared/services/feature-linker.service', () => ({ suggestNext: jest.fn() }));
    jest.doMock('../../shared/services/feature-registration.service', () => ({ checkAndTriggerRegistration: jest.fn() }));
    jest.doMock('../../shared/database/bot-helpers', () => ({ storeLessonPlan: jest.fn() }));
  });

  afterEach(() => {
    jest.resetModules();
  });

  it('should skip processing if request is already completed', async () => {
    // Arrange: Request already completed
    mockGetRequest.mockResolvedValue({
      id: 'test-request-123',
      status: 'completed',
      gamma_url: 'https://gamma.app/existing',
      pdf_url: 'https://r2.example.com/existing.pdf'
    });

    const LessonPlanGenerationWorker = require('../../workers/lesson-plan-generation.worker');

    // Act
    await LessonPlanGenerationWorker.process({
      requestId: 'test-request-123',
      userId: 'user-uuid',
      phoneNumber: '15550010001',
      topic: 'Potential Energy',
      fullMessage: 'Generate a lesson plan on potential energy',
      language: 'en',
      contentType: 'lesson_plan'
    });

    // Assert: Gamma NOT called, processing NOT started
    expect(mockGenerateLessonPlan).not.toHaveBeenCalled();
    expect(mockMarkProcessing).not.toHaveBeenCalled();
    expect(mockSendDocument).not.toHaveBeenCalled();
    expect(mockLogToFile).toHaveBeenCalledWith(
      expect.stringContaining('already completed'),
      expect.objectContaining({ requestId: 'test-request-123' })
    );
  });

  it('should skip if request is processing and started < 2 min ago', async () => {
    // Arrange: Request being processed by another worker (started 30 seconds ago)
    const thirtySecondsAgo = new Date(Date.now() - 30 * 1000).toISOString();
    mockGetRequest.mockResolvedValue({
      id: 'test-request-123',
      status: 'processing',
      processing_started_at: thirtySecondsAgo
    });

    const LessonPlanGenerationWorker = require('../../workers/lesson-plan-generation.worker');

    // Act
    await LessonPlanGenerationWorker.process({
      requestId: 'test-request-123',
      userId: 'user-uuid',
      phoneNumber: '15550010001',
      topic: 'Potential Energy',
      fullMessage: 'Generate a lesson plan',
      language: 'en',
      contentType: 'lesson_plan'
    });

    // Assert: Gamma NOT called
    expect(mockGenerateLessonPlan).not.toHaveBeenCalled();
    expect(mockLogToFile).toHaveBeenCalledWith(
      expect.stringContaining('being processed by another worker'),
      expect.any(Object)
    );
  });

  it('should process stale processing request (> 2 min old)', async () => {
    // Arrange: Request stuck in processing for 5 minutes (stale)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    mockGetRequest.mockResolvedValue({
      id: 'test-request-123',
      status: 'processing',
      processing_started_at: fiveMinutesAgo
    });

    mockGenerateLessonPlan.mockResolvedValue({
      gammaUrl: 'https://gamma.app/new',
      pdfUrl: 'https://r2.example.com/new.pdf'
    });

    const LessonPlanGenerationWorker = require('../../workers/lesson-plan-generation.worker');

    // Act
    await LessonPlanGenerationWorker.process({
      requestId: 'test-request-123',
      userId: 'user-uuid',
      phoneNumber: '15550010001',
      topic: 'Potential Energy',
      fullMessage: 'Generate a lesson plan',
      language: 'en',
      contentType: 'lesson_plan'
    });

    // Assert: Should proceed with generation (stale job recovery)
    expect(mockMarkProcessing).toHaveBeenCalled();
    expect(mockGenerateLessonPlan).toHaveBeenCalled();
  });

  it('should process pending request normally', async () => {
    // Arrange: Normal pending request
    mockGetRequest.mockResolvedValue({
      id: 'test-request-123',
      status: 'pending'
    });

    mockGenerateLessonPlan.mockResolvedValue({
      gammaUrl: 'https://gamma.app/new',
      pdfUrl: null // No PDF for this test
    });

    const LessonPlanGenerationWorker = require('../../workers/lesson-plan-generation.worker');

    // Act
    await LessonPlanGenerationWorker.process({
      requestId: 'test-request-123',
      userId: 'user-uuid',
      phoneNumber: '15550010001',
      topic: 'Potential Energy',
      fullMessage: 'Generate a lesson plan',
      language: 'en',
      contentType: 'lesson_plan'
    });

    // Assert: Normal processing flow
    expect(mockMarkProcessing).toHaveBeenCalledWith('test-request-123');
    expect(mockGenerateLessonPlan).toHaveBeenCalledWith('Potential Energy', 'Generate a lesson plan', 'en');
  });
});
