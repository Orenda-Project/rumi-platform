# 📋 Lesson-plan fidelity — did the lesson follow the plan?

> A lesson plan is a promise. Rumi listens to the lesson and shows, move by move, which parts of the plan happened —
> with the teacher's own words as proof — and never blames a teacher for a bad recording.

Part of [Classroom Coaching](coaching.md). Off by default; turn it on with `LP_FIDELITY_ENABLED=true`.
With [Observe](observe.md#section-b--did-the-lesson-follow-its-plan) on too, it is also **Section B** of a coach's
observation: the coach links the teacher's plan, reviews every verdict, and the teacher gets a kind, scoreless version.

## In programme terms

**Did the lesson follow the plan? A move-by-move check that structured pedagogy is actually being taught.**

Structured pedagogy only works if the lessons in the teacher guide actually reach the classroom. This feature measures adherence, the core dimension of fidelity of implementation. The plan becomes about 10–15 steps, and the recorded lesson is checked step by step, with a timestamped quote as evidence for each verdict. When a teacher swaps in a different activity that serves the same learning objective, the step earns full credit, and a clearly stronger swap is also named as a strength. This follows the implementation-science principle of standardising the function of a step, not its form. A step that was started but left unfinished earns half credit. A step with no evidence earns none. Steps the recording cannot show are reported as "not assessed" and left out of the score. A garbled recording is never scored 0%, and a recording of a different lesson is flagged as a mismatch. The result is a high, partial or low band, with the percentage beside it.

### When a teacher does it differently: how substitution is treated

Programmes have moved past "fidelity or adaptation". The working principle is to **standardise the function of each
step, not its form** [Hawe04]: a change that keeps the core of a step is *fidelity-consistent* [FRAME19]. Classroom
evidence backs this: across 13 countries, about a quarter of teachers' modifications to scripted guides were positive,
while partly skipped activities were harmful almost every time [Piper-RTI18], and teachers who adapted rarely and
purposefully had the best outcomes [Hansen13].

So a substitution **earns full credit** when all four hold:
1. **Same function** — it serves the same learning objective and sub-skill as the planned step.
2. **The core is intact** — it changes the example, materials or activity format, not an essential element.
3. **Student practice is kept or increased** — the "you do" is not replaced by teacher talk.
4. **There is evidence** — a quoted, timestamped moment shows it happened.

A clearly **better** substitution earns full credit and is named as a strength in the teacher's report. A step that is
only started earns half credit and becomes a coaching focus; a step that cannot be heard is "not assessed", never zero.
Coaches are encouraged to treat the result as mentorship, not inspection [Piper-Dubeck24].

**Where it sits in a structured-pedagogy programme:** teacher guide → **delivery** → coaching → assessment → M&E. It measures delivery, and its result feeds the coaching report and programme monitoring.


### Honest limits

- **Why structured pedagogy, and why check delivery.** Structured pedagogy is rated a "Great Buy" for learning [GEEAP23]; large programmes have long checked delivery by having coaches follow the teacher guide during observations [Piper-JEC18][NORC20]. This feature makes that check possible from a classroom recording.
- **Validation.** There is no validation against blinded, trained human observers. Agreement figures are against AI readers. Scores are stricter than coaches' scores.
- **Run-to-run variation.** Scores move a few points between runs, and more on borderline lessons.
- **Audio only.**
  - Silent board work that is never spoken is "not assessed".
  - Time on task is best-effort.
- **What it does not catch or read.**
  - A plan from the same chapter but a different lesson is not caught.
  - Scanned plans cannot be read.
- **Scope.** It measures adherence only. It does not measure quality of delivery or how students responded.
- **Sampling.** Teachers choose which lessons to record, so the lessons scored are not a random sample.
- **Partial credit.** Half credit for partial delivery is a design choice. Evidence shows partly skipped activities are usually harmful [Piper-RTI18], so treat a partial verdict as a coaching focus.
- **Where the false-credit check comes from.** The check that the grader gives no credit for steps a person confirmed were missed was run on the method in its original deployment. This open-source port was re-calibrated on fictional known-answer lessons: 18 of 18 gradings landed in the expected range.

### Sources

- [Hawe04] Hawe, P., Shiell, A., & Riley, T., 2004, "Complex interventions: how 'out of control' can a randomised controlled trial be?", *BMJ* 328:1561–1563. https://doi.org/10.1136/bmj.328.7455.1561
- [FRAME19] Wiltsey Stirman, S., Baumann, A. A., & Miller, C. J., 2019, "The FRAME: an expanded framework for reporting adaptations and modifications to evidence-based interventions", *Implementation Science* 14:58. https://doi.org/10.1186/s13012-019-0898-y
- [Hansen13] Hansen, W. B., Pankratz, M. M., Dusenbury, L., Giles, S. M., Bishop, D. C., Albritton, J., Albritton, L. P., & Strack, J., 2013, "Styles of adaptation: The impact of frequency and valence of adaptation on preventing substance use", *Health Education* 113(4):345–363. https://doi.org/10.1108/09654281311329268
- [Piper-Dubeck24] Piper, B., & Dubeck, M., 2024, "Responding to the learning crisis: Structured pedagogy in sub-Saharan Africa", *International Journal of Educational Development* 109:103095. https://doi.org/10.1016/j.ijedudev.2024.103095
- [GEEAP23] Global Education Evidence Advisory Panel, 2023, *2023 Cost-Effective Approaches to Improve Global Learning…*, FCDO/World Bank/UNICEF/USAID. https://documents1.worldbank.org/curated/en/099420106132331608/pdf/IDU0977f73d7022b1047770980c0c5a14598eef8.pdf
- [Piper-JEC18] Piper, B., DeStefano, J., Kinyanjui, E. M., & Ong'ele, S., 2018, "Scaling up successfully: Lessons from Kenya's Tusome national literacy program", *Journal of Educational Change* 19(3):293–321. https://doi.org/10.1007/s10833-018-9325-4
- [NORC20] Keaveney, E., Fierros, C., Rigaux, A., & Menendez, A. (NORC), 2020 (rev. 2021), *Tusome External Evaluation: Endline Report*, USAID. https://www.norc.org/content/dam/norc-org/documents/standard-projects-pdf/PA00XVBP.pdf
- [Piper-RTI18] Piper, B., Sitabkhan, Y., Mejía, J., & Betts, K., 2018, *Effectiveness of Teachers' Guides in the Global South: Scripting, Learning Outcomes, and Classroom Utilization*, RTI Press OP-0053-1805. https://doi.org/10.3768/rtipress.2018.op.0053.1805

## What it is

When a teacher sends a lesson recording, Rumi asks which lesson plan the lesson followed. The plan can be:

- **a plan Rumi made for them earlier** (picked from a short list of their recent plans),
- **a document they upload** (PDF or Word), or
- **text they paste** into the chat as one message.

Rumi turns the plan into about 10-15 **observable moves** ("recall halves and quarters", "explain with fraction
strips", "pairs solve three problems", "collect an exit ticket"), checks each move against the **timestamped
transcript** of the recording, and adds a **"Did the lesson follow the plan?"** block to the coaching report: a band
(high / partial / low), "N of M planned moves delivered", and one row per planned move with the moment in the
recording that shows it.

## How it works

```
plan text ──► extractor (LLM) ──► 10-15 moves ──┐
                                                ├─► grader (LLM): one verdict per move, with a quoted [MM:SS] line
timestamped transcript (Soniox, diarized) ──────┘
                                                └─► scorer (code): credit ÷ moves counted → % and band
```

1. **Moves.** `fidelity/lp-upload-extractor.js` reads the plan's text (whatever its template) and lists the moves,
   each tagged by phase and by whether it must happen, is an ability-group variant, or is optional.
2. **Verdicts.** `fidelity/fidelity-analyzer.js` gives each move one verdict: `executed`, `substituted_equivalent`
   (a different activity serving the same purpose — full credit), `substituted_better`, `partial`, `not_done`, or
   `not_adjudicable` (the recording cannot show it — left out, never counted as a miss). Every verdict above
   `not_done` is asked to quote a `[MM:SS]` line; a credit that comes back without one is kept but marked
   ("credited, but no moment was quoted" in the report, `unquoted_credit` in the data) and lowers confidence. It
   matches on what a move achieves, not on words, so the transcript and the plan may be in different languages.
3. **Score.** `fidelity/fidelity-scorer.js` is plain arithmetic: executed/substituted = 1, partial = ½, not done = 0;
   not-adjudicable moves and untried optional moves are left out. Band ≥ 80 high, 50-79 partial, < 50 low
   (configurable).
4. **Report.** The result is stored as `coaching_sessions.analysis_data.lp_fidelity` and drawn in the PDF; one chat
   line follows the report; the voice note speaks the band in words, never a percentage.

The grading runs inside the coaching analysis job, beside the pedagogy analysis, and can never fail it.

## What the teacher experiences

On any channel (WhatsApp, Matrix, Slack, Discord — lists become numbered replies where a channel has none):

1. Sends the lesson recording; confirms it is a classroom recording.
2. Answers the photo question; then **"Which lesson plan did you teach?"** — their recent Rumi plans, *upload or
   paste*, or *no lesson plan*.
3. The usual reflection questions, then the report PDF, with the fidelity block:

   | Phase | Planned move | What the recording shows | Verdict |
   |---|---|---|---|
   | Warm-up | Recall halves and quarters | `[00:00]` If I cut a sandwich into 2 equal pieces… | Done |
   | Explain | Explain with paper fraction strips | `[00:50]` I have drawn a number line from zero to one… | Done another way |
   | Independent work | Pairs solve three problems with strips | No moment found in the recording | Not seen |

4. One line in the chat, and the voice note, say how the lesson compared with the plan.

### Every outcome has its own words

| Outcome | What the teacher reads |
|---|---|
| Measured | "*Did the lesson follow the plan?* 9 of 12 planned moves were seen in your recording — you followed part of your plan." |
| A different lesson | "This recording doesn't seem to match the lesson plan you linked…" (the score is near 0, said as a mismatch) |
| No speech timings | "…the recording came back without speech timings… That's a recording problem, not a teaching one." |
| Too unclear | "…the recording was too unclear to judge the planned moves…" |
| No plan linked | "No lesson plan was linked, so this lesson wasn't compared with a plan." |
| Plan unreadable (no text, or no teaching moves in it) | "I couldn't read your lesson plan… send it as a Word file or paste the text (photos and scanned pages can't be read yet)." |
| The check failed (a provider error, or a bad answer from the extractor or the grader) | "The lesson-plan check couldn't run this time because of a problem on our side. The rest of your report is complete." |

None of the not-assessed outcomes is ever shown as 0%.

## The input contract: timestamps

The grader is asked to quote a `[MM:SS]` line for every verdict (a credited verdict without a quote is flagged as
`unquoted_credit` in the report), and only the **diarized** transcription branch writes those stamps (one stamp per
speaker turn). A transcript with no stamps is decided **in code, before any model call**: "not assessed", no
extraction, no grading, no spend (`unusable_guard: 'no_timestamps'`).

A silent loss of diarization (a provider fallback, a bug on the success branch) would turn every lesson into "not
assessed" with nothing else looking wrong. So every classroom transcription records whether it was diarized — a
`[diarization]` log line and a daily Redis counter — and **`rumi doctor`** shows it:

```
✅ Lesson-plan fidelity (did the lesson follow the plan?) — 41 of 42 classroom recordings in the last 7 days came back with speech timings (98%)
```

Below 80% the line is flagged ⚠️.

## Switch it on

```bash
LP_FIDELITY_ENABLED=true            # off by default
SONIOX_API_KEY=...                  # diarized transcripts carry the [MM:SS] timings
OPENROUTER_API_KEY=...              # the extractor and the grader
```

Optional (see `.env.template`):

| Variable | Default | What it does |
|---|---|---|
| `LP_FIDELITY_MODEL` | `google/gemini-3.8-flash` | Grader model (OpenRouter slug) |
| `LP_FIDELITY_EXTRACT_MODEL` | `LP_FIDELITY_MODEL` | Plan → moves model |
| `LP_FIDELITY_RUNS` | `1` | Gradings per lesson (odd, max 5); the median is kept |
| `LP_FIDELITY_MAX_TOKENS` | `16000` | Grader completion cap (max 32000) |
| `LP_FIDELITY_EXTRACT_MAX_TOKENS` | `8000` | Plan → moves completion cap (max 32000) |
| `LP_FIDELITY_REASONING_EFFORT` / `LP_FIDELITY_EMPTY_RETRY_EFFORT` | unset | For reasoning models that answer empty without a thinking budget |
| `LP_FIDELITY_BAND_HIGH` / `LP_FIDELITY_BAND_PARTIAL` | `80` / `50` | Band cut-offs |
| `LP_FIDELITY_LIST_LIMIT` | `8` | Recent Rumi plans listed in the picker (max 8) |
| `LP_FIDELITY_PLAN_WAIT_SECONDS` | `90` | How long the analysis waits for an uploaded plan still being read |
| `RUMI_FEATURE_LP_FIDELITY=off` | — | Pause it from the console without touching the flag |
| `COACHING_MIN_AUDIO_SECONDS` | `900` | Audio at least this long starts classroom coaching |

**Why that default model.** On a held-out set of 25 real lessons, `google/gemini-3.8-flash` agreed with a majority
of three LLM judges at move level with κ 0.72 / 0.73, against 0.64 / 0.70 for a cheaper model; it costs roughly
$0.03-0.04 per graded lesson at OpenRouter prices. Grading sends the transcript to the model provider you configure.

**Frameworks.** The measurement is framework-neutral and every report transformer shows it. A framework may also
map it onto its own scale through an optional `applyLpFidelity(analysis, lpFidelity)` hook: the FICO framework sets
its indicator 1.2 "Fidelity to LP Steps" from the measurement (≥ high band → 4, ≥ partial → 3, ≥ half of partial →
2, else 1) when — and only when — the lesson was measured.

## What the evidence says (and doesn't)

- **Agreement with LLM judges:** move-level κ 0.72 / 0.73 for the default grader on 25 held-out lessons, against a
  majority of three LLM judges. These are not trained human raters.
- **No invented credit:** 0 of 18 moves that a human confirmed absent were credited, across every model tried.
- **Stricter than coaches:** machine scores ran well below coaches' scores on the same lessons.
- **Run-to-run wobble:** the same lesson graded again moves by a few points, which is why people see bands.
- **There is no blind study against trained human raters.** Treat the band as a structured, evidence-quoting
  second opinion, not as a validated measure of a teacher.

### Calibration check (run it after any prompt or model change)

The grader and extractor prompts are calibrated artefacts. `tests/fixtures/fidelity/` holds a fictional set written
for this repo — two plans and five transcripts — and a script runs them against the real models:

```bash
node bot/scripts/fidelity-calibration.js --repeats 3 --out calibration.json
```

| Case | Expected | Default models, 3 repeats each (2026-10-02) |
|---|---|---|
| Plan fully followed | 90-100 | 100, 100, 100 |
| Half followed (3 moves skipped, 2 thin) | 55-75 | 63.6, 63.6, 63.6 |
| Number line instead of fraction strips | 85-100 | 95.5, 95.5, 95.5 |
| A different lesson | 0-15, "lesson mismatch" | 0, 0, 0 (all flagged mismatch) |
| No timestamps | not assessed | not assessed, no model called |
| The other plan, followed | 85-100 | 100, 100, 100 |

## Known limitations

- **Scanned or photographed plans** have no text layer and are "plan unreadable" (no vision read yet).
- **Uploaded documents need object storage** (R2) for the background reading job; pasted text and Rumi-made plans
  do not.
- **A plan Rumi made** is read from the text stored when it was generated (or from its PDF for older plans). Its move
  list is extracted once and kept on the plan (`lesson_plans.content.fidelity_moves`), so every lesson taught from it
  is graded against the same moves; the verdicts themselves still vary by a few points between gradings.
- **Quotes in scripts other than Latin or Arabic** may not render in the PDF's built-in font; the gloss next to them
  does.
- A recording that ends early can make late moves look missed; the scorer flags a grader that says so and counts
  them anyway (`truncation_inconsistent`, low confidence) but changes no score.

## Code map

`bot/shared/services/coaching/fidelity/` — `fidelity-orchestrator.js` (inputs, statuses, runs), `lp-upload-extractor.js`
+ `upload-extractor-prompt.js`, `fidelity-analyzer.js` + `grader-prompt.js`, `fidelity-scorer.js`, `fidelity-preflight.js`
(the timestamp contract), `fidelity-session.js` (one session's inputs + the framework hook), `fidelity-recompute.service.js`
(a plan that arrives late), `fidelity-report.js` (report block, chat line, voice projection), `lesson-plan-text.js`
(a Rumi-made plan's text). The flow: `lp-coaching/lp-step.service.js`, `lp-list-selection.handler.js`,
`lp-text-paste.service.js`, `coaching-flow-buttons.js`. Diarization health: `coaching/diarization-health.js`.
