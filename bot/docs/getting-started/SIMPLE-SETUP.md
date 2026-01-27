# Super Simple Setup - 2 Steps!

Your bot now automatically starts ngrok when you run `npm start`! You just need to get an ngrok token.

---

## Step 1: Get ngrok Token (2 minutes)

1. **Go to ngrok:** https://dashboard.ngrok.com/signup
2. **Sign up** (it's free!)
3. **Get your auth token:** https://dashboard.ngrok.com/get-started/your-authtoken
4. **Copy the token** (looks like: `2abc123...`)
5. **Give me the token** and I'll add it to your `.env` file

---

## Step 2: Start the Bot (10 seconds)

```bash
npm start
```

That's it! The bot will:
- ✅ Start the server
- ✅ Start ngrok automatically
- ✅ Show you the webhook URL
- ✅ Give you step-by-step Meta configuration instructions

---

## What You'll See

```
🤖 WhatsApp AI Bot Server Started!
======================================================================

📍 Local Server:
   Port: 3000
   URL: http://localhost:3000

🔄 Starting ngrok tunnel...

✅ ngrok tunnel established!

🌐 Public Webhook URL:
   https://abc123.ngrok-free.app/webhook

📋 Next Steps:
   1. Copy the webhook URL above
   2. Go to: https://developers.facebook.com/apps/
   3. Navigate to: WhatsApp → Configuration → Webhook
   4. Paste URL: https://abc123.ngrok-free.app/webhook
   5. Verify Token: my_webhook_verify_token_12345
   6. Subscribe to: messages
   7. Send a message to: +[YOUR BOT PHONE NUMBER]
```

---

## Then Configure Meta Webhook

1. Open: https://developers.facebook.com/apps/
2. Click your WhatsApp app
3. Go to: **WhatsApp → Configuration**
4. Find **Webhook** section, click **Edit**
5. Enter:
   - **Callback URL:** (copy from your terminal)
   - **Verify Token:** `my_webhook_verify_token_12345`
6. Click **Verify and Save** ✅
7. Check the **messages** box
8. Click **Subscribe**

---

## Test Your Bot!

Send a WhatsApp message to: **+[YOUR BOT PHONE NUMBER]**

You'll get an AI-powered response!

---

## Current Status

✅ OpenAI API Key: Added
✅ WhatsApp Credentials: Working
✅ ngrok Integration: Ready
⏳ ngrok Token: **Need this from you!**

**Once you give me your ngrok token, you'll be 100% ready to go!**

---

## Get Your ngrok Token Now

1. Visit: https://dashboard.ngrok.com/signup
2. Sign up (free)
3. Go to: https://dashboard.ngrok.com/get-started/your-authtoken
4. Copy the token
5. Send it to me!

The token looks like: `2abc123def456ghi789jkl...`
