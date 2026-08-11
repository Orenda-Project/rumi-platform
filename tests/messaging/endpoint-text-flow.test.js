/**
 * endpoint-text-flow.js — drives a real WhatsApp Flow ENDPOINT over chat.
 *
 * The endpoint contract under test:
 *   INIT                        -> { screen, data: { <rows>, ...values } }
 *   data_exchange(screen, data) -> same, or { data: { error: { message } } }
 *
 * The point of these tests is that the endpoint is called the way a Flow client
 * would call it — right screen, accumulated screenData — and that its side
 * effects happen EXACTLY ONCE, on submission.
 */

function load() {
  jest.resetModules();
  jest.doMock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
  jest.doMock('../../bot/shared/services/cache/railway-redis.service', () => ({
    set: jest.fn(async () => false), get: jest.fn(async () => null), delete: jest.fn(async () => false),
  }));
  const textFlow = require('../../bot/shared/services/messaging/text-flow');
  const { buildEndpointFlow } = require('../../bot/shared/services/messaging/endpoint-text-flow');
  const pending = require('../../bot/shared/services/messaging/pending-options');
  textFlow._resetForTests();
  pending._resetForTests();
  return { textFlow, buildEndpointFlow, pending };
}

const PHONE = '923001234567';
const CTX = { _ctx: { userId: 'user-1', flowToken: 'user-1:videos:9', phone: PHONE } };

/** A stand-in for student-videos-endpoint.js: 3 screens, last one "sends". */
function fakeVideoEndpoint() {
  const calls = [];
  return {
    calls,
    init: async (ctx) => {
      calls.push(['INIT', ctx.flowToken]);
      return { screen: 'SELECT_GRADE', data: { grades: [{ id: '1', title: 'Grade 1' }, { id: '2', title: 'Grade 2' }] } };
    },
    exchange: async (ctx, screen, screenData) => {
      calls.push([screen, { ...screenData }]);
      if (screen === 'SELECT_GRADE') {
        return { screen: 'SELECT_SUBJECT', data: { subjects: [{ id: 'maths', title: 'Maths' }, { id: 'sci', title: 'Science' }] } };
      }
      if (screen === 'SELECT_SUBJECT') {
        return {
          screen: 'SELECT_TOPIC',
          data: { videos: [{ id: 'v9', title: 'Life Cycles · Butterfly' }], header_text: 'Grade 2 — Science' },
        };
      }
      return { screen: 'SUCCESS', data: { message: 'on its way' } };
    },
  };
}

function videoFlow(endpoint, buildEndpointFlow) {
  return buildEndpointFlow({
    kind: 'student-videos',
    init: endpoint.init,
    exchange: endpoint.exchange,
    stages: [
      { screen: 'SELECT_GRADE', fields: [{ id: 'grade', optionsKey: 'grades', prompt: () => ({ body: 'Which class?' }) }] },
      { screen: 'SELECT_SUBJECT', fields: [{ id: 'subject', optionsKey: 'subjects' }] },
      {
        screen: 'SELECT_TOPIC',
        fields: [{
          id: 'video',
          optionsKey: 'videos',
          prompt: (a, c) => ({ header: c.response?.data?.header_text }),
        }],
      },
    ],
    onFinish: (res) => res.data.message,
  });
}

afterEach(() => jest.resetModules());

describe('driving a 3-screen endpoint over chat', () => {
  it('asks each screen in turn, accumulating screenData like a Flow client', async () => {
    const { textFlow, buildEndpointFlow } = load();
    const endpoint = fakeVideoEndpoint();
    textFlow.register(videoFlow(endpoint, buildEndpointFlow));

    const first = await textFlow.start(PHONE, 'student-videos', {}, CTX);
    expect(first.kind).toBe('menu');
    expect(first.prompt.body).toBe('Which class?');
    expect(first.options.map((o) => o.title)).toEqual(['Grade 1', 'Grade 2']);

    const second = await textFlow.advance(PHONE, '2');
    expect(second.status).toBe('step');
    expect(second.render.options.map((o) => o.id)).toEqual(['maths', 'sci']);

    const third = await textFlow.advance(PHONE, 'Science');
    expect(third.render.prompt.header).toBe('Grade 2 — Science');

    // INIT, then one data_exchange per completed screen — with the answers so
    // far, keyed by field id, exactly as the Flow client submits them.
    expect(endpoint.calls).toEqual([
      ['INIT', 'user-1:videos:9'],
      ['SELECT_GRADE', { grade: '2' }],
      ['SELECT_SUBJECT', { grade: '2', subject: 'sci' }],
    ]);
  });

  it('submits the final screen exactly once, on completion', async () => {
    const { textFlow, buildEndpointFlow } = load();
    const endpoint = fakeVideoEndpoint();
    const definition = videoFlow(endpoint, buildEndpointFlow);
    textFlow.register(definition);

    await textFlow.start(PHONE, 'student-videos', {}, CTX);
    await textFlow.advance(PHONE, '2');
    await textFlow.advance(PHONE, 'Science');
    const done = await textFlow.advance(PHONE, 'butterfly'); // substring match

    expect(done.status).toBe('complete');
    const outcome = await definition.onComplete(PHONE, done.answers, done.context);
    expect(outcome.text).toBe('on its way');

    const submissions = endpoint.calls.filter(([screen]) => screen === 'SELECT_TOPIC');
    expect(submissions).toEqual([['SELECT_TOPIC', { grade: '2', subject: 'sci', video: 'v9' }]]);
  });

  it('never replays an earlier screen while rendering a later one', async () => {
    // Load-bearing: student-videos' final data_exchange SENDS A VIDEO. If
    // rendering step N recomputed the endpoint chain from scratch, a re-render
    // (a mistyped answer, say) would fire real side effects again.
    const { textFlow, buildEndpointFlow } = load();
    const endpoint = fakeVideoEndpoint();
    textFlow.register(videoFlow(endpoint, buildEndpointFlow));

    await textFlow.start(PHONE, 'student-videos', {}, CTX);
    await textFlow.advance(PHONE, '2');
    await textFlow.advance(PHONE, 'Science');

    const perScreen = endpoint.calls.map(([screen]) => screen);
    expect(perScreen.filter((s) => s === 'INIT')).toHaveLength(1);
    expect(perScreen.filter((s) => s === 'SELECT_GRADE')).toHaveLength(1);
  });
});

describe('several fields on ONE screen (the settings shape)', () => {
  function settingsLike(buildEndpointFlow, exchange) {
    return buildEndpointFlow({
      kind: 'settings',
      init: async () => ({
        screen: 'SETTINGS_MAIN',
        data: {
          languages: [{ id: 'en', title: 'English' }, { id: 'ur', title: 'Urdu' }],
          frameworks: [{ id: 'oecd', title: 'OECD' }, { id: 'teach', title: 'TEACH' }],
          info_text: 'Default for Pakistan: TEACH.',
        },
      }),
      exchange,
      stages: [{
        screen: 'SETTINGS_MAIN',
        fields: [
          { id: 'language', optionsKey: 'languages' },
          { id: 'observation_framework', optionsKey: 'frameworks', prompt: (a, c) => ({ footer: c.response.data.info_text }) },
        ],
      }],
      onFinish: (res) => res.data.confirmation_message,
    });
  }

  it('asks one question per field, then submits both together', async () => {
    const { textFlow, buildEndpointFlow } = load();
    const exchange = jest.fn(async () => ({ screen: 'SUCCESS', data: { confirmation_message: 'Saved.' } }));
    const definition = settingsLike(buildEndpointFlow, exchange);
    textFlow.register(definition);

    const first = await textFlow.start(PHONE, 'settings', {}, CTX);
    expect(first.options.map((o) => o.id)).toEqual(['en', 'ur']);

    const second = await textFlow.advance(PHONE, 'Urdu');
    expect(second.render.options.map((o) => o.id)).toEqual(['oecd', 'teach']);
    expect(second.render.prompt.footer).toBe('Default for Pakistan: TEACH.');
    // The second field of the same screen must NOT trigger a submission.
    expect(exchange).not.toHaveBeenCalled();

    const done = await textFlow.advance(PHONE, 'TEACH');
    const outcome = await definition.onComplete(PHONE, done.answers, done.context);

    expect(exchange).toHaveBeenCalledTimes(1);
    expect(exchange.mock.calls[0][1]).toBe('SETTINGS_MAIN');
    expect(exchange.mock.calls[0][2]).toEqual({ language: 'ur', observation_framework: 'teach' });
    expect(outcome.text).toBe('Saved.');
  });
});

describe('endpoint failures reach the user instead of crashing', () => {
  it("shows the endpoint's own error message when a screen has no rows", async () => {
    const { textFlow, buildEndpointFlow } = load();
    textFlow.register(buildEndpointFlow({
      kind: 'empty-lib',
      init: async () => ({ data: { error: { message: 'The video library is being prepared.' } } }),
      exchange: async () => ({}),
      stages: [{ screen: 'A', fields: [{ id: 'x', optionsKey: 'rows' }] }],
    }));

    const first = await textFlow.start(PHONE, 'empty-lib', {}, CTX);

    expect(first.kind).toBe('empty');
    expect(first.prompt.body).toBe('The video library is being prepared.');
    // and the user is not parked in an unanswerable flow
    await expect(textFlow.isActive(PHONE)).resolves.toBe(false);
  });

  it('a thrown endpoint becomes the configured fallback message, not an exception', async () => {
    const { textFlow, buildEndpointFlow } = load();
    textFlow.register(buildEndpointFlow({
      kind: 'boom',
      init: async () => { throw new Error('supabase down'); },
      exchange: async () => ({}),
      fallbackError: 'Not available right now.',
      stages: [{ screen: 'A', fields: [{ id: 'x', optionsKey: 'rows' }] }],
    }));

    const first = await textFlow.start(PHONE, 'boom', {}, CTX);
    expect(first.kind).toBe('empty');
    expect(first.prompt.body).toBe('Not available right now.');
  });

  it('a thrown FINAL exchange is reported, not swallowed as success', async () => {
    const { textFlow, buildEndpointFlow } = load();
    const definition = buildEndpointFlow({
      kind: 'boom-submit',
      init: async () => ({ screen: 'A', data: { rows: [{ id: 'r1', title: 'Row one' }] } }),
      exchange: async () => { throw new Error('write failed'); },
      fallbackError: 'Could not save that.',
      stages: [{ screen: 'A', fields: [{ id: 'x', optionsKey: 'rows' }] }],
    });
    textFlow.register(definition);

    await textFlow.start(PHONE, 'boom-submit', {}, CTX);
    const done = await textFlow.advance(PHONE, 'Row one');
    const outcome = await definition.onComplete(PHONE, done.answers, done.context);

    expect(outcome.text).toBe('Could not save that.');
  });

  it("surfaces a validation error the endpoint returns from the submission", async () => {
    const { textFlow, buildEndpointFlow } = load();
    const definition = buildEndpointFlow({
      kind: 'rejects',
      init: async () => ({ screen: 'A', data: { rows: [{ id: 'r1', title: 'Row one' }] } }),
      exchange: async () => ({ data: { error: { message: 'Invalid observation framework' } } }),
      stages: [{ screen: 'A', fields: [{ id: 'x', optionsKey: 'rows' }] }],
      onFinish: () => 'should not be used',
    });
    textFlow.register(definition);

    await textFlow.start(PHONE, 'rejects', {}, CTX);
    const done = await textFlow.advance(PHONE, 'Row one');

    expect((await definition.onComplete(PHONE, done.answers, done.context)).text)
      .toBe('Invalid observation framework');
  });
});

describe('config validation', () => {
  it('rejects a config missing its endpoint functions', () => {
    const { buildEndpointFlow } = load();
    expect(() => buildEndpointFlow({ kind: 'x', stages: [{ screen: 'A', fields: [] }] }))
      .toThrow(/needs \{ kind, init, exchange, stages/);
  });
});

describe('row normalisation', () => {
  it('drops rows a numbered menu could not offer, and coerces ids to strings', () => {
    const { buildEndpointFlow } = load();
    const { rowsFrom } = require('../../bot/shared/services/messaging/endpoint-text-flow');
    expect(buildEndpointFlow).toBeDefined();
    expect(rowsFrom({ data: { rows: [
      { id: 3, title: 'Grade 3' },
      { id: '', title: 'no id' },
      { id: 'x' }, // no title -> falls back to the id
      'plain',
    ] } }, 'rows')).toEqual([
      { id: '3', title: 'Grade 3' },
      { id: 'x', title: 'x' },
      { id: 'plain', title: 'plain' },
    ]);
  });

  it('returns nothing for a key the endpoint did not send', () => {
    load();
    const { rowsFrom } = require('../../bot/shared/services/messaging/endpoint-text-flow');
    expect(rowsFrom({ data: {} }, 'rows')).toEqual([]);
    expect(rowsFrom(null, 'rows')).toEqual([]);
  });
});
