# 🎯 Classroom Coaching

![Classroom Coaching](../images/features/coaching.jpg)

> The best time to coach a teacher is right after they teach. Rumi turns a class **audio recording** into a scored, framework-based coaching report — and a spoken reflective conversation — within minutes.

## What it is

A teacher records part of a lesson as **audio** on their phone and sends the voice note to Rumi on WhatsApp. Rumi transcribes it, scores it against a research-backed classroom-observation framework, talks the teacher through a short reflection, and returns a professional PDF report with concrete next steps. No coach, no scheduled visit, no travel — just the phone in their pocket.

## How it works

1. **Teacher records** their classroom as audio and sends the voice note to Rumi. _(Audio only — Rumi does not process classroom video.)_
2. **Rumi transcribes** the recording (Soniox, with Whisper fallback), handling multilingual and code-switched speech.
3. **Rumi scores** the transcript against the teacher's selected framework:
   - **OECD** — the OECD Global Teaching InSights observation framework
   - **HOTS** — a higher-order-thinking classroom-observation tool
   - **TEACH** — the World Bank's TEACH observation tool
   - **FICO** — a domain-based observation framework

   (These four ship with the OSS bot. MEWAKA and other production-only frameworks are not included here.)
4. **Optional classroom photo analysis** — if the teacher also sends a photo, Rumi uses vision AI to score things only a picture can show (seating, materials, board use).
5. **Reflective conversation** — Rumi asks a few voice-delivered questions that prompt the teacher to think about specific moments in their own lesson.
6. **PDF report** — scores per goal, evidence quoted from the transcript, growth areas, prioritised recommendations, and charts. It ends with a coaching card naming the single highest-leverage next action.
7. **Progress over time** — each session remembers the last one, so feedback builds instead of repeating.

## What the teacher experiences

Send a recording → get a friendly "working on it" message → a few minutes later receive a reflective question or two → then a clear, encouraging report they can keep and act on. The tone is supportive, never punitive.

## Enable it

Set **`SONIOX_API_KEY`** (transcription). For spoken reflective questions, also set `ELEVENLABS_API_KEY`. The framework is chosen per teacher and stored on their profile.

## Customize

Swap or add frameworks, change scoring rubrics, or adjust the reflection style — see [Agent Customization §1](../agent-customization.md#1-swap-the-coaching-framework).
