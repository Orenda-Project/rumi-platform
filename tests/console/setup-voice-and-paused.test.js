/**
 * The console's Setup page agrees with the Features page and the setup wizards:
 *
 *   - a feature switched off on Features reads "switched off" on Setup, not "on",
 *     and its card carries the same switch;
 *   - the Soniox card carries the "also use Soniox for Rumi's voice" switch, with
 *     the ElevenLabs key shown under it only when it is off;
 *   - an optional key can be cleared again; a required one cannot.
 */

const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');

const { buildCatalog } = require('../../bot/console/env-catalog');

function sonioxCard(env) {
  for (const group of buildCatalog(env).groups) {
    const card = group.abilities.find((a) => a.keys[0] === 'SONIOX_API_KEY');
    if (card) return card;
  }
  return null;
}

describe('Setup abilities honour the Features switch', () => {
  it('reads on while the feature runs', () => {
    const card = sonioxCard({ SONIOX_API_KEY: 'k' });
    expect(card).toMatchObject({ on: true, paused: false, configured: true, featureId: 'stt_soniox' });
  });

  it('reads switched off, not on, once Features pauses it', () => {
    const card = sonioxCard({ SONIOX_API_KEY: 'k', RUMI_FEATURE_STT_SONIOX: 'off' });
    expect(card).toMatchObject({ on: false, paused: true, configured: true, pendingRestart: false });
  });

  it('does not count a paused ability as on', () => {
    const on = buildCatalog({ SONIOX_API_KEY: 'k' }).counts.abilitiesOn;
    const paused = buildCatalog({ SONIOX_API_KEY: 'k', RUMI_FEATURE_STT_SONIOX: 'off' }).counts.abilitiesOn;
    expect(paused).toBe(on - 1);
  });

  it('has nothing to pause without a key', () => {
    expect(sonioxCard({ RUMI_FEATURE_STT_SONIOX: 'off' })).toMatchObject({ paused: false, configured: false });
  });
});

describe('the Soniox voice switch on Setup', () => {
  it('is on by default for a fresh setup', () => {
    expect(sonioxCard({}).voice).toMatchObject({ key: 'TTS_PROVIDER', on: true, chosen: false });
  });

  it('follows TTS_PROVIDER once written', () => {
    expect(sonioxCard({ SONIOX_API_KEY: 'k', TTS_PROVIDER: 'legacy' }).voice.on).toBe(false);
    expect(sonioxCard({ SONIOX_API_KEY: 'k', TTS_PROVIDER: 'soniox' }).voice.on).toBe(true);
  });

  it('carries the ElevenLabs key row as its fallback', () => {
    expect(sonioxCard({}).voice.fallback.key).toBe('ELEVENLABS_API_KEY');
  });
});

const BOT = path.join(__dirname, '../../bot');
const DASHBOARD = path.join(__dirname, '../../dashboard');
const EJS_FROM = [BOT, DASHBOARD].find((dir) => fs.existsSync(path.join(dir, 'node_modules', 'ejs')));
const describeIf = EJS_FROM || process.env.CI ? describe : describe.skip;

describeIf('Setup view', () => {
  async function renderSetup(env) {
    const ejs = createRequire(path.join(EJS_FROM, 'package.json'))('ejs');
    return ejs.renderFile(path.join(BOT, 'console/views/setup.ejs'), {
      branding: { botName: 'Rumi', orgName: null },
      mount: '/console',
      posture: { mode: 'local' },
      standalone: false,
      pending: [],
      active: '/setup',
      setupTally: null,
      featureTally: null,
      pageTitle: 'Setup',
      catalog: buildCatalog(env),
    });
  }

  it('shows the ElevenLabs key under the voice switch only when it is off', async () => {
    const on = await renderSetup({ SONIOX_API_KEY: 'k', TTS_PROVIDER: 'soniox' });
    expect(on).toMatch(/data-voice-toggle\s+checked/);
    expect(on).toMatch(/class="voice-fallback hidden"/);

    const off = await renderSetup({ SONIOX_API_KEY: 'k', TTS_PROVIDER: 'legacy' });
    expect(off).not.toMatch(/data-voice-toggle\s+checked/);
    expect(off).toMatch(/class="voice-fallback "/);
  });

  it('says switched off and offers the same switch as Features', async () => {
    const html = await renderSetup({ SONIOX_API_KEY: 'k', RUMI_FEATURE_STT_SONIOX: 'off' });
    expect(html).toMatch(/pill warn">switched off/);
    expect(html).toMatch(/data-feature="stt_soniox"\s*>/);
  });

  it('lets an optional key be cleared but never a required one', async () => {
    const html = await renderSetup({ SONIOX_API_KEY: 'k', OPENROUTER_API_KEY: 'sk-or-x' });
    expect(html).toMatch(/data-clear="SONIOX_API_KEY"/);
    expect(html).not.toMatch(/data-clear="OPENROUTER_API_KEY"/);
  });
});
