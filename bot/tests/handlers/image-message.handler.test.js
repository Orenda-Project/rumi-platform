/**
 * Test: Image Message Handler
 *
 * TDD Tests for image message handling in WhatsApp bot
 * - Handler function exists
 * - Proper routing
 * - Error handling
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const assert = require('assert');

let imageHandler;

async function runTests() {
  console.log('\n=== Image Message Handler Tests ===\n');
  let passed = 0;
  let failed = 0;

  // Test 1: Image handler module exists
  console.log('Test 1: Image handler module exists');
  try {
    imageHandler = require('../../shared/handlers/image-message.handler');
    assert.ok(imageHandler, 'Image handler module should exist');
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

  // Test 2: handleImageMessage function exists
  console.log('Test 2: handleImageMessage function exists');
  try {
    assert.strictEqual(typeof imageHandler.handleImageMessage, 'function', 'handleImageMessage should be a function');
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 3: Handler is properly exported
  console.log('Test 3: Handler is properly exported');
  try {
    const { handleImageMessage } = require('../../shared/handlers/image-message.handler');
    assert.ok(handleImageMessage, 'handleImageMessage should be destructurable');
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 4: VisionService dependency can be loaded
  console.log('Test 4: VisionService dependency exists');
  try {
    const VisionService = require('../../shared/services/vision.service');
    assert.ok(VisionService, 'VisionService should be loadable');
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 5: R2 uploadImageWithRetry function exists
  console.log('Test 5: R2 uploadImageWithRetry function exists');
  try {
    const r2 = require('../../shared/storage/r2');
    assert.strictEqual(typeof r2.uploadImageWithRetry, 'function', 'uploadImageWithRetry should exist');
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 6: WhatsApp bot has image routing
  console.log('Test 6: WhatsApp bot imports image handler');
  try {
    // Read the file and check for import
    const fs = require('fs');
    const path = require('path');
    const botContent = fs.readFileSync(
      path.resolve(__dirname, '../../whatsapp-bot.js'),
      'utf8'
    );
    assert.ok(
      botContent.includes("require('./shared/handlers/image-message.handler')"),
      'whatsapp-bot.js should import image handler'
    );
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 7: WhatsApp bot has image message type routing
  console.log('Test 7: WhatsApp bot routes image messages');
  try {
    const fs = require('fs');
    const path = require('path');
    const botContent = fs.readFileSync(
      path.resolve(__dirname, '../../whatsapp-bot.js'),
      'utf8'
    );
    assert.ok(
      botContent.includes("messageType === 'image'"),
      'whatsapp-bot.js should check for image message type'
    );
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 8: OpenAI service uses gpt-4.1-mini
  console.log('Test 8: OpenAI service uses gpt-4.1-mini model');
  try {
    const fs = require('fs');
    const path = require('path');
    const openaiContent = fs.readFileSync(
      path.resolve(__dirname, '../../shared/services/openai.service.js'),
      'utf8'
    );
    const usesNewModel = openaiContent.includes("'gpt-4.1-mini'");
    const usesOldModel = openaiContent.includes("'gpt-4-turbo'");

    assert.ok(usesNewModel, 'openai.service.js should use gpt-4.1-mini');
    assert.ok(!usesOldModel, 'openai.service.js should NOT use gpt-4-turbo');
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
