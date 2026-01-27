#!/usr/bin/env node
/**
 * Test Portal SQS Connection
 *
 * Verifies that the Portal can connect to its dedicated SQS queue.
 * Run: node scripts/deployment/test-portal-sqs.js
 */

require('dotenv').config();

async function testConnection() {
  console.log('========================================');
  console.log('  Portal SQS Connection Test');
  console.log('========================================\n');

  // Check environment variable
  const queueUrl = process.env.SQS_PORTAL_QUEUE_URL;

  if (!queueUrl) {
    console.log('ERROR: SQS_PORTAL_QUEUE_URL not configured');
    console.log('\nSet it in .env or Railway:');
    console.log('  SQS_PORTAL_QUEUE_URL=https://sqs.ap-southeast-1.amazonaws.com/xxx/rumi-portal-queue.fifo');
    process.exit(1);
  }

  console.log('Queue URL:', queueUrl);
  console.log('');

  // Test service
  const PortalSQSService = require('../../services/queue/portal-sqs.service');

  console.log('Service configured:', PortalSQSService.isConfigured());
  console.log('');

  if (!PortalSQSService.isConfigured()) {
    console.log('ERROR: Service not configured');
    process.exit(1);
  }

  // Test get queue metrics
  console.log('Testing getQueueMetrics()...');
  try {
    const metrics = await PortalSQSService.getQueueMetrics();
    console.log('  Queue metrics:', JSON.stringify(metrics, null, 2));
    console.log('  PASS');
  } catch (error) {
    console.log('  FAIL:', error.message);
    process.exit(1);
  }

  console.log('');

  // Test queue a dummy job (will fail validation if no sessionId)
  console.log('Testing queueTranscriptJob() validation...');
  const result = await PortalSQSService.queueTranscriptJob(null, {});
  if (!result.success && result.error.includes('sessionId')) {
    console.log('  Validation works correctly');
    console.log('  PASS');
  } else {
    console.log('  Unexpected result:', result);
    console.log('  FAIL');
    process.exit(1);
  }

  console.log('');
  console.log('========================================');
  console.log('  ALL TESTS PASSED');
  console.log('========================================');
}

testConnection().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
