# Rumi Feature Library

Every Rumi feature runs on WhatsApp. Each page below explains **what the feature is**, **how it works** end to end, **what the teacher experiences**, and the **API key(s) that switch it on** (Rumi gates features by presence — set a feature's keys and it turns on; leave them blank and it stays off cleanly).

Run **`npm run doctor`** at any time to see which features are live for your current configuration.

| Feature | Essence | Switches on when you set |
|---|---|---|
| 💬 [AI Chat](ai-chat.md) | Ask any teaching question, get a pedagogy-grounded answer | _core — always on_ |
| 📝 [Registration](registration.md) | Friendly WhatsApp onboarding for teachers | _core — always on_ |
| 🎯 [Classroom Coaching](coaching.md) | Recording → framework-scored report + reflective conversation | `SONIOX_API_KEY` |
| 📖 [Reading Assessment](reading-assessment.md) | Student reads aloud → fluency, accuracy, comprehension | `SONIOX_API_KEY` |
| 📋 [Lesson Plans](lesson-plans.md) | Topic + grade → full lesson-plan PDF | `GAMMA_API_KEY` |
| 🗣️ [Voice Messages](voice.md) | Full spoken interaction in many languages | `SONIOX_API_KEY` + `ELEVENLABS_API_KEY` |
| 🎬 [Video Generation](video.md) | Topic → short narrated educational video | `VIDEO_GENERATION_ENABLED` + `KIE_API_KEY` |
| ✅ [Attendance](attendance.md) | Voice/tap attendance via WhatsApp Flows | _core — always on_ |
| 🧮 [Exam Checker](exam-checker.md) | Photograph answer sheets → OCR + AI grading | `AWS_TEXTRACT_*` |

> The illustrations on these pages are generated with Kie.ai and kept deliberately **global** — Rumi is for teachers everywhere.

For deep customization of any feature (swapping frameworks, changing benchmarks, adding languages or regions), see the [Agent Customization Guide](../agent-customization.md).
