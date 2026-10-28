# coaching — full index (generated)

<!-- kg:index repo=rumi-platform dir=tests/coaching -->
Every row the door could not hold, ungrouped. Not auto-loaded; same hop as `CLAUDE.md`.

## Children (all, generated)
| path | purpose |
|---|---|
| `fidelity/` | Tests for lesson-plan fidelity: extract moves, grade recording, score, report → `fidelity/CLAUDE.md` |
| `report-transformers/` | → (no door; 2 test files) |
| `CLAUDE.index.md` | (unmapped) |
| `CLAUDE.md` | (unmapped) |
| `analyze-pedagogy-framework-dispatch.test.js` | Pins that analyzePedagogy's framework argument really drives prompt and scoring, not a hardcoded OECD path |
| `coaching-card.test.js` | Pins prioritized-action generation, card image and send/button handling for coaching cards |
| `coaching-debrief-config.test.js` | Pins NUM_REFLECTIVE_QUESTIONS as the single source for the loop bound, prompt text and few-shot arms |
| `coaching-excel-export-excludes-observations.test.js` | Pins the coaching-sessions Excel export omitting a coach's observation rows from a teacher's own sessions |
| `coaching-flow-integration.test.js` | Pins glue wiring photo prompt, coaching card and LP selection list into the coaching flow |
| `coaching-session-recipient-identifier.test.js` | Pins initiateSession storing recipient_identifier verbatim (WhatsApp number or Slack-prefixed) for later delivery |
| `coaching-trend-excludes-observations.test.js` | Pins loadTrendData leaving a coach's observation rating out of a teacher's own score trend |
| `commitment-card-content.test.js` | Pins commitment-card Q3 extraction, output shape and per-language rules (Urdu, Kiswahili) in the prompt |
| `commitment-card-fallback.test.js` | Pins the commitment card degrade ladder to the rule-based card when Q3, the LLM or its JSON fails |
| `elevenlabs-lazy-openai.test.js` | Pins ElevenLabsService building its OpenAI TTS-fallback client lazily with a clear error if the key is missing |
| `fico-framework.test.js` | Pins the FICO framework module interface: 5 domains, 17 indicators, 1-4 scale, photo-aware indicators |
| `framework-registry.test.js` | Pins the lazy framework registry and selector returning the right framework module per key |
| `framework-wiring.test.js` | Pins analysis-processor and coaching.service resolving the framework via selectFramework, env-driven region map |
| `hero-narrative-corpus.test.js` | Pins the hero narrative prompt pulling reflective_corpus throughline and moments |
| `hero-render-fallback.test.js` | Pins the hero renderer falling back to PDFKit on failure and never calling it on success |
| `hero-report-scoreless.test.js` | Pins generateHeroReport({scoreless}) omitting percentage, marks, scorecard and trend, with a beforeRender hook |
| `hots-framework-alignment.test.js` | Pins HOTS matching the PESRP/PECTAA spec: 16 indicators, 5 areas, scale 1-3, max 48 |
| `hots-framework.test.js` | Pins the HOTS framework module interface and constants, 5 areas, 16 indicators, max 48 |
| `lp-coaching-link.test.js` | Pins the LP selection list builder, LP linking to a coaching session and framework-aware prompts |
| `multi-framework-report-integration.test.js` | Pins analysis to dispatch to transformer to reportData for all four frameworks, with PDF not crashing |
| `oecd-framework.test.js` | Pins the OECD framework module interface and max marks 103 extracted from the inline logic |
| `own-coaching-missing-column.test.js` | Pins one-time probing of coaching_sessions.observation_type so pre-migration deployments skip the filter |
| `reflective-conversation-v12-wiring.test.js` | Source-level guard that reflective-conversation.service uses reflective_corpus and the v12 question generator |
| `reflective-corpus-extraction.test.js` | Pins extractReflectiveCorpus output shape and that enhanceAnalysisWithReflections re-attaches the corpus |
| `reflective-v12-question-chain.test.js` | Pins the v12 Q1/Q2/Q3 reflective chain: corpus-only Q1, guardrail retry, safe fallback, TTS script gates |
| `render-commitment-card-image.test.js` | Pins buildCardHtml script, direction, highlight wrapping and bidi spans for the commitment card, no browser needed |
| `report-pdf-url-not-logged.test.js` | Pins generateReport storing the public report URL on the session but never logging it or its path |
| `report-renderer-registry.test.js` | Pins getReportRenderer: hero design for OECD/HOTS/TEACH/FICO/MEWAKA, PDFKit for unknown frameworks |
| `score-adapters.test.js` | Pins per-framework score adapters and buildScoreViewModel group counts, names and pct rows for the hero template |
| `stale-session-worker-recipient-identifier.test.js` | Pins stale-session.worker sending reminders and auto-complete notices to recipient_identifier, not users.phone_number |
| `stuck-session-ignores-observations.test.js` | Pins the unfinished-session prompt never offering or failing a coach's observation row as the teacher's own |
| `teach-framework.test.js` | Pins the Teach framework module: 3 areas, 9 elements, time-on-task, max 50 |
| `teacher-facing-reads-ignore-observations.test.js` | Pins chat context, /status, last-use, quiz nudge and reminders all ignoring a coach's observation rows |
| `teacher-own-history-excludes-observations.test.js` | Pins fetchAndCompressPriorFeedback leaving a coach's observation and growth areas out of a teacher's history |

## Who reads this (all, generated)
- (none)

## Tests (all, generated)
- (none)

## Related (all, generated)
- docs: `bot/scripts/CLAUDE.index.md`? · `bot/scripts/CLAUDE.md`? · `bot/shared/config/CLAUDE.index.md`? · `bot/shared/handlers/CLAUDE.index.md`? · `bot/shared/services/CLAUDE.index.md`? · `bot/shared/services/CLAUDE.md`? · `bot/shared/services/coaching/CLAUDE.index.md`? · `bot/shared/services/coaching/coaching-card/CLAUDE.index.md`? · `bot/shared/services/coaching/coaching-card/CLAUDE.md`? · `bot/shared/services/coaching/frameworks/CLAUDE.index.md`? · `bot/shared/services/coaching/frameworks/CLAUDE.md`? · `bot/shared/services/coaching/lp-coaching/CLAUDE.index.md`? · `bot/shared/services/coaching/lp-coaching/CLAUDE.md`? · `bot/shared/services/coaching/reflective-questions/CLAUDE.index.md`? · `bot/shared/services/coaching/reflective-questions/CLAUDE.md`? · `bot/shared/services/coaching/report-transformers/CLAUDE.index.md`? · `bot/shared/services/coaching/report-transformers/CLAUDE.md`? · `bot/shared/services/coaching/report-v2/CLAUDE.index.md`? · `bot/shared/services/coaching/report-v2/CLAUDE.md`? · `bot/shared/services/coaching/report-v2/score-adapters/CLAUDE.index.md`? · `bot/shared/services/coaching/report-v2/score-adapters/CLAUDE.md`? · `bot/shared/services/quiz/CLAUDE.index.md`? · `bot/shared/utils/CLAUDE.index.md`? · `bot/workers/CLAUDE.index.md`? · `docs/CLAUDE.index.md`? · `docs/customization.md`? · `tests/CLAUDE.index.md`? · `tests/CLAUDE.md`? · `tests/coaching/CLAUDE.index.md`? · `tests/coaching/CLAUDE.md`? · `tests/coaching/fidelity/CLAUDE.index.md`? · `tests/coaching/fidelity/CLAUDE.md`?
