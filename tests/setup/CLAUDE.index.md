# setup — full index (generated)

<!-- kg:index repo=rumi-platform dir=tests/setup -->
Every row the door could not hold, ungrouped. Not auto-loaded; same hop as `CLAUDE.md`.

## Children (all, generated)
| path | purpose |
|---|---|
| `_audit-helpers/` | Shared require-graph builder behind the circular, orphan and unresolved-require guards → `_audit-helpers/CLAUDE.md` |
| `accepted-advisories.test.js` | Pins that SECURITY.md documents the accepted matrix-bot-sdk request advisory while the lockfile still has it |
| `asset-references.test.js` | Guards that every code path reading bot/marketing assets handles the file being absent in a fresh clone |
| `bin-rumi.test.js` | Pins the bin/rumi.js CLI dispatcher routing commands to handlers, by swapping the exported COMMANDS for spies |
| `bootstrap-db.test.js` | Pins DatabaseBootstrapper applying the three canonical SQL files in order, stopping on error, with injected exec |
| `ci-workflow-jobs-always-runnable.test.js` | Guards against GitHub workflows whose only job is gated on secrets, which reports run failed when unset |
| `ci-workflow-no-silent-masks.test.js` | Guards against workflow steps ending in || true that silently mask failing checks |
| `circular-deps.allowlist.json` | Lists tolerated require cycles with a reason each, read by circular-deps.test.js |
| `circular-deps.test.js` | Runs Tarjan SCC on the bot's static require graph and fails on any cycle not in the allowlist |
| `cli-console.test.js` | Pins rumi commands keeping a real console instead of structured-logger's JSON replacement, even via WhatsApp modules |
| `column-completeness.test.js` | Checks every column the bot writes or reads exists in 00_complete-schema.sql, including ALTER ADD COLUMN reconciles |
| `config-overrides.test.js` | Pins env-var overrides of constants (voice IDs, rate-limit threshold) in utils/constants |
| `customization-doc-accuracy.test.js` | Fails if docs/customization.md cites a file path that does not exist, keeping the agent map accurate |
| `db-setup.test.js` | Pins db-setup telling apart the three Supabase states: ready, no tables, and no way to create them |
| `doctor-wording.test.js` | Pins npm run doctor copy: optional vars do not claim the bot will not start; dual-gate notes are shown |
| `doctor.test.js` | Pins doctor preflight: missing required vars fail, throwing probes report fail, features follow env keys |
| `entry-require-main-gates.test.js` | Pins that every entry file gates its start call behind require.main === module so it can be required safely |
| `env-file.test.js` | Pins env-file readEnvFile/writeEnvVars patching only the given keys, never regenerating an existing .env |
| `env-template-completeness.test.js` | Fails if a process.env variable used in bot/ code is missing from .env.template |
| `exec-sql-service-role-only.test.js` | Pins that every snippet creating the exec_sql helper revokes it from public, anon and authenticated |
| `fake-io.js` | Fake prompt IO with per-method answer queues that records questions, so setup wizard steps test as behaviour |
| `fields.test.js` | Pins that every channel-required var has human prompt copy in fields.js, so no var goes unasked in setup |
| `flow-config-conformance.test.js` | Keeps FLOW_CONFIGS, shipped Flow JSON, *_FLOW_ID env reads and mounted Flow endpoints in agreement |
| `flow-configs-paths.test.js` | Pins that every Flow JSON in FLOW_CONFIGS exists on disk and is the one set shared by registrar and validators |
| `flow-gates-channel-aware.test.js` | Pins that Flow-id gates go through nativeFlowIdFor so Matrix and Baileys teachers take the no-Flow path |
| `flow-key-consistency.test.js` | Pins that setup-state and validate-flows require exactly the flows register-all-flows registers |
| `graduate.test.js` | Pins the rumi graduate command: arg parsing, credential validation via doctor's probe, outgoing-state retirement |
| `interactive-setup.test.js` | Pins the rumi setup wizard's behaviour through fake-io: questions asked, wording, .env writes, cheap re-runs |
| `lesson-quiz-migration.test.js` | Pins the lesson-quiz V2.9.0 migration as one atomic DO block, safe to re-run and via migrate.js |
| `link-integrity.test.js` | Fails if any relative markdown link in CLAUDE.md files and .claude skills points at a missing file or directory |
| `llm-single-entry-point.test.js` | Fails if a bot service builds its own OpenAI client instead of calling shared/services/llm-client |
| `local-stack-mint-jwt.test.js` | Pins infrastructure/local/mint-jwt.js minting an HS256 JWT with the role claim PostgREST requires |
| `local-stack-rest-proxy.test.js` | Pins infrastructure/local/rest-proxy.js stripping the /rest/v1 prefix and forwarding the rest untouched |
| `local-stack-scripts.test.js` | Static guards for infrastructure/local up.sh, down.sh and supabase-shim.sql: syntax, roles, pgvector line |
| `local-stack-state-dir.test.js` | Pins up.sh refusing a non-empty unmarked state dir so down.sh --wipe cannot delete a user directory |
| `matrix-sample-data.test.js` | Fails if Matrix channel sources, tests or env docs hold real-looking phone numbers or person names |
| `meta-api.test.js` | Pins the MetaAPI client in scripts/setup/meta-api used for Flow and template registration calls |
| `migrate-cli.test.js` | Pins infrastructure/scripts/migrate.js running from the repo root: falls back to bot's supabase-js and reads .env |
| `migrate.test.js` | Pins the migrate.js runner against a mocked supabase-js: ordering, checksums and applied-version tracking |
| `no-compiled-files.test.js` | Fails if a compiled Python file (.pyc) is tracked, since it leaks build paths and goes stale |
| `no-conflict-markers.test.js` | Fails if any tracked text file, notably SQL schema, has a leftover merge-conflict marker line |
| `no-eager-sdk-construction.test.js` | Fails if an SDK client is constructed at module load, which crashes cold boot when its key is unset |
| `no-file-urls-in-logs.test.js` | Fails if code logs an openable file URL (presigned R2/S3, r2.dev, public export) of a teacher's file |
| `no-hardcoded-brand-urls.test.js` | Fails if bot, dashboard, portal or scripts hardcode upstream brand domains instead of config/branding |
| `no-hardcoded-coaching-strings.test.js` | Fails if new coaching services hardcode English user-facing strings instead of config/coaching-messages |
| `no-legacy-coaching-monolith.test.js` | Ratchet keeping the deleted coaching.service.js monolith and its worker from coming back |
| `no-placeholder-fallback.test.js` | Fails if placeholder URLs like your-domain.com appear as defaults for brand env vars in shipped code |
| `no-stranded-tests.test.js` | Fails if a test file sits outside the three directories the root, bot and dashboard jest configs collect |
| `no-undefined-redis-methods.test.js` | Fails if bot code calls a redisService method that railway-redis.service does not export |
| `no-undefined-whatsapp-methods.test.js` | Fails if bot code calls a WhatsAppService method the class never defines |
| `node-version-policy.test.js` | Pins one Node policy (22 or newer, CI on 22 and 24) across docs, package engines and workflows |
| `orphan-modules.allowlist.json` | Lists bot modules intentionally unreachable from entry points, each with a reason, read by orphan-modules.test.js |
| `orphan-modules.test.js` | Fails if a services, handlers, storage, utils or config module is unreachable by require and not allowlisted |
| `portal-access-schema.test.js` | Pins released SQL creating the portal_app_user role and feature_permissions rows the dashboard's RBAC needs |
| `procfile-targets-resolve.test.js` | Ratchet that every Procfile process command points at an existing file, e.g. sqs-worker, not a missing worker |
| `prompt.test.js` | Pins the CLI prompt layer: validators can reject, Enter keeps the current value, secrets are previewed masked |
| `register-all-flows.test.js` | Pins registerAllFlows registering the WhatsApp Flows via a mocked MetaAPI and SetupState |
| `register-all-templates.test.js` | Pins registerAllTemplates registering WhatsApp message templates via a mocked MetaAPI and SetupState |
| `schema-completeness.test.js` | Fails if a Supabase table referenced in bot code lacks a CREATE TABLE in 00_complete-schema.sql |
| `schema-production-parity.test.js` | Pins 00_complete-schema.sql carrying the production database's tables, functions, triggers and indexes |
| `schema-rerun-quiz-status.test.js` | Pins the schema re-run dropping and re-adding the quizzes status CHECK so offered, declined, skipped are accepted |
| `security.test.js` | Pins no hardcoded INTERNAL_API_KEY default in whatsapp-bot.js and a production warning for localhost MMS_SERVICE_URL |
| `setup-encryption.test.js` | Pins setupEncryption generating an RSA-2048 keypair and registering the public key with Meta for Flow encryption |
| `setup-state.test.js` | Pins SetupState persisting flow, template and encryption registration status in .setup-state.json |
| `setup-validator.test.js` | Pins validateBootRequirements checking Flow-related env vars at boot in utils/setup-validator |
| `skill-md-video-claims.test.js` | Fails if the setup SKILL.md says R2 keys are required for video, which reads KIE_API_KEY and a feature flag |
| `source-hygiene.test.js` | Public-repo guards: no internal ticket ids or internal names in docs and source, and entry points parse |
| `sql-statements.test.js` | Pins splitSqlStatements and exec-sql-helper handling one command per RPC over the real schema file |
| `status.test.js` | Pins rumi status reporting whether a Rumi process is up and which WhatsApp account it answers as, from disk files |
| `table-usage-conformance.test.js` | Fails if a table in the consolidated schema is never referenced in bot, dashboard or infrastructure code |
| `test-connections-output.test.js` | Pins validate:connections printing honest messages instead of all-successful when every check was skipped |
| `ui.test.js` | Pins the CLI presentation layer: colour off when not a terminal and box widths from printed width |
| `unresolved-requires.allowlist.json` | Lists intentional try/catch requires of stripped files, each with a reason, read by unresolved-requires.test.js |
| `unresolved-requires.test.js` | Fails if a reachable require points at a missing file unless try/catch-wrapped and allowlisted |
| `unused-deps.test.js` | Fails if a bot/package.json dependency is never required from shipped code |
| `validate-flows.test.js` | Pins validate-flows pre-flight checking that all Flows and templates exist and are in the right state |
| `validators.test.js` | Pins paste-mistake catches in setup validators, e.g. the anon key given where the service key is wanted |
| `version-check.test.js` | Pins checkForUpdates in utils/version-check querying the GitHub latest-release API and handling failures |
| `version-single-source.test.js` | Pins the version being read only from package.json, with no bot/VERSION file reader left |
| `webhook-instructions.test.js` | Pins webhookInstructions: Meta webhook steps print only for deployments with WhatsApp, never Verify Token undefined |
| `worker-boot.test.js` | Forks each web and worker entry point with minimal env and fails if its require chain errors at load time |

## Who reads this (all, generated)
- (none)

## Tests (all, generated)
- (none)

## Related (all, generated)
- skills: `qa-testing`?
- docs: `CHANGELOG.md`? · `CLAUDE.md`? · `TEST_READY.md`? · `bot/marketing/README.md`? · `bot/scripts/setup/CLAUDE.md`? · `docs/customization.md`? · `docs/onboarding/sandbox-production-design.md`? · `infrastructure/local/CLAUDE.md`? · `infrastructure/scripts/CLAUDE.md`? · `tests/CLAUDE.md`?
