/**
 * The AMA (Ask Me Anything) page, /observability/ama, and its JSON + SSE routes.
 *
 * The routes called conversation-storage methods that the open-source
 * services/ama.service.js did not have, so every data call on the page
 * answered 500 ("AMAService.getConversations is not a function"). These tests
 * mount the real router (dashboard/routes/ama.routes.js) with the real service
 * on top of an in-memory stand-in for the Supabase client, holding fictional
 * rows, and drive it over HTTP.
 */

const fs = require('fs');
const http = require('http');
const path = require('path');
const { createRequire } = require('module');

const DASHBOARD = path.join(__dirname, '../../dashboard');
const dashboardRequire = createRequire(path.join(DASHBOARD, 'package.json'));
const HAVE_DASHBOARD_DEPS = fs.existsSync(path.join(DASHBOARD, 'node_modules', 'express'))
  && fs.existsSync(path.join(DASHBOARD, 'node_modules', 'ejs'));
const RUN = HAVE_DASHBOARD_DEPS || Boolean(process.env.CI);
const maybe = RUN ? describe : describe.skip;

const OWNER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const CONV_A = 'aaaaaaaa-0000-4000-8000-00000000000a';
const CONV_B = 'bbbbbbbb-0000-4000-8000-00000000000b';
const CONV_C = 'cccccccc-0000-4000-8000-00000000000c';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** uuid columns: like Postgres, comparing one with a non-UUID is an error that names the value. */
const UUID_COLUMNS = new Set(['id', 'user_id', 'conversation_id']);

/**
 * The subset of the supabase-js query builder the service uses, over
 * in-memory tables: from().select/insert/update/delete, eq/in/order/limit/range,
 * single/maybeSingle, awaited for { data, error }. Ids are uuid columns.
 */
function fakeSupabase(tables) {
  let nextId = 1;
  const calls = [];
  function from(table) {
    const q = { table, op: 'select', filters: [], orders: [], limit: null, range: null, values: null, single: null, count: null, error: null };
    calls.push(q);
    const rows = () => (tables[table] = tables[table] || []);
    const matches = (row) => q.filters.every(([col, test]) => test(row[col]));
    function run() {
      if (q.error) return { data: null, error: q.error };
      let data;
      if (q.op === 'insert') {
        const now = new Date().toISOString();
        data = q.values.map((v) => ({
          id: `00000000-0000-4000-8000-${String(nextId++).padStart(12, '0')}`, created_at: now, ...v,
        }));
        rows().push(...data);
      } else if (q.op === 'update') {
        data = rows().filter(matches);
        data.forEach((r) => Object.assign(r, q.values));
      } else if (q.op === 'delete') {
        data = rows().filter(matches);
        tables[table] = rows().filter((r) => !matches(r));
      } else {
        data = rows().filter(matches);
      }
      data = data.map((r) => ({ ...r }));
      for (const [col, asc] of [...q.orders].reverse()) {
        data.sort((a, b) => (a[col] < b[col] ? -1 : a[col] > b[col] ? 1 : 0) * (asc ? 1 : -1));
      }
      const count = data.length;
      if (q.range) data = data.slice(q.range[0], q.range[1] + 1);
      if (q.limit != null) data = data.slice(0, q.limit);
      if (q.single) {
        if (data.length !== 1 && q.single === 'single') return { data: null, error: { message: 'JSON object requested, multiple (or no) rows returned' } };
        return { data: data[0] || null, error: null };
      }
      return { data, error: null, count: q.count ? count : null };
    }
    const b = {
      select(cols, opts) { if (q.op === 'select') q.op = 'select'; if (opts && opts.count) q.count = opts.count; return b; },
      insert(values) { q.op = 'insert'; q.values = Array.isArray(values) ? values : [values]; return b; },
      update(values) { q.op = 'update'; q.values = values; return b; },
      delete() { q.op = 'delete'; return b; },
      eq(col, v) {
        if (UUID_COLUMNS.has(col) && typeof v === 'string' && !UUID.test(v)) {
          q.error = { code: '22P02', message: `invalid input syntax for type uuid: "${v}"` };
        }
        q.filters.push([col, (x) => x === v]);
        return b;
      },
      in(col, vs) { q.filters.push([col, (x) => vs.includes(x)]); return b; },
      order(col, opts) { q.orders.push([col, !opts || opts.ascending !== false]); return b; },
      limit(n) { q.limit = n; return b; },
      range(a, z) { q.range = [a, z]; return b; },
      single() { q.single = 'single'; return b; },
      maybeSingle() { q.single = 'maybe'; return b; },
      then(resolve, reject) { return Promise.resolve().then(run).then(resolve, reject); },
    };
    return b;
  }
  return { from, calls, tables };
}

function sampleTables() {
  return {
    dashboard_users: [
      { id: OWNER, username: 'sample.admin@example.com' },
      { id: OTHER, username: 'other.admin@example.com' },
    ],
    ama_conversations: [
      { id: CONV_A, user_id: OWNER, title: 'Weekly sign-ups', created_at: '2026-01-02T00:00:00Z', updated_at: '2026-01-03T00:00:00Z', message_count: 2, is_archived: false },
      { id: CONV_B, user_id: OWNER, title: 'Lesson plan counts', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-04T00:00:00Z', message_count: 0, is_archived: false },
      { id: CONV_C, user_id: OTHER, title: 'Someone else', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-05T00:00:00Z', message_count: 1, is_archived: false },
    ],
    ama_messages: [
      { id: 'm1', conversation_id: CONV_A, role: 'user', content: 'How many sign-ups this week?', created_at: '2026-01-03T00:00:00Z' },
      { id: 'm2', conversation_id: CONV_A, role: 'assistant', content: 'Forty-two.', sql_query: null, chart_type: null, query_result: null, chart_image_url: null, created_at: '2026-01-03T00:00:01Z' },
      { id: 'm3', conversation_id: CONV_C, role: 'user', content: 'Private question', created_at: '2026-01-05T00:00:00Z' },
    ],
  };
}

/** Express app as index.js wires it: CSP, body parsing, views, a session, the AMA router. */
function boot({ role = 'admin', userId = OWNER, tables = sampleTables() } = {}) {
  const express = dashboardRequire('express');
  const { adminCsp } = require('../../dashboard/lib/admin-csp');
  const { createAmaRouter } = require('../../dashboard/routes/ama.routes');
  const { createAmaService } = require('../../dashboard/services/ama.service');
  const supabase = fakeSupabase(tables);
  const app = express();
  app.use(adminCsp);
  app.use(express.json());
  app.set('view engine', 'ejs');
  app.set('views', path.join(DASHBOARD, 'views'));
  app.locals.safeJson = require('../../dashboard/lib/safe-json').safeJson;
  app.use((req, res, next) => {
    req.session = { isAuthenticated: true, userId, username: 'sample.admin@example.com', userRole: role };
    // What middleware/auth.js addUserToLocals gives every view.
    Object.assign(res.locals, {
      isAuthenticated: true, username: req.session.username, userId, userEmail: null,
      userByofRole: null, accessScope: null, userRole: role,
    });
    next();
  });
  const requireAuth = (req, res, next) => next();
  app.use('/observability', createAmaRouter({ requireAuth, service: createAmaService({ supabase }) }));
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => resolve({ server, supabase }));
  });
}

function request(server, method, urlPath, body) {
  const { port } = server.address();
  const payload = body === undefined ? null : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1', port, path: urlPath, method,
      headers: payload ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } : {},
    }, (res) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { text += c; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(text); } catch (e) { json = null; }
        resolve({ status: res.statusCode, headers: res.headers, text, json });
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

/** The SSE `data:` events of a response body. */
const events = (text) => text.split('\n').filter((l) => l.startsWith('data: ')).map((l) => JSON.parse(l.slice(6)));

describe('services/ama.service.js has what the AMA routes call', () => {
  test('exports the conversation-storage methods and processMessage', () => {
    const AMAService = require('../../dashboard/services/ama.service');
    for (const name of ['getConversations', 'getConversation', 'createConversation', 'getMessages', 'deleteConversation',
      'saveMessage', 'processMessage', 'generateTracerReport', 'getAllConversationsAdmin', 'getMessagesAdmin']) {
      expect([name, typeof AMAService[name]]).toEqual([name, 'function']);
    }
    // Still exported for anything that used them.
    expect(typeof AMAService.processAMAQuery).toBe('function');
    expect(typeof AMAService.getQuerySuggestions).toBe('function');
  });

  test('processMessage yields the feature-disabled message as text, then done', async () => {
    const AMAService = require('../../dashboard/services/ama.service');
    const chunks = [];
    for await (const c of AMAService.processMessage('How many sign-ups?', [], OWNER)) chunks.push(c);
    expect(chunks.map((c) => c.type)).toEqual(['text', 'done']);
    expect(chunks[0].content).toBe(AMAService.FEATURE_DISABLED_MESSAGE);
  });

  test('without a configured database the storage methods fail clearly', async () => {
    const { createAmaService } = require('../../dashboard/services/ama.service');
    const service = createAmaService({ supabase: null });
    await expect(service.getConversations(OWNER)).rejects.toThrow(/SUPABASE_URL/);
  });
});

maybe('AMA routes (dashboard/routes/ama.routes.js)', () => {
  let ctx;
  afterEach(() => { if (ctx) ctx.server.close(); ctx = null; });

  test('GET /observability/ama renders the page', async () => {
    ctx = await boot();
    const r = await request(ctx.server, 'GET', '/observability/ama');
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toMatch(/text\/html/);
    expect(r.text).toContain('/observability/ama/conversations');
  });

  test('GET /observability/ama/conversations lists only this user\'s conversations, newest first', async () => {
    ctx = await boot();
    const r = await request(ctx.server, 'GET', '/observability/ama/conversations');
    expect(r.status).toBe(200);
    expect(r.json.success).toBe(true);
    expect(r.json.conversations.map((c) => [c.id, c.title])).toEqual([
      [CONV_B, 'Lesson plan counts'],
      [CONV_A, 'Weekly sign-ups'],
    ]);
    expect(r.json.conversations[0].updated_at).toBe('2026-01-04T00:00:00Z');
  });

  test('POST /observability/ama/conversations creates one for this user', async () => {
    ctx = await boot();
    const r = await request(ctx.server, 'POST', '/observability/ama/conversations');
    expect(r.status).toBe(200);
    expect(r.json.success).toBe(true);
    expect(r.json.conversation.id).toBeTruthy();
    const row = ctx.supabase.tables.ama_conversations.find((c) => c.id === r.json.conversation.id);
    expect(row.user_id).toBe(OWNER);
  });

  test('GET .../conversations/:id/messages returns the messages in order; another user\'s is 404', async () => {
    ctx = await boot();
    const r = await request(ctx.server, 'GET', `/observability/ama/conversations/${CONV_A}/messages`);
    expect(r.status).toBe(200);
    expect(r.json.messages.map((m) => [m.role, m.content])).toEqual([
      ['user', 'How many sign-ups this week?'],
      ['assistant', 'Forty-two.'],
    ]);
    const other = await request(ctx.server, 'GET', `/observability/ama/conversations/${CONV_C}/messages`);
    expect(other.status).toBe(404);
    expect(other.text).not.toContain('Private question');
  });

  test('DELETE .../conversations/:id removes it and its messages; another user\'s is 404 and kept', async () => {
    ctx = await boot();
    const r = await request(ctx.server, 'DELETE', `/observability/ama/conversations/${CONV_A}`);
    expect(r.status).toBe(200);
    expect(r.json.success).toBe(true);
    const { tables } = ctx.supabase;
    expect(tables.ama_conversations.map((c) => c.id)).not.toContain(CONV_A);
    expect(tables.ama_messages.filter((m) => m.conversation_id === CONV_A)).toEqual([]);
    const other = await request(ctx.server, 'DELETE', `/observability/ama/conversations/${CONV_C}`);
    expect(other.status).toBe(404);
    expect(tables.ama_conversations.map((c) => c.id)).toContain(CONV_C);
  });

  test('POST /observability/ama/chat streams the feature-disabled message and saves both turns', async () => {
    ctx = await boot();
    const AMAService = require('../../dashboard/services/ama.service');
    const r = await request(ctx.server, 'POST', '/observability/ama/chat', { message: 'How many sign-ups?', conversationId: CONV_B });
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toMatch(/text\/event-stream/);
    const got = events(r.text);
    expect(got.map((e) => e.type)).toEqual(['text', 'done']);
    expect(got[0].content).toBe(AMAService.FEATURE_DISABLED_MESSAGE);
    const saved = ctx.supabase.tables.ama_messages.filter((m) => m.conversation_id === CONV_B);
    expect(saved.map((m) => [m.role, m.content])).toEqual([
      ['user', 'How many sign-ups?'],
      ['assistant', AMAService.FEATURE_DISABLED_MESSAGE],
    ]);
  });

  test('POST /observability/ama/chat: no message is 400; another user\'s conversation is 404 and nothing is saved', async () => {
    ctx = await boot();
    expect((await request(ctx.server, 'POST', '/observability/ama/chat', {})).status).toBe(400);
    const before = ctx.supabase.tables.ama_messages.length;
    const r = await request(ctx.server, 'POST', '/observability/ama/chat', { message: 'hi', conversationId: CONV_C });
    expect(r.status).toBe(404);
    expect(ctx.supabase.tables.ama_messages.length).toBe(before);
  });

  test('GET /observability/ama/tracer/:userId answers 501 feature-disabled, not 500', async () => {
    ctx = await boot();
    const r = await request(ctx.server, 'GET', `/observability/ama/tracer/${OTHER}`);
    expect(r.status).toBe(501);
    expect(r.json.success).toBe(false);
    expect(r.json.error).toMatch(/AMA/);
  });

  test('a malformed conversation id is a 404 with a generic body, never the database error', async () => {
    ctx = await boot({ role: 'super_admin' });
    const before = ctx.supabase.tables.ama_messages.length;
    const bad = 'not-a-uuid';
    const tries = [
      ['GET', `/observability/ama/conversations/${bad}/messages`],
      ['DELETE', `/observability/ama/conversations/${bad}`],
      ['POST', '/observability/ama/chat', { message: 'hi', conversationId: bad }],
      ['GET', `/observability/ama-chats/${bad}/messages`],
    ];
    for (const [method, url, body] of tries) {
      const r = await request(ctx.server, method, url, body);
      expect([method, url, r.status, r.json]).toEqual([method, url, 404, { success: false, error: 'Conversation not found' }]);
      expect(r.text).not.toMatch(/uuid|syntax|22P02/i);
    }
    expect(ctx.supabase.tables.ama_messages.length).toBe(before);
  });

  test('a storage failure is a 500 with the JSON error shape and a generic message', async () => {
    const express = dashboardRequire('express');
    const { createAmaRouter } = require('../../dashboard/routes/ama.routes');
    const { createAmaService } = require('../../dashboard/services/ama.service');
    const app = express();
    app.use((req, res, next) => { req.session = { userId: OWNER, userRole: 'admin' }; next(); });
    const broken = { from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ order: () => Promise.resolve({ data: null, error: { message: 'connection refused' } }) }) }) }) }) };
    app.use('/observability', createAmaRouter({ requireAuth: (q, s, n) => n(), service: createAmaService({ supabase: broken }) }));
    const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
    try {
      const r = await request(server, 'GET', '/observability/ama/conversations');
      expect(r.status).toBe(500);
      expect(r.json).toEqual({ success: false, error: 'Something went wrong. Please try again.' });
    } finally {
      server.close();
    }
  });

  describe('super admin view (/observability/ama-chats)', () => {
    test('page and data are 403 for other roles', async () => {
      ctx = await boot({ role: 'admin' });
      expect((await request(ctx.server, 'GET', '/observability/ama-chats')).status).toBe(403);
      expect((await request(ctx.server, 'GET', '/observability/ama-chats/conversations')).status).toBe(403);
      expect((await request(ctx.server, 'GET', `/observability/ama-chats/${CONV_C}/messages`)).status).toBe(403);
    });

    test('a super admin sees every conversation with its owner\'s username, and any conversation\'s messages', async () => {
      ctx = await boot({ role: 'super_admin' });
      expect((await request(ctx.server, 'GET', '/observability/ama-chats')).status).toBe(200);
      const list = await request(ctx.server, 'GET', '/observability/ama-chats/conversations');
      expect(list.status).toBe(200);
      expect(list.json.conversations.map((c) => [c.id, c.username])).toEqual([
        [CONV_C, 'other.admin@example.com'],
        [CONV_B, 'sample.admin@example.com'],
        [CONV_A, 'sample.admin@example.com'],
      ]);
      const msgs = await request(ctx.server, 'GET', `/observability/ama-chats/${CONV_C}/messages`);
      expect(msgs.status).toBe(200);
      expect(msgs.json.messages.map((m) => m.content)).toEqual(['Private question']);
    });
  });
});
