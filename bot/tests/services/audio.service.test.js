/**
 * Test: AudioService ASR Routing
 *
 * TDD Tests for Problem A: Language-aware ASR routing
 * - Soniox: en, ur, ar, es, ta, ta-LK, pa, pa-PK (7 languages)
 * - MMS-ASR: bal-PK, sd-PK, ps-PK (3 regional languages)
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const assert = require('assert');

let AudioService;

async function runTests() {
  console.log('\n=== AudioService ASR Routing Tests ===\n');
  let passed = 0;
  let failed = 0;

  // Test 1: AudioService module exists
  console.log('Test 1: AudioService module exists');
  try {
    AudioService = require('../../shared/services/audio.service');
    assert.ok(AudioService, 'AudioService should exist');
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

  // Test 2: getASREngine returns 'soniox' for English
  console.log('Test 2: getASREngine returns "soniox" for English');
  try {
    const engine = AudioService.getASREngine('en');
    assert.strictEqual(engine, 'soniox', 'English should route to Soniox');
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 3: getASREngine returns 'soniox' for Urdu
  console.log('Test 3: getASREngine returns "soniox" for Urdu');
  try {
    const engine = AudioService.getASREngine('ur');
    assert.strictEqual(engine, 'soniox', 'Urdu should route to Soniox');
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 4: getASREngine returns 'soniox' for Arabic
  console.log('Test 4: getASREngine returns "soniox" for Arabic');
  try {
    const engine = AudioService.getASREngine('ar');
    assert.strictEqual(engine, 'soniox', 'Arabic should route to Soniox');
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 5: getASREngine returns 'soniox' for Spanish
  console.log('Test 5: getASREngine returns "soniox" for Spanish');
  try {
    const engine = AudioService.getASREngine('es');
    assert.strictEqual(engine, 'soniox', 'Spanish should route to Soniox');
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 6: getASREngine returns 'soniox' for Tamil
  console.log('Test 6: getASREngine returns "soniox" for Tamil (ta-LK)');
  try {
    const engine = AudioService.getASREngine('ta-LK');
    assert.strictEqual(engine, 'soniox', 'Tamil should route to Soniox');
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 7: getASREngine returns 'soniox' for Punjabi (pa-PK)
  console.log('Test 7: getASREngine returns "soniox" for Punjabi (pa-PK)');
  try {
    const engine = AudioService.getASREngine('pa-PK');
    assert.strictEqual(engine, 'soniox', 'Punjabi should route to Soniox (not MMS)');
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 8: getASREngine returns 'mms-asr' for Balochi
  console.log('Test 8: getASREngine returns "mms-asr" for Balochi (bal-PK)');
  try {
    const engine = AudioService.getASREngine('bal-PK');
    assert.strictEqual(engine, 'mms-asr', 'Balochi should route to MMS-ASR');
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 9: getASREngine returns 'mms-asr' for Sindhi
  console.log('Test 9: getASREngine returns "mms-asr" for Sindhi (sd-PK)');
  try {
    const engine = AudioService.getASREngine('sd-PK');
    assert.strictEqual(engine, 'mms-asr', 'Sindhi should route to MMS-ASR');
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 10: getASREngine returns 'mms-asr' for Pashto
  console.log('Test 10: getASREngine returns "mms-asr" for Pashto (ps-PK)');
  try {
    const engine = AudioService.getASREngine('ps-PK');
    assert.strictEqual(engine, 'mms-asr', 'Pashto should route to MMS-ASR');
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 11: getMmsLanguageCode returns correct code for Balochi
  console.log('Test 11: getMmsLanguageCode returns "bcc-script_arabic" for Balochi');
  try {
    const mmsCode = AudioService.getMmsLanguageCode('bal-PK');
    assert.strictEqual(mmsCode, 'bcc-script_arabic', 'Balochi MMS code should be bcc-script_arabic');
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 12: getMmsLanguageCode returns correct code for Sindhi
  console.log('Test 12: getMmsLanguageCode returns "snd" for Sindhi');
  try {
    const mmsCode = AudioService.getMmsLanguageCode('sd-PK');
    assert.strictEqual(mmsCode, 'snd', 'Sindhi MMS code should be snd');
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 13: getMmsLanguageCode returns correct code for Pashto
  console.log('Test 13: getMmsLanguageCode returns "pus" for Pashto');
  try {
    const mmsCode = AudioService.getMmsLanguageCode('ps-PK');
    assert.strictEqual(mmsCode, 'pus', 'Pashto MMS code should be pus');
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 14: getMmsLanguageCode returns null for Soniox languages
  console.log('Test 14: getMmsLanguageCode returns null for Soniox languages');
  try {
    const mmsCode = AudioService.getMmsLanguageCode('en');
    assert.strictEqual(mmsCode, null, 'English should have no MMS code (uses Soniox)');
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 15: getMmsLanguageCode returns null for Punjabi (uses Soniox)
  console.log('Test 15: getMmsLanguageCode returns null for Punjabi (uses Soniox)');
  try {
    const mmsCode = AudioService.getMmsLanguageCode('pa-PK');
    assert.strictEqual(mmsCode, null, 'Punjabi should have no MMS code (uses Soniox)');
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 16: getASREngine defaults to 'soniox' for unknown languages
  console.log('Test 16: getASREngine defaults to "soniox" for unknown languages');
  try {
    const engine = AudioService.getASREngine('xx-UNKNOWN');
    assert.strictEqual(engine, 'soniox', 'Unknown languages should default to Soniox');
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
