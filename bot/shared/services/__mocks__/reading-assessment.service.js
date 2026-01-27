/**
 * Mock ReadingAssessmentService for Testing
 */

const ReadingAssessmentService = {
  startAssessment: jest.fn().mockResolvedValue({ success: true }),
  hasActiveAssessment: jest.fn().mockResolvedValue(false),
  getActiveAssessment: jest.fn().mockResolvedValue(null),
  handleAssessmentResponse: jest.fn().mockResolvedValue({ success: true }),
  completeAssessment: jest.fn().mockResolvedValue({ success: true }),
  _resetAllMocks: function() {
    Object.keys(this).forEach(key => {
      if (typeof this[key] === 'function' && typeof this[key].mockReset === 'function') {
        this[key].mockReset();
      }
    });
    this.startAssessment.mockResolvedValue({ success: true });
    this.hasActiveAssessment.mockResolvedValue(false);
  }
};

module.exports = ReadingAssessmentService;
