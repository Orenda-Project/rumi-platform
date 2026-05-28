/**
 * §D-3 + §D-4 guards — `npm run doctor` must:
 *   - NOT claim "the bot will not start" for missing optional vars (§D-3).
 *     The bot DOES boot with placeholders thanks to presence-gating; the
 *     missing-variable copy now matches that reality.
 *   - Surface the `notes` field for features that have a dual-gate (e.g. Video
 *     needs KIE_API_KEY AND VIDEO_GENERATION_ENABLED=true at runtime — §D-4).
 */

const path = require('path');

const DOCTOR = path.resolve(__dirname, '../../bot/scripts/setup/doctor.js');
const FEATURE_AVAILABILITY = path.resolve(
  __dirname,
  '../../bot/shared/config/feature-availability.js'
);

describe('doctor — honest wording', () => {
  let originalEnv;
  beforeEach(() => { originalEnv = { ...process.env }; jest.resetModules(); });
  afterEach(() => { process.env = originalEnv; });

  it('missing-required line tells the truth: the bot REFUSES TO START', () => {
    // Force at least one REQUIRED_VAR to be absent.
    delete process.env.SUPABASE_URL;
    delete process.env.WHATSAPP_TOKEN;

    const { analyzeEnv, formatReport } = require(DOCTOR);
    const analysis = analyzeEnv(process.env);
    // Construct a minimal result the formatter accepts.
    const result = {
      ok: false,
      missingRequired: analysis.missingRequired,
      probeResults: [],
      featureResults: [],
      flowResults: [],
    };
    const out = formatReport(result);

    expect(out).toMatch(/MISSING REQUIRED variables/);
    // The doctor must tell the truth: missing REQUIRED vars cause the bot to
    // refuse to start (bot/shared/config/supabase.js exits 78 with a friendly
    // box). The previous copy promised "features will be OFF" — incorrect for
    // required keys; that wording is now reserved for OPTIONAL features.
    expect(out).toMatch(/REFUSE TO START/i);
    expect(out).not.toMatch(/the bot will boot.*will be OFF/i);
  });

  it('Video feature carries a "VIDEO_GENERATION_ENABLED" note', () => {
    const { FEATURES } = require(FEATURE_AVAILABILITY);
    const video = FEATURES.find((f) => /video/i.test(f.name));
    expect(video).toBeTruthy();
    expect(video.keys).toContain('KIE_API_KEY');
    expect(video.notes).toBeTruthy();
    expect(video.notes).toMatch(/VIDEO_GENERATION_ENABLED/);
  });

  it('doctor surfaces the feature note in formatted output', () => {
    const { formatReport } = require(DOCTOR);
    const result = {
      ok: true,
      missingRequired: [],
      probeResults: [],
      featureResults: [
        {
          name: 'Video generation (Kie.ai)',
          status: 'off',
          detail: 'set: KIE_API_KEY',
          requiredKeys: ['KIE_API_KEY'],
          missingKeys: ['KIE_API_KEY'],
          notes: 'Also requires VIDEO_GENERATION_ENABLED=true at runtime.',
        },
      ],
      flowResults: [],
    };
    const out = formatReport(result);
    expect(out).toMatch(/note: Also requires VIDEO_GENERATION_ENABLED/);
  });
});
