/**
 * region-features — the standardized, DB-driven region gating mechanism.
 *
 * The contract that matters (requirement #9): a region's LP behaviour is
 * determined by DATA (a region_features row), not code. Region A with
 * curriculum_lp_enabled=true routes to the curriculum path; region B with no
 * row falls back to the safe default (curriculum off) — with NO code change.
 */

const path = require('path');

function loadWithRows(rowsByRegion) {
  jest.resetModules();
  jest.doMock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
  jest.doMock('../../bot/shared/config/supabase', () => ({
    from: () => ({
      select: () => ({
        eq: (col, region) => ({
          maybeSingle: async () => ({ data: rowsByRegion[region] || null, error: null }),
        }),
      }),
    }),
  }));
  return require('../../bot/shared/services/region-features.service');
}

describe('region-features (standardized region gating)', () => {
  afterEach(() => jest.resetModules());

  it('curriculum path turns on for a region whose row enables it', async () => {
    const svc = loadWithRows({
      demo_region: { region: 'demo_region', curriculum_lp_enabled: true, pic_lp_enabled: true, gamma_lp_enabled: true, default_framework: 'hots' },
    });
    svc._clearCache();
    expect(await svc.isCurriculumLpEnabled('demo_region')).toBe(true);
    expect((await svc.getRegionFeatures('demo_region')).default_framework).toBe('hots');
  });

  it('a region with NO row falls back to the safe default (curriculum off) — no code change', async () => {
    const svc = loadWithRows({}); // table effectively empty for this region
    svc._clearCache();
    expect(await svc.isCurriculumLpEnabled('somewhere_new')).toBe(false);
    const f = await svc.getRegionFeatures('somewhere_new');
    expect(f.gamma_lp_enabled).toBe(true); // generic Gamma LP still works
    expect(f.default_framework).toBe('oecd');
  });

  it('fails open to default when the DB query throws (never blocks LP)', async () => {
    jest.resetModules();
    jest.doMock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
    jest.doMock('../../bot/shared/config/supabase', () => ({
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => { throw new Error('db down'); } }) }) }),
    }));
    const svc = require('../../bot/shared/services/region-features.service');
    svc._clearCache();
    const f = await svc.getRegionFeatures('punjab');
    expect(f.curriculum_lp_enabled).toBe(false);
    expect(f.gamma_lp_enabled).toBe(true);
  });

  it('is generic/global — no hardcoded country logic in the region util', () => {
    const src = require('fs').readFileSync(path.resolve(__dirname, '../../bot/shared/utils/region.js'), 'utf8');
    expect(src).not.toMatch(/isPakistaniTeacher|PK_REGION_TAGS|punjab|92329|255677/i);
    const { detectRegion } = require('../../bot/shared/utils/region');
    const prev = process.env.DEFAULT_REGION;
    process.env.DEFAULT_REGION = 'tanzania';
    expect(detectRegion()).toBe('tanzania');
    if (prev === undefined) delete process.env.DEFAULT_REGION; else process.env.DEFAULT_REGION = prev;
  });
});
