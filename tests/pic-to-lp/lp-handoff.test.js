/**
 * Pic-LP lp-handoff.pickBackend — presence-based safe default.
 * When the app_settings.pic_lp_backend_ab row is missing, the OSS port routes
 * to whichever image backend the deployment actually has keys for:
 *   KIE key present  → 'kieai'
 *   only GAMMA key   → 'gamma'
 */

let LpHandoff;

function load() {
  jest.resetModules();
  jest.doMock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
  jest.doMock('../../bot/shared/utils/structured-logger', () => ({ logEvent: jest.fn() }));
  jest.doMock('../../bot/shared/utils/constants', () => ({ TEMP_DIR: '/tmp' }));
  jest.doMock('../../bot/shared/services/whatsapp.service', () => ({ sendMessage: jest.fn(), sendDocument: jest.fn() }));
  jest.doMock('../../bot/shared/services/pic-to-lp/gamma-client.service', () => ({ generate: jest.fn(), SUPPORTED_LANGUAGES: ['en'] }));
  // Missing app_settings row → maybeSingle resolves { data: null }.
  jest.doMock('../../bot/shared/config/supabase', () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }) }) }),
    }),
  }));
  LpHandoff = require('../../bot/shared/services/pic-to-lp/lp-handoff.service');
}

const ENV_KEYS = ['KIE_API_KEY', 'KIE_API_KEY_PIC_LP', 'GAMMA_API_KEY', 'PIC_LP_FORCE_GAMMA', 'PIC_LP_FORCE_KIEAI'];
function clearEnv() { ENV_KEYS.forEach((k) => { delete process.env[k]; }); }

beforeEach(clearEnv);
afterEach(() => { clearEnv(); jest.resetModules(); });

describe('lp-handoff.pickBackend (missing app_settings row)', () => {
  it("defaults to 'kieai' when a KIE key is set", async () => {
    process.env.KIE_API_KEY = 'kie-test';
    load();
    expect(await LpHandoff.pickBackend('user-1', {})).toBe('kieai');
  });

  it("defaults to 'kieai' when only the PIC_LP-specific KIE key is set", async () => {
    process.env.KIE_API_KEY_PIC_LP = 'kie-piclp-test';
    load();
    expect(await LpHandoff.pickBackend('user-1', {})).toBe('kieai');
  });

  it("defaults to 'gamma' when only a GAMMA key is set", async () => {
    process.env.GAMMA_API_KEY = 'gamma-test';
    load();
    expect(await LpHandoff.pickBackend('user-1', {})).toBe('gamma');
  });

  it("defaults to 'gamma' when no image-backend keys are set", async () => {
    load();
    expect(await LpHandoff.pickBackend('user-1', {})).toBe('gamma');
  });

  it("uses the presence-based default for a null userId too", async () => {
    process.env.KIE_API_KEY = 'kie-test';
    load();
    expect(await LpHandoff.pickBackend(null, {})).toBe('kieai');
  });

  it("honors an explicit 'detailed' format pick → gamma (overrides presence)", async () => {
    process.env.KIE_API_KEY = 'kie-test';
    load();
    expect(await LpHandoff.pickBackend('user-1', { lesson_plan_format: 'detailed' })).toBe('gamma');
  });
});
