/**
 * The bundled-Postgres adapter against the real Rumi schema.
 *
 * 1. Every `.from('<table>').select('<literal>')` in shipped code is run
 *    (with limit 0) against the schema: each column, JSON path and embed
 *    (to-one, to-many, !inner, FK hints, aliases) must resolve — no
 *    PGRST200/201 ambiguity, no 42703 missing column.
 * 2. A few real call shapes run end to end with data.
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const { startEmbeddedPostgres } = require('../_helpers/embedded-pg');
const { applyRumiSchema } = require('../_helpers/apply-rumi-schema');
const { createPgClient } = require('../../bot/shared/services/db/pg-adapter/pg-client');

const ROOT = path.resolve(__dirname, '../..');
const SOURCE_DIRS = ['bot', 'dashboard', 'scripts'];
const SKIP_DIRS = new Set(['node_modules', 'vendor', 'tests', '__mocks__', 'portal-frontend']);
// The literal must be the whole argument (next char , or )), so selects
// built with `'a, ' + 'b'` are skipped rather than half-read.
const FROM_SELECT_RE = /\.from\(\s*['"]([a-z_0-9]+)['"]\s*\)\s*\.select\(\s*(['"`])((?:(?!\2)[\s\S])*)\2(?=\s*[,)])/g;

/**
 * Selects in shipped code that do not match the schema today. Hosted
 * Supabase (PostgREST) rejects them with the same code, so the adapter must
 * too; they are listed here so the suite stays green while they are fixed in
 * their own change. Remove an entry when its query is fixed — the test fails
 * if a listed select starts succeeding.
 */
const KNOWN_DRIFT = [
  { table: 'conversations', match: /^conversation_state$/, code: '42703', why: 'conversations has current_state, not conversation_state' },
  { table: 'users', match: /^grade, preferred_language$/, code: '42703', why: 'users has no grade column' },
  { table: 'quizzes', match: /lesson_plan_structured/, code: '42703', why: 'lesson_plan_structured is on coaching_sessions, not lesson_plans' },
  { table: 'byof_approval_log', match: /byof_plans\(id, summary/, code: '42703', why: 'byof_plans has no summary column' },
];

const knownDrift = ({ table, select }) => KNOWN_DRIFT.find((d) => d.table === table && d.match.test(select));

function jsFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (SKIP_DIRS.has(e.name)) return [];
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return jsFiles(full);
    return e.name.endsWith('.js') ? [full] : [];
  });
}

/** Unique [table, select] pairs from string-literal selects in shipped code. */
function shippedSelects() {
  const pairs = new Map();
  for (const file of SOURCE_DIRS.flatMap((d) => jsFiles(path.join(ROOT, d)))) {
    for (const [, table, , select] of fs.readFileSync(file, 'utf8').matchAll(FROM_SELECT_RE)) {
      if (select.includes('${')) continue;
      const normalized = select.replace(/\s+/g, ' ').trim();
      const key = `${table} :: ${normalized}`;
      if (!pairs.has(key)) pairs.set(key, { table, select: normalized, where: path.relative(ROOT, file) });
    }
  }
  return [...pairs.values()];
}

const SELECTS = shippedSelects();

let server;
let pool;
let db;

beforeAll(async () => {
  server = await startEmbeddedPostgres();
  pool = new Pool({ connectionString: server.url, max: 4 });
  // A connection still closing when Postgres stops at teardown reports an
  // error on the idle client; without a listener that crashes the suite.
  pool.on('error', () => {});
  await applyRumiSchema(pool);
  db = createPgClient(pool);
}, 120000);

afterAll(async () => {
  if (pool) await pool.end();
  if (server) await server.stop();
});

test('the scan found the shipped selects, embeds included', () => {
  expect(SELECTS.length).toBeGreaterThan(200);
  expect(SELECTS.filter((s) => s.select.includes('(')).length).toBeGreaterThan(15);
});

test.each(SELECTS.map((s) => [`${s.table}: ${s.select.slice(0, 80)}`, s]))('%s', async (_name, entry) => {
  const { error } = await db.from(entry.table).select(entry.select).limit(0);
  const drift = knownDrift(entry);
  if (drift) {
    expect(error).toMatchObject({ code: drift.code });
    return;
  }
  if (error) throw new Error(`${entry.where}: ${error.code} ${error.message}${error.details ? ` (${error.details})` : ''}`);
});

describe('real call shapes', () => {
  let userId;

  beforeAll(async () => {
    const { data, error } = await db
      .from('users')
      .insert({ phone_number: '920000000001', first_name: 'Test' })
      .select('id')
      .single();
    if (error) throw new Error(error.message);
    userId = data.id;
  });

  test('stale-session worker: coaching_sessions with users!inner', async () => {
    await db.from('coaching_sessions').insert({ user_id: userId, status: 'conducting_conversation' });
    const { data, error } = await db
      .from('coaching_sessions')
      .select('id, user_id, status, created_at, users!inner(first_name)')
      .eq('status', 'conducting_conversation')
      .order('created_at', { ascending: true });
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data[0].users).toEqual({ first_name: 'Test' });
  });

  test('telemetry: or() over a nullable boolean', async () => {
    const { count, error } = await db
      .from('users')
      .select('*', { count: 'exact', head: true })
      .or('is_test_user.is.null,is_test_user.eq.false');
    expect(error).toBeNull();
    expect(count).toBe(1);
  });

  test('a duplicate phone number is 23505', async () => {
    const { error } = await db.from('users').insert({ phone_number: '920000000001' });
    expect(error).toMatchObject({ code: '23505' });
  });

  test('the bot entry point (services/db, DB_DRIVER=postgres) reads through its own pool in UTC', async () => {
    const saved = { DB_DRIVER: process.env.DB_DRIVER, DATABASE_URL: process.env.DATABASE_URL };
    process.env.DB_DRIVER = 'postgres';
    process.env.DATABASE_URL = server.url;
    try {
      let botDb;
      jest.isolateModules(() => {
        botDb = require('../../bot/shared/config/supabase');
      });
      await botDb.from('users').update({ portal_last_login: '2026-03-04T05:06:07+05:00' }).eq('id', userId);
      const { data, error } = await botDb.from('users').select('phone_number, portal_last_login').eq('id', userId).single();
      await botDb.end();
      expect(error).toBeNull();
      expect(data).toEqual({ phone_number: '920000000001', portal_last_login: '2026-03-04T00:06:07+00:00' });
    } finally {
      Object.entries(saved).forEach(([k, v]) => {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      });
    }
  });

  test('acquire_assessment_lock rpc returns its table rows', async () => {
    const { data, error } = await db.rpc('acquire_assessment_lock', {
      p_assessment_id: '00000000-0000-0000-0000-000000000000',
      p_expected_status: 'pending',
    });
    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
    expect(data[0]).toHaveProperty('locked', false);
  });
});
