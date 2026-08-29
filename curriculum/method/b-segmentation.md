# Stage B — Segmentation

> Read IN FULL before dividing a chapter into teaching-day lessons. Gates G3/G3b.

## Contents

- Stage B — Segmentation (= chunking)
- Chunking = human-curated boundaries + AI fill, NOT "AI freely chunks the chapter"
- The two orthogonal tags — `lp_type` and `skill_type`
- Segment index vs Day# (they are different columns, and conflating them is a real defect)
- Revision and Assessment are TWO DIFFERENT ARTIFACTS
- SLO source and codes
- Sibling pointers
- Deriving vs ingesting a partner scheme-of-work
- Anchor lesson COUNTS on local cadence
- Materialize segmentation as the MASTER SHEET — it doubles as the progress/tracking home

---

## Stage B — Segmentation (= chunking)

**Definition:** decide how a **chapter** divides into individual **teaching-day lessons** — each =
ONE skill (~one period), in pedagogical order, tagged with `skill_type`, `lp_type`, the pages it
teaches, its SLO(s), Bloom's, new-vs-revision, and (maths) CPA phase. It draws boundaries; it does
not write content. **1 LP = 1 skill = 1 period = 1 teaching day.**

### Chunking = human-curated boundaries + AI fill, NOT "AI freely chunks the chapter"
(the whole an earlier run V3 shift). Apply the subject's FIXED sequence as the boundary rule:

| Subject | Fixed sequence | Notes |
|---|---|---|
| **English** (7 types) | **Pre-Reading[exactly 1] → Reading/Comprehension[1-3] → Oral[1-3] → Reading & Critical Thinking[1-3] → Language-Focus[3-5, heaviest] → Writing[1-3]** per unit; G1-2 add a 4-LP Review Unit every 3 units | `pre_reading · phonics · reading_comprehension · vocabulary_grammar · writing · oral_communication · revision` |
| **Maths** (5 types, CPA) | **Concrete[1, mandatory first] → Pictorial & Abstract[1-2] → Word-Problem[1] → Retrieval[chapter end]** per topic | `concrete · pictorial · pictorial_abstract · word_problem · revision`. `pictorial_abstract` legitimately 50–72%; Geometry/Data may legitimately start pictorial/abstract. Start phase is grade-dependent (G1 concrete hard-start ≥2 days). |
| **Urdu** (7 types) | **alfaaz_maani → buland_khwani → arkaan_saazi → qawaid[1-4, variable] → tafheem → takhleeqi_likhai → duhrai** per chapter | `arkaan_saazi (ارکان سازی) · alfaaz_maani (الفاظ و معنی) · qawaid (قواعد) · buland_khwani (بلند خوانی) · tafheem (تفہیم) · takhleeqi_likhai (تخلیقی لکھائی) · duhrai (دُہرائی)`. **7 types confirmed — NO standalone oral type** (see Stage C). **~40–50% of Urdu chapters are listening/reading-only (سنانے کا / برائے مطالعہ) → ZERO LPs** — verify per book. G1 Ch0 = a قاعدہ Qaida primer (~25–32 LP). |
| **Science** (5 types, **Science-5** = a 5E micro-cycle) | **`engage_hook` (Engage) → `investigate_handson` (Explore, POE) → `concept_build` (Explain) → `apply_connect` (Elaborate) → `review_assess` (Evaluate)**. Per chapter: open → [engage → investigate → concept] × each topic → apply → assess | **NEVER concept before investigate** ("tell then confirm" is measurably weaker than "explore then explain"). 5E is a **multi-day architecture, not a lesson template** — running all five Es inside one 40-min lesson reduces the effectiveness of each phase. Long-running observations decouple: tag the *setup* day `investigate_handson` and note the observation window. Same taxonomy G4=G5 — only the Bloom ceiling and fair-test rigour rise. Research + the section-name mapping table: [reference/research/science_pedagogy_and_taxonomy.md](../research/science_pedagogy_and_taxonomy.md). |

For any subject with no precedent, **derive its sequence from the book's own sections** — the section
headers usually already encode the intended pedagogy.

### The two orthogonal tags — `lp_type` and `skill_type`
Every lesson carries **both**: `lp_type ∈ {content, revision, assessment}` = the queryable KIND;
`skill_type` = HOW it is taught (the pedagogical subtype above). Both get a column on every tab.

### Segment index vs Day# (they are different columns, and conflating them is a real defect)
- **Segment-index scheme:** `1–50` = sequential content day within a chapter · `900–949` = spiral
  review (references earlier chapters via `revision_source_segments[]`) · `990–999` = chapter review
  · `995` = assessment. Revision target ~12–20% of LPs.
- **`Day#` is a SEQUENTIAL teaching-day ordinal (1,2,3…N per grade), counting revision and assessment
  as ordinary days.** NEVER surface the internal index in the Day# column — it reads as
  `1,2,…,6,990,995` and can't be placed in sequence. Keep the index in a separate narrow **`Seg`**
  column so it stays queryable. Generalises: **any curriculum-matrix sequence column must be a plain
  ordinal; never surface an internal index where a human reads sequence.**

### Revision and Assessment are TWO DIFFERENT ARTIFACTS
- **Revision LP (Seg 990 chapter-review / 900-949 spiral)** — a *teacher-facing* lesson that rolls up
  prior SLOs. `lp_type=revision`. Goes through the normal C→D0→D pipeline. **Every complete chapter
  ends with one**, for every subject.
- **Assessment (Seg 995)** — a *student-facing* **worksheet**: fillable, B&W A4, bilingual,
  print-friendly, built from a per-CHAPTER enriched rollup (synthesise all the chapter's daily
  segments → mirror those exact skills), generated via
  `pedagogical-worksheet-imagegen` — **kie image, NOT
  HTML→PDF** (operator-locked). Ships with a **SEPARATE answer-key + marking-scheme PDF**. Scheduled
  at chapter ends AND at each official assessment window. See §Stage D0 for the full spec.
- Both appear as first-class rows on the matrix; the calendar carries `REV` and `ASSESS` days.
- **Chapter-tail order is a market decision** — ICT locked **assessment (995) then revision (990)**.
  Stamp it in the segmentation `_meta` so every downstream consumer inherits it.

### SLO source and codes
**Use the most granular *measurable* source.** Where a textbook prints a per-chapter SLO map (ICT's
"Explorer's Pathway"), that is gold-standard and already verbatim in page-truth — use it. Otherwise
derive from the syllabus. Code `{Subj}-{Grade}-{Strand}-{NN}` (`E-01-RD-28`, `S-04-A1-01`). **Every
lesson ≥1 SLO.** Chapter-level thematic SLOs are usually too coarse (one book had 0% chapter-level
coverage — derive from page-level). **Never fabricate an SLO to fill a gap; flag the gap.**

### Sibling pointers
Stage-B emits `prev_segment_id` + `next_segment_id` per lesson. The warm-up spirals to the PREVIOUS
lesson — without an explicit pointer that dependency is invisible and drifts when lessons are
reordered.

### Deriving vs ingesting a partner scheme-of-work
- **DERIVE from textbook + syllabus by default; treat a partner SOW as a CROSS-CHECK — UNLESS you've
  verified it is genuinely complete and government-paced.** The instinct to "ingest because the
  partner already chunked" is a trap: run the QA on the SOW *first*. Tanzania verdict (2026-05-26):
  the partner maths SOW was ingest-faithful but **source-gappy** — G1 topic-sparse (60/76 lessons
  objective-only), G5 missing 2 of 7 strands, paced 7–8/wk vs the government 6/wk. We flipped to
  derive: walk the page-truth chapter-by-chapter, chunk in textbook order, tag each to the syllabus
  competence + pages + CPA + Bloom, and **size to the government cadence**. The partner SOW then
  cross-checks coverage/sequence and lends objective phrasing.
- **If you do ingest a SOW, parse it deterministically** (script, not an LLM — structured tables are
  where scripts win). Then reconcile: SLO code from the competence, page range from page-truth,
  CPA/Bloom draft-tagged at ingest and finalised at enrichment.
- **VERIFY partner-SOW completeness per sub-term — don't assume.** Count filled lessons per
  (sub-term, week). Real finding: complete for two grades, near-complete for one, and **only Term 1
  for two others** (Term-2 week tables were empty stubs). Missing spans get derived or requested —
  flag them, never silently ship a half-year.

### Anchor lesson COUNTS on local cadence
Read period length(s) and **periods/week per subject/grade from the official SYLLABUS**, not the
partner's sheet, plus teaching-weeks/term from the official calendar. **A partner's scheme often
paces higher than the government allocation.** Two traps: (a) the official "teaching days" count
excludes holidays but still *includes* exam days — carve out orientation + mid-term + end-of-term
exam weeks; (b) the syllabus's per-competence **period budget is GROSS** (it assumes every week is
pure content) — scale it to effective content weeks before using it as a target. Distribute each
strand to its syllabus proportion across introduce → guided/independent practice → application →
consolidation/retrieval → review days, every period a distinct page-anchored lesson. Cross-check
granularity against the textbook (lessons ÷ pages).

### Materialize segmentation as the MASTER SHEET — it doubles as the progress/tracking home

> Full tab map, row grammar, the pipeline's write-contract with the sheet, the binding house
> formatting and a replication checklist: **reference/curriculum-matrix-sheet.md**.

One workbook is simultaneously the region's **curriculum home**, the pipeline's **progress tracker**,
the **team-review surface**, and the **delivery index** (each row hyperlinks to that day's LP PDF and
voicenote). Per-subject tab: `Day# · Seg · LP Type · Grade · Sub-term · Week · SLO Code · Topic · Skill Type ·
CPA Phase* · Section · Pages · SLO Description · Bloom* · Duration · Enriched · Score % · Verified ·
LP · Voicenote · Reviewer` (`*` = auto-draft), plus **Navigation** (stats + completeness map + the
SLT review ask + **the colour legend**), **Teaching Calendar** (the day grid), **All Segments**
(flat, filterable), **Skill Taxonomy**, **Pipeline Stages**, **Progress Tracker**. Curriculum
columns fill at Stage B; tracking columns fill as later stages complete — so one sheet shows
coverage at a glance.

- **Build it via a spreadsheet export (optional)**
  (MCP create 403s on its default parent folder). Route through the
  `google-workspace-sheets` skill — including its **mandatory
  screenshot-and-iterate loop** (authenticated PDF export → `pdftoppm` → `Read` → fix → repeat).
- **Formatting = the jewel-tone Data-Matrix house style**: Arial; title bar `#0F4C5C` white 16;
  column-header `#264653` white bold 10; coral `#E76F51` grade/group separator bands (merged, white
  bold); section bands `#2A9D8F`; cream `#F4F1DE` mini-labels; CPA chips concrete `#FCE7C8` /
  pictorial `#C8E6F4` / abstract `#D9E4D6` / word-problem `#F4C7C7` / mixed `#EAD7F0`; Bloom chips a
  blue gradient by level; data text `#1F2937` size 9; wrap everywhere; categorical cols CENTER, text
  cols LEFT/TOP. **Freeze the top block (~4 rows) + the leading identity columns.**
- **It's the SLT review surface → make it navigable, not just pretty.** **Nested collapsible row
  groups (Grade ▸ Chapter ▸ Lesson)** via `addDimensionGroup`, chapters shipped collapsed; a **basic
  filter** on the header row across all columns. **Kill text cutoff**: wrap ON, generous widths for
  Topic/Objective (~240–340px), and NEVER truncate cell text in code (`[:34]`-style clipping reads
  as "cut off") — let wrap + width show it in full.
- **Outline gotcha:** a `batchUpdate` that 429s mid-way **leaves the outline half-applied** and the
  tab then reads as "expanding/contracting rows are broken." Batch in ≤40-request chunks with
  backoff, delete existing groups deepest-first before rebuilding, and verify group counts after.
- **Get the SLT to review the segmentation and a few sample LPs TOGETHER** before scaling.
