# Complete Setup Guide - WhatsApp AI Bot

Follow these steps to get your bot fully operational with webhooks and OpenAI.

---

## Step 1: Get OpenAI API Key (5 minutes)

### Instructions:

1. **Go to OpenAI Platform:**
   - Visit: https://platform.openai.com/signup
   - Sign up or log in with your account

2. **Add Payment Method (Required):**
   - Go to: https://platform.openai.com/account/billing/overview
   - Click "Add payment details"
   - Add a credit/debit card
   - OpenAI charges ~$0.002 per conversation (very cheap!)

3. **Create API Key:**
   - Go to: https://platform.openai.com/api-keys
   - Click "Create new secret key"
   - Give it a name: "WhatsApp Bot"
   - Copy the key (starts with `sk-proj-...`)
   - **IMPORTANT:** Save it now - you can't see it again!

4. **Add to .env file:**
   ```bash
   # Open the .env file and replace this line:
   OPENAI_API_KEY=your_openai_api_key_here

   # With your actual key:
   OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxxxxxxxxxx
   ```

**Cost estimate:** ~$0.20 per 100 conversations with GPT-3.5

---

## Step 2: Install ngrok (3 minutes)

ngrok exposes your local server to the internet so Meta can send webhooks to it.

### Mac Installation:

```bash
# Using Homebrew (recommended)
brew install ngrok

# Or download from: https://ngrok.com/download
```

### Windows Installation:

1. Download from: https://ngrok.com/download
2. Extract the ZIP file
3. Move ngrok.exe to a folder in your PATH

### Linux Installation:

```bash
# Download and install
curl -s https://ngrok-agent.s3.amazonaws.com/ngrok.asc | sudo tee /etc/apt/trusted.gpg.d/ngrok.asc >/dev/null
echo "deb https://ngrok-agent.s3.amazonaws.com buster main" | sudo tee /etc/apt/sources.list.d/ngrok.list
sudo apt update && sudo apt install ngrok
```

### Sign up for ngrok (Free):

1. Go to: https://dashboard.ngrok.com/signup
2. Sign up (free tier is fine)
3. Get your auth token from: https://dashboard.ngrok.com/get-started/your-authtoken
4. Run this command:
   ```bash
   ngrok config add-authtoken YOUR_AUTH_TOKEN
   ```

**Verify installation:**
```bash
ngrok version
```

---

## Step 3: Start Your Bot Server (1 minute)

Open a terminal and run:

```bash
npm start
```

You should see:
```
==================================================
🤖 WhatsApp AI Bot Server Started!
==================================================
Port: 3000
Webhook URL: http://localhost:3000/webhook
==================================================
```

**Keep this terminal running!** Don't close it.

---

## Step 4: Expose Server with ngrok (1 minute)

Open a **NEW terminal** (keep the first one running) and run:

```bash
ngrok http 3000
```

You'll see something like:
```
Session Status    online
Forwarding        https://abc123xyz.ngrok-free.app -> http://localhost:3000
```

**Copy that HTTPS URL!** It looks like: `https://abc123xyz.ngrok-free.app`

**IMPORTANT:**
- Keep this terminal running too!
- Your URL will change each time you restart ngrok (free tier)
- For a permanent URL, upgrade to ngrok paid plan ($8/month)

---

## Step 5: Configure Webhook in Meta (5 minutes)

Now we'll tell WhatsApp where to send messages.

### Instructions:

1. **Go to Meta Developer Console:**
   - Visit: https://developers.facebook.com/apps/
   - Find your WhatsApp app and click it

2. **Navigate to WhatsApp Settings:**
   - Left sidebar: Click "WhatsApp" → "Configuration"
   - Find the "Webhook" section

3. **Edit Webhook Settings:**
   - Click "Edit" button next to Webhook
   - You'll see two fields:

   **Callback URL:**
   ```
   https://your-ngrok-url.ngrok-free.app/webhook
   ```
   Replace `your-ngrok-url` with your actual ngrok URL

   Example: `https://abc123xyz.ngrok-free.app/webhook`

   **Verify Token:**
   ```
   my_webhook_verify_token_12345
   ```
   (This matches what's in your .env file)

4. **Click "Verify and Save":**
   - Meta will send a request to your server
   - Your bot will verify it automatically
   - You should see "✅ Verified!" or similar

   **If verification fails:**
   - Check both terminals are running (bot + ngrok)
   - Verify the URL is correct (https, includes /webhook)
   - Check the verify token matches your .env file

5. **Subscribe to Webhooks:**
   - Still in the Webhook section
   - Find "Webhook fields"
   - Check the box next to **"messages"**
   - Click "Subscribe"

6. **Done!** Your webhook is configured.

---

## Step 6: Test Your Bot! (2 minutes)

### Test 1: Send a Message

From your phone (or any WhatsApp account):

1. Open WhatsApp
2. Start a new chat
3. Message your bot's number: **+[YOUR BOT PHONE NUMBER]**
4. Send any message: "Hello!"

**Expected behavior:**
- Your bot terminal shows: "Message from [number]: Hello!"
- AI processes the message
- You receive an AI response in WhatsApp!

### Test 2: Check Logs

Watch both terminals:

**Terminal 1 (Bot Server):**
```
Message from 923001234567: Hello!
✅ AI Response generated
✅ Message sent successfully
```

**Terminal 2 (ngrok):**
```
POST /webhook    200 OK
```

---

## Troubleshooting

### Webhook Verification Failed

**Symptoms:** Meta says "Unable to verify webhook"

**Solutions:**
1. Verify both terminals are running:
   ```bash
   # Terminal 1: npm start
   # Terminal 2: ngrok http 3000
   ```

2. Check the callback URL format:
   ```
   ✅ https://abc123.ngrok-free.app/webhook
   ❌ http://abc123.ngrok-free.app/webhook  (missing 's')
   ❌ https://abc123.ngrok-free.app         (missing /webhook)
   ```

3. Verify token must match exactly:
   - Check .env file: `WEBHOOK_VERIFY_TOKEN=my_webhook_verify_token_12345`
   - Must match Meta console exactly (case-sensitive)

4. Check bot logs for verification request:
   ```
   Webhook verification request received
   Mode: subscribe
   Token: my_webhook_verify_token_12345
   ```

### Bot Doesn't Respond to Messages

**Symptoms:** You send a message but get no reply

**Solutions:**

1. **Check OpenAI API Key:**
   ```bash
   # In .env, should look like:
   OPENAI_API_KEY=sk-proj-xxxxxxxxxxxx
   ```

   Verify it's valid: https://platform.openai.com/api-keys

2. **Check Webhook Subscription:**
   - In Meta console: WhatsApp → Configuration
   - "messages" field should be checked ✅

3. **Check Bot Logs:**
   - Should show: "Incoming webhook: ..."
   - If no logs appear, webhook isn't reaching your server

4. **Check ngrok is Running:**
   ```bash
   # Terminal 2 should show:
   Forwarding  https://xxxx.ngrok-free.app -> localhost:3000
   ```

5. **Test webhook manually:**
   ```bash
   npm run simulate 923001234567 "Test message"
   ```
   If this works but real messages don't, it's a webhook config issue.

### OpenAI Errors

**Error: "Incorrect API key"**
- Get a new key: https://platform.openai.com/api-keys
- Update .env file
- Restart bot (Ctrl+C, then `npm start`)

**Error: "You exceeded your current quota"**
- Add payment method: https://platform.openai.com/account/billing
- Add at least $5 credit

**Error: "Rate limit exceeded"**
- You're sending too many requests
- Wait a minute and try again
- Consider upgrading OpenAI tier

### ngrok Issues

**Error: "command not found: ngrok"**
- Install ngrok (see Step 2)
- Or download from: https://ngrok.com/download

**URL Changes Every Restart:**
- Free tier gives random URLs
- Update webhook URL in Meta console each time
- Or upgrade to paid plan for static domain

**Error: "authentication failed"**
- Run: `ngrok config add-authtoken YOUR_TOKEN`
- Get token from: https://dashboard.ngrok.com/get-started/your-authtoken

---

## Quick Reference Commands

```bash
# Start bot
npm start

# Expose to internet (separate terminal)
ngrok http 3000

# Test credentials
npm test

# Test sending
npm run send 923001234567 "Test message"

# Simulate webhook
npm run simulate 923001234567 "Hello bot"

# Local chat testing
npm run chat
```

---

## Architecture Diagram

```
WhatsApp User
     ↓
  (sends message)
     ↓
Meta WhatsApp Server
     ↓
  (webhook POST)
     ↓
   ngrok
     ↓
Your Bot (localhost:3000)
     ↓
  (AI processing)
     ↓
  OpenAI GPT-3.5
     ↓
Your Bot (localhost:3000)
     ↓
  (send reply)
     ↓
Meta WhatsApp API
     ↓
WhatsApp User receives reply
```

---

## What You Need

✅ OpenAI API Key ($0.20 per 100 chats)
✅ ngrok account (Free tier works)
✅ Two terminal windows open
✅ Meta Developer Console access
✅ WhatsApp Business number (you have this!)

---

## Production Deployment (Optional)

For a 24/7 bot, you'll want to deploy to a server instead of using ngrok:

**Options:**
- **Railway.app** (Easy, free tier available)
- **Render.com** (Easy, free tier available)
- **Heroku** (Easy, $5/month)
- **DigitalOcean** (VPS, $6/month)
- **AWS/GCP** (Complex, pay-as-you-go)

Let me know if you want deployment instructions!

---

## Security Tips

1. **Never commit .env to git** (already in .gitignore)
2. **Rotate tokens regularly**
3. **Use environment variables in production**
4. **Add rate limiting** for production use
5. **Monitor API costs** at OpenAI dashboard

---

## Need Help?

If you get stuck at any step, let me know which step number and what error you're seeing!
