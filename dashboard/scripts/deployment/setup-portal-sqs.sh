#!/bin/bash

# AWS SQS Setup Script for Observability Portal
# Creates a FIFO queue for Portal-specific job processing:
# - Transcript processing (GPT-4o-mini)
# - AMA processing (SQL generation)
#
# SEPARATE from Main Bot's SQS queue to avoid interference.
#
# Run: ./scripts/deployment/setup-portal-sqs.sh
# Requires: AWS CLI configured with credentials

set -e  # Exit on error

echo "========================================================"
echo "  Observability Portal SQS Queue Setup"
echo "========================================================"

# Configuration
REGION="${AWS_REGION:-ap-southeast-1}"
QUEUE_NAME="rumi-portal-queue.fifo"
DLQ_NAME="rumi-portal-dlq.fifo"

echo ""
echo "Region: $REGION"
echo "Queue:  $QUEUE_NAME"
echo "DLQ:    $DLQ_NAME"
echo ""

# Step 1: Create Dead Letter Queue (DLQ)
echo "Step 1: Creating Dead Letter Queue..."
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
  echo "  DLQ might already exist. Fetching URL..."
  DLQ_URL=$(aws sqs get-queue-url --queue-name "$DLQ_NAME" --region "$REGION" --query 'QueueUrl' --output text)
fi

echo "  DLQ URL: $DLQ_URL"

# Get DLQ ARN
DLQ_ARN=$(aws sqs get-queue-attributes \
  --queue-url "$DLQ_URL" \
  --attribute-names QueueArn \
  --region "$REGION" \
  --query 'Attributes.QueueArn' \
  --output text)

echo "  DLQ ARN: $DLQ_ARN"
echo ""

# Step 2: Create Main Queue with DLQ configuration
echo "Step 2: Creating Main Portal Queue..."

# Redrive policy (send to DLQ after 3 failed attempts)
REDRIVE_POLICY="{\"deadLetterTargetArn\":\"$DLQ_ARN\",\"maxReceiveCount\":\"3\"}"

# Escape for JSON
REDRIVE_POLICY_ESCAPED=$(echo "$REDRIVE_POLICY" | sed 's/"/\\"/g')

MAIN_QUEUE_URL=$(aws sqs create-queue \
  --queue-name "$QUEUE_NAME" \
  --attributes "{
    \"FifoQueue\": \"true\",
    \"ContentBasedDeduplication\": \"true\",
    \"MessageRetentionPeriod\": \"86400\",
    \"VisibilityTimeout\": \"600\",
    \"ReceiveMessageWaitTimeSeconds\": \"20\",
    \"RedrivePolicy\": \"$REDRIVE_POLICY_ESCAPED\"
  }" \
  --region "$REGION" \
  --query 'QueueUrl' \
  --output text 2>/dev/null || echo "")

if [ -z "$MAIN_QUEUE_URL" ]; then
  echo "  Queue might already exist. Fetching URL..."
  MAIN_QUEUE_URL=$(aws sqs get-queue-url --queue-name "$QUEUE_NAME" --region "$REGION" --query 'QueueUrl' --output text)
fi

echo "  Queue URL: $MAIN_QUEUE_URL"

# Get Main Queue ARN
MAIN_QUEUE_ARN=$(aws sqs get-queue-attributes \
  --queue-url "$MAIN_QUEUE_URL" \
  --attribute-names QueueArn \
  --region "$REGION" \
  --query 'Attributes.QueueArn' \
  --output text)

echo "  Queue ARN: $MAIN_QUEUE_ARN"
echo ""

# Step 3: Create CloudWatch Alarms
echo "Step 3: Creating CloudWatch Alarms..."

# Alarm for messages in DLQ
aws cloudwatch put-metric-alarm \
  --alarm-name "rumi-portal-dlq-messages" \
  --alarm-description "Alert when messages appear in Portal DLQ" \
  --metric-name ApproximateNumberOfMessagesVisible \
  --namespace AWS/SQS \
  --statistic Average \
  --period 300 \
  --evaluation-periods 1 \
  --threshold 1 \
  --comparison-operator GreaterThanOrEqualToThreshold \
  --dimensions Name=QueueName,Value="$DLQ_NAME" \
  --region "$REGION" 2>/dev/null && echo "  DLQ alarm created" || echo "  DLQ alarm might already exist"

# Alarm for queue depth
aws cloudwatch put-metric-alarm \
  --alarm-name "rumi-portal-queue-depth" \
  --alarm-description "Alert when portal queue has too many messages" \
  --metric-name ApproximateNumberOfMessagesVisible \
  --namespace AWS/SQS \
  --statistic Average \
  --period 300 \
  --evaluation-periods 2 \
  --threshold 100 \
  --comparison-operator GreaterThanThreshold \
  --dimensions Name=QueueName,Value="$QUEUE_NAME" \
  --region "$REGION" 2>/dev/null && echo "  Queue depth alarm created" || echo "  Queue depth alarm might already exist"

echo ""
echo "========================================================"
echo "  SETUP COMPLETE"
echo "========================================================"
echo ""
echo "Add to Railway environment variables:"
echo ""
echo "  SQS_PORTAL_QUEUE_URL=$MAIN_QUEUE_URL"
echo "  SQS_PORTAL_DLQ_URL=$DLQ_URL"
echo ""
echo "Test connection:"
echo "  node scripts/deployment/test-portal-sqs.js"
echo ""
echo "Monitor queues:"
echo "  https://console.aws.amazon.com/sqs/v2/home?region=$REGION"
echo ""
