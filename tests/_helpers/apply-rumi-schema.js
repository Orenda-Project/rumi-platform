/**
 * Loads the real Rumi schema into a plain Postgres, in bootstrap order:
 * Supabase shim → 00 schema → 01 RLS → 02 seed → every V*.sql migration.
 *
 * pgvector is not in the bundled Postgres binaries; like the local stack, its
 * CREATE EXTENSION line is skipped and the shim's real[] stand-in is used.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const SUPABASE_DIR = path.join(ROOT, 'infrastructure/supabase');
const MIGRATIONS_DIR = path.join(SUPABASE_DIR, 'migrations');

const read = (file) => fs.readFileSync(file, 'utf8');

/** @param {import('pg').Pool} pool */
async function applyRumiSchema(pool) {
  const migrations = fs.readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^V\d+\.\d+\.\d+__.*\.sql$/.test(f))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((f) => path.join(MIGRATIONS_DIR, f));

  const files = [
    path.join(ROOT, 'infrastructure/local/supabase-shim.sql'),
    path.join(SUPABASE_DIR, '00_complete-schema.sql'),
    path.join(SUPABASE_DIR, '01_rls-policies.sql'),
    path.join(SUPABASE_DIR, '02_seed-data.sql'),
    ...migrations,
  ];
  for (const file of files) {
    const sql = read(file).replace(/^CREATE EXTENSION IF NOT EXISTS "vector"/m, '-- pgvector skipped:');
    try {
      await pool.query(sql);
    } catch (err) {
      throw new Error(`${path.relative(ROOT, file)}: ${err.message}`);
    }
  }
}

module.exports = { applyRumiSchema };
