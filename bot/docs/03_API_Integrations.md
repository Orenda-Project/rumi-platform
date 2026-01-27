# API Integrations

This document provides detailed reference for all external API integrations used by the Digital Coach.

---

## WhatsApp Cloud API

**Provider**: Meta Business Platform
**Purpose**: Send/receive messages via WhatsApp Business
**Authentication**: Bearer token (permanent access token)
**Base URL**: `https://graph.facebook.com/v21.0`
**Documentation**: https://developers.facebook.com/docs/whatsapp/cloud-api

### Endpoints Used

#### 1. Send Message (POST)

```
POST /{PHONE_NUMBER_ID}/messages
Authorization: Bearer {WHATSAPP_TOKEN}
Content-Type: application/json
```

**Text Message**:
```json
{
  "messaging_product": "whatsapp",
  "to": "923001234567",
  "text": { "body": "Your message here" }
}
```

**Voice/Audio Message**:
```json
{
  "messaging_product": "whatsapp",
  "to": "923001234567",
  "type": "audio",
  "audio": { "id": "media_id_from_upload" }
}
```

**Document/PDF Message**:
```json
{
  "messaging_product": "whatsapp",
  "to": "923001234567",
  "type": "document",
  "document": {
    "id": "media_id_from_upload",
    "filename": "Lesson_Plan.pdf"
  }
}
```

#### 2. Mark as Read (POST)

```
POST /{PHONE_NUMBER_ID}/messages
```

```json
{
  "messaging_product": "whatsapp",
  "status": "read",
  "message_id": "wamid.HBgMOTIz..."
}
```

#### 3. Upload Media (POST)

```
POST /{PHONE_NUMBER_ID}/media
Content-Type: multipart/form-data
```

Form fields:
- `file`: Binary file data
- `messaging_product`: "whatsapp"
- `type`: "audio" | "document"

Response:
```json
{
  "id": "1234567890"
}
```

#### 4. Get Media URL (GET)

```
GET /{MEDIA_ID}
Authorization: Bearer {WHATSAPP_TOKEN}
```

Response:
```json
{
  "url": "https://lookaside.fbsbx.com/whatsapp_business/...",
  "mime_type": "audio/ogg; codecs=opus",
  "file_size": 98765
}
```

#### 5. Download Media (GET)

```
GET {url_from_previous_step}
Authorization: Bearer {WHATSAPP_TOKEN}
```

Returns binary file data.

### Webhook Events

**Inbound Message Event**:
```json
{
  "entry": [{
    "id": "123456789",
    "changes": [{
      "value": {
        "messaging_product": "whatsapp",
        "metadata": {
          "display_phone_number": "15551234567",
          "phone_number_id": "123456789012345"
        },
        "contacts": [{
          "profile": { "name": "Teacher Name" },
          "wa_id": "923001234567"
        }],
        "messages": [{
          "from": "923001234567",
          "id": "wamid.HBgMOTIz...",
          "timestamp": "1699564800",
          "type": "text",
          "text": { "body": "How to teach fractions?" }
        }]
      },
      "field": "messages"
    }]
  }]
}
```

**Voice Message Event**:
```json
{
  "messages": [{
    "from": "923001234567",
    "id": "wamid.HBgMOTIz...",
    "timestamp": "1699564800",
    "type": "audio",
    "audio": {
      "mime_type": "audio/ogg; codecs=opus",
      "sha256": "abc123...",
      "id": "media_id_here",
      "voice": true
    }
  }]
}
```

### Rate Limits

- **Tier 1** (default): 1,000 business-initiated conversations per 24 hours
- **Burst**: 80 messages per second
- **Cloud API**: No on-premise restrictions

### Error Codes

| Code | Error | Meaning | Solution |
|------|-------|---------|----------|
| 401 | Unauthorized | Invalid/expired token | Regenerate permanent token |
| 403 | Forbidden | Phone number not verified | Verify in Meta Console |
| 404 | Not Found | Invalid phone number ID | Check PHONE_NUMBER_ID |
| 429 | Too Many Requests | Rate limit exceeded | Implement backoff |
| 500 | Internal Server Error | WhatsApp API issue | Retry after delay |

### Setup

1. Go to https://developers.facebook.com/apps
2. Create app → Add WhatsApp product
3. Get temporary access token → Generate permanent token (see [04_Development_Setup.md](04_Development_Setup.md))
4. Copy Phone Number ID from dashboard

---

## OpenAI API

**Provider**: OpenAI
**Purpose**: Natural language processing and voice generation
**Authentication**: API key (Bearer token)
**Base URL**: `https://api.openai.com/v1`
**Documentation**: https://platform.openai.com/docs

### Models Used

#### 1. GPT-4 (Text Completion)

**Endpoint**: `POST /chat/completions`

**Request**:
```javascript
const completion = await openai.chat.completions.create({
  model: "gpt-4",
  messages: [
    {
      role: "system",
      content: "You are a helpful teaching coach for teachers in Pakistan. Provide practical, classroom-ready advice in simple language. Focus on multigrade, low-resource contexts. Keep responses concise and actionable."
    },
    { role: "user", content: "How to teach fractions?" },
    { role: "assistant", content: "Here's an approach..." },
    { role: "user", content: "What about visual aids?" }
  ],
  temperature: 0.7,
  max_tokens: 1000
});
```

**Response**:
```json
{
  "id": "chatcmpl-123",
  "object": "chat.completion",
  "created": 1699564800,
  "model": "gpt-4-0613",
  "choices": [{
    "index": 0,
    "message": {
      "role": "assistant",
      "content": "For visual aids with fractions..."
    },
    "finish_reason": "stop"
  }],
  "usage": {
    "prompt_tokens": 150,
    "completion_tokens": 200,
    "total_tokens": 350
  }
}
```

**System Prompt** (Current):
```
You are a helpful teaching coach for teachers in Pakistan.
Provide practical, classroom-ready advice in simple language.
Focus on multigrade, low-resource contexts where one teacher
manages multiple grade levels simultaneously. Keep responses
concise (2-3 paragraphs max) and actionable. Use Urdu terms
when appropriate (e.g., 'ustaad', 'taleem', 'class').
```

**Parameters**:
- `temperature`: 0.7 (balanced creativity)
- `max_tokens`: 1000 (prevents runaway responses)
- `top_p`: 1.0 (default)
- `frequency_penalty`: 0 (default)
- `presence_penalty`: 0 (default)

#### 2. Text-to-Speech (TTS-1)

**Endpoint**: `POST /audio/speech`

**Request**:
```javascript
const mp3 = await openai.audio.speech.create({
  model: "tts-1",
  voice: "nova",  // Female, clear enunciation
  input: responseText,
  speed: 1.0
});
```

**Voice Options**:
- `alloy`: Neutral, balanced
- `echo`: Male, warm
- `fable`: Male, expressive
- `nova`: Female, clear (current choice)
- `onyx`: Male, deep
- `shimmer`: Female, soft

**Output Format**: MP3 (binary stream)

### Rate Limits

| Model | Limit | Tier |
|-------|-------|------|
| GPT-4 | 10,000 tokens/min | Paid Tier 1 |
| GPT-3.5-Turbo | 60,000 tokens/min | Paid Tier 1 |
| TTS-1 | 50 requests/min | Default |

### Pricing

| Service | Input | Output |
|---------|-------|--------|
| GPT-4 | $0.03 per 1K tokens | $0.06 per 1K tokens |
| GPT-3.5-Turbo | $0.001 per 1K tokens | $0.002 per 1K tokens |
| TTS-1 | — | $0.015 per 1K characters |

### Error Codes

| Code | Error | Meaning | Solution |
|------|-------|---------|----------|
| 401 | Invalid API Key | Wrong or expired key | Regenerate at platform.openai.com |
| 429 | Rate Limit | Too many requests | Implement exponential backoff |
| 500 | Server Error | OpenAI service issue | Retry with backoff |
| 503 | Overloaded | High traffic | Retry after delay |

### Setup

1. Go to https://platform.openai.com/api-keys
2. Create new secret key
3. Copy immediately (only shown once)
4. Add to `.env` as `OPENAI_API_KEY`

---

## Soniox Speech-to-Text API

**Provider**: Soniox
**Purpose**: Transcribe Urdu and English voice messages
**Authentication**: API key (Bearer token)
**Base URL**: `https://api.soniox.com/v1`
**Documentation**: https://soniox.com/docs

### Workflow

#### 1. Upload Audio File

```
POST /v1/files
Authorization: Bearer {SONIOX_API_KEY}
Content-Type: multipart/form-data
```

Form field: `file` (WAV file, 16kHz, mono)

**Response**:
```json
{
  "id": "e4234ffe-5e60-4272-9e87-3b8f69dc667f",
  "filename": "audio_1761992440922.wav",
  "size_bytes": 80510,
  "audio_duration_ms": 4093,
  "created_at": "2025-11-01T10:20:41.495Z"
}
```

#### 2. Create Transcription

```
POST /v1/transcriptions
Authorization: Bearer {SONIOX_API_KEY}
Content-Type: application/json
```

**Request Body**:
```json
{
  "file_id": "e4234ffe-5e60-4272-9e87-3b8f69dc667f",
  "model": "stt-async-v3",
  "language_hints": ["en", "ur"]
}
```

**Response**:
```json
{
  "id": "8adc2fc2-423a-4d20-898f-097d32987379",
  "status": "queued",
  "created_at": "2025-11-01T10:20:41.495Z",
  "model": "stt-async-v3",
  "language_hints": ["en", "ur"]
}
```

#### 3. Poll Status

```
GET /v1/transcriptions/{transcription_id}
Authorization: Bearer {SONIOX_API_KEY}
```

**Response (Queued)**:
```json
{
  "id": "8adc2fc2-423a-4d20-898f-097d32987379",
  "status": "queued",
  "audio_duration_ms": 4093,
  "error_type": null,
  "error_message": null
}
```

**Response (Processing)**:
```json
{
  "id": "8adc2fc2-423a-4d20-898f-097d32987379",
  "status": "processing",
  "audio_duration_ms": 4093
}
```

**Response (Completed)**:
```json
{
  "id": "8adc2fc2-423a-4d20-898f-097d32987379",
  "status": "completed",
  "audio_duration_ms": 4093,
  "created_at": "2025-11-01T10:20:41.495Z",
  "completed_at": "2025-11-01T10:20:48.123Z"
}
```

#### 4. Get Transcript

```
GET /v1/transcriptions/{transcription_id}/transcript
Authorization: Bearer {SONIOX_API_KEY}
```

**Response**:
```json
{
  "text": "یہ ایک ٹیسٹ میسج ہے this is a test message"
}
```

#### 5. Cleanup (DELETE)

```
DELETE /v1/transcriptions/{transcription_id}
DELETE /v1/files/{file_id}
```

⚠️ **Critical**: Always delete resources after use (100-file limit per account).

### Models

- **stt-async-v3**: Latest, best accuracy (primary)
- **stt-async-v2**: Older, more stable (fallback)

### Current Configuration

```javascript
{
  file_id: fileId,
  model: "stt-async-v3",
  language_hints: ["en", "ur"]
  // Note: enable_language_identification and context are DISABLED
  // (cause queue hang - see Known Issues)
}
```

### Timeout Configuration

- **V3**: 180 seconds (3 minutes)
- **V2**: 120 seconds (2 minutes)
- **Poll interval**: 1 second
- **Logging**: Every 10 attempts

### Disabled Features

⚠️ **Currently Not Used** (cause v3 to hang in "queued"):

```javascript
// DO NOT USE until stable
{
  enable_language_identification: true,  // Auto-detect per-token
  context: {  // Educational domain context
    domain: "education",
    topic: "teaching, lesson plans...",
    text_context: "Educational discussions..."
  }
}
```

See [06_Known_Issues.md](06_Known_Issues.md#advanced-soniox-features-cause-queue-hang).

### Pricing

- $0.10 per hour of audio (async)
- $0.12 per hour (real-time streaming)

### Error Codes

| Code | Error | Meaning | Solution |
|------|-------|---------|----------|
| 400 | Bad Request | Invalid parameters | Check request body |
| 401 | Unauthorized | Invalid API key | Verify at console.soniox.com |
| 402 | Payment Required | No payment method | Add card to account |
| 429 | Too Many Requests | Rate limit | Implement backoff |
| 500 | Internal Error | Soniox service issue | Contact support@soniox.com |

### Setup

1. Go to https://console.soniox.com
2. Sign up / Login
3. **Add payment method** (required as of Oct 27, 2025)
4. Navigate to API Keys section
5. Create new key

---

## Gamma AI API

**Provider**: Gamma (gamma.app)
**Purpose**: Generate interactive presentations and documents
**Authentication**: API key (X-API-KEY header)
**Base URL**: `https://public-api.gamma.app`
**API Version**: v1.0 (migrated from v0.2 on Jan 25, 2026 - v0.2 sunset Jan 16, 2026)
**Documentation**: https://developers.gamma.app/docs

### Workflow

#### 1. Create Generation Request

```
POST /v1.0/generations
X-API-KEY: {GAMMA_API_KEY}
Content-Type: application/json
```

**Request Body**:
```json
{
  "inputText": "Create a lesson plan for teaching photosynthesis to Class 5 students in Pakistan. Include: learning objectives, materials needed, step-by-step activities with timing, assessment strategies, and differentiation tips for multigrade classrooms.",
  "format": "document",
  "textMode": "generate",
  "numCards": 7,
  "exportAs": "pdf",
  "textOptions": {
    "language": "en",
    "audience": "teachers and students",
    "tone": "educational and engaging",
    "amount": "extensive"
  },
  "imageOptions": {
    "source": "webAllImages",
    "style": "photorealistic, professional, educational"
  }
}
```

**Response**:
```json
{
  "generationId": "abc123xyz"
}
```

#### 2. Poll Status (5-second intervals recommended)

```
GET /v1.0/generations/{generationId}
X-API-KEY: {GAMMA_API_KEY}
```

**Response (Processing)**:
```json
{
  "generationId": "abc123xyz",
  "status": "processing"
}
```

**Response (Completed)**:
```json
{
  "generationId": "abc123xyz",
  "status": "completed",
  "gammaUrl": "https://gamma.app/docs/abc123xyz",
  "credits": {
    "deducted": 150,
    "remaining": 3000
  }
}
```

#### 3. Download PDF

```
GET {pdfUrl}
```

Returns binary PDF file.

### Important Notes

❌ **`layout` parameter NOT supported** in v0.2 (causes 400 error)
✅ Format auto-detected (A4/Letter handled by Gamma)

**Formats**:
- `"document"`: 2-page structured document
- `"presentation"`: 5-slide presentation

**Cards/Slides**:
- Documents: `numCards: 2`
- Presentations: `numCards: 5`

### Generation Time

- **Typical**: 30-90 seconds
- **Maximum**: 5 minutes (timeout)

### Pricing

Unknown (not publicly documented). Contact Gamma for pricing.

### Setup

1. Go to https://gamma.app
2. Sign up / Login
3. Access account settings
4. Generate API key

---

## FFmpeg (Local Audio Processing)

**Provider**: Local binary (included via npm)
**Purpose**: Convert WhatsApp audio (OGG Opus) to WAV (16kHz mono) for Soniox
**Package**: `fluent-ffmpeg` + `@ffmpeg-installer/ffmpeg`

### Usage

```javascript
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
ffmpeg.setFfmpegPath(ffmpegPath);

ffmpeg(inputPath)
  .toFormat('wav')
  .audioFrequency(16000)  // 16kHz
  .audioChannels(1)       // Mono
  .on('end', () => console.log('Conversion complete'))
  .on('error', (err) => console.error('Conversion error:', err))
  .save(outputPath);
```

### Configuration

- **Input**: OGG Opus (WhatsApp default)
- **Output**: WAV, 16kHz, mono
- **Why**: Soniox requires WAV format for best accuracy

### Performance

- **~10 second audio**: 500-1,500ms conversion time
- **CPU**: Minimal impact (< 10% on 1 vCPU)

---

**Next**: See [04_Development_Setup.md](04_Development_Setup.md) for getting started with development.
