# setup — Repo-wide guards and setup-CLI tests: schema, docs, links, requires, CI, hygiene
Full index: `CLAUDE.index.md`

<!-- kg:meta repo=rumi-platform dir=tests/setup kg=460f0b3eac44 gen=1fe94f28d481 overflow=56 rendered=2026-10-28 kg.py=1.0.0 -->

## Entry points
- `source-hygiene.test.js` — public-repo guards that fail CI on internal ticket ids or internal names in docs
- `schema-completeness.test.js` — every table the bot uses must exist in 00_complete-schema.sql
- `orphan-modules.test.js` — require-graph audit; exceptions live in orphan-modules.allowlist.json
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `_audit-helpers/` | Shared require-graph builder behind the circular, orphan and unresolved-require guards → `_audit-helpers/CLAUDE.md` |
| `CLAUDE.index.md` | (unmapped) |
| `register-all-flows.test.js` | Pins registerAllFlows registering the WhatsApp Flows via a mocked MetaAPI and SetupState |
| `validate-flows.test.js` | Pins validate-flows pre-flight checking that all Flows and templates exist and are in the right state |
| `cli-console.test.js` | Pins rumi commands keeping a real console instead of structured-logger's JSON replacement, even via WhatsApp modules |
| `fields.test.js` | Pins that every channel-required var has human prompt copy in fields.js, so no var goes unasked in setup |
| `flow*` | 4 files; most used `flow-key-consistency.test.js`: Pins that setup-state and validate-flows require exactly the flows register-all-flows registers |
| … | 56 more → `CLAUDE.index.md` |

## Who reads this (generated)
- env read here: `ASSET_BASE_URL` · `HOME` · `INTERNAL_API_KEY` · `MMS_SERVICE_URL` · `NODE_ENV` · `PATH` · `RUMI_CLI` · `SUPABASE_URL`

## Never (human)
- Docs and CLAUDE.md files must not hold ticket ids or internal names (tests/setup/source-hygiene.test.js:39, :44)
- Every allowlist entry must have a real reason of at least 10 characters (tests/setup/circular-deps.test.js:45)
- Test files must live in directories a jest config collects (tests/setup/no-stranded-tests.test.js:44)
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- (none)

## Related (generated)
- skills: `qa-testing`?
- docs: `.claude/CLAUDE.index.md`? · `.claude/CLAUDE.md`? · `CHANGELOG.md`? · `CLAUDE.md`? · `TEST_READY.md`? · `bot/marketing/README.md`? (+18)
