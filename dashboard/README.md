# Observability Dashboard (Phase 2)

This is the Rumi Observability Dashboard — a web-based portal for monitoring bot usage, coaching sessions, reading assessments, and system health.

**This is a Phase 2 add-on.** The WhatsApp bot works fully without this dashboard. Deploy the bot first (Phase 1), then add the dashboard when ready.

## What It Does

- View coaching session analytics and OECD-framework scores
- Monitor reading assessment results and fluency trends
- Track user registrations and engagement metrics
- Manage WhatsApp broadcast messages
- View system health and queue status

## Prerequisites

- Phase 1 (bot) fully deployed and running
- Same Supabase database as the bot
- Dashboard-specific environment variables (see `.env.template` — the "Dashboard Database" and "Dashboard Auth" sections)

## Setup

```bash
cd dashboard
npm install
node index.js
```

Or deploy as a separate Railway service pointing to the same Supabase database.

## Tech Stack

- Node.js + Express
- EJS templates
- Supabase (PostgreSQL) — shared with bot
- bcryptjs for authentication
- Chart.js for analytics

## License

Apache License 2.0 — See [LICENSE](../LICENSE).
