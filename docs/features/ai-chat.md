# 💬 AI Chat

![AI Chat](../images/features/ai-chat.jpg)

> A teacher's always-available thinking partner. Ask anything about teaching — by text or voice — and get a clear, practical, pedagogy-grounded answer.

## What it is

The core of Rumi. Teachers ask real questions — "how do I explain fractions to a struggling student?", "give me three ways to manage a noisy class", "what's a good assessment for this topic?" — and get expert, grounded responses, in their own language, any time of day.

## How it works

1. **Teacher sends a question** by text or voice note on WhatsApp.
2. **Rumi detects the language** and routes the message.
3. **Rumi answers** using a large language model (via OpenRouter), grounded in teaching practice and the teacher's context (grade, subject, language).
4. **The reply comes back** as text — and as voice too, if voice replies are enabled.

## What the teacher experiences

It feels like messaging a knowledgeable, patient colleague who never sleeps — concise, practical answers tuned to their classroom, not generic essays.

## Enable it

_Always on_ — this is core. It only needs the required **`OPENROUTER_API_KEY`** that every Rumi install sets. Add `SONIOX_API_KEY` to accept voice questions and `ELEVENLABS_API_KEY` to reply in voice.

## Customize

Change the model, the system persona, or the grounding — see [Agent Customization §5](../agent-customization.md#5-switch-llm-provider-or-model).
