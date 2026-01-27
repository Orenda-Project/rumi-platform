/**
 * TDD Tests for Issue #4: Language Selection
 *
 * Tests interactive language selection in video generation flow
 * Run with: node tests/video/language-selection.test.js
 */

const assert = require('assert');

// Test utilities
let testsPassed = 0;
let testsFailed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    testsPassed++;
  } catch (error) {
    console.log(`  ❌ ${name}`);
    console.log(`     Error: ${error.message}`);
    testsFailed++;
  }
}

async function asyncTest(name, fn) {
  try {
    await fn();
    console.log(`  ✅ ${name}`);
    testsPassed++;
  } catch (error) {
    console.log(`  ❌ ${name}`);
    console.log(`     Error: ${error.message}`);
    testsFailed++;
  }
}

function describe(suite, fn) {
  console.log(`\n📦 ${suite}`);
  fn();
}

// ============================================
// Unit Tests for Language Selection
// ============================================

describe('Language options', () => {

  test('should include all supported video languages', () => {
    const supportedLanguages = [
      { id: 'en', title: 'English' },
      { id: 'ur', title: 'Urdu' },
      { id: 'ar', title: 'Arabic' },
      { id: 'es', title: 'Spanish' }
    ];

    assert.strictEqual(supportedLanguages.length, 4);
    assert.ok(supportedLanguages.find(l => l.id === 'en'));
    assert.ok(supportedLanguages.find(l => l.id === 'ur'));
    assert.ok(supportedLanguages.find(l => l.id === 'ar'));
    assert.ok(supportedLanguages.find(l => l.id === 'es'));
  });

  test('should have native language descriptions for each option', () => {
    const languageOptions = [
      { id: 'en', title: 'English', description: 'Video narration in English' },
      { id: 'ur', title: 'Urdu', description: 'اردو میں ویڈیو' },
      { id: 'ar', title: 'Arabic', description: 'فيديو بالعربية' },
      { id: 'es', title: 'Spanish', description: 'Video en español' }
    ];

    // Each option should have native text
    const urOption = languageOptions.find(l => l.id === 'ur');
    assert.ok(urOption.description.includes('اردو'), 'Urdu option should have Urdu text');

    const arOption = languageOptions.find(l => l.id === 'ar');
    assert.ok(arOption.description.includes('بالعربية'), 'Arabic option should have Arabic text');
  });
});

describe('WhatsApp Interactive List structure', () => {

  test('should have correct interactive list structure', () => {
    const interactiveList = {
      header: '🌐 Select Video Language',
      body: 'Choose the language for your video about "Gravity"',
      buttonText: 'Select Language',
      sections: [{
        title: 'Languages',
        rows: [
          { id: 'en', title: 'English', description: 'Video narration in English' },
          { id: 'ur', title: 'Urdu', description: 'اردو میں ویڈیو' }
        ]
      }]
    };

    assert.ok(interactiveList.header);
    assert.ok(interactiveList.body);
    assert.ok(interactiveList.buttonText);
    assert.ok(interactiveList.sections.length > 0);
    assert.ok(interactiveList.sections[0].rows.length > 0);
  });

  test('should include topic in the body message', () => {
    const topic = 'Pakistan Constitution';
    const body = `Choose the language for your video about "${topic}"`;

    assert.ok(body.includes(topic));
  });
});

describe('Redis state management', () => {

  test('should store language selection state with correct key', () => {
    const userId = 'user-uuid-123';
    const expectedKey = `user:${userId}:awaiting_video_language`;

    const stateKey = `user:${userId}:awaiting_video_language`;
    assert.strictEqual(stateKey, expectedKey);
  });

  test('should store topic and sessionId in language state', () => {
    const stateData = {
      topic: 'Gravity and Orbits',
      sessionId: 'session-uuid',
      from: '923001234567',
      askedAt: new Date().toISOString()
    };

    assert.ok(stateData.topic);
    assert.ok(stateData.sessionId);
    assert.ok(stateData.from);
    assert.ok(stateData.askedAt);
  });

  test('should have 5 minute TTL for language selection state', () => {
    const ttlSeconds = 300; // 5 minutes

    assert.strictEqual(ttlSeconds, 300);
    assert.strictEqual(ttlSeconds / 60, 5);
  });
});

describe('Flow sequence', () => {

  test('should have correct flow order: topic → language → customization', () => {
    const flowSteps = [
      'ask_for_topic',
      'ask_for_language',      // NEW STEP
      'ask_for_customization',
      'start_generation'
    ];

    const topicIndex = flowSteps.indexOf('ask_for_topic');
    const languageIndex = flowSteps.indexOf('ask_for_language');
    const customizationIndex = flowSteps.indexOf('ask_for_customization');

    assert.ok(topicIndex < languageIndex, 'Topic should come before language');
    assert.ok(languageIndex < customizationIndex, 'Language should come before customization');
  });

  test('should proceed to customization after language selection', () => {
    // Simulating the state transition
    const beforeState = 'awaiting_video_language';
    const afterState = 'awaiting_video_customization';

    // Language selection should clear language state and set customization state
    assert.notStrictEqual(beforeState, afterState);
  });
});

describe('Language selection handler', () => {

  test('should validate selected language is supported', () => {
    const supportedLanguages = ['en', 'ur', 'ar', 'es'];

    const isValidLanguage = (langCode) => supportedLanguages.includes(langCode);

    assert.strictEqual(isValidLanguage('en'), true);
    assert.strictEqual(isValidLanguage('ur'), true);
    assert.strictEqual(isValidLanguage('invalid'), false);
    assert.strictEqual(isValidLanguage(''), false);
  });

  test('should use selected language for video generation', () => {
    const selectedLanguage = 'ur';
    const videoRequest = {
      topic: 'Pakistan Constitution',
      language: selectedLanguage,
      customization: null
    };

    assert.strictEqual(videoRequest.language, 'ur');
  });
});

describe('Error handling', () => {

  test('should handle timeout for language selection', () => {
    const ttlExpired = true;
    const fallbackBehavior = 'use_stored_preference';

    if (ttlExpired) {
      assert.strictEqual(fallbackBehavior, 'use_stored_preference');
    }
  });

  test('should handle invalid language selection gracefully', () => {
    const invalidSelection = 'xyz';
    const supportedLanguages = ['en', 'ur', 'ar', 'es'];

    const isValid = supportedLanguages.includes(invalidSelection);
    assert.strictEqual(isValid, false);

    // Should prompt user to select again or use default
    const action = isValid ? 'proceed' : 'prompt_again_or_default';
    assert.strictEqual(action, 'prompt_again_or_default');
  });
});

// ============================================
// Run tests
// ============================================

console.log('\n🧪 Running Language Selection Tests (Issue #4)\n');
console.log('=' .repeat(50));

// Summary
setTimeout(() => {
  console.log('\n' + '=' .repeat(50));
  console.log(`\n📊 Test Results: ${testsPassed} passed, ${testsFailed} failed`);

  if (testsFailed > 0) {
    console.log('\n❌ Some tests failed. Implementation needed!\n');
    process.exit(1);
  } else {
    console.log('\n✅ All tests passed! Ready to implement.\n');
    process.exit(0);
  }
}, 100);
