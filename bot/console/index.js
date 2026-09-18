/**
 * The operator console — mountConsole(app, opts).
 *
 * One implementation, two hosts:
 *
 *   MOUNTED   on the bot's own Express app at /console. This is the normal case
 *             and the useful one: the console is in the same process as the bot,
 *             so it knows the real uptime, sees the live event ring, and a
 *             feature toggle takes effect on the very next inbound message.
 *
 *   STANDALONE via `rumi console`, bound to loopback, in a process that requires
 *             nothing boot-blocking. This exists because of a specific failure:
 *             bot/shared/config/supabase.js calls process.exit(78) AT REQUIRE
 *             TIME when the database credentials are missing or wrong, and
 *             bot/whatsapp-bot.js requires it on line 33. So the bot never
 *             reaches app.listen(), and a console mounted only on that app would
 *             be unreachable in exactly the situation it exists to fix. The
 *             standalone host is how you get in to fix the keys.
 *
 * Nothing in this directory may require supabase, constants, llm-client or the
 * messaging index at module scope, or the standalone host inherits the same
 * boot failure. A test enforces it.
 *
 * @module console
 */

const express = require('express');
const path = require('path');

const { createRuntime } = require('./runtime');
const { resolveMode, modeForRequest, hostGuard } = require('./auth');

const MOUNT = '/console';

/**
 * Paths reachable without authentication. Exact strings in a Set, matched with
 * `.has()` on the normalised pathname — never a prefix test.
 *
 * A prefix test is how `/console/login` becomes `/console/login/../api/env`.
 * There is no reason to be clever here.
 */
const PUBLIC_PATHS = new Set([
  '/login',
  '/assets/console.css',
  '/assets/console.js',
  '/locked',
]);

/**
 * Mount the console.
 *
 * @param {import('express').Express|import('express').Router} app
 * @param {object} [opts]
 * @param {string} [opts.envPath]     which .env to read and write
 * @param {string} [opts.bind]        the address the server listens on — decides the security posture
 * @param {boolean} [opts.standalone] true when served by `rumi console`
 * @returns {{mode: string, mount: string, runtime: object}}
 */
function mountConsole(app, opts = {}) {
  const runtime = createRuntime(opts);
  const env = process.env;
  const posture = resolveMode(env, opts.bind || '127.0.0.1');

  // The activity feed's memory ceiling is the operator's to set.
  if (env.CONSOLE_RING_SIZE) {
    try { require('../shared/observability/event-ring').configure({ size: env.CONSOLE_RING_SIZE }); }
    catch { /* the ring is optional */ }
  }

  const router = express.Router();

  // ── Security headers ───────────────────────────────────────────────────────
  // No CDN, no inline script, no framing. The per-request token reaches the page
  // through a <meta> tag rather than an inline <script>, which is what lets
  // script-src stay 'self' with no nonce machinery.
  router.use((req, res, next) => {
    res.setHeader('Content-Security-Policy', [
      "default-src 'none'",
      "script-src 'self'",
      "style-src 'self'",
      "img-src 'self' data:",
      "connect-src 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "base-uri 'none'",
    ].join('; '));
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  // Rejects a Host header we do not recognise. This is the DNS-rebinding
  // defence and it has to run on GET too: an attacker's domain can be made to
  // resolve to 127.0.0.1, at which point the browser treats their page as
  // same-origin and an Origin check stops helping.
  router.use(hostGuard({ bind: opts.bind || '127.0.0.1', publicHost: env.CONSOLE_PUBLIC_HOST }));

  router.use('/assets', express.static(path.join(__dirname, 'assets'), {
    maxAge: 0,
    setHeaders: (res) => res.setHeader('Cache-Control', 'no-store'),
  }));

  // ── The gate ───────────────────────────────────────────────────────────────
  router.use((req, res, next) => {
    // Express strips the mount path, so req.path is already console-relative.
    const p = req.path.replace(/\/+$/, '') || '/';
    // The bot binds 0.0.0.0 because Railway requires it, so WHO is asking is the
    // only honest signal left — see auth.js#modeForRequest.
    const mode = modeForRequest(posture, req);
    res.locals.posture = { ...posture, mode };

    if (mode === 'locked') {
      // Reachable from the network with no password configured. Serve the
      // explanation and nothing else — never a login form that a scanner can
      // race, and never the console itself.
      if (p === '/locked' || PUBLIC_PATHS.has(p)) return next();
      return res.redirect(`${MOUNT}/locked`);
    }

    if (mode === 'local') {
      // Loopback, no password. The person at the keyboard already owns this
      // machine and the .env file on it; a password here buys nothing and costs
      // us the non-technical operator, who will not invent one.
      res.locals.token = runtime.localToken;
      res.locals.authenticated = true;
      if (PUBLIC_PATHS.has(p)) return next();
      // API calls must echo the token that was injected into the page. Nothing
      // hands it out, and we send no CORS headers, so a hostile page cannot
      // read it and therefore cannot forge a call.
      if (p.startsWith('/api/')) {
        const sent = req.get('X-Console-Token');
        if (sent !== runtime.localToken) {
          return res.status(401).json({ error: 'Missing or stale console token. Reload the page.' });
        }
      }
      return next();
    }

    // Gated mode: session-backed login. Wired in when the login route lands.
    res.locals.token = req.session && req.session.csrf;
    res.locals.authenticated = Boolean(req.session && req.session.consoleUser);
    if (PUBLIC_PATHS.has(p)) return next();
    if (!res.locals.authenticated) {
      if (p.startsWith('/api/')) return res.status(401).json({ error: 'Not signed in' });
      return res.redirect(`${MOUNT}/login`);
    }
    return next();
  });

  // ── Routes ─────────────────────────────────────────────────────────────────
  router.use(require('./routes/pages')({ runtime, posture, mount: MOUNT }));
  router.use('/api', require('./routes/api')({ runtime, posture, mount: MOUNT }));

  app.use(MOUNT, router);

  return { mode: posture.mode, mount: MOUNT, runtime, posture };
}

module.exports = { mountConsole, MOUNT, PUBLIC_PATHS };
