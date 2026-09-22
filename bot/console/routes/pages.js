/**
 * pages — the server-rendered console screens.
 *
 * Each route gathers its data from modules that already exist (doctor, status,
 * feature-availability, the env catalogue, the pipeline map) and hands it to a
 * view. There is deliberately no data-fetching logic here beyond that
 * assembly — anything worth computing lives in a module that can be tested
 * without an HTTP request.
 *
 * @module console/routes/pages
 */

const express = require('express');

const { render } = require('../view');
const { buildCatalog } = require('../env-catalog');
const { buildPipeline } = require('../pipeline-map');
const { readEnvFile } = require('../../scripts/setup/env-file');

/**
 * @param {{runtime: object, posture: object, mount: string}} deps
 * @returns {import('express').Router}
 */
module.exports = function pagesRouter({ runtime, posture, mount }) {
  const router = express.Router();

  /** Everything a page's chrome needs, on every render. */
  function chrome(req) {
    let branding = { botName: 'Rumi', orgName: null };
    try {
      const b = require('../../shared/config/branding');
      branding = { botName: b.botName, orgName: b.orgName };
    } catch { /* branding is optional; the default name is fine */ }
    return {
      mount,
      posture,
      branding,
      standalone: runtime.standalone,
      pending: runtime.pendingRestart(),
      active: req.path.replace(/\/+$/, '') || '/',
      setupTally: null,
      featureTally: null,
      pageTitle: 'Console',
    };
  }

  // ── Locked: reachable from the network with no password set ────────────────
  router.get('/locked', async (req, res) => {
    await render(res, 'locked', {
      ...chrome(req), pageTitle: 'Locked',
      problems: posture.problems,
      reason: res.locals.posture.mode === 'locked' && posture.mode === 'per-request'
        ? 'you are reaching it from another machine on the network'
        : posture.reason,
    });
  });

  // ── Overview ───────────────────────────────────────────────────────────────
  router.get('/', async (req, res) => {
    const env = { ...process.env, ...readEnvFile(runtime.envPath) };
    const { missingRequired, resolveChannelDriver, resolveActiveChannels } =
      require('../../shared/config/feature-availability');
    const features = require('../features').snapshot(env);

    let identity = { paired: false };
    let processState = { running: true, pid: process.pid };
    try {
      const status = require('../../scripts/setup/status');
      identity = status.sandboxIdentity(env);
      processState = status.processState(env);
    } catch { /* status is best-effort */ }

    let ring = { records: 0, traces: 0 };
    try { ring = require('../../shared/observability/event-ring').stats(); } catch { /* optional */ }

    await render(res, 'overview', {
      ...chrome(req),
      pageTitle: 'Overview',
      missing: missingRequired(env),
      channel: resolveChannelDriver(env),
      activeChannels: resolveActiveChannels(env),
      identity,
      processState,
      features,
      ring,
      uptime: runtime.uptimeSeconds(),
      version: version(),
    });
  });

  // ── Setup: the key manager ─────────────────────────────────────────────────
  router.get('/setup', async (req, res) => {
    const env = readEnvFile(runtime.envPath);
    await render(res, 'setup', { ...chrome(req), pageTitle: 'Setup', catalog: buildCatalog(env) });
  });

  // ── Pipeline: the three layers ─────────────────────────────────────────────
  router.get('/pipeline', async (req, res) => {
    const env = { ...process.env, ...readEnvFile(runtime.envPath) };
    await render(res, 'pipeline', { ...chrome(req), pageTitle: 'Pipeline', pipeline: buildPipeline(env) });
  });

  // ── Features: the toggle board ─────────────────────────────────────────────
  router.get('/features', async (req, res) => {
    const env = { ...process.env, ...readEnvFile(runtime.envPath) };
    await render(res, 'features', { ...chrome(req), pageTitle: 'Features', features: require('../features').snapshot(env) });
  });

  // ── Activity: live feed and traces ─────────────────────────────────────────
  router.get('/activity', async (req, res) => {
    let traces = [];
    let stats = { records: 0, capacity: 0, traces: 0 };
    try {
      const ring = require('../../shared/observability/event-ring');
      traces = ring.traceList(40);
      stats = ring.stats();
    } catch { /* optional */ }
    await render(res, 'activity', { ...chrome(req), pageTitle: 'Activity', traces, stats });
  });

  // ── System ─────────────────────────────────────────────────────────────────
  router.get('/system', async (req, res) => {
    const env = { ...process.env, ...readEnvFile(runtime.envPath) };
    const { resolveChannelDriver } = require('../../shared/config/feature-availability');
    await render(res, 'system', {
      ...chrome(req),
      pageTitle: 'System',
      version: version(),
      node: process.version,
      uptime: runtime.uptimeSeconds(),
      envPath: runtime.envPath,
      channel: resolveChannelDriver(env),
      queueDriver: env.QUEUE_DRIVER || 'sqs',
      nodeEnv: env.NODE_ENV || 'development',
      memory: process.memoryUsage(),
    });
  });

  return router;
};

/** The bot's version, read the same way /health reads it. */
function version() {
  try {
    const fs = require('fs');
    const path = require('path');
    const file = path.join(__dirname, '../../VERSION');
    if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8').trim();
    return require('../../package.json').version;
  } catch {
    return 'unknown';
  }
}
