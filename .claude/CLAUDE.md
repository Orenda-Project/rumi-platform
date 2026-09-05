# .claude/ — Agent & skill config (L1)

**Parent:** [../CLAUDE.md](../CLAUDE.md) · Claude Code configuration for this repo.

## What's here

| Path | Purpose |
|------|---------|
| `skills/<name>/SKILL.md` | On-demand domain knowledge an agent loads when a task matches |
| `settings.json` | MCP servers (e.g. Supabase) — secrets via `${ENV_VAR}` interpolation, never inline |

## Skills

Skills are loaded **on demand** — keep this router lean and let the skill hold the depth. Each skill is a
folder with a `SKILL.md` (+ optional reference files).

| Skill | Use for |
|-------|---------|
| [setup](skills/setup/SKILL.md) | Guided clone setup — env, DB bootstrap, flow registration, preflight (`/setup`) |
| [customizing](skills/customizing/SKILL.md) | Re-shaping a feature — the seam map for swapping frameworks, report design, LP structure, reading rubric, branding |
| [digital-coach](skills/digital-coach/SKILL.md) | **Start here** — architecture map of the whole bot; routes to everything else |
| [coaching](skills/coaching/SKILL.md) | Classroom-observation coaching: frameworks, the queue worker, LP integration |
| [debugging](skills/debugging/SKILL.md) | Investigation discipline + correlation-id tracing |
| [registration](skills/registration/SKILL.md) | New-user name capture + the WhatsApp Registration Flow |
| [reading-assessment](skills/reading-assessment/SKILL.md) | Oral-reading-fluency pipeline, WCPM benchmarks, multilingual rules |
| [whatsapp-flows](skills/whatsapp-flows/SKILL.md) | Building & publishing WhatsApp Flows (endpoint data exchange, the publish lifecycle) |
| [cross-agent-safety](skills/cross-agent-safety/SKILL.md) | Safety checklist before editing shared services/workers |
| [pre-merge-checklist](skills/pre-merge-checklist/SKILL.md) | Defensive pre-flight checks for recurring bug classes |
| [database-analysis](skills/database-analysis/SKILL.md) | Read-only analyst guide: connection, query patterns, anti-sprawl |
| [qa-testing](skills/qa-testing/SKILL.md) | Test runner, conformance guards, the route-contract pattern |
| [video-generation](skills/video-generation/SKILL.md) | The educational-video pipeline, presigned-URL gotcha, checkpoint/resume |
| [ab-testing](skills/ab-testing/SKILL.md) | Thompson-sampling multi-armed bandit (ab_tests tables) |
| [logging](skills/logging/SKILL.md) | Structured console logs, correlation IDs, semantic events, optional external backend |
| [feature-tracer](skills/feature-tracer/SKILL.md) | Trace any feature end to end — the map of handler/service/worker/table per feature |
| [curriculum-baked-lesson-plans](skills/curriculum-baked-lesson-plans/SKILL.md) | Turn your own textbooks into a gate-checked lesson-plan corpus — the 7-stage build pipeline (page-truth → segment → enrich → render); runnable tools in [`curriculum/`](../curriculum/) |
| [morning-brief](skills/morning-brief/SKILL.md) | The recurring programme-health thread (registration → lesson plans → coaching → scores → reading → every school worst-first) delivered every morning on WhatsApp/Slack/Discord with a live dashboard page; runnable code in [`brief/`](../brief/) |

> Skills are loaded **on demand** — an agent reads the one whose description matches the task. The set above
> is the operational core (run / extend / debug the open bot); internal-ops skills from the production bot
> are intentionally not ported. CI (gitleaks + the source-hygiene guard) enforces that no secrets or internal
> references ever ship in a skill.

## Rules for adding/editing skills here

1. **No secrets, no internal references.** Skill markdown is public. Use env-var names and placeholders, never
   real keys, phone numbers, org names, or internal ticket IDs. The `tests/setup/source-hygiene.test.js` guard
   scans `.claude/**/*.md` and fails the build on a violation.
2. **Generic, not deployment-specific.** Describe how the open platform works, not how one deployment runs it.
3. **Point, don't duplicate.** A skill should reference code by path, not paste large code blocks that go stale.
