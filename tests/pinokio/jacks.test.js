const path = require('path');
const { loadEsm } = require('./_load-esm');
const { buildCatalog } = require('../../bot/console/env-catalog');
const { DRIVERS } = require('../../bot/shared/services/db/pg-adapter/drivers');

const { jackStates } = loadEsm(path.join(__dirname, '../../pinokio/onboarding/public/jacks.js'));

// The built-in database driver, as the bot names it (db-setup.js: DB_DRIVER=bundled).
const BUILT_IN = 'bundled';

const withKey = buildCatalog({ OPENROUTER_API_KEY: 'sk-or-test' });
const noKey = buildCatalog({});

const READY = { state: 'ready', driver: BUILT_IN };
const LINKED = { linked: true };
const NOT_LINKED = { linked: false };

const states = (over) => jackStates({
  catalog: withKey, probes: {}, db: READY, whatsapp: NOT_LINKED, ...over,
});

test('the built-in driver name is one the bot defines', () => {
  expect(Object.keys(DRIVERS)).toContain(BUILT_IN);
  // jacks.js holds the literal (it has no imports); it must agree with the bot.
  const source = require('fs').readFileSync(
    path.join(__dirname, '../../pinokio/onboarding/public/jacks.js'), 'utf8');
  expect(source).toContain(`'${BUILT_IN}'`);
});

describe('memory', () => {
  test('on when the database is ready', () => {
    expect(states().memory).toBe('on');
  });
  test('on when the built-in database is stopped (first Start creates it)', () => {
    expect(states({ db: { state: 'stopped', driver: BUILT_IN } }).memory).toBe('on');
  });
  test('off when a hosted database is stopped', () => {
    expect(states({ db: { state: 'stopped', driver: 'supabase' } }).memory).toBe('off');
  });
  test('off for needs-helper, needs-schema, unreachable and no db info', () => {
    for (const state of ['needs-helper', 'needs-schema', 'unreachable']) {
      expect(states({ db: { state, driver: 'supabase' } }).memory).toBe('off');
    }
    expect(states({ db: null }).memory).toBe('off');
  });
});

describe('brain', () => {
  test('on when the key is set and no probe failed', () => {
    expect(states().brain).toBe('on');
    expect(states({ probes: { openrouter: 'ok' } }).brain).toBe('on');
  });
  test('off when the key is set but the probe failed', () => {
    expect(states({ probes: { openrouter: 'fail' } }).brain).toBe('off');
  });
  test('off when the key is missing', () => {
    expect(states({ catalog: noKey }).brain).toBe('off');
  });
});

describe('voice', () => {
  test('locked when memory is off', () => {
    const out = states({ db: { state: 'needs-helper', driver: 'supabase' }, whatsapp: LINKED });
    expect(out.memory).toBe('off');
    expect(out.voice).toBe('locked');
  });
  test('locked when brain is off', () => {
    expect(states({ catalog: noKey, whatsapp: LINKED }).voice).toBe('locked');
  });
  test('off when memory and brain are on but not linked', () => {
    expect(states({ whatsapp: NOT_LINKED }).voice).toBe('off');
  });
  test('on when linked', () => {
    expect(states({ whatsapp: LINKED }).voice).toBe('on');
  });
});

describe('launchReady and abilities', () => {
  test('ready only when all three are on', () => {
    expect(states({ whatsapp: LINKED }).launchReady).toBe(true);
    expect(states({ whatsapp: NOT_LINKED }).launchReady).toBe(false);
  });
  test('abilities never count toward launch', () => {
    const out = states({ whatsapp: LINKED });
    expect(out.abilities.on).toBe(0);
    expect(out.launchReady).toBe(true);
  });
  test('a partial ability does not count as on, and still does not block launch', () => {
    const partial = buildCatalog({ OPENROUTER_API_KEY: 'sk-or-test', MATRIX_HOMESERVER_URL: 'https://example.test' });
    const out = states({ catalog: partial, whatsapp: LINKED });
    expect(out.launchReady).toBe(true);
    expect(out.abilities.on).toBe(0);
  });
  test('total covers every non-core ability, guide cards included', () => {
    const expected = withKey.groups.filter((g) => g.id !== 'core')
      .reduce((n, g) => n + g.abilities.length, 0);
    const out = states();
    expect(out.abilities.total).toBe(expected);
    expect(out.abilities.total).toBeGreaterThan(0);
    expect(withKey.groups.some((g) => g.abilities.some((a) => a.guide))).toBe(true);
  });
  test('on counts abilities whose item.on is true', () => {
    const fake = { groups: [
      { id: 'core', rows: [{ key: 'OPENROUTER_API_KEY', set: true }], abilities: [{ on: true }] },
      { id: 'x', rows: [], abilities: [{ on: true }, { on: false }, { on: false, partial: true }] },
    ] };
    expect(states({ catalog: fake }).abilities).toEqual({ on: 1, total: 3 });
  });
});
