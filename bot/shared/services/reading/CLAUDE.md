# reading — Reading assessment pipeline: passage, audio, fluency, pronunciation, report, feedback
Full index: `CLAUDE.index.md`

<!-- kg:meta repo=rumi-platform dir=bot/shared/services/reading kg=4f733e010d22 gen=2d2e4b1250d7 overflow=33 rendered=2026-10-28 kg.py=1.0.0 -->

## Entry points
- `analysis.service.js` — orchestrates the analysis pipeline and writes results to reading_assessments
- `passage-generation.service.js` — builds and sends the passage image the child reads
- `benchmark.service.js` — config-driven benchmark status; edit config/reading-benchmarks.js, not SQL
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `analysis.service.js` | Orchestrates reading analysis: transcript, pronunciation, fluency, comprehension; writes reading_assessments |
| `comprehension.service.js` | EGRA-style comprehension: generates 5 questions, scores bilingual answers, gives teacher guidance |
| `passage-generation.service.js` | Generates reading passages and images, uploads to R2, sends to WhatsApp; writes reading_assessments |
| `CLAUDE.index.md` | (unmapped) |
| … | 9 more → `CLAUDE.index.md` |

## Who reads this (generated)
- table `reading_assessments` (written by `analysis.service.js` (+2)) ← read by `bot/shared/handlers/text-message.handler.js:1077:4337985e`? · `bot/shared/handlers/voice-message.handler.js:259:4337985e`? (+13)
- column `reading_assessments.status` (written by `analysis.service.js` (+2)) ← read by `bot/shared/handlers/voice-message.handler.js:421:1099729a` · `bot/shared/services/context.service.js:170:a69ef692` (+5)
- … 19 more → `CLAUDE.index.md`

## Never (human)
- Urdu passages must carry no diacritical marks, to match textbooks (bot/shared/services/reading/passage-generation.service.js:12)
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- `tests/services/inbound-audio-temp-collision.test.js` (comprehension.service.js, pronunciation.service.js, transcription.service.js)
- `tests/reading/audio-without-object-storage.test.js` (transcription.service.js)
- … 5 more → `CLAUDE.index.md`

## Related (generated)
- skills: `reading-assessment`?
- docs: `bot/shared/services/CLAUDE.index.md`? · `bot/shared/services/CLAUDE.md`? · `bot/shared/services/reading/CLAUDE.index.md`? · `bot/shared/services/reading/CLAUDE.md`? · `docs/CLAUDE.index.md`? · `docs/agent-customization.md`? (+5)
