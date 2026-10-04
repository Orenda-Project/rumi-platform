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
- Tailwind CSS, built ahead of time into `public/css/main.css`

## Content Security Policy

The admin pages (`/observability/*`) send a strict Content-Security-Policy, set by
`lib/admin-csp.js` whenever a view is rendered. JSON responses and the teacher portal
are not affected.

- **Nonce.** Each request gets a random nonce in `res.locals.cspNonce`. The policy
  allows scripts from this server (`'self'`) and inline `<script>` blocks that carry that
  nonce, nothing else inline. Write inline scripts as `<script nonce="<%= cspNonce %>">`.
- **No inline handlers.** `onclick="..."`, `onchange="..."` and `javascript:` links are
  blocked. Either bind the event with `addEventListener` in the page's script, or mark the
  element with `data-on-click="functionName"` (also `data-on-change`, `data-on-input`,
  `data-on-submit`, `data-on-keydown`, `data-on-error`) plus `data-args='["arg"]'`, load
  `/js/csp-actions.js`, and register the handler from the page's nonce'd script with
  `window.cspActions.register({ functionName: functionName })`. Unregistered names do
  nothing, even if a global function has that name. That file explains the placeholders
  (`"$event"`, `"$el"`, `"$value"`) and `cspArgs()` for HTML built in a script;
  `tests/dashboard/csp-actions-views.test.js` checks each view registers what it uses.
- **Third-party scripts.** Copy the file into `public/vendor/` and keep its licence
  header (Chart.js, ApexCharts and wordcloud2 live there). A file too big to vendor is
  loaded from one exact, versioned URL with `integrity="sha384-..."` and
  `crossorigin="anonymous"`, and that URL is added to `PINNED_SCRIPTS` in
  `lib/admin-csp.js` (Mermaid on the schema page).
- **Styles.** Tailwind classes are compiled ahead of time. After adding classes to a view,
  run `npm run build:css` and commit `public/css/main.css`. Do not load the Tailwind CDN
  runtime. `style-src` still allows inline styles (`style=` attributes and `<style>`
  blocks are used throughout) and Google Fonts.

- **Escaping.** The CSP does not stop injected markup, so values from the public
  (names, chat, transcripts, model replies) are always text. In a view, write them
  with `<%= %>`; data for an inline script with `<%- safeJson(x) %>`
  (`lib/safe-json.js`); and keep `<%- %>` for includes. HTML built in a script passes
  every value through `escapeHtml()` or, for `href`/`src`, `safeUrl()`
  (`public/js/escape-html.js`). `tests/dashboard/ejs-raw-output-allowlist.test.js` and
  `tests/dashboard/admin-view-escaping/html-sinks.test.js` check this.

`tests/dashboard/admin-csp.test.js` scans every view for scripts without the nonce,
inline handlers, `javascript:` URLs and the Tailwind CDN. The full rules, and how to
add a reviewed exception: [Writing admin views safely](../docs/features/admin-views-security.md).

## License

Apache License 2.0 — See [LICENSE](../LICENSE).
