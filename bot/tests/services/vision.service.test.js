/**
 * Test: VisionService Multimodal Image Analysis
 *
 * TDD Tests for GPT-4.1-mini image analysis capability
 * - analyzeImage function
 * - analyzeWithRetry function
 * - Token estimation
 * - Error handling
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const assert = require('assert');

let VisionService;

async function runTests() {
  console.log('\n=== VisionService Tests ===\n');
  let passed = 0;
  let failed = 0;

  // Test 1: VisionService module exists
  console.log('Test 1: VisionService module exists');
  try {
    VisionService = require('../../shared/services/vision.service');
    assert.ok(VisionService, 'VisionService should exist');
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
    console.log('\n=== Test Summary ===');
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);
    process.exit(failed > 0 ? 1 : 0);
  }

  // Test 2: analyzeImage function exists
  console.log('Test 2: analyzeImage function exists');
  try {
    assert.strictEqual(typeof VisionService.analyzeImage, 'function', 'analyzeImage should be a function');
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 3: analyzeWithRetry function exists
  console.log('Test 3: analyzeWithRetry function exists');
  try {
    assert.strictEqual(typeof VisionService.analyzeWithRetry, 'function', 'analyzeWithRetry should be a function');
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 4: estimateImageTokens function exists
  console.log('Test 4: estimateImageTokens function exists');
  try {
    assert.strictEqual(typeof VisionService.estimateImageTokens, 'function', 'estimateImageTokens should be a function');
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 5: SUPPORTED_MIME_TYPES is exported
  console.log('Test 5: SUPPORTED_MIME_TYPES is exported');
  try {
    assert.ok(VisionService.SUPPORTED_MIME_TYPES, 'SUPPORTED_MIME_TYPES should be exported');
    assert.ok(Array.isArray(VisionService.SUPPORTED_MIME_TYPES), 'SUPPORTED_MIME_TYPES should be an array');
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 6: SUPPORTED_MIME_TYPES includes jpeg
  console.log('Test 6: SUPPORTED_MIME_TYPES includes image/jpeg');
  try {
    assert.ok(VisionService.SUPPORTED_MIME_TYPES.includes('image/jpeg'), 'Should support JPEG');
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 7: SUPPORTED_MIME_TYPES includes png
  console.log('Test 7: SUPPORTED_MIME_TYPES includes image/png');
  try {
    assert.ok(VisionService.SUPPORTED_MIME_TYPES.includes('image/png'), 'Should support PNG');
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 8: SUPPORTED_MIME_TYPES includes gif
  console.log('Test 8: SUPPORTED_MIME_TYPES includes image/gif');
  try {
    assert.ok(VisionService.SUPPORTED_MIME_TYPES.includes('image/gif'), 'Should support GIF');
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 9: SUPPORTED_MIME_TYPES includes webp
  console.log('Test 9: SUPPORTED_MIME_TYPES includes image/webp');
  try {
    assert.ok(VisionService.SUPPORTED_MIME_TYPES.includes('image/webp'), 'Should support WebP');
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 10: CONFIG is exported
  console.log('Test 10: CONFIG is exported');
  try {
    assert.ok(VisionService.CONFIG, 'CONFIG should be exported');
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 11: CONFIG has analysisModel
  console.log('Test 11: CONFIG has analysisModel');
  try {
    assert.ok(VisionService.CONFIG.analysisModel, 'CONFIG should have analysisModel');
    console.log(`  Model: ${VisionService.CONFIG.analysisModel}`);
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 12: estimateImageTokens returns reasonable value for low detail
  console.log('Test 12: estimateImageTokens returns 85 for low detail (512x512)');
  try {
    const tokens = VisionService.estimateImageTokens(512, 512, 'low');
    assert.strictEqual(tokens, 85, 'Low detail should return 85 tokens');
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 13: estimateImageTokens handles high detail correctly
  console.log('Test 13: estimateImageTokens handles high detail (returns > 85 for large images)');
  try {
    const tokens = VisionService.estimateImageTokens(2048, 2048, 'high');
    assert.ok(tokens > 85, `High detail large image should have > 85 tokens, got ${tokens}`);
    console.log(`  Tokens for 2048x2048 high detail: ${tokens}`);
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 14: analyzeImage rejects invalid image URL
  console.log('Test 14: analyzeImage returns error for invalid image URL');
  try {
    const result = await VisionService.analyzeImage('invalid-url', 'Test prompt');
    assert.strictEqual(result.success, false, 'Should return failure for invalid URL');
    assert.ok(result.error, 'Should include error message');
    console.log(`  Error: ${result.error}`);
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 15: analyzeImage rejects empty prompt
  console.log('Test 15: analyzeImage returns error for empty prompt');
  try {
    const result = await VisionService.analyzeImage('https://example.com/image.jpg', '');
    assert.strictEqual(result.success, false, 'Should return failure for empty prompt');
    assert.ok(result.error, 'Should include error message');
    console.log(`  Error: ${result.error}`);
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
    console.log('\n⚠️  Some tests failed!\n');
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
