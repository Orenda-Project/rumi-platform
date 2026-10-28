# tests — Jest and standalone-script tests for dashboard services and queue workers
Full index: `CLAUDE.index.md`

<!-- kg:meta repo=rumi-platform dir=dashboard/tests kg=81b60fbe51e0 gen=3e845edcb0e0 overflow=4 rendered=2026-10-28 kg.py=1.0.0 -->

## Entry points
- `setup.js` — jest setup that stubs localStorage for Node 25
- `materialized-views-partner.service.test.js` — pins partner scope filtering on MV reads
- `queue/portal-sqs-worker.test.js` — pins transcript and AMA job handling
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `queue/` | → (no door; 2 test files) |
| `setup.js` | Jest setup: loads env and stubs localStorage/sessionStorage for Node 25. |
| `CLAUDE.index.md` | (unmapped) |
| `redis-cache.test.js` | Pins redis-cache.service hits, misses, TTL, fallback and invalidation with a mocked GitHub API. |
| `CLAUDE.md` | (unmapped) |
| `ama-service.test.js` | Standalone script of AMA schema-validation tests (column checks, retry); targets the removed NL-SQL engine. |
| `byof-agent.test.js` | Pins the BYOF agent (Anthropic chat) behaviour in byof-agent.service. |
| `byof-service.test.js` | Pins byof.service: byof_role validation, session CRUD, message storage and permission checks. |
| `code-chunker.test.js` | Pins code-chunker.service: function/class extraction, metadata and error handling. |
| `embedder.test.js` | Pins code-embedder.service with a mocked OpenAI: embeddings, batching, caching, errors. |
| `github-api.test.js` | Pins github-api.service file, directory and tree fetching and error handling. |
| `gpt-cache.test.js` | Pins gpt-cache.service hashing, TTL, withCache and fallback using an in-memory mock Redis. |
| `materialized-views-partner.service.test.js` | Pins partner scope filtering (all, country, school, phone_list, combined) in materialized-views.service. |
| … | 4 more → `CLAUDE.index.md` |

## Who reads this (generated)
- env read here: `GITHUB_TOKEN` · `TEST_BASE_URL`

## Never (human)
- Never run service tests with setup.js; use jest.service.config.js (jest.service.config.js:10)
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- (none)

## Related (generated)
- docs: `bot/console/views/CLAUDE.md`? · `dashboard/CLAUDE.index.md`? · `dashboard/CLAUDE.md`? · `dashboard/services/CLAUDE.index.md`? · `dashboard/services/CLAUDE.md`? · `dashboard/tests/CLAUDE.index.md`? (+3)
