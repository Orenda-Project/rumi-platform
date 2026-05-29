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
| Queue | `bot/shared/services/queue/` (`index.js` selects the driver) | Pluggable job queue — `QUEUE_DRIVER=sqs` (default) or `bullmq` |
| Worker | `bot/workers/sqs-worker.js` | Background job processing |
| Branding | `bot/shared/config/branding.js` | Customizable bot identity |
| Feature gating | `bot/shared/config/feature-availability.js` | Presence-based feature availability (no tiers) |

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
- **73 tables** today, grouped by domain below. The schema is fed by a
  consolidated dump rather than per-feature migrations, so a few tables are
  declared but not yet wired to code — those are called out explicitly so
  cloners don't waste time wondering whether they're missing a feature.

### Schema reference — tables by domain

| Domain | Tables | Status |
|---|---|---|
| **Users + identity** | `users`, `access_scopes`, `dashboard_users`, `dashboard_audit_log` | active |
| **Conversation state** | `conversations`, `chat_sessions`, `chat_starts`, `cta_clicks`, `feature_suggestions`, `user_feature_first_use` | active |
| **Configuration** | `app_settings`, `region_features` | active |
| **Coaching** | `coaching_sessions`, `coaching_quality_metrics`, `audio_sessions` | active |
| **Lesson plans** | `lesson_plans`, `lesson_plan_requests`, `pre_generated_lps`, `pic_lp_sessions` (read via the `TABLE` constant in `pic-lp-session.service.js`) | active |
| **Reading assessment** | `reading_assessments`, `student_lists`, `students` | active |
| **Quizzes** | `quizzes`, `quiz_sessions`, `quiz_questions`, `quiz_answers` | active |
| **Exam checker** | `exam_check_sessions`, `exam_submissions`, `exam_grades`, `image_analysis_requests` | active |
| **Video generation** | `video_requests`, `video_tasks`, `student_videos`, `student_video_feedback` | active |
| **Attendance** | `attendance_sessions`, `attendance_records` | active |
| **Homework + content** | `homework_chapters`, `textbook_toc` | active |
| **BYOF (bring-your-own-flow)** | `byof_plans`, `byof_sessions`, `byof_messages`, `byof_approval_log` | active |
| **Broadcasts** | `broadcast_logs`, `broadcast_messages`, `website_visits`, `release_notes` | active |
| **A/B testing** | `ab_tests`, `ab_test_variants`, `ab_test_events` | active |
| **Logging + telemetry** | `api_usage_log` | active |
| *Internal-only* | `qa_analyst_proposals`, `qa_bug_patterns`, `qa_test_runs`, `ama_conversations`, `ama_messages`, `ama_query_audit` | declared, no OSS-side code — internal QA + Ask-Me-Anything tools that ship with the schema dump but aren't part of the OSS feature surface. Safe to ignore. |
| *Dead — legacy PG coaching queue* | `coaching_jobs`, `coaching_processing_queue` (+ RPCs `claim_next_coaching_job` / `complete_coaching_job` / `fail_coaching_job` / `queue_coaching_job`) | the old PostgreSQL coaching job queue. Superseded by the pluggable SQS/BullMQ queue (`bot/shared/services/queue/`). Its only consumer (the legacy `coaching-processor.js` worker) and producer were deleted in Wave 6 (bd-1873); `queue_coaching_job()` has no callers. Inert by design — the live coaching worker is `sqs-worker.js` → `coaching-orchestrator.service.js`. Kept in the schema (consistent with the "declared, not wired" policy) but will never be written or read. |
| *Declared, not wired* | `exam_templates`, `failed_operations`, `feature_permissions`, `grade_audit_log`, `invitations`, `lcpm_benchmarks`, `migration_test`, `portal_organizations`, `schema_versions`, `teacher_facts`, `teacher_progress`, `textbook_pages`, `textbooks`, `videos`, `wcpm_percentiles` | declared in the schema but not referenced from any `bot/` or `dashboard/` `.from()` call — either historical, planned, or used only by external SQL views. They occupy no runtime budget; leave them in place unless you're sure no analyst tool reads them. |

### Schema integrity guards

Three `tests/setup/*` ratchets keep the schema honest:

- `schema-completeness.test.js` — every table the code writes to MUST exist
  in `00_complete-schema.sql`.
- `column-completeness.test.js` — every column the code writes (insert /
  update / upsert top-level keys) or reads (select / eq / order / …) MUST
  exist on its table.
- `flow-config-conformance.test.js` — every WhatsApp Flow declared in
  `flow-configs.js` has a corresponding route mounted under `/api/flows`.

## Job Queue

- **Pluggable driver** via `QUEUE_DRIVER`: AWS SQS (default) or BullMQ/Redis — both expose the same surface (`bot/shared/services/queue/index.js` selects it)
- ~15 job types dispatched by the worker, including: transcription, analysis, report generation, lesson-plan extraction, lesson-plan generation, pic-to-LP rendering, video generation, exam grading, homework-bundle generation, and the quiz jobs (quiz, quiz_report, quiz_nudge, quiz_reminder, quiz_expire)
- Configurable concurrency
- Automatic retry with exponential backoff
