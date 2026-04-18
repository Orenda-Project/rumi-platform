# Add a New Province

How to extend the pipeline to a new province / state / country. Target: ~1 day to first-working-pipeline, ~3 days to teacher-canary-ready.

The pipeline is deliberately province-agnostic. Adding a province = writing one YAML + one BoardProvider class + running the 12 stages. No worker code changes.

---

## Checklist

1. **Pick a province + scope**
   - Country, province/state, board name, primary curriculum
   - Grades to cover (recommend G1–G5 for MVP)
   - Subjects (recommend the 3–4 core subjects for the board)
   - Medium of instruction + LP language (often different)

2. **Write `pipeline/config/<province>-<scope>.yaml`**
   - Copy `sindh-g1-g5.yaml` as a template
   - Update `province`, `country`, `curriculum`, `scope`
   - **Rendering rules** — CRITICAL. See next section.
   - **Taxonomy** — start from the Punjab taxonomy and adjust per-subject. Read one textbook cover-to-cover to catch language-specific skill types (e.g. Sindh adds `jumla_saazi` for Urdu; Tamil Nadu Tamil likely needs different categories; Sinhala even more).
   - **Model IDs** — default is fine for most provinces. Override only for language-specific fallbacks (e.g. Urdu needs Qari-v0.2; Tamil may need a different VLM).

3. **Write `pipeline/providers/boards/<board>.provider.js`**
   - Extends `BoardProvider`
   - `list({ grade, medium, subject })` → array of `{ id, title, grade, medium, subject, pdf_url, source_page, license_note }`
   - `fetch(entry)` → `{ pdf_bytes, checksum, fetched_at }`
   - `verify(entry, pdf_bytes)` → `{ valid, reason? }`
   - For MVP you can hard-code a local-file path and skip real scraping. The Sindh provider does exactly that.

4. **Rendering config — per-province non-negotiables**
   - `lp_language`: what language the LP body text is in. Can differ from textbook medium. (Sindh teaches English/Maths in English-medium but LP body is Urdu.)
   - `scientific_terms`: which language to keep scientific terms in (`english` is the usual answer even in Urdu-primary LPs).
   - `honorifics`: the exact variant for religious/cultural respect. Small but critical. Sindh uses `"صلی اللہ علیہ وآلہ وسلم"` (with واله); Punjab uses `"صلی اللہ علیہ وسلم"` (without). Both are right for their provinces; mixing them is disrespectful.
   - `numeral_system_by_subject`: Urdu subject typically uses Urdu numerals (۱۲۳); Maths and English typically use Arabic. Tamil-medium Maths may use Tamil numerals.
   - `script_direction`: `mixed` is almost always the right answer (even English-medium books have Urdu teacher-dialogue, per Q4 for Sindh).
   - `fonts`: specify the preferred script fonts. Noto Nastaliq Urdu for Urdu; system-sans for everything else.

5. **Run the pipeline**
   ```bash
   node pipeline/cli/pipeline.js migrate           # if you're using Supabase
   node pipeline/cli/pipeline.js register-books \
        --config pipeline/config/<province>-<scope>.yaml \
        --source /path/to/pdfs/
   node pipeline/cli/pipeline.js run --stage 02_ingestion --province <province> --book <book_id> --limit 10 --output pipeline/runs/<book>_smoke.jsonl
   ```
   Eyeball the smoke-test output. If it looks right, drop `--limit` and run the full book.

6. **Run downstream stages**
   ```bash
   node pipeline/cli/pipeline.js run --stage 03_toc_extract --province <province> --book <book_id> --output pipeline/runs/<book>_toc.jsonl
   node pipeline/cli/pipeline.js run --stage 04_slo_mapping --province <province> --book <book_id> --output pipeline/runs/<book>_slo.jsonl
   node pipeline/cli/pipeline.js run --stage 05_chunking    --province <province> --book <book_id> --output pipeline/runs/<book>_segments.jsonl
   node pipeline/cli/pipeline.js run --stage 06_enrichment  --province <province> --book <book_id> --segment-limit 2 --output pipeline/runs/<book>_enriched.jsonl
   ```
   Stop after `--segment-limit 2` and check enrichment quality by eye. If the Urdu / Tamil / Sinhala reads correctly and the cultural hook story lands, remove the limit.

7. **Run judges + slide gen**
   ```bash
   node pipeline/cli/pipeline.js run --stage 07_ped_eval --province <province> --book <book_id>
   node pipeline/cli/pipeline.js run --stage 08_slide_gen --province <province> --book <book_id> --segment-limit 2
   node pipeline/cli/pipeline.js run --stage 09_visual_eval --province <province> --book <book_id>
   ```

8. **Open slides with Finder + space-bar** (Quick Look gallery). Walk through every template: navigation, hook, i_do, we_do, you_do, close. Look for:
   - Gibberish in non-Latin text (a sign the underlying model mis-rendered the script)
   - Culturally-off cartoon characters (wrong attire, wrong classroom context)
   - Missing required elements per template (CPA badge on Maths i_do; partner speech bubbles on we_do)

9. **Teacher canary** (48 hours, 10 real teachers via your staging WhatsApp number). Automated survey after each LP:
   - "Did the LP match your textbook?" 1–5
   - "Was the teacher dialogue useful?" 1–5
   - Open field for confusion

10. **If canary passes → broader rollout. If >2 teachers flag same issue → pause + regen with specific guidance.**

---

## Province-specific gotchas learned so far

### Pakistan / Sindh
- **Honorific variant**: Sindh uses `صلی اللہ علیہ وآلہ وسلم` (with واله, "and his family"). Punjab uses without.
- **Maths is English-medium**: content stays English; only teacher dialogue / hook / closing is Urdu.
- **Urdu G1 has no 'textbook', it has a 'qaida' (primer)**: naming convention matters.
- **Gemini free-tier cap is 20 req/day** — route through OpenRouter from day 1.

### Pakistan / Punjab (reference from Rawalpindi pilot)
- Same taxonomy except Urdu is 7-type (no `jumla_saazi`); Sindh's 8-type taxonomy is a superset.
- `insert-urdu-toc.js` had +19/+15 script offsets that needed per-book fixing. Our pipeline ToC extractor doesn't share that problem because it re-extracts from OCR.

### India / Tamil Nadu
- Samacheer Kalvi textbooks are Tamil-script. **Qwen3-VL claims 32-language OCR but Tamil pedagogy taxonomy is under-documented publicly** — plan for an extra day of research.
- Numerals: Tamil-medium Maths may use Tamil numerals (௦௧௨௩ etc.); confirm from the book.

### Sri Lanka
- EduPub.gov.lk is well-organized but books have 3 mediums (Sinhala / Tamil / English) — your config needs `mediums: [sinhala, tamil, english]` and the pipeline should run separately for each.
- Honorifics / religious conventions differ (Buddhism-dominant in Sinhala books, Hindu/Christian/Islamic in others). Don't import Islamic honorific rules uncritically.

### Tanzania (Swahili)
- TIE may require a teacher login now. Verify access before committing. If gated, fall back to open-source Swahili textbook corpora.
- Latin script → the VLM OCR path is easier; Mistral OCR would work here too.

---

## Model stack fallbacks per script family

| Script | Primary VLM OCR | Fallback |
|--------|----------------|----------|
| Latin (English, Swahili) | Gemini 2.5 Flash (OpenRouter) | Mistral OCR ($2/1K) — faster, fine for Latin |
| Urdu/Sindhi Nastaliq | Gemini 2.5 Flash | Qari-v0.2 self-hosted (Qwen2-VL fine-tuned for Arabic-script) |
| Tamil | Gemini 2.5 Flash | Qwen3-VL (32-lang claim) |
| Sinhala | Gemini 2.5 Flash | Qwen3-VL |
| Devanagari (Hindi) | Gemini 2.5 Flash | Qwen3-VL |

Mistral OCR rejected for Arabic-script (verified: hallucinates Nastaliq in round 2 with annotations enabled).

---

## Budget reference (per 100-page, 35-segment book)

| Stage | Typical cost |
|-------|--------------|
| 02 Ingestion OCR | $0.40–0.60 |
| 03 ToC + 04 SLO + 05 Chunking | $0.05 |
| 06 Enrichment (Sonnet + ~100% Opus escalation) | $1.00–1.50 |
| 07 3-judge panel | $0.15 |
| 08 Slide gen (35 × 6 × $0.09) | $19 |
| 09 Visual eval | $0.10 |
| **Per book total** | **~$21** |

15-book province MVP: **~$315**. 5× cheaper than v1 estimate.

---

## When NOT to use this pipeline

- **Private / commercial textbooks with no redistribution rights** — the pipeline produces derivative LPs, not redistributed textbooks, but some publishers (Kenya's commercial model) are more aggressive than Pakistan's "free for educational use" boards. Get legal clearance.
- **Curricula that don't follow I-Do → We-Do → You-Do / GRR arc** — our enrichment schema encodes GRR. If a country's pedagogy is different (e.g. Finland's phenomenon-based learning), the enriched content won't fit local teacher expectations.
- **Books where >40% of content is images with no meaningful text** — the VLM will describe them but the teacher dialogue depends on having something to say. Picture books for pre-K are a stretch.

---

## Opening a PR

Once your province passes teacher canary:
```bash
git checkout -b feat/pipeline-<province>-mvp
git add pipeline/config/<province>-<scope>.yaml pipeline/providers/boards/<board>.provider.js
git commit -m "feat(pipeline): add <province> province config + provider"
git push -u origin feat/pipeline-<province>-mvp
gh pr create --draft --title "feat(pipeline): add <province>"
```

Do NOT commit: books/, pipeline/runs/, your provincial `.env` keys.
