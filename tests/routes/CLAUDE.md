# routes — Tests for Flow endpoints and the Slack/Discord modal route layer
Full index: `CLAUDE.index.md`

<!-- kg:meta repo=rumi-platform dir=tests/routes kg=c06c6e9390ed gen=a195abc75dc2 overflow=0 rendered=2026-10-28 kg.py=1.0.0 -->

## Entry points
- `slack-interactions-routes.test.js` — signature check before dispatch
- `discord-flow-registry.test.js` — endpoint wiring into Discord modals
- `student-videos-endpoint.test.js` — video-browse Flow scenarios
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `discord*` | 4 files; most used `discord-flow-registry.test.js`: Pins discord-flow-registry wiring of registration, settings, attendance, exam-confirm and reading endpoints into modals |
| `slack*` | 6 files; most used `slack-flow-registry.test.js`: Pins slack-flow-registry wiring of endpoint modules and views into buildEndpointModal |
| `CLAUDE.index.md` | (unmapped) |
| `student-videos-endpoint.test.js` | Scenario tests for the student-videos Flow endpoint v2: grade, subject, topic screens to SUCCESS |
| `CLAUDE.md` | (unmapped) |
| `attendance-marking-endpoint.test.js` | Pins attendance-marking-endpoint (Slack/Discord modal counterpart of the Flow): session lookup, present/absent records |
| `brief-routes.test.js` | Pins dashboard brief.routes: Morning Brief live page, local-file route and wall-display screen, with express mocked |
| `brief-service.test.js` | Pins dashboard brief.service pure helpers: manifest location, servable local files, wall-display token check |
| `reading-assessment-endpoint.test.js` | Pins reading-assessment-endpoint level and word-count mappings (from flow-response.handler) and init/exchange |

## Who reads this (generated)
- (none)

## Never (human)
_None found in code comments, tests or git log for this directory._
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- (none)

## Related (generated)
- docs: `bot/shared/config/CLAUDE.index.md`? · `bot/shared/routes/CLAUDE.index.md`? · `bot/shared/routes/CLAUDE.md`? · `bot/shared/routes/discord-views/CLAUDE.index.md`? · `bot/shared/routes/discord-views/CLAUDE.md`? · `bot/shared/routes/slack-views/CLAUDE.md`? (+10)
