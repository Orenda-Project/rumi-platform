# reading — Reading assessment pipeline: passage, audio, fluency, pronunciation, report, feedback
Full index: `CLAUDE.index.md`

<!-- kg:meta repo=rumi-platform dir=bot/shared/services/reading kg=ad2a32ab3eeb gen=70a2356938a9 overflow=31 rendered=2026-10-29 kg.py=1.1.0 -->

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
| `benchmark.service.js` | Config-driven JS benchmark status (reads config/reading-benchmarks.js) replacing the SQL benchmark RPCs |
| … | 7 more → `CLAUDE.index.md` |

## Who reads this (generated)
- table `reading_assessments` (written by `analysis.service.js` (+2)) ← read by `bot/shared/handlers/text-message.handler.js:1077:4337985e`? · `bot/shared/handlers/voice-message.handler.js:259:4337985e`? (+13)
- column `reading_assessments.status` (written by `analysis.service.js` (+2)) ← read by `bot/shared/handlers/voice-message.handler.js:421:1099729a` · `bot/shared/services/context.service.js:170:a69ef692` (+5)
- … 27 more → `CLAUDE.index.md`

## Never (human)
- Urdu passages must carry no diacritical marks, to match textbooks (bot/shared/services/reading/passage-generation.service.js:12)
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- `tests/services/inbound-audio-temp-collision.test.js` (comprehension.service.js, pronunciation.service.js, transcription.service.js)
- `tests/reading/audio-without-object-storage.test.js` (transcription.service.js)
- … 5 more → `CLAUDE.index.md`

## Related (generated)
- skills: `reading-assessment`?
- docs: `bot/shared/services/CLAUDE.md`? · `docs/agent-customization.md`? · `docs/customization.md`?
