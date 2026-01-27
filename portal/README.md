# Teacher Portal (Phase 2 Add-On)

> **This is a Phase 2 add-on.** The core Rumi bot works without this portal.
> Deploy this when you want teachers to access their data via a web interface.

React SPA for teachers to access lesson plans, coaching sessions, and analytics.

## Status

Phase 2 — not required for initial bot deployment. Teachers interact with the bot via WhatsApp; this portal provides an additional web-based view of their data.

## Tech Stack

- **Framework**: React 18 + TypeScript + Vite
- **Styling**: Tailwind CSS + shadcn/ui
- **Backend**: APIs served by the Observability Dashboard
- **Hosting**: Any static hosting (Vercel, Netlify, Railway, etc.)

## Features

- Teacher login (phone + password)
- Dashboard with stats and recent content
- Lesson plan browser
- Coaching session review with audio playback
- Analytics and score trends

## Prerequisites

- The **Observability Dashboard** (Phase 2) must be deployed first, as this portal consumes its APIs.
- Same Supabase instance as the bot.

## Setup

1. Install dependencies: `cd portal && npm install`
2. Configure environment variables (API URL pointing to the dashboard)
3. Build: `npm run build`
4. Deploy the `dist/` folder to any static hosting

## Routes

| Route | Purpose |
|-------|---------|
| `/portal/login` | Phone + password auth |
| `/portal/setup/:token` | Password setup from invitation |
| `/portal/dashboard` | Stats + recent content |
| `/portal/lesson-plans` | Lesson plan list |
| `/portal/coaching` | Coaching sessions |
| `/portal/coaching/analytics` | Score trends |
