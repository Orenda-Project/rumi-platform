# reflective-questions — full index (generated)

<!-- kg:index repo=rumi-platform dir=bot/shared/services/coaching/reflective-questions -->
Every row the door could not hold, ungrouped. Not auto-loaded; same hop as `CLAUDE.md`.

## Children (all, generated)
| path | purpose |
|---|---|
| `CLAUDE.index.md` | (unmapped) |
| `CLAUDE.md` | (unmapped) |
| `corpus-prompt.js` | Builds the prompt that turns a noisy transcript into a corpus for question generation; used by gpt5-mini |
| `guardrails.js` | Pure validator for generated reflective questions (timestamps, meta-leaks, transliteration) plus safe fallback |
| `language-profiles.js` | Per-language data (name, script, register, gender hints) for reflective-question prompts; one entry per language |
| `llm-router.service.js` | OpenRouter failover ladder for reflective questions: primary model, one retry, then fallback; used by gpt5-mini |
| `question-prompt.js` | Builds the system prompt for one reflective question (Q1-Q3 chain) from corpus and prior answers; used by gpt5-mini |

## Who reads this (all, generated)
- `corpus-prompt.js` ← imported by `bot/shared/services/gpt5-mini.service.js:672:86d791bc`
- `guardrails.js` ← imported by `bot/shared/services/coaching/reflective-conversation.service.js:91:6e560a9c` · `bot/shared/services/gpt5-mini.service.js:710:d5aeeb7e`
- `language-profiles.js` ← imported by `bot/shared/services/coaching/reflective-conversation.service.js:92:cb1b4a9f` · `bot/shared/services/gpt5-mini.service.js:671:e574b931`
- `llm-router.service.js` ← imported by `bot/shared/services/gpt5-mini.service.js:673:7c9a8fe1`
- `question-prompt.js` ← imported by `bot/shared/services/gpt5-mini.service.js:708:ef82afe5`

## Tests (all, generated)
- `guardrails.js` ← `tests/coaching/reflective-v12-question-chain.test.js`
- `language-profiles.js` ← `tests/coaching/reflective-v12-question-chain.test.js`

## Related (all, generated)
- docs: `bot/shared/services/coaching/CLAUDE.index.md`? · `bot/shared/services/coaching/CLAUDE.md`? · `bot/shared/services/coaching/reflective-questions/CLAUDE.index.md`? · `bot/shared/services/coaching/reflective-questions/CLAUDE.md`? · `docs/CLAUDE.index.md`? · `docs/customization.md`? · `tests/coaching/CLAUDE.index.md`?
