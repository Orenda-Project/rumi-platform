/**
 * A bot deployed before the observe migration has no
 * coaching_sessions.observation_type. PostgREST then answers "column does not
 * exist" (42703) for any read that filters on it, and the teacher-own readers,
 * which degrade quietly, would hand the teacher an empty trend and "no prior
 * sessions" — a different report, with Observe never switched on. The column
 * is probed once: without it the filter is skipped (there is nothing to skip)
 * and the missing migration is logged as an error; with it, the filter stays.
 */
const MISSING = { code: '42703', message: 'column coaching_sessions.observation_type does not exist' };
const mockState = { hasColumn: false, rows: [], probes: 0 };

// A PostgREST stand-in that behaves like a database WITHOUT (or with) the column:
// any query that filters or selects observation_type fails when it is missing.
function mockQuery(table) {
  let touchesColumn = false;
  let isProbe = false;
  const api = new Proxy({}, {
    get: (_, k) => {
      if (k === 'then') {
        return (resolve) => {
          if (isProbe) mockState.probes += 1;
          if (touchesColumn && !mockState.hasColumn) return resolve({ data: null, error: MISSING, count: null });
          const rows = table === 'coaching_sessions' && !isProbe ? mockState.rows : [];
          return resolve({ data: rows, error: null, count: rows.length });
        };
      }
      if (k === 'is') return (col) => { if (col === 'observation_type') touchesColumn = true; return api; };
      if (k === 'select') return (cols) => { if (cols === 'observation_type') { touchesColumn = true; isProbe = true; } return api; };
      return () => api;
    },
  });
  return api;
}
jest.mock('../../bot/shared/config/supabase', () => ({ from: (t) => mockQuery(t) }));
jest.mock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));

const { logToFile } = require('../../bot/shared/utils/logger');
const OwnCoaching = require('../../bot/shared/services/coaching/own-coaching');
const { loadTrendData } = require('../../bot/shared/services/coaching/coaching-trend.service');

const SELF = [
  { id: 'b', created_at: '2026-09-08', analysis_data: { scores: { overall_percentage: 74 } } },
  { id: 'a', created_at: '2026-09-01', analysis_data: { scores: { overall_percentage: 71 } } },
];

beforeEach(() => {
  OwnCoaching._reset();
  mockState.rows = SELF;
  mockState.probes = 0;
  jest.clearAllMocks();
});

test('without the column: the teacher\'s own trend is computed exactly as before, and the missing migration is logged', async () => {
  mockState.hasColumn = false;
  expect(await OwnCoaching.probe()).toBe(false);
  const trend = await loadTrendData('t-1');
  expect(trend.map((p) => p.pct)).toEqual([71, 74]);
  expect(logToFile.mock.calls.some(([msg]) => /observation_type/.test(msg) && /migration/i.test(msg))).toBe(true);
});

test('with the column: the observation filter is applied', async () => {
  mockState.hasColumn = true;
  expect(await OwnCoaching.probe()).toBe(true);
  const seen = [];
  const q = { is: (...a) => { seen.push(a); return q; } };
  expect(OwnCoaching.ownCoaching(q)).toBe(q);
  expect(seen).toEqual([['observation_type', null]]);
});

test('the probe runs once per process', async () => {
  mockState.hasColumn = true;
  await Promise.all([OwnCoaching.probe(), OwnCoaching.probe(), OwnCoaching.probe()]);
  expect(mockState.probes).toBe(1);
});

describe('every process that reads a teacher\'s own coaching probes the column at start-up', () => {
  const fs = require('fs');
  const path = require('path');
  const src = (rel) => fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');
  test.each([
    ['bot/whatsapp-bot.js', /function startServer\(\) \{[\s\S]{0,400}own-coaching'\)\.probe\(\)/],
    ['bot/workers/sqs-worker.js', /function startWorker\([^)]*\) \{[\s\S]{0,400}own-coaching'\)\.probe\(\)/],
    ['bot/workers/stale-session.worker.js', /async function main\(\) \{[\s\S]{0,600}await require\('[^']*own-coaching'\)\.probe\(\)/],
    ['bot/scripts/generate-coaching-excel.js', /async function generateCoachingExcel\(\) \{\s*await require\('[^']*own-coaching'\)\.probe\(\)/],
  ])('%s', (file, re) => {
    expect(src(file)).toMatch(re);
  });
});
