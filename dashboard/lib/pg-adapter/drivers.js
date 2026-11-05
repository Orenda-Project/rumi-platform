/**
 * Which database driver to use, and the env vars it needs. Shared by the bot
 * (services/db), the dashboard (config/supabase.js) and the setup tooling.
 * Dependency-free, so `rumi doctor` and the root test suite can load it.
 *
 *   DB_DRIVER=bundled   → the Postgres Rumi runs itself (`npm run db:start`,
 *                         or `rumi start`), on RUMI_DB_HOST:RUMI_DB_PORT with
 *                         the password in RUMI_DB_PASSWORD
 *   DB_DRIVER=postgres  → any other Postgres via DATABASE_URL
 *                         (Railway, Neon, RDS, self-hosted)
 *   DB_DRIVER=supabase  → hosted Supabase via SUPABASE_URL + service-role key
 *
 * Unset: supabase when SUPABASE_URL is set (existing installs stay exactly as
 * they were), postgres when DATABASE_URL is set, otherwise bundled.
 */

const DRIVERS = {
  bundled: { requiredEnv: ['RUMI_DB_PASSWORD'] },
  postgres: { requiredEnv: ['DATABASE_URL'] },
  supabase: { requiredEnv: ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'] },
};

/**
 * Values Rumi treats as unset: the placeholders .env.template ships
 * (`https://your-project.supabase.co`, `CHANGEME-…`). A freshly copied
 * template must not count as a configured Supabase project.
 */
const PLACEHOLDER_RE = /^CHANGEME|your-project|your_|^YOUR_|^<.*>$/i;

/** @param {unknown} v @returns {boolean} a real, non-placeholder value */
const isSet = (v) => typeof v === 'string' && v.trim() !== '' && !PLACEHOLDER_RE.test(v.trim());

/** Where the bundled Postgres listens unless RUMI_DB_HOST / RUMI_DB_PORT say otherwise. */
const BUNDLED_DEFAULTS = { host: '127.0.0.1', port: 54329, user: 'postgres', database: 'postgres' };

/**
 * @param {NodeJS.ProcessEnv} env
 * @returns {'bundled'|'postgres'|'supabase'}
 */
function resolveDbDriver(env = process.env) {
  const explicit = String(env.DB_DRIVER || '').trim().toLowerCase();
  if (explicit) {
    if (!DRIVERS[explicit]) {
      throw new Error(`Unknown DB_DRIVER="${env.DB_DRIVER}". Valid values: ${Object.keys(DRIVERS).join(' | ')}.`);
    }
    return explicit;
  }
  if (isSet(env.SUPABASE_URL)) return 'supabase';
  if (isSet(env.DATABASE_URL)) return 'postgres';
  return 'bundled';
}

/** True for the drivers that talk to Postgres directly (through the pg adapter). */
const isDirectPostgres = (driver) => driver === 'bundled' || driver === 'postgres';

/**
 * @param {'bundled'|'postgres'|'supabase'} driver
 * @param {NodeJS.ProcessEnv} env
 * @returns {string[]} names of required env vars that are not set
 */
function missingDbEnv(driver, env = process.env) {
  return DRIVERS[driver].requiredEnv.filter((key) => !isSet(env[key]));
}

function intFromEnv(value, fallback) {
  const n = parseInt(String(value ?? '').trim(), 10);
  return Number.isInteger(n) && n >= 0 ? n : fallback;
}

/**
 * Host, port and password of the bundled Postgres.
 * @param {NodeJS.ProcessEnv} env
 */
function bundledDbSettings(env = process.env) {
  return {
    host: String(env.RUMI_DB_HOST || '').trim() || BUNDLED_DEFAULTS.host,
    port: intFromEnv(env.RUMI_DB_PORT, BUNDLED_DEFAULTS.port) || BUNDLED_DEFAULTS.port,
    user: BUNDLED_DEFAULTS.user,
    database: BUNDLED_DEFAULTS.database,
    password: env.RUMI_DB_PASSWORD || '',
  };
}

/**
 * `sslmode` the way every other Postgres tool reads it. The pg driver treats
 * sslmode=require as "verify the certificate", so a provider's connection
 * string (Supabase, RDS, …: `?sslmode=require`, meaning "encrypt") fails with
 * a self-signed-certificate error. uselibpqcompat=true restores the standard
 * meaning; verify-ca / verify-full still verify.
 * @param {string|undefined} url
 */
function withStandardSslMode(url) {
  if (!url || !/[?&]sslmode=/i.test(url) || /[?&]uselibpqcompat=/i.test(url)) return url;
  return `${url}&uselibpqcompat=true`;
}

/**
 * The connection string for a direct-Postgres driver: built from the bundled
 * settings, or DATABASE_URL (with standard sslmode handling).
 * @param {NodeJS.ProcessEnv} env
 * @returns {string|undefined}
 */
function databaseUrlFor(env = process.env) {
  if (resolveDbDriver(env) !== 'bundled') return withStandardSslMode(env.DATABASE_URL);
  const s = bundledDbSettings(env);
  return `postgres://${s.user}:${encodeURIComponent(s.password)}@${s.host}:${s.port}/${s.database}`;
}

const DEFAULT_POOL_MAX = 10;
const DEFAULT_MAX_ROWS = 1000; // hosted Supabase's default PostgREST max-rows
const DEFAULT_STATEMENT_TIMEOUT_MS = 60000;
const CONNECT_TIMEOUT_MS = 10000;

/**
 * pg Pool settings for a direct-Postgres driver. Sessions run in UTC so
 * timestamps serialise as hosted Supabase does, statements are time-boxed,
 * and a connection attempt fails instead of waiting forever.
 * @param {NodeJS.ProcessEnv} env
 */
function postgresPoolConfig(env = process.env) {
  const statementTimeout = intFromEnv(env.DB_STATEMENT_TIMEOUT_MS, DEFAULT_STATEMENT_TIMEOUT_MS);
  return {
    connectionString: databaseUrlFor(env),
    max: intFromEnv(env.DB_POOL_MAX, DEFAULT_POOL_MAX) || DEFAULT_POOL_MAX,
    connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
    // A one-off script ends when its work is done, instead of waiting for
    // idle connections to time out; a server is kept alive by its listener.
    allowExitOnIdle: true,
    options: `-c TimeZone=UTC -c statement_timeout=${statementTimeout}`,
  };
}

/**
 * Row cap for reads (PostgREST max-rows). DB_MAX_ROWS=0 turns it off.
 * @param {NodeJS.ProcessEnv} env
 * @returns {number|null}
 */
function maxRowsFromEnv(env = process.env) {
  return intFromEnv(env.DB_MAX_ROWS, DEFAULT_MAX_ROWS) || null;
}

module.exports = {
  BUNDLED_DEFAULTS,
  DRIVERS,
  PLACEHOLDER_RE,
  isSet,
  bundledDbSettings,
  databaseUrlFor,
  isDirectPostgres,
  maxRowsFromEnv,
  missingDbEnv,
  postgresPoolConfig,
  resolveDbDriver,
};
