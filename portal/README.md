# Teacher Portal (Phase 2)

This is the Rumi Teacher Portal — a web application where teachers can view their coaching history, reading assessment results, and manage their classroom data.

**This is a Phase 2 add-on.** The WhatsApp bot works fully without this portal. Deploy the bot first (Phase 1), then add the portal when ready.

## What It Does

- Teachers view their coaching feedback history
- Teachers see reading assessment results and student progress
- Teachers manage classroom settings
- School administrators view aggregate analytics

## Prerequisites

- Phase 1 (bot) fully deployed and running
- Same Supabase database as the bot
- Separate static hosting (Vercel, Netlify, or Railway)

## Setup

```bash
cd portal
npm install
npm run dev    # Development server
npm run build  # Production build
```

Deploy the `dist/` folder to any static hosting service.

## Tech Stack

- React + TypeScript
- Vite (build tool)
- Supabase client SDK
- TailwindCSS

## License

Apache License 2.0 — See [LICENSE](../LICENSE).
