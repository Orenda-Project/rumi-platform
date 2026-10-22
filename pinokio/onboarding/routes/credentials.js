/**
 * credentials -- reading and writing `.env`, and testing what was written.
 *
 * Every piece of wording the wizard shows comes from the checkout rather than
 * from here: `buildCatalog` reads its labels, hints and "where to get it" links
 * from bot/scripts/setup/fields.js and doctor.js, so this launcher's copy tracks
 * upstream instead of drifting away from it.
 *
 * Writes go through the console's own `runtime.save`, which serialises concurrent
 * writes, backs the file up once per session, verifies the round trip and chmods
 * to 0600. It deliberately does not validate -- that is this file's job, using
 * the same validators the terminal wizard uses.
 *
 * @module onboarding/routes/credentials
 */

const { asyncRoute } = require('../async-route');
const { ensureLocalRedis } = require('../local-redis');
const optional = require('../probes');

/**
 * @param {object} deps
 * @param {Function} deps.express
 * @param {object} deps.bridge
 * @param {object|null} deps.runtime  the console runtime, or null if it failed to mount
 * @returns {object} an express Router
 */
function credentialsRoutes({ express, bridge, runtime }) {
  const router = express.Router();
  const { capabilities, problems, modules } = bridge;

  /** The env as it stands: the file is the truth, process.env fills the gaps. */
  function currentEnv() {
    const file = runtime ? runtime.fileEnv() : {};
    return { ...process.env, ...file };
  }

  router.get('/state', asyncRoute(async (req, res) => {
    // probeFor: which launcher check tests each optional key, so the client can
    // test one when it is saved. Rumi's own probes cover the required four.
    const payload = { capabilities, problems, catalog: null, probeFor: optional.PROBE_FOR_KEY };
    if (capabilities.credentials) {
      payload.catalog = modules.catalog.buildCatalog(currentEnv());
    }
    res.json(payload);
  }));

  router.post('/env', asyncRoute(async (req, res) => {
    if (!capabilities.credentials || !runtime) {
      return res.status(503).json({ error: 'Settings are unavailable -- use the terminal setup.' });
    }

    const updates = (req.body && req.body.updates) || {};
    if (!Object.keys(updates).length) {
      return res.status(400).json({ error: 'No settings were sent.' });
    }

    // A value the validator rejects is an answer, not a failed request: the
    // response carries the reason so the field can show it. Returning 4xx here
    // would collapse that reason into a bare status code on the way back.
    const { clean, errors } = validate(updates, modules);
    const written = Object.keys(clean).length ? (await runtime.save(clean)).written : [];
    return res.json({ written, errors });
  }));

  router.post('/probe/:name', asyncRoute(async (req, res) => {
    if (!capabilities.probes) {
      return res.status(503).json({ ok: false, detail: 'Connection tests are unavailable.' });
    }
    // Own-property check, not a bare lookup. `defaultProbes` is an object
    // literal, so it inherits Object.prototype: `/api/probe/constructor` would
    // otherwise resolve to the Object constructor, pass a truthiness guard, and
    // -- because Object(x) returns x -- hand the caller the entire environment,
    // service-role key and all.
    const { name } = req.params;

    // The launcher's own live checks for optional services Rumi only checks
    // for presence (see probes.js). runProbe does its own own-property lookup.
    const launcherCheck = optional.runProbe(name, currentEnv());
    if (launcherCheck) return res.json(await launcherCheck);

    const probes = modules.doctor.defaultProbes;
    if (!Object.prototype.hasOwnProperty.call(probes, name) || typeof probes[name] !== 'function') {
      return res.status(404).json({ ok: false, detail: `No such check: ${name}` });
    }
    const probe = probes[name];
    const env = currentEnv();
    // A local Redis starts here, when it is first tested, not when the wizard
    // opens -- by now the operator has said which Redis they want.
    if (name === 'redis') await ensureLocalRedis(env);
    try {
      const result = await probe(env);
      return res.json(result);
    } catch (error) {
      // A probe that throws is a failed check, not a failed request -- the UI
      // shows the reason next to the field either way.
      return res.json({ ok: false, detail: error.message });
    }
  }));

  router.get('/doctor', asyncRoute(async (req, res) => {
    if (!capabilities.probes) {
      return res.status(503).json({ error: 'Diagnostics are unavailable.' });
    }
    const env = currentEnv();
    await ensureLocalRedis(env);
    // Optional services alongside Rumi's report, not inside it: a wrong
    // optional key switches one feature off, it does not make Rumi unready.
    const [report, optionalResults] = await Promise.all([
      modules.doctor.runDoctor({ env }),
      optional.runConfigured(env),
    ]);
    res.json({ ...report, optionalResults });
  }));

  return router;
}

/**
 * Validate a batch of updates, keeping the good and reporting the rest.
 *
 * Values are stored as the validator normalised them (quotes stripped, scheme
 * added, trailing slash removed), never as typed -- which is what the terminal
 * wizard does with the same functions.
 *
 * @returns {{clean: Record<string,string>, errors: Record<string,string>}}
 */
function validate(updates, modules) {
  const allowed = modules.catalog.knownKeys();
  const clean = {};
  const errors = {};

  for (const [key, raw] of Object.entries(updates)) {
    if (!allowed.has(key)) {
      errors[key] = 'This launcher has no field for that setting.';
      continue;
    }
    const verdict = modules.validators.validatorFor(key)(String(raw ?? ''));
    if (verdict.ok) {
      clean[key] = verdict.value;
    } else {
      errors[key] = verdict.reason;
    }
  }

  return { clean, errors };
}

module.exports = { credentialsRoutes };
