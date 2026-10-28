# reading — full index (generated)

<!-- kg:index repo=rumi-platform dir=bot/shared/services/reading -->
Every row the door could not hold, ungrouped. Not auto-loaded; same hop as `CLAUDE.md`.

## Children (all, generated)
| path | purpose |
|---|---|
| `CLAUDE.index.md` | (unmapped) |
| `CLAUDE.md` | (unmapped) |
| `analysis.service.js` | Orchestrates reading analysis: transcript, pronunciation, fluency, comprehension; writes reading_assessments |
| `auto-level-orchestrator.service.js` | ASER-style adaptive level finder (story down to letters, 80% rule, 2 tries); persists to reading_assessments |
| `benchmark.service.js` | Config-driven JS benchmark status (reads config/reading-benchmarks.js) replacing the SQL benchmark RPCs |
| `comprehension.service.js` | EGRA-style comprehension: generates 5 questions, scores bilingual answers, gives teacher guidance |
| `fluency.service.js` | Computes WCPM, accuracy and omission/insertion/substitution errors for a reading assessment |
| `passage-generation.service.js` | Generates reading passages and images, uploads to R2, sends to WhatsApp; writes reading_assessments |
| `pronunciation.service.js` | Pronunciation scoring: Azure phoneme-level for English, GPT-4o audio for Urdu and others |
| `report.service.js` | PDFKit reading-assessment report: WCPM badge, passage, fluency, benchmark, recommendations |
| `transcription.service.js` | Soniox transcription for reading audio with diarization, keeping only the student's speech and word timings |
| `vocabulary-image.service.js` | Makes the 3-picture vocabulary composite (Gemini) for word-level picture-matching comprehension |
| `voice-feedback.service.js` | Writes and voices encouraging feedback (GPT script, ElevenLabs/Uplift TTS) with pronunciation guidance |

## Who reads this (all, generated)
- `analysis.service.js` ← imported by `bot/shared/handlers/text-message.handler.js:1178:f9417b65` · `bot/shared/handlers/voice-message.handler.js:373:02457105` · `bot/shared/services/reading-assessment.service.js:640:df107a41` · `bot/whatsapp-bot.js:763:78683bde`
- `auto-level-orchestrator.service.js` ← imported by `bot/shared/routes/reading-assessment-endpoint.js:153:c17cec4c`
- `benchmark.service.js` ← imported by `bot/shared/services/reading/analysis.service.js:24:2bf3cc60`
- `comprehension.service.js` ← imported by `bot/shared/handlers/text-message.handler.js:1067:e6cd291e` · `bot/shared/handlers/voice-message.handler.js:249:3197ceb1` · `bot/whatsapp-bot.js:735:98859d86` · `bot/shared/services/reading/analysis.service.js:1236:651118f1`
- `fluency.service.js` ← imported by `bot/shared/services/reading/analysis.service.js:651:d851c211` · `bot/shared/services/reading/voice-feedback.service.js:27:d851c211`
- `passage-generation.service.js` ← imported by `bot/shared/routes/reading-assessment-endpoint.js:152:e9ceb3eb` · `bot/shared/services/reading-assessment.service.js:458:e0652009`
- `pronunciation.service.js` ← imported by `bot/shared/services/reading/analysis.service.js:607:f9eb1bda`
- `report.service.js` ← imported by `bot/shared/services/reading/analysis.service.js:821:ace59629`
- `transcription.service.js` ← imported by `bot/shared/services/reading/analysis.service.js:558:b5c5c779`
- `vocabulary-image.service.js` ← imported by `bot/shared/services/reading/comprehension.service.js:19:63eeea0a`
- `voice-feedback.service.js` ← imported by `bot/shared/services/reading/analysis.service.js:1082:8efca90d`
- column `reading_assessments.accuracy_percentage` (written by `analysis.service.js`) ← read by `dashboard/routes/portal.routes.js:1459:6033d135`
- column `reading_assessments.completed_at` (written by `analysis.service.js`) ← read by `dashboard/routes/portal.routes.js:1459:6033d135`
- column `reading_assessments.passage_type` (written by `auto-level-orchestrator.service.js`) ← read by `dashboard/routes/portal.routes.js:1459:6033d135`
- column `reading_assessments.report_pdf_url` (written by `analysis.service.js`) ← read by `dashboard/routes/portal.routes.js:1459:6033d135`
- column `reading_assessments.status` (written by `analysis.service.js`, `auto-level-orchestrator.service.js`, `passage-generation.service.js`) ← read by `bot/shared/handlers/voice-message.handler.js:421:1099729a` · `bot/shared/services/context.service.js:170:a69ef692` · `bot/shared/services/reading-assessment.service.js:28:a9e5e72d` · `bot/shared/services/redis-comprehension.service.js:85:64fad2d6` (+3: `python3 kg/kg.py who-reads reading_assessments.status`)
- column `reading_assessments.voice_feedback_url` (written by `analysis.service.js`) ← read by `dashboard/routes/portal.routes.js:1459:6033d135`
- column `reading_assessments.wcpm` (written by `analysis.service.js`) ← read by `dashboard/routes/portal.routes.js:1459:6033d135`
- table `reading_assessments` whole row (`*`) (written by `analysis.service.js`, `auto-level-orchestrator.service.js`, `passage-generation.service.js`) ← read by `bot/shared/handlers/voice-message.handler.js:448:d2b02c3e`? · `bot/shared/services/feature-registration.service.js:236:7a0c163a`? · `dashboard/database/queries.js:749:7a0c163a`? · `dashboard/routes/portal.routes.js:1534:d2b02c3e`? (+2: `python3 kg/kg.py who-reads reading_assessments`)
- table `reading_assessments` (written by `analysis.service.js`, `auto-level-orchestrator.service.js`, `passage-generation.service.js`) ← read by `bot/shared/handlers/text-message.handler.js:1077:4337985e`? · `bot/shared/handlers/voice-message.handler.js:259:4337985e`? · `bot/shared/routes/reading-assessment-endpoint.js:161:4337985e`? · `bot/shared/services/context.service.js:165:4337985e`? (+11: `python3 kg/kg.py who-reads reading_assessments`)
- env `AZURE_SPEECH_KEY` read at `bot/shared/services/reading/pronunciation.service.js:43:b0f86cfa`
- env `AZURE_SPEECH_REGION` read at `bot/shared/services/reading/pronunciation.service.js:44:996ea854`
- env `R2_ACCESS_KEY_ID` read at `bot/shared/services/reading/analysis.service.js:1006:d6f2a7a2` · `bot/shared/services/reading/passage-generation.service.js:1175:d6f2a7a2` · `bot/shared/services/reading/voice-feedback.service.js:783:d6f2a7a2`
- env `R2_BUCKET_NAME` read at `bot/shared/services/reading/analysis.service.js:1011:90ddb4d1` · `bot/shared/services/reading/passage-generation.service.js:1180:90ddb4d1` · `bot/shared/services/reading/voice-feedback.service.js:788:90ddb4d1`
- env `R2_ENDPOINT` read at `bot/shared/services/reading/analysis.service.js:1004:2684789e` · `bot/shared/services/reading/passage-generation.service.js:1173:2684789e` · `bot/shared/services/reading/voice-feedback.service.js:781:2684789e`
- env `R2_PUBLIC_URL` read at `bot/shared/services/reading/passage-generation.service.js:214:69d9f0f1`
- env `R2_SECRET_ACCESS_KEY` read at `bot/shared/services/reading/analysis.service.js:1007:5687c9ca` · `bot/shared/services/reading/passage-generation.service.js:1176:5687c9ca` · `bot/shared/services/reading/voice-feedback.service.js:784:5687c9ca`
- env `READING_BENCHMARKS_USE_RPC` read at `bot/shared/services/reading/analysis.service.js:698:6decc396`
- env `USE_PASSAGE_BACKGROUNDS` read at `bot/shared/services/reading/passage-generation.service.js:40:9c754d77`

## Tests (all, generated)
- `analysis.service.js` ← `tests/reports/report-temp-collision.test.js`
- `benchmark.service.js` ← `tests/reading/benchmark-service.test.js`
- `comprehension.service.js` ← `tests/services/inbound-audio-temp-collision.test.js`
- `passage-generation.service.js` ← `tests/reading/passage-image-temp.test.js` · `tests/unit/no-undeliverable-promises.test.js`
- `pronunciation.service.js` ← `tests/services/inbound-audio-temp-collision.test.js`
- `report.service.js` ← `tests/reports/reading-report-service.test.js`
- `transcription.service.js` ← `tests/reading/audio-without-object-storage.test.js` · `tests/services/inbound-audio-temp-collision.test.js`

## Related (all, generated)
- skills: `reading-assessment`?
- docs: `bot/shared/services/CLAUDE.index.md`? · `bot/shared/services/CLAUDE.md`? · `bot/shared/services/reading/CLAUDE.index.md`? · `bot/shared/services/reading/CLAUDE.md`? · `docs/CLAUDE.index.md`? · `docs/agent-customization.md`? · `docs/customization.md`? · `tests/reading/CLAUDE.md`? · `tests/reports/CLAUDE.md`? · `tests/services/CLAUDE.md`? · `tests/unit/CLAUDE.md`?
