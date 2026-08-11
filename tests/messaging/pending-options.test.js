/**
 * pending-options.js — the store that makes numbered menus answerable on the
 * Baileys driver.
 *
 * Redis is stubbed to fail so the in-memory fallback path is what runs here
 * (and so no real connection is opened); a separate test asserts the Redis path
 * is used when it works.
 */

function loadStore({ redisImpl } = {}) {
  jest.resetModules();
  jest.doMock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
  const redis = redisImpl || {
    set: jest.fn().mockRejectedValue(new Error('redis down')),
    get: jest.fn().mockRejectedValue(new Error('redis down')),
    delete: jest.fn().mockRejectedValue(new Error('redis down')),
  };
  jest.doMock('../../bot/shared/services/cache/railway-redis.service', () => redis);
  const store = require('../../bot/shared/services/messaging/pending-options');
  store._resetForTests();
  return { store, redis };
}

const MENU = {
  replyType: 'list_reply',
  options: [
    { id: 'lang_auto', title: 'Auto-detect' },
    { id: 'lang_en', title: 'English' },
    { id: 'lang_ur', title: 'اردو' },
  ],
};

afterEach(() => jest.resetModules());

describe('resolveSelection', () => {
  it('maps a bare in-range number to the option at that position', () => {
    const { store } = loadStore();
    expect(store.resolveSelection(MENU, '1')).toEqual({ id: 'lang_auto', title: 'Auto-detect' });
    expect(store.resolveSelection(MENU, '2')).toEqual({ id: 'lang_en', title: 'English' });
    expect(store.resolveSelection(MENU, '3')).toEqual({ id: 'lang_ur', title: 'اردو' });
  });

  it('tolerates surrounding whitespace', () => {
    const { store } = loadStore();
    expect(store.resolveSelection(MENU, '  2  ')).toEqual({ id: 'lang_en', title: 'English' });
  });

  it('rejects out-of-range numbers rather than guessing', () => {
    const { store } = loadStore();
    expect(store.resolveSelection(MENU, '0')).toBeNull();
    expect(store.resolveSelection(MENU, '4')).toBeNull();
    expect(store.resolveSelection(MENU, '99')).toBeNull();
  });

  it('rejects prose and empty input — a pending menu does not mean the user is answering it', () => {
    // The user may simply be saying something else while a menu is open;
    // treating that as a selection would hijack normal conversation.
    const { store } = loadStore();
    expect(store.resolveSelection(MENU, 'what can you do?')).toBeNull();
    expect(store.resolveSelection(MENU, '')).toBeNull();
    expect(store.resolveSelection(MENU, 'tell me about lesson plans')).toBeNull();
  });
});

describe('resolveSelection — cases found by live testing', () => {
  // A teacher's classes are literally NAMED with digits. Replying "5" to
  // ["4 - B", "5"] means the class called 5, not item five of two — and treating
  // it as an out-of-range position sent the reply to general AI chat, leaving
  // /quiz stalled with no explanation.
  const CLASSES = {
    replyType: 'list_reply',
    options: [
      { id: 'cls_a', title: '4 - B', description: 'Tap to select this class' },
      { id: 'cls_b', title: '5', description: 'Tap to select this class' },
    ],
  };

  it('falls back to an exact NAME match when a number is out of range', () => {
    const { store } = loadStore();
    expect(store.resolveSelection(CLASSES, '5')).toEqual(expect.objectContaining({ id: 'cls_b' }));
  });

  it('still prefers the POSITION when the number is in range', () => {
    // "2" is what the rendered "2. 5" line asked for, so position wins.
    const { store } = loadStore();
    expect(store.resolveSelection(CLASSES, '2')).toEqual(expect.objectContaining({ id: 'cls_b' }));
    expect(store.resolveSelection(CLASSES, '1')).toEqual(expect.objectContaining({ id: 'cls_a' }));
  });

  it('matches a class named "4" by its first word, not by position', () => {
    const { store } = loadStore();
    expect(store.resolveSelection(CLASSES, '4')).toEqual(expect.objectContaining({ id: 'cls_a' }));
  });

  it('a short NON-numeric reply still matches nothing (too collision-prone)', () => {
    const { store } = loadStore();
    expect(store.resolveSelection(CLASSES, 'ok')).toBeNull();
    expect(store.resolveSelection(CLASSES, 'hi')).toBeNull();
  });

  it('an out-of-range number matching no name is still nothing', () => {
    const { store } = loadStore();
    expect(store.resolveSelection(CLASSES, '9')).toBeNull();
  });

  // The video picker renders "Chapter · Title"; a teacher types the part that
  // names the video, which is the half after the separator.
  const VIDEOS = {
    replyType: 'list_reply',
    options: [
      { id: 'v1', title: 'Life Cycles of Living Things · Life Cycle of a Butterfly' },
      { id: 'v2', title: 'Life Cycles of Living Things · Life Cycle of a Frog' },
      { id: 'v3', title: 'Inventors and Inventions · Who Invented the Radio?' },
    ],
  };

  it('matches the identifying half of a "Group · Item" label', () => {
    const { store } = loadStore();
    expect(store.resolveSelection(VIDEOS, 'Life Cycle of a Frog')).toEqual(expect.objectContaining({ id: 'v2' }));
  });

  it('matches a distinctive substring rather than demanding the whole title', () => {
    const { store } = loadStore();
    expect(store.resolveSelection(VIDEOS, 'butterfly')).toEqual(expect.objectContaining({ id: 'v1' }));
    expect(store.resolveSelection(VIDEOS, 'radio')).toEqual(expect.objectContaining({ id: 'v3' }));
  });

  it('refuses to guess when a substring matches several options', () => {
    const { store } = loadStore();
    // "life cycle" is in both v1 and v2 — ambiguity must resolve to nothing.
    expect(store.resolveSelection(VIDEOS, 'life cycle')).toBeNull();
  });

  it('does not let a 3-char substring match (that tier needs 4+)', () => {
    const { store } = loadStore();
    // "rad" is a substring of "Radio" but not a prefix of any label.
    expect(store.resolveSelection(VIDEOS, 'rad')).toBeNull();
  });
});

describe('resolveSelection by NAME (typing a number is unrealistic)', () => {
  // People shown a language list naturally type "Urdu", not "3".
  const LANGS = {
    replyType: 'list_reply',
    options: [
      { id: 'lang_auto', title: 'Auto-detect', description: 'Let me detect your language automatically' },
      { id: 'lang_en', title: 'English', description: 'English language' },
      { id: 'lang_ur', title: 'اردو', description: 'Urdu language' },
      { id: 'lang_es', title: 'Español', description: 'Spanish' },
    ],
  };

  it('matches an exact title, case-insensitively', () => {
    const { store } = loadStore();
    expect(store.resolveSelection(LANGS, 'English').id).toBe('lang_en');
    expect(store.resolveSelection(LANGS, 'english').id).toBe('lang_en');
    expect(store.resolveSelection(LANGS, '  ENGLISH  ').id).toBe('lang_en');
  });

  it('matches a non-Latin title by its Latin gloss — the whole point of keeping the description', () => {
    const { store } = loadStore();
    expect(store.resolveSelection(LANGS, 'Urdu').id).toBe('lang_ur');       // first word of description
    expect(store.resolveSelection(LANGS, 'urdu language').id).toBe('lang_ur'); // full description
    expect(store.resolveSelection(LANGS, 'اردو').id).toBe('lang_ur');       // the title itself
  });

  it('matches the non-Latin title directly, and an exact description', () => {
    const { store } = loadStore();
    expect(store.resolveSelection(LANGS, 'Spanish').id).toBe('lang_es');
  });

  it('accepts a UNIQUE prefix of 3+ chars', () => {
    const { store } = loadStore();
    expect(store.resolveSelection(LANGS, 'eng').id).toBe('lang_en');
    expect(store.resolveSelection(LANGS, 'auto').id).toBe('lang_auto');
  });

  it('refuses to guess when a prefix is ambiguous', () => {
    const { store } = loadStore();
    const ambiguous = {
      replyType: 'list_reply',
      options: [{ id: 'a', title: 'Reading' }, { id: 'b', title: 'Reading Assessment' }],
    };
    // "read" prefixes both — better to fall through than pick wrong.
    expect(store.resolveSelection(ambiguous, 'read')).toBeNull();
  });

  it('ignores 1-2 char text as too collision-prone', () => {
    const { store } = loadStore();
    expect(store.resolveSelection(LANGS, 'en')).toBeNull();
    expect(store.resolveSelection(LANGS, 'e')).toBeNull();
  });

  it('still prefers a numeric answer', () => {
    const { store } = loadStore();
    expect(store.resolveSelection(LANGS, '3').id).toBe('lang_ur');
  });

  it('tolerates trailing punctuation', () => {
    const { store } = loadStore();
    expect(store.resolveSelection(LANGS, 'English.').id).toBe('lang_en');
    expect(store.resolveSelection(LANGS, 'english!').id).toBe('lang_en');
  });

  it('is null-safe with no pending menu', () => {
    const { store } = loadStore();
    expect(store.resolveSelection(null, '1')).toBeNull();
    expect(store.resolveSelection({ options: [] }, '1')).toBeNull();
    expect(store.resolveSelection(MENU, undefined)).toBeNull();
  });
});

describe('remember / get / clear', () => {
  it('round-trips a menu through the in-memory fallback when Redis is down', async () => {
    const { store } = loadStore();
    await store.remember('923001234567', MENU);
    await expect(store.get('923001234567')).resolves.toEqual(MENU);
  });

  it('prefers Redis when it works, and writes with a TTL', async () => {
    const redis = {
      set: jest.fn().mockResolvedValue('OK'),
      get: jest.fn().mockResolvedValue(JSON.stringify(MENU)),
      delete: jest.fn().mockResolvedValue(1),
    };
    const { store } = loadStore({ redisImpl: redis });

    await store.remember('923001234567', MENU);
    expect(redis.set).toHaveBeenCalledWith(
      'baileys:pending-options:923001234567',
      JSON.stringify({ replyType: MENU.replyType, options: MENU.options }),
      store.TTL_SECONDS
    );

    await expect(store.get('923001234567')).resolves.toEqual(MENU);
  });

  it('clear() removes the menu so the same number cannot be replayed', async () => {
    const { store } = loadStore();
    await store.remember('923001234567', MENU);
    await store.clear('923001234567');
    await expect(store.get('923001234567')).resolves.toBeNull();
  });

  it('keeps menus per-user', async () => {
    const { store } = loadStore();
    await store.remember('923001234567', MENU);
    await expect(store.get('923009999999')).resolves.toBeNull();
  });

  it('a later menu replaces the earlier one for the same user', async () => {
    const { store } = loadStore();
    const second = { replyType: 'button_reply', options: [{ id: 'coaching_confirm_1', title: 'Yes' }] };
    await store.remember('923001234567', MENU);
    await store.remember('923001234567', second);
    await expect(store.get('923001234567')).resolves.toEqual(second);
  });

  it('ignores empty menus and missing phone numbers', async () => {
    const { store } = loadStore();
    await store.remember('923001234567', { replyType: 'list_reply', options: [] });
    await expect(store.get('923001234567')).resolves.toBeNull();
    await expect(store.get('')).resolves.toBeNull();
  });

  it('warns when Redis silently declines the write (set() returns false, does not throw)', async () => {
    // railway-redis.service.set() returns FALSE when Redis isn't ready rather
    // than throwing, so a try/catch alone sees success. Without this check an
    // unpersisted menu is invisible until a user's numeric reply mysteriously
    // does nothing after a restart.
    const logToFile = jest.fn();
    jest.resetModules();
    jest.doMock('../../bot/shared/utils/logger', () => ({ logToFile }));
    jest.doMock('../../bot/shared/services/cache/railway-redis.service', () => ({
      set: jest.fn().mockResolvedValue(false), // the silent-decline shape
      get: jest.fn().mockResolvedValue(null),
      delete: jest.fn().mockResolvedValue(false),
    }));
    const store = require('../../bot/shared/services/messaging/pending-options');
    store._resetForTests();

    await store.remember('923001234567', MENU);

    expect(logToFile.mock.calls.some(([msg]) => /Redis unavailable/i.test(msg))).toBe(true);
    // …and the menu still works in-process.
    await expect(store.get('923001234567')).resolves.toEqual(MENU);
  });

  it('a Redis failure never throws out of remember/get/clear', async () => {
    const { store } = loadStore();
    await expect(store.remember('923001234567', MENU)).resolves.toBeUndefined();
    await expect(store.get('923001234567')).resolves.toEqual(MENU);
    await expect(store.clear('923001234567')).resolves.toBeUndefined();
  });
});
