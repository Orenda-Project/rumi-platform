# 🗣️ Voice Messages

![Voice Messages](../images/features/voice.jpg)

> Many teachers would rather talk than type. Rumi listens to voice notes and can reply in voice too — in the language they actually speak.

## What it is

Full spoken interaction. A teacher sends a voice note instead of typing; Rumi transcribes it, understands it, and answers — optionally replying with a natural-sounding voice note of its own. This makes every other feature reachable by voice, which matters enormously for teachers who are more comfortable speaking than writing, or who are on the move.

## How it works

1. **Teacher sends a voice note** in their language.
2. **Rumi transcribes** it (Soniox / Whisper, with Modal MMS-ASR for additional regional languages).
3. **Rumi processes** the request just like a text message.
4. **Rumi replies** in text — and, if text-to-speech is enabled, as a spoken voice note (ElevenLabs, with Uplift used for Urdu and regional voices).

## What the teacher experiences

Hold the mic, speak naturally, get an answer they can read and hear. Code-switching between languages is handled gracefully.

## Enable it

Set **`SONIOX_API_KEY`** to understand voice notes, and **`ELEVENLABS_API_KEY`** to reply in voice (add **`UPLIFT_API_KEY`** for Urdu/regional voices). Additional regional-language transcription can be added via a self-hosted MMS-ASR service (`MMS_SERVICE_URL`).

## Customize

Add languages or change voices — see [Agent Customization §4](../agent-customization.md#4-add-or-change-languages).
