# Cost Guide

Rumi has **no pricing tiers** — you pay for the core platform plus whichever features you switch on
(features are gated by presence of their API keys; see the [feature library](features/README.md)). This
guide gives rough monthly estimates at moderate usage (~50–100 teachers, ~500 messages/day). Real costs
depend on volume and the providers you choose — treat these as order-of-magnitude.

## Core baseline (always running) — ~$15–20/month

| Service | Rough cost | Notes |
|---------|-----------|-------|
| OpenRouter (LLM) | ~$10 | The model behind chat, coaching analysis, quiz, etc. Pick a cheaper model to cut this. |
| Supabase (Postgres) | Free → $25 | Free tier covers light usage; Pro if you need more storage. |
| Railway (web + workers) | ~$5–20 | Hobby for a single service; more for separate worker services. |
| Redis | Free | Included with Railway. |

The core (chat + registration + quiz) runs on just these — only `OPENROUTER_API_KEY` is a paid add-on
beyond hosting.

## Per-feature add-ons (you only pay if you enable the feature)

| Feature | Provider | Key | Rough cost | Notes |
|---------|----------|-----|-----------|-------|
| Voice transcription (voice notes, coaching, reading) | Soniox | `SONIOX_API_KEY` | ~$25 | Per-minute audio transcription. |
| Spoken replies (TTS) | ElevenLabs | `ELEVENLABS_API_KEY` | ~$5–50 | Scales with how much speech you generate. |
| Urdu / regional voices | Uplift | `UPLIFT_API_KEY` | varies | Alternative TTS for non-English. |
| Reading pronunciation scoring | Azure Speech | `AZURE_SPEECH_KEY` | ~$25 | Only the English pronunciation path. |
| Lesson plans (text) | Gamma | `GAMMA_API_KEY` | ~$50 | Per-plan generation; pre-generated curriculum LPs are free to serve. |
| Pic-to-LP + Video | Kie.ai | `KIE_API_KEY` | usage-based | Image/video rendering; the heaviest per-artifact cost. |
| Exam checker | OpenRouter (Gemini vision) | core LLM key | usage-based | One or two vision calls per page, one grading call per student. `EXAM_CHECKER_MODEL` picks the model. |
| Observability | Axiom | `AXIOM_DATASET` + `AXIOM_TOKEN` | Free → paid | Optional; the bot logs to the console without it. |

## Optimisation tips

1. Use a smaller/cheaper LLM (e.g. a mini model) for non-critical responses — set it as the default model.
2. Cache frequent queries in Redis.
3. Serve **pre-generated** curriculum lesson plans where possible — they cost nothing to deliver (see [LP_PATHS.md](LP_PATHS.md)).
4. Start with the core and switch features on one at a time; `npm run doctor` shows what's currently live.
