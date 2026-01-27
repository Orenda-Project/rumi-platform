# Development Setup

Complete guide to setting up the Rumi bot for local development.

---

## Prerequisites

### Required Software

- **Node.js 18+** ([download](https://nodejs.org/))
  - Check version: `node --version`
  - Should show: v18.x.x or higher

- **npm 9+** (comes with Node.js)
  - Check version: `npm --version`

- **Git 2.30+** ([download](https://git-scm.com/))
  - Check version: `git --version`

- **Code Editor** (VS Code recommended)
  - [Download VS Code](https://code.visualstudio.com/)

### Optional Tools

- **Railway CLI** ([install](https://docs.railway.com/quick-start))
  - For deployment and log viewing
  - Install: `npm install -g @railway/cli`

- **Ngrok** ([install](https://ngrok.com/download))
  - For local webhook testing
  - Alternative: Use Railway for testing

- **Postman** ([download](https://www.postman.com/downloads/))
  - For API testing

---

## Initial Setup

### 1. Clone Repository

```bash
# HTTPS (recommended)
git clone https://github.com/taleemabad/rumi-platform.git
cd rumi-platform

# OR SSH (if you have SSH keys)
git clone git@github.com:taleemabad/rumi-platform.git
cd rumi-platform
```

### 2. Install Dependencies

```bash
npm install
```

This installs all packages from `package.json`:
- Express.js (web server)
- OpenAI SDK
- Axios (HTTP client)
- FFmpeg wrapper
- All other dependencies

**Expected output**:
```
added 150 packages in 15s
```

### 3. Create Environment File

```bash
touch .env
```

Edit `.env` with your credentials:

```env
# WhatsApp Cloud API (Meta Business Platform)
WHATSAPP_TOKEN=EAAYour_Permanent_Access_Token_Here
PHONE_NUMBER_ID=123456789012345
WEBHOOK_VERIFY_TOKEN=your_secure_random_string_12345

# OpenAI API
OPENAI_API_KEY=sk-proj-Your_OpenAI_API_Key_Here

# Soniox Speech-to-Text
SONIOX_API_KEY=Your_Soniox_API_Key_Here

# Gamma AI (Lesson Plan Generation)
GAMMA_API_KEY=sk-gamma-Your_Gamma_API_Key_Here

# Server Configuration
PORT=3000
```

---

## Getting API Keys

### WhatsApp Cloud API

1. **Create Meta App**:
   - Go to https://developers.facebook.com/apps
   - Click "Create App"
   - Choose "Business" type
   - Add WhatsApp product

2. **Get Temporary Token**:
   - Navigate to WhatsApp → API Setup
   - Copy temporary access token (expires in 24 hours)

3. **Generate Permanent Token**:
   ```bash
   # Using temporary token, get permanent one
   curl -X GET "https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=YOUR_APP_ID&client_secret=YOUR_APP_SECRET&fb_exchange_token=YOUR_TEMP_TOKEN"
   ```

4. **Get Phone Number ID**:
   - WhatsApp → API Setup
   - Copy "Phone Number ID" (below phone number display)

5. **Create Verify Token**:
   - Generate random string: `openssl rand -base64 32`
   - Save as `WEBHOOK_VERIFY_TOKEN`

### OpenAI API

1. Go to https://platform.openai.com/api-keys
2. Click "Create new secret key"
3. Name it "Rumi Bot"
4. Copy immediately (only shown once)
5. Add to `.env` as `OPENAI_API_KEY`

**Cost**: Requires paid account with credits loaded.

### Soniox API

1. Go to https://console.soniox.com
2. Sign up / Login
3. **Add payment method** (required as of Oct 27, 2025)
4. Navigate to API Keys section
5. Click "Create new key"
6. Copy and add to `.env`

**Cost**: $0.10 per hour of audio.

### Gamma AI

1. Go to https://gamma.app
2. Sign up / Login
3. Navigate to account settings → API
4. Generate API key
5. Copy and add to `.env`

**Cost**: Contact Gamma for pricing (not publicly documented).

---

## Verify Setup

Run the test script to verify all credentials:

```bash
npm run test
```

**Expected output**:
```
✅ Environment variables loaded
✅ WhatsApp token valid
✅ Phone number ID valid
✅ OpenAI API key valid
✅ Soniox API key valid
✅ Gamma API key valid

All systems go! 🚀
```

**If any fail**: Double-check the API key in `.env` file.

---

## Local Development

### Option A: With Webhooks (Ngrok)

**Use when**: Testing end-to-end with real WhatsApp messages.

1. **Start local server**:
   ```bash
   npm run dev
   ```

   **Expected output**:
   ```
   ==================================================
   🤖 WhatsApp AI Bot Server Started!
   ==================================================
   Port: 3000
   Webhook URL: http://localhost:3000/webhook
   ==================================================
   ```

2. **Start Ngrok tunnel** (separate terminal):
   ```bash
   ngrok http 3000
   ```

   **Expected output**:
   ```
   Forwarding https://abc123.ngrok.io -> http://localhost:3000
   ```

3. **Configure WhatsApp webhook**:
   - Go to Meta Business Platform → WhatsApp → Configuration
   - Click "Edit" next to Webhook
   - **Callback URL**: `https://abc123.ngrok.io/webhook`
   - **Verify Token**: Your `WEBHOOK_VERIFY_TOKEN`
   - Click "Verify and Save"

4. **Subscribe to webhook fields**:
   - Check "messages"
   - Click "Subscribe"

5. **Test**:
   - Send WhatsApp message to your business number
   - Watch logs in terminal

### Option B: Without Webhooks (Local Chat)

**Use when**: Testing AI responses without WhatsApp integration.

```bash
npm run chat
```

**Expected output**:
```
==================================================
🤖 Rumi - Local Chat Test
==================================================
Type your messages and press Enter.
Type 'quit' or 'exit' to stop.
==================================================

You: How to teach fractions?
Bot: Here's an approach for teaching fractions...

You: What about visual aids?
Bot: For visual aids with fractions...

You: quit
Goodbye!
```

---

## Testing Individual Components

### Send Test Message

Edit `test-send-message.js`:
```javascript
const TO_NUMBER = '923001234567';  // Change to your number
const MESSAGE = 'Test message from bot';
```

Run:
```bash
npm run send
```

### Simulate Webhook Event

Edit `simulate-webhook.js`:
```javascript
const payload = {
  // Customize webhook payload
};
```

Run:
```bash
npm run simulate
```

### Check Soniox Status

```bash
node check-soniox-status.js
```

**Output**:
```
📁 Total files: 6
📝 Total transcriptions: 6
Status breakdown:
  completed: 6
```

### Cleanup Soniox Resources

```bash
node cleanup-soniox.js
```

Deletes old files/transcriptions (keeps 5 most recent).

---

## Git Workflow

### Branching Strategy

```
main              ← Production (deployed to Railway)
  ├── feature/voice-improvements
  ├── feature/lesson-plan-fixes
  └── hotfix/soniox-timeout
```

### Create Feature Branch

```bash
git checkout -b feature/my-new-feature
```

### Make Changes and Commit

```bash
# Stage changes
git add whatsapp-bot.js

# OR stage all changes
git add .

# Commit with descriptive message
git commit -m "Add voice message retry logic

- Retry transcription on timeout
- Add exponential backoff
- Log retry attempts for debugging"
```

### Push to GitHub

```bash
git push origin feature/my-new-feature
```

### Merge to Main

```bash
git checkout main
git merge feature/my-new-feature
git push origin main
```

Railway auto-deploys when `main` is updated.

---

## Environment Variables Reference

| Variable | Required | Example | Description |
|----------|----------|---------|-------------|
| `WHATSAPP_TOKEN` | Yes | `EAAYour...` | Permanent access token |
| `PHONE_NUMBER_ID` | Yes | `123456789012345` | WhatsApp Business phone number ID |
| `WEBHOOK_VERIFY_TOKEN` | Yes | `my_secret_123` | Custom token for webhook verification |
| `OPENAI_API_KEY` | Yes | `sk-proj-...` | OpenAI API key |
| `SONIOX_API_KEY` | Yes | `Your_Key...` | Soniox API key |
| `GAMMA_API_KEY` | Yes | `sk-gamma-...` | Gamma AI API key |
| `PORT` | No | `3000` | Server port (auto-assigned on Railway) |
| `NODE_ENV` | No | `development` | Environment mode |

---

## Common Commands

### NPM Scripts

```bash
npm start           # Start server (production)
npm run dev         # Start server (development, same as start)
npm run test        # Validate API credentials
npm run chat        # Local chat simulation
npm run send        # Send test WhatsApp message
npm run simulate    # Simulate webhook event
```

### Railway CLI

```bash
railway login       # Login to Railway
railway link        # Link local project to Railway
railway logs        # View production logs
railway status      # Check deployment status
railway up          # Deploy current code
```

### Git Commands

```bash
git status          # Check changes
git log             # View commit history
git pull            # Pull latest changes
git push            # Push commits to GitHub
```

---

## Debugging Tips

### Enable Verbose Logging

Edit `whatsapp-bot.js`:
```javascript
const DEBUG = true;  // Set to false for production
```

### View Logs

**Local**:
```bash
# Logs print to console
# Also saved to bot.log
tail -f bot.log
```

**Railway**:
```bash
railway logs --tail 100
```

### Test Individual APIs

**WhatsApp**:
```bash
curl -X POST "https://graph.facebook.com/v21.0/{PHONE_NUMBER_ID}/messages" \
  -H "Authorization: Bearer {WHATSAPP_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"messaging_product":"whatsapp","to":"923001234567","text":{"body":"Test"}}'
```

**OpenAI**:
```bash
curl -X POST "https://api.openai.com/v1/chat/completions" \
  -H "Authorization: Bearer {OPENAI_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-4","messages":[{"role":"user","content":"Test"}]}'
```

**Soniox**:
```bash
curl -X GET "https://api.soniox.com/v1/files" \
  -H "Authorization: Bearer {SONIOX_API_KEY}"
```

---

## Troubleshooting

### Node.js Version Mismatch

**Error**: `SyntaxError: Unexpected token '?'`

**Solution**: Upgrade to Node.js 18+
```bash
node --version
# If < 18, install from nodejs.org
```

### npm install Fails

**Error**: `EACCES: permission denied`

**Solution**: Fix npm permissions
```bash
sudo chown -R $USER /usr/local/lib/node_modules
npm install
```

### Webhook Verification Fails

**Error**: Webhook URL unreachable

**Solution**:
1. Ensure server is running (`npm start`)
2. Ensure ngrok is running and forwarding to port 3000
3. Use HTTPS URL from ngrok (not HTTP)
4. Verify `WEBHOOK_VERIFY_TOKEN` matches in both `.env` and Meta Console

### API Key Invalid

**Error**: `401 Unauthorized`

**Solution**:
1. Regenerate API key in respective platform
2. Update `.env` file
3. Restart server: `Ctrl+C` then `npm start`

---

**Next**: See [05_Deployment_Operations.md](05_Deployment_Operations.md) for production deployment.
