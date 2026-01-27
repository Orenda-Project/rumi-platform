/**
 * TDD Tests: Portal SQS Service
 *
 * Tests for the Portal-specific SQS queue service that handles:
 * - Transcript processing jobs (GPT-4o-mini transcript refinement)
 * - AMA processing jobs (Ask Me Anything SQL generation)
 *
 * Run with: npm test -- tests/queue/portal-sqs.service.test.js
 */

require('dotenv').config();
const assert = require('assert');

let PortalSQSService;

async function runTests() {
  console.log('\n=== Portal SQS Service Tests (TDD) ===\n');
  let passed = 0;
  let failed = 0;

  // Test 1: Service module exists
  console.log('Test 1: Portal SQS Service module exists');
  try {
    PortalSQSService = require('../../services/queue/portal-sqs.service');
    assert.ok(PortalSQSService, 'Service should exist');
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
    console.log('\n=== Test Summary ===');
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);
    console.log(`Total:  ${passed + failed}\n`);
    console.log('TESTS FAILED - Service module not found\n');
    process.exit(1);
  }

  // Test 2: Service has queueTranscriptJob method
  console.log('Test 2: queueTranscriptJob method exists');
  try {
    assert.strictEqual(typeof PortalSQSService.queueTranscriptJob, 'function', 'Should have queueTranscriptJob');
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 3: Service has queueAMAJob method
  console.log('Test 3: queueAMAJob method exists');
  try {
    assert.strictEqual(typeof PortalSQSService.queueAMAJob, 'function', 'Should have queueAMAJob');
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 4: Service has receiveJobs method
  console.log('Test 4: receiveJobs method exists');
  try {
    assert.strictEqual(typeof PortalSQSService.receiveJobs, 'function', 'Should have receiveJobs');
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 5: Service has completeJob method
  console.log('Test 5: completeJob method exists');
  try {
    assert.strictEqual(typeof PortalSQSService.completeJob, 'function', 'Should have completeJob');
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 6: Service has getQueueMetrics method
  console.log('Test 6: getQueueMetrics method exists');
  try {
    assert.strictEqual(typeof PortalSQSService.getQueueMetrics, 'function', 'Should have getQueueMetrics');
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 7: Service has JOB_TYPES constant
  console.log('Test 7: JOB_TYPES constant exists');
  try {
    assert.ok(PortalSQSService.JOB_TYPES, 'Should have JOB_TYPES');
    assert.ok(PortalSQSService.JOB_TYPES.TRANSCRIPT_PROCESSING, 'Should have TRANSCRIPT_PROCESSING');
    assert.ok(PortalSQSService.JOB_TYPES.AMA_PROCESSING, 'Should have AMA_PROCESSING');
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 8: Service has isConfigured method
  console.log('Test 8: isConfigured method exists');
  try {
    assert.strictEqual(typeof PortalSQSService.isConfigured, 'function', 'Should have isConfigured');
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 9: queueTranscriptJob validates required parameters
  console.log('Test 9: queueTranscriptJob validates sessionId');
  try {
    // Should throw or return error without sessionId
    const result = await PortalSQSService.queueTranscriptJob(null, {});
    assert.ok(!result.success, 'Should fail without sessionId');
    assert.ok(result.error, 'Should have error message');
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    // Throwing is also acceptable behavior
    if (e.message.includes('sessionId') || e.message.includes('required')) {
      console.log('  ✓ PASSED (threw expected error)\n');
      passed++;
    } else {
      console.log(`  ✗ FAILED: ${e.message}\n`);
      failed++;
    }
  }

  // Test 10: queueAMAJob validates required parameters
  console.log('Test 10: queueAMAJob validates conversationId');
  try {
    const result = await PortalSQSService.queueAMAJob(null, {});
    assert.ok(!result.success, 'Should fail without conversationId');
    assert.ok(result.error, 'Should have error message');
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    if (e.message.includes('conversationId') || e.message.includes('required')) {
      console.log('  ✓ PASSED (threw expected error)\n');
      passed++;
    } else {
      console.log(`  ✗ FAILED: ${e.message}\n`);
      failed++;
    }
  }

  // Test 11: Service exports singleton instance
  console.log('Test 11: Service exports singleton instance');
  try {
    const instance1 = require('../../services/queue/portal-sqs.service');
    const instance2 = require('../../services/queue/portal-sqs.service');
    assert.strictEqual(instance1, instance2, 'Should be same instance');
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 12: Service handles unconfigured queue gracefully
  console.log('Test 12: Service handles unconfigured queue gracefully');
  try {
    // If queue URL is not set, should return meaningful error
    if (!process.env.SQS_PORTAL_QUEUE_URL) {
      const configured = PortalSQSService.isConfigured();
      assert.strictEqual(configured, false, 'Should report not configured when queue URL missing');
    }
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Summary
  console.log('\n=== Test Summary ===');
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total:  ${passed + failed}\n`);

  if (failed > 0) {
    console.log('TESTS FAILED - Service needs implementation\n');
    process.exit(1);
  } else {
    console.log('ALL TESTS PASSED\n');
  }
}

// Run tests
runTests().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
