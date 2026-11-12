# setup — Repo-wide guards and setup-CLI tests: schema, docs, links, requires, CI, hygiene
Full index: `CLAUDE.index.md`

<!-- kg:meta repo=rumi-platform dir=tests/setup kg=f4c4d795292d gen=406056c5bf82 overflow=53 rendered=2026-11-11 kg.py=1.1.0 -->

## Entry points
- `source-hygiene.test.js` — public-repo guards that fail CI on internal ticket ids or internal names in docs
- `schema-completeness.test.js` — every table the bot uses must exist in 00_complete-schema.sql
- `orphan-modules.test.js` — require-graph audit; exceptions live in orphan-modules.allowlist.json
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `_audit-helpers/` | Shared require-graph builder behind the circular, orphan and unresolved-require guards → `_audit-helpers/CLAUDE.md` |
| `register-all-flows.test.js` | Pins registerAllFlows registering the WhatsApp Flows via a mocked MetaAPI and SetupState |
| `validate-flows.test.js` | Pins validate-flows pre-flight checking that all Flows and templates exist and are in the right state |
| `cli-console.test.js` | Pins rumi commands keeping a real console instead of structured-logger's JSON replacement, even via WhatsApp modules |
| `fields.test.js` | Pins that every channel-required var has human prompt copy in fields.js, so no var goes unasked in setup |
| `source-hygiene.test.js` | Public-repo guards: no internal ticket ids or internal names in docs and source, and entry points parse |
| `sql-statements.test.js` | Pins splitSqlStatements and exec-sql-helper handling one command per RPC over the real schema file |
| `bootstrap-db.test.js` | Pins DatabaseBootstrapper applying the three canonical SQL files in order, stopping on error, with injected exec |
| … | 73 more → `CLAUDE.index.md` |

## Who reads this (generated)
- (none)

## Never (human)
- Docs and CLAUDE.md files must not hold ticket ids or internal names (tests/setup/source-hygiene.test.js:39, :44)
- Every allowlist entry must have a real reason of at least 10 characters (tests/setup/circular-deps.test.js:45)
- Test files must live in directories a jest config collects (tests/setup/no-stranded-tests.test.js:44)
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- (none)

## Related (generated)
- skills: `qa-testing`?
- docs: `CHANGELOG.md`? · `CLAUDE.md`? · `TEST_READY.md`? · `bot/marketing/README.md`? · `bot/scripts/setup/CLAUDE.md`? · `docs/customization.md`? (+7)
