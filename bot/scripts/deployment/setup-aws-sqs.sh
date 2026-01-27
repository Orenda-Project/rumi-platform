#!/bin/bash

# AWS SQS Setup Script for Rumi Digital Coach Bot
# This script creates FIFO queues for coaching job processing
# Run this script after configuring AWS CLI credentials

set -e  # Exit on error

echo "🚀 Setting up AWS SQS queues for Rumi Bot..."

# Configuration
REGION="${AWS_REGION:-us-east-1}"
QUEUE_NAME="rumi-coaching-queue.fifo"
DLQ_NAME="rumi-coaching-dlq.fifo"

echo "📍 Using AWS Region: $REGION"

# Step 1: Create Dead Letter Queue (DLQ)
echo ""
echo "📦 Step 1: Creating Dead Letter Queue..."
DLQ_URL=$(aws sqs create-queue \
  --queue-name "$DLQ_NAME" \
  --attributes '{
    "FifoQueue": "true",
    "ContentBasedDeduplication": "true",
    "MessageRetentionPeriod": "1209600"
  }' \
  --region "$REGION" \
  --query 'QueueUrl' \
  --output text 2>/dev/null || echo "")

if [ -z "$DLQ_URL" ]; then
  echo "⚠️  DLQ might already exist. Fetching URL..."
  DLQ_URL=$(aws sqs get-queue-url --queue-name "$DLQ_NAME" --region "$REGION" --query 'QueueUrl' --output text)
fi

echo "✅ DLQ Created: $DLQ_URL"

# Get DLQ ARN
DLQ_ARN=$(aws sqs get-queue-attributes \
  --queue-url "$DLQ_URL" \
  --attribute-names QueueArn \
  --region "$REGION" \
  --query 'Attributes.QueueArn' \
  --output text)

echo "   ARN: $DLQ_ARN"

# Step 2: Create Main Queue with DLQ configuration
echo ""
echo "📦 Step 2: Creating Main Coaching Queue..."

# Redrive policy (send to DLQ after 3 failed attempts)
REDRIVE_POLICY="{\"deadLetterTargetArn\":\"$DLQ_ARN\",\"maxReceiveCount\":\"3\"}"

MAIN_QUEUE_URL=$(aws sqs create-queue \
  --queue-name "$QUEUE_NAME" \
  --attributes "{
    \"FifoQueue\": \"true\",
    \"ContentBasedDeduplication\": \"true\",
    \"MessageRetentionPeriod\": \"86400\",
    \"VisibilityTimeout\": \"900\",
    \"ReceiveMessageWaitTimeSeconds\": \"20\",
    \"RedrivePolicy\": \"$REDRIVE_POLICY\"
  }" \
  --region "$REGION" \
  --query 'QueueUrl' \
  --output text 2>/dev/null || echo "")

if [ -z "$MAIN_QUEUE_URL" ]; then
  echo "⚠️  Main queue might already exist. Fetching URL..."
  MAIN_QUEUE_URL=$(aws sqs get-queue-url --queue-name "$QUEUE_NAME" --region "$REGION" --query 'QueueUrl' --output text)
fi

echo "✅ Main Queue Created: $MAIN_QUEUE_URL"

# Get Main Queue ARN
MAIN_QUEUE_ARN=$(aws sqs get-queue-attributes \
  --queue-url "$MAIN_QUEUE_URL" \
  --attribute-names QueueArn \
  --region "$REGION" \
  --query 'Attributes.QueueArn' \
  --output text)

echo "   ARN: $MAIN_QUEUE_ARN"

# Step 3: Create CloudWatch Alarms
echo ""
echo "📊 Step 3: Creating CloudWatch Alarms..."

# Alarm for messages in DLQ
aws cloudwatch put-metric-alarm \
  --alarm-name "rumi-dlq-messages" \
  --alarm-description "Alert when messages appear in DLQ" \
  --metric-name ApproximateNumberOfMessagesVisible \
  --namespace AWS/SQS \
  --statistic Average \
  --period 300 \
  --evaluation-periods 1 \
  --threshold 1 \
  --comparison-operator GreaterThanOrEqualToThreshold \
  --dimensions Name=QueueName,Value="$DLQ_NAME" \
  --region "$REGION" 2>/dev/null && echo "✅ DLQ alarm created" || echo "⚠️  DLQ alarm might already exist"

# Alarm for queue depth (too many messages)
aws cloudwatch put-metric-alarm \
  --alarm-name "rumi-queue-depth" \
  --alarm-description "Alert when queue has too many messages" \
  --metric-name ApproximateNumberOfMessagesVisible \
  --namespace AWS/SQS \
  --statistic Average \
  --period 300 \
  --evaluation-periods 2 \
  --threshold 500 \
  --comparison-operator GreaterThanThreshold \
  --dimensions Name=QueueName,Value="$QUEUE_NAME" \
  --region "$REGION" 2>/dev/null && echo "✅ Queue depth alarm created" || echo "⚠️  Queue depth alarm might already exist"

# Alarm for old messages (processing too slow)
aws cloudwatch put-metric-alarm \
  --alarm-name "rumi-message-age" \
  --alarm-description "Alert when messages are too old" \
  --metric-name ApproximateAgeOfOldestMessage \
  --namespace AWS/SQS \
  --statistic Maximum \
  --period 300 \
  --evaluation-periods 1 \
  --threshold 1800 \
  --comparison-operator GreaterThanThreshold \
  --dimensions Name=QueueName,Value="$QUEUE_NAME" \
  --region "$REGION" 2>/dev/null && echo "✅ Message age alarm created" || echo "⚠️  Message age alarm might already exist"

# Step 4: Output configuration for .env
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ AWS SQS Setup Complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📝 Add these to your .env file:"
echo ""
echo "AWS_REGION=$REGION"
echo "SQS_QUEUE_URL=$MAIN_QUEUE_URL"
echo "SQS_DLQ_URL=$DLQ_URL"
echo ""
echo "📊 Verify setup:"
echo "  aws sqs get-queue-attributes --queue-url $MAIN_QUEUE_URL --attribute-names All --region $REGION"
echo ""
echo "🔍 Monitor queues:"
echo "  Main Queue: https://console.aws.amazon.com/sqs/v2/home?region=$REGION#/queues/$(echo $MAIN_QUEUE_URL | sed 's|.*/||')"
echo "  DLQ:        https://console.aws.amazon.com/sqs/v2/home?region=$REGION#/queues/$(echo $DLQ_URL | sed 's|.*/||')"
echo ""
echo "✅ Next steps:"
echo "  1. Add the environment variables to your .env file"
echo "  2. Run: npm install aws-sdk"
echo "  3. Test with: node scripts/test-sqs-connection.js"
echo ""
