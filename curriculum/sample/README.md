# Sample — clone and run

One real textbook chapter, end to end. See [NOTICE.md](NOTICE.md) for attribution and licensing.

```
grade_2_math_ch1/
  input/grade_2_math_chapter1.pdf          the source textbook pages (Grade 2 Maths, Chapter 1)
  expected/                                 what the pipeline produces from them
    01_page_truth/grade_2_math/pg_###.json    A — one file per printed page (vision, not OCR)
    02_segmentation/…_full_segments.json      B — 12 teaching-day lessons
    03_enrichment/grade_2_math/…_seg1,2.json  C — two fully-enriched lesson bodies
```

## See what "good" looks like

The `expected/` tree is a valid curriculum project. Validate it against the gates:

```bash
python3 ../cli.py check grade_2_math_ch1/expected      # folder contract + SLO-code gate
python3 ../cli.py status grade_2_math_ch1/expected     # stage-by-stage progress
```

The SLO gate reports **clean** — Grade 2 Maths is fully, correctly coded (`M-02-NS-01`, `M-02-NS-03`, …).

## Run it yourself

Point the agent (or the pipeline) at the input PDF and compare against `expected/`:

> *"Build lesson plans from `grade_2_math_ch1/input/grade_2_math_chapter1.pdf`."*

Stages A–C need only your own model key (via the environment). What you get back should match the
shape of `expected/` — page-truth, then 12 segmented lessons, then enriched lesson bodies, each
stamped with its gate verdict. Then bring your **own** textbooks and do the same at scale.
