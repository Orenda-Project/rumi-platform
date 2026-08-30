# Stage E — Voicenotes

> Read before any TTS spend. Gate G9.

## Stage E — Voicenotes

Per `lp-voicenotes`: script from the enriched body → TTS. Two shapes —
**segment** (45–90s, pre-teach heart) and **chapter-heart** (90–150s, cascade-and-fix orientation).
**Mandatory pre-TTS scanner gate before any spend.** Cross-language port: A/B-test 3–5 voices on the
worst pronunciation cases (Kiswahili prenasalized stops mb/nd/ng; Arabic emphatics/pharyngeals), build
the language's diacritic/heteronym registry, narration body ≥55% target script with technical terms
inline.

---

## E1 · SIZE THE RUN FROM THE SERVING TABLE, NOT THE CORPUS

**The corpus tells you what exists; only the serving table tells you what still needs paying for.**
A region part-way through a rollout already has voicenotes attached to some rows, and counting the
corpus instead re-buys them.

The pointers live in two places, and both must be counted:

| Artifact | Column | Table |
|---|---|---|
| Segment voicenote | `voicenote_ogg_r2_key` (+ `voicenote_prompt`) | `textbook_segments` |
| Chapter-heart | `chapter_heart_voicenote_ogg_r2_key` (+ `chapter_heart_text`) | `pre_generated_lps` |

```sql
-- segments still owed audio (LIVE rows only — a dark row is not teacher-facing yet)
SELECT subject, segment_type, count(*)
FROM textbook_segments
WHERE curriculum = :curriculum AND is_available
  AND voicenote_ogg_r2_key IS NULL
GROUP BY 1,2;

-- chapter-hearts still owed
SELECT count(*) FILTER (WHERE chapter_heart_voicenote_ogg_r2_key IS NULL)
FROM pre_generated_lps WHERE curriculum = :curriculum;
```

Worked example — Punjab, 2026-08-22: 1,483 live segments, **352 already had audio**, so the run is
**1,131 segments + 151 chapter-hearts**, not 1,483 + 197. Sizing off the corpus would have re-bought
352 voicenotes and overstated the bill by ~30%.

## E2 · ONE VOICE PER LANGUAGE — AND THE LANGUAGE IS THE NARRATION'S, NOT THE SUBJECT'S

**Urdu-medium markets: Sara `9cI5mhBtM4WtQ9Fo6jWQ` on `eleven_v3`. Locked. Do not re-litigate** —
3 weeks and 60+ feedback items were spent getting there (`lp-voicenotes` §1).

The trap: assuming an English or Maths lesson needs an English voice. **It does not.** The teacher is
Urdu-medium, so the *narration* is Urdu for every subject; English content words sit inline as Latin
script. One voice covers the whole corpus — English, Maths and Urdu alike. Splitting by subject
reintroduces the exact Jessica-mangles-Urdu failure the voice choice was made to avoid.

New language ⇒ A/B-test 3–5 voices on that language's worst pronunciation cases **before** the batch,
and record the trace in `reference/voice-selection-evidence.md`.

## E3 · HOW THE TRANSCRIPTS ARE GENERATED

Source of truth is the **enriched body** (Stage C) — never the rendered PDF, never the slide script.
The PDF is a lossy projection; the enrichment is where the pedagogy lives.

1. **One sub-agent per CHAPTER, not per segment.** A chapter's days share vocabulary, a story arc and
   a spiral thread; per-segment agents produce audio that repeats the same set-up five times and
   contradicts itself on names. Chapter scope is also what the cost model below is calibrated on.
2. The agent reads the chapter's enriched segments + the locked brief
   (`reference/segment-voicenote-brief.md` for days, `chapter-heart-brief.md` for the heart) and emits
   one script per segment plus one chapter-heart.
3. **Write the script to `voicenote_prompt` before rendering audio.** The text is the reviewable
   artifact and the thing a native speaker can fix cheaply; the OGG is expensive and derived. A row
   with an OGG and no prompt cannot be audited.
4. Language shape (V20 LOCKED): body **≥55% target script**, technical/English content words inline as
   Latin, **never** Roman-Urdu narration, **never** transliterated English. Inline digits spelled as
   English words. No Markdown — paired emphasis tokens get voiced literally.

## E4 · GATE G9 — THE SCANNER RUNS BEFORE EVERY BATCH, INCLUDING HAND-WRITTEN DRAFTS

No TTS call without a scanner pass. This has already caught bugs in scripts a human wrote by hand and
eyeballed as fine. A failed scan is cheap; a rendered batch of 1,131 wrong-phoneme files is not.

## E5 · THE COST + TOKEN MODEL (calibrated, not guessed)

Calibration comes from the 402-segment / 43-chapter Punjab v7 run:

| Unit | Measured |
|---|---|
| Segment script | ~1,100 chars |
| Chapter-heart script | 1,200–1,900 chars (~1,550 avg) |
| ElevenLabs | ~$0.10 per 1k chars (Pro-plan overage) |
| LLM transcript generation | **~50k tokens per CHAPTER** (Sonnet) |
| Prior full batch (402 seg / 43 ch) | ~$60–100 in API spend |

Estimate a new run as:

```
TTS chars   = (segments × 1100) + (chapter_hearts × 1550)
TTS $       = TTS chars / 1000 × 0.10
LLM tokens  = chapters_touched × 50_000
LLM $       ≈ chapters_touched × $0.25 – $0.35   (Sonnet, ~80/20 in/out)
```

Worked example — the Punjab top-up (1,131 segments · 151 hearts · 197 chapters):

| Line | Amount |
|---|---|
| Segment chars | 1,131 × 1,100 ≈ **1.24M** |
| Chapter-heart chars | 151 × 1,550 ≈ **234k** |
| **ElevenLabs** | ~1.48M chars ≈ **$148** |
| **LLM tokens** | 197 × 50k ≈ **9.9M tokens** |
| **LLM spend** | ≈ **$50–70** |
| **Total API** | **≈ $200–220** |

Two things the model deliberately does not include, and you must state them separately rather than
folding them in: **native-speaker review time** (the real constraint — audio cannot be spot-checked as
fast as it is made) and **re-render headroom**. Budget ~10% of segments for a second pass.

## E6 · ORDER OF OPERATIONS — AND THE ONE STEP THAT MAKES IT RESUMABLE

```
scripts (per chapter) → write voicenote_prompt → G9 scanner → TTS → R2 → set voicenote_ogg_r2_key
```

**Write the DB pointer LAST, per row, immediately after that row's upload succeeds.** Then the
pointer's presence *is* the resume state: re-running the batch skips exactly what already landed, with
no manifest to keep in sync and no double spend. Writing pointers in a batch at the end means an
interrupted run either re-buys everything or strands paid-for audio with nothing pointing at it.

Keep the R2 key derivable from the lesson id and **stable across re-renders** — same key, overwritten
in place. A stable key means an improved voicenote needs no DB write and no relink: every surface
pointing at it upgrades silently.
