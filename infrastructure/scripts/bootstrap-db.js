const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { splitSqlStatements, isOptionalStatement } = require('./sql-statements');
const { EXEC_SQL_SQL, describeExecSqlFailure } = require('./exec-sql-helper');

/**
 * DatabaseBootstrapper — one-command fresh-install of the Rumi schema.
 *
 * Applies, in order, the three canonical SQL files against a Supabase database:
 *   1. 00_complete-schema.sql  (tables, functions, triggers, column reconcile)
 *   2. 01_rls-policies.sql     (row-level security)
 *   3. 02_seed-data.sql        (reference data + region_features default)
 * then every versioned migration in supabase/migrations (V*.sql, in version
 * order), recording each one in schema_versions as migrate.js does. A change
 * not yet folded into 00_complete-schema.sql still reaches a fresh install, and
 * migrate.js finds nothing pending on it afterwards.
 *
 * Every file is idempotent (CREATE … IF NOT EXISTS / CREATE OR REPLACE /
 * ON CONFLICT DO NOTHING), so re-running bootstrap on an existing DB is safe.
 *
 * SQL execution uses the same `exec_sql` RPC as migrate.js. Its one-time
 * definition (service_role only) is in exec-sql-helper.js.
 *
 * Stops at the first failure — RLS, seed and migrations must not run against a
 * schema that didn't apply, and a failed migration is not recorded.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run bootstrap:db
 */
class DatabaseBootstrapper {
  /**
   * @param {Object} config
   * @param {string} config.supabaseUrl
   * @param {string} config.supabaseKey  - service role key
   * @param {string} config.schemaDir    - dir holding the 3 SQL files
   * @param {string} [config.migrationsDir] - dir holding V*.sql (default <schemaDir>/migrations)
   * @param {Function} [config.execSql]  - async (sql, label) => void; injectable for tests
   */
  constructor({ supabaseUrl, supabaseKey, schemaDir, migrationsDir, execSql } = {}) {
    this.supabaseUrl = supabaseUrl;
    this.supabaseKey = supabaseKey;
    this.schemaDir = schemaDir;
    this.migrationsDir = migrationsDir || (schemaDir && path.join(schemaDir, 'migrations'));
    this.execSql = execSql || this._defaultExecSql.bind(this);
  }

  async _defaultExecSql(sql, label) {
    const url = `${this.supabaseUrl}/rest/v1/rpc/exec_sql`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        apikey: this.supabaseKey,
        Authorization: `Bearer ${this.supabaseKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ query: sql }),
    });
    if (!response.ok) {
      const errorText = await response.text();
      // Chicken-and-egg: a fresh Supabase project has no `exec_sql` RPC, so the very first
      // call 404s with "Could not find the function". Surface the exact one-time fix instead
      // of an opaque 404 (SETUP.md Step 2 documents this too).
      console.error(`[bootstrap-debug] ${label} failed:`);
      console.error(`  URL: ${url}`);
      console.error(`  Status: ${response.status}`);
      console.error(`  Body: ${errorText.slice(0, 300)}`);
      const hint = describeExecSqlFailure(response.status, errorText);
      if (hint) {
        throw new Error(`${label}: ${hint}`);
      }
      throw new Error(`${label}: ${response.status} - ${errorText}`);
    }
  }

  async applyFile(filename, { dir = this.schemaDir, label = filename } = {}) {
    const filePath = path.join(dir, filename);
    if (!fs.existsSync(filePath)) {
      throw new Error(`SQL file not found: ${filePath}`);
    }
    const sql = fs.readFileSync(filePath, 'utf-8');
    const statements = splitSqlStatements(sql);
    if (statements.length === 0) {
      throw new Error(`${filename}: no SQL statements found`);
    }
    console.log(`[bootstrap] Applying ${label} (${statements.length} statements)...`);
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      try {
        await this.execSql(statement, `${label}#${i + 1}`);
      } catch (err) {
        // pgvector is used by one optional column. A project that cannot
        // enable the extension must still get `users` and the rest of core.
        if (isOptionalStatement(statement)) {
          console.warn(`[bootstrap] Skipping optional statement in ${filename}: ${err.message}`);
          continue;
        }
        throw err;
      }
    }
    console.log(`[bootstrap] Applied ${label}.`);
    return sql;
  }

  /**
   * The versioned migrations, oldest first: V2.9.0 before V2.11.0, which a
   * plain string sort would get wrong.
   * @returns {string[]} filenames
   */
  migrationFiles() {
    if (!this.migrationsDir || !fs.existsSync(this.migrationsDir)) return [];
    const parts = (f) => f.match(/^V(\d+)\.(\d+)\.(\d+)__/).slice(1).map(Number);
    return fs.readdirSync(this.migrationsDir)
      .filter((f) => /^V\d+\.\d+\.\d+__.*\.sql$/.test(f))
      .sort((a, b) => {
        const [pa, pb] = [parts(a), parts(b)];
        return pa[0] - pb[0] || pa[1] - pb[1] || pa[2] - pb[2];
      });
  }

  /**
   * Apply one migration, statement by statement like the canonical files, then
   * record it in schema_versions the way migrate.js does (filename + sha256 in
   * the description; a version the migration already recorded is left alone).
   */
  async applyMigration(filename) {
    const label = `migrations/${filename}`;
    const sql = await this.applyFile(filename, { dir: this.migrationsDir, label });
    const version = filename.match(/^V(\d+\.\d+\.\d+)__/)[1];
    const checksum = crypto.createHash('sha256').update(sql).digest('hex');
    const quote = (s) => `'${String(s).replace(/'/g, "''")}'`;
    await this.execSql(
      `INSERT INTO schema_versions (version, description)\n`
      + `VALUES (${quote(version)}, ${quote(`${filename} (sha256 ${checksum})`)})\n`
      + 'ON CONFLICT (version) DO NOTHING',
      `${label}#record`
    );
  }

  /**
   * Apply the 3 files in order, then the migrations. Stops at the first error.
   * @returns {Promise<{applied: string[], migrations: string[], errors: Array<{file, error}>}>}
   */
  async bootstrap() {
    const result = { applied: [], migrations: [], errors: [] };
    for (const filename of DatabaseBootstrapper.FILES) {
      try {
        await this.applyFile(filename);
        result.applied.push(filename);
      } catch (err) {
        console.error(`[bootstrap] Failed on ${filename}: ${err.message}`);
        result.errors.push({ file: filename, error: err.message });
        return result; // do not run RLS / seed / migrations against a schema that didn't apply
      }
    }
    for (const filename of this.migrationFiles()) {
      try {
        await this.applyMigration(filename);
        result.migrations.push(filename);
      } catch (err) {
        console.error(`[bootstrap] Failed on migrations/${filename}: ${err.message}`);
        result.errors.push({ file: `migrations/${filename}`, error: err.message });
        break; // a later migration may build on this one
      }
    }
    return result;
  }
}

DatabaseBootstrapper.FILES = [
  '00_complete-schema.sql',
  '01_rls-policies.sql',
  '02_seed-data.sql',
];

module.exports = { DatabaseBootstrapper };

// ── CLI entrypoint ──
if (require.main === module) {
  // Manually load .env since dotenv isn't in this package's dependencies
  require('./repo-env').loadRepoEnv();
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[bootstrap] Missing required environment variables:');
    console.error('  SUPABASE_URL');
    console.error('  SUPABASE_SERVICE_ROLE_KEY');
    console.error('');
    console.error('Usage:');
    console.error('  SUPABASE_URL=https://xxx.supabase.co SUPABASE_SERVICE_ROLE_KEY=xxx npm run bootstrap:db');
    console.error('');
    console.error('Requires an exec_sql function in the DB. Paste this in the SQL Editor:');
    console.error(EXEC_SQL_SQL);
    process.exit(1);
  }

  const schemaDir = path.resolve(__dirname, '../supabase');
  const bootstrapper = new DatabaseBootstrapper({
    supabaseUrl: SUPABASE_URL,
    supabaseKey: SUPABASE_SERVICE_ROLE_KEY,
    schemaDir,
  });

  bootstrapper
    .bootstrap()
    .then((result) => {
      const migrationCount = bootstrapper.migrationFiles().length;
      console.log(`[bootstrap] Done. Applied ${result.applied.length}/${DatabaseBootstrapper.FILES.length} files`
        + ` and ${result.migrations.length}/${migrationCount} migrations.`);
      if (result.errors.length > 0) process.exit(1);
    })
    .catch((err) => {
      console.error('[bootstrap] Fatal error:', err.message);
      process.exit(1);
    });
}
