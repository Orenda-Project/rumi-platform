# PAGE-TRUTH brief (general, full-corpus) — Stage A only

You do **Stage-A page-truth ONLY** (NOT division) for a slice of ONE book. Vision via the `Read` tool only — NO external APIs. Write **each page's JSON immediately** (resumable, swarm-safe) — never batch to the end.

## Corpus root (absolute)
`<path-to-your-corpus> 2026/Rumi 10 April 2026/06_Logs & Misc/Reports/Active/Simulation Week - July 2026/ICT/Curriculum Ingestion`

The dispatcher gives you: `book_stem`, the **printed page range**, and the book's **offset**. Source PDF = `00_source_pdfs/<book_stem>.pdf`. Output dir = `01_page_truth/<book_stem>/`.

## FIRST: read your book's `_book.json` + `_toc.json` (in the output dir)
They carry the **footer-verified offset**, the **chapter map** (printed_start→pdf_start), and **per-book ANOMALY FLAGS you MUST honour**, e.g.:
- `grade_5_urdu`: MID-BOOK OFFSET SHIFT +3→+13 at pdf143 (printed 132-137 are DUPLICATED in the PDF). For Ch15-16 key on **pdf_index**, re-verify every footer.
- `grade_4_english`: TOC titles ≠ actual chapter opener titles — key chapters by **number + footer**, capture the real opener banner in `headings`.
- `grade_3_english`: stale running-headers label some Ch12 pages "Chapter 11" — trust footer + content flow, not the header.
- Nastaliq books: ۳/۴ digits look alike in thin footer fonts — verify page numbers at **300 DPI**, not the low-DPI overview.

## Steps
1. **Render each page**: `bash "<root>/scripts/render_page.sh" "<root>/00_source_pdfs/<book_stem>.pdf" <pdf_index> 300 /tmp/pt_<book_stem>` where `pdf_index = printed + offset`. Read the `_overview.png` for text/layout. For **Maths counting pages** (and any quantity-bearing page): crop each cell from the HI-RES png, **count in isolation, count TWICE, agree-or-flag** (default render miscounts — load-bearing). Printed number-sentences/labels are the authoritative answer key.
2. **Footer is authoritative** over the computed offset — read it on EVERY page. If footer ≠ (pdf − offset): name the file by the **FOOTER**, add a `flags` entry (`offset shift: footer=N expected=M`), and keep going. Make a genuinely missing printed page a stub (`pdf_page_index:null`).
3. **Write `pg_<printed:03d>.json`** per page immediately, matching the exemplar schema in `01_page_truth/grade_1_english/` (a text page) + `grade_1_maths/pg_012.json` (a counting page). Keys: `book_stem, subject, grade, medium, language, pdf_page_index, printed_page_number, page_type, chapter, headings, text_verbatim, exercises, illustrations, tables, visual_layout_notes, confidence, flags, described_by, described_at`.

## Faithfulness (zero tolerance)
- `text_verbatim` verbatim (page's own language; Urdu in Nastaliq; keep source typos, flag them).
- Describe **every illustration**; solve **every exercise** (compute the key yourself — Python OK for arithmetic; pixel-counting scripts are NOT — count by reading the crop).
- `headings` = the printed section header(s) the page sits under (open vocabulary — capture whatever is printed).
- Flag illegible/uncertain as low `confidence`; never fabricate. `described_by:"pagetruth-agent"`, `described_at:"2026-08-01"`.

## Done report
List the exact `pg_NNN.json` files written, any offset-shift/low-confidence flags, and the section headers seen. Do NOT divide.
