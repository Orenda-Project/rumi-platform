# Overview and Features

## What Is Digital Coach?

The Digital Coach is an AI-powered WhatsApp chatbot designed to support teachers in Pakistan with real-time professional development. It provides 24/7 accessible coaching, lesson planning, and pedagogical guidance—especially critical for teachers in underserved, multigrade, and rural contexts where traditional coaching is limited or unavailable.

## Core Features

### 1. Text Chat with AI (OpenAI GPT-4)

**What it does**: Teachers send text questions via WhatsApp and receive contextual teaching advice powered by GPT-4.

**Key Capabilities**:
- Maintains conversation history (10 messages per user)
- System prompt optimized for Pakistani education context
- Focuses on multigrade, low-resource classroom strategies
- Provides practical, classroom-ready advice

**Example Interactions**:

```
Teacher: "How do I teach photosynthesis to Class 5?"

Bot: "Here's a hands-on approach for photosynthesis:

Materials: Green leaves, clear plastic bags, sunny window

Activity (30 mins):
1. Have students place leaves in bags and seal them
2. Put bags in sunlight for 2-3 hours
3. Observe water droplets forming inside

Discussion: Plants 'breathe' and make food from sunlight. The water shows this happening. Connect to why plants need sun and water.

For multigrade: Older students draw diagrams, younger students color plant parts."
```

**Limitations**:
- No image analysis (future feature)
- Conversation history lost on server restart
- Single-threaded conversations (no group chat support)

---

### 2. Voice Message Support (Soniox Transcription)

**What it does**: Teachers send voice messages in Urdu or English, and the bot transcribes them using Soniox Speech-to-Text, then responds with both text and voice.

**Languages Supported**:
- Urdu (ur)
- English (en)
- Code-switching (mixed Urdu/English)

**Technical Flow**:
1. WhatsApp sends voice message (OGG Opus format)
2. Bot downloads and converts to WAV (16kHz, mono) using FFmpeg
3. Uploads to Soniox API for transcription
4. Receives text transcript
5. Generates AI response via GPT-4
6. Converts response to voice using OpenAI TTS (nova voice)
7. Sends both text + voice message back to teacher

**Example**:

```
Teacher: [Voice message in Urdu]
"میں نے کلاس میں ریاضی پڑھانا شروع کیا لیکن بچے سمجھ نہیں رہے"
(I started teaching math in class but children aren't understanding)

Bot: [Text response]
"یہاں کچھ تجاویز ہیں جو آپ آزما سکتے ہیں..."
(Here are some suggestions you can try...)

Bot: [Voice message of same response]
```

**Current Configuration**:
- **Primary model**: `stt-async-v3` (180s timeout)
- **Fallback model**: `stt-async-v2` (120s timeout)
- **Language hints**: `['en', 'ur']`
- **Language identification**: ✅ Enabled for v3
- **Educational context**: ✅ Enabled for v3

**V3 Advanced Features** (re-enabled Nov 1, 2025):
```javascript
{
  enable_language_identification: true,  // Detect Urdu/English per token
  context: {
    domain: 'Education',
    topic: 'Teaching, lesson planning, classroom activities',
    organization: 'Taleemabad',
    text: 'Teachers in Pakistan discussing teaching methods...',
    terms: ['multigrade', 'ustaad', 'taleem', 'lesson plan', ...]
  }
}
```

**Benefits**:
- Improved accuracy for educational terminology
- Better Urdu/English code-switching detection
- Context-aware transcription for teaching discussions

---

### 3. Lesson Plan Generation (Gamma AI)

**What it does**: Teachers request lesson plans on specific topics, and the bot generates interactive presentations or documents via Gamma AI, returning a PDF.

**Trigger Keywords**:
- "Generate lesson plan"
- "Create presentation"
- "Make document"

**Output Formats**:
- **Document**: 2-page structured lesson plan
- **Presentation**: 5-slide interactive presentation
- **Export**: Always PDF (editable link in API response)

**Example Request**:

```
Teacher: "Generate lesson plan: Photosynthesis for Class 5"

Bot: [Processing message]
"I'm creating a lesson plan on 'Photosynthesis for Class 5'..."

Bot: [45 seconds later]
[Sends PDF document]
"Here's your lesson plan on Photosynthesis for Class 5! 📄"

PDF Contents:
- Title slide
- Learning objectives
- Materials needed
- Step-by-step activities with timing
- Assessment strategies
- Differentiation tips for multigrade classrooms
```

**Lesson Plan Structure**:

The bot enriches the topic with GPT-4 before sending to Gamma:
```
Input topic: "Photosynthesis for Class 5"

Enriched prompt sent to Gamma:
"Create a lesson plan for teaching photosynthesis to Class 5 students in Pakistan. Include:
- Clear learning objectives aligned with national curriculum
- List of materials needed (common, low-cost items)
- Step-by-step activities with timing (45-minute lesson)
- Assessment strategies (formative and summative)
- Differentiation tips for multigrade classrooms
- Visual aids and examples relevant to Pakistani context"
```

**Configuration**:
```json
{
  "format": "document",  // or "presentation"
  "textMode": "generate",
  "numCards": 2,  // or 5 for presentations
  "exportAs": "pdf",
  "textOptions": {
    "language": "en",
    "audience": "teachers and students",
    "tone": "educational and engaging"
  },
  "imageOptions": {
    "source": "webAllImages",
    "style": "photorealistic, professional, educational"
  }
}
```

**Important Note**: The `layout` parameter is **NOT supported** in Gamma API v0.2 and will cause a 400 Bad Request error.

**Generation Time**: Typically 30-90 seconds.

---

### 4. Message Read Receipts

**What it does**: Automatically marks messages as read when processed, providing user feedback and reducing notification clutter.

**WhatsApp API Call**:
```json
{
  "messaging_product": "whatsapp",
  "status": "read",
  "message_id": "wamid.HBgMOTIz..."
}
```

**User Experience**: Double blue checkmarks appear immediately when bot receives message.

---

## User Flows

### Text Message Flow

```
┌─────────────────────────────────────────────────────────┐
│                  Teacher sends text                     │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│          WhatsApp Cloud API → Webhook POST              │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│              Express.js server receives                 │
│           Extracts: userId, messageId, text             │
└────────────────────┬────────────────────────────────────┘
                     │
                     ├─→ Mark message as read
                     │
                     ├─→ Check if already processed (deduplication)
                     │
                     ├─→ Retrieve conversation history (in-memory)
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│              Send to OpenAI GPT-4                       │
│      System prompt: "You are a teaching coach..."       │
│      Messages: [history + new message]                  │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│           GPT-4 generates response                      │
│           (2-10 seconds typical)                        │
└────────────────────┬────────────────────────────────────┘
                     │
                     ├─→ Update conversation history
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│         Send response via WhatsApp API                  │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│            Teacher receives response                    │
└─────────────────────────────────────────────────────────┘

Total time: 3-15 seconds
```

---

### Voice Message Flow

```
┌─────────────────────────────────────────────────────────┐
│              Teacher sends voice message                │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│          WhatsApp Cloud API → Webhook POST              │
│            (includes media_id, mime_type)               │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│        Get media URL from WhatsApp Graph API            │
│      Download audio file (OGG Opus format)              │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│            Convert OGG → WAV using FFmpeg               │
│          Output: 16kHz, mono, temp/audio_*.wav          │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│           Upload WAV to Soniox API (v1/files)           │
│             Receive file_id                             │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│      Create transcription job (v1/transcriptions)       │
│      Model: stt-async-v3, language_hints: ['en','ur']   │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│         Poll status every 1 second (max 180s)           │
│   Status: queued → processing → completed               │
└────────────────────┬────────────────────────────────────┘
                     │
                     ├─→ If timeout: Try v2 fallback (max 120s)
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│         Retrieve transcript text from Soniox            │
│         Delete transcription and file (cleanup)         │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│              Process with GPT-4                         │
│         (same as text message flow)                     │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│        Generate voice response (OpenAI TTS)             │
│         Voice: nova (clear female voice)                │
│              Format: MP3                                │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│          Upload MP3 to WhatsApp (media upload)          │
│             Receive media_id                            │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│      Send text response + voice message                 │
│            Teacher receives both                        │
└─────────────────────────────────────────────────────────┘

Total time: 10-40 seconds (typical)
Up to 5 minutes if both v3 + v2 timeout (rare)
```

---

### Lesson Plan Generation Flow

```
┌─────────────────────────────────────────────────────────┐
│  Teacher: "Generate lesson plan: Photosynthesis"        │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│       Detect keywords: "lesson plan", "generate"        │
│          Extract topic: "Photosynthesis"                │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│     Send "processing" message to teacher                │
│  "I'm creating a lesson plan on 'Photosynthesis'..."    │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│     Enrich topic with GPT-4 (add objectives, etc.)      │
│     Generate detailed prompt for Gamma                  │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│      Send to Gamma API v0.2 (POST /generate)            │
│      Receive generation_id                              │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│     Poll Gamma status every 5 seconds (max 5 min)       │
│     Status: processing → completed                      │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│         Retrieve PDF URL from Gamma response            │
│              Download PDF file                          │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│      Upload PDF to WhatsApp (media upload)              │
│             Receive media_id                            │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│         Send document message to teacher                │
│   Filename: "Lesson_Plan_Photosynthesis.pdf"           │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│           Teacher receives lesson plan PDF              │
└─────────────────────────────────────────────────────────┘

Total time: 30-90 seconds typical
Up to 5 minutes if Gamma is slow
```

---

## Current Limitations

### What the Bot Cannot Do (Yet)

1. **Image Analysis**: Cannot analyze photos of classroom activities, student work, or teaching materials
   - Future: GPT-4 Vision integration planned

2. **Document Upload**: Cannot process uploaded documents (PDFs, Word files)
   - Future: Document parsing planned

3. **Persistent Conversation History**: History lost on server restart
   - Current: In-memory storage
   - Future: Redis or database integration planned

4. **Multi-User Conversations**: No group chat support
   - Current: One-to-one only
   - Future: May add group facilitation

5. **Admin Dashboard**: No web UI for monitoring, only logs
   - Current: Railway logs + manual monitoring
   - Future: Dashboard for usage analytics

6. **Custom Voice Training**: Uses default OpenAI voices
   - Current: nova voice (female, clear)
   - Future: May explore custom voice cloning

7. **Offline Support**: Requires internet for all features
   - Limitation: WhatsApp Cloud API requires connectivity

---

## Feature Comparison

| Feature | Text Chat | Voice Messages | Lesson Plans |
|---------|-----------|----------------|--------------|
| **Response Time** | 3-15s | 10-40s | 30-90s |
| **Languages** | Urdu, English | Urdu, English | English only |
| **Output Format** | Text | Text + Voice | PDF |
| **Conversation Context** | Yes (10 msgs) | Yes (10 msgs) | No |
| **Cost per Use** | ~$0.02 | ~$0.03 | ~$0.25 est. |
| **Reliability** | 99%+ | 95%+ (v2 fallback) | 98%+ |
| **Primary Use Case** | Quick questions | Hands-free, detailed | Planning, prep |

---

## User Experience Considerations

### When Teachers Prefer Text
- Quick, factual questions ("What is a verb?")
- Following up on previous conversation
- Classroom management tips
- Low bandwidth / poor connectivity

### When Teachers Prefer Voice
- Complex, nuanced questions
- Explaining classroom situations
- Hands-free while teaching
- More natural for Urdu speakers

### When Teachers Request Lesson Plans
- Planning next week's lessons
- Need structured, detailed guidance
- Want visual aids and activities
- Preparing for observations or evaluations

---

## Success Metrics

**Current Targets** (November 2025):
- Text response time: <15 seconds (90th percentile)
- Voice response time: <30 seconds (90th percentile)
- Lesson plan generation: <2 minutes (90th percentile)
- Error rate: <1% of all messages
- Uptime: >99% monthly

**Measurement**:
- Railway logs for timing analysis
- Error tracking via log aggregation
- User satisfaction via manual feedback (no automated surveys yet)

---

**Next**: See [02_Technical_Architecture.md](02_Technical_Architecture.md) for system design details.
