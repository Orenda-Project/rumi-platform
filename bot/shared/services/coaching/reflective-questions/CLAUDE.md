# reflective-questions — Prompts, guardrails and LLM failover for the 3-question reflective chat
Full index: `CLAUDE.index.md`

<!-- kg:meta repo=rumi-platform dir=bot/shared/services/coaching/reflective-questions kg=ec7ec9e713cc gen=b671d50c4eb7 overflow=3 rendered=2026-10-28 kg.py=1.0.0 -->

## Entry points
- `question-prompt.js` — builds one question's prompt from corpus and prior answers
- `guardrails.js` — pure validation plus safe fallback for generated questions
- `llm-router.service.js` — primary model, retry, then fallback model
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `guardrails.js` | Pure validator for generated reflective questions (timestamps, meta-leaks, transliteration) plus safe fallback |
| `language-profiles.js` | Per-language data (name, script, register, gender hints) for reflective-question prompts; one entry per language |
| `CLAUDE.index.md` | (unmapped) |
| `CLAUDE.md` | (unmapped) |
| `corpus-prompt.js` | Builds the prompt that turns a noisy transcript into a corpus for question generation; used by gpt5-mini |
| … | 2 more → `CLAUDE.index.md` |

## Who reads this (generated)
- `guardrails.js` ← imported by `bot/shared/services/coaching/reflective-conversation.service.js:91:6e560a9c` · `bot/shared/services/gpt5-mini.service.js:710:d5aeeb7e`
- `language-profiles.js` ← imported by `bot/shared/services/coaching/reflective-conversation.service.js:92:cb1b4a9f` · `bot/shared/services/gpt5-mini.service.js:671:e574b931`
- `corpus-prompt.js` ← imported by `bot/shared/services/gpt5-mini.service.js:672:86d791bc`
- `llm-router.service.js` ← imported by `bot/shared/services/gpt5-mini.service.js:673:7c9a8fe1`
- … 1 more → `CLAUDE.index.md`

## Never (human)
- A language must be added as one entry in language-profiles.js, with no prompt-logic change (bot/shared/services/coaching/reflective-questions/language-profiles.js:11)
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- `tests/coaching/reflective-v12-question-chain.test.js` (guardrails.js, language-profiles.js)

## Related (generated)
- docs: `bot/shared/services/coaching/CLAUDE.index.md`? · `bot/shared/services/coaching/CLAUDE.md`? · `bot/shared/services/coaching/reflective-questions/CLAUDE.index.md`? · `bot/shared/services/coaching/reflective-questions/CLAUDE.md`? · `docs/CLAUDE.index.md`? · `docs/customization.md`? (+1)
