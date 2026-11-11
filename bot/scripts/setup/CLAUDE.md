# setup — Code behind the rumi CLI: setup wizard, doctor, pair, graduate, Meta registration
Full index: `CLAUDE.index.md`

<!-- kg:meta repo=rumi-platform dir=bot/scripts/setup kg=5f858af5bb29 gen=404b4de7f15d overflow=62 rendered=2026-11-11 kg.py=1.1.0 -->

## Entry points
- `interactive-setup.js` — `rumi setup` wizard, start here
- `flow-configs.js` — which WhatsApp Flows get registered
- `doctor.js` — preflight diagnostics for a deployment
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `assets/` | → (no door; 1 files) |
| `env-file.js` | Patches individual keys in .env in place, preserving other lines; used by setup and graduate |
| `flow-configs.js` | Single source of truth for which WhatsApp Flows a deployment registers; read by registrar and validators |
| `ui.js` | Terminal presentation layer for the rumi CLI; every printed line in setup, graduate, pair, status goes through it |
| `setup-state.js` | Reads and writes .setup-state.json tracking flow, template and encryption registration status |
| … | 21 more → `CLAUDE.index.md` |

## Who reads this (generated)
- table `quizzes` (written by `import-video-quiz-library.js`) ← read by `bot/shared/routes/quiz-flow-endpoint.js:224:2c6afb51`? · `bot/shared/services/quiz/providers/lp-generated.provider.js:84:59272ccd`? (+19)
- `ui.js` ← imported by `bot/console/server.js:53:478a3813` · `bot/scripts/setup/graduate.js:41:48393795` (+6)
- `env-file.js` ← imported by `bot/console/routes/api.js:15:49d2b5a3` · `bot/console/routes/pages.js:19:49d2b5a3` (+5)
- … 27 more → `CLAUDE.index.md`

## Never (human)
- A Flow must be added only in flow-configs.js so registrar and validators stay in step (bot/scripts/setup/flow-configs.js:2)
- Pair the sandbox channel only through baileys-connection; two writers invalidate the session (bot/scripts/setup/link-whatsapp.js:8)
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- `tests/setup/register-all-flows.test.js` (meta-api.js, register-all-flows.js, setup-state.js)
- `tests/setup/validate-flows.test.js` (meta-api.js, setup-state.js, validate-flows.js)
- … 22 more → `CLAUDE.index.md`

## Related (generated)
- skills: `setup`?
- docs: `CHANGELOG.md`? · `bot/scripts/CLAUDE.md`? · `bot/scripts/templates/README.md`? · `docs/console.md`? · `docs/onboarding/sandbox-production-design.md`? · `docs/superpowers/plans/2026-11-11-wizard-three-jacks-and-launch.md`? (+1)
