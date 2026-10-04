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

## Starting and stopping

A teacher starts a session with a command or a phrase:

- **Commands** (`/exam`, `/exams`, `/grade`, `/checkexam`) count only as the whole message or its first word: `/exam` or `/exam class 5`. A command inside a sentence or a link (`https://example.org/exam/results`) does not start anything.
- **Phrases** ("check exams", "grade papers", "امتحان چیک", "تصحيح امتحان" and the rest of `EXAM_CHECK_KEYWORDS` in `bot/shared/handlers/exam-checker.handler.js`) count only as whole words, anywhere in the message: "please check exams for class 5" starts a session, "recheck exams" does not. A photo's caption is matched the same way.

The words `cancel`, `/cancel`, `stop`, `منسوخ`, `روکیں`, `إلغاء` or `الغاء`, sent as the whole message, end the session from any step. A session that has no photos yet also ends, quietly, when the teacher sends ordinary chat instead; that message is answered as ordinary chat.

## Enable it

Set **`MISTRAL_API_KEY`** (the vision OCR the exam checker uses). Optional fallbacks/aids: `CHANDRA_API_URL`, `SURYA_API_URL`. The exam-intake WhatsApp Flow ID lands in `EXAM_CHECKER_STUDENTS_FLOW_ID`.

The exam checker is on unless **`EXAM_CHECKER_ENABLED`** is `false`, `0` or `off`. Switched off, commands, phrases and captions no longer start a session and an open session ignores new messages, but `cancel` still closes it. Every session costs vision-OCR calls, so on a public deployment see [Running Rumi in public](../running-in-public.md).

## Customize

Change the OCR provider, grading rubric, or feedback style — see the exam-checker services and the [Agent Customization Guide](../agent-customization.md).
