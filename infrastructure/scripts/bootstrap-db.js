const fs = require('fs');
const path = require('path');
const { splitSqlStatements, isOptionalStatement } = require('./sql-statements');
const { EXEC_SQL_SQL, describeExecSqlFailure } = require('./exec-sql-helper');

/**
 * DatabaseBootstrapper — one-command fresh-install of the Rumi schema.
 *
 * Applies, in order, the three canonical SQL files against a Supabase database:
 *   1. 00_complete-schema.sql  (tables, functions, triggers, column reconcile)
 *   2. 01_rls-policies.sql     (row-level security)
 *   3. 02_seed-data.sql        (reference data + region_features default)
 *
 * Every file is idempotent (CREATE … IF NOT EXISTS / CREATE OR REPLACE /
 * ON CONFLICT DO NOTHING), so re-running bootstrap on an existing DB is safe.
 *
 * SQL execution uses the same `exec_sql` RPC as migrate.js:
 *   CREATE OR REPLACE FUNCTION exec_sql(query TEXT)
 *   RETURNS VOID AS $$ BEGIN EXECUTE query; END; $$ LANGUAGE plpgsql;
 *
 * Stops at the first failure — RLS and seed must not run against a schema that
 * didn't apply.
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
   * @param {Function} [config.execSql]  - async (sql, label) => void; injectable for tests
   */
  constructor({ supabaseUrl, supabaseKey, schemaDir, execSql } = {}) {
    this.supabaseUrl = supabaseUrl;
    this.supabaseKey = supabaseKey;
    this.schemaDir = schemaDir;
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

  async applyFile(filename) {
    const filePath = path.join(this.schemaDir, filename);
    if (!fs.existsSync(filePath)) {
      throw new Error(`SQL file not found: ${filePath}`);
    }
    const sql = fs.readFileSync(filePath, 'utf-8');
    const statements = splitSqlStatements(sql);
    if (statements.length === 0) {
      throw new Error(`${filename}: no SQL statements found`);
    }
    console.log(`[bootstrap] Applying ${filename} (${statements.length} statements)...`);
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      try {
        await this.execSql(statement, `${filename}#${i + 1}`);
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
    console.log(`[bootstrap] Applied ${filename}.`);
  }

  /**
   * Apply the 3 files in order. Stops at the first error.
   * @returns {Promise<{applied: string[], errors: Array<{file, error}>}>}
   */
  async bootstrap() {
    const result = { applied: [], errors: [] };
    for (const filename of DatabaseBootstrapper.FILES) {
      try {
        await this.applyFile(filename);
        result.applied.push(filename);
      } catch (err) {
        console.error(`[bootstrap] Failed on ${filename}: ${err.message}`);
        result.errors.push({ file: filename, error: err.message });
        break; // do not run RLS / seed against a schema that didn't apply
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

function loadRepoEnv() {
  const repoRoot = path.resolve(__dirname, '../..');
  const envPath = path.join(repoRoot, '.env');
  
  // Manually load .env since dotenv isn't in this package's dependencies
  try {
    const fs = require('fs');
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
      const match = line.match(/^([^#=]+)=(.*)$/);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2].replace(/^["']|["']$/g, '');
      }
    });
  } catch {
    // .env might not exist yet
  }
}

// ── CLI entrypoint ──
if (require.main === module) {
  loadRepoEnv();
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
      console.log(`[bootstrap] Done. Applied ${result.applied.length}/${DatabaseBootstrapper.FILES.length} files.`);
      if (result.errors.length > 0) process.exit(1);
    })
    .catch((err) => {
      console.error('[bootstrap] Fatal error:', err.message);
      process.exit(1);
    });
}
