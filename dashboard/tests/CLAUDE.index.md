# tests — full index (generated)

<!-- kg:index repo=rumi-platform dir=dashboard/tests -->
Every row the door could not hold, ungrouped. Not auto-loaded; same hop as `CLAUDE.md`.

## Children (all, generated)
| path | purpose |
|---|---|
| `queue/` | → (no door; 2 tests) |
| `ama-service.test.js` | Standalone script of AMA schema-validation tests (column checks, retry); targets the removed NL-SQL engine. |
| `byof-agent.test.js` | Pins the BYOF agent (Anthropic chat) behaviour in byof-agent.service. |
| `byof-service.test.js` | Pins byof.service: byof_role validation, session CRUD, message storage and permission checks. |
| `code-chunker.test.js` | Pins code-chunker.service: function/class extraction, metadata and error handling. |
| `embedder.test.js` | Pins code-embedder.service with a mocked OpenAI: embeddings, batching, caching, errors. |
| `github-api.test.js` | Pins github-api.service file, directory and tree fetching and error handling. |
| `gpt-cache.test.js` | Pins gpt-cache.service hashing, TTL, withCache and fallback using an in-memory mock Redis. |
| `materialized-views-partner.service.test.js` | Pins partner scope filtering (all, country, school, phone_list, combined) in materialized-views.service. |
| `materialized-views.test.js` | Pins materialized-views.service reads and refresh against the 500-800ms to <50ms goal. |
| `redis-cache.test.js` | Pins redis-cache.service hits, misses, TTL, fallback and invalidation with a mocked GitHub API. |
| `setup.js` | Jest setup: loads env and stubs localStorage/sessionStorage for Node 25. |
| `transcript-ux-helpers.test.js` | Pins transcript-ux-helpers.service mastery-status and classroom-climate traffic-light mapping. |
| `vector-db.test.js` | Pins vector-db.service upsert, cosine search, filtering and retrieval. |
| `video-observability-nav.test.js` | Checks the navigation partial links to the video gallery (reads navigation.ejs). |
| `video-observability-routes.test.js` | Hits the running dashboard's video gallery routes over HTTP (needs TEST_BASE_URL server). |
| `video-observability-service.test.js` | Pins video-observability.service queries: pagination, filters, user join. |
| `video-observability-view.test.js` | Checks the videos.ejs gallery template renders the expected markup. |

## Who reads this (all, generated)
- (none)

## Tests (all, generated)
- (none)

## Related (all, generated)
- docs: `bot/console/views/CLAUDE.md`? · `dashboard/CLAUDE.md`? · `dashboard/services/CLAUDE.md`? · `pinokio/CLAUDE.md`?
