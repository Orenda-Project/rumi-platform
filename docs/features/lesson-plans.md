# 📋 Lesson Plans

![Lesson Plans](../images/features/lesson-plans.jpg)

> Describe a topic and grade in a WhatsApp message; get back a complete, classroom-ready lesson plan as a PDF.

## What it is

A generator that turns a one-line request ("a Grade 4 lesson on the water cycle") into a full, structured lesson plan and delivers it as a downloadable PDF the teacher can use the same day. Plans follow a nine-part structure built on the 5E model: learning objectives & success criteria, lesson overview, materials & preparation, Engage (introduction), Explore, Explain, Elaborate (guided practice), Evaluate (formative assessment), and differentiation strategies.

## How it works

1. **Teacher describes** the topic, grade, and (optionally) the language.
2. **Rumi drafts** the nine-part 5E plan (objectives → Engage → Explore → Explain → Elaborate → Evaluate → differentiation) via the Gamma API.
3. **Rumi renders** it to a clean PDF.
4. **The teacher receives** the PDF on WhatsApp (plus a Gamma presentation link as a fallback), ready to download and teach from.

## What the teacher experiences

Type a topic → a short "generating your plan" note (with an honest time estimate) → a polished PDF lesson plan arrives, in their language, matched to their grade.

## Enable it

Set **`GAMMA_API_KEY`**.

## Customize

Change the lesson-plan structure (5E, UbD, your ministry's template), tone, or language — see [Agent Customization §3](../agent-customization.md#3-modify-lesson-plan-templates).
