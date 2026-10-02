/**
 * Cost Compass maths — fixture-driven.
 *
 * Every expectation is derived from bot/shared/data/exam-fees.json rather than
 * hardcoded, so dropping in the real dataset does not turn this suite red for
 * the wrong reason. The one hardcoded case is the `per` semantics arithmetic,
 * which IS the contract worth pinning.
 */

const path = require('path');
const ExamCostService = require('../../bot/shared/services/exam-cost.service');

// Every assertion below is about the ARITHMETIC, so it runs against the frozen
// 3-board fixture, never bot/shared/data/. The live files are a research
// artefact that gets refreshed (fees change every session, nulls appear and
// disappear); pinning maths to them would turn this suite red for the wrong
// reason. exam-cost-live-data.test.js is the suite that reads the real thing.
ExamCostService.useDataDir(path.join(__dirname, 'fixtures'));
afterAll(() => ExamCostService.resetDataDir());

const fees = ExamCostService.loadFees({ reload: true });
const cambridge = fees.boards.find((b) => b.id === 'cambridge');

describe('exam-cost service — datasets', () => {
  it('ships both datasets marked as fixtures', () => {
    expect(fees.as_of).toBe('FIXTURE');
    expect(ExamCostService.isFixture(fees)).toBe(true);
    expect(ExamCostService.isFixture(ExamCostService.loadDeadlines({ reload: true }))).toBe(true);
  });

  it('carries three boards, each with a source URL and a level list', () => {
    expect(fees.boards).toHaveLength(3);
    for (const board of fees.boards) {
      expect(board.source).toMatch(/^https?:\/\//);
      expect(board.levels.length).toBeGreaterThan(0);
      expect(Object.keys(board.per_subject_fee).length).toBeGreaterThan(0);
    }
  });

  it('every deadline names a board that exists in the fee dataset', () => {
    const ids = new Set(ExamCostService.boardIds());
    for (const d of ExamCostService.loadDeadlines().deadlines) {
      expect(ids.has(d.board)).toBe(true);
      expect(d.confidence).toMatch(/^(confirmed|estimated)$/);
    }
  });
});

describe('exam-cost service — resolvers', () => {
  it('resolves level spellings to the canonical key', () => {
    expect(ExamCostService.resolveLevel('o-level')).toBe('O Level');
    expect(ExamCostService.resolveLevel('O LEVEL')).toBe('O Level');
    expect(ExamCostService.resolveLevel('igcse')).toBe('IGCSE');
    expect(ExamCostService.resolveLevel('a level')).toBe('A Level');
    expect(ExamCostService.resolveLevel('nonsense')).toBeNull();
  });

  it('resolves board aliases and drops unknown names', () => {
    expect(ExamCostService.resolveBoardIds('cambridge, akueb')).toEqual(['cambridge', 'aku-eb']);
    expect(ExamCostService.resolveBoardIds(['CAIE'])).toEqual(['cambridge']);
    expect(ExamCostService.resolveBoardIds('hogwarts')).toEqual([]);
  });

  it('never reads a bare city name as a board (Lahore is a city here)', () => {
    expect(ExamCostService.resolveBoardIds('Lahore')).toEqual([]);
    expect(ExamCostService.resolveBoardIds('bise-lahore')).toEqual(['bise-lahore']);
  });

  it('de-duplicates repeated boards', () => {
    expect(ExamCostService.resolveBoardIds('cambridge,cie,caie')).toEqual(['cambridge']);
  });
});

describe('exam-cost service — estimate()', () => {
  it('itemises per-subject fees against the dataset', () => {
    const result = ExamCostService.estimate({ level: 'O Level', subjects: 6, boardIds: ['cambridge'] });
    const board = result.boards[0];
    const subjectLine = board.items[0];

    expect(subjectLine.amount).toBe(cambridge.per_subject_fee['O Level'] * 6);
    expect(subjectLine.per).toBe('subject');
    expect(board.items).toHaveLength(1 + cambridge.fixed_fees.length);
  });

  it('splits one-off "candidate" fees from recurring "session" fees', () => {
    const result = ExamCostService.estimate({ level: 'O Level', subjects: 6, boardIds: ['cambridge'] });
    const board = result.boards[0];

    const expectedOneOff = cambridge.fixed_fees
      .filter((f) => f.per === 'candidate')
      .reduce((s, f) => s + f.amount, 0);
    const expectedSession = cambridge.per_subject_fee['O Level'] * 6
      + cambridge.fixed_fees.filter((f) => f.per === 'session').reduce((s, f) => s + f.amount, 0);

    expect(board.oneOffTotal).toBe(expectedOneOff);
    expect(board.sessionTotal).toBe(expectedSession);
    expect(board.total).toBe(expectedSession + expectedOneOff);
  });

  it('charges recurring fees twice and one-off fees once in the 2-year total', () => {
    const result = ExamCostService.estimate({ level: 'O Level', subjects: 6, boardIds: ['cambridge'] });
    const board = result.boards[0];

    expect(ExamCostService.SESSIONS_PER_TWO_YEARS).toBe(2);
    expect(board.twoYearTotal).toBe(board.sessionTotal * 2 + board.oneOffTotal);
    // The distinction is load-bearing: a naive total × 2 would over-count.
    expect(board.twoYearTotal).toBeLessThan(board.total * 2);
  });

  it('adds the late-entry surcharge only when asked, priced per subject', () => {
    const plain = ExamCostService.estimate({ level: 'O Level', subjects: 4, boardIds: ['cambridge'] });
    const late = ExamCostService.estimate({
      level: 'O Level', subjects: 4, boardIds: ['cambridge'], includeLate: true,
    });
    const surcharge = cambridge.late_entry_surcharge;

    expect(surcharge.per).toBe('subject');
    expect(late.boards[0].total - plain.boards[0].total).toBe(surcharge.amount * 4);
    expect(late.includeLate).toBe(true);
  });

  it('compares every board when none is named', () => {
    const result = ExamCostService.estimate({ level: 'O Level', subjects: 3 });
    expect(result.boards.map((b) => b.id)).toEqual(ExamCostService.boardIds());
  });

  it('marks a board that does not offer the level as unsupported rather than costing it', () => {
    const result = ExamCostService.estimate({ level: 'IGCSE', subjects: 5 });
    const akueb = result.boards.find((b) => b.id === 'aku-eb');

    expect(akueb.supported).toBe(false);
    expect(akueb.reason).toBe('level_not_offered');
    expect(akueb.total).toBe(0);
  });

  it('flags city availability without changing the cost', () => {
    const karachi = ExamCostService.estimate({
      level: 'O Level', subjects: 2, boardIds: ['aku-eb', 'bise-lahore'], city: 'Karachi',
    });
    expect(karachi.boards.find((b) => b.id === 'aku-eb').cityAvailable).toBe(true);
    expect(karachi.boards.find((b) => b.id === 'bise-lahore').cityAvailable).toBe(false);

    const noCity = ExamCostService.estimate({ level: 'O Level', subjects: 2, boardIds: ['aku-eb'] });
    expect(noCity.boards[0].cityAvailable).toBeNull();
    expect(noCity.boards[0].total).toBe(karachi.boards.find((b) => b.id === 'aku-eb').total);
  });

  it('reports errors instead of throwing on bad input', () => {
    expect(ExamCostService.estimate({ level: 'B Level', subjects: 3 }).errors)
      .toContain('unknown_level:B Level');
    expect(ExamCostService.estimate({ level: 'O Level', subjects: 0 }).errors)
      .toContain('invalid_subjects:0');
    expect(ExamCostService.estimate({ level: 'O Level', subjects: 'six' }).errors[0])
      .toMatch(/^invalid_subjects/);
    expect(ExamCostService.estimate({}).errors.length).toBeGreaterThan(0);
  });

  it('propagates the fixture flag so callers can label the reply', () => {
    const result = ExamCostService.estimate({ level: 'O Level', subjects: 1 });
    expect(result.isFixture).toBe(true);
    expect(result.asOf).toBe('FIXTURE');
    expect(result.currency).toBe('PKR');
  });
});

describe('exam-cost service — nextDeadlines() urgency window', () => {
  // The fixture's soonest Cambridge deadline.
  const NORMAL = '2027-02-12';

  it('sorts soonest-first and drops anything already past', () => {
    const list = ExamCostService.nextDeadlines('cambridge', new Date('2027-03-01T00:00:00Z'));
    expect(list.every((d) => d.daysUntil >= 0)).toBe(true);
    expect(list.map((d) => d.date)).not.toContain(NORMAL);
    const days = list.map((d) => d.daysUntil);
    expect([...days].sort((a, b) => a - b)).toEqual(days);
  });

  it('flags urgent at exactly the 21-day boundary and not one day beyond', () => {
    expect(ExamCostService.URGENT_WINDOW_DAYS).toBe(21);

    const at21 = ExamCostService.nextDeadlines('cambridge', new Date('2027-01-22T00:00:00Z'))[0];
    expect(at21.date).toBe(NORMAL);
    expect(at21.daysUntil).toBe(21);
    expect(at21.urgent).toBe(true);

    const at22 = ExamCostService.nextDeadlines('cambridge', new Date('2027-01-21T00:00:00Z'))[0];
    expect(at22.daysUntil).toBe(22);
    expect(at22.urgent).toBe(false);
  });

  it('keeps a deadline falling today (daysUntil 0) and marks it urgent', () => {
    const today = ExamCostService.nextDeadlines('cambridge', new Date('2027-02-12T18:45:00Z'))[0];
    expect(today.date).toBe(NORMAL);
    expect(today.daysUntil).toBe(0);
    expect(today.urgent).toBe(true);
  });

  it('decides the window from `now`, so the same data reads differently on two days', () => {
    const early = ExamCostService.nextDeadlines('cambridge', new Date('2026-12-01T00:00:00Z'))[0];
    const late = ExamCostService.nextDeadlines('cambridge', new Date('2027-02-05T00:00:00Z'))[0];
    expect(early.urgent).toBe(false);
    expect(late.urgent).toBe(true);
    expect(early.date).toBe(late.date);
  });

  it('returns every board when no board is named', () => {
    const all = ExamCostService.nextDeadlines(null, new Date('2026-01-01T00:00:00Z'));
    expect(new Set(all.map((d) => d.board)).size).toBeGreaterThan(1);
    expect(ExamCostService.nextDeadlines('all', new Date('2026-01-01T00:00:00Z'))).toHaveLength(all.length);
  });

  it('accepts a board alias', () => {
    const viaAlias = ExamCostService.nextDeadlines('akueb', new Date('2026-01-01T00:00:00Z'));
    expect(viaAlias.length).toBeGreaterThan(0);
    expect(viaAlias.every((d) => d.board === 'aku-eb')).toBe(true);
  });
});

describe('exam-cost service — deadlinesDueForReminder()', () => {
  it('fires on exactly 14 and 3 days out, and on nothing in between', () => {
    expect(ExamCostService.REMINDER_LEAD_DAYS).toEqual([14, 3]);

    const at14 = ExamCostService.deadlinesDueForReminder('cambridge', new Date('2027-01-29T00:00:00Z'));
    expect(at14.map((d) => d.date)).toEqual(['2027-02-12']);

    const at3 = ExamCostService.deadlinesDueForReminder('cambridge', new Date('2027-02-09T00:00:00Z'));
    expect(at3.map((d) => d.date)).toEqual(['2027-02-12']);

    expect(ExamCostService.deadlinesDueForReminder('cambridge', new Date('2027-02-04T00:00:00Z')))
      .toEqual([]);
  });

  it('does not fire the day after the deadline passed', () => {
    expect(ExamCostService.deadlinesDueForReminder('cambridge', new Date('2027-02-13T00:00:00Z'))
      .some((d) => d.date === '2027-02-12')).toBe(false);
  });
});

describe('the honesty rules, against a deliberately holey fixture', () => {
  // The live dataset has these holes today and exam-cost-live-data.test.js
  // asserts against it — but if the research one day fills every gap, that
  // suite stops exercising these paths. This fixture pins them forever.
  const NULLS = path.join(__dirname, 'fixtures-nulls');

  beforeEach(() => ExamCostService.useDataDir(NULLS));
  afterEach(() => ExamCostService.useDataDir(path.join(__dirname, 'fixtures')));

  it('reports a null per_subject_fee as fee_not_published, never as 0', () => {
    const board = ExamCostService.estimate({
      level: 'A Level', subjects: 6, boardIds: ['cambridge'],
    }).boards[0];

    expect(board.supported).toBe(false);
    expect(board.reason).toBe('fee_not_published');
    expect(board.total).toBe(0);   // sentinel for callers
    expect(board.items).toEqual([]); // …but nothing to print as a price
  });

  it('surfaces the board notes, trimmed, so AKU-EB group pricing reaches the parent', () => {
    const board = ExamCostService.estimate({
      level: 'SSC-II', subjects: 6, boardIds: ['aku-eb'],
    }).boards[0];

    expect(board.reason).toBe('fee_not_published');
    // Money-first excerpt: the group prices, not the provenance paragraph.
    expect(board.notes).toContain('SSC-II Humanities PKR 31,500');
    expect(board.notes).toContain('Science PKR 34,800');
    expect(board.notes.length).toBeLessThanOrEqual(ExamCostService.NOTES_CHARS + 2);
    // Leading ellipsis marks it as an excerpt from mid-note.
    expect(board.notes.startsWith('…')).toBe(true);
  });

  it('surfaces notes for a level the board does not list at all, too', () => {
    const board = ExamCostService.estimate({
      level: 'O Level', subjects: 6, boardIds: ['aku-eb'],
    }).boards[0];

    expect(board.reason).toBe('level_not_offered');
    expect(board.notes).toContain('SSC-II Humanities PKR 31,500');
  });

  it('only ranks and compares boards with a real number', () => {
    const result = ExamCostService.estimate({ level: 'O Level', subjects: 6 });

    expect(result.anyCostable).toBe(true);
    expect(result.boards.filter((b) => b.supported).map((b) => b.id)).toEqual(['cambridge']);

    const reply = ExamCostService.formatEstimateReply(result, 'en');
    // Costable board first, uncostable after, and no phantom price anywhere.
    expect(reply.indexOf('Cambridge')).toBeLessThan(reply.indexOf('AKU-EB'));
    expect(reply).not.toMatch(/PKR 0\b/);
  });

  it('reaches the buried group prices rather than the provenance paragraph', () => {
    const notes = ExamCostService.loadFees().boards.find((b) => b.id === 'aku-eb').notes;
    const excerpt = ExamCostService.notesExcerpt(notes);

    // The prices sit past the 200-char head window, behind the sourcing prose.
    expect(notes.indexOf('PKR 31,500')).toBeGreaterThan(ExamCostService.NOTES_CHARS);
    expect(excerpt).toContain('PKR 31,500');
    expect(excerpt.startsWith('…')).toBe(true);
  });

  it('notesExcerpt falls back to the head when a note carries no amount', () => {
    const plain = `${'word '.repeat(80)}no amounts here`;
    const excerpt = ExamCostService.notesExcerpt(plain);
    expect(excerpt.startsWith('word word')).toBe(true);
    expect(excerpt.endsWith('…')).toBe(true);
    expect(excerpt.length).toBeLessThanOrEqual(ExamCostService.NOTES_CHARS + 1);
  });

  it('notesExcerpt leaves a short note alone', () => {
    expect(ExamCostService.notesExcerpt('Fee is PKR 1,000.')).toBe('Fee is PKR 1,000.');
    expect(ExamCostService.notesExcerpt('')).toBe('');
    expect(ExamCostService.notesExcerpt(null)).toBe('');
  });

  it('skips a fixed fee with no published amount rather than counting it as 0', () => {
    const board = ExamCostService.estimate({
      level: 'O Level', subjects: 2, boardIds: ['cambridge'],
    }).boards[0];

    expect(board.items.some((i) => i.label === 'Unpublished centre charge')).toBe(false);
    expect(board.total).toBe(32920 * 2 + 12500);
  });

  it('states an unpublished late surcharge as a caveat instead of adding 0', () => {
    const plain = ExamCostService.estimate({
      level: 'O Level', subjects: 6, boardIds: ['cambridge'],
    }).boards[0];
    const late = ExamCostService.estimate({
      level: 'O Level', subjects: 6, boardIds: ['cambridge'], includeLate: true,
    }).boards[0];

    expect(late.total).toBe(plain.total);
    expect(late.lateSurchargeUnknown).toBe(true);
    expect(ExamCostService.formatEstimateReply(
      ExamCostService.estimate({
        level: 'O Level', subjects: 6, boardIds: ['cambridge'], includeLate: true,
      }), 'en',
    )).toContain('Late-entry surcharge amount not published');
  });

  it('says so plainly and points at the calculator when NO board has a number', () => {
    const result = ExamCostService.estimate({ level: 'SSC-II', subjects: 6 });
    expect(result.anyCostable).toBe(false);

    const reply = ExamCostService.formatEstimateReply(result, 'en');
    expect(reply).toContain('no honest total to give');
    expect(reply).toContain(ExamCostService.CALCULATOR_URL);
    expect(reply).not.toMatch(/PKR 0\b/);
    expect(reply).not.toMatch(/2-year total/);
  });

  it('does not offer the calculator when it DID have an answer', () => {
    const reply = ExamCostService.formatEstimateReply(
      ExamCostService.estimate({ level: 'O Level', subjects: 6 }), 'en',
    );
    expect(reply).not.toContain(ExamCostService.CALCULATOR_URL);
  });

  it('drops a null-dated deadline and tags an estimated one', () => {
    const all = ExamCostService.nextDeadlines(null, new Date('2026-09-09T00:00:00Z'));

    expect(all).toHaveLength(2);
    expect(all.every((d) => typeof d.date === 'string')).toBe(true);
    expect(all.map((d) => d.estimated)).toEqual([false, true]);

    const reply = ExamCostService.formatDeadlinesReply(all, 'en');
    expect(reply).toContain('(estimated)');
    expect(reply).not.toContain('Invalid Date');
    expect(reply).not.toContain('NaN');
  });

  it('renders a prose fee_impact as prose, never as a currency amount', () => {
    const all = ExamCostService.nextDeadlines('aku-eb', new Date('2026-09-09T00:00:00Z'));
    const reply = ExamCostService.formatDeadlinesReply(all, 'en');

    expect(reply).toContain('Late Penalty Stage 1 = PKR 10,000/candidate');
    expect(reply).not.toMatch(/\/subject if you miss it/);
  });

  it('understands the Pakistani level labels the live data introduced', () => {
    expect(ExamCostService.resolveLevel('ssc-ii')).toBe('SSC-II');
    expect(ExamCostService.resolveLevel('SSC II')).toBe('SSC-II');
    expect(ExamCostService.resolveLevel('hssc-ii')).toBe('HSSC-II');
    expect(ExamCostService.datasetLevels()).toEqual(['O Level', 'A Level', 'SSC-II', 'HSSC-II']);
  });

  it('does not label a dated real dataset as a fixture', () => {
    expect(ExamCostService.isFixture(ExamCostService.loadFees())).toBe(false);
    expect(ExamCostService.formatEstimateReply(
      ExamCostService.estimate({ level: 'O Level', subjects: 6 }), 'en',
    )).toContain('as_of 2026-09-09');
  });
});
