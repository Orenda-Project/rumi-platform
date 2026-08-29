# Sample corpus — attribution & licensing

This directory contains **one chapter** of a real primary-school textbook, included as the
runnable worked example for the curriculum build pipeline:

> **Grade 2 Mathematics — Chapter 1, "Numberland Adventures: Up to 999"**
> Publisher: **Taleemabad**. Used here, with permission, as the disclosed reference sample.

## What's textbook content vs. what the pipeline produced

- `grade_2_math_ch1/input/grade_2_math_chapter1.pdf` — the **source textbook pages** (Chapter 1).
  © Taleemabad. Redistributed here **for demonstration**, with the publisher's permission, so the
  pipeline can be run end-to-end on real material.
- `grade_2_math_ch1/expected/` — the **outputs the pipeline generates** from those pages
  (page-truth JSON, the segmentation, and two fully-enriched lesson bodies). These are produced by
  the method in this package and are provided so you can see what a good result looks like.

## Licensing

- The **pipeline code and method** in `curriculum/` are licensed under the repository's licence
  (Apache 2.0).
- The **textbook content** in `sample/grade_2_math_ch1/input/` remains © Taleemabad and is included
  under permission for demonstration only — it is **not** covered by the Apache licence and should
  not be redistributed as your own. Bring your **own** textbooks to build your own corpus.

If you are the rights-holder of any material here and have a concern, please open an issue.
