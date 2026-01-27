/**
 * TDD Tests: Token Extraction for Enhanced Transcript Viewer
 *
 * Phase 1: Test that transcribeWithDiarization returns real tokens and diarization
 *
 * Key functions under test:
 * 1. _buildDiarizationFromTokens(tokens) - builds diarization from Soniox tokens
 * 2. transcribeWithDiarization(audioPath) - now returns {transcript, tokens, diarization}
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const assert = require('assert');

// Mock token data from Soniox (based on dry-run-01 results)
const MOCK_TOKENS = [
  { index: 0, text: 'بی', start_ms: 2760, end_ms: 2820, speaker: '1', language: 'ur' },
  { index: 1, text: 'ٹ', start_ms: 2880, end_ms: 2940, speaker: '1', language: 'ur' },
  { index: 2, text: 'ا،', start_ms: 2940, end_ms: 3000, speaker: '1', language: 'ur' },
  { index: 3, text: ' کے', start_ms: 3060, end_ms: 3120, speaker: '1', language: 'ur' },
  { index: 4, text: ' میں', start_ms: 3240, end_ms: 3300, speaker: '1', language: 'ur' },
  { index: 5, text: ' ہم', start_ms: 3360, end_ms: 3420, speaker: '1', language: 'ur' },
  // Gap here - student speaks
  { index: 6, text: ' جی', start_ms: 5000, end_ms: 5100, speaker: '2', language: 'ur' },
  { index: 7, text: ' سر', start_ms: 5100, end_ms: 5200, speaker: '2', language: 'ur' },
  // Teacher continues
  { index: 8, text: ' بہت', start_ms: 6000, end_ms: 6100, speaker: '1', language: 'ur' },
  { index: 9, text: ' اچھا', start_ms: 6100, end_ms: 6200, speaker: '1', language: 'ur' },
];

// Extended token set with 3 speakers
const MOCK_TOKENS_3_SPEAKERS = [
  { index: 0, text: 'بچوں', start_ms: 1000, end_ms: 1100, speaker: '1', language: 'ur' },
  { index: 1, text: ' آج', start_ms: 1100, end_ms: 1200, speaker: '1', language: 'ur' },
  { index: 2, text: ' ہم', start_ms: 1200, end_ms: 1300, speaker: '1', language: 'ur' },
  // Student 1
  { index: 3, text: ' جی', start_ms: 2000, end_ms: 2100, speaker: '2', language: 'ur' },
  { index: 4, text: ' ماں', start_ms: 2100, end_ms: 2200, speaker: '2', language: 'ur' },
  // Student 2 (different speaker)
  { index: 5, text: ' جی', start_ms: 3000, end_ms: 3100, speaker: '3', language: 'ur' },
  { index: 6, text: ' سر', start_ms: 3100, end_ms: 3200, speaker: '3', language: 'ur' },
  // Teacher continues
  { index: 7, text: ' شاباش', start_ms: 4000, end_ms: 4200, speaker: '1', language: 'ur' },
];

// Tokens with a significant silence gap (for silence detection test)
const MOCK_TOKENS_WITH_SILENCE = [
  { index: 0, text: 'بورڈ', start_ms: 1000, end_ms: 1200, speaker: '1', language: 'ur' },
  { index: 1, text: ' دیکھو', start_ms: 1200, end_ms: 1400, speaker: '1', language: 'ur' },
  // 8-second silence (board writing)
  { index: 2, text: ' یہ', start_ms: 9400, end_ms: 9500, speaker: '1', language: 'ur' },
  { index: 3, text: ' ہے', start_ms: 9500, end_ms: 9600, speaker: '1', language: 'ur' },
];

let TranscriptionProcessorService;

async function runTests() {
  console.log('\n=== Token Extraction TDD Tests ===\n');
  let passed = 0;
  let failed = 0;

  // Test 1: TranscriptionProcessorService module exists
  console.log('Test 1: TranscriptionProcessorService module exists');
  try {
    TranscriptionProcessorService = require('../../shared/services/coaching/transcription-processor.service');
    assert.ok(TranscriptionProcessorService, 'TranscriptionProcessorService should exist');
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 2: _buildDiarizationFromTokens method exists
  console.log('Test 2: _buildDiarizationFromTokens method exists');
  try {
    assert.ok(
      typeof TranscriptionProcessorService._buildDiarizationFromTokens === 'function',
      '_buildDiarizationFromTokens should be a function'
    );
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 3: _buildDiarizationFromTokens returns proper structure
  console.log('Test 3: _buildDiarizationFromTokens returns proper structure');
  try {
    const result = TranscriptionProcessorService._buildDiarizationFromTokens(MOCK_TOKENS);

    assert.ok(result, 'Result should not be null');
    assert.ok(result.segments, 'Result should have segments array');
    assert.ok(result.speakers, 'Result should have speakers array');
    assert.ok(typeof result.confidence === 'number', 'Result should have confidence number');
    assert.ok(typeof result.totalSegments === 'number', 'Result should have totalSegments');

    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 4: Speaker with most tokens labeled as Teacher
  console.log('Test 4: Speaker with most tokens labeled as Teacher');
  try {
    const result = TranscriptionProcessorService._buildDiarizationFromTokens(MOCK_TOKENS);

    // Speaker 1 has 8 tokens, speaker 2 has 2 tokens
    // Speaker 1 should be labeled as Teacher
    const teacherSpeaker = result.speakers.find(s => s.label === 'Teacher');
    assert.ok(teacherSpeaker, 'Should have a Teacher label');
    assert.strictEqual(teacherSpeaker.id, '1', 'Speaker 1 should be Teacher (most tokens)');

    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 5: Other speakers labeled as Student
  console.log('Test 5: Other speakers labeled as Student');
  try {
    const result = TranscriptionProcessorService._buildDiarizationFromTokens(MOCK_TOKENS);

    const studentSpeaker = result.speakers.find(s => s.label === 'Student');
    assert.ok(studentSpeaker, 'Should have a Student label');
    assert.strictEqual(studentSpeaker.id, '2', 'Speaker 2 should be Student');

    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 6: Multiple students labeled correctly
  console.log('Test 6: Multiple students labeled as Student 1, Student 2, etc.');
  try {
    const result = TranscriptionProcessorService._buildDiarizationFromTokens(MOCK_TOKENS_3_SPEAKERS);

    // Speaker 1 has 4 tokens (Teacher)
    // Speaker 2 has 2 tokens (Student)
    // Speaker 3 has 2 tokens (Student 2)
    const teacherSpeaker = result.speakers.find(s => s.label === 'Teacher');
    const student1 = result.speakers.find(s => s.label === 'Student');
    const student2 = result.speakers.find(s => s.label === 'Student 2');

    assert.ok(teacherSpeaker, 'Should have Teacher');
    assert.ok(student1, 'Should have Student');
    assert.ok(student2, 'Should have Student 2');

    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 7: Segments group consecutive tokens from same speaker
  console.log('Test 7: Segments group consecutive tokens from same speaker');
  try {
    const result = TranscriptionProcessorService._buildDiarizationFromTokens(MOCK_TOKENS);

    // Should have 3 segments: Teacher → Student → Teacher
    assert.strictEqual(result.totalSegments, 3, 'Should have 3 segments');
    assert.strictEqual(result.segments[0].label, 'Teacher', 'First segment should be Teacher');
    assert.strictEqual(result.segments[1].label, 'Student', 'Second segment should be Student');
    assert.strictEqual(result.segments[2].label, 'Teacher', 'Third segment should be Teacher');

    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 8: Segments have proper timestamps
  console.log('Test 8: Segments have start_ms and end_ms timestamps');
  try {
    const result = TranscriptionProcessorService._buildDiarizationFromTokens(MOCK_TOKENS);

    const firstSegment = result.segments[0];
    assert.ok(typeof firstSegment.start_ms === 'number', 'Segment should have start_ms');
    assert.ok(typeof firstSegment.end_ms === 'number', 'Segment should have end_ms');
    assert.strictEqual(firstSegment.start_ms, 2760, 'First segment start_ms should match first token');
    assert.strictEqual(firstSegment.end_ms, 3420, 'First segment end_ms should match last token of that speaker');

    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 9: Segments have combined text from tokens
  console.log('Test 9: Segments have combined text from tokens');
  try {
    const result = TranscriptionProcessorService._buildDiarizationFromTokens(MOCK_TOKENS);

    const firstSegment = result.segments[0];
    assert.ok(firstSegment.text, 'Segment should have text');
    assert.ok(firstSegment.text.includes('بیٹا'), 'Text should contain combined subword tokens');

    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 10: detectSilences finds gaps > 3 seconds
  console.log('Test 10: detectSilences identifies gaps > 3 seconds');
  try {
    assert.ok(
      typeof TranscriptionProcessorService.detectSilences === 'function',
      'detectSilences should be a function'
    );

    const silences = TranscriptionProcessorService.detectSilences(MOCK_TOKENS_WITH_SILENCE);

    assert.ok(Array.isArray(silences), 'Should return array');
    assert.strictEqual(silences.length, 1, 'Should detect 1 silence (8 second gap)');
    assert.strictEqual(silences[0].duration_ms, 8000, 'Silence duration should be 8000ms');
    assert.strictEqual(silences[0].start_ms, 1400, 'Silence should start at 1400ms');
    assert.strictEqual(silences[0].end_ms, 9400, 'Silence should end at 9400ms');

    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 11: detectSilences ignores gaps < 3 seconds
  console.log('Test 11: detectSilences ignores gaps < 3 seconds');
  try {
    // MOCK_TOKENS has small gaps between speaker changes, but none > 3s
    const silences = TranscriptionProcessorService.detectSilences(MOCK_TOKENS);

    assert.ok(Array.isArray(silences), 'Should return array');
    assert.strictEqual(silences.length, 0, 'Should not detect silences in normal token flow');

    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 12: Empty tokens returns empty result
  console.log('Test 12: Empty tokens returns empty result');
  try {
    const result = TranscriptionProcessorService._buildDiarizationFromTokens([]);

    assert.ok(result, 'Should return object even for empty tokens');
    assert.strictEqual(result.segments.length, 0, 'Segments should be empty');
    assert.strictEqual(result.speakers.length, 0, 'Speakers should be empty');
    assert.strictEqual(result.totalSegments, 0, 'Total segments should be 0');

    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 13: Null tokens handled gracefully
  console.log('Test 13: Null/undefined tokens handled gracefully');
  try {
    const result = TranscriptionProcessorService._buildDiarizationFromTokens(null);

    assert.ok(result, 'Should return object even for null tokens');
    assert.strictEqual(result.segments.length, 0, 'Segments should be empty');

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
