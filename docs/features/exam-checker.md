# 🧮 Exam Checker

![Exam Checker](../images/features/exam-checker.jpg)

> Photograph a stack of answer sheets; get them graded. Rumi reads the responses with vision OCR and scores against the answer key.

## What it is

A grading assistant. A teacher photographs students' completed exam or worksheet papers and sends them to Rumi, which uses a vision model to read the responses and AI to grade them against the expected answers — turning an evening of marking into a few minutes.

## How it works

1. **Teacher photographs** the answer sheets and sends them on WhatsApp.
2. **Rumi extracts the responses** using a vision OCR model (Mistral vision, with a Chandra fallback and Surya for locating answers on the page).
3. **Rumi grades** each response against the answer key / rubric using AI.
4. **The teacher receives** scored results with per-question feedback.

## What the teacher experiences

Snap photos of the papers → a short "grading" wait → results come back with scores and notes, ready to record or hand back.

## Enable it

Set **`MISTRAL_API_KEY`** (the vision OCR the exam checker uses). Optional fallbacks/aids: `CHANDRA_API_URL`, `SURYA_API_URL`. The exam-intake WhatsApp Flow ID lands in `EXAM_CHECKER_STUDENTS_FLOW_ID`.

## Customize

Change the OCR provider, grading rubric, or feedback style — see the exam-checker services and the [Agent Customization Guide](../agent-customization.md).
