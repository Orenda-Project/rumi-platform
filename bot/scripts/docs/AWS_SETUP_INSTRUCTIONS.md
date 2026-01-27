# AWS SQS Setup Instructions

This guide will help you set up AWS SQS queues for the Rumi Digital Coach Bot.

## Prerequisites

1. **AWS Account** - Create one at [aws.amazon.com](https://aws.amazon.com)
2. **AWS CLI** - Install from [aws.amazon.com/cli](https://aws.amazon.com/cli/)
3. **IAM User with SQS Permissions**

---

## Step 1: Create IAM User (5 minutes)

### 1.1 Create User
```bash
# Go to AWS Console > IAM > Users > Create User
# Username: rumi-bot-sqs-user
# Access type: Programmatic access
```

### 1.2 Attach Policy
Create a custom policy with these permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "sqs:CreateQueue",
        "sqs:DeleteQueue",
        "sqs:GetQueueUrl",
        "sqs:GetQueueAttributes",
        "sqs:SetQueueAttributes",
        "sqs:SendMessage",
        "sqs:ReceiveMessage",
        "sqs:DeleteMessage",
        "sqs:ChangeMessageVisibility",
        "sqs:PurgeQueue",
        "sqs:ListQueues"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "cloudwatch:PutMetricAlarm",
        "cloudwatch:PutMetricData",
        "cloudwatch:GetMetricStatistics"
      ],
      "Resource": "*"
    }
  ]
}
```

### 1.3 Save Credentials
After creating the user, save:
- **Access Key ID** (starts with `AKIA...`)
- **Secret Access Key** (long random string)

---

## Step 2: Configure AWS CLI (2 minutes)

```bash
# Run AWS configure
aws configure

# Enter when prompted:
# AWS Access Key ID: AKIA...
# AWS Secret Access Key: ...
# Default region name: us-east-1
# Default output format: json

# Test connection
aws sts get-caller-identity
```

Expected output:
```json
{
    "UserId": "AIDAI...",
    "Account": "123456789012",
    "Arn": "arn:aws:iam::123456789012:user/rumi-bot-sqs-user"
}
```

---

## Step 3: Run Setup Script (3 minutes)

```bash
cd /path/to/rumi-platform/bot

# Make script executable
chmod +x scripts/setup-aws-sqs.sh

# Run setup
./scripts/setup-aws-sqs.sh
```

Expected output:
```
🚀 Setting up AWS SQS queues for Rumi Bot...
📍 Using AWS Region: us-east-1
📦 Step 1: Creating Dead Letter Queue...
✅ DLQ Created: https://sqs.us-east-1.amazonaws.com/.../rumi-coaching-dlq.fifo
📦 Step 2: Creating Main Coaching Queue...
✅ Main Queue Created: https://sqs.us-east-1.amazonaws.com/.../rumi-coaching-queue.fifo
📊 Step 3: Creating CloudWatch Alarms...
✅ DLQ alarm created
✅ Queue depth alarm created
✅ Message age alarm created
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ AWS SQS Setup Complete!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## Step 4: Update .env File (1 minute)

Add these lines to your `.env` file:

```bash
# AWS Configuration
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=AKIA...  # From IAM user
AWS_SECRET_ACCESS_KEY=...  # From IAM user

# SQS Queue URLs (from setup script output)
SQS_QUEUE_URL=https://sqs.us-east-1.amazonaws.com/123456789012/rumi-coaching-queue.fifo
SQS_DLQ_URL=https://sqs.us-east-1.amazonaws.com/123456789012/rumi-coaching-dlq.fifo
```

---

## Step 5: Install Dependencies (1 minute)

```bash
npm install aws-sdk
```

---

## Step 6: Test Connection (1 minute)

```bash
node scripts/test-sqs-connection.js
```

Expected output:
```
🧪 Testing AWS SQS Connection...

📊 Test 1: Fetching queue attributes...
✅ Main Queue Attributes:
   - Queue ARN: arn:aws:sqs:us-east-1:...
   - FIFO Queue: true
   - Content-Based Deduplication: true
   - Visibility Timeout: 900s
   - Message Retention: 86400s
   - Messages Available: 0
   - Messages In Flight: 0

📊 Test 2: Fetching DLQ attributes...
✅ DLQ Attributes:
   - Queue ARN: arn:aws:sqs:us-east-1:...
   - Messages in DLQ: 0

📤 Test 3: Sending test message...
✅ Message sent successfully!
   - Message ID: ...
   - Sequence Number: ...

📥 Test 4: Receiving test message...
✅ Message received successfully!
   - Message ID: ...
   - Receipt Handle: ...
   - Body: { ... }

🗑️  Test 5: Deleting test message...
✅ Message deleted successfully!

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ All SQS tests passed!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## Troubleshooting

### Error: "UnrecognizedClientException"
**Cause:** AWS credentials not configured correctly
**Fix:**
```bash
aws configure
# Re-enter credentials
```

### Error: "AccessDeniedException"
**Cause:** IAM user lacks permissions
**Fix:** Attach the policy from Step 1.2 to your IAM user

### Error: "QueueAlreadyExists"
**Cause:** Queue was created previously
**Fix:** This is fine! The script will fetch the existing queue URL

### Error: "InvalidParameter"
**Cause:** Queue names must end with `.fifo` for FIFO queues
**Fix:** Check the queue names in the script

---

## Cost Estimate

For 1,000 teachers, 30,000 messages/day:

- **SQS Requests:** ~900,000/month
  - First 1M requests: FREE
  - **Cost: $0.00**

- **Data Transfer:**
  - Average message size: 5 KB
  - Total: ~4.5 GB/month
  - First 1 GB free, then $0.09/GB
  - **Cost: ~$0.32/month**

- **CloudWatch (optional):**
  - Metrics: ~$0.30/month
  - Alarms: $0.10/alarm × 3 = $0.30/month
  - **Cost: ~$0.60/month**

**Total: ~$1-2/month**

---

## Monitoring

### View Queues in Console
```
Main Queue: https://console.aws.amazon.com/sqs/v2/home?region=us-east-1#/queues
```

### Check Queue Metrics
```bash
# Get current queue depth
aws sqs get-queue-attributes \
  --queue-url $SQS_QUEUE_URL \
  --attribute-names ApproximateNumberOfMessages

# Get DLQ messages
aws sqs get-queue-attributes \
  --queue-url $SQS_DLQ_URL \
  --attribute-names ApproximateNumberOfMessages
```

### CloudWatch Dashboard
```
https://console.aws.amazon.com/cloudwatch/home?region=us-east-1#dashboards:
```

Create custom dashboard with:
- Messages Sent
- Messages Received
- Messages in DLQ
- Oldest Message Age
- Queue Depth

---

## Next Steps

After successful setup:

1. ✅ SQS queues created
2. ⏭️ Implement SQS Queue Service ([shared/services/queue/sqs-queue.service.js](../shared/services/queue/sqs-queue.service.js))
3. ⏭️ Implement SQS Worker ([workers/sqs-worker.js](../workers/sqs-worker.js))
4. ⏭️ Integrate with coaching flow
5. ⏭️ Deploy to Railway

---

## Security Best Practices

1. **Never commit AWS credentials to git**
   - Already in `.gitignore`
   - Use environment variables

2. **Rotate credentials regularly**
   - Every 90 days minimum
   - Use AWS Secrets Manager (Week 5)

3. **Use least privilege**
   - Only grant SQS permissions needed
   - Limit to specific queues if possible

4. **Enable CloudTrail**
   - Monitor all SQS API calls
   - Detect unauthorized access

5. **Set up billing alerts**
   - Alert if costs exceed $5/month
   - Prevent unexpected charges

---

## Reference

- [AWS SQS Documentation](https://docs.aws.amazon.com/sqs/)
- [AWS SQS FIFO Queues](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/FIFO-queues.html)
- [AWS SQS Pricing](https://aws.amazon.com/sqs/pricing/)
- [Implementation Roadmap V3](../../Reports/IMPLEMENTATION_ROADMAP_V3_FINAL.md)

---

**Setup Time:** ~15 minutes
**Monthly Cost:** ~$1-2
**Estimated Completion:** ✅ Ready to proceed to next task
