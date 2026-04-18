# Pipeline — Textbook → Lesson Plan → Voicenote

**Status**: SCAFFOLD — Day 0 of Sindh MVP (see [planning doc](../../.)). Not yet wired to real Supabase. Iterating in feat branch.

Turns a provincial textbook (PDF on disk or URL) into a reviewed, eval-gated, designed lesson plan PDF + voicenote per chapter segment. All stages AI-only (no human-review layer). Provincial config by YAML.

First target: **Sindh (Pakistan, G1–G5)**. See [config/sindh-g1-g5.yaml](./config/sindh-g1-g5.yaml).

---

## Stages (DAG)

```
  01_acquisition        PDFs onto disk (scraper per-province, or local seed)
         ↓
  02_ingestion          Gemini 2.5 Flash VLM: text + image descriptions per page
         ↓   (Qari-v0.2 fallback on low-confidence Urdu)
  03_toc_extract        Gemini 2.5 Flash: chapters + page ranges
         ↓
  04_slo_mapping        Claude Sonnet 4.6: SLO codes aligned to NCP 2023
         ↓
  05_chunking           Claude Haiku 4.5: segment chapters into LP-sized units
         ↓
  06_enrichment         Claude Sonnet 4.6: write 23-field enriched content in Urdu
         ↓   (Opus 4.7 escalation when confidence <0.85)
  07_ped_eval           3-judge panel: Haiku + Gemini Flash + Sonnet
         ↓   (regen with specific guidance on fail)
  08_slide_gen          Kie.AI NBPro (nano-banana-pro): 6–10 slides per segment
         ↓
  09_visual_eval        Gemini 2.5 Flash + Qwen3-VL 12-criteria rubric
         ↓
  10_voice_script       Claude Haiku 4.5: 2–3 min Urdu voice script
         ↓   (BLOCKED on Rawalpindi 5B voice UX closure)
  11_voice_tts          ElevenLabs v3 Urdu + Soniox Urdu for eval
         ↓
  12_publish            Upload to R2 + populate lesson_plans / textbook_segments
```

Every worker is idempotent. Rerun any stage without rerunning upstream.

---

## Layout

```
pipeline/
  README.md                        # this file
  workers/
    _base.worker.js                # common job contract
    01_acquisition.worker.js       # (stub) per-province board-website scraping
    02_ingestion.worker.js         # Gemini 2.5 Flash OCR/VLM  ← REAL CODE
    03_toc_extract.worker.js       # (stub)
    04_slo_mapping.worker.js       # (stub)
    05_chunking.worker.js          # (stub)
    06_enrichment.worker.js        # (stub)
    07_ped_eval.worker.js          # (stub)
    08_slide_gen.worker.js         # (stub) Kie.AI NBPro
    09_visual_eval.worker.js       # (stub)
    10_voice_script.worker.js      # (stub, blocked)
    11_voice_tts.worker.js         # (stub, blocked)
    12_publish.worker.js           # (stub)
  models/
    router.js                      # (stub) capability → model selector
    providers/                     # thin clients for each AI vendor
  providers/boards/
    _base.provider.js              # (stub) common BoardProvider interface
    stbb.provider.js               # (stub) Sindh Textbook Board
  evals/
    rubrics/                       # YAML-defined per-stage rubrics
    runners/                       # 3-judge panel, Prometheus regression
  schemas/
    ocr_page.json                  # Gemini Flash OCR output schema (REAL, validated)
  config/
    sindh-g1-g5.yaml               # provincial config
  sql/
    001_textbooks.sql
    002_textbook_pages.sql
    003_textbook_toc.sql
    004_lp_segments.sql
    005_pipeline_runs.sql
  cli/
    pipeline.js                    # `node pipeline/cli/pipeline.js run --stage ingestion --province sindh`
  prompts/                         # system prompts per stage
```

---

## Day-0 scope

What's wired:
- [x] Gemini 2.5 Flash OCR: test script validated on real Sindh pages (see [../06_OCR_EYEBALL.md](../../.))
- [x] Kie.AI NBPro slide generation: validated against v7 baseline (see [../slide_ab/REVIEW.md](../../.))
- [x] Schemas for OCR output
- [x] Provincial config for Sindh

What's stubbed:
- [ ] Other workers (return deterministic fixture data; pass-through)
- [ ] Router (returns hard-coded model IDs)
- [ ] Board providers (Sindh provider reads from local disk path)
- [ ] Eval runners

Rationale: ship the shape first, fill in the bodies per-worker over Phase 0–1. Each stage replaces its stub with real code when we're ready to run it.

---

## Running (Day 0)

```bash
# install deps
cd pipeline && npm install

# required env (in rumi-platform/.env at root)
KIE_API_KEY=...              # existing
GEMINI_API_KEY=...           # existing
OPENROUTER_API_KEY=...       # existing (fallback)
ANTHROPIC_API_KEY=...        # for Sonnet/Haiku/Opus
ELEVENLABS_API_KEY=...       # for voice (blocked for now)
SONIOX_API_KEY=...           # for voice eval (blocked)
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...

# one-time: apply SQL migrations
node pipeline/cli/pipeline.js migrate

# register Sindh textbooks from a local directory
node pipeline/cli/pipeline.js register-books \
  --config pipeline/config/sindh-g1-g5.yaml \
  --source /path/to/sindh-pdfs/

# run a stage
node pipeline/cli/pipeline.js run --stage ingestion --province sindh --parallel 3

# run end-to-end on one book
node pipeline/cli/pipeline.js run-all --province sindh --book sindh_maths_1
```

---

## Design principles

1. **Every stage has a rubric-based AI eval gate.** No stage advances on silent failure.
2. **No human-review layer.** 3-judge panel majority vote; teacher canary after deploy.
3. **Provincial config is YAML.** Adding a new province = writing one YAML + one `stbb.provider.js` equivalent.
4. **Idempotent stages.** Each worker can be rerun without damage. `pipeline_runs` tracks state.
5. **Single API key per vendor.** Kie.AI hosts NBPro + alternatives through one key. One Gemini key. Minimal surface area for operators.
6. **Open-source-ready from day 1.** No Taleemabad-specific strings. No customer data. No production keys in code.

---

## See also

- [Planning docs (internal)](../../) — PLAN.md, 01_PIPELINE_ARCHITECTURE.md, 02_MODEL_STACK.md, 03_EVAL_FRAMEWORK.md, 04_INGESTION.md, 06_OCR_EYEBALL.md, 07_TAXONOMY_EVOLVED.md, 08_OCR_TEST_RESULTS.md, 09_PHASE_0_RUNBOOK.md
