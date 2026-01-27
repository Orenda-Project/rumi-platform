/**
 * Mock OpenAIService for Testing
 *
 * Replicates the interface of the real OpenAIService
 * All methods are Jest mock functions for verification
 *
 * @module __mocks__/openai.service
 */

const OpenAIService = {
  // Primary chat method
  chat: jest.fn().mockResolvedValue({
    response: 'This is a mock AI response.',
    usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 }
  }),

  // Coaching-specific methods
  generateCoachingResponse: jest.fn().mockResolvedValue({
    response: 'Great teaching moment! Here is my coaching feedback...',
    phase: 'feedback'
  }),

  // Lesson plan methods
  generateLessonPlanContent: jest.fn().mockResolvedValue({
    title: 'Mock Lesson Plan',
    objectives: ['Objective 1', 'Objective 2'],
    activities: ['Activity 1', 'Activity 2'],
    assessment: 'Mock assessment criteria'
  }),

  // Intent detection
  detectIntent: jest.fn().mockResolvedValue({
    intent: 'general_query',
    confidence: 0.85,
    entities: {}
  }),

  // Format-aware response (used in text-message.handler general conversation)
  getResponseWithFormat: jest.fn().mockResolvedValue({
    response: 'Mock AI response',
    tokens: { prompt: 100, completion: 50 }
  }),

  // Language-related
  translateText: jest.fn().mockImplementation(async (text, targetLang) => {
    return `[Translated to ${targetLang}]: ${text}`;
  }),

  // Comprehension question generation
  generateComprehensionQuestions: jest.fn().mockResolvedValue([
    { question: 'What is the main idea?', answer: 'Mock answer' },
    { question: 'Why did this happen?', answer: 'Mock answer 2' }
  ]),

  // Video script generation
  generateVideoScript: jest.fn().mockResolvedValue({
    script: 'This is a mock video script about the topic.',
    scenes: ['Scene 1', 'Scene 2', 'Scene 3']
  }),

  // Reading assessment
  analyzeReadingTranscript: jest.fn().mockResolvedValue({
    wordsCorrect: 45,
    wordsIncorrect: 5,
    wordsPerMinute: 90,
    accuracy: 0.9,
    fluencyLevel: 'developing'
  }),

  // Name extraction (for registration)
  extractNameFromText: jest.fn().mockResolvedValue({
    firstName: 'Test',
    confidence: 0.95
  }),

  // Reset all mocks
  _resetAllMocks: function () {
    Object.keys(this).forEach(key => {
      if (typeof this[key] === 'function' && typeof this[key].mockReset === 'function') {
        this[key].mockReset();
      }
    });
    // Re-setup defaults
    this.chat.mockResolvedValue({
      response: 'This is a mock AI response.',
      usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 }
    });
    this.detectIntent.mockResolvedValue({
      intent: 'general_query',
      confidence: 0.85,
      entities: {}
    });
  }
};

module.exports = OpenAIService;
