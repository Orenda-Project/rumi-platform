# Webhook Ingestion Gateway Modernization Roadmap

## 1. Architectural Motivation & Problem Statement

In the monolithic Rumi platform, `bot/whatsapp-bot.js` served as both the primary HTTP server and the message processing core. This generated several architectural liabilities:

1. **Meta as Accidental Canonical Model:** Alternative channels like Slack and Baileys had to synthetically transform their payloads into Meta's nested JSON structure (`entry[0].changes[0].value.messages[0]`) just so `handleWebhookPost` could parse them.
2. **Synchronous Ingress Coupling:** Inbound HTTP requests from Meta and Slack waited for database queries, session lookups, AI prompts, and business workflows to complete before returning HTTP 200.
3. **Monolith Ingress Hotspot:** Over 1,200 lines of inline handler logic (from quiz buttons to document processing) were directly bound to the Express route handler.

```
[Legacy Monolith Ingress]
Meta Webhook (/webhook) ────────┐
                                ▼
Slack Webhook (/api/slack) ──> [Fake Meta Payload] ──> handleWebhookPost() (1200+ lines: DB, AI, Flow) ──> HTTP 200
                                ▲
Baileys Socket ─────────────────┘
```

---

## 2. Target Architecture: Channel-Agnostic Gateway

The modernized gateway establishes a clean separation between **Transport/Provider Ingress** and **Domain Dispatching**, using a unified **Canonical Inbound Message Envelope**.

```
[Modernized Channel-Agnostic Gateway]
Meta Webhook (/webhook)       ──> [WhatsApp Adapter] ──┐
                                                       ▼
Slack Webhook (/api/slack)    ──> [Slack Adapter]    ──> [Canonical Inbound Envelope] ──> Ingress Dispatcher
                                                       ▲
Future Channels (SMS/Telegram)──> [Channel Adapter]  ──┘                                       │
                                                                                               ▼
                                                                     [Phase 1: In-Process Domain Handlers]
                                                                     [Phase 2/3: Queue / Message Broker]
```

### Canonical Inbound Message Envelope Schema

```typescript
interface InboundMessageEnvelope {
  id: string;               // Unique message / event identifier
  channel: string;          // 'whatsapp' | 'slack' | 'baileys' | etc.
  from: string;             // Normalized sender ID (e.g., '923001234567' or 'slack:U12345')
  timestamp: number;        // Epoch timestamp (seconds)
  type:                     // Standardized event / message type
    | 'text'
    | 'interactive_button'
    | 'interactive_list'
    | 'interactive_flow'
    | 'audio'
    | 'voice'
    | 'image'
    | 'document'
    | 'status_update'
    | 'system';
  payload: {
    text?: string;
    actionId?: string;      // Button or list selection ID
    mediaId?: string;
    mimeType?: string;
    flowData?: Record<string, any>;
    status?: string;        // For status receipts (delivered/read)
    rawActionPayload?: any;
  };
  metadata: {
    phoneNumberId?: string;
    correlationId: string;
    rawEntry?: any;
  };
  rawBody?: any;            // Original wire payload for legacy fallback
}
```

---

## 3. Phased Modernization Roadmap

```
┌────────────────────────────────────────────────────────────────────────┐
│ Phase 1: In-Process Channel-Agnostic Gateway (Current Scope)           │
│ - bot/gateway/webhook.routes.js & bot/gateway/adapters/                │
│ - Canonical Inbound Envelope normalization                            │
│ - Synchronous in-process delegation to domain handlers                 │
│ - Zero wire regression: passes tests/characterization/legacy-baseline  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ Phase 2: Asynchronous Ingestion & Queue-and-Ack                       │
│ - Immediate HTTP 200 acknowledgment to Meta/Slack within < 100ms       │
│ - Inbound message published to QUEUE_DRIVER (SQS or BullMQ/Redis)      │
│ - Domain processing moved to decoupled background worker consumers     │
│ - Eliminates webhook timeouts during heavy LLM/DB latency              │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ Phase 3: Standalone Microservice Extraction (rumi-gateway)             │
│ - Extract bot/gateway/ into independent microservice container        │
│ - Independent scaling: Gateway scales with inbound traffic spikes      │
│ - Monolith domain logic deployed as separate core worker service       │
│ - Shared contracts defined via shared-types package                    │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Phase 1 Implementation Plan

### Directory Structure
```
bot/
├── gateway/
│   ├── index.js                     # Gateway exports & initialization
│   ├── webhook.routes.js            # Express router mounting /webhook & /api/slack
│   ├── envelope.js                  # Inbound message envelope factory & schema
│   ├── ingress-dispatcher.js        # Dispatches normalized envelopes (sync in Phase 1)
│   └── adapters/
│       ├── whatsapp.adapter.js      # Meta GET challenge & POST validation + normalization
│       └── slack.adapter.js         # Slack HMAC signature verification + normalization
```

### Safety & Backward Compatibility Guarantees
1. **Wire Compatibility:** All URLs, headers, status codes, and response bodies are verified against [`tests/characterization/legacy-baseline.test.js`](file:///Users/mashhoodr/dev/playground/googlebuildwithvideo/rumi-platform/tests/characterization/legacy-baseline.test.js).
2. **Zero Domain Regressions:** In Phase 1, `ingress-dispatcher.js` calls the existing domain handler functions synchronously, preserving exact execution order and error boundaries.
3. **Additive Refactoring:** `bot/whatsapp-bot.js` delegates its route mounts to `bot/gateway/webhook.routes.js`, shrinking the monolith entry point without modifying any business logic behavior.
