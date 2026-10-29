# config — full index (generated)

<!-- kg:index repo=rumi-platform dir=bot/shared/config -->
Every row the door could not hold, ungrouped. Not auto-loaded; same hop as `CLAUDE.md`.

## Children (all, generated)
| path | purpose |
|---|---|
| `__mocks__/` | → (no door; 1 files: 0 test + 1 support) |
| `branding.js` | Env-driven brand config: bot name, website/portal/logo URLs (null when unset) and welcome messages per language |
| `capabilities.config.js` | Lists the bot's user-facing capabilities that capability detection uses to explain what it can do |
| `coaching-audio.js` | Sets the minimum audio length (COACHING_MIN_AUDIO_SECONDS, default 900s) that makes a recording a coaching lesson |
| `coaching-card.config.js` | Per-language copy for the coaching card image, focus-area message and commit buttons |
| `coaching-debrief.config.js` | Coaching model, meta-prompt rules and reflective-question count for the post-analysis debrief |
| `coaching-messages.js` | i18n catalog of coaching pipeline messages sent to teachers, English fallback; getCoachingMessage(key, lang) |
| `discord-country-regions.js` | Continent buckets over the country list for Discord's two-step country picker (25-option menu cap) |
| `feature-availability.js` | Single source of which features are live: presence of env keys, channel driver resolution, operator switch overlay |
| `feature-overrides.js` | Operator OFF switch per feature via env, layered over key-presence gating; can never turn a feature on |
| `gamma-languages.config.js` | Language parameters (RTL/font notes) passed to the Gamma presentation API for en, ur, ar, es |
| `gender-neutral-address.js` | Shared Urdu address rule so prompts speaking to teachers never assume gender |
| `language-config.js` | Per-language settings for reflective-question generation and cultural adaptation |
| `language-prompts.js` | Dialect-specific, code-switching-aware prompt text per language; buildLanguagePrompt(code, name) |
| `model-registry.js` | Resolves which LLM model a job uses at call time (per-job env override, else LLM_MODEL platform default) |
| `passage-backgrounds.json` | Background image paths and fallback colours per reading-assessment level used when rendering passage images |
| `quiz-languages.js` | Reads QUIZ_LANGUAGES to list languages a lesson quiz can use and whether to ask the teacher which |
| `reading-benchmarks.js` | WCPM and LCPM fluency benchmark thresholds by grade and season, replacing numbers once held in SQL RPCs |
| `region-config.js` | Maps a region to its default observation framework via DEFAULT_OBSERVATION_FRAMEWORK / REGION_FRAMEWORK_MAP |
| `registration-data.js` | Country, region, grade and subject dropdown data for the WhatsApp registration Flow |
| `school-clock.js` | School-timezone helpers (SCHOOL_TIMEZONE, QUIET_HOURS): local date/hour for quiz caps and nudge quiet hours |
| `settings-config.js` | Language and observation-framework dropdown data for the WhatsApp settings Flow; narrowable via env |
| `supabase.js` | Supabase client singleton and cold-boot env gate: exits 78 if SUPABASE_URL or service-role key is missing |
| `supported-languages.js` | Canonical language codes, labels, RTL flag and dropdown helpers; the one list other language modules validate against |
| `system-messages.js` | Localised system messages (16 languages) fetched by key via getSystemMessage(key, language) |
| `tts-voices.js` | Picks TTS provider and voice per language with pronunciation notes (native script, Western numerals) |
| `ux-strings.js` | Quiz fixed-copy catalogue (en/ur) plus the language clamp; resolveUx(key, {user, language, params}) renders it |

## Who reads this (all, generated)
- `branding.js` ← imported by `bot/console/routes/pages.js:31:c8e47c32` · `bot/shared/handlers/flow-response.handler.js:661:5b147366` · `bot/shared/handlers/portal-command.handler.js:16:f6ce7d02` · `bot/shared/routes/registration-endpoint.js:54:7a8e3c0a` (+15: `python3 kg/kg.py who-reads branding.js`)
- `capabilities.config.js` ← imported by `bot/shared/services/helper-agent.service.js:363:7bd0abf5`
- `coaching-audio.js` ← imported by `bot/shared/handlers/voice-message.handler.js:773:2ae3bd4c` · `bot/shared/services/observe/observe-audio-router.js:31:a4d76d60` · `bot/whatsapp-bot.js:1765:fd05c91d`
- `coaching-card.config.js` ← imported by `bot/shared/services/coaching/coaching-card/card-image.service.js:12:a3506bc7` · `bot/shared/services/coaching/report-generator.service.js:220:11c3a014`
- `coaching-debrief.config.js` ← imported by `bot/shared/services/coaching/reflective-conversation.service.js:23:50bb8b0b` · `bot/shared/services/gpt5-mini.service.js:1383:425e6f0a`
- `coaching-messages.js` ← imported by `bot/shared/services/coaching/analysis-processor.service.js:22:b8fde5d4` · `bot/shared/services/coaching/coaching-flow-buttons.js:9:b8fde5d4` · `bot/shared/services/coaching/coaching-session.service.js:17:b8fde5d4` · `bot/shared/services/coaching/fidelity/fidelity-report.js:13:9c9510f6` (+6: `python3 kg/kg.py who-reads coaching-messages.js`)
- `discord-country-regions.js` ← imported by `bot/shared/routes/discord-views/registration.view.js:22:f72f4330` · `bot/shared/routes/slack-views/registration.view.js:34:f72f4330`
- `feature-availability.js` ← imported by `bot/console/env-catalog.js:30:9962bd10` · `bot/console/features.js:20:9962bd10` · `bot/console/pipeline-map.js:16:32a14f1b` · `bot/console/routes/api.js:128:d45d9207` (+23: `python3 kg/kg.py who-reads feature-availability.js`)
- `feature-overrides.js` ← imported by `bot/shared/services/coaching/fidelity/fidelity-orchestrator.js:66:75ac4cad` · `bot/shared/services/nudges/teacher-nudges.sweeper.js:44:aaed6883` · `bot/shared/services/observe/observe-gate.js:16:aaed6883` · `bot/shared/services/quiz/transcript-quiz-offer.service.js:75:0358a17e` (+1: `python3 kg/kg.py who-reads feature-overrides.js`)
- `gamma-languages.config.js` ← imported by `bot/shared/services/content.service.js:5:488031ea`
- `gender-neutral-address.js` ← imported by `bot/shared/services/quiz/video-quiz-report.service.js:37:5976149f`
- `language-config.js` ← imported by `bot/shared/services/gpt5-mini.service.js:1373:3cb050f1`
- `language-prompts.js` ← imported by `bot/shared/services/openai.service.js:3:52971b2a` · `bot/shared/services/video/video-script.service.js:10:ebbe105c`
- `model-registry.js` ← imported by `bot/shared/services/llm-client.js:108:fd844b66` · `bot/shared/services/quiz/transcript-quiz-key-verify.service.js:71:e1598755` · `bot/shared/services/quiz/transcript-quiz-llm.js:23:e1598755` · `bot/shared/services/quiz/transcript-quiz-summary-truth.js:33:e1598755` (+2: `python3 kg/kg.py who-reads model-registry.js`)
- `passage-backgrounds.json` ← imported by `bot/shared/services/reading/passage-generation.service.js:37:164e702f`
- `quiz-languages.js` ← imported by `bot/shared/services/quiz/transcript-quiz-language.js:19:cd9fa6e4` · `bot/shared/services/quiz/transcript-quiz-offer.service.js:40:761816bc`
- `reading-benchmarks.js` ← imported by `bot/shared/services/reading/benchmark.service.js:39:014b9dc7`
- `region-config.js` ← imported by `bot/shared/routes/settings-endpoint.js:28:6c2883c3` · `bot/shared/services/coaching/frameworks/framework-selector.js:22:a4e4f557` · `bot/shared/config/settings-config.js:16:4b6af7a2`
- `registration-data.js` ← imported by `bot/shared/routes/discord-views/registration.view.js:23:ad16948e` · `bot/shared/routes/registration-endpoint.js:43:02c1a012` · `bot/shared/routes/slack-modal-interactions.handler.js:51:9d2291a9`
- `school-clock.js` ← imported by `bot/shared/services/limits/daily-caps.js:30:c2701331` · `bot/shared/services/quiz/providers/lp-generated.provider.js:28:d6c60a51` · `bot/shared/services/quiz/providers/topic.provider.js:28:d6c60a51` · `bot/shared/services/quiz/quiz-daily-cap.js:20:c2701331` (+6: `python3 kg/kg.py who-reads school-clock.js`)
- `settings-config.js` ← imported by `bot/shared/routes/settings-endpoint.js:27:bcd9de0c`
- `supabase.js` ← imported by `bot/scripts/attendance/link-school.js:25:50ccc192` · `bot/scripts/observe-roster.js:30:f5aef224` · `bot/scripts/testpaper/import-curriculum-corpus.js:352:1212d80c` · `bot/shared/database/bot-helpers.js:6:fcf3ec1a` (+135: `python3 kg/kg.py who-reads supabase.js`)
- `supported-languages.js` ← imported by `bot/shared/handlers/image-message.handler.js:432:56d296f3` · `bot/shared/services/language-detector.service.js:3:91bc3638` · `bot/shared/services/messaging/baileys-channel.service.js:644:cef13774` · `bot/shared/services/messaging/discord-channel.service.js:576:cef13774` (+16: `python3 kg/kg.py who-reads supported-languages.js`)
- `tts-voices.js` ← imported by `bot/console/pipeline-map.js:149:5400166f` · `bot/shared/services/openai.service.js:4:39e31adf`
- `ux-strings.js` ← imported by `bot/shared/services/lesson-plan-availability.js:16:90174631` · `bot/shared/services/quiz/providers/lp-generated.provider.js:27:25374c99` · `bot/shared/services/quiz/providers/topic.provider.js:27:25374c99` · `bot/shared/services/quiz/quiz-menu-entry.service.js:24:55a7aecc` (+22: `python3 kg/kg.py who-reads ux-strings.js`)
- env `BOT_NAME` read at `bot/shared/config/branding.js:17:70091041`
- env `COACHING_MIN_AUDIO_SECONDS` read at `bot/shared/config/coaching-audio.js:12:23215d2b`
- env `DEFAULT_LANGUAGE` read at `bot/shared/config/branding.js:21:d2c3924a`
- env `DEFAULT_OBSERVATION_FRAMEWORK` read at `bot/shared/config/region-config.js:24:6711fff0`
- env `ORG_NAME` read at `bot/shared/config/branding.js:18:d13c8486`
- env `QUIET_HOURS` read at `bot/shared/config/school-clock.js:101:67d575b1`
- env `QUIZ_LANGUAGES` read at `bot/shared/config/quiz-languages.js:24:85862c54`
- env `REGION_FRAMEWORK_MAP` read at `bot/shared/config/region-config.js:30:d5d66a10`
- env `SCHOOL_TIMEZONE` read at `bot/shared/config/school-clock.js:35:d8524a95`
- env `SECURITY_CONTACT` read at `bot/shared/config/branding.js:20:6c57bf5e`
- env `SETTINGS_LANGUAGES` read at `bot/shared/config/settings-config.js:29:1e767a67`
- env `SUPABASE_SERVICE_ROLE_KEY` read at `bot/shared/config/supabase.js:22:08b79576`
- env `SUPABASE_URL` read at `bot/shared/config/supabase.js:21:58448145`
- env `SUPPORT_CONTACT` read at `bot/shared/config/branding.js:19:76976524`

## Tests (all, generated)
- `branding.js` ← `tests/observe/observe-coach-card.test.js` · `tests/quiz/plan-quiz-pdf.test.js` · `tests/quiz/video-quiz-join-invite.test.js`
- `coaching-audio.js` ← `tests/coaching/fidelity/classroom-audio-threshold.test.js`
- `coaching-debrief.config.js` ← `tests/coaching/coaching-debrief-config.test.js`
- `coaching-messages.js` ← `tests/coaching/fidelity/lp-step-flow.test.js` · `tests/setup/no-hardcoded-coaching-strings.test.js`
- `discord-country-regions.js` ← `tests/config/discord-country-regions.test.js` · `tests/routes/slack-views.test.js`
- `feature-availability.js` ← `tests/coaching/fidelity/fidelity-feature-entry.test.js` · `tests/console/channel-cards.test.js` · `tests/console/feature-overrides.test.js` · `tests/dashboard/portal-channels.test.js` · `tests/limits/expensive-job-caps.test.js` · `tests/limits/lesson-plan-availability.test.js` (+16: `python3 kg/kg.py who-reads bot/shared/config/feature-availability.js`)
- `feature-overrides.js` ← `tests/coaching/fidelity/fidelity-feature-entry.test.js` · `tests/console/feature-overrides.test.js` · `tests/observe/observe-gate.test.js` · `tests/observe/observe-portal-coach.service.test.js` · `tests/quiz/video-quiz-typed-answer-gate.test.js`
- `gamma-languages.config.js` ← `tests/language/french-language.test.js` · `tests/language/indian-languages.test.js`
- `language-config.js` ← `tests/coaching/coaching-debrief-config.test.js`
- `language-prompts.js` ← `tests/language/french-language.test.js` · `tests/language/indian-languages.test.js`
- `model-registry.js` ← `tests/exam-checker/exam-vision-engine.test.js` · `tests/testpaper/model-registry.test.js` · `tests/unit/llm-client-for-model.test.js`
- `quiz-languages.js` ← `tests/config/quiz-languages.test.js`
- `reading-benchmarks.js` ← `tests/reading/benchmark-service.test.js`
- `region-config.js` ← `tests/settings/settings-flow.test.js`
- `registration-data.js` ← `tests/config/discord-country-regions.test.js` · `tests/routes/slack-views.test.js`
- `school-clock.js` ← `tests/config/school-clock.test.js` · `tests/quiz/transcript-quiz-teacher-language.test.js` · `tests/quiz/video-report-timing.test.js`
- `settings-config.js` ← `tests/settings/settings-flow.test.js`
- `supabase.js` ← `bot/tests/registration/bug-002-registration-recovery.test.js` · `bot/tests/video/style-selection.test.js` · `tests/coaching/lp-coaching-link.test.js` · `tests/database/get-or-create-user-by-channel.test.js` · `tests/exam-checker/exam-cancel-name-pending.test.js` · `tests/exam-checker/grading-service.test.js` (+58: `python3 kg/kg.py who-reads bot/shared/config/supabase.js`)
- `supported-languages.js` ← `tests/language/french-language.test.js` · `tests/language/indian-languages.test.js`
- `tts-voices.js` ← `tests/language/french-language.test.js` · `tests/language/indian-languages.test.js`
- `ux-strings.js` ← `tests/quiz/base-ten-thousands.test.js` · `tests/quiz/lesson-quiz-teacher-small.test.js` · `tests/quiz/multi-question-card.test.js` · `tests/quiz/plan-quiz-failure-reasons.test.js` · `tests/quiz/plan-quiz-key-check.test.js` · `tests/quiz/plan-quiz-strings.test.js` (+16: `python3 kg/kg.py who-reads bot/shared/config/ux-strings.js`)

## Related (all, generated)
- skills: `digital-coach`? · `setup`?
- docs: `.github/CONTRIBUTING.md`? · `AGENTS.md`? · `CHANGELOG.md`? · `CLAUDE.md`? · `bot/shared/CLAUDE.md`? · `docs/agent-customization.md`? · `docs/architecture.md`? · `docs/console.md`? · `docs/customization.md`? · `docs/features/exam-checker.md`? · `docs/features/lesson-quiz.md`? · `docs/features/test-papers.md`? · `docs/onboarding/api-keys.md`? · `docs/onboarding/sandbox-production-design.md`? · `docs/pulling-updates.md`? · `portal/ANDROID.md`?
