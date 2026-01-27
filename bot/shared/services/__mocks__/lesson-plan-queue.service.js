/**
 * Mock LessonPlanQueueService for Testing
 *
 * Updated: 2026-01-14 to match complete interface
 */

const LessonPlanQueueService = {
  queueLessonPlan: jest.fn().mockResolvedValue({ success: true, jobId: 'mock_job_id' }),
  getQueueStatus: jest.fn().mockResolvedValue({ pending: 0, processing: 0 }),

  // Used by presentation request handler
  createAndQueue: jest.fn().mockResolvedValue('mock-queue-id'),

  _resetAllMocks: function() {
    Object.keys(this).forEach(key => {
      if (typeof this[key] === 'function' && typeof this[key].mockReset === 'function') {
        this[key].mockReset();
      }
    });
    this.queueLessonPlan.mockResolvedValue({ success: true, jobId: 'mock_job_id' });
    this.createAndQueue.mockResolvedValue('mock-queue-id');
  }
};

module.exports = LessonPlanQueueService;
