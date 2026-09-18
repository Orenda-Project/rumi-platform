/**
 * LIVE dataset guard — reads bot/shared/data/ exactly as production does.
 *
 * The other exam-cost suites run against the frozen fixture so a data refresh
 * cannot break the arithmetic tests. This suite is the opposite: it makes no
 * assertion about any particular fee, and instead proves the real compiled
 * files still satisfy the contract the service depends on.
 *
 * It exists because the real data is FULL of holes — British Council publishes
 * private-candidate fees only behind a login, three BISE boards publish nothing
 * machine-readable, and AKU-EB does not charge per subject at all. The failure
 * mode this locks out is a null being quietly costed as PKR 0 and shown to a
 * parent as a price.
 */

const path = require('path');
const fs = require('fs');
const ExamCostService = require('../../bot/shared/services/exam-cost.service');

// Explicitly the shipped default, ignoring any EXAM_COST_DATA_DIR in the env.
const LIVE_DIR = ExamCostService.DEFAULT_DATA_DIR;

beforeAll(() => ExamCostService.useDataDir(LIVE_DIR));
afterAll(() => ExamCostService.resetDataDir());

const fees = JSON.parse(fs.readFileSync(path.join(LIVE_DIR, 'exam-fees.json'), 'utf8'));
const deadlines = JSON.parse(fs.readFileSync(path.join(LIVE_DIR, 'exam-deadlines.json'), 'utf8'));

describe('live datasets parse and carry the required shape', () => {
  it('both files are valid JSON with a top-level as_of', () => {
    expect(typeof fees.as_of).toBe('string');
    expect(typeof deadlines.as_of).toBe('string');
    expect(fees.currency).toBe('PKR');
  });

  it('every board has an id and a name', () => {
    expect(Array.isArray(fees.boards)).toBe(true);
    expect(fees.boards.length).toBeGreaterThan(0);
    for (const board of fees.boards) {
      expect(typeof board.id).toBe('string');
      expect(board.id.length).toBeGreaterThan(0);
      expect(typeof board.name).toBe('string');
      expect(board.name.length).toBeGreaterThan(0);
    }
  });

  it('board ids are unique and all resolvable', () => {
    const ids = fees.boards.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ExamCostService.resolveBoardIds(ids)).toEqual(ids);
  });

  it('every board lists at least one level, and every level resolves', () => {
    for (const board of fees.boards) {
      expect(Array.isArray(board.levels)).toBe(true);
      expect(board.levels.length).toBeGreaterThan(0);
      for (const level of board.levels) {
        expect(ExamCostService.resolveLevel(level)).toBe(level);
      }
    }
  });

  it('every deadline names a board that exists in the fee dataset', () => {
    const ids = new Set(ExamCostService.boardIds());
    for (const d of deadlines.deadlines) {
      expect(ids.has(d.board)).toBe(true);
      expect(d.confidence).toMatch(/^(confirmed|estimated)$/);
    }
  });
});

describe('estimate() never throws and never prices a null as zero', () => {
  const levels = ExamCostService.datasetLevels();

  it('exposes more than one board and more than one level family', () => {
    expect(ExamCostService.boardIds().length).toBeGreaterThan(1);
    expect(levels.length).toBeGreaterThan(1);
  });

  it('does not throw for any board × level combination', () => {
    for (const boardId of ExamCostService.boardIds()) {
      for (const level of levels) {
        expect(() => ExamCostService.estimate({ level, subjects: 6, boardIds: [boardId] }))
          .not.toThrow();
        expect(() => ExamCostService.estimate({
          level, subjects: 6, boardIds: [boardId], includeLate: true, city: 'Karachi',
        })).not.toThrow();
      }
    }
  });

  it('never reports a total of 0 — an unpublished fee is unsupported, not free', () => {
    for (const boardId of ExamCostService.boardIds()) {
      for (const level of levels) {
        for (const includeLate of [false, true]) {
          const board = ExamCostService.estimate({
            level, subjects: 6, boardIds: [boardId], includeLate,
          }).boards[0];

          if (board.supported) {
            expect(board.total).toBeGreaterThan(0);
            expect(board.twoYearTotal).toBeGreaterThanOrEqual(board.total);
          } else {
            expect(board.reason).toMatch(/^(fee_not_published|level_not_offered)$/);
            expect(board.items).toEqual([]);
          }
        }
      }
    }
  });

  it('gets AKU-EB\'s buried per-GROUP prices into the reply, not just its provenance', () => {
    // The single most important honesty case in the live data: AKU-EB does not
    // charge per subject at all, so the only real prices are in `notes`, ~1,100
    // characters past the start.
    const akueb = fees.boards.find((b) => b.id === 'aku-eb');
    if (!akueb || !/PKR/.test(akueb.notes || '')) return; // dataset changed shape

    const level = akueb.levels[0];
    const reply = ExamCostService.formatEstimateReply(
      ExamCostService.estimate({ level, subjects: 6, boardIds: ['aku-eb'] }), 'en',
    );
    expect(reply).toMatch(/PKR [\d,]{3,}/);
  });

  it('marks a null per_subject_fee as fee_not_published and carries the notes', () => {
    // AKU-EB is the real case this protects: it charges per subject GROUP, so
    // per_subject_fee is null by design and the group prices live in `notes`.
    const nullCases = [];
    for (const board of fees.boards) {
      for (const [level, fee] of Object.entries(board.per_subject_fee || {})) {
        if (fee === null) nullCases.push([board.id, level]);
      }
    }
    expect(nullCases.length).toBeGreaterThan(0); // the real data has holes

    for (const [boardId, level] of nullCases) {
      const board = ExamCostService.estimate({ level, subjects: 6, boardIds: [boardId] }).boards[0];
      expect(board.supported).toBe(false);
      expect(board.reason).toBe('fee_not_published');
      expect(board.total).toBe(0);

      const source = fees.boards.find((b) => b.id === boardId);
      if (source.notes) {
        expect(board.notes.length).toBeGreaterThan(0);
        expect(board.notes.length).toBeLessThanOrEqual(ExamCostService.NOTES_CHARS + 2);
      }
    }
  });

  it('never counts a fixed fee or late surcharge whose amount is unpublished', () => {
    for (const board of fees.boards) {
      for (const fee of board.fixed_fees || []) {
        if (fee.amount !== null) continue;
        for (const level of board.levels) {
          const costed = ExamCostService.estimate({ level, subjects: 6, boardIds: [board.id] }).boards[0];
          expect(costed.items.some((i) => i.label === fee.label)).toBe(false);
        }
      }
    }
  });

  it('flags an unpublished late surcharge as a caveat when late entry is asked for', () => {
    const withNullLate = fees.boards.filter((b) =>
      b.late_entry_surcharge && b.late_entry_surcharge.amount === null
      && Object.values(b.per_subject_fee || {}).some((v) => typeof v === 'number'));

    for (const board of withNullLate) {
      const level = Object.keys(board.per_subject_fee)
        .find((k) => typeof board.per_subject_fee[k] === 'number');
      const costed = ExamCostService.estimate({
        level, subjects: 6, boardIds: [board.id], includeLate: true,
      }).boards[0];
      expect(costed.lateSurchargeUnknown).toBe(true);
    }
  });

  it('sets anyCostable=false and offers the calculator when nothing can be costed', () => {
    // Any level only the null-fee boards offer exercises the all-null path.
    const uncostableLevel = levels.find((level) =>
      ExamCostService.boardIds().every((id) =>
        !ExamCostService.estimate({ level, subjects: 6, boardIds: [id] }).boards[0].supported));

    expect(typeof uncostableLevel).toBe('string'); // the real data has at least one

    const result = ExamCostService.estimate({ level: uncostableLevel, subjects: 6 });
    expect(result.anyCostable).toBe(false);

    const reply = ExamCostService.formatEstimateReply(result, 'en');
    expect(reply).toContain(ExamCostService.CALCULATOR_URL);
    expect(reply).not.toMatch(/PKR 0\b/);
  });
});

describe('replies against the live data', () => {
  const levels = ExamCostService.datasetLevels();

  it('stays inside the reply budget for every level, across all boards', () => {
    for (const level of levels) {
      const reply = ExamCostService.formatEstimateReply(
        ExamCostService.estimate({ level, subjects: 8, includeLate: true, city: 'Karachi' }), 'en',
      );
      expect(reply.length).toBeLessThanOrEqual(ExamCostService.MAX_REPLY_CHARS);
      // The estimate/as_of footer is reserved out of the budget, so a clamp
      // must never eat it.
      expect(reply).toContain(`as_of ${fees.as_of}`);
    }
  });

  it('never prints PKR 0 as a price for any level', () => {
    for (const level of levels) {
      for (const includeLate of [false, true]) {
        const reply = ExamCostService.formatEstimateReply(
          ExamCostService.estimate({ level, subjects: 6, includeLate }), 'en',
        );
        expect(reply).not.toMatch(/PKR 0\b/);
      }
    }
  });

  it('does not label live data as FIXTURE', () => {
    expect(ExamCostService.isFixture(fees)).toBe(false);
    const reply = ExamCostService.formatEstimateReply(
      ExamCostService.estimate({ level: levels[0], subjects: 6 }), 'en',
    );
    expect(reply).not.toContain('FIXTURE');
  });
});

describe('nextDeadlines() against the live data', () => {
  const AS_OF = new Date(`${deadlines.as_of}T00:00:00Z`);

  it('drops every row with a null date rather than rendering Invalid Date', () => {
    const nullDated = deadlines.deadlines.filter((d) => !d.date);
    expect(nullDated.length).toBeGreaterThan(0); // three BISE boards have no published date

    const all = ExamCostService.nextDeadlines(null, AS_OF);
    expect(all.every((d) => typeof d.date === 'string')).toBe(true);
    expect(all.every((d) => Number.isFinite(d.daysUntil))).toBe(true);

    for (const boardId of new Set(nullDated.map((d) => d.board))) {
      const dated = deadlines.deadlines.some((d) => d.board === boardId && d.date);
      if (!dated) {
        expect(all.some((d) => d.board === boardId)).toBe(false);
      }
    }
  });

  it('marks estimated rows and tags them in the reply', () => {
    const all = ExamCostService.nextDeadlines(null, AS_OF);
    for (const d of all) expect(d.estimated).toBe(d.confidence === 'estimated');

    const estimatedRows = all.filter((d) => d.estimated);
    if (estimatedRows.length) {
      expect(ExamCostService.formatDeadlinesReply(estimatedRows, 'en')).toContain('(estimated)');
    }
  });

  it('renders a prose fee_impact without crashing or inventing a number', () => {
    const prose = ExamCostService.nextDeadlines(null, AS_OF)
      .filter((d) => typeof d.fee_impact === 'string' && d.fee_impact.trim());
    expect(prose.length).toBeGreaterThan(0); // the real dataset uses prose here

    const reply = ExamCostService.formatDeadlinesReply(prose.slice(0, 2), 'en');
    expect(reply.length).toBeLessThanOrEqual(ExamCostService.MAX_REPLY_CHARS);
    expect(reply).not.toMatch(/\/subject if you miss it/);
  });

  it('stays inside the reply budget with every live deadline at once', () => {
    const reply = ExamCostService.formatDeadlinesReply(
      ExamCostService.nextDeadlines(null, AS_OF), 'en',
    );
    expect(reply.length).toBeLessThanOrEqual(ExamCostService.MAX_REPLY_CHARS);
  });

  it('builds a reminder message for every live dated deadline', () => {
    for (const d of ExamCostService.nextDeadlines(null, AS_OF)) {
      const message = ExamCostService.formatReminderMessage(d, 'en');
      expect(message.length).toBeLessThanOrEqual(ExamCostService.MAX_REPLY_CHARS);
      expect(message).toContain(d.date);
    }
  });
});

describe('data-source override', () => {
  it('useDataDir / resetDataDir switch datasets and clear the cache', () => {
    const fixtureDir = path.join(__dirname, 'fixtures');

    ExamCostService.useDataDir(fixtureDir);
    expect(ExamCostService.dataDir()).toBe(fixtureDir);
    expect(ExamCostService.loadFees().as_of).toBe('FIXTURE');
    expect(ExamCostService.boardIds()).toHaveLength(3);

    ExamCostService.useDataDir(LIVE_DIR);
    expect(ExamCostService.loadFees().as_of).toBe(fees.as_of);
    expect(ExamCostService.boardIds()).toEqual(fees.boards.map((b) => b.id));
  });

  it('EXAM_COST_DATA_DIR applies when no explicit override is set', () => {
    const previous = process.env.EXAM_COST_DATA_DIR;
    try {
      process.env.EXAM_COST_DATA_DIR = path.join(__dirname, 'fixtures');
      ExamCostService.resetDataDir();
      expect(ExamCostService.loadFees().as_of).toBe('FIXTURE');
    } finally {
      if (previous === undefined) delete process.env.EXAM_COST_DATA_DIR;
      else process.env.EXAM_COST_DATA_DIR = previous;
      ExamCostService.useDataDir(LIVE_DIR);
    }
  });

  it('falls back to the shipped bot/shared/data by default', () => {
    const previous = process.env.EXAM_COST_DATA_DIR;
    delete process.env.EXAM_COST_DATA_DIR;
    try {
      ExamCostService.resetDataDir();
      expect(ExamCostService.dataDir()).toBe(ExamCostService.DEFAULT_DATA_DIR);
    } finally {
      if (previous !== undefined) process.env.EXAM_COST_DATA_DIR = previous;
      ExamCostService.useDataDir(LIVE_DIR);
    }
  });
});
