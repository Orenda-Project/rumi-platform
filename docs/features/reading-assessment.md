# 📖 Reading Assessment

![Reading Assessment](../images/features/reading-assessment.jpg)

> Measure a child's reading fluency with the rigor of a standardized test — using nothing but WhatsApp and a voice note.

## What it is

A teacher (or parent) has a student read a short passage aloud into WhatsApp. Rumi listens and reports Words Correct Per Minute (WCPM), accuracy, pronunciation quality, and comprehension — benchmarked against grade level — so a teacher can track real reading growth over a term without printed tests or a visiting assessor.

## How it works

1. **Teacher selects a student** and starts an assessment.
2. **Rumi generates a passage** at the right level (adaptive — it gets easier or harder based on prior results).
3. **The student reads aloud** into WhatsApp as a voice note.
4. **Rumi measures**: WCPM, reading accuracy, pronunciation quality, and comprehension (via a couple of follow-up questions).
5. **Results are benchmarked** against grade-level norms (the bot ships with DIBELS-style WCPM/LCPM benchmarks; swappable for ASER, EGRA, or your own).
6. **The teacher receives** a clear fluency report with diagnostic feedback and recommended next steps.

## What the teacher experiences

Pick a student → Rumi sends a passage → the child reads it into the phone → a short comprehension check → a friendly report showing where the reader is strong, where to focus, and how they compare to where they should be.

## Enable it

Set **`SONIOX_API_KEY`** (to hear the reading). For pronunciation scoring, also set **`AZURE_SPEECH_KEY`** + **`AZURE_SPEECH_REGION`**.

## Customize

Switch the methodology to **ASER**, **EGRA**, or your own benchmarks, or change passage generation — see [Agent Customization §2](../agent-customization.md#2-change-reading-assessment-methodology).
