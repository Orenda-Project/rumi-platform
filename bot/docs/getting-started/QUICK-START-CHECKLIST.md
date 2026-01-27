# Quick Start Checklist

Follow this checklist in order. Check off each item as you complete it.

---

## ☐ Step 1: Get OpenAI API Key

1. ☐ Go to https://platform.openai.com/signup
2. ☐ Sign up / Log in
3. ☐ Add payment method at https://platform.openai.com/account/billing/overview
4. ☐ Create API key at https://platform.openai.com/api-keys
5. ☐ Copy the key (starts with `sk-proj-...`)
6. ☐ Open `.env` file
7. ☐ Replace `your_openai_api_key_here` with your actual key
8. ☐ Save the `.env` file

**Your .env should look like:**
```
OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxxxxxxxxx
```

---

## ☐ Step 2: Install ngrok

### Mac:
```bash
☐ brew install ngrok
```

### Windows/Linux:
☐ Download from https://ngrok.com/download

### All platforms:
```bash
☐ ngrok version  # Verify installation
☐ Go to https://dashboard.ngrok.com/signup
☐ Sign up for free account
☐ Get auth token from https://dashboard.ngrok.com/get-started/your-authtoken
☐ ngrok config add-authtoken YOUR_AUTH_TOKEN
```

---

## ☐ Step 3: Start Your Bot

Open Terminal 1:

```bash
☐ cd "/Users/haroonyasin/Documents/Cursor/Projects/AI-Projects/WhatsApp testing"
☐ npm start
```

**Expected output:**
```
🤖 WhatsApp AI Bot Server Started!
Port: 3000
```

☐ Keep this terminal open (don't close it!)

---

## ☐ Step 4: Start ngrok

Open Terminal 2 (NEW terminal window):

```bash
☐ ngrok http 3000
```

**Expected output:**
```
Forwarding  https://abc123xyz.ngrok-free.app -> http://localhost:3000
```

☐ Copy your HTTPS URL (the `https://` one)

**Your URL:** `___________________________________`

☐ Keep this terminal open (don't close it!)

---

## ☐ Step 5: Configure Meta Webhook

1. ☐ Go to https://developers.facebook.com/apps/
2. ☐ Find and click your WhatsApp app
3. ☐ Left sidebar: Click "WhatsApp" → "Configuration"
4. ☐ Find "Webhook" section
5. ☐ Click "Edit" button

**Enter these values:**

**Callback URL:**
```
https://your-ngrok-url.ngrok-free.app/webhook
```
☐ Paste your ngrok URL + `/webhook` at the end

**Verify Token:**
```
my_webhook_verify_token_12345
```
☐ Copy this exact token

6. ☐ Click "Verify and Save"
7. ☐ Wait for ✅ "Verified!" message

**If verification fails:**
- ☐ Check both terminals are still running
- ☐ Make sure URL has `https://` and ends with `/webhook`
- ☐ Verify token matches exactly (case-sensitive)

8. ☐ Find "Webhook fields" section below
9. ☐ Check the box next to **"messages"**
10. ☐ Click "Subscribe"

---

## ☐ Step 6: Test Your Bot!

### Test 1: Send from Your Phone

1. ☐ Open WhatsApp on your phone
2. ☐ Start new chat with: **+[YOUR BOT PHONE NUMBER]**
3. ☐ Send message: "Hello bot!"
4. ☐ Wait 2-3 seconds
5. ☐ You should receive an AI-generated response!

### Test 2: Check Logs

**Terminal 1 (Bot) should show:**
```
Message from [your-number]: Hello bot!
Message sent successfully
```

**Terminal 2 (ngrok) should show:**
```
POST /webhook    200 OK
```

☐ Bot received the message
☐ Bot responded successfully

---

## ☐ Step 7: Celebrate! 🎉

Your bot is live and working! Try:

- ☐ "Tell me a joke"
- ☐ "What's 25 * 34?"
- ☐ "Explain quantum physics simply"
- ☐ Have a conversation!

---

## Troubleshooting

### ❌ Webhook verification failed
→ See SETUP-GUIDE.md "Troubleshooting" section

### ❌ Bot doesn't respond
→ Check OpenAI API key is valid
→ Check "messages" webhook is subscribed
→ Check both terminals are running

### ❌ OpenAI error
→ Add payment method: https://platform.openai.com/account/billing
→ Verify API key: https://platform.openai.com/api-keys

---

## Daily Usage

Every time you want to use your bot:

1. ☐ Open Terminal 1: `npm start`
2. ☐ Open Terminal 2: `ngrok http 3000`
3. ☐ Copy new ngrok URL
4. ☐ Update webhook in Meta console (if URL changed)
5. ☐ Start chatting!

**Tip:** Get a paid ngrok plan ($8/month) for a permanent URL so you don't have to update Meta every time.

---

## Need Help?

Stuck on a step? Reply with:
- Which step number?
- What error message do you see?
- Screenshot if possible

I'll help you fix it!
