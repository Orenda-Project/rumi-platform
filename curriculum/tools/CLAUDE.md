# tools — SLO registry, segmentation validator and folder-contract scaffold, with tests

<!-- kg:meta repo=rumi-platform dir=curriculum/tools kg=3ce1fadf7c89 gen=4fa388228c01 overflow=0 rendered=2026-10-29 kg.py=1.1.0 -->

## Entry points
- `slo_registry.py` — canonical SLO code pattern and drift validator
- `curriculum_scaffold.py` — create or check the A-F layout
<!-- read: map-read-platform-portals 2026-10-29 -->

## Children (generated)
| path | purpose |
|---|---|
| `slo_registry.py` | Canonical SLO-code pattern and deterministic drift validator (fused annotation, grade mismatch) |
| `curriculum_scaffold.py` | Creates or checks a curriculum project against the A-F folder contract and lesson_id grammar |
| `segment_validate.py` | SLO validation gate between Stage B and C: quarantines grade mismatches, flags fused codes, writes a sidecar |
| `test_curriculum_scaffold.py` | Pins the scaffold's folder contract, lesson_id grammar and 03_enrichment stage validation |
| `test_segment_validate.py` | Pins segment_validate: never blocks, mismatches go to quarantine, fused codes auto-fixable, clean=clean |
| `test_slo_registry.py` | Pins slo_registry: canonical code shape, fused-annotation and grade-mismatch drift detection |

## Who reads this (generated)
- `slo_registry.py` ← imported by `curriculum/tools/segment_validate.py:26:af61502e` · `curriculum/tools/test_slo_registry.py:12:ba3b15b3`
- `curriculum_scaffold.py` ← imported by `curriculum/tools/test_curriculum_scaffold.py:11:72e8b218`
- `segment_validate.py` ← imported by `curriculum/tools/test_segment_validate.py:14:52ee54c5`

## Never (human)
- Never make segment_validate block the pipeline; it flags and writes a sidecar only (segment_validate.py:9)
<!-- read: map-read-platform-portals 2026-10-29 -->

## Tests (generated)
- `curriculum/tools/test_curriculum_scaffold.py` (curriculum_scaffold.py)
- `curriculum/tools/test_segment_validate.py` (segment_validate.py)
- `curriculum/tools/test_slo_registry.py` (slo_registry.py)

## Related (generated)
- skills: `curriculum-baked-lesson-plans`?
- docs: `curriculum/CLAUDE.md`? · `curriculum/README.md`? · `curriculum/graph/README.md`?
