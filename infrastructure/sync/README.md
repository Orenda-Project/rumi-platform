# Sync configuration — maintainer-only

This directory configures how the upstream **maintainers** sync code from
the internal monorepo into the public `Orenda-Project/rumi-platform` repo.

**You don't need any of this to clone or run the bot.** If you're here to
set up a fork, ignore this directory and follow `SETUP.md` from the repo
root.

## Files

| File | Used by | Purpose |
|------|---------|---------|
| `manifest.json` | `infrastructure/scripts/sync-from-internal.sh` | The single source of truth: `mappings` (internal → public path), `exclude` (never sync these), `publicOnly` (live in this repo only — do not overwrite from internal). |
| `exclude.txt` | humans (companion doc) | The same exclusion patterns as `manifest.json` `exclude`, grouped + commented for review. Not consumed by any script — it exists so a reviewer can read the intent quickly. |

## Why these moved here from the repo root

Both files were at the repo root in earlier OSS revisions (`.sync-manifest.json`
+ `.sync-exclude`). A first-time cloner reading the file tree saw two
dotfiles in their face that had nothing to do with running the bot;
`infrastructure/` is the more honest home for maintainer-only tooling.
The script's `MANIFEST` path was updated in lockstep.

## Adding a new mapping

Edit `manifest.json` and add an entry to `mappings`:

```json
{
  "internal": "shared/services/<new>/",
  "public":   "bot/shared/services/<new>/",
  "direction": "internal-to-public",
  "notes": "<one-line reviewer hint>"
}
```

If the same change should also appear in `exclude.txt` for the human
reviewer, add it there too.
