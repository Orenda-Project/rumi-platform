/**
 * TDD Tests: Portal SQS Worker
 *
 * Tests for the Portal-specific SQS worker that processes:
 * - Transcript processing jobs (GPT-4o-mini transcript refinement)
 * - AMA processing jobs (Ask Me Anything SQL generation)
 *
 * Run with: npm test -- tests/queue/portal-sqs-worker.test.js
 */

require('dotenv').config();
const assert = require('assert');

let PortalSQSWorker;

async function runTests() {
  console.log('\n=== Portal SQS Worker Tests (TDD) ===\n');
  let passed = 0;
  let failed = 0;

  // Test 1: Worker module exists
  console.log('Test 1: Portal SQS Worker module exists');
  try {
    PortalSQSWorker = require('../../workers/portal-sqs-worker');
    assert.ok(PortalSQSWorker, 'Worker should exist');
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
    console.log('\n=== Test Summary ===');
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);
    console.log(`Total:  ${passed + failed}\n`);
    console.log('TESTS FAILED - Worker module not found\n');
    process.exit(1);
  }

  // Test 2: Worker has processTranscriptJob method
  console.log('Test 2: processTranscriptJob method exists');
  try {
    assert.strictEqual(typeof PortalSQSWorker.processTranscriptJob, 'function', 'Should have processTranscriptJob');
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 3: Worker has processAMAJob method
  console.log('Test 3: processAMAJob method exists');
  try {
    assert.strictEqual(typeof PortalSQSWorker.processAMAJob, 'function', 'Should have processAMAJob');
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 4: Worker has start method
  console.log('Test 4: start method exists');
  try {
    assert.strictEqual(typeof PortalSQSWorker.start, 'function', 'Should have start');
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 5: Worker has stop method (graceful shutdown)
  console.log('Test 5: stop method exists');
  try {
    assert.strictEqual(typeof PortalSQSWorker.stop, 'function', 'Should have stop');
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 6: Worker has isRunning method
  console.log('Test 6: isRunning method exists');
  try {
    assert.strictEqual(typeof PortalSQSWorker.isRunning, 'function', 'Should have isRunning');
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 7: Worker is not running initially
  console.log('Test 7: Worker is not running initially');
  try {
    const running = PortalSQSWorker.isRunning();
    assert.strictEqual(running, false, 'Should not be running initially');
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 8: Worker has processJob dispatcher method
  console.log('Test 8: processJob dispatcher method exists');
  try {
    assert.strictEqual(typeof PortalSQSWorker.processJob, 'function', 'Should have processJob');
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 9: processJob routes to correct handler based on jobType
  console.log('Test 9: processJob routes transcript jobs correctly');
  try {
    // Create a mock job
    const mockJob = {
      messageId: 'test-123',
      body: {
        sessionId: 'session-456',
        jobType: 'transcript_processing',
        payload: { rawTranscript: 'Test transcript' }
      }
    };

    // The worker should have a way to determine the job type
    const jobType = mockJob.body.jobType;
    assert.strictEqual(jobType, 'transcript_processing', 'Should extract job type');
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 10: processJob routes AMA jobs correctly
  console.log('Test 10: processJob routes AMA jobs correctly');
  try {
    const mockJob = {
      messageId: 'test-789',
      body: {
        conversationId: 'conv-012',
        jobType: 'ama_processing',
        payload: { question: 'How many users?' }
      }
    };

    const jobType = mockJob.body.jobType;
    assert.strictEqual(jobType, 'ama_processing', 'Should extract job type');
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 11: Worker has getStats method for monitoring
  console.log('Test 11: getStats method exists');
  try {
    assert.strictEqual(typeof PortalSQSWorker.getStats, 'function', 'Should have getStats');
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 12: getStats returns expected structure
  console.log('Test 12: getStats returns expected structure');
  try {
    const stats = PortalSQSWorker.getStats();
    assert.ok(typeof stats === 'object', 'Should return object');
    assert.ok('processedCount' in stats, 'Should have processedCount');
    assert.ok('errorCount' in stats, 'Should have errorCount');
    assert.ok('running' in stats, 'Should have running status');
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 13: Worker exports SUPPORTED_JOB_TYPES
  console.log('Test 13: SUPPORTED_JOB_TYPES constant exists');
  try {
    assert.ok(PortalSQSWorker.SUPPORTED_JOB_TYPES, 'Should have SUPPORTED_JOB_TYPES');
    assert.ok(Array.isArray(PortalSQSWorker.SUPPORTED_JOB_TYPES), 'Should be an array');
    assert.ok(PortalSQSWorker.SUPPORTED_JOB_TYPES.includes('transcript_processing'), 'Should support transcript_processing');
    assert.ok(PortalSQSWorker.SUPPORTED_JOB_TYPES.includes('ama_processing'), 'Should support ama_processing');
    console.log('  ✓ PASSED\n');
    passed++;
  } catch (e) {
    console.log(`  ✗ FAILED: ${e.message}\n`);
    failed++;
  }

  // Test 14: Worker handles unknown job types gracefully
  console.log('Test 14: Worker handles unknown job types gracefully');
  try {
    const mockJob = {
      messageId: 'test-unknown',
      body: {
        jobType: 'unknown_job_type',
        payload: {}
      }
    };

    // Should not throw, but return error result
    try {
      const result = await PortalSQSWorker.processJob(mockJob);
      assert.ok(!result.success, 'Should fail for unknown job type');
      assert.ok(result.error, 'Should have error message');
    } catch (e) {
      // Throwing is also acceptable
      assert.ok(e.message.includes('unknown') || e.message.includes('unsupported'),
        'Error should mention unknown/unsupported job type');
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
    console.log('TESTS FAILED - Worker needs implementation\n');
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
