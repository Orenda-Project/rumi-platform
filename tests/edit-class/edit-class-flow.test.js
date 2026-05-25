/**
 * Edit-class flow — phone validation, the edit-class endpoint (roster CRUD),
 * and the pure edit-class trigger helper. Bot-only deps mocked for the
 * root-before-bot-ci test ordering.
 */

const fs = require('fs');
const path = require('path');

function makeSupabase(datasets) {
  const store = JSON.parse(JSON.stringify(datasets));
  function builder(table) {
    let rows = (store[table] || []).slice();
    const api = {
      select() { return api; },
      eq(k, v) { rows = rows.filter(r => String(r[k]) === String(v)); return api; },
      in(k, vs) { rows = rows.filter(r => vs.includes(r[k])); return api; },
      order() { return api; },
      maybeSingle() { return Promise.resolve({ data: rows[0] || null, error: null }); },
      single() { return Promise.resolve({ data: rows[0] || null, error: rows[0] ? null : { message: 'no rows' } }); },
      insert(payload) {
        const row = { id: `gen-${(store[table] || []).length + 1}`, ...payload };
        store[table] = store[table] || [];
        store[table].push(row);
        return { select() { return { single: () => Promise.resolve({ data: { id: row.id }, error: null }) }; }, then: (r) => r({ data: row, error: null }) };
      },
      update(patch) {
        const matched = [];
        const chain = {
          eq(k, v) { rows = rows.filter(r => String(r[k]) === String(v)); chain._apply(); return chain; },
          in(k, vs) { rows = rows.filter(r => vs.includes(r[k])); chain._apply(); return chain; },
          _apply() { rows.forEach(r => { Object.assign(r, patch); matched.push(r); }); },
          then(resolve) { return resolve({ data: null, error: null }); },
        };
        return chain;
      },
      then(resolve) { return resolve({ data: rows, error: null }); },
    };
    return api;
  }
  return { from: jest.fn((t) => builder(t)), __store: store };
}

// ── phone validation ──────────────────────────────────────────────────────
describe('phone-validation', () => {
  const ORIG = { ...process.env };
  afterEach(() => { process.env = { ...ORIG }; jest.resetModules(); });

  function load() {
    jest.resetModules();
    return require('../../bot/shared/utils/phone-validation').validateAndNormalizePhone;
  }

  it('accepts a clean E.164 number', () => {
    const v = load();
    expect(v('+14155550123')).toEqual({ valid: true, normalized: '+14155550123' });
  });

  it('prepends + to a bare international number', () => {
    const v = load();
    expect(v('14155550123').normalized).toBe('+14155550123');
  });

  it('rejects letters, empty, too-short, and blocked country codes', () => {
    const v = load();
    expect(v('').valid).toBe(false);
    expect(v('abc123').valid).toBe(false);
    expect(v('+12').valid).toBe(false);
    expect(v('+9810000000').valid).toBe(false); // Iran (blocked)
  });

  it('expands a local 0-prefixed number using DEFAULT_PHONE_COUNTRY_CODE', () => {
    process.env.DEFAULT_PHONE_COUNTRY_CODE = '44';
    const v = load();
    expect(v('07911123456').normalized).toBe('+447911123456');
  });
});

// ── edit-class endpoint ─────────────────────────────────────────────────────
describe('edit-class-endpoint', () => {
  let ep, supa;

  function load(students = [], lists = [{ id: 'L1', class_name: '5', section: 'A' }]) {
    jest.resetModules();
    delete process.env.DEFAULT_PHONE_COUNTRY_CODE;
    jest.doMock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
    supa = makeSupabase({ student_lists: lists, students });
    jest.doMock('../../bot/shared/config/supabase', () => supa);
    ep = require('../../bot/shared/routes/edit-class-endpoint');
  }

  it('INIT builds the ROSTER_VIEW', async () => {
    load([{ id: 's1', list_id: 'L1', student_name: 'A One', father_name: 'One', roll_number: 1, is_active: true }]);
    const res = await ep.handleEditClassInit('u1', 'u1:L1');
    expect(res.screen).toBe('ROSTER_VIEW');
    expect(res.data.class_info).toContain('5 - A');
    expect(res.data.has_students).toBe(true);
  });

  it('ROSTER_VIEW actions route to the right screens', async () => {
    load([{ id: 's1', list_id: 'L1', student_name: 'A', roll_number: 1, is_active: true }]);
    const ft = 'u1:L1';
    expect((await ep.handleEditClassDataExchange('u1', 'ROSTER_VIEW', { _action: 'add', _list_id: 'L1' }, ft)).screen).toBe('ADD_STUDENT');
    expect((await ep.handleEditClassDataExchange('u1', 'ROSTER_VIEW', { _action: 'edit', _list_id: 'L1' }, ft)).screen).toBe('SELECT_STUDENT_TO_EDIT');
    expect((await ep.handleEditClassDataExchange('u1', 'ROSTER_VIEW', { _action: 'remove', _list_id: 'L1' }, ft)).screen).toBe('REMOVE_STUDENTS');
    expect((await ep.handleEditClassDataExchange('u1', 'ROSTER_VIEW', { _action: 'done', _list_id: 'L1' }, ft)).screen).toBe('SUCCESS');
  });

  it('ADD_STUDENT inserts a student and self-loops', async () => {
    load([]);
    const res = await ep.handleEditClassDataExchange('u1', 'ADD_STUDENT', { _action: 'add', _list_id: 'L1', _class_display: '5 - A', first_name: 'Zara', last_name: 'Abdul', parent_phone: '+14155550123' }, 'u1:L1');
    expect(res.screen).toBe('ADD_STUDENT');
    expect(supa.__store.students.length).toBe(1);
    expect(supa.__store.students[0].student_name).toBe('Zara Abdul');
    expect(supa.__store.students[0].parent_phone).toBe('+14155550123');
  });

  it('ADD_STUDENT surfaces an invalid-phone error without inserting', async () => {
    load([]);
    const res = await ep.handleEditClassDataExchange('u1', 'ADD_STUDENT', { _action: 'add', _list_id: 'L1', first_name: 'Zara', parent_phone: 'abc' }, 'u1:L1');
    expect(res.screen).toBe('ADD_STUDENT');
    expect(res.data.error).toBeDefined();
    expect(supa.__store.students.length).toBe(0);
  });

  it('ADD_STUDENT requires a name', async () => {
    load([]);
    const res = await ep.handleEditClassDataExchange('u1', 'ADD_STUDENT', { _action: 'add', _list_id: 'L1', first_name: '' }, 'u1:L1');
    expect(res.data.error.message).toMatch(/name/i);
  });

  it('REMOVE_STUDENTS soft-deletes selected and forwards to SUCCESS', async () => {
    load([{ id: 's1', list_id: 'L1', student_name: 'A', roll_number: 1, is_active: true }]);
    const res = await ep.handleEditClassDataExchange('u1', 'REMOVE_STUDENTS', { _list_id: 'L1', students_to_remove: ['s1'] }, 'u1:L1');
    expect(res.screen).toBe('SUCCESS');
    expect(supa.__store.students[0].is_active).toBe(false);
  });

  it('EDIT_STUDENT pre-fills then updates', async () => {
    load([{ id: 's1', list_id: 'L1', student_name: 'Zara Abdul', father_name: 'Abdul', parent_phone: '+14155550123', roll_number: 1, is_active: true }]);
    const pre = await ep.handleEditClassDataExchange('u1', 'SELECT_STUDENT_TO_EDIT', { _list_id: 'L1', _student_id: 's1' }, 'u1:L1');
    expect(pre.screen).toBe('EDIT_STUDENT');
    expect(pre.data.form_init_values.first_name).toBe('Zara'); // derived
    const upd = await ep.handleEditClassDataExchange('u1', 'EDIT_STUDENT', { _list_id: 'L1', _student_id: 's1', first_name: 'Zahra', last_name: 'Abdul', parent_phone: '' }, 'u1:L1');
    expect(upd.screen).toBe('SUCCESS');
    expect(supa.__store.students[0].student_name).toBe('Zahra Abdul');
    expect(supa.__store.students[0].parent_phone).toBeNull(); // cleared
  });
});

// ── trigger helper ──────────────────────────────────────────────────────────
describe('detectEditClassIntent', () => {
  const { detectEditClassIntent } = require('../../bot/shared/handlers/edit-class-trigger');

  it('detects the keywords', () => {
    for (const m of ['edit class', 'I want to edit class now', 'remove student', '/editclass', 'manage class']) {
      expect(detectEditClassIntent(m).detected).toBe(true);
    }
  });

  it('does not fire on unrelated text or empty input', () => {
    expect(detectEditClassIntent('what is the weather').detected).toBe(false);
    expect(detectEditClassIntent('').detected).toBe(false);
    expect(detectEditClassIntent(null).detected).toBe(false);
  });
});

// ── flow JSON + leak gate ─────────────────────────────────────────────────────
describe('edit-class-flow.json', () => {
  const flowPath = path.join(__dirname, '../../docs/flows/edit-class-flow.json');

  it('is valid JSON with the expected forward-only routing', () => {
    const flow = JSON.parse(fs.readFileSync(flowPath, 'utf8'));
    expect(flow.routing_model.ROSTER_VIEW).toContain('ADD_STUDENT');
    expect(flow.routing_model.SELECT_STUDENT_TO_EDIT).toEqual(['EDIT_STUDENT']);
    expect(flow.routing_model.EDIT_STUDENT).toEqual(['SUCCESS']);
  });

  it('is leak-free (no internal phone/name/path/bead tokens)', () => {
    const files = [
      flowPath,
      path.join(__dirname, '../../bot/shared/routes/edit-class-endpoint.js'),
      path.join(__dirname, '../../bot/shared/utils/phone-validation.js'),
      path.join(__dirname, '../../bot/shared/handlers/edit-class-trigger.js'),
    ];
    for (const f of files) {
      const raw = fs.readFileSync(f, 'utf8');
      for (const banned of ['+92', '+255', '0329', '5012345', 'Taleemabad', 'Rawalpindi', 'TaleemHub', 'bd-', 'PROJ-', 'Silverleaf']) {
        expect(raw).not.toContain(banned);
      }
    }
  });
});
