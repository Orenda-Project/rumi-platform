# unit — Unit tests for utils plus early public-release guard tests under sprint-N

<!-- kg:meta repo=rumi-platform dir=tests/unit kg=272e6430fb10 gen=5209de403e7f overflow=0 rendered=2026-10-28 kg.py=1.0.0 -->

## Entry points
- `redact-url.test.js` — what logs may say about a file URL
- `private-temp.test.js` — temp paths stay inside a private dir
- `sprint-0/security-scan.test.js` — repo is safe to publish
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `sprint-0/` | → (no door; 1 test files) |
| `sprint-1/` | → (no door; 5 test files) |
| `sprint-2/` | → (no door; 1 test files) |
| `sprint-3/` | → (no door; 1 test files) |
| `sprint-4/` | → (no door; 1 test files) |
| `CLAUDE.md` | (unmapped) |
| `llm-client-for-model.test.js` | Pins llm-client getClientForModel: per-job entry for the lesson quiz over the single OpenRouter client |
| `redact-url.test.js` | Pins redactUrl (bot and dashboard copies): host plus short path hash only, never query or openable path |
| `no-undeliverable-promises.test.js` | Pins that an unset asset base yields no relative URL: feature-videos and passage generation offer no dead media |
| `private-temp.test.js` | Pins privateTempPath: always a file inside a private dir, whatever the display name ('', '.', '..') |
| `upload-digest.test.js` | Pins upload-digest: sha of bytes actually streamed to a driver upload, taken lazily as read |
| `student-list-parsing.test.js` | Pins StudentListService.parseStudentText roster parsing incl. optional parent phone, for channels without a Flow |

## Who reads this (generated)
- (none)

## Never (human)
- The repo must hold no hardcoded credentials or exec_sql (sprint-0/security-scan.test.js:3-6)
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- (none)

## Related (generated)
- docs: `CHANGELOG.md`? · `bot/shared/config/CLAUDE.index.md`? · `bot/shared/services/CLAUDE.index.md`? · `bot/shared/services/reading/CLAUDE.index.md`? · `bot/shared/utils/CLAUDE.index.md`? · `dashboard/lib/CLAUDE.index.md`? (+3)
