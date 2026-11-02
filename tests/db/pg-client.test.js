/**
 * The bundled-Postgres adapter against a real Postgres (embedded-postgres).
 *
 * Every case pins the shape supabase-js + PostgREST return for the same call:
 * { data, error, count, status }, ISO timestamp strings, numbers for numeric
 * columns, PostgREST error codes. The fixture tables copy the patterns the
 * bot uses (FKs to users, a two-FK table, to-many children, jsonb, text[]).
 */

const { Pool } = require('pg');
const { startEmbeddedPostgres } = require('../_helpers/embedded-pg');
const { createPgClient } = require('../../bot/shared/services/db/pg-adapter/pg-client');

const FIXTURE_SQL = `
  CREATE TABLE users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    phone_number text UNIQUE,
    first_name text,
    preferred_language text DEFAULT 'en',
    is_test_user boolean,
    tags text[],
    meta jsonb DEFAULT '{}'::jsonb,
    score numeric,
    visits bigint DEFAULT 0,
    created_at timestamptz DEFAULT now()
  );
  CREATE TABLE coaching_sessions (
    id serial PRIMARY KEY,
    user_id uuid REFERENCES users(id),
    observer_user_id uuid REFERENCES users(id),
    status text NOT NULL DEFAULT 'new',
    analysis_data jsonb
  );
  CREATE TABLE video_requests (
    id serial PRIMARY KEY,
    user_id uuid CONSTRAINT video_requests_user_id_fkey REFERENCES users(id),
    topic text
  );
  CREATE TABLE quizzes (id serial PRIMARY KEY, title text);
  CREATE TABLE quiz_questions (
    id serial PRIMARY KEY,
    quiz_id int REFERENCES quizzes(id),
    question_text text,
    position int
  );
  CREATE TABLE daily_stats (
    teacher_id uuid,
    date date,
    n int,
    PRIMARY KEY (teacher_id, date)
  );

  CREATE FUNCTION increment_visits(p_user_id uuid, p_by int) RETURNS bigint
    LANGUAGE sql AS $$
      UPDATE users SET visits = visits + p_by WHERE id = p_user_id RETURNING visits
    $$;
  CREATE FUNCTION users_by_language(p_lang text) RETURNS SETOF users
    LANGUAGE sql AS $$ SELECT * FROM users WHERE preferred_language = p_lang ORDER BY phone_number $$;
  CREATE FUNCTION session_counts(p_min int) RETURNS TABLE(user_id uuid, n int)
    LANGUAGE sql AS $$
      SELECT user_id, count(*)::int FROM coaching_sessions GROUP BY user_id HAVING count(*) >= p_min
    $$;
  CREATE TABLE user_profiles (
    id serial PRIMARY KEY,
    user_id uuid UNIQUE REFERENCES users(id),
    bio text
  );
  CREATE FUNCTION greet(p_name text DEFAULT 'teacher') RETURNS text
    LANGUAGE sql AS $$ SELECT 'hello ' || p_name $$;
  CREATE FUNCTION small_numbers() RETURNS SETOF int LANGUAGE sql AS $$ SELECT generate_series(1, 2) $$;
  CREATE FUNCTION do_nothing(p_note text) RETURNS void LANGUAGE sql AS $$ SELECT $$;
  CREATE FUNCTION fail_loudly() RETURNS int LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'boom' USING ERRCODE = 'P0001'; END $$;
`;

let server;
let pool;
let db;
const ids = {};

async function seed() {
  await pool.query('TRUNCATE users, coaching_sessions, video_requests, quizzes, quiz_questions, daily_stats, user_profiles RESTART IDENTITY CASCADE');
  const { rows } = await pool.query(`
    INSERT INTO users (phone_number, first_name, preferred_language, is_test_user, tags, meta, score, created_at) VALUES
      ('9230001', 'Ali',   'ur', false, ARRAY['math','science'], '{"sent_at":"2026-01-02","n":1}', 4.5, '2026-01-01T00:00:00Z'),
      ('9230002', 'Sara',  'en', NULL,  ARRAY['english'],        '{}',                            NULL, '2026-01-02T00:00:00Z'),
      ('9230003', 'Bilal', 'ur', true,  NULL,                    '{"sent_at":null}',              2,    '2026-01-03T00:00:00Z')
    RETURNING id, phone_number`);
  rows.forEach((r) => { ids[r.phone_number] = r.id; });
  await pool.query(`
    INSERT INTO coaching_sessions (user_id, observer_user_id, status, analysis_data) VALUES
      ($1, NULL, 'completed', '{"teacher_delivery":{"status":"sent"}}'),
      ($1, $2,   'conducting_conversation', '{"teacher_delivery":{}}'),
      ($2, NULL, 'error', NULL),
      (NULL, NULL, 'new', NULL)`, [ids['9230001'], ids['9230002']]);
  await pool.query(`INSERT INTO video_requests (user_id, topic) VALUES ($1, 'fractions')`, [ids['9230002']]);
  await pool.query(`INSERT INTO quizzes (title) VALUES ('Q1'), ('Empty quiz')`);
  await pool.query(`INSERT INTO quiz_questions (quiz_id, question_text, position) VALUES (1, 'a?', 1), (1, 'b?', 2)`);
}

beforeAll(async () => {
  server = await startEmbeddedPostgres();
  pool = new Pool({ connectionString: server.url, max: 4 });
  // A connection still closing when Postgres stops at teardown reports an
  // error on the idle client; without a listener that crashes the suite.
  pool.on('error', () => {});
  await pool.query(FIXTURE_SQL);
  db = createPgClient(pool);
}, 90000);

afterAll(async () => {
  if (pool) await pool.end();
  if (server) await server.stop();
});

beforeEach(seed);

describe('select: response shape', () => {
  test('select * returns PostgREST-shaped JSON values', async () => {
    const res = await db.from('users').select('*').eq('phone_number', '9230001');
    expect(res.error).toBeNull();
    expect(res.status).toBe(200);
    expect(res.count).toBeNull();
    const [row] = res.data;
    expect(row).toMatchObject({
      phone_number: '9230001',
      first_name: 'Ali',
      is_test_user: false,
      tags: ['math', 'science'],
      meta: { sent_at: '2026-01-02', n: 1 },
      score: 4.5,
      visits: 0,
      created_at: '2026-01-01T00:00:00+00:00',
    });
  });

  test('column subset keeps the requested order', async () => {
    const { data } = await db.from('users').select('first_name, phone_number').eq('first_name', 'Sara');
    expect(Object.keys(data[0])).toEqual(['first_name', 'phone_number']);
  });

  test('builder is mutated in place, like supabase-js', async () => {
    const query = db.from('users').select('phone_number');
    query.eq('first_name', 'Bilal');
    const { data } = await query;
    expect(data).toEqual([{ phone_number: '9230003' }]);
  });

  test('aliased JSON-path select', async () => {
    const { data } = await db
      .from('coaching_sessions')
      .select('id, delivery:analysis_data->teacher_delivery->>status')
      .eq('id', 1);
    expect(data).toEqual([{ id: 1, delivery: 'sent' }]);
  });

  test('cast in select', async () => {
    const { data } = await db.from('users').select('score::text').eq('first_name', 'Ali');
    expect(data).toEqual([{ score: '4.5' }]);
  });
});

describe('filters', () => {
  const phones = (res) => res.data.map((r) => r.phone_number).sort();

  test('eq / neq / gt / gte / lt / lte', async () => {
    expect(phones(await db.from('users').select('phone_number').neq('first_name', 'Ali'))).toEqual(['9230002', '9230003']);
    expect(phones(await db.from('users').select('phone_number').gt('score', 2))).toEqual(['9230001']);
    expect(phones(await db.from('users').select('phone_number').gte('score', 2))).toEqual(['9230001', '9230003']);
    expect(phones(await db.from('users').select('phone_number').lt('created_at', '2026-01-02T00:00:00Z'))).toEqual(['9230001']);
    expect(phones(await db.from('users').select('phone_number').lte('created_at', '2026-01-02T00:00:00Z'))).toEqual(['9230001', '9230002']);
  });

  test('in with an array', async () => {
    expect(phones(await db.from('users').select('phone_number').in('first_name', ['Ali', 'Sara']))).toEqual(['9230001', '9230002']);
  });

  test('in with an empty array matches nothing', async () => {
    const { data, error } = await db.from('users').select('phone_number').in('first_name', []);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  test('is null / is true', async () => {
    expect(phones(await db.from('users').select('phone_number').is('is_test_user', null))).toEqual(['9230002']);
    expect(phones(await db.from('users').select('phone_number').is('is_test_user', true))).toEqual(['9230003']);
  });

  test('not is null', async () => {
    expect(phones(await db.from('users').select('phone_number').not('score', 'is', null))).toEqual(['9230001', '9230003']);
  });

  test('not in with a PostgREST list string and with an array', async () => {
    const asString = await db.from('coaching_sessions').select('id').not('status', 'in', '("completed","error")');
    expect(asString.data.map((r) => r.id).sort()).toEqual([2, 4]);
    const asArray = await db.from('coaching_sessions').select('id').not('status', 'in', ['completed', 'error']);
    expect(asArray.data.map((r) => r.id).sort()).toEqual([2, 4]);
  });

  test('like / ilike, with * as a % alias', async () => {
    expect(phones(await db.from('users').select('phone_number').like('phone_number', '923000%').ilike('first_name', '%LA%'))).toEqual(['9230003']);
    expect(phones(await db.from('users').select('phone_number').ilike('first_name', 'a*'))).toEqual(['9230001']);
  });

  test('contains on a text[] and on jsonb', async () => {
    expect(phones(await db.from('users').select('phone_number').contains('tags', ['math']))).toEqual(['9230001']);
    expect(phones(await db.from('users').select('phone_number').contains('meta', { n: 1 }))).toEqual(['9230001']);
  });

  test('JSON-path filters', async () => {
    expect(phones(await db.from('users').select('phone_number').eq('meta->>sent_at', '2026-01-02'))).toEqual(['9230001']);
    expect(phones(await db.from('users').select('phone_number').is('meta->>sent_at', null))).toEqual(['9230002', '9230003']);
    const { data } = await db.from('coaching_sessions').select('id').is('analysis_data->teacher_delivery->>status', null).not('analysis_data', 'is', null);
    expect(data).toEqual([{ id: 2 }]);
  });

  test('or() with a nested and() group', async () => {
    const res = await db.from('users').select('phone_number').or('is_test_user.is.null,and(score.gt.4,first_name.eq.Ali)');
    expect(phones(res)).toEqual(['9230001', '9230002']);
  });

  test('or() with ilike wildcards and a quoted value', async () => {
    expect(phones(await db.from('users').select('phone_number').or('first_name.ilike.%ar%,first_name.eq."Bilal"'))).toEqual(['9230002', '9230003']);
  });

  test('values are bound parameters, never spliced into SQL', async () => {
    const { data, error } = await db.from('users').select('id').eq('first_name', "x' OR '1'='1");
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  test('an unsafe column name is a PGRST100 error, not a throw', async () => {
    const res = await db.from('users').select('id').eq('first_name; drop table users', 'x');
    expect(res.data).toBeNull();
    expect(res.error).toMatchObject({ code: 'PGRST100' });
  });
});

describe('order, limit, range', () => {
  test('order desc then limit', async () => {
    const { data } = await db.from('users').select('first_name').order('created_at', { ascending: false }).limit(2);
    expect(data.map((r) => r.first_name)).toEqual(['Bilal', 'Sara']);
  });

  test('ascending puts nulls last by default; nullsFirst flips it', async () => {
    const last = await db.from('users').select('first_name').order('score');
    expect(last.data.map((r) => r.first_name)).toEqual(['Bilal', 'Ali', 'Sara']);
    const first = await db.from('users').select('first_name').order('score', { ascending: true, nullsFirst: true });
    expect(first.data.map((r) => r.first_name)).toEqual(['Sara', 'Bilal', 'Ali']);
  });

  test('multiple order calls apply in sequence', async () => {
    const { data } = await db.from('users').select('first_name').order('preferred_language').order('first_name', { ascending: false });
    expect(data.map((r) => r.first_name)).toEqual(['Sara', 'Bilal', 'Ali']);
  });

  test('range is inclusive', async () => {
    const { data } = await db.from('users').select('first_name').order('created_at').range(1, 2);
    expect(data.map((r) => r.first_name)).toEqual(['Sara', 'Bilal']);
  });
});

describe('single / maybeSingle', () => {
  test('single with one row returns the object', async () => {
    const { data, error } = await db.from('users').select('first_name').eq('phone_number', '9230002').single();
    expect(error).toBeNull();
    expect(data).toEqual({ first_name: 'Sara' });
  });

  test('single with zero rows is PGRST116', async () => {
    const { data, error, status } = await db.from('users').select('*').eq('phone_number', 'nope').single();
    expect(data).toBeNull();
    expect(status).toBe(406);
    expect(error).toMatchObject({ code: 'PGRST116', details: 'The result contains 0 rows' });
  });

  test('single with many rows is PGRST116', async () => {
    const { error } = await db.from('users').select('*').single();
    expect(error).toMatchObject({ code: 'PGRST116', details: 'The result contains 3 rows' });
  });

  test('maybeSingle: none → null, one → object, many → PGRST116', async () => {
    expect(await db.from('users').select('id').eq('phone_number', 'nope').maybeSingle()).toMatchObject({ data: null, error: null });
    expect((await db.from('users').select('first_name').eq('phone_number', '9230001').maybeSingle()).data).toEqual({ first_name: 'Ali' });
    expect((await db.from('users').select('id').maybeSingle()).error).toMatchObject({ code: 'PGRST116' });
  });
});

describe('count', () => {
  test('count exact + head returns only the count', async () => {
    const res = await db.from('users').select('*', { count: 'exact', head: true }).eq('preferred_language', 'ur');
    expect(res).toMatchObject({ data: null, error: null, count: 2 });
  });

  test('count ignores limit, data respects it', async () => {
    const res = await db.from('users').select('id', { count: 'exact' }).limit(1);
    expect(res.count).toBe(3);
    expect(res.data).toHaveLength(1);
  });
});

describe('embedded resources', () => {
  test('to-one embed is an object (null when the FK is null)', async () => {
    const { data } = await db.from('video_requests').select('topic, users(first_name)');
    expect(data).toEqual([{ topic: 'fractions', users: { first_name: 'Sara' } }]);
  });

  test('FK hint by constraint name', async () => {
    const { data } = await db.from('video_requests').select('*, users!video_requests_user_id_fkey(phone_number)');
    expect(data[0].users).toEqual({ phone_number: '9230002' });
  });

  test('two FKs to the same table without a hint is PGRST201', async () => {
    const { data, error } = await db.from('coaching_sessions').select('id, users(first_name)');
    expect(data).toBeNull();
    expect(error).toMatchObject({ code: 'PGRST201' });
  });

  test('FK hint by column name picks the relationship', async () => {
    const { data } = await db.from('coaching_sessions').select('id, users!user_id(first_name)').order('id');
    expect(data.map((r) => r.users && r.users.first_name)).toEqual(['Ali', 'Ali', 'Sara', null]);
  });

  test('!inner drops parents without a match', async () => {
    const { data } = await db
      .from('coaching_sessions')
      .select('id, users!user_id!inner(first_name)')
      .eq('status', 'conducting_conversation');
    expect(data).toEqual([{ id: 2, users: { first_name: 'Ali' } }]);
    const all = await db.from('coaching_sessions').select('id, users!user_id!inner(first_name)', { count: 'exact' });
    expect(all.count).toBe(3);
  });

  test('to-many embed is an array ([] when empty)', async () => {
    const { data } = await db.from('quizzes').select('title, quiz_questions(question_text)').order('id');
    expect(data[0].title).toBe('Q1');
    expect(data[0].quiz_questions.map((q) => q.question_text).sort()).toEqual(['a?', 'b?']);
    expect(data[1]).toEqual({ title: 'Empty quiz', quiz_questions: [] });
  });

  test('aliased embed with star, and nested embed back to the parent', async () => {
    const { data } = await db
      .from('quiz_questions')
      .select('question_text, quiz:quizzes(*, quiz_questions(position))')
      .eq('position', 1);
    expect(data[0].quiz).toMatchObject({ id: 1, title: 'Q1' });
    expect(data[0].quiz.quiz_questions).toHaveLength(2);
  });

  test('unknown relationship is PGRST200', async () => {
    const { error } = await db.from('quizzes').select('id, users(id)');
    expect(error).toMatchObject({ code: 'PGRST200' });
  });
});

describe('writes', () => {
  test('insert without select returns data null and status 201', async () => {
    const res = await db.from('quizzes').insert({ title: 'New' });
    expect(res).toMatchObject({ data: null, error: null, status: 201 });
  });

  test('insert().select().single() returns the row with defaults filled in', async () => {
    const { data, error } = await db
      .from('users')
      .insert({ phone_number: '9230009', tags: ['a', 'b'], meta: { list: [1, 2] } })
      .select()
      .single();
    expect(error).toBeNull();
    expect(data).toMatchObject({ phone_number: '9230009', preferred_language: 'en', visits: 0, tags: ['a', 'b'], meta: { list: [1, 2] } });
    expect(typeof data.id).toBe('string');
  });

  test('bulk insert takes the union of keys; missing keys become null', async () => {
    const { data } = await db
      .from('users')
      .insert([{ phone_number: '1', first_name: 'A' }, { phone_number: '2', preferred_language: 'ur' }])
      .select('phone_number, first_name, preferred_language');
    expect(data).toEqual([
      { phone_number: '1', first_name: 'A', preferred_language: null },
      { phone_number: '2', first_name: null, preferred_language: 'ur' },
    ]);
  });

  test('duplicate key is a 23505 error with the Postgres message', async () => {
    const { data, error, status } = await db.from('users').insert({ phone_number: '9230001' });
    expect(data).toBeNull();
    expect(status).toBe(409);
    expect(error).toMatchObject({ code: '23505' });
    expect(error.message).toMatch(/duplicate key/);
  });

  test('unknown column is a 42703 error', async () => {
    const { error } = await db.from('users').select('id, not_a_column');
    expect(error).toMatchObject({ code: '42703' });
  });

  test('update with filters, select and count', async () => {
    const res = await db
      .from('users')
      .update({ preferred_language: 'en', meta: { reset: true } }, { count: 'exact' })
      .eq('preferred_language', 'ur')
      .select('phone_number, meta');
    expect(res.error).toBeNull();
    expect(res.count).toBe(2);
    expect(res.data.map((r) => r.meta)).toEqual([{ reset: true }, { reset: true }]);
  });

  test('update().eq().single() on no rows is PGRST116', async () => {
    const { error } = await db.from('users').update({ first_name: 'x' }).eq('phone_number', 'nope').select().single();
    expect(error).toMatchObject({ code: 'PGRST116' });
  });

  test('upsert on the primary key updates the existing row', async () => {
    const { data } = await db.from('users').upsert({ id: ids['9230001'], first_name: 'Ali Khan' }).select('first_name, phone_number');
    expect(data).toEqual([{ first_name: 'Ali Khan', phone_number: '9230001' }]);
  });

  test('upsert with a composite onConflict', async () => {
    const row = { teacher_id: ids['9230001'], date: '2026-01-05', n: 1 };
    await db.from('daily_stats').upsert(row, { onConflict: 'teacher_id,date' });
    await db.from('daily_stats').upsert({ ...row, n: 7 }, { onConflict: 'teacher_id,date' });
    const { data } = await db.from('daily_stats').select('date, n');
    expect(data).toEqual([{ date: '2026-01-05', n: 7 }]);
  });

  test('upsert with ignoreDuplicates leaves the row alone', async () => {
    await db.from('users').upsert({ phone_number: '9230002', first_name: 'Changed' }, { onConflict: 'phone_number', ignoreDuplicates: true });
    const { data } = await db.from('users').select('first_name').eq('phone_number', '9230002').single();
    expect(data.first_name).toBe('Sara');
  });

  test('delete with a filter returns the deleted rows when selected', async () => {
    const { data } = await db.from('quiz_questions').delete().eq('quiz_id', 1).select('position').order('position');
    expect(data).toEqual([{ position: 1 }, { position: 2 }]);
    const { count } = await db.from('quiz_questions').select('*', { count: 'exact', head: true });
    expect(count).toBe(0);
  });
});

describe('rpc', () => {
  test('scalar function returns the bare value', async () => {
    const { data, error } = await db.rpc('increment_visits', { p_user_id: ids['9230001'], p_by: 3 });
    expect(error).toBeNull();
    expect(data).toBe(3);
  });

  test('setof function returns rows', async () => {
    const { data } = await db.rpc('users_by_language', { p_lang: 'ur' });
    expect(data.map((r) => r.first_name)).toEqual(['Ali', 'Bilal']);
  });

  test('returns table function returns rows', async () => {
    const { data } = await db.rpc('session_counts', { p_min: 2 });
    expect(data).toEqual([{ user_id: ids['9230001'], n: 2 }]);
  });

  test('void function returns null', async () => {
    expect(await db.rpc('do_nothing', { p_note: 'x' })).toMatchObject({ data: null, error: null });
  });

  test('a raised exception comes back as an error object', async () => {
    const { data, error } = await db.rpc('fail_loudly');
    expect(data).toBeNull();
    expect(error).toMatchObject({ code: 'P0001', message: 'boom' });
  });

  test('unknown function is PGRST202', async () => {
    const { error } = await db.rpc('no_such_function', {});
    expect(error).toMatchObject({ code: 'PGRST202' });
  });
});

describe('connection failures', () => {
  test('come back as an error object instead of throwing, without a stack trace', async () => {
    const deadPool = new Pool({ connectionString: 'postgres://postgres:x@127.0.0.1:1/postgres', connectionTimeoutMillis: 2000 });
    const res = await createPgClient(deadPool).from('users').select('id');
    await deadPool.end();
    expect(res.data).toBeNull();
    expect(res.error.message).toBeTruthy();
    expect(res.error.details).toBeNull();
  });
});

describe('review fixes: parity with supabase-js / PostgREST', () => {
  test('undefined payload values are dropped, like JSON.stringify in supabase-js', async () => {
    await db.from('users').update({ first_name: 'Ali K', preferred_language: undefined }).eq('phone_number', '9230001');
    const { data } = await db.from('users').select('first_name, preferred_language').eq('phone_number', '9230001').single();
    expect(data).toEqual({ first_name: 'Ali K', preferred_language: 'ur' });

    const inserted = await db.from('users').insert({ phone_number: '9230050', preferred_language: undefined }).select('preferred_language').single();
    expect(inserted.data).toEqual({ preferred_language: 'en' });
  });

  test('a write with .single() that hits several rows is rolled back', async () => {
    const { error } = await db.from('users').update({ first_name: 'Same' }).eq('preferred_language', 'ur').select().single();
    expect(error).toMatchObject({ code: 'PGRST116' });
    const { count } = await db.from('users').select('*', { count: 'exact', head: true }).eq('first_name', 'Same');
    expect(count).toBe(0);
  });

  test('a write with .single() that hits one row is committed', async () => {
    const { data } = await db.from('users').update({ first_name: 'Solo' }).eq('phone_number', '9230002').select('first_name').single();
    expect(data).toEqual({ first_name: 'Solo' });
    const { count } = await db.from('users').select('*', { count: 'exact', head: true }).eq('first_name', 'Solo');
    expect(count).toBe(1);
  });

  test('an undefined rpc argument is left out, so the function default applies', async () => {
    expect((await db.rpc('greet', { p_name: undefined })).data).toBe('hello teacher');
    expect((await db.rpc('greet', { p_name: 'Ali' })).data).toBe('hello Ali');
  });

  test('setof scalar rpc returns bare values', async () => {
    expect((await db.rpc('small_numbers')).data).toEqual([1, 2]);
  });

  test('embedding through a UNIQUE foreign key gives an object, not an array', async () => {
    await db.from('user_profiles').insert({ user_id: ids['9230001'], bio: 'hi' });
    const { data } = await db.from('users').select('phone_number, user_profiles(bio)').order('phone_number').limit(2);
    expect(data).toEqual([
      { phone_number: '9230001', user_profiles: { bio: 'hi' } },
      { phone_number: '9230002', user_profiles: null },
    ]);
  });

  test('casts are only allowed in select lists, not in filters or order', async () => {
    expect((await db.from('users').select('id').eq('score::text', '4.5')).error).toMatchObject({ code: 'PGRST100' });
    expect((await db.from('users').select('id').or('score::int.eq.4')).error).toMatchObject({ code: 'PGRST100' });
    expect((await db.from('users').select('id').order('score::text')).error).toMatchObject({ code: 'PGRST100' });
  });

  test('operator lookups ignore inherited object keys', async () => {
    expect((await db.from('users').select('id').is('score', 'constructor')).error).toMatchObject({ code: 'PGRST100' });
    expect((await db.from('users').select('id').filter('score', 'constructor', 1)).error).toMatchObject({ code: 'PGRST100' });
  });

  test('maxRows caps top-level reads like PostgREST max-rows; count is not capped', async () => {
    const capped = createPgClient(pool, { maxRows: 2 });
    const all = await capped.from('users').select('id', { count: 'exact' });
    expect(all.data).toHaveLength(2);
    expect(all.count).toBe(3);
    expect((await capped.from('users').select('id').limit(1)).data).toHaveLength(1);
    expect((await capped.from('users').select('id').limit(10)).data).toHaveLength(2);
  });
});
