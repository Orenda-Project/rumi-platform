# curriculum/ — textbooks in, lesson plans out

Turn a folder of official textbook PDFs into a faithful, quality-gated **lesson-plan corpus** —
agent-driven, plug-and-play, credential-free but for your own model key.

This is the **build half** of the platform's curriculum lesson plans. The bot already *serves*
lesson plans (`bot/shared/services/lesson-planning.service.js`, `pregen-lookup`, `toc-loading`);
this package is how you *make* them from your own books.

## How you use it (agent-first)

The primary interface is an agent. In this repo, tell your coding agent:

> *"Make lesson plans from the textbooks in `./my-books/`."*

It loads the [`curriculum-baked-lesson-plans` skill](../.claude/skills/curriculum-baked-lesson-plans/SKILL.md)
and runs the 7-stage spine — **page-truth → segment → enrich → slide-script → render → voicenote →
deliver** — calling the tools here for the deterministic parts. Gates run **hands-off**: the build
never stops; each lesson ships stamped with its gate verdict, so you see exactly what passed clean.

A thin CLI does the same for CI / non-agent use (see each tool's `--help`).

## What's here

```
curriculum/
  tools/        runnable, deterministic tools (SLO validation, folder contract) + their tests
  gates/        the quality-scoring gate (score a lesson body; no external service)
  graph/        the curriculum knowledge graph — lessons↔SLOs, SLO progression + a self-contained viewer
  method/       the stage-by-stage playbook + render laws + the failure catalogue
  briefs/       the swarm prompts you can fork
  research/     the public pedagogy + the education-KG methods behind the graph
  sample/       one chapter, end to end — clone and run
```

## The two guarantees it bakes in

1. **SLO codes are a registry, not free text** — `tools/slo_registry.py` + `tools/segment_validate.py`.
   Every learning-outcome code must match `<SUBJ>-<GG>-<STRAND>-<NN>` with `GG` == the book's grade;
   drift is flagged and quarantined, never shipped silently.
2. **Lessons live in clean, predictable folders** — `tools/curriculum_scaffold.py` creates and
   validates the one canonical layout, so a build is navigable and resumable.

## See the whole curriculum as a graph

Because every lesson carries validated SLO codes, the corpus **is** a knowledge graph. `graph/` turns
it into one — lessons linked to the outcomes they teach, and the outcomes ordered into a per-strand
DAG so you can see how they progress and trace any SLO back to its prerequisites. It ships a
self-contained viewer (no CDN, no database) and an optional literature-grounded semantic layer for
cross-grade prerequisite inference. See [`graph/README.md`](graph/README.md).

```bash
python3 curriculum/cli.py graph ./my-corpus      # -> graph.json/.graphml/.cypher + explorer.html
```

## Run it (thin CLI — the CI / non-agent front door)

```bash
python3 curriculum/cli.py init  ./my-corpus --name "My Curriculum"   # scaffold the A-F layout
python3 curriculum/cli.py check ./my-corpus                          # BOTH gates, one verdict
python3 curriculum/cli.py status ./my-corpus                         # stage-by-stage progress
```

`check` is hands-off — it reports folder-contract problems and SLO-code drift and never blocks
(exit non-zero only so CI can choose to fail; `--soft` always exits 0). The individual tools are
also runnable directly (`curriculum/tools/*.py`, `curriculum/gates/*.py`). Run the tests with:

```bash
python3 -m unittest discover curriculum/tools -p 'test_*.py'
python3 curriculum/gates/test_qa_checks.py && python3 curriculum/test_cli.py
```

## Credentials

None ship here. Stages A–C need only your own model key (via the environment, like the rest of the
repo). Rendering (D) and voicenotes (E) are optional and use your own image/TTS keys.
