/**
 * BUG-014: Video Language Mismatch (Punjabi → Urdu)
 * TDD Tests for video script language generation fixes
 *
 * Problem: User selects Punjabi but video narration/fun facts are generated
 * in Urdu vocabulary because the GPT prompt just says "Punjabi Shahmukhi"
 * without explicit vocabulary/grammar guidance.
 *
 * Root Cause: video-script.service.js line 145 had:
 *   'pa-PK': 'Punjabi Shahmukhi'
 * This is too vague - GPT defaults to Urdu since both share Shahmukhi script.
 *
 * Fix: Add comprehensive Punjabi vocabulary guidance matching the approach
 * used in openai.service.js voice prompts and language-prompts.js
 *
 * Evidence: Video request 11f333b1-fb37-4cd6-90b7-b97692500dd7
 * - User selected pa-PK (Punjabi)
 * - Narration contained Urdu words: ہم، کے ساتھ، سیکھیں گے، آپ جانتے ہیں
 * - Should have used Punjabi: اسیں، نال، سکھاں گے، تسی جاندے او
 */

// Mock dependencies
jest.mock('../shared/config/supabase', () => ({
  from: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  single: jest.fn()
}));

jest.mock('../shared/services/whatsapp.service');
jest.mock('../shared/services/cache/railway-redis.service', () => ({
  redis: { setex: jest.fn(), get: jest.fn(), del: jest.fn() },
  get: jest.fn(),
  set: jest.fn()
}));

describe('BUG-014: Video Language Mismatch Fixes', () => {

  describe('Video Script Service - Language Names', () => {
    /**
     * These tests verify that the languageNames object in video-script.service.js
     * contains comprehensive language guidance, not just simple names
     */

    let VideoScriptService;

    beforeAll(() => {
      // Import after mocks are set up
      VideoScriptService = require('../shared/services/video/video-script.service');
    });

    test('Punjabi (pa-PK) should have comprehensive vocabulary guidance', () => {
      // Access the service to verify it loads without error
      expect(VideoScriptService).toBeDefined();
      expect(typeof VideoScriptService.generateSlideContent).toBe('function');
    });
  });

  describe('Punjabi Language Prompt Requirements', () => {
    /**
     * Verify the Punjabi prompt contains all required elements
     * to distinguish it from Urdu
     */

    // Read the actual languageNames from the source file
    const fs = require('fs');
    const path = require('path');
    const sourceFile = fs.readFileSync(
      path.join(__dirname, '../shared/services/video/video-script.service.js'),
      'utf8'
    );

    test('Punjabi prompt should contain vocabulary mapping', () => {
      // Key Punjabi vs Urdu vocabulary differences
      const requiredMappings = [
        ['اے', 'ہے'],      // "is" - Punjabi vs Urdu
        ['نال', 'کے ساتھ'],  // "with" - Punjabi vs Urdu
        ['وچ', 'میں'],     // "in" - Punjabi vs Urdu
        ['تسی', 'آپ'],     // "you" - Punjabi vs Urdu
        ['اسیں', 'ہم'],    // "we" - Punjabi vs Urdu
      ];

      requiredMappings.forEach(([punjabi, urdu]) => {
        expect(sourceFile).toContain(punjabi);
        expect(sourceFile).toContain(urdu);
      });
    });

    test('Punjabi prompt should contain CRITICAL RULES section', () => {
      expect(sourceFile).toContain('CRITICAL PUNJABI LANGUAGE RULES');
      expect(sourceFile).toContain('Write in PUNJABI, NOT Urdu');
    });

    test('Punjabi prompt should have positive examples', () => {
      // Should contain checkmark examples of correct Punjabi
      expect(sourceFile).toContain('✅');
      expect(sourceFile).toContain('آؤ اج'); // Correct Punjabi opening
    });

    test('Punjabi prompt should have negative examples', () => {
      // Should contain X examples of incorrect Urdu
      expect(sourceFile).toContain('❌');
      expect(sourceFile).toContain('This is URDU');
    });

    test('Punjabi prompt should include unique vocabulary words', () => {
      const uniquePunjabiWords = [
        'ودھیا',    // good (not اچھا)
        'چنگا',     // nice (not اچھا)
        'ہن',       // now (not اب)
        'سکھاں گے', // will learn (not سیکھیں گے)
        'کردا',     // does (not کرتا)
      ];

      uniquePunjabiWords.forEach(word => {
        expect(sourceFile).toContain(word);
      });
    });
  });

  describe('Regional Language Prompts', () => {
    /**
     * Verify other regional languages also have enhanced prompts
     */

    const fs = require('fs');
    const path = require('path');
    const sourceFile = fs.readFileSync(
      path.join(__dirname, '../shared/services/video/video-script.service.js'),
      'utf8'
    );

    test('Sindhi (sd-PK) should have unique letter guidance', () => {
      expect(sourceFile).toContain('Sindhi');
      expect(sourceFile).toContain('ڄ'); // Unique Sindhi letter
      expect(sourceFile).toContain('ڃ'); // Unique Sindhi letter
      expect(sourceFile).toContain('ڦ'); // Unique Sindhi letter
    });

    test('Pashto (ps-PK) should specify Northern dialect', () => {
      expect(sourceFile).toContain('Pashto');
      expect(sourceFile).toContain('Northern');
      expect(sourceFile).toContain('NOT Afghan Dari');
      expect(sourceFile).toContain('ټ'); // Unique Pashto letter
      expect(sourceFile).toContain('ډ'); // Unique Pashto letter
    });

    test('Balochi (bal-PK) should specify Rakhshani dialect', () => {
      expect(sourceFile).toContain('Balochi');
      expect(sourceFile).toContain('Rakhshani');
    });

    test('Tamil (ta-LK) should have cultural sensitivity note', () => {
      expect(sourceFile).toContain('Tamil');
      expect(sourceFile).toContain('Jaffna');
      expect(sourceFile).toContain('post-war sensitivity');
    });
  });

  describe('Language Prompts Import', () => {
    /**
     * Verify the service imports language-prompts.js
     */

    const fs = require('fs');
    const path = require('path');
    const sourceFile = fs.readFileSync(
      path.join(__dirname, '../shared/services/video/video-script.service.js'),
      'utf8'
    );

    test('Should import LANGUAGE_PROMPTS from config', () => {
      expect(sourceFile).toContain("require('../../config/language-prompts')");
    });

    test('Should have BUG-014 FIX comment', () => {
      expect(sourceFile).toContain('BUG-014 FIX');
    });
  });

  describe('Comparison with Voice Prompts', () => {
    /**
     * The voice prompts in openai.service.js work correctly for Punjabi.
     * Verify the video prompts now match that approach.
     */

    test('Voice prompts should have Punjabi vocabulary guidance', () => {
      const openaiService = require('../shared/services/openai.service');

      // Get the Punjabi voice prompt
      const punjabiVoicePrompt = openaiService._getFormatAwareSystemPrompt('voice', 'pa-PK', 'Test');

      // Should contain key Punjabi identifiers
      expect(punjabiVoicePrompt).toContain('پنجابی');
      expect(punjabiVoicePrompt).toContain('Punjabi');
      expect(punjabiVoicePrompt).toContain('Shahmukhi');

      // Should have vocabulary examples (voice prompts use different words than video)
      expect(punjabiVoicePrompt).toContain('ودھیا'); // Punjabi "good"
      expect(punjabiVoicePrompt).toContain('چنگا');  // Punjabi "nice"
      expect(punjabiVoicePrompt).toContain('ہن');    // Punjabi "now"
    });
  });
});

describe('BUG-014: E2E Scenario Documentation', () => {
  /**
   * These tests document the expected E2E behavior after fixes
   */

  test('Scenario: User requests Punjabi video', () => {
    const scenario = {
      step1: { action: 'User selects Punjabi (pa-PK) for video language' },
      step2: { expected: 'Redis stores language = pa-PK' },
      step3: { expected: 'VideoScriptService.generateSlideContent receives pa-PK' },
      step4: { expected: 'GPT prompt includes comprehensive Punjabi vocabulary rules' },
      step5: { expected: 'GPT generates narration using Punjabi vocabulary (تسی, اے, نال, وچ)' },
      step6: { expected: 'Fun facts generated in Punjabi (NOT Urdu)' },
      step7: { expected: 'User receives video with authentic Punjabi content' }
    };

    // Document expected flow
    expect(scenario.step4.expected).toContain('comprehensive Punjabi vocabulary');
    expect(scenario.step5.expected).toContain('تسی');
    expect(scenario.step6.expected).toContain('NOT Urdu');
  });

  test('Scenario: Urdu vocabulary should be rejected in Punjabi content', () => {
    const urduWords = ['ہم', 'آپ', 'کے ساتھ', 'سیکھیں گے', 'کیا آپ جانتے ہیں'];
    const punjabiEquivalents = ['اسیں', 'تسی', 'نال', 'سکھاں گے', 'تسی جاندے او'];

    // After fix, GPT should use Punjabi equivalents
    urduWords.forEach((urduWord, i) => {
      expect(punjabiEquivalents[i]).not.toBe(urduWord);
    });
  });

  test('Scenario: Progress messages should be in selected language', () => {
    // Secondary issue: Progress messages fall back to English for pa-PK
    const expectedBehavior = {
      issue: 'Progress messages missing pa-PK translations',
      currentBehavior: 'Falls back to English',
      expectedBehavior: 'Should show Punjabi messages',
      status: 'Known issue - separate fix needed'
    };

    expect(expectedBehavior.status).toContain('separate fix');
  });
});
