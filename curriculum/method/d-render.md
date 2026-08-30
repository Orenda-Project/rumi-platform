# Stage D — LP render

> Read before rendering. Gates G7/G8/G8b.

## Contents

- Stage D — LP generation
- Stage D quality gate (mandatory — codified after a render-quality regression)

---

## Stage D — LP generation

Feed each **slide script** into the region's **official LP format** with **gradual-release internals**
(Warm-up/Opening → I-Do → We-Do → You-Do → Wrap-up). **Get the real template from the partner — don't
trust web research for the stage names.** Tanzania's actual govt CBC template has a setup block
(Umahiri Mkuu/Mahususi, Shughuli Kuu/Mahususi, pupil counts, Zana, Rejea) + a 5-column lesson-process
table (Hatua · Muda · Shughuli za Ufundishaji · Shughuli za Ujifunzaji · Vigezo vya Upimaji) with **4
steps: Utangulizi → Kuendeleza Ujenzi wa Umahiri → Kubuni → Tathmini**. Render that container, filled
to the partner's depth bar (Knows/Shows objectives auditable against the assessment column, embedded
differentiation, multi-modal assessment, named local *mbinu*, reflection, timings summing to the exact
period length). Image gen via `kie-ai-imagegen` — **add the target
language's routing** (English→GPT-Image-2; Urdu/Arabic RTL→NB Pro; add the new language). Design for
the classroom reality (no per-pupil materials at a 1:5 textbook ratio; a TaRL-style level-check note).

### Stage D quality gate (mandatory — codified after a render-quality regression)

Skipping it is what shipped 13/19 LPs with visible token leaks and 2/19 with structural misrenders on
one review batch. Three parts:

- **(a) Pre-render: `check_token_leaks.py --prompt <prompt.txt>`** — regex scan of the prompt before
  submitting. Catches the 5 bug classes in
  reference/known_token_leaks.md: (A) structural-misrender risk,
  (B) `<N>` angle-bracket placeholders, (C) hex codes leaked into the body, (D) uppercase English
  scaffolding directives (`FULL-WIDTH`, `VISUAL HOOK BLOCK`, `MANDATORY:`), (E) markdown `**bold**`.
  Exits non-zero on any hit.
- **(b) Post-render: `eval_lp_pageN.py <render.png>`** — vision rubric per page against the design
  contract, including structural completeness and "no token leaks visible".
- **(c) Orchestrator: `eval_lp_all_pages.py`** — runs both halves on all pages, returns one pass/fail
  per lesson plus the explicit list of pages to re-render. The batch renderer MUST call it between
  render and PDF-compose; on fail, re-render only the failing pages before composing.

> Tighten the prompt to eliminate leak sources at the root — the eval gate is the safety net, not the
> primary fix.

**Single-page re-render recipe:** move that page's `.raw.png` aside and re-run WITHOUT `--refresh`
(the generator caches by raw existence); use `--no-qa` for strictly-surgical work, because QA
re-inspects cached pages and may re-roll a passing one.
