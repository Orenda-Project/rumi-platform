/**
 * TDD Tests: Transcript Enhancer Service
 *
 * Phase 2: GPT-4o LLM Post-Processing for Enhanced Transcripts
 *
 * Key functions under test:
 * 1. enhanceTranscript(segments) - main enhancement function
 * 2. buildPromptWithFewShot(segments) - builds prompt with examples
 * 3. parseEnhancementResponse(response) - parses GPT-4o output
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const assert = require('assert');

// Mock segments from Soniox diarization (Phase 1 output)
const MOCK_SEGMENTS_URDU = [
  {
    speaker: '1',
    label: 'Teacher',
    start_ms: 0,
    end_ms: 5000,
    text: 'لوک ایٹ دا بورڈ۔ آج ہم سفکس پڑھیں گے۔'
  },
  {
    speaker: '1',
    label: 'Teacher',
    start_ms: 5000,
    end_ms: 12000,
    text: 'حمزہ بتائیں، سفکس کیا ہے؟'
  },
  {
    speaker: '2',
    label: 'Student',
    start_ms: 12000,
    end_ms: 18000,
    text: 'جی سر، ورڈ کے بعد ایڈ کرتے ہیں۔'
  },
  {
    speaker: '1',
    label: 'Teacher',
    start_ms: 18000,
    end_ms: 22000,
    text: 'بہت اچھا! شاباش!'
  }
];

// Mock segments with multiple students
const MOCK_SEGMENTS_MULTIPLE_STUDENTS = [
  {
    speaker: '1',
    label: 'Teacher',
    start_ms: 0,
    end_ms: 5000,
    text: 'مریم، آپ بتائیں کہ پانی کا فارمولا کیا ہے؟'
  },
  {
    speaker: '2',
    label: 'Student',
    start_ms: 5000,
    end_ms: 8000,
    text: 'جی ماں، H2O'
  },
  {
    speaker: '1',
    label: 'Teacher',
    start_ms: 8000,
    end_ms: 12000,
    text: 'بہت اچھا! اب علی بتائیں، آکسیجن کا سمبل کیا ہے؟'
  },
  {
    speaker: '3',
    label: 'Student 2',
    start_ms: 12000,
    end_ms: 15000,
    text: 'جی سر، O ہے۔'
  }
];

// Mock segments with phonetic English
const MOCK_SEGMENTS_PHONETIC = [
  {
    speaker: '1',
    label: 'Teacher',
    start_ms: 0,
    end_ms: 8000,
    text: 'ٹوڈے کا ٹاپک ہے انگیجمنٹ۔ فوکس کریں بچوں۔'
  }
];

let TranscriptEnhancerService;

async function runTests() {
  console.log('\n=== Transcript Enhancer TDD Tests ===\n');
  let passed = 0;
  let failed = 0;

  // Test 1: TranscriptEnhancerService module exists
  console.log('Test 1: TranscriptEnhancerService module exists');
  try {
    TranscriptEnhancerService = require('../../shared/services/coaching/transcript-enhancer.service');
    assert.ok(TranscriptEnhancerService, 'TranscriptEnhancerService should exist');
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 2: enhanceTranscript method exists
  console.log('Test 2: enhanceTranscript method exists');
  try {
    assert.ok(
      typeof TranscriptEnhancerService.enhanceTranscript === 'function',
      'enhanceTranscript should be a function'
    );
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 3: buildPromptWithFewShot method exists
  console.log('Test 3: buildPromptWithFewShot method exists');
  try {
    assert.ok(
      typeof TranscriptEnhancerService.buildPromptWithFewShot === 'function',
      'buildPromptWithFewShot should be a function'
    );
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 4: parseEnhancementResponse method exists
  console.log('Test 4: parseEnhancementResponse method exists');
  try {
    assert.ok(
      typeof TranscriptEnhancerService.parseEnhancementResponse === 'function',
      'parseEnhancementResponse should be a function'
    );
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 5: buildPromptWithFewShot returns proper structure
  console.log('Test 5: buildPromptWithFewShot returns proper structure');
  try {
    const prompt = TranscriptEnhancerService.buildPromptWithFewShot(MOCK_SEGMENTS_URDU);

    assert.ok(typeof prompt === 'string', 'Prompt should be a string');
    assert.ok(prompt.includes('TASK 1:'), 'Prompt should include speaker attribution task');
    assert.ok(prompt.includes('TASK 2:'), 'Prompt should include phonetic conversion task');
    assert.ok(prompt.includes('TASK 3:'), 'Prompt should include utterance tagging task');
    assert.ok(prompt.includes('speaker_'), 'Prompt should include segment data');

    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 6: parseEnhancementResponse parses valid JSON
  console.log('Test 6: parseEnhancementResponse parses valid JSON');
  try {
    const mockResponse = JSON.stringify({
      segments: [
        {
          start_ms: 0,
          speaker: 'Teacher',
          speaker_type: 'teacher',
          tags: ['instruction'],
          text_raw: 'لوک ایٹ دا بورڈ۔',
          text_mixed: '<en>Look at the board.</en>'
        }
      ],
      named_students: ['حمزہ'],
      metrics: {
        total_segments: 1,
        phonetic_conversions: 1,
        speaker_corrections: 0
      }
    });

    const result = TranscriptEnhancerService.parseEnhancementResponse(mockResponse);

    assert.ok(result.segments, 'Result should have segments');
    assert.ok(result.named_students, 'Result should have named_students');
    assert.ok(result.metrics, 'Result should have metrics');
    assert.strictEqual(result.segments[0].speaker, 'Teacher', 'First speaker should be Teacher');

    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 7: parseEnhancementResponse handles invalid JSON gracefully
  console.log('Test 7: parseEnhancementResponse handles invalid JSON gracefully');
  try {
    const invalidResponse = 'not valid json {{{';
    const result = TranscriptEnhancerService.parseEnhancementResponse(invalidResponse);

    assert.ok(result, 'Should return object even for invalid JSON');
    assert.ok(result.error, 'Should have error field');
    assert.strictEqual(result.segments.length, 0, 'Segments should be empty on error');

    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 8: Empty segments returns empty result
  console.log('Test 8: Empty segments handled gracefully');
  try {
    const prompt = TranscriptEnhancerService.buildPromptWithFewShot([]);

    assert.ok(prompt, 'Should return prompt even for empty segments');
    assert.ok(typeof prompt === 'string', 'Prompt should be a string');

    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 9: Few-shot examples are included in prompt
  console.log('Test 9: Few-shot examples are included in prompt');
  try {
    const prompt = TranscriptEnhancerService.buildPromptWithFewShot(MOCK_SEGMENTS_URDU);

    // Check for few-shot example markers
    assert.ok(prompt.includes('Example'), 'Prompt should include examples');
    assert.ok(prompt.includes('<en>'), 'Prompt should show <en> tag examples');

    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 10: Phonetic dictionary is available
  console.log('Test 10: Phonetic dictionary is available');
  try {
    assert.ok(
      TranscriptEnhancerService.PHONETIC_DICTIONARY,
      'PHONETIC_DICTIONARY should exist'
    );
    assert.ok(
      Object.keys(TranscriptEnhancerService.PHONETIC_DICTIONARY).length >= 50,
      'Dictionary should have at least 50 entries'
    );
    // Check some common entries
    assert.ok(
      TranscriptEnhancerService.PHONETIC_DICTIONARY['سفکس'] ||
        TranscriptEnhancerService.PHONETIC_DICTIONARY['ٹاپک'],
      'Dictionary should have common phonetic entries'
    );

    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 11: enhanceTranscript returns expected structure (integration test - skip if no API key)
  console.log('Test 11: enhanceTranscript returns expected structure (integration)');
  if (!process.env.OPENAI_API_KEY) {
    console.log('  ⏭ SKIPPED: No OPENAI_API_KEY\n');
  } else {
    try {
      const result = await TranscriptEnhancerService.enhanceTranscript(MOCK_SEGMENTS_URDU);

      assert.ok(result, 'Result should not be null');
      assert.ok(result.segments, 'Result should have segments');
      assert.ok(Array.isArray(result.segments), 'Segments should be an array');
      assert.ok(result.named_students !== undefined, 'Result should have named_students');
      assert.ok(result.metrics, 'Result should have metrics');

      // Check segment structure
      if (result.segments.length > 0) {
        const seg = result.segments[0];
        assert.ok(seg.speaker, 'Segment should have speaker');
        assert.ok(seg.speaker_type, 'Segment should have speaker_type');
        assert.ok(seg.tags, 'Segment should have tags');
        assert.ok(seg.text_raw || seg.text_mixed, 'Segment should have text');
      }

      console.log('  ✓ PASSED\n');
      passed++;
    } catch (e) {
      console.log(`  ✗ FAILED: ${e.message}\n`);
      failed++;
    }
  }

  // Test 12: Speaker attribution identifies Teacher correctly
  console.log('Test 12: Speaker attribution identifies Teacher correctly (integration)');
  if (!process.env.OPENAI_API_KEY) {
    console.log('  ⏭ SKIPPED: No OPENAI_API_KEY\n');
  } else {
    try {
      const result = await TranscriptEnhancerService.enhanceTranscript(MOCK_SEGMENTS_URDU);

      // First segment should be Teacher (instructions)
      const teacherSegments = result.segments.filter(s => s.speaker_type === 'teacher');
      assert.ok(teacherSegments.length > 0, 'Should identify at least one teacher segment');

      // Praise segment should be Teacher
      const praiseSegment = result.segments.find(s => s.tags?.includes('praise'));
      if (praiseSegment) {
        assert.strictEqual(praiseSegment.speaker_type, 'teacher', 'Praise should come from teacher');
      }

      console.log('  ✓ PASSED\n');
      passed++;
    } catch (e) {
      console.log(`  ✗ FAILED: ${e.message}\n`);
      failed++;
    }
  }

  // Test 13: Named student identification
  console.log('Test 13: Named student identification (integration)');
  if (!process.env.OPENAI_API_KEY) {
    console.log('  ⏭ SKIPPED: No OPENAI_API_KEY\n');
  } else {
    try {
      const result = await TranscriptEnhancerService.enhanceTranscript(MOCK_SEGMENTS_URDU);

      // Check if حمزہ is identified
      assert.ok(result.named_students, 'Should have named_students array');
      const hasHamza = result.named_students.some(name =>
        name.includes('حمزہ') || name.includes('Hamza')
      );
      assert.ok(hasHamza, 'Should identify حمزہ as named student');

      console.log('  ✓ PASSED\n');
      passed++;
    } catch (e) {
      console.log(`  ✗ FAILED: ${e.message}\n`);
      failed++;
    }
  }

  // Test 14: Phonetic English conversion
  console.log('Test 14: Phonetic English conversion (integration)');
  if (!process.env.OPENAI_API_KEY) {
    console.log('  ⏭ SKIPPED: No OPENAI_API_KEY\n');
  } else {
    try {
      const result = await TranscriptEnhancerService.enhanceTranscript(MOCK_SEGMENTS_PHONETIC);

      // Check if phonetic words are converted
      const hasEnTags = result.segments.some(s =>
        s.text_mixed && s.text_mixed.includes('<en>')
      );
      assert.ok(hasEnTags, 'Should have <en> tags for phonetic English');

      // Check metrics
      assert.ok(result.metrics.phonetic_conversions > 0, 'Should count phonetic conversions');

      console.log('  ✓ PASSED\n');
      passed++;
    } catch (e) {
      console.log(`  ✗ FAILED: ${e.message}\n`);
      failed++;
    }
  }

  // Test 15: Utterance tagging
  console.log('Test 15: Utterance tagging (integration)');
  if (!process.env.OPENAI_API_KEY) {
    console.log('  ⏭ SKIPPED: No OPENAI_API_KEY\n');
  } else {
    try {
      const result = await TranscriptEnhancerService.enhanceTranscript(MOCK_SEGMENTS_URDU);

      // Check for question tag
      const questionSegment = result.segments.find(s => s.tags?.includes('question'));
      assert.ok(questionSegment, 'Should identify question utterance');

      // Check for praise tag
      const praiseSegment = result.segments.find(s => s.tags?.includes('praise'));
      assert.ok(praiseSegment, 'Should identify praise utterance');

      console.log('  ✓ PASSED\n');
      passed++;
    } catch (e) {
      console.log(`  ✗ FAILED: ${e.message}\n`);
      failed++;
    }
  }

  // Test 16: Retry logic with exponential backoff exists
  console.log('Test 16: Retry logic exists');
  try {
    assert.ok(
      typeof TranscriptEnhancerService.enhanceWithRetry === 'function',
      'enhanceWithRetry should be a function'
    );
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test Summary
  console.log('\n=== Test Summary ===');
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total: ${passed + failed}`);

  if (failed > 0) {
    console.log('\n⚠️  Some tests failed! Implement the missing functionality.\n');
    process.exit(1);
  } else {
    console.log('\n✅ All tests passed!\n');
    process.exit(0);
  }
}

// Run tests
runTests().catch(error => {
  console.error('Test runner error:', error);
  process.exit(1);
});
