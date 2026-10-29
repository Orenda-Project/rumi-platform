# tests — Jest and standalone-script tests for dashboard services and queue workers
Full index: `CLAUDE.index.md`

<!-- kg:meta repo=rumi-platform dir=dashboard/tests kg=7be191e81010 gen=72a1abb162e7 overflow=2 rendered=2026-10-29 kg.py=1.1.0 -->

## Entry points
- `setup.js` — jest setup that stubs localStorage for Node 25
- `materialized-views-partner.service.test.js` — pins partner scope filtering on MV reads
- `queue/portal-sqs-worker.test.js` — pins transcript and AMA job handling
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `queue/` | → (no door; 2 tests) |
| `setup.js` | Jest setup: loads env and stubs localStorage/sessionStorage for Node 25. |
| `redis-cache.test.js` | Pins redis-cache.service hits, misses, TTL, fallback and invalidation with a mocked GitHub API. |
| `ama-service.test.js` | Standalone script of AMA schema-validation tests (column checks, retry); targets the removed NL-SQL engine. |
| `byof-agent.test.js` | Pins the BYOF agent (Anthropic chat) behaviour in byof-agent.service. |
| `byof-service.test.js` | Pins byof.service: byof_role validation, session CRUD, message storage and permission checks. |
| `code-chunker.test.js` | Pins code-chunker.service: function/class extraction, metadata and error handling. |
| `embedder.test.js` | Pins code-embedder.service with a mocked OpenAI: embeddings, batching, caching, errors. |
| `github-api.test.js` | Pins github-api.service file, directory and tree fetching and error handling. |
| `gpt-cache.test.js` | Pins gpt-cache.service hashing, TTL, withCache and fallback using an in-memory mock Redis. |
| `materialized-views-partner.service.test.js` | Pins partner scope filtering (all, country, school, phone_list, combined) in materialized-views.service. |
| `materialized-views.test.js` | Pins materialized-views.service reads and refresh against the 500-800ms to <50ms goal. |
| `transcript-ux-helpers.test.js` | Pins transcript-ux-helpers.service mastery-status and classroom-climate traffic-light mapping. |
| … | 5 more → `CLAUDE.index.md` |

## Who reads this (generated)
- (none)

## Never (human)
- Never run service tests with setup.js; use jest.service.config.js (jest.service.config.js:10)
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- (none)

## Related (generated)
- docs: `bot/console/views/CLAUDE.md`? · `dashboard/CLAUDE.md`? · `dashboard/services/CLAUDE.md`? · `pinokio/CLAUDE.md`?
