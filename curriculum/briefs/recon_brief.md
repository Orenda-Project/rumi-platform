# RECON brief — offset + TOC per book (Stage-A step 0). NO page-truth here.

You do ONLY the recon for ONE book: find the printed-page offset and transcribe the Table of Contents. Vision via the `Read` tool + the render script. Write two small JSON files. Cheap and fast.

## Corpus root (absolute)
`<path-to-your-corpus> 2026/Rumi 10 April 2026/06_Logs & Misc/Reports/Active/Simulation Week - July 2026/ICT/Curriculum Ingestion`

Source PDFs are in `00_source_pdfs/`. Your `book_stem` = the PDF filename WITHOUT `.pdf` (the dispatcher tells you which). Output dir: `01_page_truth/<book_stem>/` (create it).

## Steps
1. **Render the front matter** (pdf pages 1–8) at low DPI and Read the overviews:
   `bash "<root>/scripts/render_page.sh" "<root>/00_source_pdfs/<book_stem>.pdf" <pdf_index> 150 /tmp/recon_<book_stem>`
   Read each `_overview.png`. Identify: cover, title/imprint, digital-resources, and the **Table of Contents** page(s).
2. **Find printed page "1"** — render a few candidate pages until you see the printed footer "1" on a content page. `offset = pdf_index − printed_page`. **Verify on 2–3 pages** (footer authoritative). Expected starting hypotheses (VERIFY, don't assume): English/Science **+3**, Urdu **+4** (often two TOC pages), Maths **+4** (blank cover). The offset is a HYPOTHESIS that can shift mid-book — note that downstream must re-verify per page.
3. **Transcribe the printed TOC** verbatim: every chapter/unit — its number, title, and printed start page. Compute `pdf_start = printed_start + offset` for each.
4. **Write two files** in `01_page_truth/<book_stem>/`:
   - `_book.json`: `{book_stem, title, publisher:"the source curriculum", subject, grade, medium, language, total_pdf_pages, offset, offset_evidence (which footers you read), front_matter_pages[], content_span{printed_first, pdf_first, printed_last_est}, offset_shift:null}`. Match the shape of `01_page_truth/grade_1_maths/_book.json`.
   - `_toc.json`: `{book_stem, offset, offset_note, chapters:[{number, title, printed_start, pdf_start, verified:"footer-confirmed"|"derived"}]}`. Match `01_page_truth/grade_1_maths/_toc.json`.

## Rules
- **Footer is authoritative** over any computed offset — read it, don't assume.
- Transcribe chapter titles verbatim (the book's own language; Urdu in Nastaliq).
- Do NOT page-truth content pages — recon only. If the TOC spans 2 pages, capture both.
- **Report back**: the offset (+ the exact footers you verified it on), the number of chapters, the printed page span, and any anomaly (blank cover, duplicate/missing page, 2-page TOC, mid-book shift risk).
