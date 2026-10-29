# lp-coaching — full index (generated)

<!-- kg:index repo=rumi-platform dir=bot/shared/services/coaching/lp-coaching -->
Every row the door could not hold, ungrouped. Not auto-loaded; same hop as `CLAUDE.md`.

## Children (all, generated)
| path | purpose |
|---|---|
| `lp-coaching-linker.service.js` | Links a picked lesson plan to a coaching_sessions row or starts the upload path; called on list selection |
| `lp-framework-prompt.service.js` | Framework-specific extra instructions for LP generation prompts; no non-test importer found (dead) |
| `lp-list-selection.handler.js` | Handles lp_select/lp_upload/lp_none taps, tells the teacher, then queues analysis or recomputes fidelity |
| `lp-selection-list.service.js` | Builds the WhatsApp lesson-plan picker list, falling back to yes/no buttons when no plans exist |
| `lp-step.service.js` | Moves a coaching session to awaiting_lesson_plan and sends the picker; fidelity-gated list versus yes/no |
| `lp-text-paste.service.js` | Treats a long pasted text message as the lesson plan for an awaiting session and queues analysis |
| `send-lp-prompt.js` | Sends the plan picker as a list or buttons, falling back to buttons if refused; returns true only if sent |

## Who reads this (all, generated)
- `lp-coaching-linker.service.js` ← imported by `bot/shared/services/observe/observe-plan.service.js:252:8f3ba366` · `bot/shared/services/coaching/lp-coaching/lp-list-selection.handler.js:45:8a1e0988`
- `lp-list-selection.handler.js` ← imported by `bot/whatsapp-bot.js:1382:c545b31c`
- `lp-selection-list.service.js` ← imported by `bot/shared/services/coaching/lp-coaching/lp-step.service.js:51:1eff0405`
- `lp-step.service.js` ← imported by `bot/shared/handlers/image-message.handler.js:45:929722df` · `bot/shared/services/coaching/coaching-flow-buttons.js:23:b4b51525` · `bot/shared/services/observe/observe-plan.service.js:135:8bc38f23` · `bot/shared/services/coaching/lp-coaching/lp-list-selection.handler.js:15:8e892d9d`
- `lp-text-paste.service.js` ← imported by `bot/shared/handlers/text-message.handler.js:323:1be00eda`
- `send-lp-prompt.js` ← imported by `bot/shared/services/coaching/lp-coaching/lp-step.service.js:52:211ee0be`
- column `coaching_sessions.conversation_state` (written by `lp-step.service.js`) ← read by `bot/scripts/generate-coaching-excel.js:40:950960b9` · `bot/shared/handlers/image-message.handler.js:108:d4e5cc64` · `bot/shared/handlers/text-message.handler.js:1331:a619795a` · `bot/shared/services/coaching/coaching-flow-buttons.js:30:d2932917` (+4: `python3 kg/kg.py who-reads coaching_sessions.conversation_state`)
- column `coaching_sessions.lesson_plan_extraction_status` (written by `lp-text-paste.service.js`) ← read by `bot/shared/services/coaching/analysis-processor.service.js:55:dc343fc4` · `bot/shared/services/coaching/fidelity/fidelity-session.js:33:06d93c0a`
- column `coaching_sessions.lesson_plan_link_method` (written by `lp-coaching-linker.service.js`, `lp-text-paste.service.js`) ← read by `bot/shared/services/coaching/analysis-processor.service.js:55:dc343fc4` · `bot/shared/services/coaching/fidelity/fidelity-recompute.service.js:26:27a77faa` · `bot/shared/services/coaching/fidelity/fidelity-session.js:33:06d93c0a`
- column `coaching_sessions.lesson_plan_text` (written by `lp-coaching-linker.service.js`, `lp-text-paste.service.js`) ← read by `bot/scripts/generate-coaching-excel.js:36:be418e61` · `bot/shared/services/coaching/analysis-processor.service.js:55:dc343fc4` · `bot/shared/services/coaching/fidelity/fidelity-recompute.service.js:26:27a77faa` · `bot/shared/services/coaching/fidelity/fidelity-session.js:33:06d93c0a` (+1: `python3 kg/kg.py who-reads coaching_sessions.lesson_plan_text`)
- column `coaching_sessions.linked_lesson_plan_id` (written by `lp-coaching-linker.service.js`, `lp-text-paste.service.js`) ← read by `bot/shared/services/coaching/analysis-processor.service.js:55:dc343fc4` · `bot/shared/services/coaching/fidelity/fidelity-recompute.service.js:26:27a77faa` · `bot/shared/services/coaching/fidelity/fidelity-session.js:33:06d93c0a`
- column `coaching_sessions.status` (written by `lp-step.service.js`, `lp-text-paste.service.js`) ← read by `bot/scripts/generate-coaching-excel.js:41:48a3661d` · `bot/shared/handlers/image-message.handler.js:110:bba4595e` · `bot/shared/handlers/text-message.handler.js:1264:21a55915` · `bot/shared/handlers/voice-message.handler.js:703:21a55915` (+26: `python3 kg/kg.py who-reads coaching_sessions.status`)
- table `coaching_sessions` whole row (`*`) (written by `lp-coaching-linker.service.js`, `lp-step.service.js`, `lp-text-paste.service.js`) ← read by `bot/shared/handlers/text-message.handler.js:1262:d2b02c3e`? · `bot/shared/handlers/voice-message.handler.js:701:d2b02c3e`? · `bot/shared/routes/observe-form-endpoint.js:127:d2b02c3e`? · `bot/shared/services/coaching-orchestrator.service.js:224:d2b02c3e`? (+12: `python3 kg/kg.py who-reads coaching_sessions`)
- table `coaching_sessions` (written by `lp-coaching-linker.service.js`, `lp-step.service.js`, `lp-text-paste.service.js`) ← read by `bot/scripts/generate-coaching-excel.js:27:5911672a`? · `bot/shared/handlers/image-message.handler.js:107:5911672a`? · `bot/shared/handlers/text-message.handler.js:1261:5911672a`? · `bot/shared/handlers/voice-message.handler.js:700:5911672a`? (+50: `python3 kg/kg.py who-reads coaching_sessions`)
- env `LP_FIDELITY_LIST_LIMIT` read at `bot/shared/services/coaching/lp-coaching/lp-step.service.js:19:58249634`

## Tests (all, generated)
- `lp-coaching-linker.service.js` ← `tests/coaching/coaching-flow-integration.test.js` · `tests/coaching/lp-coaching-link.test.js`
- `lp-framework-prompt.service.js` ← `tests/coaching/coaching-flow-integration.test.js` · `tests/coaching/lp-coaching-link.test.js`
- `lp-list-selection.handler.js` ← `tests/coaching/fidelity/lp-step-flow.test.js`
- `lp-selection-list.service.js` ← `tests/coaching/coaching-flow-integration.test.js` · `tests/coaching/fidelity/lp-step-flow.test.js` · `tests/coaching/lp-coaching-link.test.js`
- `lp-step.service.js` ← `tests/coaching/fidelity/lp-step-flow.test.js`
- `lp-text-paste.service.js` ← `tests/coaching/fidelity/lp-step-flow.test.js`

## Related (all, generated)
- docs: `bot/shared/services/coaching/CLAUDE.md`?
