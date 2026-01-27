# Testing WhatsApp Bot Without Meta Webhook Access

Can't access Meta Developer Console? No problem! Here are 3 ways to test your bot:

## Prerequisites

First, add your OpenAI API key to `.env`:
```env
OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxx
```

Get it from: https://platform.openai.com/api-keys

---

## Method 1: Console Chat (Test AI Logic)

Test your bot's AI responses directly in your terminal without sending any WhatsApp messages.

```bash
npm run chat
```

**What it does:**
- Tests the AI conversation logic locally
- No WhatsApp messages sent
- Perfect for testing conversation flow
- Interactive chat in your terminal

**Example:**
```
Select mode: 1
You: Hello!
Bot: Hi there! How can I help you today?
You: What's the weather like?
Bot: I'm an AI assistant and don't have real-time weather data...
```

---

## Method 2: Send Messages to WhatsApp

Test actually SENDING messages to a real WhatsApp number.

```bash
npm run send <phone_number> "Your message"
```

**Example:**
```bash
# Send to a Pakistani number
npm run send 923001234567 "Hello from my bot!"

# Send to any number (use country code without +)
npm run send 14155551234 "Test message"
```

**What it does:**
- Sends a real WhatsApp message
- The recipient will receive it on their phone
- Tests that your WhatsApp credentials work
- Does NOT use AI (just sends your text)

**Use case:** Test that your WhatsApp Business number can send messages.

---

## Method 3: Full Bot Simulation

Test the complete bot flow: receive message → AI processes → send response.

**Step 1:** Start your bot server
```bash
npm start
```

**Step 2:** In a NEW terminal, simulate an incoming message
```bash
npm run simulate <from_number> "User message"
```

**Example:**
```bash
# Simulate a message from 923001234567
npm run simulate 923001234567 "Hello bot, how are you?"
```

**What it does:**
- Simulates a webhook from WhatsApp
- Your bot processes it like a real message
- AI generates a response
- Bot sends the response back via WhatsApp
- The person at that number gets the AI's reply!

**Full workflow:**
```
User (simulated) → Your Bot → OpenAI → Your Bot → WhatsApp → Real recipient
```

---

## Method 4: Interactive WhatsApp Chat

Chat with a real WhatsApp number through your bot, with AI responses.

```bash
npm run chat
```

Then select mode `2` and enter a phone number. Every message you type will:
1. Be processed by AI
2. AI's response sent to that WhatsApp number

**Example:**
```
Select mode: 2
Enter phone number: 923001234567

You: What's 2+2?
Bot: 2 + 2 equals 4.
✅ Message sent to WhatsApp!

You: Tell me a joke
Bot: Why did the programmer quit his job? He didn't get arrays!
✅ Message sent to WhatsApp!
```

---

## Comparison Table

| Method | AI Used? | Sends to WhatsApp? | Needs Bot Running? | Best For |
|--------|----------|-------------------|-------------------|----------|
| Console Chat | ✅ | ❌ | ❌ | Testing AI logic |
| Send Messages | ❌ | ✅ | ❌ | Testing sending capability |
| Full Simulation | ✅ | ✅ | ✅ | Testing complete bot flow |
| Interactive Chat | ✅ | ✅ | ❌ | Manual testing with real numbers |

---

## When Do You NEED Webhooks?

You only need Meta webhook configuration when you want:
- **Automatic responses** to messages people send TO your number
- The bot to work 24/7 without you running simulations
- Public-facing bot that anyone can message

For development and testing, the methods above work great!

---

## Quick Testing Workflow

**First Time Setup:**
```bash
# 1. Test credentials work
npm test

# 2. Test AI locally
npm run chat
# Select mode 1, chat with the bot

# 3. Test sending
npm run send YOUR_PHONE_NUMBER "Test from bot"
# Check your WhatsApp!

# 4. Test full flow
npm start
# In another terminal:
npm run simulate YOUR_PHONE_NUMBER "Hello!"
# Check your WhatsApp for AI response!
```

---

## Troubleshooting

### "OpenAI API Key not set"
Add your key to `.env`:
```env
OPENAI_API_KEY=sk-proj-your-key-here
```

### "Failed to send message"
- Check WhatsApp token hasn't expired
- Verify phone number includes country code (no +)
- Ensure recipient has WhatsApp

### "Error: ECONNREFUSED"
When using simulate method, make sure bot is running: `npm start`

---

## Cost Estimates

**For testing:**
- Console chat (Mode 1): FREE
- Sending messages: ~$0.005 per message (after 1000 free)
- OpenAI: ~$0.002 per conversation (GPT-3.5)

**100 test messages ≈ $0.50 + $0.20 OpenAI = $0.70 total**

---

## Next Steps

Once you're ready to go live:
1. Set up webhooks in Meta Console (or have someone with access do it)
2. Use ngrok or deploy to a server
3. Your bot will respond automatically to incoming messages!

For now, these testing methods let you build and test everything locally.
