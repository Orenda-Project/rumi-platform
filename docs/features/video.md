# 🎬 Video Generation

![Video Generation](../images/features/video.jpg)

> Turn a topic into a short, narrated teaching video — generated on demand, delivered on WhatsApp.

## What it is

A teacher asks for a topic and Rumi produces a brief educational video: generated visuals, narration in the teacher's language, and simple animation, assembled into a clip they can show in class or share with students.

## How it works

1. **Teacher requests a topic** ("a 1-minute video on the parts of a plant").
2. **Rumi plans the video** — a short script broken into scenes.
3. **Rumi generates visuals** (Kie.ai) and narration (text-to-speech), then **assembles** them with FFmpeg.
4. **The finished video** is delivered on WhatsApp. Because generation takes longer than text, Rumi tells the teacher upfront roughly how long to wait.

## What the teacher experiences

Ask for a topic → a clear "this will take a few minutes" message → a ready-to-play teaching video arrives, narrated in their language.

## Enable it

Set **`VIDEO_GENERATION_ENABLED=true`** plus **`KIE_API_KEY`** (visuals) and **`ELEVENLABS_API_KEY`** (narration). A daily cap (`VIDEO_DAILY_LIMIT`) protects your budget.

## Customize

Change visual style, narration voice, length caps, or watermark — see the video worker and [Agent Customization Guide](../agent-customization.md).
