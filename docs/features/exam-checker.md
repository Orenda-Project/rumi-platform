# 🧮 Exam Checker

![Exam Checker](../images/features/exam-checker.jpg)

> Photograph a stack of answer sheets; get them graded. Rumi reads the responses with a vision model and scores them against the answer key.

## What it is

A grading assistant. A teacher photographs students' completed exam or worksheet papers and sends them to Rumi, which uses a vision model to read the responses and AI to grade them against the expected answers — turning an evening of marking into a few minutes.

## How it works

1. **Teacher photographs** the answer sheets and sends them on WhatsApp.
2. **Rumi reads each page** with a vision model, copying every answer exactly as the student wrote it — mistakes included — and noting where on the page it sits. The answer key is kept out of this step.
3. **Rumi grades** the copied answers against the answer key in a second call to the same model, and writes short feedback for each question.
4. **The teacher receives** scored results with per-question feedback.

## What the teacher experiences

Snap photos of the papers → a short "grading" wait → results come back with scores and notes, ready to record or hand back.

## Starting and stopping

A teacher starts a session with a command or a phrase:

- **Commands** (`/exam`, `/exams`, `/grade`, `/checkexam`) count only as the whole message or its first word: `/exam`, `/exam.` or `/exam class 5`. A command inside a sentence or a link (`https://example.org/exam/results`) does not start anything.
- **Phrases** ("check exams", "grade papers", "امتحان چیک", "تصحيح امتحان" and the rest of `EXAM_CHECK_KEYWORDS` in `bot/shared/handlers/exam-checker.handler.js`) count only as whole words, and only in a short request: a message of 6 words or fewer (`PHRASE_TRIGGER_MAX_WORDS`; only words with a letter or digit count, so an emoji does not) with no `?` or `؟` and no question word as a whole word (`QUESTION_WORDS`: `how`, `what`, `why`, `when`, `where`, `which`, `who`, `should`; `کیسے`, `کیا`, `کیوں`, `کب`, `کہاں`, `کون`, `طریقہ`; `كيف`, `ما`, `ماذا`, `لماذا`, `متى`, `أين`, `هل`). "check exams", "please check exams for class 5", "can you check my papers" and "امتحان چیک کرو" start a session. "recheck exams" does not, and neither does a question or a longer message about exams ("How do I grade papers fairly?", "how to grade papers", "امتحان چیک کیسے کروں", "كيف تصحيح امتحان"): that is ordinary chat, answered and stored as usual. Urdu `کیا` is also the verb "do": right after `چیک` or `گریڈ` ("امتحان چیک کیا جائے") it is part of a request and does not count as a question word. A teacher who wants the exam checker in a longer message can start it with `/exam`.
- **Photo captions** are matched on whole words without the length and question rule, since the photo already says what the teacher wants: a photo captioned "Can you grade papers like this one?" starts a session.

The words `cancel`, `/cancel`, `stop`, `منسوخ`, `منسوخ کریں`, `روکیں`, `إلغاء` or `الغاء`, sent as the whole message, end the session. Case and punctuation are ignored, direction marks (LRM, RLM, ALM) are dropped, and `أ`, `إ` and `آ` count as `ا` (so `ألغاء` works too). One step is different: while Rumi is collecting the answer key, a one-word answer such as "Stop" is a real answer, so there only `/cancel` ends the session, and each answer prompt says so. On Matrix, a one-word answer sent while Rumi is also waiting for the teacher's name ("Paris") is stored as the answer, not taken as the name. A session that has no photos yet also ends, quietly, when the teacher sends ordinary chat instead; that message is answered as ordinary chat.

The trigger and cancel words cover English, Urdu and Arabic. There are no Kiswahili words yet: on a Kiswahili deployment, teachers start with `/exam` (or a captioned photo in one of those languages) and stop with `/cancel`. Add Kiswahili phrases to `EXAM_CHECK_KEYWORDS` and `EXAM_CANCEL_WORDS` if you need them.

## Enable it

Nothing beyond the core LLM key: the exam checker reads and grades through `llm-client`, so `OPENROUTER_API_KEY` (or `OPENAI_API_KEY` with `LLM_PROVIDER=openai`) is all it needs. The exam-intake WhatsApp Flow ID lands in `EXAM_CHECKER_STUDENTS_FLOW_ID`.

The exam checker is on unless **`EXAM_CHECKER_ENABLED`** is `false`, `0` or `off` (or `RUMI_FEATURE_EXAM_OCR=off`). Switched off, commands, phrases and captions no longer start a session and an open session ignores new messages, but `cancel` still closes it. Every page costs one or two vision calls and every student one grading call, so on a public deployment see [Running Rumi in public](../running-in-public.md).

## Storage

The teacher's photos and the marked pages go to R2 when `R2_*` is set. Without it they are kept on local disk under `bot/temp/exam_checker/` and sent from there, as voice notes and reading reports are — so the exam checker runs on a sandbox with no bucket. Two limits: the Meta (Cloud API) driver cannot send a file from local disk, so a Meta deployment needs R2 (a warning is logged); and the bot and the worker must share that disk (one host). Files kept locally are not cleaned up automatically.

## Models and prompts

The engine is `bot/shared/services/exam-checker/exam-vision.service.js`. It makes two calls, each a job in `bot/shared/config/model-registry.js`:

| Call | Job | Default model | Override | What it does |
|------|-----|---------------|----------|--------------|
| A — read | `exam.read` | `google/gemini-3.5-flash` | `EXAM_CHECKER_MODEL` | Copies each answer exactly, with a box around it (`box_2d` = `[ymin, xmin, ymax, xmax]` on a 0–1000 grid) and its script (`ur` / `en` / `mixed`). **Never shown the answer key.** |
| A — hard page | `exam.readHard` | `google/gemini-2.5-pro` | `EXAM_CHECKER_HARD_MODEL` | The same read again, when more than a quarter of a page's answers (and at least two) come back with confidence below 0.6. |
| B — grade | `exam.grade` | `google/gemini-3.5-flash` | `EXAM_CHECKER_MODEL` | Grades the copied text (no image, no boxes) against the answer key. One call per student. |

With `LLM_PROVIDER=openai` all three default to `gpt-4.1`. Every call runs at temperature 0, asks for JSON, times out after 120 s and is not retried by the SDK; on OpenRouter it asks for the fastest host.

**Why two calls.** A vision model that reads and grades in one pass quietly corrects a wrong answer — "2x3=5" becomes 6 — and then marks it right. Keeping the answer key out of the read keeps the copy honest. The read prompt (`CALL_A_SYS`) says so in as many words.

**What the grading prompt (`CALL_B_SYS`) asks for**, question by question:

1. **Can it be graded from the page?** A question that depends on something not there — words the teacher reads aloud, a listening track, a picture the model cannot see, a key it was not given — gets `cannot_grade` and 0/0, not a guessed mark. It drops out of the student's total.
2. **The correct answer** — from the answer key when there is one, otherwise worked out by the model itself, never copied from the student.
3. **The verdict** — `correct`, `partial` or `wrong`. Full marks or zero; partial credit only where the key defines it. No invented fractional weights.
4. **Feedback** — one short sentence each: what the student attempted (feed-up), where it went wrong (feed-back), and the next step (feed-forward). The next step is what goes in the margin.

Grading always adds up the per-question marks itself; the model's own `total_awarded` / `total_max` are not trusted. The board-specific letter grade (`grading-scale.service.js`) is applied to that percentage.

**Trying it on one page.** `node scripts/exam-checker-dry-run.js <image> [scheme.json]` (from `bot/`) runs both calls and prints what each returned. Nothing is stored or sent.

## Customize

Swap a model with `EXAM_CHECKER_MODEL` / `EXAM_CHECKER_HARD_MODEL` (any model that takes images), or change the prompts, rubric or feedback style in `exam-vision.service.js` — see the [Agent Customization Guide](../agent-customization.md).
