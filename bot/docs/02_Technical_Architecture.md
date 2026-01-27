# Technical Architecture

## System Overview

The Rumi is a hybrid architecture combining synchronous webhook handling with asynchronous background job processing for long-running operations.

```
┌──────────────────────────────────────────────────────────┐
│                   WhatsApp Cloud API                     │
│          (Meta Business Platform - Webhooks)             │
└────────────────────┬─────────────────────────────────────┘
                     │ HTTPS POST
                     │ (JSON payloads)
                     ▼
┌──────────────────────────────────────────────────────────┐
│              Express.js Web Server                       │
│              (Node.js 18+ / Railway)                     │
│                                                          │
│  Routes:                                                 │
│  - GET  /           → Health check                      │
│  - GET  /webhook    → Webhook verification              │
│  - POST /webhook    → Process messages                  │
│  - POST /clear-history/:userId → Clear conversation     │
└──────────┬─────────────────────┬─────────────────────────┘
           │                     │
           │    ┌────────────────┼────────────────┐
           │    │                │                │
           ▼    ▼                ▼                ▼
    ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐
    │ OpenAI   │  │ Soniox   │  │ Gamma AI │  │ FFmpeg   │
    │ GPT-4    │  │ STT API  │  │ Generator│  │ (local)  │
    │ + TTS    │  │          │  │          │  │          │
    └──────────┘  └──────────┘  └──────────┘  └──────────┘
           │
           │ For long-running coaching operations:
           ▼
┌──────────────────────────────────────────────────────────┐
│            Supabase PostgreSQL (Job Queue)               │
│         coaching_jobs table with RPC functions           │
│    - Distributed locking (SELECT FOR UPDATE SKIP LOCKED) │
│    - Exponential backoff retry logic                     │
└────────────────────┬─────────────────────────────────────┘
                     │ Poll for jobs
                     ▼
┌──────────────────────────────────────────────────────────┐
│         Background Worker (coaching-processor.js)        │
│              (Node.js 18+ / Railway)                     │
│                                                          │
│  - Processes transcription jobs (15-30 min)             │
│  - Processes pedagogical analysis (GPT-5 mini)          │
│  - Generates reports with charts (PDFs)                 │
│  - Concurrency: 3 jobs per worker                       │
│  - Health endpoint: /health                             │
└──────────────────────────────────────────────────────────┘
```

---

## Tech Stack

### Runtime Environment

**Platform**: Node.js 18+
- CommonJS module system (`require`, `module.exports`)
- Single-threaded event loop
- Async/await for concurrency

**Framework**: Express.js 5.1.0
- Minimal web server framework
- Body parsing middleware
- Route handling

**Hosting**: Railway
- Auto-deploy from GitHub (main branch)
- Environment variable management
- Auto-restart on crashes
- Built-in HTTPS and domain

---

## Core Dependencies

```json
{
  "express": "^5.1.0",              // Web server
  "axios": "^1.13.1",               // HTTP client for APIs
  "body-parser": "^2.2.0",          // Parse JSON webhook payloads
  "dotenv": "^17.2.3",              // Load .env variables
  "openai": "^6.7.0",               // OpenAI SDK (GPT-4, TTS)
  "form-data": "^4.0.4",            // Multipart uploads (Soniox)
  "fluent-ffmpeg": "^2.1.3",        // FFmpeg wrapper for audio
  "@ffmpeg-installer/ffmpeg": "^1.1.0",  // FFmpeg binaries
  "pdfkit": "^0.17.2",              // PDF generation/manipulation
  "sharp": "^0.34.4",               // Image processing
  "ngrok": "^5.0.0-beta.2"          // Local tunnel (dev only)
}
```

**Why these choices**:
- **Express**: Minimal, widely supported, simple routing
- **Axios**: Better error handling than native fetch
- **dotenv**: Industry standard for env vars
- **OpenAI SDK**: Official, well-maintained
- **fluent-ffmpeg**: Simplifies FFmpeg command building
- **ngrok**: Easy local webhook testing

---

## File Structure

```
rumi-platform/
│
├── whatsapp-bot.js              # Main application (1,500 lines)
├── package.json                 # Dependencies and scripts
├── .env                         # Environment variables (SECRET)
├── .gitignore                   # Git exclusions
│
├── docs/                        # Knowledge base (this directory)
│   ├── Skill.md                 # Master routing document
│   ├── 01_Overview_and_Features.md
│   ├── 02_Technical_Architecture.md
│   ├── 03_API_Integrations.md
│   ├── 04_Development_Setup.md
│   ├── 05_Deployment_Operations.md
│   ├── 06_Known_Issues.md
│   ├── 07_Extending_the_Bot.md
│   └── README.md
│
├── README.md                    # Basic project overview
├── SETUP-GUIDE.md               # Detailed setup walkthrough
├── SIMPLE-SETUP.md              # Quick start guide
├── QUICK-START-CHECKLIST.md     # Setup verification
├── VOICE-CHAT-GUIDE.md          # Voice feature docs
├── DEBUG-VOICE-MESSAGES.md      # Voice troubleshooting
├── TESTING-WITHOUT-WEBHOOKS.md  # Local testing
│
├── test-whatsapp.js             # Credential validation
├── test-send-message.js         # Send test messages
├── local-chat-test.js           # Local chat simulation
├── simulate-webhook.js          # Webhook payload testing
│
├── check-soniox-status.js       # Soniox diagnostics
├── cleanup-soniox.js            # Soniox resource cleanup
│
├── workers/                     # Background workers
│   └── coaching-processor.js    # Classroom coaching job processor
│
├── shared/                      # Shared code for web server and workers
│   ├── config/
│   │   └── supabase.js         # Supabase client configuration
│   ├── services/
│   │   ├── coaching.service.js # Classroom coaching orchestration
│   │   ├── audio.service.js    # Audio transcription (Soniox)
│   │   ├── gpt5-mini.service.js # Pedagogical analysis (GPT-5)
│   │   ├── whatsapp.service.js # WhatsApp API wrapper
│   │   ├── chart.service.js    # Chart generation
│   │   └── pdf.service.js      # PDF report generation
│   ├── storage/
│   │   └── r2.js               # Cloudflare R2 storage
│   ├── database/
│   │   ├── schema.sql          # Database schema
│   │   └── migrations/         # Database migrations
│   │       ├── 003_classroom_coaching.sql
│   │       ├── add-audio-id-column.sql
│   │       └── create-coaching-jobs-table.sql
│   └── utils/
│       ├── logger.js           # Logging utility
│       └── constants.js        # Shared constants
│
├── temp/                        # Temporary audio files
│   └── audio_*.wav              # Auto-deleted after processing
│
└── bot.log                      # Application logs (auto-created)
```

---

## Database Architecture

### Supabase (PostgreSQL) Schema

The application uses Supabase (managed PostgreSQL) for persistent data storage.

#### Core Tables

**users** - Teacher registration and profile
```sql
- id (UUID, PK)
- phone_number (VARCHAR, UNIQUE)
- first_name, last_name
- grade, subject
- registration_completed (BOOLEAN)
- created_at, updated_at
```

**chat_sessions** - Conversation context tracking
```sql
- id (UUID, PK)
- user_id (UUID, FK)
- session_type (text, voice, mixed)
- created_at, ended_at
```

**conversations** - Message history
```sql
- id (UUID, PK)
- user_id (UUID, FK)
- session_id (UUID, FK)
- role (user, assistant, system)
- content (TEXT)
- input_language, output_language
- created_at
```

**coaching_sessions** - Classroom observation sessions
```sql
- id (UUID, PK)
- user_id (UUID, FK)
- session_id (UUID, FK)
- audio_id (VARCHAR) -- WhatsApp media ID
- audio_url (VARCHAR) -- R2 storage URL
- audio_duration_seconds (INTEGER)
- transcript_text (TEXT)
- diarization_data (JSONB) -- Speaker identification
- analysis_data (JSONB) -- Pedagogical analysis
- conversation_state (JSONB) -- Reflective conversation state
- report_pdf_url, voice_debrief_url (VARCHAR)
- status (VARCHAR) -- Workflow state
- transcription_cost, analysis_cost (DECIMAL)
- created_at, completed_at (TIMESTAMPTZ)
```

**coaching_jobs** - Background job queue
```sql
- id (UUID, PK)
- coaching_session_id (UUID, FK)
- job_type (TEXT) -- transcription, analysis, report_generation
- payload (JSONB) -- Job-specific data
- status (TEXT) -- pending, processing, completed, failed
- attempts (INTEGER) -- Retry counter
- max_attempts (INTEGER, default 3)
- worker_id (TEXT) -- Worker instance identifier
- error_message, error_stack (TEXT)
- scheduled_for (TIMESTAMPTZ) -- For exponential backoff
- created_at, started_at, completed_at (TIMESTAMPTZ)
```

#### Database Indexes

Performance-critical indexes for scalability:

```sql
-- Coaching sessions
CREATE INDEX idx_coaching_sessions_user_id ON coaching_sessions(user_id);
CREATE INDEX idx_coaching_sessions_status ON coaching_sessions(status);
CREATE INDEX idx_coaching_sessions_audio_id ON coaching_sessions(audio_id);

-- Job queue (CRITICAL for worker performance)
CREATE INDEX idx_coaching_jobs_status ON coaching_jobs(status);
CREATE INDEX idx_coaching_jobs_scheduled ON coaching_jobs(scheduled_for)
  WHERE status = 'pending';
CREATE INDEX idx_coaching_jobs_session ON coaching_jobs(coaching_session_id);
```

#### RPC Functions (PostgreSQL Stored Procedures)

**queue_coaching_job(p_session_id, p_job_type, p_payload)**
- Inserts a new job into the queue
- Returns job UUID
- Called by CoachingService when queueing background work

**claim_next_coaching_job(p_worker_id, p_max_attempts)**
- Atomically claims the next available job
- Uses `SELECT FOR UPDATE SKIP LOCKED` for distributed locking
- Prevents race conditions between multiple worker instances
- Returns job data or NULL if no jobs available

**complete_coaching_job(p_job_id)**
- Marks job as completed
- Sets completion timestamp

**fail_coaching_job(p_job_id, p_error_message, p_error_stack, p_retry_delay_seconds)**
- Handles job failure with exponential backoff
- Retries job if attempts < max_attempts
- Marks as permanently failed if max attempts reached
- Calculates retry delay: 60s, 120s, 240s (exponential)

**get_pending_jobs_count()**
- Returns count of pending jobs in queue
- Used for monitoring and health checks

---

## Background Job Processing

### Architecture Overview

The classroom coaching feature uses a **producer-consumer pattern** with a PostgreSQL-backed job queue:

```
[Web Server] → [Queue Job] → [coaching_jobs table] ← [Claim Job] ← [Worker Process]
                                                    ↓
                                            [Process Job]
                                                    ↓
                                            [Complete/Fail]
```

### Worker Architecture

**Deployment**: Separate Railway service (`coaching-processor.js`)

**Key Features**:
- Concurrency control (3 jobs per worker instance)
- Distributed locking (SELECT FOR UPDATE SKIP LOCKED)
- Exponential backoff retry (60s, 120s, 240s)
- Graceful shutdown handling
- Health check endpoint (/health, /ready, /stats)

**Worker Lifecycle**:
```javascript
1. Worker starts → Registers worker ID (worker-{hostname}-{pid})
2. Poll loop:
   a. Check capacity (activeJobs < CONCURRENCY_PER_WORKER)
   b. Claim next job from queue (atomic operation)
   c. Execute job based on job_type
   d. Mark as completed or failed
   e. Sleep 1 second
3. On SIGTERM/SIGINT → Graceful shutdown (wait for active jobs)
```

### Job Types

**transcription** (15-30 minutes)
- Download audio from WhatsApp media ID
- Upload to R2 storage
- Transcribe with Soniox (includes speaker diarization)
- Store transcript and diarization data
- Ask user for lesson plan

**analysis** (2-5 minutes)
- Run GPT-5 mini pedagogical analysis
- Extract strengths, growth opportunities, scores
- Store analysis data in JSONB
- Start reflective conversation

**report_generation** (3-7 minutes)
- Generate charts from analysis data
- Create PDF report with PDFKit
- Generate voice debrief with TTS
- Upload both to R2 storage
- Send to user via WhatsApp

### Retry Logic

**Exponential Backoff**:
```
Attempt 1: Immediate (scheduled_for = NOW())
Attempt 2: 60 seconds delay (if fails)
Attempt 3: 120 seconds delay (if fails again)
Attempt 4+: Marked as permanently failed
```

**Error Handling**:
- Transient errors (network timeouts) → Retry
- Permanent errors (invalid data) → Fail immediately
- Worker crash → Job remains "processing", reclaimed after timeout
- Database deadlock → Automatically handled by SKIP LOCKED

### Distributed Locking

**Problem**: Multiple workers shouldn't claim the same job

**Solution**: PostgreSQL's `SELECT FOR UPDATE SKIP LOCKED`

```sql
SELECT id FROM coaching_jobs
WHERE status = 'pending' AND scheduled_for <= NOW()
ORDER BY created_at ASC
FOR UPDATE SKIP LOCKED  -- Skip already-locked rows
LIMIT 1;
```

**Benefits**:
- No race conditions
- Works across multiple Railway instances
- No external lock service (Redis) needed
- Atomic at database level

### Scaling Workers

**Current**: 1 Railway instance, 3 concurrent jobs

**Scaling Strategy**:
```
Users    | Workers | Concurrency | Total Capacity
---------|---------|-------------|---------------
100      | 1       | 3           | 3 jobs/sec
500      | 2       | 3           | 6 jobs/sec
1,000    | 3       | 3           | 9 jobs/sec
5,000    | 5       | 5           | 25 jobs/sec
```

**To scale**: Add more Railway services running `coaching-processor.js`

---

## Data Flow

### Message Processing Pipeline

```
[Webhook Event] → [Deduplication] → [Type Detection] → [Handler]
                                                         ├─→ Text Handler
                                                         ├─→ Voice Handler
                                                         └─→ Lesson Plan Handler
```

### State Management

#### 1. Conversation History (In-Memory)

```javascript
const conversationHistories = {
  "923001234567": [
    { role: "system", content: "You are a teaching coach..." },
    { role: "user", content: "How to teach fractions?" },
    { role: "assistant", content: "Here's an approach..." },
    // ... up to 10 messages per user
  ]
}
```

**Characteristics**:
- ✅ Fast access (no database latency)
- ✅ Simple implementation
- ❌ Lost on server restart
- ❌ No analytics or long-term tracking
- ❌ Limited to Node.js memory (~1-2GB)

**Capacity**:
- ~10 messages × 500 tokens = 5,000 tokens per user
- 100 users × 5,000 tokens = 500K tokens ≈ 1MB memory
- Scales to ~1,000 active users with 2GB memory

**Future Enhancement**: See [07_Extending_the_Bot.md](07_Extending_the_Bot.md#add-persistent-conversation-storage) for Redis integration.

---

#### 2. Message Deduplication (Set)

```javascript
const processedMessageIds = new Set([
  "wamid.HBgMOTIzMzY1NzA5NDEzFQIAEhgUM0I3...",
  // ... prevents duplicate processing
])
```

**Why needed**: WhatsApp may send duplicate webhook events (retries, network issues).

**Lifecycle**: Grows indefinitely (minor memory leak for long-running deployments).

**Future Enhancement**: Use Redis with TTL (24-hour expiry).

---

#### 3. Temporary Files (Filesystem)

```javascript
const TEMP_DIR = path.join(__dirname, 'temp');
// Files: audio_1761992440922.wav
// Lifecycle: Created → Processed → Deleted
```

**Cleanup Strategy**:
- Delete immediately after successful processing
- Delete in `catch` block on error
- Railway ephemeral storage (cleared on restart)

**Risk**: File accumulation if errors prevent cleanup.

**Mitigation**: Manual cleanup script or cron job to delete old temp files.

---

## Request/Response Cycles

### Text Message Cycle

**Latency Breakdown**:
```
Webhook received          0ms
├─ Parse & validate       +10ms
├─ Check deduplication    +1ms
├─ Retrieve history       +1ms
├─ OpenAI GPT-4 call      +2,000-8,000ms (variable)
├─ Update history         +1ms
├─ WhatsApp send API      +200-500ms
└─ Mark as read           +200-300ms

Total: 3-10 seconds (typical)
```

**Critical Path**: OpenAI API call (80-95% of total time).

**Optimization Opportunities**:
- Use GPT-3.5-turbo (faster, 90% cheaper)
- Implement caching for common questions
- Stream responses (show "typing..." indicator)

---

### Voice Message Cycle

**Latency Breakdown**:
```
Webhook received          0ms
├─ Get media URL          +300ms
├─ Download audio (OGG)   +500-2,000ms (depends on file size)
├─ Convert OGG → WAV      +500-1,500ms (depends on duration)
├─ Upload to Soniox       +500-1,000ms
├─ Create transcription   +100ms
├─ Poll status (v3)       +5,000-15,000ms (typical)
│  └─ If timeout          +180,000ms max, then try v2
├─ Get transcript         +100ms
├─ Delete Soniox resources +200ms
├─ OpenAI GPT-4 call      +2,000-8,000ms
├─ OpenAI TTS call        +1,000-3,000ms
├─ Upload MP3 to WhatsApp +500-1,000ms
├─ Send voice message     +300ms
└─ Mark as read           +200ms

Total: 10-40 seconds (typical)
Up to 5 minutes if v3 + v2 both timeout (rare)
```

**Critical Path**: Soniox transcription (50-70% of total time).

**Optimization Opportunities**:
- Parallel processing (upload to Soniox while converting)
- Pre-warm TTS for common responses
- Cache transcriptions for identical audio (dedupe)

---

### Lesson Plan Cycle

**Latency Breakdown**:
```
Webhook received          0ms
├─ Detect keyword         +10ms
├─ Extract topic          +50ms
├─ Send "processing" msg  +300ms
├─ GPT-4 enrichment       +3,000-6,000ms
├─ Gamma API create       +300ms
├─ Poll Gamma status      +30,000-90,000ms (typical)
├─ Download PDF           +1,000-3,000ms (depends on size)
├─ Upload to WhatsApp     +1,000-2,000ms
└─ Send document          +300ms

Total: 40-110 seconds (typical)
Up to 5 minutes if Gamma is slow
```

**Critical Path**: Gamma generation (80-90% of total time).

**No current optimizations**: Gamma speed is out of our control.

---

### Classroom Coaching Cycle (Background Jobs)

**Complete End-to-End Flow** (20-45 minutes typical):

```
User sends audio (15+ min)
  ↓
Web Server (whatsapp-bot.js):
  ├─ Initiate coaching session → DB
  ├─ Send confirmation buttons
  └─ Wait for user confirmation

User confirms
  ↓
Web Server:
  ├─ Queue transcription job → coaching_jobs table
  └─ Return immediately (webhook closes)

Background Worker (coaching-processor.js):
  ├─ Claim transcription job
  ├─ Download audio from WhatsApp (audioId)     +2-5 seconds
  ├─ Upload to R2 storage                        +3-8 seconds
  ├─ Transcribe with Soniox (diarization)        +900-1800 seconds (15-30 min)
  ├─ Store transcript + diarization              +1 second
  ├─ Mark job complete
  └─ Ask user for lesson plan

User responds (yes/no to lesson plan)
  ↓
Web Server:
  ├─ Queue analysis job → coaching_jobs table
  └─ Return immediately

Background Worker:
  ├─ Claim analysis job
  ├─ Run GPT-5 mini pedagogical analysis         +120-300 seconds (2-5 min)
  ├─ Store analysis data (JSONB)                 +1 second
  ├─ Mark job complete
  └─ Start reflective conversation (inline, not queued)

User answers 3 reflective questions (inline)
  ↓
Web Server:
  ├─ Queue report_generation job → coaching_jobs table
  └─ Return immediately

Background Worker:
  ├─ Claim report_generation job
  ├─ Generate charts (QuickChart API)            +5-10 seconds
  ├─ Generate PDF report (PDFKit)                +10-20 seconds
  ├─ Upload PDF to R2                            +3-5 seconds
  ├─ Generate voice debrief script (GPT-5 mini)  +30-60 seconds
  ├─ Generate voice audio (TTS)                  +20-40 seconds
  ├─ Upload voice to R2                          +3-5 seconds
  ├─ Send PDF + voice to user via WhatsApp       +5-10 seconds
  └─ Mark job complete

Total: 20-45 minutes (mostly transcription)
```

**Why Background Jobs?**
- Transcription takes 15-30 minutes (exceeds webhook timeout)
- Analysis + report generation takes 5-10 minutes
- WhatsApp webhook timeout: 20 seconds
- User can continue chatting while processing happens
- Worker crashes don't lose progress (jobs retry automatically)

**State Machine** (coaching_sessions.status):
```
initiated → awaiting_confirmation → confirmed → transcribing →
transcription_complete → awaiting_lesson_plan → analyzing →
analysis_complete → conducting_conversation → generating_report →
completed
```

**Error Recovery**:
- Job fails → Exponential backoff retry (60s, 120s, 240s)
- Max 3 attempts before permanent failure
- Worker crash → Job stays "processing", reclaimed by timeout
- User gets error notification after final failure

---

## Concurrency Model

### Single-Threaded Event Loop

Node.js handles multiple requests concurrently through non-blocking I/O:

```javascript
// Multiple webhook events can be processed simultaneously
app.post('/webhook', async (req, res) => {
  // Each request runs independently
  // No shared state (except conversationHistories)

  res.sendStatus(200); // Immediately acknowledge webhook

  // Process asynchronously (doesn't block other requests)
  await handleMessage(messageData);
});
```

**Implications**:
- ✅ Can handle 10-50 concurrent requests (typical)
- ✅ No threading complexity
- ❌ CPU-intensive tasks block event loop (e.g., large FFmpeg conversions)
- ❌ One crashed request doesn't affect others

**Scalability**:
- Current: Single Railway instance handles 100-500 concurrent users
- Future: Add load balancer + multiple instances for >1,000 users

---

## Error Handling Strategy

### Layered Error Handling

```javascript
try {
  // Outer layer: Webhook processing
  const messageData = extractMessageData(req.body);

  try {
    // Middle layer: Message handling
    const transcription = await transcribeAudioSoniox(audioPath);

    try {
      // Inner layer: API calls with cleanup
      const response = await openai.chat.completions.create({...});
    } catch (apiError) {
      // Handle API-specific errors
      logToFile('OpenAI error', { error: apiError.message });
      throw new Error('AI service unavailable');
    }

  } catch (handlerError) {
    // Send user-friendly error message
    await sendWhatsAppMessage(userId, "Sorry, something went wrong. Please try again.");
  }

} catch (webhookError) {
  // Log critical errors but don't crash server
  console.error('Webhook processing failed:', webhookError);
  res.sendStatus(500); // Let WhatsApp know to retry
}
```

### Resource Cleanup on Error

```javascript
finally {
  // Always clean up, even on error
  if (fs.existsSync(audioPath)) {
    fs.unlinkSync(audioPath);
  }

  if (transcriptionId) {
    await deleteSonioxTranscription(transcriptionId);
  }
}
```

---

## Security Architecture

### Current Measures

1. **Webhook Verification**:
   ```javascript
   // GET /webhook - Meta verifies our server
   if (req.query['hub.verify_token'] === WEBHOOK_VERIFY_TOKEN) {
     res.send(req.query['hub.challenge']);
   } else {
     res.sendStatus(403);
   }
   ```

2. **Environment Variables**: All secrets in `.env` (not in code)

3. **HTTPS Only**: Enforced by Railway and WhatsApp Cloud API

4. **Message Deduplication**: Prevents replay attacks

5. **Temporary File Cleanup**: No sensitive data retention

### Gaps (Not Implemented)

1. **No Rate Limiting**: Vulnerable to abuse
2. **No Request Signing**: Can't verify webhook authenticity
3. **No User Authentication**: Anyone with phone number can use
4. **No IP Whitelisting**: Accepts webhooks from any source
5. **No Conversation Encryption**: History stored in plain text (memory)

See [05_Deployment_Operations.md](05_Deployment_Operations.md#security-considerations) for production recommendations.

---

## Monitoring & Observability

### Current Logging

**Console Logs** (captured by Railway):
```javascript
function logToFile(message, data = {}) {
  const timestamp = new Date().toISOString();
  const logEntry = { timestamp, message, ...data };
  console.log(JSON.stringify(logEntry, null, 2));
}
```

**Log Levels**: Currently all INFO (no debug/warn/error distinction).

**Log Aggregation**: Railway provides 7-day retention, searchable via CLI:
```bash
railway logs --tail 100
railway logs | grep -i error
```

### Gaps

- ❌ No structured logging (JSON format inconsistent)
- ❌ No error tracking (e.g., Sentry, Rollbar)
- ❌ No performance monitoring (e.g., New Relic, DataDog)
- ❌ No uptime monitoring (e.g., Pingdom, UptimeRobot)
- ❌ No user analytics (e.g., Mixpanel, Amplitude)

**Future**: See [07_Extending_the_Bot.md](07_Extending_the_Bot.md#analytics-dashboard) for analytics integration.

---

## Performance Characteristics

### Benchmarks (November 2025)

| Metric | Current | Target | Notes |
|--------|---------|--------|-------|
| **Text response time** | 3-10s | <15s | 90th percentile |
| **Voice response time** | 10-40s | <30s | 90th percentile |
| **Lesson plan time** | 40-110s | <120s | 90th percentile |
| **Error rate** | ~0.5% | <1% | Excluding Soniox queue issues |
| **Uptime** | 99.5% | >99% | Railway platform SLA |
| **Concurrent users** | 100-200 | 500+ | Single instance |

### Bottlenecks

1. **Soniox transcription**: Unpredictable queue delays (see [06_Known_Issues.md](06_Known_Issues.md))
2. **Gamma generation**: 30-90s, not controllable
3. **OpenAI GPT-4**: 2-8s per request (can optimize to GPT-3.5)
4. **FFmpeg conversion**: 0.5-1.5s (acceptable)

---

## Scalability Considerations

### Current Capacity

**Single Railway Instance**:
- CPU: 1 vCPU (shared)
- RAM: 512MB (free tier) or 2GB (paid)
- Concurrent requests: ~50 (Express.js limit)
- Active users: 100-500 (depending on message frequency)

### Scaling Strategies

**Vertical Scaling** (Railway):
- Upgrade to 2 vCPU + 4GB RAM ($20/month)
- Handle 1,000-2,000 users

**Horizontal Scaling** (Load Balancer):
- Deploy multiple Railway instances
- Add load balancer (Railway provides)
- Redis for shared conversation history
- Handle 5,000-10,000 users

**Architectural Changes for Large Scale**:
1. Separate webhook receiver from message processor
2. Add message queue (Bull, RabbitMQ)
3. Worker nodes for transcription/generation
4. Database for conversation history
5. CDN for media files

---

**Next**: See [03_API_Integrations.md](03_API_Integrations.md) for detailed API documentation.
