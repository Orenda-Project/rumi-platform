/**
 * text-flow-definitions.js — the text stand-ins for this deployment's Flows.
 *
 * The reading-assessment definition is a CONTRACT, not just a questionnaire: it
 * synthesises the same `nfm_reply` webhook a real Meta Flow submits, so
 * whatsapp-bot.js's dispatch and flow-response.handler.js run unchanged. These
 * tests pin the field names and value formats against the REAL consumers
 * (flow-type-detector.js, and the parsing in flow-response.handler.js), so a
 * rename on either side fails here instead of at runtime on a live deployment.
 */

const path = require('path');
const fs = require('fs');

// HOISTED on purpose. These route modules pull in supabase, and the endpoint-
// backed definitions require them lazily *inside* their builders — so a
// doMock() registered later in load() was missed under a full-suite run and the
// tests hit the real database (7s timeouts). jest.mock is hoisted above every
// require in this file, which cannot be missed.
jest.mock('../../bot/shared/routes/student-videos-endpoint', () => ({
  handleStudentVideosInit: jest.fn(async () => ({ screen: 'SELECT_GRADE', data: { grades: [{ id: '1', title: 'Grade 1' }] } })),
  handleStudentVideosDataExchange: jest.fn(async () => ({ screen: 'SUCCESS', data: {} })),
}));
jest.mock('../../bot/shared/routes/settings-endpoint', () => ({
  handleSettingsInit: jest.fn(async () => ({ screen: 'SETTINGS_MAIN', data: { languages: [{ id: 'en', title: 'English' }], frameworks: [{ id: 'oecd', title: 'OECD' }] } })),
  handleSettingsDataExchange: jest.fn(async () => ({ screen: 'SUCCESS', data: { confirmation_message: 'Saved.' } })),
}));
jest.mock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
jest.mock('../../bot/shared/services/cache/railway-redis.service', () => ({
  set: jest.fn(async () => false), get: jest.fn(async () => null), delete: jest.fn(async () => false),
}));

function load() {
  jest.clearAllMocks();
  const definitions = require('../../bot/shared/services/messaging/text-flow-definitions');
  const textFlow = require('../../bot/shared/services/messaging/text-flow');
  const pending = require('../../bot/shared/services/messaging/pending-options');
  textFlow._resetForTests();
  pending._resetForTests();
  definitions._resetForTests();
  definitions.ensureRegistered();
  return { definitions, textFlow, pending };
}

const PHONE = '923001234567';
const CTX = { _ctx: { userId: 'user-7', flowToken: 'user-7:reading-assessment:1', phone: PHONE } };

afterEach(() => jest.resetModules());

/** Walks a flow to completion, answering each step with the given replies. */
async function run(textFlow, kind, replies, ctx = CTX) {
  await textFlow.start(PHONE, kind, {}, ctx);
  let last;
  for (const reply of replies) {
    last = await textFlow.advance(PHONE, reply);
    if (last?.status === 'unmatched') throw new Error(`"${reply}" did not answer the current step`);
  }
  return last;
}

describe('registration', () => {
  it('registers the three flows a sandbox needs, and is idempotent', () => {
    const { definitions, textFlow } = load();
    for (const kind of ['student-videos', 'settings', 'reading-assessment']) {
      expect(textFlow.getDefinition(kind)).toBeTruthy();
    }
    definitions.ensureRegistered(); // second call must not throw or duplicate
    expect(textFlow.getDefinition('settings').kind).toBe('settings');
  });
});

describe('reading-assessment: the synthesised submission is routable', () => {
  it('produces an nfm_reply that flow-type-detector routes to reading_assessment', async () => {
    const { textFlow } = load();
    const definition = textFlow.getDefinition('reading-assessment');

    const done = await run(textFlow, 'reading-assessment', [
      'Aisha Khan', 'English', 'Choose the level myself', 'Sentences', 'Fluency + Comprehension',
    ]);
    expect(done.status).toBe('complete');

    const { metaMessage } = await definition.onComplete(PHONE, done.answers, done.context);
    expect(metaMessage.type).toBe('interactive');
    expect(metaMessage.interactive.type).toBe('nfm_reply');

    const responseJson = JSON.parse(metaMessage.interactive.nfm_reply.response_json);
    const { detectFlowType } = require('../../bot/shared/utils/flow-type-detector');
    expect(detectFlowType(responseJson)).toBe('reading_assessment');
  });

  it('carries the exact fields+formats flow-response.handler.js parses', async () => {
    const { textFlow } = load();
    const definition = textFlow.getDefinition('reading-assessment');

    const done = await run(textFlow, 'reading-assessment', [
      'Aisha Khan', 'Urdu', 'Choose the level myself', 'Words', 'Fluency only',
    ]);
    const { metaMessage } = await definition.onComplete(PHONE, done.answers, done.context);
    const responseJson = JSON.parse(metaMessage.interactive.nfm_reply.response_json);

    expect(responseJson.Student_Full_Name).toBe('Aisha Khan');
    // "index_Label": the handler splits on "_" and matches the label, mapping
    // anything that isn't English to 'ur'.
    expect(responseJson.Language).toBe('1_Urdu');
    expect(responseJson.Assessment_Mode).toBe('1_Manual');
    // The handler reads the LEADING INDEX to pick the passage type
    // (0 letters, 1 words, 2 sentences, 3 paragraph).
    expect(responseJson.Select_the_reading_level).toMatch(/^1_/);
    // Comprehension is decided by whether the scope value CONTAINS "Comprehension".
    expect(responseJson.Scope_of_Assessment_).toBe('0_Fluency_Only');
    expect(responseJson.Scope_of_Assessment_).not.toMatch(/Comprehension/);
  });

  it('marks comprehension as required when the teacher asks for it', async () => {
    const { textFlow } = load();
    const definition = textFlow.getDefinition('reading-assessment');
    const done = await run(textFlow, 'reading-assessment', [
      'Bilal', 'English', 'Automatic', 'Fluency + Comprehension',
    ]);
    const { metaMessage } = await definition.onComplete(PHONE, done.answers, done.context);
    const responseJson = JSON.parse(metaMessage.interactive.nfm_reply.response_json);
    expect(responseJson.Scope_of_Assessment_).toMatch(/Comprehension/);
  });

  it('skips the level question in automatic mode, but still sends a parseable level', async () => {
    // The handler ignores the level in auto mode (it starts at story and adapts),
    // so asking would be a question with no effect — but the field must still
    // parse, because its absence is treated as a missing required field.
    const { textFlow } = load();
    const definition = textFlow.getDefinition('reading-assessment');

    await textFlow.start(PHONE, 'reading-assessment', {}, CTX);
    await textFlow.advance(PHONE, 'Bilal');
    await textFlow.advance(PHONE, 'English');
    const afterMode = await textFlow.advance(PHONE, 'Automatic');

    // straight to scope — the level step was skipped
    expect(afterMode.status).toBe('step');
    expect(afterMode.render.options.map((o) => o.title)).toEqual(
      expect.arrayContaining(['Fluency only', 'Fluency + Comprehension'])
    );

    const done = await textFlow.advance(PHONE, 'Fluency only');
    expect(done.status).toBe('complete');
    expect(done.answers.Select_the_reading_level).toBeUndefined();

    const { metaMessage } = await definition.onComplete(PHONE, done.answers, done.context);
    const responseJson = JSON.parse(metaMessage.interactive.nfm_reply.response_json);
    expect(responseJson.Select_the_reading_level).toMatch(/^\d+_/);
  });

  it('accepts the student name as free text (any name, not a menu pick)', async () => {
    const { textFlow } = load();
    const first = await textFlow.start(PHONE, 'reading-assessment', {}, CTX);
    expect(first.kind).toBe('text');

    const next = await textFlow.advance(PHONE, "Zoya D'Souza-Ali");
    expect(next.status).toBe('step');
  });

  it('the level options cover the four passage types the handler maps', async () => {
    const { READING_LEVELS } = require('../../bot/shared/services/messaging/text-flow-definitions');
    expect(READING_LEVELS.map((l) => l.id)).toEqual(['0_Letters', '1_Words', '2_Sentences', '3_Paragraph']);
  });
});

describe('the fields are the ones the real handler actually reads', () => {
  // Guards against a rename drifting the two apart: assert the handler's source
  // mentions every field name the definition emits.
  it('flow-response.handler.js references each synthesised field name', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../../bot/shared/handlers/flow-response.handler.js'), 'utf-8'
    );
    for (const field of [
      'Student_Full_Name', 'Language', 'Assessment_Mode', 'Select_the_reading_level', 'Scope_of_Assessment_',
    ]) {
      expect(src).toContain(field);
    }
  });
});

describe('endpoint-backed definitions are wired to the real endpoints', () => {
  it('student-videos drives the student-videos endpoint', async () => {
    const { textFlow } = load();
    const endpoint = require('../../bot/shared/routes/student-videos-endpoint');
    const first = await textFlow.start(PHONE, 'student-videos', {}, {
      _ctx: { userId: 'user-7', flowToken: 'user-7:student-videos:1', phone: PHONE },
    });

    expect(endpoint.handleStudentVideosInit).toHaveBeenCalledWith('user-7:student-videos:1');
    expect(first.options.map((o) => o.title)).toEqual(['Grade 1']);
  });

  it('settings drives the settings endpoint with the user id', async () => {
    const { textFlow } = load();
    const endpoint = require('../../bot/shared/routes/settings-endpoint');
    await textFlow.start(PHONE, 'settings', {}, {
      _ctx: { userId: 'user-7', flowToken: 'user-7:settings:1', phone: PHONE },
    });
    expect(endpoint.handleSettingsInit).toHaveBeenCalledWith('user-7');
  });

  it('settings writes both preferences through the endpoint', async () => {
    const { textFlow } = load();
    const endpoint = require('../../bot/shared/routes/settings-endpoint');
    const definition = textFlow.getDefinition('settings');

    const done = await run(textFlow, 'settings', ['English', 'OECD'], {
      _ctx: { userId: 'user-7', flowToken: 'user-7:settings:1', phone: PHONE },
    });
    const outcome = await definition.onComplete(PHONE, done.answers, done.context);

    expect(endpoint.handleSettingsDataExchange).toHaveBeenCalledWith(
      'user-7', 'SETTINGS_MAIN', { language: 'en', observation_framework: 'oecd' }, 'user-7:settings:1'
    );
    expect(outcome.text).toContain('Saved.');
  });
});
