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
  method/       the stage-by-stage playbook + render laws + the failure catalogue
  briefs/       the swarm prompts you can fork
  research/     the public pedagogy behind the enrichment elements
  sample/       one chapter, end to end — clone and run
```

## The two guarantees it bakes in

1. **SLO codes are a registry, not free text** — `tools/slo_registry.py` + `tools/segment_validate.py`.
   Every learning-outcome code must match `<SUBJ>-<GG>-<STRAND>-<NN>` with `GG` == the book's grade;
   drift is flagged and quarantined, never shipped silently.
2. **Lessons live in clean, predictable folders** — `tools/curriculum_scaffold.py` creates and
   validates the one canonical layout, so a build is navigable and resumable.

## Run the tools

```bash
python3 curriculum/tools/curriculum_scaffold.py ./my-corpus            # scaffold the layout
python3 curriculum/tools/curriculum_scaffold.py ./my-corpus --check    # validate the folder contract
python3 curriculum/tools/segment_validate.py ./my-corpus/02_segmentation   # SLO-code gate
python3 -m unittest discover curriculum/tools -p 'test_*.py'           # the tests
```

## Credentials

None ship here. Stages A–C need only your own model key (via the environment, like the rest of the
repo). Rendering (D) and voicenotes (E) are optional and use your own image/TTS keys.
