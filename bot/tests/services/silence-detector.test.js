/**
 * TDD Tests: Silence Detector Service
 *
 * Phase 3: Silence Detection & Board Writing Inference
 *
 * Key functions under test:
 * 1. detectSilences(tokens, minGapMs) - finds gaps between tokens
 * 2. classifySilence(silence) - classifies by duration
 * 3. inferBoardWriting(tokens, silences) - uses keyword context
 * 4. buildSilenceMarkers(tokens) - full pipeline
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const assert = require('assert');

// Mock tokens with various silence patterns
const MOCK_TOKENS_NORMAL = [
  { text: 'بچوں', start_ms: 0, end_ms: 500, speaker: '1' },
  { text: ' آج', start_ms: 500, end_ms: 1000, speaker: '1' },
  { text: ' ہم', start_ms: 1000, end_ms: 1500, speaker: '1' },
  // Normal pause (1.5s) - should NOT be detected
  { text: ' پڑھیں', start_ms: 3000, end_ms: 3500, speaker: '1' },
  { text: ' گے', start_ms: 3500, end_ms: 4000, speaker: '1' },
];

// Tokens with wait time (3-5s pause after question)
const MOCK_TOKENS_WAIT_TIME = [
  { text: 'جواب', start_ms: 0, end_ms: 400, speaker: '1' },
  { text: ' بتائیں', start_ms: 400, end_ms: 800, speaker: '1' },
  { text: '؟', start_ms: 800, end_ms: 1000, speaker: '1' },
  // 4 second wait time after question
  { text: ' جی', start_ms: 5000, end_ms: 5200, speaker: '2' },
  { text: ' سر', start_ms: 5200, end_ms: 5500, speaker: '2' },
];

// Tokens with board writing (5-15s silence with keywords)
const MOCK_TOKENS_BOARD_WRITING = [
  { text: 'یہاں', start_ms: 0, end_ms: 300, speaker: '1' },
  { text: ' بورڈ', start_ms: 300, end_ms: 600, speaker: '1' },
  { text: ' پر', start_ms: 600, end_ms: 800, speaker: '1' },
  { text: ' لکھتے', start_ms: 800, end_ms: 1100, speaker: '1' },
  { text: ' ہیں', start_ms: 1100, end_ms: 1400, speaker: '1' },
  // 8 second gap - board writing
  { text: ' دیکھو', start_ms: 9400, end_ms: 9700, speaker: '1' },
  { text: ' یہ', start_ms: 9700, end_ms: 9900, speaker: '1' },
  { text: ' ہے', start_ms: 9900, end_ms: 10100, speaker: '1' },
];

// Tokens with extended activity (>15s)
const MOCK_TOKENS_EXTENDED = [
  { text: 'اب', start_ms: 0, end_ms: 300, speaker: '1' },
  { text: ' پڑھو', start_ms: 300, end_ms: 600, speaker: '1' },
  // 20 second gap - extended activity (reading time)
  { text: ' ٹھیک', start_ms: 20600, end_ms: 20900, speaker: '1' },
  { text: ' ہے', start_ms: 20900, end_ms: 21100, speaker: '1' },
];

// Tokens with multiple silences
const MOCK_TOKENS_MULTIPLE = [
  { text: 'سوال', start_ms: 0, end_ms: 500, speaker: '1' },
  // 4s wait time
  { text: ' جواب', start_ms: 4500, end_ms: 5000, speaker: '2' },
  { text: ' لکھو', start_ms: 5000, end_ms: 5500, speaker: '1' },
  // 10s board writing
  { text: ' دیکھو', start_ms: 15500, end_ms: 16000, speaker: '1' },
];

let SilenceDetectorService;

async function runTests() {
  console.log('\n=== Silence Detector TDD Tests ===\n');
  let passed = 0;
  let failed = 0;

  // Test 1: SilenceDetectorService module exists
  console.log('Test 1: SilenceDetectorService module exists');
  try {
    SilenceDetectorService = require('../../shared/services/coaching/silence-detector.service');
    assert.ok(SilenceDetectorService, 'SilenceDetectorService should exist');
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 2: detectSilences method exists
  console.log('Test 2: detectSilences method exists');
  try {
    assert.ok(
      typeof SilenceDetectorService.detectSilences === 'function',
      'detectSilences should be a function'
    );
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 3: classifySilence method exists
  console.log('Test 3: classifySilence method exists');
  try {
    assert.ok(
      typeof SilenceDetectorService.classifySilence === 'function',
      'classifySilence should be a function'
    );
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 4: inferBoardWriting method exists
  console.log('Test 4: inferBoardWriting method exists');
  try {
    assert.ok(
      typeof SilenceDetectorService.inferBoardWriting === 'function',
      'inferBoardWriting should be a function'
    );
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 5: detectSilences ignores gaps < 3 seconds
  console.log('Test 5: detectSilences ignores gaps < 3 seconds');
  try {
    const silences = SilenceDetectorService.detectSilences(MOCK_TOKENS_NORMAL, 3000);

    assert.ok(Array.isArray(silences), 'Should return array');
    assert.strictEqual(silences.length, 0, 'Should not detect 1.5s gap');

    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 6: detectSilences finds gaps >= 3 seconds
  console.log('Test 6: detectSilences finds gaps >= 3 seconds');
  try {
    const silences = SilenceDetectorService.detectSilences(MOCK_TOKENS_WAIT_TIME, 3000);

    assert.ok(Array.isArray(silences), 'Should return array');
    assert.strictEqual(silences.length, 1, 'Should detect 4s gap');
    assert.strictEqual(silences[0].start_ms, 1000, 'Start should be end of last token');
    assert.strictEqual(silences[0].end_ms, 5000, 'End should be start of next token');
    assert.strictEqual(silences[0].duration_ms, 4000, 'Duration should be 4000ms');

    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 7: classifySilence returns wait_time for 3-5s
  console.log('Test 7: classifySilence returns wait_time for 3-5s');
  try {
    const classification = SilenceDetectorService.classifySilence({ duration_ms: 4000 });

    assert.strictEqual(classification, 'wait_time', '4s should be wait_time');

    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 8: classifySilence returns potential_board_writing for 5-15s
  console.log('Test 8: classifySilence returns potential_board_writing for 5-15s');
  try {
    const classification = SilenceDetectorService.classifySilence({ duration_ms: 8000 });

    assert.strictEqual(classification, 'potential_board_writing', '8s should be potential_board_writing');

    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 9: classifySilence returns extended_activity for >15s
  console.log('Test 9: classifySilence returns extended_activity for >15s');
  try {
    const classification = SilenceDetectorService.classifySilence({ duration_ms: 20000 });

    assert.strictEqual(classification, 'extended_activity', '20s should be extended_activity');

    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 10: inferBoardWriting returns HIGH confidence with keywords before AND after
  console.log('Test 10: inferBoardWriting returns HIGH confidence with keywords before AND after');
  try {
    const silences = SilenceDetectorService.detectSilences(MOCK_TOKENS_BOARD_WRITING, 3000);
    const inferred = SilenceDetectorService.inferBoardWriting(MOCK_TOKENS_BOARD_WRITING, silences);

    assert.strictEqual(inferred.length, 1, 'Should have 1 silence marker');
    assert.strictEqual(inferred[0].activity, 'board_writing', 'Should be board_writing');
    assert.strictEqual(inferred[0].confidence, 'high', 'Should have high confidence (keywords before AND after)');

    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 11: inferBoardWriting includes context_before and context_after
  console.log('Test 11: inferBoardWriting includes context_before and context_after');
  try {
    const silences = SilenceDetectorService.detectSilences(MOCK_TOKENS_BOARD_WRITING, 3000);
    const inferred = SilenceDetectorService.inferBoardWriting(MOCK_TOKENS_BOARD_WRITING, silences);

    assert.ok(inferred[0].context_before, 'Should have context_before');
    assert.ok(inferred[0].context_after, 'Should have context_after');
    assert.ok(inferred[0].context_before.includes('لکھتے') || inferred[0].context_before.includes('بورڈ'),
      'context_before should include board writing keywords');

    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 12: Wait time silence has appropriate confidence
  console.log('Test 12: Wait time silence classified correctly');
  try {
    const silences = SilenceDetectorService.detectSilences(MOCK_TOKENS_WAIT_TIME, 3000);
    const inferred = SilenceDetectorService.inferBoardWriting(MOCK_TOKENS_WAIT_TIME, silences);

    assert.strictEqual(inferred.length, 1, 'Should have 1 silence marker');
    assert.strictEqual(inferred[0].activity, 'wait_time', 'Should be wait_time (3-5s)');

    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 13: Extended activity classified correctly
  console.log('Test 13: Extended activity classified correctly');
  try {
    const silences = SilenceDetectorService.detectSilences(MOCK_TOKENS_EXTENDED, 3000);
    const inferred = SilenceDetectorService.inferBoardWriting(MOCK_TOKENS_EXTENDED, silences);

    assert.strictEqual(inferred.length, 1, 'Should have 1 silence marker');
    assert.strictEqual(inferred[0].activity, 'extended_activity', 'Should be extended_activity (>15s)');

    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 14: Multiple silences detected and classified
  console.log('Test 14: Multiple silences detected and classified');
  try {
    const silences = SilenceDetectorService.detectSilences(MOCK_TOKENS_MULTIPLE, 3000);
    const inferred = SilenceDetectorService.inferBoardWriting(MOCK_TOKENS_MULTIPLE, silences);

    assert.strictEqual(inferred.length, 2, 'Should have 2 silence markers');
    assert.strictEqual(inferred[0].activity, 'wait_time', 'First should be wait_time');
    assert.strictEqual(inferred[1].activity, 'board_writing', 'Second should be board_writing');

    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 15: buildSilenceMarkers provides full pipeline
  console.log('Test 15: buildSilenceMarkers provides full pipeline');
  try {
    assert.ok(
      typeof SilenceDetectorService.buildSilenceMarkers === 'function',
      'buildSilenceMarkers should be a function'
    );

    const markers = SilenceDetectorService.buildSilenceMarkers(MOCK_TOKENS_BOARD_WRITING);

    assert.ok(Array.isArray(markers), 'Should return array');
    assert.ok(markers.length > 0, 'Should have markers');
    assert.ok(markers[0].start_ms !== undefined, 'Marker should have start_ms');
    assert.ok(markers[0].end_ms !== undefined, 'Marker should have end_ms');
    assert.ok(markers[0].activity, 'Marker should have activity');
    assert.ok(markers[0].confidence, 'Marker should have confidence');

    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 16: Empty tokens returns empty result
  console.log('Test 16: Empty tokens returns empty result');
  try {
    const silences = SilenceDetectorService.detectSilences([], 3000);
    const markers = SilenceDetectorService.buildSilenceMarkers([]);

    assert.strictEqual(silences.length, 0, 'detectSilences should return empty');
    assert.strictEqual(markers.length, 0, 'buildSilenceMarkers should return empty');

    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 17: BOARD_KEYWORDS constant is available
  console.log('Test 17: BOARD_KEYWORDS constant is available');
  try {
    assert.ok(
      SilenceDetectorService.BOARD_KEYWORDS,
      'BOARD_KEYWORDS should exist'
    );
    assert.ok(
      SilenceDetectorService.BOARD_KEYWORDS.before.length > 0,
      'Should have before keywords'
    );
    assert.ok(
      SilenceDetectorService.BOARD_KEYWORDS.after.length > 0,
      'Should have after keywords'
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
