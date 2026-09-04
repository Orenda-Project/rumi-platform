/**
 * Morning Brief Routes — the live page for the programme-health briefs.
 *
 *   GET /observability/brief?kind=daily|weekly   the latest brief: cover, every
 *                                                panel with its caption, dateline
 *   GET /observability/brief/file/:kind/:name    a locally rendered panel PNG
 *   GET /observability/brief/screen?kind=&p=     one panel, full-bleed, for an
 *                                                office wall; re-fetches itself
 *
 * A factory rather than a bare router, unlike settings.js: the screen page
 * has TWO ways in — a dashboard session, or `?token=` matching
 * BRIEF_SCREEN_TOKEN (a wall display has no session and nobody to log it
 * in) — so requireAuth is applied per-route in here, not at the mount, and
 * is injected so this module never loads the dashboard's database pool
 * (which the auth middleware does at require time). The service and env
 * are injectable for the same reason.
 *
 * Everything that decides what to serve lives in services/brief.service.js.
 */

const express = require('express');
const briefService = require('../services/brief.service');

const SCREEN_REFRESH_SECONDS = 300;

function createBriefRouter({ requireAuth, service = briefService, env = process.env, fetchImpl } = {}) {
  if (typeof requireAuth !== 'function') {
    throw new Error('createBriefRouter needs the requireAuth middleware');
  }
  const router = express.Router();

  // Token first, then the normal login — never the other way round, so a
  // wrong token gets exactly the same redirect a stranger does.
  const screenGate = (req, res, next) => {
    if (service.screenTokenGrants(env, req.query && req.query.token)) return next();
    return requireAuth(req, res, next);
  };

  router.get('/', requireAuth, async (req, res) => {
    const kind = service.normalizeKind(req.query && req.query.kind);
    try {
      const resolved = await service.resolveManifest(kind, { env, fetchImpl });
      res.render('brief', {
        title: 'Morning Brief',
        currentPage: 'brief',
        username: req.session && req.session.username,
        userRole: req.session && req.session.userRole,
        kind,
        brief: resolved ? service.buildPageModel(resolved) : null,
      });
    } catch (error) {
      console.error('Morning Brief page error:', error);
      res.status(500).render('error', {
        title: 'Error',
        message: 'Failed to load the Morning Brief',
        error: error.message,
      });
    }
  });

  router.get('/file/:kind/:name', requireAuth, (req, res) => {
    const resolved = service.readLocalManifest(service.normalizeKind(req.params.kind), env);
    const file = service.safeLocalFile(resolved, req.params.name);
    if (!file) return res.status(404).send('Not found');
    return res.sendFile(file);
  });

  router.get('/screen', screenGate, async (req, res) => {
    const kind = service.normalizeKind(req.query && req.query.kind);
    const p = Math.max(0, parseInt(req.query && req.query.p, 10) || 0);
    try {
      const resolved = await service.resolveManifest(kind, { env, fetchImpl });
      const model = resolved ? service.buildPageModel(resolved) : null;
      const panel = model && model.panels[p] ? model.panels[p] : null;
      res.render('brief-screen', {
        title: 'Morning Brief',
        kind,
        p,
        panel,
        panelCount: model ? model.panels.length : 0,
        dateline: model ? model.dateline : '',
        refreshSeconds: SCREEN_REFRESH_SECONDS,
      });
    } catch (error) {
      console.error('Morning Brief screen error:', error);
      res.status(500).render('brief-screen', {
        title: 'Morning Brief',
        kind,
        p,
        panel: null,
        panelCount: 0,
        dateline: '',
        refreshSeconds: SCREEN_REFRESH_SECONDS,
      });
    }
  });

  return router;
}

module.exports = { createBriefRouter, SCREEN_REFRESH_SECONDS };
