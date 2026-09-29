# Test Readiness: Decoupled Webhook Ingestion Gateway (Phases 2 & 3)

## 1. Overview
This test catalog covers the test architecture, test suites, and empirical verification results for Phase 2 (Async Queue-and-Ack Ingestion) and Phase 3 (Standalone Microservice Entry Point) of the Decoupled Webhook Ingestion Gateway in Rumi platform.

All test suites execute independently with zero external dependencies (no Supabase, AWS, or live Redis required).

---

## 2. Test Suites Inventory

| Test Suite | Path | Tests | Status | Scope |
|------------|------|:-----:|:------:|-------|
| **Standalone Server** | `tests/gateway/standalone-server.test.js` | 17 | PASS | Phase 3 standalone microservice boot, port resolution, `/health` and `/` probes, CORS preflight, wire compatibility, and process boot independence without Supabase credentials |
| **Gateway Queue Integration** | `tests/gateway/gateway-queue-integration.test.js` | 14 | PASS | Phase 2 async queue-and-ack (< 100ms), canonical `InboundMessageEnvelope` normalization, memory queue handoff, worker execution, Redis duplicate suppression, SQS worker bridge, and correlation ID propagation |
| **Gateway Components** | `tests/gateway/webhook-gateway.test.js` | 12 | PASS | IngressDispatcher sync/async modes, envelope factory, WhatsApp and Slack adapters in isolation |
| **Characterization Baseline** | `tests/characterization/legacy-baseline.test.js` | 7 | PASS | 100% wire backward compatibility for Meta verify handshake, WhatsApp POST, and Slack HMAC challenge |
| **Queue Driver Parity & Selector** | `tests/queue/` | 78 | PASS | 16-method parity across SQS, BullMQ, and Memory drivers, queue selector routing, delay and metrics |

Total Gateway & Queue Verification: **128 tests passing across 8 suites**.

---

## 3. Test Runner Instructions

All tests must be executed with Node 24 runtime:

```bash
# Setup Node 24 runtime
source ~/.nvm/nvm.sh && nvm use 24

# 1. Run Standalone Microservice Tests (Phase 3)
node tests/run.js --testPathPattern=standalone-server.test.js

# 2. Run Gateway Queue Integration E2E Tests (Phase 2)
node tests/run.js --testPathPattern=gateway-queue-integration.test.js

# 3. Run All Gateway Tests Combined
node tests/run.js --testPathPattern=tests/gateway/

# 4. Run Legacy Wire Compatibility Baseline
node tests/run.js --testPathPattern=legacy-baseline.test.js

# 5. Run Queue Driver Parity & Memory Queue Tests
node tests/run.js --testPathPattern=tests/queue/
```

---

## 4. Coverage Breakdown

### Tier 1: Core Feature Verification
- **Standalone Server Lifecycle & Port Resolution**: Verifies `bot/gateway/server.js` boots on `GATEWAY_PORT || PORT || 4000`, exports `{ app, startServer }`, and gates execution behind `require.main === module`.
- **Health & Liveness Probes**: Verifies `GET /health` and `GET /` respond with HTTP 200 `{ "status": "ok", "service": "rumi-gateway" }`.
- **Zero-Dependency CORS Middleware**: Verifies standard and preflight `OPTIONS` requests return `Access-Control-Allow-Origin: *`, `Access-Control-Allow-Methods`, and `Access-Control-Allow-Headers` containing `x-hub-signature-256` and `x-slack-signature`.
- **Fast Ingestion (< 100ms Ack)**: Verifies `POST /webhook` and `POST /api/slack/events` acknowledge in < 100ms (measured ~5-30ms) before downstream processing.
- **Canonical Envelope Normalization**: Validates parsing of WhatsApp text, interactive button reply, and status updates into canonical `InboundMessageEnvelope`.
- **Queue Handoff to Pluggable Driver**: Enqueues canonical envelopes to `QUEUE_DRIVER=memory` via `queueJob(groupId, 'inbound_message', envelope, { deduplicationId })`.
- **Worker Consumer & Domain Dispatch**: Dequeues jobs via `receiveJobs()`, restores correlation context, calls message handlers, and completes jobs via `completeJob()`.
- **Duplicate Message Suppression (Idempotency)**: Verifies `SessionService.isProcessed(envelope.id)` detects duplicates and suppresses redundant domain processing.
- **Correlation ID Propagation**: Traces `correlationId` from HTTP header through envelope metadata, queue payload, and worker execution.

### Tier 2: Boundary & Corner Cases
- Verification handshake rejection with HTTP 403 on invalid verify token.
- Slack HMAC signature failure with HTTP 401 on tampered payload.
- Non-existent route probing returning HTTP 404.
- Queue producer error simulation handled gracefully without crashing Express ingress.
- Standalone child-process boot with empty `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (no exit code 78).

### Tier 3: Cross-Module Interactions
- Ingress Gateway -> Memory Queue Driver -> InboundMessageWorker -> SQSCoachingWorker Lifecycle.
- Multi-channel ingestion (WhatsApp Meta Cloud API + Slack Events API).

---

## 5. Escalated Implementation Defects (Pending Worker Remediation)

During test suite verification, the following implementation issue was identified and escalated:

1. **Hygiene / Env-Template Completeness (`tests/setup/env-template-completeness.test.js`)**:
   - **Defect**: `bot/whatsapp-bot.js` references `process.env.QUEUE_MODE` at line 70, but `QUEUE_MODE` is not documented in `.env.template`.
   - **Impact**: `tests/setup/env-template-completeness.test.js` fails with `Missing: QUEUE_MODE`.
   - **Remediation**: Either add `QUEUE_MODE=sync` to `.env.template` or use the already documented `process.env.GATEWAY_QUEUE_MODE` (line 445 in `.env.template`).
