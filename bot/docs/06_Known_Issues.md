# Known Issues & Troubleshooting

Active issues, workarounds, and troubleshooting guide.

---

## Current Known Issues

### 1. Soniox Transcriptions Occasionally Stuck in Queue

**Status**: ⚠️ Active (as of Nov 1, 2025)

**Symptoms**:
```json
{
  "attempt": 21,
  "status": "queued",
  "error_type": null,
  "error_message": null
}
```

V3 transcriptions sometimes remain in "queued" status for extended periods (>3 minutes).

**Root Cause**: Unknown. Likely Soniox service-side queue delays or rate limiting.

**Current Workaround**:
- Extended timeout: v3 = 180s (3 min), v2 = 120s (2 min)
- Automatic fallback to v2 if v3 times out
- Most transcriptions complete in 5-15s, timeout handles outliers

**Code Location**: [whatsapp-bot.js:355-443](../whatsapp-bot.js#L355-L443)

**Long-term Solution**: Contact Soniox support if persistent.

**Related Commits**:
- `1cadec6`: Increase timeout for queue processing
- `09324d1`: Remove advanced features causing queued status

---

### 2. Advanced Soniox Features Cause Queue Hang

**Status**: ✅ Resolved (re-enabled as of Nov 1, 2025)

**Issue**: When `enable_language_identification: true` or `context: {}` were included, v3 got stuck in "queued" indefinitely.

**Resolution**: Soniox v3 is now stable. Advanced features re-enabled with educational context:

```javascript
// In whatsapp-bot.js:333-366
if (modelVersion === 'stt-async-v3') {
  requestBody.enable_language_identification = true;
  requestBody.context = {
    general: [
      { key: 'domain', value: 'Education' },
      { key: 'topic', value: 'Teaching, lesson planning...' },
      { key: 'organization', value: 'Your Organization' }
    ],
    text: 'Teachers in Pakistan discussing...',
    terms: ['multigrade', 'ustaad', 'taleem', 'lesson plan', ...]
  };
}
```

**Benefits**:
- Improved accuracy for educational terminology
- Better Urdu/English code-switching detection
- Context-aware transcription for teaching discussions

**Related Commits**:
- `a2659fc`: Re-enable advanced features (Nov 1, 2025)
- `09324d1`: Remove advanced features (temporary fix)
- `bafe2a3`: Initial attempt (reverted)

---

### 3. Soniox Free Tier Discontinued (Oct 27, 2025)

**Status**: ✅ Resolved (payment method required)

**Issue**: Free API credits no longer processed after October 27, 2025.

**Symptoms**:
- Transcriptions stuck in "queued" with no error
- `error_type: null`, `error_message: null`

**Root Cause**: Soniox discontinued free tier due to abuse/spam.

**Solution**: Add payment method at https://console.soniox.com

**Cost Impact**: $0.10 per hour of audio transcribed.

---

### 4. Conversation History Lost on Restart

**Status**: ⚠️ Active (architectural limitation)

**Issue**: In-memory conversation storage means all history is lost when Railway restarts.

**Code Location**: [whatsapp-bot.js:50-52](../whatsapp-bot.js#L50-L52)
```javascript
const conversationHistories = {};  // Lost on restart
```

**Impact**:
- Minor for most users (conversations typically short)
- No long-term memory of past interactions

**Workaround**: None currently.

**Long-term Solution**: Implement persistent storage (see [07_Extending_the_Bot.md](07_Extending_the_Bot.md#add-persistent-conversation-storage))

**Estimated Effort**: 4-6 hours for Redis integration.

---

### 5. No Message Retry on Failure

**Status**: ⚠️ Active (no retry mechanism)

**Issue**: If message fails to send (network error, API down), it's lost permanently.

**Symptoms**:
```
Error sending message: { error: "Network timeout" }
```
User never receives response.

**Root Cause**: No message queue or retry mechanism.

**Workaround**: Manual user retry (send message again).

**Long-term Solution**: Implement message queue (Bull with Redis) with automatic retries.

**Estimated Effort**: 6-8 hours.

---

### 6. Gamma API Layout Parameter Error

**Status**: ✅ Resolved (removed parameter)

**Issue**: Using `layout` parameter in Gamma API v0.2 requests caused 400 Bad Request error.

**Error Message**: "Input validation errors: 1. property layout should not exist"

**Solution**: Removed `layout` parameter entirely. Gamma auto-detects format.

**Code Location**: [whatsapp-bot.js:486-515](../whatsapp-bot.js#L486-L515)

**Related Commit**: `932f77b`

---

## Common Troubleshooting Scenarios

### Webhook Not Receiving Messages

**Symptoms**: Server running, but no logs when sending WhatsApp messages.

**Debugging Steps**:

1. **Verify Webhook Configuration**:
   - Meta Console → WhatsApp → Configuration → Webhook
   - URL: `https://your-domain.railway.app/webhook`
   - Verify token matches `.env`

2. **Check Webhook Subscription**:
   - Ensure `messages` field is subscribed
   - Look for green checkmark

3. **Test Webhook Manually**:
   ```bash
   curl -X POST https://your-domain.railway.app/webhook \
     -H "Content-Type: application/json" \
     -d '{"test": "webhook"}'
   ```

4. **Check Railway Logs**:
   ```bash
   railway logs --tail 100
   ```
   Look for incoming POST requests.

**Common Fixes**:
- Regenerate permanent access token
- Update webhook URL after domain change
- Re-subscribe to webhook fields

---

### Voice Messages Not Transcribing

**Symptoms**: Text messages work, but voice messages fail or timeout.

**Debugging Steps**:

1. **Check Soniox Account**:
   ```bash
   node check-soniox-status.js
   ```
   Verify:
   - Payment method attached
   - < 100 files
   - Recent successful transcriptions

2. **Check Railway Logs**:
   ```bash
   railway logs | grep -i soniox
   ```
   Look for:
   - File upload success
   - Transcription job created
   - Status updates
   - Any 400/401/402 errors

3. **Verify Audio Format**:
   - WhatsApp sends OGG Opus
   - Bot converts to WAV (16kHz, mono)
   - Check `temp/` directory

**Common Fixes**:
- Add payment method to Soniox account
- Increase timeout if queue is slow
- Delete old files if approaching 100-file limit:
  ```bash
  node cleanup-soniox.js
  ```

---

### Lesson Plan Generation Fails

**Symptoms**: Bot responds to "generate lesson plan" but doesn't send PDF.

**Debugging Steps**:

1. **Check Gamma API Key**:
   ```bash
   railway logs | grep -i gamma
   ```
   Look for 401 Unauthorized errors.

2. **Verify Request Format**:
   - Ensure `layout` parameter is NOT included
   - Verify `format: "document"` or `"presentation"`

3. **Check Generation Status**:
   ```bash
   railway logs | grep "Gamma generation status"
   ```

**Common Fixes**:
- Regenerate Gamma API key
- Remove `layout` parameter (not supported in v0.2)
- Increase generation timeout (currently 5 minutes)

---

### Bot Responds Slowly

**Symptoms**: Long delay (30+ seconds) between message and response.

**Debugging Steps**:

1. **Identify Bottleneck**:
   ```bash
   railway logs | grep "response time"
   ```
   Look for timing breakdown.

2. **Check API Latencies**:
   - OpenAI: Should be 2-10s for GPT-4
   - Soniox: Should be 5-15s for short audio
   - Gamma: Should be 30-90s for lesson plans

**Optimization Options**:
- Use GPT-3.5-turbo instead of GPT-4 (faster, cheaper)
- Implement caching for common questions
- Use streaming responses (show typing indicator)
- Add "processing" status message for long operations

---

### Railway Deployment Fails

**Symptoms**: `railway up` fails or deployment doesn't start.

**Debugging Steps**:

1. **Check Build Logs**:
   ```bash
   railway logs --deployment
   ```
   Look for npm install errors.

2. **Verify package.json**:
   - Ensure `start` script exists
   - Check Node.js version compatibility

3. **Test Locally First**:
   ```bash
   npm install
   npm start
   ```

**Common Fixes**:
- Delete `node_modules` and reinstall: `npm ci`
- Specify Node.js version in package.json:
  ```json
  {
    "engines": {
      "node": "18.x"
    }
  }
  ```

---

## Error Code Reference

### WhatsApp API Errors

| Code | Error | Meaning | Fix |
|------|-------|---------|-----|
| 401 | Unauthorized | Invalid access token | Regenerate permanent token |
| 403 | Forbidden | Phone number not verified | Verify in Meta Console |
| 404 | Not Found | Invalid phone number ID | Check PHONE_NUMBER_ID env var |
| 429 | Too Many Requests | Rate limit exceeded | Implement rate limiting |
| 500 | Internal Server Error | WhatsApp API issue | Retry after delay |

### OpenAI API Errors

| Code | Error | Meaning | Fix |
|------|-------|---------|-----|
| 401 | Invalid API Key | Wrong or expired key | Regenerate key |
| 429 | Rate Limit | Too many requests | Reduce request rate |
| 500 | Server Error | OpenAI service issue | Retry with backoff |
| 503 | Overloaded | High traffic on OpenAI | Retry after delay |

### Soniox API Errors

| Code | Error | Meaning | Fix |
|------|-------|---------|-----|
| 400 | Bad Request | Invalid parameters | Check request body |
| 401 | Unauthorized | Invalid API key | Verify Soniox key |
| 402 | Payment Required | No payment method | Add card to account |
| 429 | Too Many Requests | Rate limit exceeded | Implement rate limiting |
| 500 | Internal Error | Soniox service issue | Contact support |

---

## Reporting New Issues

When reporting a new issue, include:

1. **Description**: What happened vs. what was expected
2. **Steps to Reproduce**: Exact steps to trigger issue
3. **Logs**: Relevant Railway logs (use `railway logs`)
4. **Environment**: Development or production?
5. **Timestamp**: When did it occur?
6. **User Impact**: How many users affected?

**Where to Report**:
- GitHub Issues: https://github.com/your-org/whatsapp-ai-bot/issues
- Internal Slack: #digital-coach-bugs

---

**Next**: See [07_Extending_the_Bot.md](07_Extending_the_Bot.md) for adding new features.
