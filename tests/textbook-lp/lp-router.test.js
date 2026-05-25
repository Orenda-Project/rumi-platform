/**
 * LP Router — region_features-driven, two-track (gamma_enriched / gamma_standard).
 * Guards: curriculum path only when the region enables it + has textbooks +
 * supported subject + a page anchor; NEVER routes to the removed ug_lp path.
 */

function loadRouterWithRegion(features) {
  jest.resetModules();
  jest.doMock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
  jest.doMock('../../bot/shared/services/region-features.service', () => ({
    getRegionFeatures: async () => features,
  }));
  return require('../../bot/shared/services/lesson-plan-router.service');
}

const curriculumRegion = {
  region: 'demo_region', curriculum_lp_enabled: true, has_textbooks: true,
  supported_subjects: ['maths', 'english'], gamma_lp_enabled: true,
};
const plainRegion = {
  region: 'default', curriculum_lp_enabled: false, has_textbooks: false,
  supported_subjects: [], gamma_lp_enabled: true,
};

describe('LessonPlanRouterService.route', () => {
  afterEach(() => jest.resetModules());

  it('routes to gamma_enriched when region enables curriculum + supported subject + page', async () => {
    const Router = loadRouterWithRegion(curriculumRegion);
    const r = await Router.route({ region: 'demo_region', grade: 4, subject: 'maths', pageNumber: 50 });
    expect(r.track).toBe('gamma_enriched');
  });

  it('routes to gamma_standard when no page anchor is given', async () => {
    const Router = loadRouterWithRegion(curriculumRegion);
    const r = await Router.route({ region: 'demo_region', grade: 4, subject: 'maths', pageNumber: null });
    expect(r.track).toBe('gamma_standard');
  });

  it('routes to gamma_standard for an unsupported subject', async () => {
    const Router = loadRouterWithRegion(curriculumRegion);
    const r = await Router.route({ region: 'demo_region', grade: 4, subject: 'science', pageNumber: 50 });
    expect(r.track).toBe('gamma_standard');
  });

  it('routes to gamma_standard for a region with curriculum LP disabled', async () => {
    const Router = loadRouterWithRegion(plainRegion);
    const r = await Router.route({ region: 'anywhere', grade: 4, subject: 'maths', pageNumber: 50 });
    expect(r.track).toBe('gamma_standard');
  });

  it('NEVER returns the removed ug_lp track', async () => {
    const Router = loadRouterWithRegion(curriculumRegion);
    for (const args of [
      { region: 'demo_region', grade: 3, subject: 'maths', pageNumber: 10 },
      { region: 'demo_region', grade: 9, subject: 'english', pageNumber: 99 },
      { region: 'default', grade: 2, subject: 'urdu', pageNumber: 5 },
    ]) {
      const r = await Router.route(args);
      expect(['gamma_enriched', 'gamma_standard']).toContain(r.track);
      expect(r.track).not.toBe('ug_lp');
    }
  });
});
