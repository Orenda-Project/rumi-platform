# services — Feature services of the bot: attendance, LP, coaching, quiz, reading, video, messaging
Full index: `CLAUDE.index.md`

<!-- kg:meta repo=rumi-platform dir=bot/shared/services kg=abb97688e908 gen=d5fccab43fe2 overflow=281 rendered=2026-10-28 kg.py=1.0.0 -->

## Entry points
- `whatsapp.service.js` — facade over the active messaging driver (Meta/Baileys); every send call goes through it
- `region-features.service.js` — DB-driven region gating (region_features table) instead of hardcoded region checks
- `CLAUDE.md` — map of the feature subfolders (quiz, reading, video, queue...) and which handler calls each
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| 14 sub-dirs, each with `CLAUDE.md` | `cache/` · `coaching/` · `exam-checker/` · `limits/` · `messaging/` · `nudges/` · `observe/` · `pedagogy/` · `pic-to-lp/` · `queue/` · `quiz/` · `reading/` · `testpaper/` · `video/` |
| 1 sub-dirs without a door | `__mocks__/` (16 tests) |
| … | 41 more → `CLAUDE.index.md` |

## Who reads this (generated)
- `whatsapp.service.js` ← imported by `bot/gateway/adapters/whatsapp.js:21:12642918` · `bot/shared/config/coaching-audio.js:26:0204868e` (+94)
- table `users` (written by `feature-registration.service.js` (+1)) ← read by `bot/scripts/attendance/link-school.js:50:a67cfd10`? · `bot/scripts/generate-coaching-excel.js:56:61dfd735`? (+55)
- … 85 more → `CLAUDE.index.md`

## Never (human)
- Do not add send logic to whatsapp.service.js; it only re-exports the driver resolved by messaging/index.js (bot/shared/services/whatsapp.service.js:2)
- Never gate regional behaviour on region-name or phone-id; use region_features rows (bot/shared/services/region-features.service.js:6)
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- `tests/attendance/review-hardening.test.js` (attendance-conversation.service.js, attendance-dates.js, attendance-delivery.service.js, attendance-entry.service.js, staff-attendance.service.js)
- … 155 more → `CLAUDE.index.md`

## Related (generated)
- skills: `ab-testing`? · `coaching`? · `cross-agent-safety`? · `debugging`? · `digital-coach`? · `reading-assessment`? (+1)
- docs: `AGENTS.md`? · `CHANGELOG.md`? · `CLAUDE.md`? · `bot/CLAUDE.index.md`? · `bot/CLAUDE.md`? · `bot/README.md`? (+74)
