# Debugging Voice Messages

Your bot now has detailed logging enabled! Here's how to debug the voice message issue.

---

## Step 1: Restart Your Bot

**In the terminal where you ran `npm start`:**
1. Press `Ctrl+C` to stop the bot
2. Run `npm start` again
3. You should see a message about logging being enabled

**Leave ngrok running** - don't touch that terminal!

---

## Step 2: Check Logs Location

When the bot starts, you'll see:
```
📝 LOGGING ENABLED
   All webhook activity is logged to: /Users/haroonyasin/Documents/Cursor/Projects/AI-Projects/WhatsApp testing/logs
   Log file: bot-2025-10-31.log
```

---

## Step 3: Test Voice Messages

1. **Send a text message** to +[YOUR BOT PHONE NUMBER]
   - Confirm it still works

2. **Send a voice note** to +[YOUR BOT PHONE NUMBER]
   - Record a short message in Urdu

---

## Step 4: Check the Log File

**Open the log file:**
```bash
cat "logs/bot-2025-10-31.log"
```

Or use VS Code to open: `logs/bot-2025-10-31.log`

---

## What to Look For in Logs

### For Text Messages (working):
```
[timestamp] === INCOMING WEBHOOK ===
{
  "entry": [...],
  "messages": [{
    "type": "text",
    ...
  }]
}
[timestamp] Message received from 923001234567
{
  "messageType": "text",
  ...
}
[timestamp] Processing TEXT message: Hello
[timestamp] AI response generated
[timestamp] Text response sent successfully
```

### For Voice Messages (we need to see):
```
[timestamp] === INCOMING WEBHOOK ===
{
  "entry": [...],
  "messages": [{
    "type": "???",  <-- What is this type?
    ...
  }]
}
[timestamp] Message received from 923001234567
{
  "messageType": "???",  <-- What type does WhatsApp send?
  "hasAudio": true/false,
  "hasVoice": true/false,
  ...
}
```

---

## Common Issues & Solutions

### Issue 1: Voice messages show as "unsupported message type"
**Look in logs for:**
```
⚠️ Unsupported message type: image
```
or
```
⚠️ Unsupported message type: document
```

**This means:**
- WhatsApp might be sending voice notes with a different type
- The log will show what type it is
- We can fix the code to handle that type

### Issue 2: Voice messages not appearing in logs at all
**This means:**
- Meta webhook might not be configured to send audio messages
- Need to check webhook field subscriptions

### Issue 3: Voice processing starts but fails
**Look for:**
```
🎤 VOICE MESSAGE DETECTED - Starting processing...
❌ Error processing voice message
```

**Check the error details in the log:**
- API key issues
- Download errors
- Transcription failures
- Speech generation problems

---

## Quick Check Commands

**View logs in real-time:**
```bash
tail -f logs/bot-2025-10-31.log
```

**Search for voice messages:**
```bash
grep -i "voice\|audio" logs/bot-2025-10-31.log
```

**Search for errors:**
```bash
grep "❌\|Error" logs/bot-2025-10-31.log
```

---

## What I Need to See

After you test sending a voice note, please send me:

1. **The full log file contents** (just the parts after you sent the voice note)
2. **What the bot responded** (if anything)
3. **Any errors you see in the terminal**

This will help me identify exactly what's happening with voice messages!

---

## Expected Voice Message Flow

When working correctly, logs should show:
```
🎤 VOICE MESSAGE DETECTED - Starting processing...
Step 1: Downloading audio from WhatsApp...
Audio downloaded { bufferSize: 12345 }
Step 2: Converting audio to WAV...
Audio converted to WAV
Step 3: Transcribing audio with Soniox...
Transcription received { transcription: "آپ کا پیغام" }
Step 4: Getting AI response...
AI response generated
Step 5: Generating speech with Eleven Labs...
Speech generated
Step 6: Sending audio response...
✅ Voice message processed successfully!
```

If you see all these steps, the bot is working!
If it stops somewhere, we'll know exactly where the problem is.
