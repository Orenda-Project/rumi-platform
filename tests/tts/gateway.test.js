/**
 * The voice gateway (bot/shared/services/tts): with the switch off a feature's own voice call runs and its
 * bytes come back untouched; with Soniox switched on, Soniox speaks, and any reason it cannot (no key, a
 * language it has no voice for, an error) hands the note back to today's voice, so a teacher is never left
 * with silence.
 */

jest.mock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));

const { createTtsGateway, TtsUnavailableError } = require('../../bot/shared/services/tts');
const { tinyOggOpus } = require('./_ogg');

const LEGACY_MP3 = Buffer.from('ID3-legacy-mp3-bytes');

function sonioxDouble(impl) {
  return { synthesize: jest.fn(impl || (async () => ({ audio: tinyOggOpus(), attempts: 1 }))), maxConcurrency: 1 };
}

function call(gateway, overrides = {}) {
  return gateway.synthesize({
    text: 'Hello teacher. Well done today.',
    language: 'en',
    useCase: 'conversation',
    site: 'voice_reply',
    legacy: jest.fn(async () => LEGACY_MP3),
    ...overrides,
  });
}

describe('tts gateway — switch off (default)', () => {
  it('runs the legacy call and returns its bytes untouched; Soniox is never asked', async () => {
    const provider = sonioxDouble();
    const legacy = jest.fn(async () => LEGACY_MP3);
    const result = await call(createTtsGateway({ env: {}, provider }), { legacy });
    expect(legacy).toHaveBeenCalledTimes(1);
    expect(result.audio).toBe(LEGACY_MP3);
    expect(result.provider).toBe('legacy');
    expect(provider.synthesize).not.toHaveBeenCalled();
  });

  it("passes the legacy call's error to the feature unchanged", async () => {
    const boom = new Error('ElevenLabs 401');
    const gateway = createTtsGateway({ env: {}, provider: sonioxDouble() });
    await expect(call(gateway, { legacy: async () => { throw boom; } })).rejects.toBe(boom);
  });
});

describe('tts gateway — switch on (TTS_PROVIDER=soniox)', () => {
  const ON = { TTS_PROVIDER: 'soniox', SONIOX_TTS_API_KEY: 'test-key' };

  it('Soniox speaks with the default voice for the language, and returns a whole Ogg Opus note', async () => {
    const provider = sonioxDouble();
    const legacy = jest.fn(async () => LEGACY_MP3);
    const result = await call(createTtsGateway({ env: ON, provider }), { legacy });
    expect(result.provider).toBe('soniox');
    expect(result.voice).toBe('Grace');
    expect(result.format).toBe('ogg');
    expect(result.audio.subarray(0, 4).toString('latin1')).toBe('OggS');
    expect(legacy).not.toHaveBeenCalled();
    expect(provider.synthesize).toHaveBeenCalledWith(expect.objectContaining({ sonioxCode: 'en', voice: 'Grace' }));
  });

  it('Urdu is spoken by Ishita', async () => {
    const provider = sonioxDouble();
    const result = await call(createTtsGateway({ env: ON, provider }), { text: 'آپ نے آج بہت اچھا پڑھایا۔', language: 'ur' });
    expect(result.voice).toBe('Ishita');
    expect(provider.synthesize).toHaveBeenCalledWith(expect.objectContaining({ sonioxCode: 'ur' }));
  });

  it('a SONIOX_TTS_VOICE_<CODE> setting overrides the default voice', async () => {
    const provider = sonioxDouble();
    const result = await call(createTtsGateway({ env: { ...ON, SONIOX_TTS_VOICE_EN: 'Other' }, provider }));
    expect(result.voice).toBe('Other');
  });

  it('a language Soniox has no voice for (Pashto) is a skip to today\'s voice, not an error', async () => {
    const provider = sonioxDouble();
    const result = await call(createTtsGateway({ env: ON, provider }), { text: 'ښه کار مو وکړ', language: 'ps-PK' });
    expect(result.provider).toBe('legacy');
    expect(result.audio).toBe(LEGACY_MP3);
    expect(result.skipReason).toBe('no_soniox_code');
    expect(provider.synthesize).not.toHaveBeenCalled();
  });

  it('SONIOX_TTS_LANGUAGES limits Soniox to the listed languages', async () => {
    const provider = sonioxDouble();
    const gateway = createTtsGateway({ env: { ...ON, SONIOX_TTS_LANGUAGES: 'ur' }, provider });
    const result = await call(gateway);
    expect(result.provider).toBe('legacy');
    expect(result.skipReason).toBe('not_in_allowlist');
  });

  it('switched on without SONIOX_TTS_API_KEY: today\'s voice speaks, marked as a fallback', async () => {
    const provider = sonioxDouble();
    const result = await call(createTtsGateway({ env: { TTS_PROVIDER: 'soniox' }, provider }));
    expect(result.provider).toBe('legacy');
    expect(result.fallbackFrom).toBe('soniox');
    expect(result.audio).toBe(LEGACY_MP3);
    expect(provider.synthesize).not.toHaveBeenCalled();
  });

  it('a Soniox error falls back to today\'s voice', async () => {
    const provider = sonioxDouble(async () => { throw Object.assign(new Error('503'), { code: 'http_error' }); });
    const result = await call(createTtsGateway({ env: ON, provider }));
    expect(result.provider).toBe('legacy');
    expect(result.fallbackFrom).toBe('soniox');
  });

  it('cut-off Soniox audio is not sent: today\'s voice speaks instead', async () => {
    const whole = tinyOggOpus();
    const provider = sonioxDouble(async () => ({ audio: whole.subarray(0, whole.length - 5), attempts: 1 }));
    const result = await call(createTtsGateway({ env: ON, provider }));
    expect(result.provider).toBe('legacy');
    expect(result.fallbackFrom).toBe('soniox');
  });

  it('when Soniox and today\'s voice both fail, the feature gets TtsUnavailableError naming both', async () => {
    const provider = sonioxDouble(async () => { throw new Error('soniox down'); });
    const gateway = createTtsGateway({ env: ON, provider });
    const err = await call(gateway, { legacy: async () => { throw new Error('elevenlabs down'); } }).catch((e) => e);
    expect(err).toBeInstanceOf(TtsUnavailableError);
    expect(err.failures.map((f) => f.provider)).toEqual(['soniox', 'legacy']);
  });

  it('a feature switched back to legacy keeps today\'s voice while the rest use Soniox', async () => {
    const provider = sonioxDouble();
    const gateway = createTtsGateway({ env: { ...ON, TTS_PROVIDER_COACHING: 'legacy' }, provider });
    const coaching = await call(gateway, { useCase: 'coaching', site: 'question' });
    const reply = await call(gateway);
    expect(coaching.provider).toBe('legacy');
    expect(reply.provider).toBe('soniox');
  });

  it('a misspelled site is logged and gets today\'s voice, never an exception', async () => {
    const provider = sonioxDouble();
    const result = await call(createTtsGateway({ env: ON, provider }), { site: 'not_a_site' });
    expect(result.provider).toBe('legacy');
  });
});
