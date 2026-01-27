# Observability Dashboard (Phase 2 Add-On)

> **This is a Phase 2 add-on.** The core Rumi bot works without this dashboard.
> Deploy this when you're ready to add admin monitoring and analytics.

Admin dashboard for monitoring users, coaching sessions, reading assessments, and system health.

## Status

Phase 2 — not required for initial bot deployment. The bot operates fully without the dashboard.

## Tech Stack

- **Backend**: Express.js + EJS templates
- **Auth**: Session-based with role-based access control
- **Database**: Same Supabase instance as the bot
- **Hosting**: Railway (separate service)

## Features

- User management and analytics
- Coaching session monitoring
- Reading assessment results
- AMA (Ask Me Anything) conversation logs
- Role-based access control (super admin, partner admin, partner viewer)

## Setup

Once your bot is running (Phase 1), you can add the dashboard:

1. Install dependencies: `cd dashboard && npm install`
2. Add a new Railway service pointing to `dashboard/`
3. Set the required environment variables (same Supabase credentials as the bot)
4. Deploy

See the main [SETUP.md](../SETUP.md) for details.

## Routes

| Route | Access |
|-------|--------|
| `/observability/dashboard` | All roles |
| `/observability/users` | Scoped by role |
| `/observability/coaching` | Scoped by role |
| `/observability/ama` | All roles |
| `/observability/admin/users` | Super admin only |
