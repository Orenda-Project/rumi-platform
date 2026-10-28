# services — Service-level tests: attendance, audio, vision, transcripts, reading

<!-- kg:meta repo=rumi-platform dir=bot/tests/services kg=3bb7477d2a0c gen=2748ad1d6061 overflow=0 rendered=2026-10-28 kg.py=1.0.0 -->

## Entry points
- `audio.service.test.js` — language-aware ASR routing
- `attendance-generator.test.js` — attendance output helpers
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `reading/` | → (no door; 1 test files) |
| `audio.service.test.js` | Pins AudioService ASR routing: Soniox for supported languages, MMS-ASR for Balochi, Sindhi, Pashto |
| `CLAUDE.md` | (unmapped) |
| `attendance-conversation.test.js` | Tests attendance-conversation service state handling for the voice attendance conversation |
| `attendance-delivery.test.js` | Tests attendance-delivery service sending attendance results with mocked messaging |
| `attendance-detector.test.js` | Tests attendance-detector service recognising when a message or audio is an attendance request |
| `attendance-generator.test.js` | Tests attendance-generator service producing the attendance register output from records |
| `name-extractor.test.js` | Tests name-extractor service pulling student names out of dictated attendance text |
| `silence-detector.test.js` | Tests silence-detector detectSilences() finding gaps between transcript tokens for board-writing inference |
| `student-list.test.js` | Tests student-list service managing class rosters against a mocked Supabase |
| `transcript-enhancer.test.js` | Tests transcript-enhancer enhanceTranscript() LLM post-processing of diarized transcript segments |
| `transcription-processor.test.js` | Tests transcribeWithDiarization returning real tokens and _buildDiarizationFromTokens() for the transcript viewer |
| `vision.service.test.js` | Tests VisionService analyzeImage(), analyzeWithRetry() and token estimation for multimodal image analysis |
| `voice-attendance.test.js` | Tests voice-attendance service turning a spoken roll call into attendance marks |

## Who reads this (generated)
- env read here: `OPENAI_API_KEY`

## Never (human)
_None found in code comments, tests or git log for this directory._
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- (none)

## Related (generated)
- docs: `bot/shared/services/CLAUDE.index.md`? · `bot/shared/services/coaching/CLAUDE.index.md`? · `bot/tests/CLAUDE.md`? · `bot/tests/services/CLAUDE.md`?
