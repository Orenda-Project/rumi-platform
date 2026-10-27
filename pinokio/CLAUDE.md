# pinokio/ — Pinokio launcher (L1)

**Parent:** [../CLAUDE.md](../CLAUDE.md) · Deep knowledge: [.claude/skills/pinokio-launcher](../.claude/skills/pinokio-launcher/SKILL.md)

The 1-click Pinokio launcher for Rumi. Pinokio finds `pinokio/pinokio.js` when someone pastes this repo's
URL, clones the whole repository, and runs these scripts from this folder. Rumi's code is the repository
itself (`..`), so the launcher and the app always move together.

| Need | Go to |
|------|-------|
| The launcher scripts, the sidebar, and the rules for editing them | [.claude/skills/pinokio-launcher](../.claude/skills/pinokio-launcher/SKILL.md) |
| The GUI setup wizard | [onboarding/CLAUDE.md](onboarding/CLAUDE.md) |
| User-facing docs and the HTTP API | [README.md](README.md) |

Rules:

- **Every Rumi command runs with `path: ".."`** (or `"../bot"`), and every path the sidebar checks is `../…`.
  Scripts run from this folder, not the repository root.
- **`onboarding/bridge.js` is the only file that requires Rumi's modules.** Keep it that way: it
  feature-detects each one at boot, so a refactor elsewhere in the repo disables one wizard step instead of
  taking the wizard down. If you rename or change an export it lists, update `MODULES` there in the same PR.
