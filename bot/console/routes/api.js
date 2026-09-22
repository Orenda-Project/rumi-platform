/**
 * api — the console's JSON surface, used by the small islands in console.js.
 *
 * Every mutating route validates with the SAME validators the `rumi setup`
 * wizard uses, and writes through the SAME `writeEnvVars` patcher. That is
 * deliberate: two code paths that write credentials would eventually disagree
 * about what a valid value is, and the wizard's validators encode a lot of
 * hard-won knowledge (the anon-key-vs-service-role-key trap especially).
 *
 * @module console/routes/api
 */

const express = require('express');

const { readEnvFile } = require('../../scripts/setup/env-file');
const validators = require('../../scripts/setup/validators');
const { knownKeys } = require('../env-catalog');
const { classify } = require('../redaction');

/**
 * @param {{runtime: object, posture: object, mount: string}} deps
 */
module.exports = function apiRouter({ runtime }) {
  const router = express.Router();
  router.use(express.json({ limit: '64kb' }));

  /**
   * A cross-site form can send a POST but cannot set a custom header, so
   * requiring one is a cheap and complete CSRF defence. Combined with the token
   * check in the gate, a hostile page has nothing it can forge.
   */
  router.use((req, res, next) => {
    if (req.method === 'GET' || req.method === 'HEAD') return next();
    if (req.get('X-Console-Request') !== '1') {
      return res.status(403).json({ error: 'Missing X-Console-Request header' });
    }
    return next();
  });

  // ── Save one or more values ────────────────────────────────────────────────
  router.post('/env', async (req, res) => {
    const updates = req.body && req.body.updates;
    if (!updates || typeof updates !== 'object') {
      return res.status(400).json({ error: 'Expected { updates: { KEY: value } }' });
    }

    const allowed = knownKeys();
    const clean = {};
    const errors = {};

    for (const [key, raw] of Object.entries(updates)) {
      if (!allowed.has(key)) {
        errors[key] = 'The console has no field for this setting.';
        continue;
      }
      // A value that cannot survive being written and read back would be
      // silently mangled by the .env format, so reject it with a reason.
      if (/[\r\n]/.test(String(raw))) {
        errors[key] = 'A value cannot contain a line break.';
        continue;
      }
      const verdict = validators.validatorFor(key)(String(raw));
      if (!verdict.ok) { errors[key] = verdict.reason; continue; }
      clean[key] = verdict.value === undefined ? String(raw).trim() : verdict.value;
    }

    if (Object.keys(errors).length) return res.status(422).json({ errors });

    try {
      const result = await runtime.save(clean);
      return res.json({ saved: result.written, pending: runtime.pendingRestart() });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ── Clear a value, keeping the line so it stays discoverable ───────────────
  router.post('/env/clear', async (req, res) => {
    const key = req.body && req.body.key;
    if (!knownKeys().has(key)) return res.status(400).json({ error: 'Unknown setting' });
    try {
      await runtime.save({ [key]: '' });
      return res.json({ cleared: key, pending: runtime.pendingRestart() });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ── Reveal one secret ──────────────────────────────────────────────────────
  // A POST, not a GET: it cannot be triggered by an <img>, cannot land in
  // browser history, and cannot be prefetched. One key per call, and the fact
  // that it happened is logged.
  router.post('/env/reveal', (req, res) => {
    const key = req.body && req.body.key;
    const verdict = classify(key);
    if (!verdict.revealable || verdict.classification !== 'secret') {
      return res.status(403).json({
        error: 'This value is never shown. Replace it instead if you think it is wrong.',
      });
    }
    const value = readEnvFile(runtime.envPath)[key];
    if (!value) return res.status(404).json({ error: 'Not set' });

    try {
      require('../../shared/utils/structured-logger').logEvent('console.secret.revealed', { envVar: key });
    } catch { /* the audit line is best-effort; the reveal still happened */ }

    return res.json({ key, value });
  });

  // ── Test a connection for real ─────────────────────────────────────────────
  router.post('/probe/:name', async (req, res) => {
    const { defaultProbes } = require('../../scripts/setup/doctor');
    const probe = defaultProbes[req.params.name];
    if (!probe) return res.status(404).json({ error: 'No such check' });

    const env = { ...process.env, ...readEnvFile(runtime.envPath) };
    try {
      const result = await probe(env);
      return res.json(result);
    } catch (err) {
      return res.json({ ok: false, detail: err.message });
    }
  });

  // ── Feature switches ───────────────────────────────────────────────────────
  router.post('/features/:id', async (req, res) => {
    const { overrides } = require('../../shared/config/feature-availability');
    const feature = require('../features').byId(req.params.id);
    if (!feature) return res.status(404).json({ error: 'No such feature' });

    const enabled = Boolean(req.body && req.body.enabled);
    const env = { ...process.env, ...readEnvFile(runtime.envPath) };

    // A switch can only ever subtract. Turning something "on" whose key is
    // missing would be a promise the bot cannot keep.
    const { isFeatureAvailable } = require('../../shared/config/feature-availability');
    if (enabled && !isFeatureAvailable(feature, env, { ignoreOverrides: true })) {
      return res.status(409).json({ error: 'Add the key first — there is nothing to switch on yet.' });
    }

    try {
      // Cache first so the change applies to the very next message, then the
      // file so it survives a restart.
      overrides.setEnabled(feature.id, enabled);
      await runtime.save({ [overrides.envVarFor(feature.id)]: enabled ? '' : 'off' });
      return res.json({ id: feature.id, enabled, features: require('../features').snapshot(env) });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ── Activity: backfill and live stream ─────────────────────────────────────
  router.get('/activity', (req, res) => {
    const ring = require('../../shared/observability/event-ring');
    res.json({
      records: ring.query({
        since: Number(req.query.since) || 0,
        feature: req.query.feature || null,
        level: req.query.level || null,
        q: req.query.q || null,
        limit: Math.min(Number(req.query.limit) || 200, 500),
      }),
      stats: ring.stats(),
    });
  });

  router.get('/activity/trace/:correlationId', (req, res) => {
    const ring = require('../../shared/observability/event-ring');
    const trace = ring.getTrace(req.params.correlationId);
    if (!trace) return res.status(404).json({ error: 'That request is no longer in memory' });
    return res.json(trace);
  });

  router.get('/activity/stream', (req, res) => {
    const ring = require('../../shared/observability/event-ring');

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // Railway's proxy buffers responses without this, which turns a live
      // feed into a feed that arrives all at once when the connection closes.
      'X-Accel-Buffering': 'no',
    });
    res.write(': connected\n\n');

    const send = (entry) => {
      // A browser that has stopped reading must not be allowed to grow the
      // bot's heap. Drop rather than buffer.
      if (res.writableLength > 1_000_000) return;
      res.write(`id: ${entry.seq}\ndata: ${JSON.stringify(entry)}\n\n`);
    };
    const unsubscribe = ring.subscribe(send);
    const keepalive = setInterval(() => res.write(': ping\n\n'), 25_000);

    req.on('close', () => { clearInterval(keepalive); unsubscribe(); });
  });

  // ── Status, for the pending-restart bar ────────────────────────────────────
  router.get('/status', (req, res) => {
    res.json({ pending: runtime.pendingRestart(), uptime: runtime.uptimeSeconds() });
  });

  return router;
};
