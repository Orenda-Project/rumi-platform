# Rumi Feature Library

Every Rumi feature runs on WhatsApp. Each page below explains **what the feature is**, **how it works** end to end, **what the teacher experiences**, and the **API key(s) that switch it on** (Rumi gates features by presence — set a feature's keys and it turns on; leave them blank and it stays off cleanly).

Run **`npm run doctor`** at any time to see which features are live for your current configuration.

| Feature | Essence | Switches on when you set |
|---|---|---|
| 💬 [AI Chat](ai-chat.md) | Ask any teaching question, get a pedagogy-grounded answer | core — powered by `OPENROUTER_API_KEY`; voice questions need `SONIOX_API_KEY` |
| 📝 [Registration](registration.md) | Friendly WhatsApp onboarding for teachers | _core — always on_ |
| 🎯 [Classroom Coaching](coaching.md) | Recording → framework-scored report + reflective conversation | `SONIOX_API_KEY` |
| 📖 [Reading Assessment](reading-assessment.md) | Student reads aloud → fluency, accuracy, comprehension | `SONIOX_API_KEY` |
| 📋 [Lesson Plans](lesson-plans.md) | Topic + grade → full lesson-plan PDF | `GAMMA_API_KEY` |
| 📸 [Pic-to-LP](pic-to-lp.md) | Photo of a textbook page → illustrated 2-page LP | `KIE_API_KEY` |
| 📚 [Homework](homework.md) | Pick class + chapters → curriculum homework bundle PDF | `HOMEWORK_FLOW_ID` |
| 🧠 [Quiz](quiz.md) | Teacher sends a topic quiz to a class → students answer, teacher gets results | _core — powered by `OPENROUTER_API_KEY`_ |
| 🎬🎓 [Video Quizzes](video-quizzes.md) | Curriculum video → its quiz 3 s later; class share links + next-morning reteach report. Ships with the open Taleemabad content library (890 videos / 10,929 questions) | import script + `DEFAULT_REGION=pakistan` |
| 🗣️ [Voice Messages](voice.md) | Full spoken interaction in many languages | `SONIOX_API_KEY` + `ELEVENLABS_API_KEY` |
| 🎬 [Video Generation](video.md) | Topic → short narrated educational video | `VIDEO_GENERATION_ENABLED` + `KIE_API_KEY` |
| ✅ [Attendance](attendance.md) | Tap-based attendance via WhatsApp Flows | _core — always on_ |
| 🧮 [Exam Checker](exam-checker.md) | Photograph answer sheets → vision OCR + AI grading | `MISTRAL_API_KEY` |

**How lesson plans get routed** (pre-generated vs Gamma vs photo): see [LP_PATHS.md](../LP_PATHS.md).

**Utility flows** (presence-gated on their Flow id, with a text fallback when unset): a **settings** flow (`SETTINGS_FLOW_ID` — language + coaching framework), a **status** flow (`STATUS_FLOW_ID` — your active sessions), an **edit-class** roster editor (`EDIT_CLASS_FLOW_ID`), and a **student-video** library picker (`STUDENT_VIDEOS_FLOW_ID`).

For deep customization of any feature (swapping frameworks, changing benchmarks, adding languages or regions), see the [Agent Customization Guide](../agent-customization.md).
