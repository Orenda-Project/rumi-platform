# Rumi Platform Architecture

## System Overview

Rumi is a WhatsApp-based AI teaching assistant. Messages flow from WhatsApp through a webhook to the Node.js bot, which processes them using AI services and responds via the WhatsApp API.

## Component Architecture

```
WhatsApp User
    │
    ▼
Meta WhatsApp API
    │
    ▼
┌──────────────────────┐
│  Bot (Express.js)    │
│  - Webhook handler   │
│  - Message routing   │
│  - Registration flow │
│  - Feature gating    │
└─────────┬────────────┘
          │
    ┌─────┼─────┐
    ▼     ▼     ▼
┌──────┐ ┌──────┐ ┌──────┐
│ LLM  │ │Redis │ │Supa- │
│Client│ │Queue │ │base  │
│(Open-│ │(Bull-│ │(Post-│
│Router│ │MQ)   │ │greSQL│
│)     │ │      │ │)     │
└──────┘ └──┬───┘ └──────┘
             │
    ┌────────┴────────┐
    ▼                 ▼
┌──────────┐  ┌──────────┐
│ Worker   │  │ Worker   │
│ (coaching│  │ (lesson  │
│ pipeline)│  │ plans)   │
└──────────┘  └──────────┘
```

## Key Services

| Service | File | Purpose |
|---------|------|---------|
| LLM Client | `bot/shared/services/llm-client.js` | AI chat via OpenRouter |
| Queue | `bot/shared/services/queue/bullmq-queue.service.js` | Job queue for async tasks |
| Worker | `bot/workers/bullmq-worker.js` | Background job processing |
| Branding | `bot/shared/config/branding.js` | Customizable bot identity |
| Feature Tiers | `bot/shared/config/feature-tiers.js` | Feature gating by tier |

## Message Flow

1. WhatsApp sends webhook POST to `/webhook`
2. Bot validates the request and extracts message
3. Bot looks up or creates user in Supabase
4. Bot routes message to appropriate handler (text, voice, image)
5. Handler uses LLM client for AI responses
6. For async tasks (coaching, lesson plans), job is queued to BullMQ
7. Worker processes job and sends result via WhatsApp API

## Database

- **PostgreSQL via Supabase** with Row Level Security (RLS)
- Schema: `infrastructure/supabase/00_complete-schema.sql`
- 25+ tables covering users, conversations, coaching, reading, exams, attendance

## Job Queue

- **BullMQ** (Redis-based) replaces AWS SQS
- 7 job types: transcription, analysis, report, lesson plan extraction, lesson plan generation, video generation, exam grading
- Configurable concurrency (default: 3)
- Automatic retry with exponential backoff
