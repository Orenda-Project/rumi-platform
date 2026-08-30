# FULL-BOOK DIVISION brief (Stage B) — divide ALL chapters of one book

> **⚠️ DO THIS ENTIRELY YOURSELF, IN THIS ONE AGENT. Do NOT spawn, launch, or delegate to any sub-agents (no Task/Agent tool), and do NOT write a merge script + fragment dirs expecting to combine later — you cannot wait across turns, so that strands the work. You personally read the page-truth chapter by chapter and write the single output file. The division is well within one agent's budget (you're reading small JSON, not PDFs).**

You divide an ENTIRE book into teaching-day lessons, grounded ONLY in the already-captured page-truth (`01_page_truth/<stem>/pg_*.json` + `_toc.json`). NO external APIs, no PDF re-reading needed (page-truth is authoritative). Extend the signed-off Ch1 sample to every chapter.

## Corpus root (absolute)
`<path-to-your-corpus> 2026/Rumi 10 April 2026/06_Logs & Misc/Reports/Active/Simulation Week - July 2026/ICT/Curriculum Ingestion`

## THE PATTERN TO MATCH EXACTLY (your subject's signed-off Ch1 sample)
Read your book's sample file in full and replicate its schema + conventions for every chapter:
- English → `02_segmentation/grade_1_english_ch1_segments.json`
- Maths → `02_segmentation/grade_1_maths_ch1_segments.json`
- Urdu → `02_segmentation/grade_1_urdu_ch1_segments.json`
- Science → `02_segmentation/grade_4_general_science_ch1_segments.json`
Also read `CARRY_FORWARD.md` §"Evidence-based enrichment ELEMENTS" — mark in each lesson's `notes` which elements attach (retrieval warm-up always; decode+encode+decodable+drill for English/Urdu reading; number-sense+fluency+mastery for Maths; توڑ/جوڑ + املا for Urdu). You do NOT enrich — you just tag which elements Stage C must add.

## ⚖️ SIZE TO THE TEACHING-DAY BUDGET (hard constraint — operator 2026-08-01)
The whole book = one grade-year for that subject, so it must fit the year's period budget:
- **Core subject (English / Urdu / Maths): ≤ ~140 lessons per book** (incl. every 990 revision + 995 assessment). Ceiling 155 (5 periods/wk × 31 teaching wks); target ~140 leaves buffer.
- **Science: ≤ ~84 lessons per book** (3 periods/wk × 31 wks; ceiling 93).
If your natural division exceeds the target, **CONSOLIDATE, don't pad**: (a) fold a standalone single-page **Skill-Sharpener / consolidation / Copy-work** day into the **preceding concept lesson** (union the pages, keep the concept's skill_type/CPA/5E phase); (b) merge **two adjacent same-skill practice days** into one; (c) never merge across a CPA/5E boundary (don't fuse a concrete into a pictorial, or engage into concept). **Never drop SLO coverage, pages, or the per-chapter revision+assessment** — consolidation reduces lesson COUNT, not curriculum. Sanity-check the final count against the target and report it.

## Rules (same as the sample)
1. **1 lesson = 1 skill = ~1 period (25-35 min) = 1 teaching day.** Group pages that teach one skill; split a page teaching two. Don't force one-lesson-per-page. The opener SLO-map page is the SLO SOURCE, not a lesson.
2. **Taxonomy (fixed) per subject** — English-7 (pre_reading/phonics/reading_comprehension/vocabulary_grammar/writing/oral_communication/revision); Maths CPA (concrete/pictorial/pictorial_abstract/word_problem/revision, concrete hard-start per concept); Urdu-7 (alfaaz_maani/buland_khwani/arkaan_saazi/qawaid/tafheem/takhleeqi_likhai/duhrai — NO standalone oral); Science 5E (engage_hook→investigate_handson→concept_build per topic, then apply_connect, review_assess). `cpa_phase` for Maths only.
3. **Every chapter ends with a revision (segment_index 990, skill_type=revision) + an assessment worksheet (segment_index 995, skill_type=assessment, student-facing).** Use the book's own Mastery-Challenge / review pages for 990 where present.
4. **SLO codes** `{E|M|U|S}-{grade:02d}-{strand}-{NN}`; **read the opener's SLO roadmap (Explorer's Pathway / آغازِ سفر) verbatim** as the SLO source. **FLAG any SLO listed in the opener that has no dedicated pages** (textbook coverage gap) — give it a teacher-led home + a note; NEVER fabricate page-grounding.
5. **Ground everything in page-truth** — pages_printed must be real; slo_descriptions verbatim from the opener; solve nothing here (that's enrichment) but reference the page-truth's solved exercises.
6. **Chapter numbering/titles**: key chapters by the page-truth `chapter` field + the opener banner (some TOCs are stale — e.g. g4_english TOC titles ≠ real titles; g1_english Ch11/Ch12 boundaries were corrected in `_toc.json`). Use the opener banner as truth.

## Output
Write `02_segmentation/<stem>_full_segments.json`:
```json
{"_meta":{"book_stem":"...","subject":"...","grade":N,"chapters_covered":[1..N],"taxonomy":"...","divided_by":"division-agent","divided_at":"2026-08-01","slo_gaps":["S-05-..-06 no pages"]},
 "segments":[ ... one object per lesson, EXACTLY the sample's shape, ordered by chapter then teaching-day ... ]}
```
Keep `segment_index` restarting per chapter is NOT needed — use a per-chapter local index 1..k for content, 990 revision, 995 assessment, and set `chapter_number` on every row (the sheet builder derives the sequential Day# per grade). Order the array by chapter, then by teaching order within the chapter.

## Report
Per chapter: #lessons (content + 990 + 995), pages covered, any SLO gap flagged. Then the book total.
