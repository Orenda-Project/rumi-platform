# Statement of Intent: Webhook Ingestion Gateway Modernization

- **Outcome:** Extract webhook ingress from `bot/whatsapp-bot.js` into an in-process, channel-agnostic gateway module (`bot/gateway/`) using provider adapters (WhatsApp/Meta, Slack) that normalize inbound payloads before dispatching to downstream handlers.
- **User:** Platform engineers maintaining Rumi and decomposing the monolithic bot into clean, independently deployable microservices.
- **Why now:** `bot/whatsapp-bot.js` conflates ~1,200 lines of wire protocol handshakes, transport verification, and domain business logic in a single monolith hotspot, making Meta an accidental canonical data model and blocking clean microservice extraction.
- **Success:** `bot/gateway/` handles WhatsApp and Slack through a uniform abstraction; legacy wire characterization tests in `tests/characterization/legacy-baseline.test.js` pass with 100% fidelity; and a phased modernization roadmap to a standalone microservice is established.
- **Constraint:** Preserve synchronous in-process execution and exact wire contracts (`GET/POST /webhook`, `POST /api/slack/*`) during Phase 1 without introducing queue latency or changing existing external endpoints.
- **Out of scope:** Deploying a standalone process or container in Phase 1; switching to an asynchronous queue-and-ack worker pipeline in Phase 1; altering external provider webhook URLs or authentication contracts.
