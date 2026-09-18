# ✍️ Writing Feedback — Writer's Second Pair of Eyes

> Photograph your child's paragraph. Rumi drafts 2–3 specific, kind edits — never a rewrite — and shows **you** first. You edit or confirm, then you're the one who shows your child, with a script for how to say it.

## What it is

A second pair of eyes for a parent teaching writing at home, for children roughly 8–13. Writing is the subject parents most often say they can't teach, and most aren't writing teachers. The 2025–26 wave of AI essay graders will happily grade the whole paragraph — but none of them has been validated against a trained human writing teacher, least of all for a younger or struggling writer.

So this one doesn't grade. It drafts a couple of things worth saying, hands them to the parent, and waits. **The parent-confirmation step is the product, not a setting** — there is no forward-to-child button, and nothing reaches the child until she confirms.

## How it works

1. **The parent starts it** — `/writing` (or "check my child's writing" / "essay" / "paragraph"), or just sends a photo captioned *writing* / *essay* / *paragraph*.
2. **Rumi reads the handwriting** with the same vision OCR the [Exam Checker](exam-checker.md) uses (Mistral vision, Chandra fallback). If the read isn't confident enough, Rumi says so and asks her to type the paragraph instead of guessing — feedback built on a misread sentence is worse than no feedback.
3. **Rumi asks the child's age**, so the "why" behind each edit is pitched right.
4. **Rumi drafts the feedback**: one praise line naming something *specific* the child did well, plus **2–3 edits**, each one a short quote (≤ 8 words) · why, in one line · a better version of *just that bit*. The 2–3 cap and the no-rewrite rule are enforced when the model's answer is parsed, not merely requested in the prompt.
5. **The parent reads it first** and replies:
   - `send` — confirm as-is
   - `drop 2` — take a point out
   - `change 1: ...` — say it in her own words
   - `add: ...` — add something Rumi missed
6. **On confirm**, Rumi sends a second message: a ≤ 120-word **"how to say this to your child"** script (open on the praise, frame the edits as noticing together, ask the child what they think), followed by the feedback she approved.

State machine: `awaiting_photo → awaiting_age → awaiting_parent_confirm → done`. A session untouched for 24 hours is cancelled rather than resumed, the same window the other multi-step features use.

## What the parent experiences

She photographs a paragraph, answers "9", and gets a message that reads like a thoughtful friend's notes rather than a report card. She deletes the one she disagrees with, replies `send`, and gets a short script she can actually say out loud. She is the one giving the feedback — Rumi never talks to the child.

## Why every session is logged

Each session stores the OCR text, **the AI's draft**, and **the parent's final version** separately, plus how many edits she made (`writing_feedback_sessions`). The gap between those two columns is an accuracy signal no AI writing grader on the market currently measures — the parent's edits say, session by session, how close the draft landed to what she would have said herself. It cannot be reconstructed later, so it is captured from the first session.

The parent's number is stored as a SHA-256 hash, not a phone number: the row holds a child's schoolwork.

## Enable it

Set **`MISTRAL_API_KEY`** (or `CHANDRA_API_KEY`) — the same OCR key the Exam Checker uses. No new credential, and no enable flag. `npm run doctor` reports it as *Writing feedback (Writer's Second Pair of Eyes)*.

With no OCR key configured, Rumi says so plainly and offers the typed-paragraph route instead of pretending.

## Customize

The edit cap, the quote length and the script word limit are constants at the top of `bot/shared/services/writing-feedback.service.js`; the two prompts (`DRAFT_SYSTEM_PROMPT`, `SCRIPT_SYSTEM_PROMPT`) live beside them. Raising the cap past 3 is the one change to think twice about — the cap is what keeps this a conversation aid rather than a grader. See the [Agent Customization Guide](../agent-customization.md).
