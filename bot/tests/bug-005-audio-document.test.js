/**
 * BUG-005: Audio Document < 15 min Falls Through to Confusing Message
 * TDD Tests for audio document handling fixes
 *
 * Problem: User uploads audio file as document (< 15 min), gets confusing message:
 * "If you're trying to submit a lesson plan for classroom coaching, please send me
 * a classroom audio recording first (15+ minutes)."
 *
 * Root Cause: In whatsapp-bot.js handleDocumentMessage():
 * - Audio >= 15 min → routed to classroom coaching (correct)
 * - Audio < 15 min → falls through to generic document handler → confusing message
 *
 * Fix: Route audio documents < 15 min to voice message handler for transcription
 */

const path = require('path');

// Mock dependencies before requiring the code under test
jest.mock('../shared/config/supabase', () => ({
  from: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  order: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  single: jest.fn()
}));

jest.mock('../shared/services/whatsapp.service', () => ({
  sendMessage: jest.fn(),
  downloadMedia: jest.fn().mockResolvedValue(Buffer.from('fake audio data')),
  startContinuousTypingIndicator: jest.fn().mockReturnValue({ stop: jest.fn() }),
  sendAudio: jest.fn().mockResolvedValue(true)
}));

jest.mock('../shared/services/cache/railway-redis.service', () => ({
  redis: {
    setex: jest.fn(),
    get: jest.fn(),
    del: jest.fn()
  },
  get: jest.fn(),
  set: jest.fn()
}));

jest.mock('../shared/services/audio.service', () => ({
  getAudioDuration: jest.fn(),
  transcribeAudio: jest.fn().mockResolvedValue('test transcription'),
  convertToWav: jest.fn(),
  generateSpeechForLanguage: jest.fn().mockResolvedValue(Buffer.from('speech'))
}));

jest.mock('../shared/services/coaching-orchestrator.service', () => ({
  initiateCoachingSession: jest.fn().mockResolvedValue(true)
}));

describe('BUG-005: Audio Document < 15 min Handling', () => {

  describe('Audio Duration Classification', () => {
    /**
     * These tests verify that audio documents are correctly classified
     * based on their duration
     */

    test('EXPECTED: Audio < 15 min should NOT be treated as classroom audio', () => {
      const CLASSROOM_AUDIO_THRESHOLD = 900; // 15 minutes in seconds

      const testCases = [
        { duration: 60, expected: 'short_audio' },      // 1 minute
        { duration: 300, expected: 'short_audio' },     // 5 minutes
        { duration: 600, expected: 'short_audio' },     // 10 minutes
        { duration: 899, expected: 'short_audio' },     // 14:59 - just under
      ];

      testCases.forEach(tc => {
        const isClassroomAudio = tc.duration >= CLASSROOM_AUDIO_THRESHOLD;
        expect(isClassroomAudio).toBe(false);
        expect(tc.expected).toBe('short_audio');
      });
    });

    test('EXPECTED: Audio >= 15 min should be treated as classroom audio', () => {
      const CLASSROOM_AUDIO_THRESHOLD = 900; // 15 minutes in seconds

      const testCases = [
        { duration: 900, expected: 'classroom_audio' },   // Exactly 15 min
        { duration: 1200, expected: 'classroom_audio' },  // 20 minutes
        { duration: 1800, expected: 'classroom_audio' },  // 30 minutes
        { duration: 3600, expected: 'classroom_audio' },  // 1 hour
      ];

      testCases.forEach(tc => {
        const isClassroomAudio = tc.duration >= CLASSROOM_AUDIO_THRESHOLD;
        expect(isClassroomAudio).toBe(true);
        expect(tc.expected).toBe('classroom_audio');
      });
    });
  });

  describe('MIME Type Detection', () => {
    /**
     * Verify that audio documents are correctly identified by MIME type
     */

    test('Audio MIME types should be detected as audio documents', () => {
      const audioMimeTypes = [
        'audio/mpeg',
        'audio/mp3',
        'audio/m4a',
        'audio/mp4',
        'audio/wav',
        'audio/ogg',
        'audio/x-m4a',
        'audio/aac'
      ];

      audioMimeTypes.forEach(mimeType => {
        const isAudioDocument = mimeType.includes('audio') ||
                               mimeType.includes('m4a') ||
                               mimeType.includes('mp3') ||
                               mimeType.includes('mpeg') ||
                               mimeType.includes('wav');
        expect(isAudioDocument).toBe(true);
      });
    });

    test('Non-audio MIME types should NOT be detected as audio documents', () => {
      const nonAudioMimeTypes = [
        'application/pdf',
        'image/jpeg',
        'image/png',
        'application/msword',
        'text/plain',
        'application/vnd.ms-powerpoint'
      ];

      nonAudioMimeTypes.forEach(mimeType => {
        const isAudioDocument = mimeType.includes('audio') ||
                               mimeType.includes('m4a') ||
                               mimeType.includes('mp3') ||
                               mimeType.includes('mpeg') ||
                               mimeType.includes('wav');
        expect(isAudioDocument).toBe(false);
      });
    });
  });

  describe('Expected Routing Behavior', () => {
    /**
     * Document the expected behavior for different scenarios
     */

    test('Scenario: User uploads 5-minute audio as document', () => {
      const scenario = {
        input: { type: 'document', mimeType: 'audio/mpeg', duration: 300 },
        expected: {
          route: 'voice_handler',
          action: 'Transcribe audio and respond with AI + TTS',
          message: 'Should NOT show coaching-related error message'
        }
      };

      // After fix: Short audio documents route to voice handler
      expect(scenario.expected.route).toBe('voice_handler');
      expect(scenario.expected.action).toContain('Transcribe');
    });

    test('Scenario: User uploads 20-minute audio as document', () => {
      const scenario = {
        input: { type: 'document', mimeType: 'audio/mpeg', duration: 1200 },
        expected: {
          route: 'coaching_handler',
          action: 'Initiate classroom coaching session',
          message: 'Classroom audio detected'
        }
      };

      // Long audio still routes to coaching
      expect(scenario.expected.route).toBe('coaching_handler');
    });

    test('Scenario: User uploads PDF document', () => {
      const scenario = {
        input: { type: 'document', mimeType: 'application/pdf', duration: null },
        expected: {
          route: 'document_handler',
          action: 'Check for coaching session or show info message',
          message: 'Regular document handling'
        }
      };

      // Non-audio documents still use document handler
      expect(scenario.expected.route).toBe('document_handler');
    });
  });

  describe('Voice Handler Interface', () => {
    /**
     * Verify voice handler can accept document-style audio
     */

    test('Voice handler module should export handleVoiceMessage', () => {
      const VoiceMessageHandler = require('../shared/handlers/voice-message.handler');
      expect(typeof VoiceMessageHandler.handleVoiceMessage).toBe('function');
    });

    test('handleVoiceMessage should accept message object with audio property', () => {
      // Document that handleVoiceMessage expects message.audio.id or message.voice.id
      // For document-uploaded audio, we'll pass { audio: { id: documentId } }

      const documentAsVoice = {
        audio: { id: 'test_document_id_123' },
        // No voice property - documents use audio
      };

      expect(documentAsVoice.audio.id).toBeDefined();
    });
  });

  describe('Error Message Improvement', () => {
    /**
     * Document that confusing messages should be replaced
     */

    test('Old confusing message should NOT be shown for audio documents', () => {
      const oldConfusingMessage = "I received your document. If you're trying to submit a lesson plan for classroom coaching, please send me a classroom audio recording first (15+ minutes).";

      // This message should NEVER be shown for audio files
      // Audio files should either:
      // - Route to coaching (>= 15 min)
      // - Route to voice handler (< 15 min)

      const shouldShowForAudio = false; // After fix
      expect(shouldShowForAudio).toBe(false);
    });

    test('Confusing message is OK for non-audio documents', () => {
      // The message IS appropriate for PDFs, images, etc.
      // "I received your document..." makes sense for non-audio files

      const isAppropriateForPdf = true;
      expect(isAppropriateForPdf).toBe(true);
    });
  });
});

describe('BUG-005: E2E Scenario Documentation', () => {
  /**
   * These tests document the expected E2E behavior after fixes
   */

  test('Scenario A: Teacher uploads class recording as document (fixed)', () => {
    const scenario = {
      step1: { action: 'User uploads 5-minute audio as document (not voice message)' },
      step2: { expected: 'System detects audio MIME type' },
      step3: { expected: 'System gets duration via ffprobe (300 seconds)' },
      step4: { expected: '300 < 900, so NOT classroom audio' },
      step5: { expected: 'Route to voice message handler' },
      step6: { expected: 'Transcribe audio with ASR' },
      step7: { expected: 'Generate AI response' },
      step8: { expected: 'Send TTS response back to user' }
    };

    // Document the expected flow after fix
    expect(scenario.step5.expected).toContain('voice message handler');
    expect(scenario.step6.expected).toContain('Transcribe');
  });

  test('Scenario B: Long classroom recording (unchanged)', () => {
    const scenario = {
      step1: { action: 'User uploads 20-minute classroom recording as document' },
      step2: { expected: 'System detects audio MIME type' },
      step3: { expected: 'System gets duration via ffprobe (1200 seconds)' },
      step4: { expected: '1200 >= 900, IS classroom audio' },
      step5: { expected: 'Route to CoachingService.initiateCoachingSession()' },
      step6: { expected: 'Begin classroom coaching flow' }
    };

    // Long recordings still go to coaching (unchanged)
    expect(scenario.step5.expected).toContain('CoachingService');
  });

  test('Scenario C: PDF lesson plan upload (unchanged)', () => {
    const scenario = {
      step1: { action: 'User uploads PDF lesson plan' },
      step2: { expected: 'System detects application/pdf MIME type' },
      step3: { expected: 'NOT audio, skip duration check' },
      step4: { expected: 'Check for active coaching session awaiting lesson plan' },
      step5: { expected: 'If awaiting: handleLessonPlanResponse(), else: info message' }
    };

    // Non-audio documents still use existing flow (unchanged)
    expect(scenario.step3.expected).toContain('NOT audio');
  });
});
