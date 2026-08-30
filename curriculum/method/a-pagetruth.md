# Stage A — Page-truth capture

> Read IN FULL before capturing a single page. Gates G0/G1/G2/G2b live here.

## Contents

- Stage A — Page-truth capture (the validated procedure)
- The Stage-A/B failure catalogue (each must not recur)

---

## Stage A — Page-truth capture (the validated procedure)

1. **Offset first, per book — but treat it as a HYPOTHESIS that can shift mid-book, not a constant.**
   Printed (effective) page number ≠ PDF page index (front matter precedes printed p.1). Find where
   printed "1" sits, record `offset = pdf_index − printed`. **The offset is NOT guaranteed uniform
   across the book** — re-verify the footer on EVERY page. Real cases: a book with **printed page 19
   simply absent from the PDF** (offset jumped 7→6 at pdf 26); a book with a duplicate page; a book
   whose **printed pages 130–137 are duplicated** by a mis-numbered final signature (offset +3 → +13
   at pdf 143). **The rule that saves you: the PRINTED FOOTER is authoritative over the computed
   offset.** When a footer ≠ `pdf_index − offset`, the agent (a) names the file by the FOOTER, (b)
   flags it, and the orchestrator (c) **recomputes all not-yet-dispatched downstream slices** and (d)
   re-checks for filename collisions at the seam. Record the shift in `_book.json` as
   `offset_shift{shifts_at_pdf_page, offset_before, offset_after, rule, cause}`, and make a missing
   printed page a stub (`pg_019.json`, `pdf_page_index:null`) — it is a **real source gap to flag**,
   not an ingest error. Key completeness by **pdf_page_index**; name a second occurrence of a
   duplicated printed number `pg_<printed>_pdf<idx>.json`.
   - **⚠️ Low-DPI montage recon is UNRELIABLE.** A 45-DPI 3×3 montage read +3 where the footer said
     +4 — the book had a **blank cover page** the montage glossed. Confirm EVERY book's offset by
     reading the actual printed footer at ≥130 DPI (crop the footer band). Trust the page-truth
     agent's footer read over the lead's montage.
   - **⚠️ A disputed script digit is resolved by A/B comparison to a KNOWN instance, never by eye.**
     Nastaliq ۳/۴, ۷/۸ and ۶ all confuse — three independent reads split 2:1 even at 400 DPI. Build a
     stacked `known-footer / disputed-footer` image from the same font and read them together. The
     lead is **not** infallible here: a lead misread of ۳ as ۴ led to a "reconciliation" that
     corrupted a correctly-captured tail, caught only because (a) a backup existed and (b) the
     recapture agent obeyed the STOP-and-flag rule and refused the bad mapping. **Back up before any
     relabel/rename/delete pass.**
2. **Storage:** file-per-page (resumable, swarm-safe):
   `01_page_truth/<book_stem>/{_book.json, _toc.json, pg_<printed:03d>.json}` + `MANIFEST.jsonl`.
   TOC in `_toc.json`, never scattered. One page = one file, **written immediately** — a stall then
   costs only the unwritten pages.
3. **Per-page JSON:** `book_stem, subject, grade, medium, language, pdf_page_index,
   printed_page_number, page_type(cover|imprint|toc|chapter_opener|content|exercise|review|glossary|blank),
   chapter{number,title}, headings[], text_verbatim` (ALL printed text, page's own language, exact),
   `exercises[]{label, instruction_verbatim, items[], answer_key (SOLVED or null), answer_confidence},
   illustrations[]{description, objects[], pedagogical_role, text_in_image, counts?, equation?},
   tables[]{caption,rows}, visual_layout_notes, confidence, flags[], described_by, described_at`.
   Count-bearing illustrations add proof inline: `count_method:"300dpi-crop-double-count"`,
   `count_verified{<obj>:N, count_pass_1, count_pass_2, agreement}`.
   `_book.json` carries `offset` + `offset_evidence` (literal: "pdf 8 footer '1' → offset 7") +
   `content_span{printed_first/last, pdf_first/last, missing_printed_pages[]}` + a `characters[]`
   registry (the recurring cast, for Stage-D consistency locks) + `named_sections_note`.
   > **⛔ CAPTURE STRUCTURE, IN READING ORDER — the page is an ORDERED `blocks[]` list, not a bag of
   > fields.** The words being right is not enough; the *shape* must survive. Store the page
   > as an ordered `blocks[]` array walked top-to-bottom, each block tagged with its own `lang`.
   > Block shapes: `heading · prose · list{title,items[]} · columns{title,left[],right[]}` (a
   > two-column set on the page is TWO columns, never one flattened blob) · `table{caption,columns,rows}`
   > **rendered IN PLACE where it sits between the surrounding text, never grouped into a tail bucket**
   > · `illustration{...}` in place · `worked{prompt,method,grid,steps[],answer}` for a solved example
   > (see the maths rule below) · `dua{ar,ref,translation,note}` and `names{pairs:[[ar,ur],…]}` for
   > Arabic-with-Urdu-gloss (see the script rule below). `text_verbatim`/`exercises[]`/`tables[]` stay
   > as flat convenience mirrors, but the `blocks[]` order is the source of truth.
   > **Maths / worked solutions: capture the WORKING as DRAWN, step by step.** A worked
   > example is not prompt+answer — reproduce the on-page layout of the method (e.g. the long-division
   > square-root grid, the borrow/carry columns) in a monospace `grid`, list the `steps[]`, and keep
   > the book's exact intermediate chain **verbatim** (`4(length of a side of a square)=4(248)=992cm`,
   > never collapsed to `4×248`).

4. **Faithfulness rules (zero tolerance):** transcribe verbatim; **describe EVERY illustration
   (pictures ARE content)**; printed page no. from the footer you see; number + **solve** every
   exercise, never fabricate; flag illegible as low-confidence; **preserve the page's STRUCTURE in
   reading order** (columns as columns, lists as lists, tables/illustrations in place — the change log).
   **SCRIPT ≠ LANGUAGE — Arabic is not Urdu:** on a mixed Arabic+Urdu page (Islamiat /
   Qur'an / hadith / اسمائے حسنیٰ), tag each segment by its ACTUAL language — Arabic `ar` (Arabic
   code points, rendered in an Arabic **Naskh** face), Urdu `ur` (Nastaliq) — and keep the Arabic
   *source* and its Urdu *translation* in SEPARATE fields. A whole-page `ur` tag mis-shapes the
   letters that differ across the scripts (heh ه vs ہ, kaf ك vs ک, yeh ي vs ی). Any such page is
   `needs_human_review` (G5c) so a native reader verifies every diacritic.
5. **⚠️ COUNTS MUST BE HIGH-DPI VERIFIED (load-bearing).** The default page render systematically
   MISCOUNTS objects (pilot: agent 6/6, truth 8/9). For any quantity-bearing page: render ≥300 DPI
   via `render_page.sh`, **crop each cell**, count in isolation, **count twice**, agree-or-flag. A
   wrong count poisons the answer key. Corollaries proven across 4 full books (~618pp):
   - **Count by *reading* the crop, never pixel/colour-detection scripts** (cost a 44-minute agent).
   - **A disputed count escalates to a fresh recount, never a majority vote** (carrots voted 5, truth
     6 — overlap scenes defeat voting).
   - **Printed labels / number-sentences are the authoritative answer key** — defer to them,
     cross-check pictures.
   - **Tall bead/stick pegs (8–9 high) get clipped by default row-crops** → taller crops. **Cluttered
     "count each type" fields** stay medium-confidence — flag, don't fabricate.
   - **Checking arithmetic with Python is fine** (verify sums); that's not the banned pixel-*counting*.
6. **⚠️ IMAGE-SIZE / SWARM SIZING.** Never Read an image >2000px or an agent dies on the many-image
   limit (a 13-page count-heavy agent died at ~page 25). Read the ≤1800px `_overview.png` for
   text/layout, resize crops ≤1800px, **cap count-heavy agents to ≤6 pages** (10–12 for prose).
   Never bulk-Read many PDF pages at once (32MB request limit — render one page at a time).
   `render_page.sh` emits the overview automatically.
7. **Cheaper cadence without quality loss:** the 300-DPI crop-and-count loop runs ONLY on
   quantity-bearing pages; prose/illustration pages get full page-truth but skip the loop.

### The Stage-A/B failure catalogue (each must not recur)
- [ ] **Structure flattened to a blob** — a two-column set captured as one column, a lettered
      question list captured as prose. Columns stay columns, lists stay lists.
- [ ] **Tables/illustrations grouped at the end** instead of IN PLACE — the reader can't tell where
      the Friends/Family box or the Facts/Interpretations chart actually sits. Walk `blocks[]` in
      reading order.
- [ ] **Maths working collapsed** — only prompt+answer kept, the division/borrow grid dropped, the
      book's `4(length of a side)=4(248)=992cm` normalized to `4×248`. Capture the method as drawn.
- [ ] **Arabic set in Urdu Nastaliq** — a du‘a or Name mis-shaped (heh/kaf/yeh). Tag Arabic `ar`,
      render Naskh, keep it separate from the Urdu translation.
- [ ] **Offset ±1** — verify the printed footer per segment; record which page numbers were checked.
- [ ] **Segment 1 points at the Learning-Outcomes page** (no content) — audit chapter starts.
- [ ] **Tail gaps + inter-unit Review sections uncovered** — ToC page ranges must cover the WHOLE
      PDF; verify the last chapter's `page_end` against the PDF, not the ToC; Reviews get segments.
- [ ] **Reading-only chapters blanket-skipped** — in an earlier run 96% of the skips were wrong. >40%
      skip = red flag. They still support fluency + comprehension. Only truly skip pure-picture
      story / quotes / glossary.
- [ ] **Boilerplate swallowed** — exclude the national anthem, board notices, glossary from segments.
- [ ] **Page-overlap between different-skill segments** — segment by textbook SECTION header, not
      page range; sub-page where one page holds two skills.
- [ ] **CPA phase-skip** — match `cpa_phase` to what the PAGE shows; inject a synthetic concrete
      warm-up where the book skips it on a concrete-friendly topic.
- [ ] **Revision refs only 3 sources** — must reference ALL non-revision segments of the chapter;
      enrich revision LAST.
- [ ] **Comprehension has no passage cross-ref** — every comprehension segment carries
      `cross_refs:"Passage on pp X-Y"`.
- [ ] **DB/label metadata trusted** — topic labels + page ranges are HINTS; verify against the page,
      flag the mismatch, don't self-correct the source.
- [ ] **Counting-question integrity** — "if I delete the image, can the answer still be derived from
      the prose stem? if yes → rewrite."
