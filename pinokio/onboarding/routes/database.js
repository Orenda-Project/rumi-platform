/**
 * database -- the one step in Rumi's setup that cannot be fully automated.
 *
 * Supabase exposes no API for running arbitrary SQL, so the `exec_sql` helper the
 * schema is applied through has to be pasted into the SQL editor by hand, once.
 * Every launcher hits this wall; what a GUI can do is make the wall short --
 * show the exact SQL, link straight to the right page of the operator's own
 * project, then poll until it appears and carry on without being asked twice.
 *
 * @module onboarding/routes/database
 */

const path = require('path');
const { asyncRoute } = require('../async-route');
const sse = require('../sse');

/** How long to keep checking for the pasted helper: ~16s, matching the wizard. */
const HELPER_POLL = { attempts: 8, delayMs: 2000 };

/** Report progress at most this often, so a 400-statement file is not 400 writes. */
const PROGRESS_EVERY = 10;

function databaseRoutes({ express, bridge, runtime }) {
  const router = express.Router();
  const { capabilities, modules, APP_ROOT } = bridge;

  /**
   * One bootstrap at a time.
   *
   * The step can be left and re-entered while a run is in flight -- the rail is
   * clickable throughout -- and without this a second click would apply the
   * whole schema again, concurrently, against the same database.
   */
  let running = false;

  function credentials() {
    const env = { ...process.env, ...(runtime ? runtime.fileEnv() : {}) };
    return {
      SUPABASE_URL: env.SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY,
    };
  }

  function unavailable(res) {
    return res.status(503).json({ error: 'Database setup is unavailable -- use the terminal setup.' });
  }

  router.get('/state', asyncRoute(async (req, res) => {
    if (!capabilities.database) return unavailable(res);

    const env = credentials();
    const inspection = await modules.database.inspectDatabase(env);
    res.json({
      ...inspection,
      helperSql: modules.database.EXEC_SQL_DEFINITION.join('\n'),
      sqlEditorUrl: modules.database.sqlEditorUrl(env.SUPABASE_URL),
    });
  }));

  router.post('/check', asyncRoute(async (req, res) => {
    if (!capabilities.database) return unavailable(res);
    // PostgREST caches its schema, so the helper is not visible the instant it is
    // created -- polling is the difference between "done" and "it didn't work".
    const result = await modules.database.waitForExecSql(credentials(), fetch, HELPER_POLL);
    res.json(result);
  }));

  router.get('/bootstrap', (req, res) => {
    if (!capabilities.database) return unavailable(res);

    const stream = sse.open(res);
    if (running) {
      stream.send('failed', { error: 'The schema is already being applied. Watch that tab, or wait for it to finish.' });
      stream.close();
      return undefined;
    }

    running = true;
    runBootstrap({ modules, APP_ROOT, env: credentials(), stream })
      .catch((error) => stream.send('failed', { error: error.message }))
      .finally(() => {
        running = false;
        stream.close();
      });
    return undefined;
  });

  return router;
}

/**
 * Apply the three schema files, narrating as it goes.
 *
 * `applySchema()` is the supported one-liner but reports nothing until it
 * finishes, and 159KB of schema is a long silence. So the bootstrapper is built
 * directly and its `execSql` wrapped -- the default implementation still does the
 * work, including its one-time "paste the helper" hint on a 404.
 */
async function runBootstrap({ modules, APP_ROOT, env, stream }) {
  const { DatabaseBootstrapper } = modules.bootstrap;
  const schemaDir = path.join(APP_ROOT, 'infrastructure', 'supabase');
  const files = DatabaseBootstrapper.FILES;

  const bootstrapper = new DatabaseBootstrapper({
    supabaseUrl: env.SUPABASE_URL,
    supabaseKey: env.SUPABASE_SERVICE_ROLE_KEY,
    schemaDir,
  });

  const total = countStatements(modules, schemaDir, files);
  let done = 0;
  let file = files[0];

  // The bootstrapper labels each statement "<file>#<n>", which is the only
  // progress it offers -- it otherwise reports nothing until it has finished.
  const applyStatement = bootstrapper.execSql;
  bootstrapper.execSql = async (sql, label) => {
    file = String(label).split('#')[0];
    const result = await applyStatement(sql, label);
    done += 1;
    if (done % PROGRESS_EVERY === 0) stream.send('progress', { done, total, file });
    return result;
  };

  stream.send('started', { files, total });
  const result = await bootstrapper.bootstrap();
  // A final count, naming the file it actually reached rather than the one it
  // would have reached had everything worked.
  stream.send('progress', { done, total, file });

  if (result.errors.length) {
    stream.send('failed', { ...result, error: result.errors[0].error });
    return;
  }

  // The bootstrapper reports on the SQL it sent; inspect again so success means
  // the tables are actually visible, which is what the operator cares about.
  const inspection = await modules.database.inspectDatabase(env);
  stream.send('done', { ...result, state: inspection.state, detail: inspection.detail });
}

/**
 * Total statements across the schema files, for a real progress bar.
 * Returns null when the splitter is unavailable; the UI then shows a count.
 */
function countStatements(modules, schemaDir, files) {
  if (!modules.sqlStatements || !modules.sqlStatements.splitSqlStatements) return null;
  try {
    const fs = require('fs');
    return files.reduce((sum, file) => {
      const sql = fs.readFileSync(path.join(schemaDir, file), 'utf-8');
      return sum + modules.sqlStatements.splitSqlStatements(sql).length;
    }, 0);
  } catch {
    return null;
  }
}

module.exports = { databaseRoutes };
