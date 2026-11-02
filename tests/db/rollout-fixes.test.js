/**
 * Places outside the database layer that had to learn about the built-in
 * database (DB_DRIVER=bundled) or that broke the same way on every driver.
 */

describe('Morning Brief gets the built-in database address', () => {
  const { rendererEnv } = require('../../bot/workers/brief.worker');

  test('bundled: DATABASE_URL is built from RUMI_DB_*', () => {
    const env = rendererEnv({ RUMI_DB_PASSWORD: 'pw', RUMI_DB_PORT: '6001' });
    expect(env.DATABASE_URL).toBe('postgres://postgres:pw@127.0.0.1:6001/postgres');
  });

  test('an explicit BRIEF_DATABASE_URL or DATABASE_URL wins; Supabase is left alone', () => {
    expect(rendererEnv({ BRIEF_DATABASE_URL: 'postgres://brief' }).DATABASE_URL).toBeUndefined();
    expect(rendererEnv({ DATABASE_URL: 'postgres://mine' }).DATABASE_URL).toBe('postgres://mine');
    expect(rendererEnv({ SUPABASE_URL: 'https://a.supabase.co' }).DATABASE_URL).toBeUndefined();
  });
});

describe('console / Pinokio settings catalogue', () => {
  const { buildCatalog, knownKeys } = require('../../bot/console/env-catalog');
  const core = (env) => buildCatalog(env).groups.find((g) => g.id === 'core').rows.map((r) => r.key);
  const cards = (env) => buildCatalog(env).groups.find((g) => g.id === 'advanced').abilities.map((a) => a.keys.join('+'));

  test('every database setting can be saved — and the generated password cannot be edited', () => {
    const keys = knownKeys();
    for (const k of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'DATABASE_URL']) expect(keys.has(k)).toBe(true);
    expect(keys.has('RUMI_DB_PASSWORD')).toBe(false);
  });

  test('built-in: no password field; Postgres and Supabase offered as cards', () => {
    expect(core({})).toEqual(['OPENROUTER_API_KEY', 'REDIS_URL']);
    expect(cards({})).toEqual(expect.arrayContaining(['DATABASE_URL', 'SUPABASE_URL+SUPABASE_SERVICE_ROLE_KEY']));
  });

  test('Supabase: its keys are the required rows, and not repeated as a card', () => {
    const env = { SUPABASE_URL: 'https://a.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'k' };
    expect(core(env)).toEqual(['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'OPENROUTER_API_KEY', 'REDIS_URL']);
    expect(cards(env)).not.toContain('SUPABASE_URL+SUPABASE_SERVICE_ROLE_KEY');
  });
});

describe('A/B test impressions', () => {
  afterEach(() => jest.resetModules());

  test('fall back to a direct update when the increment function returns an error', async () => {
    const insert = jest.fn(async () => ({ error: null }));
    jest.doMock('../../bot/shared/config/supabase', () => ({
      rpc: jest.fn(async () => ({ data: null, error: { code: 'PGRST202', message: 'no such function' } })),
      from: jest.fn(() => ({ insert })),
    }));
    jest.doMock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
    const BanditService = require('../../bot/shared/services/bandit.service');
    const Service = BanditService.BanditService || BanditService;
    const spy = jest.spyOn(Service, '_incrementField').mockResolvedValue(undefined);
    await Service.recordImpression('test-1', 'A');
    expect(spy).toHaveBeenCalledWith('test-1', 'A', 'impressions');
  });
});
