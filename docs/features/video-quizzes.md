# 🎬 Video Quizzes — the Taleemabad Content Library

![The Taleemabad content library](../images/features/video-quiz-library.png)

> **▶ Watch the film (68 s):** [**Taleemabad Library on Rumi**](https://pub-0edccec5d5bd419782ba389c59faecac.r2.dev/media/Taleemabad_Library_On_Rumi.mp4) — a phone on a charpai, one message, and 890 lessons.
>
> [![Watch: Taleemabad Library on Rumi](../images/features/video-quiz-film-poster.png)](https://pub-0edccec5d5bd419782ba389c59faecac.r2.dev/media/Taleemabad_Library_On_Rumi.mp4)

> A teacher pulls up a curriculum video with `/video`, and three seconds after it lands she's offered its quiz — **15 questions, one at a time, with per-answer feedback**. She can take it herself, or send one forwardable link to her class group so every child plays in their own chat. The next morning she gets a designed PDF naming exactly what to reteach.

![Three phones: picture picker, Urdu phonics, score card](../images/features/video-quiz-phones.png)

## What's in the library

This feature ships with a real content library, free to use — the question banks
behind the **Taleemabad Student App** (2015–2021): hand-written questions,
hand-drawn illustrations, and studio-recorded voice clips, rescued from the
original app export, matched to their videos, and QA-certified question by
question before import.

| | |
|---|---|
| Curriculum videos, browsable by grade → subject → topic | **890** (Nursery–Grade 6, Pakistani national curriculum) |
| Videos carrying a quiz | **858** |
| QA-certified questions | **10,929** |
| Studio voice clips (questions, options, explanations — all playable voice notes) | **15,557** |
| Hand-drawn illustrations | **3,217** |
| Languages | English + Urdu |

Everything — the videos, every image, every voice note, and the question data
itself — is served from a **public CDN bucket**, so a fresh clone needs zero
media hosting of its own:

```
https://pub-0edccec5d5bd419782ba389c59faecac.r2.dev
├── videos/            890+ curriculum videos (MP4)
├── quiz-assets/       3,217 original question illustrations
├── quiz-audio/        15,557 original MP3s (archival)
├── quiz-audio-opus/   the same clips as WhatsApp-playable voice notes
├── quiz-grids/        numbered picture-option grids
├── quiz-question/     canvas-treated question images
├── quiz-explain/      explanation art (dark/light composited per image)
└── library/           the importable data (videos, quizzes, questions)
```

## How it works

1. **Video delivery** — the teacher sends `/video`, browses the library Flow
   (grade → subject → title) and the video lands in her chat.
   Entry: [student-videos-endpoint.js](../../bot/shared/routes/student-videos-endpoint.js).
2. **The offer** — 3 s after delivery, [video-quiz.service.js](../../bot/shared/services/quiz/video-quiz.service.js)
   offers the video's quiz with three buttons: *Yes, start* · *Send to my class* · *No thanks*.
   The standalone 👍/👎 video survey is suppressed while an offer is live, and the
   post-quiz survey covers whatever she actually received (video, or video + quiz).
3. **The questions** — a fixed 15-question walk through the video's bank.
   [video-quiz-render.service.js](../../bot/shared/services/quiz/video-quiz-render.service.js)
   composes each question from ordered layers (progress pill → listen → look →
   choices → ask), and [video-quiz-sender.service.js](../../bot/shared/services/quiz/video-quiz-sender.service.js)
   ships them: reply buttons for ≤3 text options, list messages for 4, image
   headers for picture questions, sequential voice-note pairs for audio options
   (each label sent as a **quoted reply** to the clip it names), and a WhatsApp
   Flow whose options *are* the pictures (`RadioButtonsGroup`, `media-size: large`)
   when `VIDEO_QUIZ_FLOW_ID` is registered.
4. **Share to the class** — forwarding interactive messages strips their buttons,
   so the class loop uses the one thing that forwards perfectly: a link.
   [video-quiz-share.service.js](../../bot/shared/services/quiz/video-quiz-share.service.js)
   mints a `wa.me/<bot>?text=QUIZ-<CODE>` message; each child taps it, lands in
   their own 1:1 chat, gives their name + class once (one Flow screen when
   `STUDENT_JOIN_FLOW_ID` is set, two chat messages otherwise), and plays with
   full media. Children are remembered between quizzes; siblings sharing a
   handset are asked which of them is playing; any child can
   [invite a friend](../../bot/shared/services/quiz/video-quiz-invite.service.js).
5. **The class report** — next morning (or as soon as every child finishes),
   [video-quiz-report.service.js](../../bot/shared/services/quiz/video-quiz-report.service.js)
   sends the teacher one designed PDF: what to reteach first, the wrong answer
   the class clustered on (only when a majority actually agreed on it), why that
   mistake happens, and how each child did. The report fires **once** per share
   code, guarded in the database.

## Enable it

```bash
# 1. Import the content library (idempotent — safe to re-run)
node bot/scripts/setup/import-video-quiz-library.js --apply

# 2. Region gate: the library is Pakistani-curriculum content, so the feature
#    is seeded ON for region='pakistan' and OFF everywhere else.
DEFAULT_REGION=pakistan

# 3. This deployment's dialable number, for the class share links
WHATSAPP_BOT_NUMBER=9230XXXXXXXX

# 4. Register the Flows (picker + optional picture/join Flows)
node bot/scripts/setup/register-all-flows.js
#    → sets STUDENT_VIDEOS_FLOW_ID, VIDEO_QUIZ_FLOW_ID, STUDENT_JOIN_FLOW_ID
```

Every step degrades cleanly: no `VIDEO_QUIZ_FLOW_ID` → picture questions fall
back to a numbered grid + list picker; no `STUDENT_JOIN_FLOW_ID` → the child is
asked name and class in chat; no `WHATSAPP_BOT_NUMBER` → share links are
disabled (never mis-addressed); no `OPENAI_API_KEY` → the report still sends,
without the optional coaching paragraph.

**Serving a different region?** The quiz corpus was authored against these
exact Pakistani-curriculum videos, so the gate is per-region data, not code:
flip `video_quizzes_enabled` on your own `region_features` row once you have a
corpus for your own library. To re-host the content on your own bucket, mirror
the prefixes above and set `CONTENT_LIBRARY_BASE`.

## Data

`student_videos` (the library), `quizzes` (`quiz_source='video'`, one per video),
`quiz_questions` (media + per-option feedback + render pattern per row),
`quiz_sessions` / `quiz_answers` (attempts — shared with the [Quiz](quiz.md)
feature), `quiz_share_codes` (class links + friend invites), `students`
(child identity, roster-invisible), and `video_quiz_deliveries` (the full
sent → offered → taken funnel; query `v_video_quiz_popularity` for adoption).
See [00_complete-schema.sql](../../infrastructure/supabase/00_complete-schema.sql).

## Related

- [Quiz](quiz.md) — the teacher-authored topic quiz this feature shares its session engine with.
- [Attendance](attendance.md) — where class rosters come from (quiz children never leak into rosters).
