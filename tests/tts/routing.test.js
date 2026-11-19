/**
 * Who speaks a voice note is configuration: TTS_PROVIDER_<USE_CASE>_<SITE>, then TTS_PROVIDER_<USE_CASE>,
 * then TTS_PROVIDER, else "legacy" (today's voice). These pin that order and that a typo never routes
 * a voice note anywhere unexpected.
 */

const { resolveProvider, USE_CASES } = require('../../bot/shared/services/tts/routing');

describe('tts routing — the voice switch', () => {
  it('is legacy when nothing is set', () => {
    expect(resolveProvider({ useCase: 'conversation', site: 'voice_reply', env: {} }))
      .toEqual({ provider: 'legacy', source: 'default', ignored: [] });
  });

  it('TTS_PROVIDER switches every voice note', () => {
    const env = { TTS_PROVIDER: 'soniox' };
    for (const [useCase, { sites }] of Object.entries(USE_CASES)) {
      for (const site of sites) {
        expect(resolveProvider({ useCase, site, env }).provider).toBe('soniox');
      }
    }
  });

  it('a use-case setting beats the global one, and a site setting beats both', () => {
    const env = {
      TTS_PROVIDER: 'soniox',
      TTS_PROVIDER_COACHING: 'legacy',
      TTS_PROVIDER_COACHING_REPORT_VOICENOTE: 'soniox',
    };
    expect(resolveProvider({ useCase: 'coaching', site: 'question', env }))
      .toMatchObject({ provider: 'legacy', source: 'TTS_PROVIDER_COACHING' });
    expect(resolveProvider({ useCase: 'coaching', site: 'report_voicenote', env }))
      .toMatchObject({ provider: 'soniox', source: 'TTS_PROVIDER_COACHING_REPORT_VOICENOTE' });
    expect(resolveProvider({ useCase: 'reading', site: 'feedback', env }))
      .toMatchObject({ provider: 'soniox', source: 'TTS_PROVIDER' });
  });

  it('reads values case-insensitively and trims them', () => {
    expect(resolveProvider({ useCase: 'video', site: 'narration', env: { TTS_PROVIDER_VIDEO: '  Soniox ' } }).provider)
      .toBe('soniox');
  });

  it('a value naming no provider is reported and skipped, never obeyed', () => {
    const r = resolveProvider({
      useCase: 'conversation', site: 'voice_reply',
      env: { TTS_PROVIDER_CONVERSATION: 'sonix', TTS_PROVIDER: 'soniox' },
    });
    expect(r.provider).toBe('soniox');
    expect(r.ignored).toEqual(['TTS_PROVIDER_CONVERSATION=sonix']);
  });

  it('throws on a use case or site the platform does not have, so a caller bug fails in its tests', () => {
    expect(() => resolveProvider({ useCase: 'lp_qa', site: 'reply', env: {} })).toThrow(/unknown use case/);
    expect(() => resolveProvider({ useCase: 'coaching', site: 'nope', env: {} })).toThrow(/unknown site/);
  });

  it('covers exactly the platform features that speak', () => {
    expect(USE_CASES).toEqual({
      conversation: { sites: ['voice_reply', 'language_switch', 'name_question', 'name_retry'] },
      coaching: { sites: ['question', 'closer', 'report_voicenote'] },
      reading: { sites: ['feedback'] },
      video: { sites: ['narration'] },
    });
  });
});
