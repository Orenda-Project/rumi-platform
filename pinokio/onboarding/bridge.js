/**
 * bridge — the entire coupling surface between this launcher and the Rumi checkout.
 *
 * Every `require` that reaches into Rumi's code happens here and nowhere else. Rumi is
 * actively developed and none of these modules are a published API, so each one is
 * loaded defensively: a module that moves or loses an export disables only the step
 * that needed it, and the wizard tells the operator to use the terminal script
 * instead. The alternative -- a require at the top of a route file -- takes the
 * whole server down on an upstream rename.
 *
 * Node resolves each required file's own dependencies from its own location, so
 * `bot/node_modules` is found without this process installing anything.
 *
 * @module onboarding/bridge
 */

const fs = require('fs');
const path = require('path');

// The launcher lives in pinokio/ inside Rumi's repository, two levels up from here.
const APP_ROOT = path.resolve(__dirname, '..', '..');
const ENV_PATH = path.join(APP_ROOT, '.env');
const ENV_TEMPLATE_PATH = path.join(APP_ROOT, '.env.template');

/** Where the WhatsApp pairing worker lives, spawned as a child process. */
const PAIR_WORKER = path.join(__dirname, 'pair-worker.js');

/**
 * The modules the wizard needs, and the exports it actually calls.
 *
 * Listing the exports rather than just the path means an upstream refactor that
 * keeps a file but renames a function is caught here, at boot, instead of as a
 * `TypeError: x is not a function` in the middle of someone's setup.
 */
const MODULES = {
  console: {
    file: 'bot/console/index.js',
    needs: ['mountConsole'],
  },
  catalog: {
    file: 'bot/console/env-catalog.js',
    needs: ['buildCatalog', 'knownKeys'],
  },
  // Loaded in its own right as well as through mountConsole, so that a console
  // that fails to mount still leaves the wizard able to save credentials.
  runtime: {
    file: 'bot/console/runtime.js',
    needs: ['createRuntime'],
  },
  validators: {
    file: 'bot/scripts/setup/validators.js',
    needs: ['validatorFor'],
  },
  doctor: {
    file: 'bot/scripts/setup/doctor.js',
    needs: ['defaultProbes', 'runDoctor'],
  },
  database: {
    file: 'bot/scripts/setup/db-setup.js',
    needs: ['inspectDatabase', 'waitForExecSql', 'sqlEditorUrl', 'EXEC_SQL_DEFINITION'],
  },
  bootstrap: {
    file: 'infrastructure/scripts/bootstrap-db.js',
    needs: ['DatabaseBootstrapper'],
  },
};

/** Loaded once at boot; every route reads from here. */
const loaded = {};
const problems = [];

/**
 * Require one module from the checkout and confirm it still exports what we call.
 *
 * @param {string} name key in MODULES
 * @returns {object|null} the module, or null with a recorded problem
 */
function load(name) {
  const spec = MODULES[name];
  const absolute = path.join(APP_ROOT, spec.file);
  try {
    const mod = require(absolute);
    const missing = spec.needs.filter((key) => mod[key] === undefined);
    if (missing.length) {
      problems.push(`${spec.file} no longer exports: ${missing.join(', ')}`);
      return null;
    }
    return mod;
  } catch (error) {
    problems.push(`${spec.file} could not be loaded: ${error.message}`);
    return null;
  }
}

for (const name of Object.keys(MODULES)) {
  loaded[name] = load(name);
}

/**
 * Modules that make the wizard nicer but never gate a step.
 *
 * `sql-statements` lets the database screen show a real progress bar instead of a
 * rising count, by splitting the schema files the same way the bootstrapper does.
 * If it moves upstream the bar degrades to a count and nothing is recorded as a
 * problem, because nothing is actually wrong.
 */
const OPTIONAL_MODULES = {
  sqlStatements: 'infrastructure/scripts/sql-statements.js',
};

for (const [name, file] of Object.entries(OPTIONAL_MODULES)) {
  try {
    loaded[name] = require(path.join(APP_ROOT, file));
  } catch {
    loaded[name] = null;
  }
}

/**
 * WhatsApp pairing is never required into this process -- it drags in baileys,
 * pino and a global `console` hijack -- so it is checked on disk instead.
 * The worker requires it for real, in a child process that can be killed.
 */
function whatsappAvailable() {
  const linker = path.join(APP_ROOT, 'bot/scripts/setup/link-whatsapp.js');
  const baileys = path.join(APP_ROOT, 'bot/node_modules/baileys');
  if (!fs.existsSync(linker)) {
    problems.push('bot/scripts/setup/link-whatsapp.js is missing');
    return false;
  }
  if (!fs.existsSync(baileys)) {
    problems.push('baileys is not installed -- run Install again');
    return false;
  }
  return true;
}

/**
 * Express comes from the checkout on purpose.
 *
 * `mountConsole` builds its router with the express it resolves from
 * `bot/node_modules`. Handing that router to a router built by a *different*
 * copy of express is the kind of mismatch that fails in subtle ways, so this
 * launcher deliberately has no express dependency of its own.
 *
 * @returns {Function} the express module
 */
function loadExpress() {
  return require(path.join(APP_ROOT, 'bot/node_modules/express'));
}

/** What the wizard can offer, given what actually loaded. */
const capabilities = {
  console: Boolean(loaded.console),
  credentials: Boolean(loaded.catalog && loaded.validators && loaded.runtime),
  probes: Boolean(loaded.doctor),
  database: Boolean(loaded.database && loaded.bootstrap),
  whatsapp: whatsappAvailable(),
};

/** True when dependencies have been installed. */
function isInstalled() {
  return fs.existsSync(path.join(APP_ROOT, 'bot', 'node_modules'));
}

module.exports = {
  APP_ROOT,
  ENV_PATH,
  ENV_TEMPLATE_PATH,
  PAIR_WORKER,
  capabilities,
  problems,
  isInstalled,
  loadExpress,
  modules: loaded,
};
