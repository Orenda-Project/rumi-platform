# Voice Chat Feature Guide

Your WhatsApp bot now supports voice messages in Urdu! Users can send voice notes and receive AI-generated voice responses.

---

## How It Works

```
User sends voice note (Urdu)
         ↓
WhatsApp delivers to your bot
         ↓
Bot downloads audio (OGG format)
         ↓
Converts to WAV format (ffmpeg)
         ↓
Transcribes using Soniox API (Urdu)
         ↓
Sends transcription to OpenAI
         ↓
Gets AI response in Urdu
         ↓
Converts to speech using Eleven Labs
         ↓
Sends voice response back to user
```

---

## Features

✅ Accepts voice notes from WhatsApp
✅ Transcribes Urdu speech to text (Soniox)
✅ Generates AI responses in Urdu (OpenAI)
✅ Converts responses to natural speech (Eleven Labs)
✅ Sends voice responses back to users
✅ Maintains conversation context
✅ Handles both text and voice messages

---

## Testing the Voice Feature

### Step 1: Make sure your bot is running

```bash
# Terminal 1
npm start

# Terminal 2
npx ngrok http 3000 --authtoken YOUR_TOKEN
```

### Step 2: Send a voice note

1. Open WhatsApp on your phone
2. Start a chat with your bot: **+[YOUR BOT PHONE NUMBER]**
3. **Hold the microphone button** and record a message in **Urdu**
4. Release to send

### Step 3: Watch the magic happen!

**In your bot terminal, you'll see:**
```
Message from 923001234567, type: audio
Processing voice message...
Downloading audio...
Converting audio to WAV...
Transcribing audio with Soniox...
Transcription: [your Urdu text]
Getting AI response...
AI Response: [AI's Urdu response]
Generating speech with Eleven Labs...
Sending audio response...
Voice message processed successfully!
```

**You'll receive:**
- An AI-generated voice response in Urdu!

---

## Example Conversations

### Example 1: Greeting
**User (voice):** "السلام علیکم، کیا حال ہے؟"
*(Assalamu alaikum, kya haal hai?)*

**Bot (voice):** "وعلیکم السلام! میں بہت اچھا ہوں، شکریہ۔ آپ کیسے ہیں؟"
*(Wa alaikum assalam! Main bohat acha hoon, shukriya. Aap kaise hain?)*

### Example 2: Question
**User (voice):** "موسم کیسا ہے؟"
*(Mausam kaisa hai?)*

**Bot (voice):** "میں ایک AI اسسٹنٹ ہوں اور مجھے حقیقی وقت کا موسم کا ڈیٹا نہیں ملتا..."
*(I'm an AI assistant and don't have real-time weather data...)*

---

## Supported Message Types

| Type | Supported | Response Type |
|------|-----------|---------------|
| Text | ✅ | Text (Urdu) |
| Voice | ✅ | Voice (Urdu) |
| Audio | ✅ | Voice (Urdu) |
| Image | ❌ | Text (Urdu error message) |
| Video | ❌ | Text (Urdu error message) |
| Document | ❌ | Text (Urdu error message) |

---

## API Configuration

### Soniox (Speech-to-Text)
- **Language:** Urdu (`ur` model)
- **Format:** WAV, 16kHz, Mono
- **API:** https://api.soniox.com/transcribe-async

### Eleven Labs (Text-to-Speech)
- **Voice:** Adam (multilingual)
- **Model:** `eleven_multilingual_v2`
- **Language:** Auto-detects Urdu
- **Format:** MP3

### OpenAI (AI Response)
- **Model:** GPT-3.5 Turbo
- **Language:** Responds in Urdu
- **Context:** Maintains conversation history

---

## Audio Processing

### WhatsApp Format
- **Input:** OGG Opus codec
- **Download:** Via WhatsApp Media API

### Conversion Pipeline
```
OGG → WAV (16kHz, Mono) → Soniox
OpenAI Response → Eleven Labs → MP3 → WhatsApp
```

### Temporary Files
- Stored in: `./temp/` directory
- Auto-cleaned after processing
- Files: `input_*.ogg`, `audio_*.wav`, `audio_*.mp3`

---

## Troubleshooting

### Voice message not processed

**Check bot logs for:**
```
Error downloading WhatsApp media
Error transcribing with Soniox
Error generating speech with Eleven Labs
```

**Common fixes:**
1. Verify API keys in `.env` file
2. Check API quotas/credits
3. Ensure `temp/` directory exists
4. Verify ffmpeg is installed

### Empty transcription

If Soniox returns empty text:
- Voice note might be too short
- Audio quality issues
- Language not Urdu
- API quota exceeded

### Can't send audio response

- Check WhatsApp media upload limits
- Verify file size < 16MB
- Check MP3 format compatibility

---

## Cost Estimates

### Per Voice Message

**Transcription (Soniox):**
- ~$0.01 per minute of audio

**AI Response (OpenAI):**
- ~$0.002 per conversation

**Text-to-Speech (Eleven Labs):**
- ~$0.30 per 1,000 characters
- Average response: ~$0.02

**Total per voice message: ~$0.03-0.05**

---

## Limitations

1. **Voice notes only** - Regular audio files work, but optimized for voice
2. **Urdu language** - Best results with clear Urdu speech
3. **Processing time** - Takes 3-10 seconds per voice message
4. **File size** - WhatsApp limit: 16MB, ~100 minutes
5. **API quotas** - Check your limits on each service

---

## Next Steps / Improvements

**Want to enhance the bot?**

1. **Add more languages** - Configure Soniox for other languages
2. **Better voice selection** - Try different Eleven Labs voices
3. **Faster processing** - Use streaming APIs
4. **Better error handling** - Retry failed transcriptions
5. **Usage analytics** - Track processing times and costs
6. **Voice customization** - Let users choose voice preferences

---

## Testing Checklist

- ☐ Bot server running
- ☐ ngrok tunnel active
- ☐ Webhook configured in Meta
- ☐ Send text message (works?)
- ☐ Send voice note in Urdu
- ☐ Receive voice response
- ☐ Check conversation context maintained
- ☐ Test error handling (send image)

---

## Files Modified

- [whatsapp-bot.js](whatsapp-bot.js) - Added voice message handling
- [.env](.env) - Added Soniox and Eleven Labs API keys
- [package.json](package.json) - Added audio processing dependencies

---

## Need Help?

**Bot not responding to voice?**
1. Check terminal logs for errors
2. Verify all API keys are correct
3. Test APIs independently
4. Ensure temp directory is writable

**Questions about APIs?**
- Soniox: https://soniox.com/docs
- Eleven Labs: https://elevenlabs.io/docs
- WhatsApp: https://developers.facebook.com/docs/whatsapp

---

## Demo

Record and send:
> "ہیلو، کیا تم مجھ سے اردو میں بات کر سکتے ہو؟"

You should receive a voice response!
