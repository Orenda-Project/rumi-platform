---
name: curriculum-baked-lesson-plans
description: Turn your own official textbooks into a faithful, gate-checked lesson-plan corpus — agent-driven, plug-and-play. A 7-stage spine (page-truth → segment → enrich → slide-script → render → voicenote → deliver), each with an automatic gate. Use for "make lesson plans from these textbooks", "page-truth a PDF", "build a curriculum corpus", "segment a chapter into teaching days". Runs hands-off; brings its own SLO-code validation and clean-folder layout so nothing ships mislabelled.
---

# Curriculum-Baked Lesson Plans

> **Up:** [.claude/CLAUDE.md](../../CLAUDE.md) (config & skills router) · runnable tools live in [`curriculum/`](../../../curriculum/)

**What it does, in one line:** you point it at a folder of official textbook PDFs; it produces a
faithful, quality-gated lesson-plan corpus — organised in clean, predictable folders — with no
credentials but your own model key.

This is a **method you drive as an agent**, not a product to configure. The human says *"make lesson
plans from these textbooks"*; you (the agent) run the spine below, calling the tools in
[`curriculum/tools/`](../../../curriculum/tools/) for the deterministic parts.

## The spine — 7 stages, A → F

| Stage | In | Out | Uses |
|-------|----|----|------|
| **A · page-truth** | textbook PDF | one JSON per printed page (counts, page numbers, illustrations, worked exercises — all preserved) | **vision, not OCR** — you read each page as an *image* (the `Read` tool renders it). No external API. |
| **B · segment** | page-truth + ToC | teaching-day *lessons*, each with topic, skill-type, Bloom, page span, SLO codes | your own reasoning |
| **B-gate · validate** | the segmentation | drift flagged, never shipped silently | `curriculum/tools/segment_validate.py` (§ Gates) |
| **C · enrich** | a lesson + its page-truth | the executable lesson body — every exercise solved, in the target language | your own reasoning / any model |
| **D0 · slide-script** | the lesson body | an authored teacher-facing script | your own reasoning |
| **D · render** | the script | rendered lesson-plan pages (PDF/images) | an image model — **your key** (optional) |
| **E · voicenote** | the lesson | one audio per lesson | a TTS model — **your key** (optional) |
| **F · deliver** | the corpus | served to teachers | the bot in this repo (optional) |

**A–C need nothing but your own model access.** D–F are optional and only they use paid image/TTS APIs
(your own keys, presence-gated the same way as the rest of this repo).

## Two non-negotiables this method bakes in

1. **SLO codes are a registry, not free text.** Every learning-outcome code must match
   `<SUBJ>-<GG>-<STRAND>-<NN>` and its grade digits `GG` must equal the book's grade. Drift
   (a note fused into the code, or a code carrying the wrong grade) is caught by the **B-gate**
   below and shipped *labelled*, never silently. See [`curriculum/tools/slo_registry.py`](../../../curriculum/tools/slo_registry.py).
2. **Lessons live in clean, predictable folders.** One layout, one manifest — so the run is
   navigable and resumable. Enforced by [`curriculum/tools/curriculum_scaffold.py`](../../../curriculum/tools/curriculum_scaffold.py).

## The corpus is a knowledge graph

Because every lesson carries validated SLO codes, the segmented corpus **is** a knowledge graph.
[`curriculum/graph/`](../../../curriculum/graph/) builds it: lessons linked to the outcomes they
teach, and the outcomes ordered into a per-strand DAG (`PRECEDES_SLO`) so you can see how they
progress and trace any SLO back to its prerequisites — plus a self-contained HTML viewer (no CDN, no
database) and an optional, literature-grounded semantic layer for cross-grade prerequisite inference
(credential-free embeddings; see [`curriculum/research/education_kg_methods.md`](../../../curriculum/research/education_kg_methods.md)).

```bash
python3 curriculum/cli.py graph <corpus>     # → graph.json/.graphml/.cypher + explorer.html
```

## Gates — automatic and HANDS-OFF

A gate here **never halts the run.** It runs, stamps its verdict onto the output, and moves on — so a
plug-and-play build produces every lesson it can and tells you exactly which passed clean. The two
shipped, runnable gates:

```bash
# B-gate — SLO-code validation (run after segmentation, before enrichment)
python3 curriculum/tools/segment_validate.py <corpus>/02_segmentation
#   → writes <corpus>/02_segmentation/slo_validation.json
#   → quarantine[] = grade-mismatch codes (a human must re-code; downstream treats them as suspect)
#   → auto_fixable[] = fused-annotation codes (bare code recoverable)

# layout gate — clean folders (run before + after each stage)
python3 curriculum/tools/curriculum_scaffold.py <corpus>          # create the skeleton
python3 curriculum/tools/curriculum_scaffold.py <corpus> --check  # validate the contract
```

## The folder contract

```
<corpus>/
  curriculum.json                              manifest (name, universe, stage overrides)
  01_page_truth/<book>/pg_###.json             A   one file per PRINTED page
  02_segmentation/<book>_full_segments.json    B   lesson stubs
  02_segmentation/slo_validation.json          B-gate verdict
  03_enrichment/<book>/<lesson_id>.json        C   executable lesson bodies
  04_lesson_plans/<lesson_id>/…                D   rendered pages + gate reports
  05_voicenotes/<lesson_id>.mp3                E   audio (one per lesson)
  _ledger.jsonl                                every completed unit stamps one line
```
`<book>` is `grade_<n>_<subject>`; `<lesson_id>` is `grade_<n>_<subject>_ch<n>_seg<n>`. Both
`03_enrichment/` and `04_lesson_plans/` are validated against this grammar — a misnamed lesson body
is flagged, so lessons never sprawl.

## Deep reference (the method, the failure catalogue)

The stage-by-stage playbook, the render laws (including *SLO codes are a registry* and *brand-neutral
naming in all content*), the swarm briefs you can fork, and the public pedagogy behind the enrichment
elements live under [`curriculum/method/`](../../../curriculum/method/),
[`curriculum/briefs/`](../../../curriculum/briefs/) and [`curriculum/research/`](../../../curriculum/research/).
The runnable sample corpus (one chapter, end to end) is in [`curriculum/sample/`](../../../curriculum/sample/).

## Rules (this repo's, and this method's)

- **No credentials in code.** Model keys come from the environment, presence-gated. Never hardcode.
- **Generic, not deployment-specific.** The method is the product; a market is config. A rule phrased
  regionally is a bug — phrase it generically ("read the subject per book").
- **Brand-neutral naming in all content.** The authoring house is not the deployment brand — no brand
  as a story place, character, school, or sign. It leaks through illustration text, so the audit reads
  the rendered page, not just the script.
