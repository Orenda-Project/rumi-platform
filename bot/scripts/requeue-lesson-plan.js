/**
 * Re-queue Pending Lesson Plan to SQS
 *
 * Run: node scripts/requeue-lesson-plan.js <request_id>
 *
 * This script re-queues a pending lesson plan request to the SQS queue
 * for processing by the SQS worker.
 */

require('dotenv').config();
const AWS = require('aws-sdk');
const { createClient } = require('@supabase/supabase-js');

// Configuration
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Configure AWS
AWS.config.update({
  region: process.env.AWS_REGION || 'us-east-1',
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
});

const sqs = new AWS.SQS({ apiVersion: '2012-11-05' });
const QUEUE_URL = process.env.SQS_QUEUE_URL;

async function requeueLessonPlan(requestId) {
  console.log('=== Re-queuing Lesson Plan to SQS ===\n');

  if (!QUEUE_URL) {
    console.error('ERROR: SQS_QUEUE_URL not configured');
    process.exit(1);
  }

  // 1. Get the pending request from database
  console.log('Fetching request from database...');
  const { data: request, error } = await supabase
    .from('lesson_plan_requests')
    .select('*')
    .eq('id', requestId)
    .single();

  if (error || !request) {
    console.error('ERROR: Request not found:', requestId);
    console.error('Error:', error?.message);
    process.exit(1);
  }

  console.log('Found request:');
  console.log('  ID:', request.id);
  console.log('  User:', request.user_id);
  console.log('  Phone:', request.phone_number);
  console.log('  Topic:', request.topic);
  console.log('  Language:', request.language);
  console.log('  Status:', request.status);
  console.log('  Created:', request.created_at);
  console.log('');

  if (request.status !== 'pending') {
    console.log('WARNING: Request is not pending (status: ' + request.status + ')');
    console.log('Continue anyway? (processing to re-queue)\n');
  }

  // 2. Build the SQS message
  const jobPayload = {
    requestId: request.id,
    userId: request.user_id,
    phoneNumber: request.phone_number,
    topic: request.topic,
    language: request.language,
    correlationId: `requeue-${Date.now()}`
  };

  const messageBody = {
    sessionId: request.id,
    jobType: 'lesson_plan_generation',
    payload: jobPayload,
    queuedAt: new Date().toISOString(),
    correlationId: jobPayload.correlationId
  };

  // 3. Send to SQS
  console.log('Sending to SQS queue:', QUEUE_URL);
  console.log('Message body:', JSON.stringify(messageBody, null, 2));
  console.log('');

  try {
    const params = {
      QueueUrl: QUEUE_URL,
      MessageBody: JSON.stringify(messageBody),
      MessageGroupId: 'lesson-plan-generation', // Required for FIFO queues
      MessageDeduplicationId: `${request.id}-requeue-${Date.now()}` // Unique for FIFO
    };

    const result = await sqs.sendMessage(params).promise();

    console.log('SUCCESS! Message sent to SQS');
    console.log('Message ID:', result.MessageId);
    console.log('');
    console.log('The SQS worker should now pick up this job.');
    console.log('Monitor logs in Axiom for: "lesson_plan_generation" processing');

  } catch (sqsError) {
    console.error('ERROR sending to SQS:', sqsError.message);
    console.error('Details:', sqsError);
    process.exit(1);
  }
}

// Main
const requestId = process.argv[2];
if (!requestId) {
  console.error('Usage: node requeue-lesson-plan.js <request-id>');
  process.exit(1);
}
console.log('Request ID:', requestId);
console.log('');

requeueLessonPlan(requestId);
