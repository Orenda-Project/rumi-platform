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
  it('registers the five flows a sandbox needs, and is idempotent', () => {
    const { definitions, textFlow } = load();
    for (const kind of ['student-videos', 'settings', 'reading-assessment', 'class-setup', 'attendance-mark']) {
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

describe('attendance-mark: WhatsApp Baileys tap-to-mark, degraded to one free-text reply', () => {
  const ATTENDANCE_CTX = { _ctx: { userId: 'user-7', flowToken: 'user-7:attendance-mark:1', phone: PHONE } };

  // Both AttendanceConversationService's session AND text-flow.js's OWN
  // step-tracking state persist through this SAME mocked Redis client — a
  // blanket mockResolvedValue would make text-flow.js read back the
  // attendance session object as if it were its own {kind, stepIndex,
  // answers} state, breaking multi-step advancement entirely. Route by key
  // instead: the attendance session key returns the fixture, everything
  // else (text-flow.js's own key) goes through a real in-memory store.
  function mockSession(session) {
    const redis = require('../../bot/shared/services/cache/railway-redis.service');
    const sessionKey = 'attendance:session:user-7';
    const store = new Map();
    redis.get.mockImplementation(async (key) => {
      if (key === sessionKey) return session ? JSON.stringify(session) : null;
      return store.has(key) ? store.get(key) : null;
    });
    redis.set.mockImplementation(async (key, value) => { store.set(key, value); return true; });
    redis.delete.mockImplementation(async (key) => { store.delete(key); return true; });
  }

  const SESSION = {
    selectedClass: { class_name: 'Grade 3', section: 'A' },
    selectedListId: 'list-1',
    selectedDate: '2026-08-25',
    sessionType: 'morning',
    students: [
      { id: 's1', student_name: 'Zara Abdul' },
      { id: 's2', student_name: 'Ahmed Khan' },
      { id: 's3', student_name: 'Fatima Noor' },
    ],
  };

  it('lists the roster by number and asks who is absent', async () => {
    mockSession(SESSION);
    const { textFlow } = load();

    const first = await textFlow.start(PHONE, 'attendance-mark', {}, ATTENDANCE_CTX);
    expect(first.kind).toBe('text');
    expect(first.prompt.body).toContain('1. Zara Abdul');
    expect(first.prompt.body).toContain('2. Ahmed Khan');
    expect(first.prompt.body).toContain('3. Fatima Noor');
  });

  it('shows a "no students yet" prompt instead of an empty roster', async () => {
    mockSession({ ...SESSION, students: [] });
    const { textFlow } = load();

    const first = await textFlow.start(PHONE, 'attendance-mark', {}, ATTENDANCE_CTX);
    expect(first.prompt.body).toMatch(/no students yet/i);
  });

  it('produces an nfm_reply that flow-type-detector routes to attendance_marking', async () => {
    mockSession(SESSION);
    const { textFlow } = load();
    const definition = textFlow.getDefinition('attendance-mark');

    const done = await run(textFlow, 'attendance-mark', ['2, 3'], ATTENDANCE_CTX);
    expect(done.status).toBe('complete');

    const { metaMessage } = await definition.onComplete(PHONE, done.answers, done.context);
    const responseJson = JSON.parse(metaMessage.interactive.nfm_reply.response_json);
    const { detectFlowType } = require('../../bot/shared/utils/flow-type-detector');
    expect(detectFlowType(responseJson)).toBe('attendance_marking');
  });

  it('carries the exact fields+formats AttendanceFlowHandler/flow-response.handler.js parse', async () => {
    mockSession(SESSION);
    const { textFlow } = load();
    const definition = textFlow.getDefinition('attendance-mark');

    const done = await run(textFlow, 'attendance-mark', ['2'], ATTENDANCE_CTX);
    const { metaMessage } = await definition.onComplete(PHONE, done.answers, done.context);
    const responseJson = JSON.parse(metaMessage.interactive.nfm_reply.response_json);

    // flow_token format flow-response.handler.js splits on ':' —
    // userId:listId:date:sessionType:encodedClassName
    expect(responseJson.flow_token).toBe('user-7:list-1:2026-08-25:morning:Grade%203');
    expect(responseJson.absent_students).toEqual(['s2']);
    expect(responseJson.class_name).toBe('Grade 3');
    expect(responseJson.date_display).toBe('2026-08-25');
    expect(responseJson.session_type).toBe('morning');
  });

  it('"none" marks everyone present (an empty absent_students list)', async () => {
    mockSession(SESSION);
    const { textFlow } = load();
    const definition = textFlow.getDefinition('attendance-mark');

    const done = await run(textFlow, 'attendance-mark', ['none'], ATTENDANCE_CTX);
    const { metaMessage } = await definition.onComplete(PHONE, done.answers, done.context);
    const responseJson = JSON.parse(metaMessage.interactive.nfm_reply.response_json);
    expect(responseJson.absent_students).toEqual([]);
  });

  it('onComplete rejects with a clear message when no session exists (stale/expired)', async () => {
    mockSession(null);
    const { textFlow } = load();
    const definition = textFlow.getDefinition('attendance-mark');

    const done = await run(textFlow, 'attendance-mark', ['none'], ATTENDANCE_CTX);
    const outcome = await definition.onComplete(PHONE, done.answers, done.context);
    expect(outcome.text).toMatch(/no attendance session/i);
    expect(outcome.metaMessage).toBeUndefined();
  });
});

describe('parseAbsentAttendanceReply', () => {
  const { parseAbsentAttendanceReply } = require('../../bot/shared/services/messaging/text-flow-definitions');
  const students = [{ id: 's1' }, { id: 's2' }, { id: 's3' }];

  it('parses comma-separated numbers into the matching student ids', () => {
    expect(parseAbsentAttendanceReply('2, 3', students)).toEqual(['s2', 's3']);
  });

  it('parses space-separated numbers with no commas', () => {
    expect(parseAbsentAttendanceReply('1 3', students)).toEqual(['s1', 's3']);
  });

  it.each(['none', 'No One', 'NOBODY', 'everyone present', ''])('treats %j as everyone present', (reply) => {
    expect(parseAbsentAttendanceReply(reply, students)).toEqual([]);
  });

  it('ignores out-of-range numbers rather than throwing', () => {
    expect(parseAbsentAttendanceReply('1, 99', students)).toEqual(['s1']);
  });
});

describe('attendance-mark: the fields are the ones the real handler actually reads', () => {
  it('flow-response.handler.js + attendance-flow.handler.js reference each synthesised field name', () => {
    // flow_token/absent_students/class_name are read in flow-response.handler.js
    // (the flow_token split + the marking-flow dispatch); date_display/session_type
    // are read one level down, in AttendanceFlowHandler.parseMarkingFlowResponse.
    const combined = [
      path.resolve(__dirname, '../../bot/shared/handlers/flow-response.handler.js'),
      path.resolve(__dirname, '../../bot/shared/handlers/attendance-flow.handler.js'),
    ].map((p) => fs.readFileSync(p, 'utf-8')).join('\n');

    for (const field of ['absent_students', 'flow_token', 'class_name', 'date_display', 'session_type']) {
      expect(combined).toContain(field);
    }
  });
});
