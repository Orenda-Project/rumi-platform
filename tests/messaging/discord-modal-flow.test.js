/**
 * discord-modal-flow.js — the Discord modal-workaround renderer.
 * railway-redis.service.js is always mocked (a real singleton that connects
 * to Redis at module load) so nothing ever touches a real Redis instance;
 * discord.js's builder classes are mocked minimally (just enough surface for
 * customId/label/style to round-trip) since the real ones require the whole
 * package and this suite tests the FLOW logic, not discord.js's own builders
 * (those are covered by discord-channel-service.test.js against the real
 * package).
 */

function mockRedis() {
  const store = new Map();
  const redis = {
    set: jest.fn(async (key, value, ttl) => { store.set(key, value); return true; }),
    get: jest.fn(async (key) => (store.has(key) ? store.get(key) : null)),
    delete: jest.fn(async (key) => { store.delete(key); return true; }),
  };
  jest.doMock('../../bot/shared/services/cache/railway-redis.service', () => redis);
  return redis;
}

function mockDiscordBuilders() {
  class FakeActionRowBuilder {
    constructor() { this.components = []; }
    addComponents(...items) { this.components.push(...items.flat()); return this; }
  }
  class FakeModalBuilder {
    constructor() { this.rows = []; }
    setCustomId(id) { this.customId = id; return this; }
    setTitle(t) { this.title = t; return this; }
    addComponents(row) { this.rows.push(row); return this; }
  }
  class FakeTextInputBuilder {
    setCustomId(id) { this.customId = id; return this; }
    setLabel(l) { this.label = l; return this; }
    setStyle(s) { this.style = s; return this; }
    setRequired(r) { this.required = r; return this; }
  }
  jest.doMock('discord.js', () => ({
    ActionRowBuilder: FakeActionRowBuilder,
    ModalBuilder: FakeModalBuilder,
    TextInputBuilder: FakeTextInputBuilder,
    TextInputStyle: { Short: 1, Paragraph: 2 },
  }), { virtual: true });
}

function loadModule() {
  jest.resetModules();
  jest.doMock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
  const redis = mockRedis();
  mockDiscordBuilders();
  const mod = require('../../bot/shared/services/messaging/discord-modal-flow');
  return { mod, redis };
}

afterEach(() => jest.resetModules());

describe('token/state helpers', () => {
  it('encodeCustomId/decodeCustomId round-trip a kind and token', () => {
    const { mod } = loadModule();
    const encoded = mod.encodeCustomId('registration', 'abc123');
    expect(encoded).toBe('registration:abc123');
    expect(mod.decodeCustomId(encoded)).toEqual({ kind: 'registration', token: 'abc123' });
  });

  it('decodeCustomId handles a missing/malformed customId without throwing', () => {
    const { mod } = loadModule();
    expect(mod.decodeCustomId(undefined)).toEqual({ kind: null, token: null });
    expect(mod.decodeCustomId('no-colon-here')).toEqual({ kind: null, token: null });
  });

  it('storeModalState/loadModalState round-trip a state object via Redis', async () => {
    const { mod, redis } = loadModule();
    const token = await mod.storeModalState({ kind: 'registration', screen: 'PERSONAL_INFO', flowToken: 'u1:registration:1', collectedEnumAnswers: { country: 'PK' } });
    expect(typeof token).toBe('string');
    expect(redis.set).toHaveBeenCalledWith(`discord_modal:${token}`, expect.objectContaining({ kind: 'registration' }), 300);

    const loaded = await mod.loadModalState(token);
    expect(loaded).toEqual({ kind: 'registration', screen: 'PERSONAL_INFO', flowToken: 'u1:registration:1', collectedEnumAnswers: { country: 'PK' } });
  });

  it('loadModalState returns null for an unknown/expired token', async () => {
    const { mod } = loadModule();
    expect(await mod.loadModalState('never-stored')).toBeNull();
  });

  it('deleteModalState removes the stored state', async () => {
    const { mod, redis } = loadModule();
    const token = await mod.storeModalState({ kind: 'settings', screen: 'SETTINGS_MAIN', flowToken: 'u1:settings:1', collectedEnumAnswers: {} });
    await mod.deleteModalState(token);
    expect(redis.delete).toHaveBeenCalledWith(`discord_modal:${token}`);
  });
});

describe('collectEnumAnswers', () => {
  function fakeUser({ interactions }) {
    // Each dmChannel.send() call returns a message whose awaitMessageComponent()
    // resolves to the next queued interaction — simulates a real teacher
    // answering one select menu at a time.
    let call = 0;
    const dmChannel = {
      send: jest.fn(async () => ({
        awaitMessageComponent: jest.fn(async () => {
          const interaction = interactions[call];
          call += 1;
          if (interaction === 'TIMEOUT') throw new Error('time');
          return interaction;
        }),
      })),
    };
    return { id: 'U1', dmChannel, createDM: jest.fn(async () => dmChannel) };
  }

  function fakeSelectInteraction(values) {
    return { values, deferUpdate: jest.fn().mockResolvedValue(undefined) };
  }

  it('collects a single-field answer and leaves the LAST interaction un-acked for the caller to ack', async () => {
    const { mod } = loadModule();
    const interaction = fakeSelectInteraction(['lang_en']);
    const user = fakeUser({ interactions: [interaction] });

    const result = await mod.collectEnumAnswers(user, [
      { fieldName: 'language', promptText: 'Pick a language', buildMenu: () => ({}) },
    ]);

    expect(result.answers).toEqual({ language: 'lang_en' });
    expect(result.lastInteraction).toBe(interaction);
    expect(interaction.deferUpdate).not.toHaveBeenCalled(); // left for the caller
  });

  it('acks every step EXCEPT the last, and threads answersSoFar into a dependent 2nd step (region -> country)', async () => {
    const { mod } = loadModule();
    const regionInteraction = fakeSelectInteraction(['asia']);
    const countryInteraction = fakeSelectInteraction(['PK']);
    const user = fakeUser({ interactions: [regionInteraction, countryInteraction] });

    // buildMenu receives the SAME mutable answers-so-far object on every step, so a jest.fn()'s
    // recorded call arg would reflect its FINAL state by the time we assert, not its state at
    // call-time — snapshot it eagerly inside the mock instead of asserting on the captured call.
    let countryMenuSawAtCallTime = null;
    const buildCountryMenu = jest.fn((answersSoFar) => {
      countryMenuSawAtCallTime = { ...answersSoFar };
      return {};
    });
    const result = await mod.collectEnumAnswers(user, [
      { fieldName: '_region', promptText: 'Pick a region', buildMenu: () => ({}) },
      { fieldName: 'country', promptText: 'Pick a country', buildMenu: buildCountryMenu },
    ]);

    expect(regionInteraction.deferUpdate).toHaveBeenCalledTimes(1); // not the last step
    expect(countryInteraction.deferUpdate).not.toHaveBeenCalled(); // the last step
    expect(countryMenuSawAtCallTime).toEqual({ _region: 'asia' }); // dependent menu saw the prior answer, and ONLY that
    expect(result.answers).toEqual({ _region: 'asia', country: 'PK' });
    expect(result.lastInteraction).toBe(countryInteraction);
  });

  it('reads ALL selected values for a multi:true step (e.g. subjects)', async () => {
    const { mod } = loadModule();
    const interaction = fakeSelectInteraction(['math', 'science']);
    const user = fakeUser({ interactions: [interaction] });

    const result = await mod.collectEnumAnswers(user, [
      { fieldName: 'subjects', promptText: 'Pick subjects', buildMenu: () => ({}), multi: true },
    ]);

    expect(result.answers).toEqual({ subjects: ['math', 'science'] });
  });

  it('returns null when a step times out', async () => {
    const { mod } = loadModule();
    const user = fakeUser({ interactions: ['TIMEOUT'] });

    const result = await mod.collectEnumAnswers(user, [
      { fieldName: 'language', promptText: 'Pick', buildMenu: () => ({}) },
    ]);

    expect(result).toBeNull();
  });

  it('reuses an already-open DM channel instead of calling createDM() again', async () => {
    const { mod } = loadModule();
    const interaction = fakeSelectInteraction(['x']);
    const user = fakeUser({ interactions: [interaction] });
    await mod.collectEnumAnswers(user, [{ fieldName: 'f', promptText: 'p', buildMenu: () => ({}) }]);
    expect(user.createDM).not.toHaveBeenCalled(); // user.dmChannel was already set
  });
});

describe('openTextFieldsModal', () => {
  it('stores state under a fresh token and shows a modal with one TextInput per remaining field', async () => {
    const { mod, redis } = loadModule();
    const interaction = { showModal: jest.fn().mockResolvedValue(undefined) };

    await mod.openTextFieldsModal({
      interaction, kind: 'registration', screen: 'PERSONAL_INFO', flowToken: 'u1:registration:1',
      collectedEnumAnswers: { country: 'PK' },
      textFields: [{ name: 'full_name', label: 'Full name', required: true }],
      title: 'Personal info',
    });

    expect(redis.set).toHaveBeenCalledTimes(1);
    expect(interaction.showModal).toHaveBeenCalledTimes(1);
    const modal = interaction.showModal.mock.calls[0][0];
    expect(modal.customId).toMatch(/^registration:[a-f0-9]{16}$/);
    expect(modal.title).toBe('Personal info');
    expect(modal.rows).toHaveLength(1);
    expect(modal.rows[0].components[0].customId).toBe('full_name');
  });
});

describe('readModalTextAnswers', () => {
  it('reads every TextInputComponent value keyed by its customId', () => {
    const { mod } = loadModule();
    const interaction = {
      fields: { fields: new Map([['full_name', { value: 'Zara Abdul' }], ['school_name', { value: 'Sunrise School' }]]) },
    };
    expect(mod.readModalTextAnswers(interaction)).toEqual({ full_name: 'Zara Abdul', school_name: 'Sunrise School' });
  });
});

describe('buildEndpointModal', () => {
  function fakeTriggerInteraction() {
    const user = { id: 'U1', dmChannel: null, createDM: jest.fn() };
    return {
      client: { users: { fetch: jest.fn().mockResolvedValue(user) } },
      deferUpdate: jest.fn().mockResolvedValue(undefined),
      showModal: jest.fn().mockResolvedValue(undefined),
      user: { id: 'U1' },
    };
  }

  it('throws if required config is missing', () => {
    const { mod } = loadModule();
    expect(() => mod.buildEndpointModal({})).toThrow(/needs \{ kind, init, exchange/);
  });

  it('startFlow -> runScreen opens a modal directly for a screen with no enum fields at all', async () => {
    const { mod } = loadModule();
    const init = jest.fn().mockResolvedValue({ screen: 'ADD_STUDENT', data: {} });
    const exchange = jest.fn();
    const screenToSteps = jest.fn(() => ({ steps: [], textFields: [{ name: 'first_name', label: 'First name' }], title: 'Add student' }));
    const mergeScreenData = jest.fn();

    const renderer = mod.buildEndpointModal({ kind: 'attendance', init, exchange, screenToSteps, mergeScreenData });
    const trigger = fakeTriggerInteraction();

    const result = await renderer.startFlow({ userId: 'u1', discordUserId: 'U1', flowToken: 'u1:attendance:1' }, trigger);

    expect(result).toBe('awaiting_modal');
    expect(trigger.showModal).toHaveBeenCalledTimes(1);
    expect(exchange).not.toHaveBeenCalled(); // nothing to exchange yet — waiting on the modal submission
  });

  it('an all-enum screen (no text fields) acks via deferUpdate, calls exchange(), and finishes on a terminal screen', async () => {
    const { mod } = loadModule();
    const init = jest.fn().mockResolvedValue({ screen: 'SETTINGS_MAIN', data: {} });
    const exchange = jest.fn().mockResolvedValue({ screen: 'SUCCESS', data: { confirmation_message: 'Saved!' } });
    const screenToSteps = jest.fn(() => ({
      steps: [{ fieldName: 'language', promptText: 'Pick', buildMenu: () => ({}) }],
      textFields: [], title: 'Settings',
    }));
    const mergeScreenData = jest.fn((screen, enumAnswers) => ({ ...enumAnswers }));
    const onFinish = jest.fn();

    const renderer = mod.buildEndpointModal({ kind: 'settings', init, exchange, screenToSteps, mergeScreenData, onFinish });

    const selectInteraction = { values: ['en'], deferUpdate: jest.fn().mockResolvedValue(undefined) };
    const dmChannel = { send: jest.fn().mockResolvedValue({ awaitMessageComponent: jest.fn().mockResolvedValue(selectInteraction) }) };
    const user = { id: 'U1', dmChannel, createDM: jest.fn() };
    const trigger = {
      client: { users: { fetch: jest.fn().mockResolvedValue(user) } },
      user: { id: 'U1' },
      deferUpdate: jest.fn().mockResolvedValue(undefined),
    };

    const result = await renderer.startFlow({ userId: 'u1', discordUserId: 'U1', flowToken: 'u1:settings:1' }, trigger);

    // Regression test: the triggering "Get started" interaction is abandoned
    // by collectEnumAnswers (it sends a brand new message and awaits a click
    // on THAT instead) — left un-acked, Discord shows the teacher "Rumi
    // didn't respond in time" even though the flow keeps working underneath.
    // Confirmed live against a real Discord workspace, not a guess.
    expect(trigger.deferUpdate).toHaveBeenCalledTimes(1);
    expect(selectInteraction.deferUpdate).toHaveBeenCalledTimes(1); // acked since no modal follows
    expect(exchange).toHaveBeenCalledWith(expect.any(Object), 'SETTINGS_MAIN', { language: 'en' });
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(result).toBe('finished');
  });

  it('recurses into the NEXT screen when exchange() returns a non-terminal screen', async () => {
    const { mod } = loadModule();
    const init = jest.fn().mockResolvedValue({ screen: 'SCREEN_A', data: {} });
    const exchange = jest.fn()
      .mockResolvedValueOnce({ screen: 'SCREEN_B', data: {} })
      .mockResolvedValueOnce({ screen: 'SUCCESS', data: {} });
    const screenToSteps = jest.fn((screen) => ({
      steps: [], textFields: [{ name: 'field_a', label: 'A' }], title: screen,
    }));
    const mergeScreenData = jest.fn(() => ({}));

    const renderer = mod.buildEndpointModal({ kind: 'test', init, exchange, screenToSteps, mergeScreenData });
    const trigger = fakeTriggerInteraction();

    // SCREEN_A opens a modal (no enum steps, has text fields).
    const openResult = await renderer.startFlow({ userId: 'u1', discordUserId: 'U1', flowToken: 'u1:test:1' }, trigger);
    expect(openResult).toBe('awaiting_modal');
    const [modal] = trigger.showModal.mock.calls[0];
    const { token } = mod.decodeCustomId(modal.customId);
    const state = await mod.loadModalState(token);
    expect(state.screen).toBe('SCREEN_A');

    // Submitting SCREEN_A's modal advances to SCREEN_B, which ALSO opens a
    // modal (no enum steps) — confirms recursion actually re-runs runScreen.
    const modalSubmit = {
      customId: modal.customId,
      user: { id: 'U1' },
      deferUpdate: jest.fn().mockResolvedValue(undefined),
      showModal: jest.fn().mockResolvedValue(undefined),
      client: { users: { fetch: jest.fn().mockResolvedValue({ id: 'U1', dmChannel: null, createDM: jest.fn() }) } },
      fields: { fields: new Map([['field_a', { value: 'answer' }]]) },
    };
    const submitResult = await renderer.handleModalSubmit(modalSubmit, state);

    expect(modalSubmit.deferUpdate).toHaveBeenCalledTimes(1);
    expect(exchange).toHaveBeenCalledTimes(1); // SCREEN_A's exchange only — SCREEN_B needs its OWN submission
    expect(submitResult).toBe('awaiting_modal'); // recursed into SCREEN_B's own runScreen, which opened a 2nd modal
    expect(modalSubmit.showModal).toHaveBeenCalledTimes(1);
  });

  it('does not double-ack the modal-submit interaction when the NEXT screen has enum steps (regression)', async () => {
    // Real bug, caught live against Discord (not a guess): runScreen()'s ack
    // of an abandoned enum-collector trigger must be skipped when the
    // interaction is already deferred/replied — otherwise recursing from a
    // just-submitted modal (already deferUpdate()'d by handleModalSubmit)
    // into a next screen with its OWN enum steps throws
    // DiscordjsError[InteractionAlreadyReplied], exactly what happened live
    // going from registration's PERSONAL_INFO (a modal) into REGION_INFO
    // (an enum-only region/state picker).
    const { mod } = loadModule();
    const init = jest.fn().mockResolvedValue({ screen: 'SCREEN_A', data: {} });
    const exchange = jest.fn()
      .mockResolvedValueOnce({ screen: 'SCREEN_B', data: {} })
      .mockResolvedValueOnce({ screen: 'SUCCESS', data: {} });
    const screenToSteps = jest.fn((screen) => (screen === 'SCREEN_A'
      ? { steps: [], textFields: [{ name: 'field_a', label: 'A' }], title: 'A' }
      : { steps: [{ fieldName: 'region', promptText: 'Pick', buildMenu: () => ({}) }], textFields: [], title: 'B' }));
    const mergeScreenData = jest.fn(() => ({}));

    const renderer = mod.buildEndpointModal({ kind: 'test', init, exchange, screenToSteps, mergeScreenData });
    const trigger = fakeTriggerInteraction();

    await renderer.startFlow({ userId: 'u1', discordUserId: 'U1', flowToken: 'u1:test:1' }, trigger);
    const [modal] = trigger.showModal.mock.calls[0];
    const { token } = mod.decodeCustomId(modal.customId);
    const state = await mod.loadModalState(token);

    const regionInteraction = { deferUpdate: jest.fn().mockResolvedValue(undefined) };
    const dmChannel = { send: jest.fn().mockResolvedValue({ awaitMessageComponent: jest.fn().mockResolvedValue(regionInteraction) }) };
    const discordUser = { id: 'U1', dmChannel, createDM: jest.fn() };

    const modalSubmit = {
      customId: modal.customId,
      user: { id: 'U1' },
      client: { users: { fetch: jest.fn().mockResolvedValue(discordUser) } },
      fields: { fields: new Map([['field_a', { value: 'answer' }]]) },
      replied: false,
      deferred: false,
      // Mirrors real discord.js: deferUpdate() flips .deferred to true, so a
      // second deferUpdate() call on the SAME interaction is detectable.
      deferUpdate: jest.fn().mockImplementation(async function deferUpdate() {
        this.deferred = true;
      }),
    };

    const result = await renderer.handleModalSubmit(modalSubmit, state);

    expect(modalSubmit.deferUpdate).toHaveBeenCalledTimes(1); // only handleModalSubmit's own ack — runScreen must not re-ack
    expect(regionInteraction.deferUpdate).toHaveBeenCalledTimes(1); // SCREEN_B's own enum-step interaction acks itself
    expect(exchange).toHaveBeenCalledTimes(2); // SCREEN_A's submit, then SCREEN_B's region answer
    expect(result).toBe('finished');
  });

  it('threads the screen\'s own init()/exchange() response data through to mergeScreenData as carriedData — e.g. attendance\'s _list_id/_class_display, never collected from the teacher', async () => {
    const { mod } = loadModule();
    const init = jest.fn().mockResolvedValue({ screen: 'ADD_STUDENT', data: { list_id: 'list-42', class_display: 'Grade 5 - A' } });
    const exchange = jest.fn().mockResolvedValue({ screen: 'SUCCESS', data: {} });
    const screenToSteps = jest.fn(() => ({ steps: [], textFields: [{ name: 'first_name', label: 'First name' }], title: 'Add student' }));
    const mergeScreenData = jest.fn((screen, enumAnswers, textAnswers, carriedData) => ({
      first_name: textAnswers.first_name, _list_id: carriedData.list_id, _class_display: carriedData.class_display,
    }));

    const renderer = mod.buildEndpointModal({ kind: 'attendance', init, exchange, screenToSteps, mergeScreenData });
    const trigger = fakeTriggerInteraction();

    await renderer.startFlow({ userId: 'u1', discordUserId: 'U1', flowToken: 'u1:attendance:1' }, trigger);
    const [modal] = trigger.showModal.mock.calls[0];
    const { token } = mod.decodeCustomId(modal.customId);
    const state = await mod.loadModalState(token);
    expect(state.carriedData).toEqual({ list_id: 'list-42', class_display: 'Grade 5 - A' }); // survives the Redis round-trip

    const modalSubmit = {
      customId: modal.customId, user: { id: 'U1' },
      deferUpdate: jest.fn().mockResolvedValue(undefined),
      fields: { fields: new Map([['first_name', { value: 'Zara' }]]) },
    };
    await renderer.handleModalSubmit(modalSubmit, state);

    expect(mergeScreenData).toHaveBeenCalledWith('ADD_STUDENT', {}, { first_name: 'Zara' }, { list_id: 'list-42', class_display: 'Grade 5 - A' });
    expect(exchange).toHaveBeenCalledWith(expect.any(Object), 'ADD_STUDENT', { first_name: 'Zara', _list_id: 'list-42', _class_display: 'Grade 5 - A' });
  });

  it('handleModalSubmit finishes and calls onFinish when exchange() reaches the terminal screen', async () => {
    const { mod } = loadModule();
    const exchange = jest.fn().mockResolvedValue({ screen: 'SUCCESS', data: { welcome_message: 'Welcome!' } });
    const mergeScreenData = jest.fn(() => ({ full_name: 'Zara' }));
    const onFinish = jest.fn();

    const renderer = mod.buildEndpointModal({
      kind: 'registration', init: jest.fn(), exchange,
      screenToSteps: jest.fn(), mergeScreenData, onFinish,
    });

    const modalSubmit = {
      user: { id: 'U1' }, deferUpdate: jest.fn().mockResolvedValue(undefined),
      fields: { fields: new Map([['full_name', { value: 'Zara' }]]) },
    };
    const state = { kind: 'registration', screen: 'PERSONAL_INFO', flowToken: 'u1:registration:1', collectedEnumAnswers: {} };

    const result = await renderer.handleModalSubmit(modalSubmit, state);

    expect(modalSubmit.deferUpdate).toHaveBeenCalledTimes(1);
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(result).toBe('finished');
  });

  it('handleModalSubmit reports "finished" (does not crash) when exchange() returns a validation error, since there is no open modal to re-show it on', async () => {
    const { mod } = loadModule();
    const exchange = jest.fn().mockResolvedValue({ data: { error: { message: 'That name is too short.' } } });
    const renderer = mod.buildEndpointModal({
      kind: 'registration', init: jest.fn(), exchange,
      screenToSteps: jest.fn(), mergeScreenData: jest.fn(() => ({})),
    });

    const modalSubmit = { user: { id: 'U1' }, deferUpdate: jest.fn().mockResolvedValue(undefined), fields: { fields: new Map() } };
    const state = { kind: 'registration', screen: 'PERSONAL_INFO', flowToken: 'u1:registration:1', collectedEnumAnswers: {} };

    const result = await renderer.handleModalSubmit(modalSubmit, state);
    expect(result).toBe('finished');
  });

  it('handleBack re-runs the previous screen from scratch via runScreen()', async () => {
    const { mod } = loadModule();
    const back = jest.fn().mockResolvedValue({ screen: 'PERSONAL_INFO', data: {} });
    const screenToSteps = jest.fn(() => ({ steps: [], textFields: [{ name: 'full_name', label: 'Name' }], title: 'Back to personal info' }));

    const renderer = mod.buildEndpointModal({
      kind: 'registration', init: jest.fn(), exchange: jest.fn(),
      back, screenToSteps, mergeScreenData: jest.fn(),
    });
    const trigger = fakeTriggerInteraction();

    const result = await renderer.handleBack({ userId: 'u1', discordUserId: 'U1', flowToken: 'u1:registration:1' }, trigger, 'PROFESSIONAL_INFO');

    expect(back).toHaveBeenCalledWith(expect.any(Object), 'PROFESSIONAL_INFO');
    expect(result).toBe('awaiting_modal');
    expect(trigger.showModal).toHaveBeenCalledTimes(1);
  });

  it('handleBack returns null when the endpoint has no back() function', async () => {
    const { mod } = loadModule();
    const renderer = mod.buildEndpointModal({
      kind: 'settings', init: jest.fn(), exchange: jest.fn(),
      screenToSteps: jest.fn(), mergeScreenData: jest.fn(),
    });
    expect(await renderer.handleBack({}, {}, 'SETTINGS_MAIN')).toBeNull();
  });

  it('returns "timed_out" when the enum-collection step times out, without ever calling exchange()', async () => {
    const { mod } = loadModule();
    const exchange = jest.fn();
    const screenToSteps = jest.fn(() => ({ steps: [{ fieldName: 'language', promptText: 'Pick', buildMenu: () => ({}) }], textFields: [], title: 'x' }));
    const renderer = mod.buildEndpointModal({
      kind: 'settings', init: jest.fn().mockResolvedValue({ screen: 'SETTINGS_MAIN', data: {} }),
      exchange, screenToSteps, mergeScreenData: jest.fn(),
    });

    const dmChannel = { send: jest.fn().mockResolvedValue({ awaitMessageComponent: jest.fn().mockRejectedValue(new Error('time')) }) };
    const user = { id: 'U1', dmChannel, createDM: jest.fn() };
    const trigger = {
      client: { users: { fetch: jest.fn().mockResolvedValue(user) } },
      user: { id: 'U1' },
      deferUpdate: jest.fn().mockResolvedValue(undefined),
    };

    const result = await renderer.startFlow({ userId: 'u1', discordUserId: 'U1', flowToken: 'u1:settings:1' }, trigger);
    expect(result).toBe('timed_out');
    expect(exchange).not.toHaveBeenCalled();
  });
});
