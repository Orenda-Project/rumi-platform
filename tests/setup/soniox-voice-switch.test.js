/**
 * "Also use Soniox for Rumi's voice": the switch under the Soniox key in both setup wizards. On by default:
 * the same key then speaks Rumi's replies (TTS_PROVIDER=soniox). Off keeps Rumi's voice on ElevenLabs
 * (TTS_PROVIDER=legacy) and asks for the ElevenLabs key right there.
 */

const { fakeIo, captureLog } = require('./fake-io');

function loadWizard() {
  jest.resetModules();
  // eslint-disable-next-line global-require
  return require('../../bot/scripts/setup/interactive-setup');
}

/** A saver that, like the real one, also updates the env the wizard reads. */
function saverFor(env) {
  const saved = {};
  const save = (vars) => { Object.assign(saved, vars); Object.assign(env, vars); };
  return { saved, save };
}

describe('the switch as the wizards read it', () => {
  const { sonioxVoiceOn, SONIOX_VOICE } = require('../../bot/scripts/setup/fields');

  it('is on by default for a fresh setup', () => {
    expect(sonioxVoiceOn({})).toBe(true);
  });

  it('follows TTS_PROVIDER once it is set', () => {
    expect(sonioxVoiceOn({ SONIOX_API_KEY: 'k', TTS_PROVIDER: 'soniox' })).toBe(true);
    expect(sonioxVoiceOn({ TTS_PROVIDER: 'legacy' })).toBe(false);
  });

  it('reads off where a Soniox key was saved before the switch existed — that bot speaks with today\'s voice', () => {
    expect(sonioxVoiceOn({ SONIOX_API_KEY: 'k' })).toBe(false);
  });

  it('writes the voice gateway\'s own values', () => {
    const { PROVIDERS } = require('../../bot/shared/services/tts/routing');
    expect(PROVIDERS).toEqual(expect.arrayContaining([SONIOX_VOICE.on, SONIOX_VOICE.off]));
    expect(SONIOX_VOICE.key).toBe('TTS_PROVIDER');
  });
});

describe('the catalogue the Pinokio wizard renders', () => {
  const { buildCatalog, knownKeys } = require('../../bot/console/env-catalog');
  const sonioxCard = (env) => buildCatalog(env).groups.flatMap((g) => g.abilities)
    .find((a) => a.keys[0] === 'SONIOX_API_KEY');

  it('puts the switch on the Soniox card, on, with the ElevenLabs key field behind it', () => {
    const { voice } = sonioxCard({});
    expect(voice).toMatchObject({ key: 'TTS_PROVIDER', on: true, chosen: false, values: { on: 'soniox', off: 'legacy' } });
    expect(voice.fallback).toMatchObject({ key: 'ELEVENLABS_API_KEY', set: false });
  });

  it('shows it off, with the ElevenLabs key as saved, once switched off', () => {
    const { voice } = sonioxCard({ TTS_PROVIDER: 'legacy', ELEVENLABS_API_KEY: 'el-key' });
    expect(voice).toMatchObject({ on: false, chosen: true });
    expect(voice.fallback.set).toBe(true);
  });

  it('no other card carries a switch', () => {
    const others = buildCatalog({}).groups.flatMap((g) => g.abilities).filter((a) => a.keys[0] !== 'SONIOX_API_KEY');
    expect(others.some((a) => a.voice)).toBe(false);
  });

  it('the wizard may save TTS_PROVIDER, and only as soniox or legacy', () => {
    const { validatorFor } = require('../../bot/scripts/setup/validators');
    expect(knownKeys().has('TTS_PROVIDER')).toBe(true);
    expect(validatorFor('TTS_PROVIDER')(' Soniox ')).toEqual({ ok: true, value: 'soniox' });
    expect(validatorFor('TTS_PROVIDER')('legacy')).toEqual({ ok: true, value: 'legacy' });
    expect(validatorFor('TTS_PROVIDER')('elevenlabs').ok).toBe(false);
  });
});

describe('the terminal wizard (rumi setup)', () => {
  let restore;
  beforeEach(() => { restore = captureLog().restore; });
  afterEach(() => restore());

  it('asks right after the Soniox key, defaults to yes, and stores soniox', async () => {
    const { stepExtras } = loadWizard();
    const env = {};
    const { saved, save } = saverFor(env);
    const io = fakeIo({ select: ['add'], ask: ['soniox-key'] });

    await stepExtras(io, env, save);

    expect(io.asked.confirm[0]).toMatch(/also use soniox for rumi's voice/i);
    expect(saved).toMatchObject({ SONIOX_API_KEY: 'soniox-key', TTS_PROVIDER: 'soniox' });
    expect(saved.ELEVENLABS_API_KEY).toBeUndefined();
  });

  it('a no stores legacy and asks for the ElevenLabs key there — and not again later', async () => {
    const { stepExtras } = loadWizard();
    const env = {};
    const { saved, save } = saverFor(env);
    const io = fakeIo({ select: ['add'], confirm: [false], ask: ['soniox-key', 'el-key'] });

    await stepExtras(io, env, save);

    expect(saved).toMatchObject({ SONIOX_API_KEY: 'soniox-key', TTS_PROVIDER: 'legacy', ELEVENLABS_API_KEY: 'el-key' });
    const elevenLabsAsks = io.asked.ask.filter((q) => /elevenlabs/i.test(q.label) || q.fallback === 'el-key');
    expect(elevenLabsAsks).toHaveLength(1);
    expect(io.asked.ask[1]).toMatchObject({ label: 'ElevenLabs key', secret: true });
  });

  it('is not asked when the Soniox key is skipped', async () => {
    const { stepExtras } = loadWizard();
    const env = {};
    const { saved, save } = saverFor(env);
    const io = fakeIo({ select: ['add'] });

    await stepExtras(io, env, save);

    expect(io.asked.confirm).toHaveLength(0);
    expect(saved.TTS_PROVIDER).toBeUndefined();
  });
});

describe('one Soniox key both listens and speaks', () => {
  jest.mock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));

  it('the gateway speaks with SONIOX_API_KEY when no separate voice key is set', async () => {
    const { sonioxVoiceKey } = require('../../bot/shared/services/tts/providers/soniox.provider');
    expect(sonioxVoiceKey({ SONIOX_API_KEY: 'stt' })).toBe('stt');
    expect(sonioxVoiceKey({ SONIOX_API_KEY: 'stt', SONIOX_TTS_API_KEY: 'tts' })).toBe('tts');
    expect(sonioxVoiceKey({})).toBe('');

    const { createTtsGateway } = require('../../bot/shared/services/tts');
    const { tinyOggOpus } = require('../tts/_ogg');
    const provider = { synthesize: jest.fn(async () => ({ audio: tinyOggOpus() })), maxConcurrency: 1 };
    const gateway = createTtsGateway({ env: { TTS_PROVIDER: 'soniox', SONIOX_API_KEY: 'stt' }, provider });
    const result = await gateway.synthesize({
      text: 'Well done today.', language: 'en', useCase: 'conversation', site: 'voice_reply',
      legacy: async () => Buffer.from('mp3'),
    });
    expect(result.provider).toBe('soniox');
  });
});
