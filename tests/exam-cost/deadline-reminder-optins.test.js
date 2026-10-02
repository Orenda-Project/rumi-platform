/**
 * deadline_reminder_optins — the opt-in list.
 *
 * Supabase is mocked at bot/shared/config/supabase (the pattern the coaching
 * and exam-checker suites use), so this asserts the query SHAPE: the table, the
 * columns, and the fetch → check → plain insert sequence the cross-agent-safety
 * skill requires instead of a chained update+filter+select.
 */

const mockState = {
  selectRows: [],
  selectError: null,
  insertError: null,
  deleteError: null,
  calls: [],
};

function mockSelectChain(table) {
  const record = { table, op: 'select', columns: null, filters: {} };
  mockState.calls.push(record);
  const chain = {
    select: (columns) => { record.columns = columns; return chain; },
    eq: (col, val) => { record.filters[col] = val; return chain; },
    then: (resolve, reject) =>
      Promise.resolve({ data: mockState.selectRows, error: mockState.selectError }).then(resolve, reject),
  };
  return chain;
}

function mockDeleteChain(table) {
  const record = { table, op: 'delete', filters: {} };
  mockState.calls.push(record);
  const chain = {
    eq: (col, val) => { record.filters[col] = val; return chain; },
    then: (resolve, reject) =>
      Promise.resolve({ data: null, error: mockState.deleteError }).then(resolve, reject),
  };
  return chain;
}

jest.mock('../../bot/shared/config/supabase', () => ({
  from: (table) => ({
    select: (columns) => mockSelectChain(table).select(columns),
    insert: (row) => {
      mockState.calls.push({ table, op: 'insert', row });
      return Promise.resolve({ data: null, error: mockState.insertError });
    },
    delete: () => mockDeleteChain(table),
  }),
}));

jest.mock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));

const DeadlineReminderService = require('../../bot/shared/services/deadline-reminder.service');

beforeEach(() => {
  mockState.selectRows = [];
  mockState.selectError = null;
  mockState.insertError = null;
  mockState.deleteError = null;
  mockState.calls = [];
});

describe('table + column contract', () => {
  it('uses the deadline_reminder_optins table', () => {
    expect(DeadlineReminderService.TABLE).toBe('deadline_reminder_optins');
  });

  it('only ever reads and writes phone + board_id', async () => {
    await DeadlineReminderService.optIn('923001234567', 'cambridge');
    await DeadlineReminderService.listAllOptIns();

    for (const call of mockState.calls) {
      expect(call.table).toBe('deadline_reminder_optins');
      if (call.op === 'select') expect(call.columns).toBe('phone, board_id');
      if (call.op === 'insert') expect(Object.keys(call.row).sort()).toEqual(['board_id', 'phone']);
    }
  });
});

describe('optIn', () => {
  it('checks first, then inserts a fresh row', async () => {
    const res = await DeadlineReminderService.optIn('923001234567', 'cambridge');

    expect(res).toEqual({ ok: true, already: false });
    expect(mockState.calls.map((c) => c.op)).toEqual(['select', 'insert']);
    expect(mockState.calls[0].filters).toEqual({ phone: '923001234567', board_id: 'cambridge' });
    expect(mockState.calls[1].row).toEqual({ phone: '923001234567', board_id: 'cambridge' });
  });

  it('is idempotent — an existing opt-in writes nothing', async () => {
    mockState.selectRows = [{ phone: '923001234567', board_id: 'cambridge' }];
    const res = await DeadlineReminderService.optIn('923001234567', 'cambridge');

    expect(res).toEqual({ ok: true, already: true });
    expect(mockState.calls.some((c) => c.op === 'insert')).toBe(false);
  });

  it('surfaces the real insert error instead of reporting success', async () => {
    mockState.insertError = { message: 'violates check constraint "x"' };
    const res = await DeadlineReminderService.optIn('923001234567', 'cambridge');

    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/check constraint/);
  });

  it('refuses a missing phone or board without touching the DB', async () => {
    expect(await DeadlineReminderService.optIn('', 'cambridge')).toEqual({
      ok: false, error: 'missing_phone_or_board',
    });
    expect(await DeadlineReminderService.optIn('923001234567', null)).toEqual({
      ok: false, error: 'missing_phone_or_board',
    });
    expect(mockState.calls).toHaveLength(0);
  });
});

describe('optOut', () => {
  it('clears every board for that phone by default', async () => {
    const res = await DeadlineReminderService.optOut('923001234567');

    expect(res).toEqual({ ok: true });
    expect(mockState.calls).toHaveLength(1);
    expect(mockState.calls[0].op).toBe('delete');
    expect(mockState.calls[0].filters).toEqual({ phone: '923001234567' });
  });

  it('narrows to one board when given one', async () => {
    await DeadlineReminderService.optOut('923001234567', 'cambridge');
    expect(mockState.calls[0].filters).toEqual({ phone: '923001234567', board_id: 'cambridge' });
  });

  it('reports a delete failure', async () => {
    mockState.deleteError = { message: 'permission denied' };
    expect((await DeadlineReminderService.optOut('923001234567')).ok).toBe(false);
  });

  it('refuses a missing phone', async () => {
    expect(await DeadlineReminderService.optOut('')).toEqual({ ok: false, error: 'missing_phone' });
  });
});

describe('reads', () => {
  it('lists the opt-ins for one board', async () => {
    mockState.selectRows = [{ phone: '923001234567', board_id: 'cambridge' }];
    const rows = await DeadlineReminderService.listOptIns('cambridge');

    expect(rows).toHaveLength(1);
    expect(mockState.calls[0].filters).toEqual({ board_id: 'cambridge' });
  });

  it('lists every opt-in with no filter, for the reminder run', async () => {
    mockState.selectRows = [
      { phone: '923001234567', board_id: 'cambridge' },
      { phone: '923005555555', board_id: 'bise-lahore' },
    ];
    expect(await DeadlineReminderService.listAllOptIns()).toHaveLength(2);
    expect(mockState.calls[0].filters).toEqual({});
  });

  it('degrades to an empty list on a read error rather than throwing', async () => {
    mockState.selectError = { message: 'relation does not exist' };
    expect(await DeadlineReminderService.listAllOptIns()).toEqual([]);
    expect(await DeadlineReminderService.listOptIns('cambridge')).toEqual([]);
    expect(await DeadlineReminderService.isOptedIn('923001234567', 'cambridge')).toBe(false);
  });
});
