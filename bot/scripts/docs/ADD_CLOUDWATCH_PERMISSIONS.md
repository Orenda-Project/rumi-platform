# Add CloudWatch Permissions to IAM User

> **Note**: This is only needed if using AWS SQS for job queues. The default Rumi setup uses BullMQ (Redis-based) and does not require AWS.

## Issue
The IAM user needs CloudWatch alarm viewing permissions. We need to add `DescribeAlarms` permission.

---

## Solution - Add Permission via AWS Console

### Step 1: Go to IAM Console

Open: https://console.aws.amazon.com/iam/home?region=us-east-1#/users/your-org

### Step 2: Click "Add Permissions"

1. You should be on the user details page for `your-org`
2. Click the **"Permissions"** tab
3. Click **"Add permissions"** button
4. Select **"Attach policies directly"**

### Step 3: Find the RumiSQSPolicy

1. In the search box, type: `RumiSQSPolicy`
2. Click on the policy name to edit it

### Step 4: Edit the Policy

Click **"Edit"** button, then **"JSON"** tab.

**Replace the entire policy with this updated version:**

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "RumiSQSFullAccess",
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
      "Sid": "RumiCloudWatchFullAccess",
      "Effect": "Allow",
      "Action": [
        "cloudwatch:PutMetricAlarm",
        "cloudwatch:PutMetricData",
        "cloudwatch:GetMetricStatistics",
        "cloudwatch:DescribeAlarms",
        "cloudwatch:DescribeAlarmsForMetric",
        "cloudwatch:ListMetrics",
        "cloudwatch:GetMetricData"
      ],
      "Resource": "*"
    }
  ]
}
```

### Step 5: Save Changes

1. Click **"Next"**
2. Click **"Save changes"**

---

## Verify It Works

After updating the policy, run this command:

```bash
aws cloudwatch describe-alarms \
  --alarm-names "rumi-dlq-messages" "rumi-queue-depth" "rumi-message-age" \
  --region us-east-1 \
  --query 'MetricAlarms[*].[AlarmName,StateValue]' \
  --output table
```

**Expected output:**

```
-----------------------------------
|        DescribeAlarms           |
+----------------------+----------+
|  rumi-dlq-messages   |  OK      |
|  rumi-queue-depth    |  OK      |
|  rumi-message-age    |  OK      |
+----------------------+----------+
```

---

## What Permissions Were Added

| Permission | Purpose |
|------------|---------|
| `cloudwatch:DescribeAlarms` | View alarm status |
| `cloudwatch:DescribeAlarmsForMetric` | View alarms for specific metrics |
| `cloudwatch:ListMetrics` | List available metrics |
| `cloudwatch:GetMetricData` | Retrieve metric data for monitoring |

These are **read-only** permissions for monitoring. The user already had **write** permissions (`PutMetricAlarm`) which is why the alarms were created successfully.

---

## Alternative: Quick Fix via AWS CLI (if you have admin access)

If you have admin credentials, you can update the policy directly:

```bash
# First, get the policy ARN
POLICY_ARN=$(aws iam list-policies --query 'Policies[?PolicyName==`RumiSQSPolicy`].Arn' --output text)

# Create new policy version
aws iam create-policy-version \
  --policy-arn $POLICY_ARN \
  --policy-document file://rumi-sqs-policy-v2.json \
  --set-as-default
```

Where `rumi-sqs-policy-v2.json` contains the updated JSON policy above.

---

## Status

- ✅ SQS queues working
- ✅ Alarms created
- ⏭️ Add permissions to view alarms
- ⏭️ Verify alarms are monitoring correctly
