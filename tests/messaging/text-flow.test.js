/**
 * text-flow.js — the multi-step text flow engine that stands in for a Meta
 * WhatsApp Flow form on the sandbox driver.
 *
 * Redis is stubbed so the in-memory fallback is what runs (and so no real
 * connection is opened, which would keep Jest alive).
 */

function load({ redisWorks = false } = {}) {
  jest.resetModules();
  jest.doMock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
  const store = new Map();
  jest.doMock('../../bot/shared/services/cache/railway-redis.service', () => ({
    set: jest.fn(async (k, v) => (redisWorks ? (store.set(k, v), true) : false)),
    get: jest.fn(async (k) => (redisWorks ? store.get(k) || null : null)),
    delete: jest.fn(async (k) => (redisWorks ? store.delete(k) : false)),
  }));
  const textFlow = require('../../bot/shared/services/messaging/text-flow');
  const pending = require('../../bot/shared/services/messaging/pending-options');
  textFlow._resetForTests();
  pending._resetForTests();
  return { textFlow, pending };
}

const PHONE = '923001234567';

/** grade -> subject picker, with the second step's options depending on the first. */
function videoLikeFlow(onComplete = jest.fn()) {
  return {
    kind: 'student-videos',
    steps: [
      {
        id: 'grade',
        prompt: async () => ({ header: 'Pick a class' }),
        options: async () => [
          { id: 'grade_1', title: 'Grade 1' },
          { id: 'grade_2', title: 'Grade 2' },
        ],
      },
      {
        id: 'subject',
        prompt: async (answers) => ({ header: `Subjects for ${answers.grade.title}` }),
        options: async (answers) => (answers.grade.id === 'grade_1'
          ? [{ id: 'subj_maths', title: 'Maths' }]
          : [{ id: 'subj_urdu', title: 'Urdu' }, { id: 'subj_sci', title: 'Science' }]),
      },
    ],
    onComplete,
  };
}

afterEach(() => jest.resetModules());

describe('registration', () => {
  it('rejects a malformed definition', () => {
    const { textFlow } = load();
    expect(() => textFlow.register({})).toThrow(/needs \{ kind, steps/);
    expect(() => textFlow.register({ kind: 'x' })).toThrow(/needs \{ kind, steps/);
  });

  it('start() returns null for an unregistered kind so the caller can fall back', async () => {
    const { textFlow } = load();
    await expect(textFlow.start(PHONE, 'nope')).resolves.toBeNull();
  });
});

describe('stepping through a flow', () => {
  it('renders the first step and records its menu for number-or-name matching', async () => {
    const { textFlow, pending } = load();
    textFlow.register(videoLikeFlow());

    const first = await textFlow.start(PHONE, 'student-videos');

    expect(first.kind).toBe('menu');
    expect(first.prompt.header).toBe('Pick a class');
    expect(first.options.map((o) => o.id)).toEqual(['grade_1', 'grade_2']);
    // the menu must be answerable
    const menu = await pending.get(PHONE);
    expect(pending.resolveSelection(menu, '2').id).toBe('grade_2');
  });

  it('advances on a NUMBER and computes the next step from the previous answer', async () => {
    const { textFlow } = load();
    textFlow.register(videoLikeFlow());
    await textFlow.start(PHONE, 'student-videos');

    const next = await textFlow.advance(PHONE, '2'); // Grade 2

    expect(next.status).toBe('step');
    expect(next.render.prompt.header).toBe('Subjects for Grade 2');
    // dynamic: Grade 2's subjects, not Grade 1's
    expect(next.render.options.map((o) => o.id)).toEqual(['subj_urdu', 'subj_sci']);
  });

  it('advances on a NAME too', async () => {
    const { textFlow } = load();
    textFlow.register(videoLikeFlow());
    await textFlow.start(PHONE, 'student-videos');

    const next = await textFlow.advance(PHONE, 'Grade 1');
    expect(next.render.options.map((o) => o.id)).toEqual(['subj_maths']);
  });

  it('completes after the last step and returns all answers', async () => {
    const { textFlow } = load();
    textFlow.register(videoLikeFlow());
    await textFlow.start(PHONE, 'student-videos');
    await textFlow.advance(PHONE, '2');

    const done = await textFlow.advance(PHONE, 'Science');

    expect(done.status).toBe('complete');
    expect(done.answers.grade.id).toBe('grade_2');
    expect(done.answers.subject.id).toBe('subj_sci');
    // flow is over — state cleared
    await expect(textFlow.isActive(PHONE)).resolves.toBe(false);
  });
});

describe('not hijacking normal conversation', () => {
  it('returns "unmatched" for prose so the caller can handle it as an ordinary message', async () => {
    // A pending flow must NOT mean every message answers it.
    const { textFlow } = load();
    textFlow.register(videoLikeFlow());
    await textFlow.start(PHONE, 'student-videos');

    const r = await textFlow.advance(PHONE, 'actually what can you do?');
    expect(r.status).toBe('unmatched');
    // still active, so a later valid answer works
    await expect(textFlow.isActive(PHONE)).resolves.toBe(true);
  });

  it('counts consecutive unmatched replies so the caller can stop trapping the user', async () => {
    // Not every command starts with "/" — "add class" mid-flow looks like a
    // wrong answer. The strike count is what lets the caller give up.
    const { textFlow } = load();
    textFlow.register(videoLikeFlow());
    await textFlow.start(PHONE, 'student-videos');

    expect((await textFlow.advance(PHONE, 'add class')).strikes).toBe(1);
    expect((await textFlow.advance(PHONE, 'add class')).strikes).toBe(2);
  });

  it('resets the strike count once the user answers correctly', async () => {
    const { textFlow } = load();
    textFlow.register(videoLikeFlow());
    await textFlow.start(PHONE, 'student-videos');

    await textFlow.advance(PHONE, 'gibberish');
    const ok = await textFlow.advance(PHONE, '1');
    expect(ok.status).toBe('step');

    // a single later slip must not immediately trip the give-up threshold
    expect((await textFlow.advance(PHONE, 'gibberish')).strikes).toBe(1);
  });

  it('advance() returns null when no flow is active', async () => {
    const { textFlow } = load();
    textFlow.register(videoLikeFlow());
    await expect(textFlow.advance(PHONE, '1')).resolves.toBeNull();
  });

  it('lets the user escape with cancel/stop/exit', async () => {
    for (const word of ['cancel', 'STOP', 'exit', 'never mind']) {
      const { textFlow } = load();
      textFlow.register(videoLikeFlow());
      await textFlow.start(PHONE, 'student-videos');

      const r = await textFlow.advance(PHONE, word);
      expect(r.status).toBe('cancelled');
      await expect(textFlow.isActive(PHONE)).resolves.toBe(false);
    }
  });
});

describe('free-text steps', () => {
  it('accepts any non-empty text and rejects blank', async () => {
    const { textFlow } = load();
    textFlow.register({
      kind: 'ask-topic',
      steps: [{ id: 'topic', freeText: true, prompt: async () => ({ body: 'What topic?' }) }],
      onComplete: jest.fn(),
    });

    const first = await textFlow.start(PHONE, 'ask-topic');
    expect(first.kind).toBe('text');

    await expect(textFlow.advance(PHONE, '   ')).resolves.toMatchObject({ status: 'unmatched' });

    const done = await textFlow.advance(PHONE, 'photosynthesis');
    expect(done.status).toBe('complete');
    expect(done.answers.topic.title).toBe('photosynthesis');
  });
});

describe('state persistence', () => {
  it('survives a restart when Redis is working', async () => {
    const { textFlow } = load({ redisWorks: true });
    textFlow.register(videoLikeFlow());
    await textFlow.start(PHONE, 'student-videos');
    await textFlow.advance(PHONE, '2');

    const state = await textFlow.getState(PHONE);
    expect(state).toMatchObject({ kind: 'student-videos', stepIndex: 1 });
    expect(state.answers.grade.id).toBe('grade_2');
  });

  it('a step with no options returns "empty" rather than crashing', async () => {
    const { textFlow } = load();
    textFlow.register({
      kind: 'barren',
      steps: [{ id: 'nothing', options: async () => [] }],
      onComplete: jest.fn(),
    });

    const first = await textFlow.start(PHONE, 'barren');
    expect(first.kind).toBe('empty');
  });
});
