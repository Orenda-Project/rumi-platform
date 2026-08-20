/**
 * discord-modal-interactions.handler.js — dispatches the Discord-specific
 * modal-workaround interaction shapes: starting a flow from a "Get started"
 * button, claiming collector-active interactions, modal submissions, and
 * attendance's "Add Another"/"I'm Done" loop buttons. Mirrors
 * tests/routes/slack-modal-interactions-handler.test.js's conventions.
 */

jest.mock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
jest.mock('../../bot/shared/database/bot-helpers', () => ({
  getOrCreateUserByChannel: jest.fn(async () => ({ id: 'db-user-1' })),
}));

function loadHandler({ renderer, isCollectorActiveForMessage } = {}) {
  jest.resetModules();
  const flowRegistry = {
    ensureRegistered: jest.fn(),
    get: jest.fn(() => renderer),
    buildFlowToken: jest.fn((userId, kind) => `${userId}:${kind}:169`),
  };
  jest.doMock('../../bot/shared/routes/discord-flow-registry', () => flowRegistry);

  const discordModalFlow = {
    decodeCustomId: jest.fn((customId) => {
      const idx = String(customId || '').indexOf(':');
      if (idx === -1) return { kind: null, token: null };
      return { kind: customId.slice(0, idx), token: customId.slice(idx + 1) };
    }),
    loadModalState: jest.fn(async () => null),
    deleteModalState: jest.fn(async () => {}),
    isCollectorActiveForMessage: isCollectorActiveForMessage || jest.fn(() => false),
    loadLoopScreenData: jest.fn(async () => null),
    deleteLoopScreenData: jest.fn(async () => {}),
  };
  jest.doMock('../../bot/shared/services/messaging/discord-modal-flow', () => discordModalFlow);

  const discordChannel = { sendMessage: jest.fn().mockResolvedValue(true) };
  jest.doMock('../../bot/shared/services/messaging/discord-channel.service', () => discordChannel);

  const handler = require('../../bot/shared/routes/discord-modal-interactions.handler');
  const { getOrCreateUserByChannel } = require('../../bot/shared/database/bot-helpers');
  return { handler, flowRegistry, discordModalFlow, discordChannel, getOrCreateUserByChannel };
}

describe('isStartFlowAction / kindFromStartFlowAction / parseStartFlowAction', () => {
  it('recognizes the discord_start_flow: prefix', () => {
    const { handler } = loadHandler();
    expect(handler.isStartFlowAction('discord_start_flow:registration')).toBe(true);
    expect(handler.isStartFlowAction('menu_lesson_plan')).toBe(false);
  });

  it('kindFromStartFlowAction returns just the kind for a plain customId with no embedded session id', () => {
    const { handler } = loadHandler();
    expect(handler.kindFromStartFlowAction('discord_start_flow:registration')).toBe('registration');
    expect(handler.kindFromStartFlowAction('discord_start_flow:attendance')).toBe('attendance');
  });

  it('parseStartFlowAction splits a plain customId with sessionId: null', () => {
    const { handler } = loadHandler();
    expect(handler.parseStartFlowAction('discord_start_flow:registration')).toEqual({ kind: 'registration', sessionId: null });
  });

  it('parseStartFlowAction splits "discord_start_flow:exam_confirm:<sessionId>" on the FIRST colon after the prefix', () => {
    const { handler } = loadHandler();
    expect(handler.parseStartFlowAction('discord_start_flow:exam_confirm:sess-123')).toEqual({
      kind: 'exam_confirm', sessionId: 'sess-123',
    });
  });

  it('kindFromStartFlowAction returns just the kind even when a sessionId is embedded', () => {
    const { handler } = loadHandler();
    expect(handler.kindFromStartFlowAction('discord_start_flow:exam_confirm:sess-123')).toBe('exam_confirm');
  });
});

describe('tryHandleCollected', () => {
  it('returns whatever isCollectorActiveForMessage says for this interaction\'s message id', () => {
    const isCollectorActiveForMessage = jest.fn((id) => id === 'msg-active');
    const { handler } = loadHandler({ isCollectorActiveForMessage });

    expect(handler.tryHandleCollected({ message: { id: 'msg-active' } })).toBe(true);
    expect(handler.tryHandleCollected({ message: { id: 'msg-other' } })).toBe(false);
    expect(handler.tryHandleCollected({})).toBe(false);
  });
});

describe('tryHandleStartFlow', () => {
  it('returns false for a non-button interaction', async () => {
    const { handler } = loadHandler();
    const handled = await handler.tryHandleStartFlow({ isButton: () => false });
    expect(handled).toBe(false);
  });

  it('returns false for a button whose customId is not discord_start_flow:', async () => {
    const { handler } = loadHandler();
    const handled = await handler.tryHandleStartFlow({ isButton: () => true, customId: 'menu_lesson_plan' });
    expect(handled).toBe(false);
  });

  it('resolves the DB user, mints a flow token, and calls startFlow — for a userId-keyed kind', async () => {
    const renderer = { startFlow: jest.fn().mockResolvedValue('awaiting_modal') };
    const { handler, getOrCreateUserByChannel, flowRegistry } = loadHandler({ renderer });

    const interaction = {
      isButton: () => true,
      customId: 'discord_start_flow:registration',
      user: { id: 'D0123' },
      deferUpdate: jest.fn(),
    };
    const handled = await handler.tryHandleStartFlow(interaction);

    expect(handled).toBe(true);
    expect(getOrCreateUserByChannel).toHaveBeenCalledWith('discord', 'D0123');
    expect(flowRegistry.buildFlowToken).toHaveBeenCalledWith('db-user-1', 'registration');
    expect(renderer.startFlow).toHaveBeenCalledWith(
      { userId: 'db-user-1', discordUserId: 'D0123', flowToken: 'db-user-1:registration:169' },
      interaction,
    );
  });

  it('exam_confirm: uses the embedded sessionId directly as flowToken, userId is null, never calls buildFlowToken or getOrCreateUserByChannel', async () => {
    const renderer = { startFlow: jest.fn().mockResolvedValue('awaiting_modal') };
    const { handler, getOrCreateUserByChannel, flowRegistry } = loadHandler({ renderer });

    const interaction = {
      isButton: () => true,
      customId: 'discord_start_flow:exam_confirm:sess-789',
      user: { id: 'D0123' },
    };
    const handled = await handler.tryHandleStartFlow(interaction);

    expect(handled).toBe(true);
    expect(getOrCreateUserByChannel).not.toHaveBeenCalled();
    expect(flowRegistry.buildFlowToken).not.toHaveBeenCalled();
    expect(renderer.startFlow).toHaveBeenCalledWith(
      { userId: null, discordUserId: 'D0123', flowToken: 'sess-789' },
      interaction,
    );
  });

  it('does not throw when no renderer is registered for the kind — logs, defers, and returns true', async () => {
    const { handler } = loadHandler({ renderer: undefined });
    const interaction = { isButton: () => true, customId: 'discord_start_flow:unknown_kind', user: { id: 'D1' }, deferUpdate: jest.fn().mockResolvedValue(undefined) };
    const handled = await handler.tryHandleStartFlow(interaction);
    expect(handled).toBe(true);
    expect(interaction.deferUpdate).toHaveBeenCalledTimes(1);
  });

  it('does not throw when renderer.startFlow itself throws', async () => {
    const renderer = { startFlow: jest.fn().mockRejectedValue(new Error('boom')) };
    const { handler } = loadHandler({ renderer });
    const interaction = { isButton: () => true, customId: 'discord_start_flow:registration', user: { id: 'D1' } };
    await expect(handler.tryHandleStartFlow(interaction)).resolves.toBe(true);
  });

  it('tells the teacher the flow gave up when startFlow times out, instead of leaving them with no explanation', async () => {
    const renderer = { startFlow: jest.fn().mockResolvedValue('timed_out') };
    const { handler, discordChannel } = loadHandler({ renderer });
    const interaction = { isButton: () => true, customId: 'discord_start_flow:settings', user: { id: 'D0123' } };

    await handler.tryHandleStartFlow(interaction);

    expect(discordChannel.sendMessage).toHaveBeenCalledWith('discord:D0123', expect.stringMatching(/took too long/i));
  });

  it('sends nothing extra when startFlow finishes normally (not timed_out)', async () => {
    const renderer = { startFlow: jest.fn().mockResolvedValue('finished') };
    const { handler, discordChannel } = loadHandler({ renderer });
    const interaction = { isButton: () => true, customId: 'discord_start_flow:settings', user: { id: 'D0123' } };

    await handler.tryHandleStartFlow(interaction);

    expect(discordChannel.sendMessage).not.toHaveBeenCalled();
  });
});

describe('handleModalSubmit', () => {
  it('logs, defers, and returns early when no renderer is registered for the decoded kind', async () => {
    const { handler } = loadHandler({ renderer: undefined });
    const interaction = { customId: 'unknown_kind:token123', deferUpdate: jest.fn().mockResolvedValue(undefined) };
    await handler.handleModalSubmit(interaction);
    expect(interaction.deferUpdate).toHaveBeenCalledTimes(1);
  });

  it('defers and returns early when the modal state has expired/is missing', async () => {
    const renderer = { handleModalSubmit: jest.fn() };
    const { handler, discordModalFlow } = loadHandler({ renderer });
    discordModalFlow.loadModalState.mockResolvedValueOnce(null);

    const interaction = { customId: 'registration:tok', deferUpdate: jest.fn().mockResolvedValue(undefined) };
    await handler.handleModalSubmit(interaction);

    expect(interaction.deferUpdate).toHaveBeenCalledTimes(1);
    expect(renderer.handleModalSubmit).not.toHaveBeenCalled();
  });

  it('deletes the modal state (once consumed) and calls the renderer\'s handleModalSubmit with the recovered state', async () => {
    const renderer = { handleModalSubmit: jest.fn().mockResolvedValue('finished') };
    const { handler, discordModalFlow } = loadHandler({ renderer });
    const state = { kind: 'registration', screen: 'PERSONAL_INFO', flowToken: 'db-user-1:registration:169', collectedEnumAnswers: {} };
    discordModalFlow.loadModalState.mockResolvedValueOnce(state);

    const interaction = { customId: 'registration:tok123', fields: { fields: new Map() } };
    await handler.handleModalSubmit(interaction);

    expect(discordModalFlow.deleteModalState).toHaveBeenCalledWith('tok123');
    expect(renderer.handleModalSubmit).toHaveBeenCalledWith(interaction, state);
  });

  it('does not throw when renderer.handleModalSubmit itself throws', async () => {
    const renderer = { handleModalSubmit: jest.fn().mockRejectedValue(new Error('boom')) };
    const { handler, discordModalFlow } = loadHandler({ renderer });
    discordModalFlow.loadModalState.mockResolvedValueOnce({ kind: 'registration', screen: 'X', flowToken: 't' });

    const interaction = { customId: 'registration:tok', fields: { fields: new Map() } };
    await expect(handler.handleModalSubmit(interaction)).resolves.toBeUndefined();
  });
});

describe('tryHandleAttendanceLoopButton', () => {
  it('returns false for a non-button interaction', async () => {
    const { handler } = loadHandler();
    const handled = await handler.tryHandleAttendanceLoopButton({ isButton: () => false });
    expect(handled).toBe(false);
  });

  it('returns false for a button whose customId matches neither the add nor done prefix', async () => {
    const { handler } = loadHandler();
    const handled = await handler.tryHandleAttendanceLoopButton({ isButton: () => true, customId: 'menu_lesson_plan' });
    expect(handled).toBe(false);
  });

  it('"Add Another" calls renderer.resumeLoopScreen with a ctx built from the embedded flowToken', async () => {
    const renderer = { resumeLoopScreen: jest.fn().mockResolvedValue('awaiting_modal') };
    const { handler } = loadHandler({ renderer });

    const interaction = {
      isButton: () => true,
      customId: 'discord_attendance_add:u1:attendance:169',
      user: { id: 'D0123' },
    };
    const handled = await handler.tryHandleAttendanceLoopButton(interaction);

    expect(handled).toBe(true);
    expect(renderer.resumeLoopScreen).toHaveBeenCalledWith(
      { userId: 'u1', discordUserId: 'D0123', flowToken: 'u1:attendance:169' },
      interaction,
    );
  });

  it('"I\'m Done" recovers the carried {list_id, class_display}, defers, and calls renderer._advance with _action: done', async () => {
    const renderer = { _advance: jest.fn().mockResolvedValue('finished') };
    const { handler, discordModalFlow } = loadHandler({ renderer });
    discordModalFlow.loadLoopScreenData.mockResolvedValueOnce({
      screen: 'ADD_STUDENT', data: { list_id: 'list-1', class_display: 'Grade 3 - A' },
    });

    const interaction = {
      isButton: () => true,
      customId: 'discord_attendance_done:u1:attendance:169',
      user: { id: 'D0123' },
      deferUpdate: jest.fn().mockResolvedValue(undefined),
    };
    const handled = await handler.tryHandleAttendanceLoopButton(interaction);

    expect(handled).toBe(true);
    expect(interaction.deferUpdate).toHaveBeenCalledTimes(1);
    expect(discordModalFlow.deleteLoopScreenData).toHaveBeenCalledWith('u1:attendance:169');
    expect(renderer._advance).toHaveBeenCalledWith(
      { userId: 'u1', discordUserId: 'D0123', flowToken: 'u1:attendance:169' },
      interaction,
      'ADD_STUDENT',
      { _action: 'done', _list_id: 'list-1', _class_display: 'Grade 3 - A' },
    );
  });

  it('"I\'m Done" is a safe no-op (still handled, still deferred) when the loop state has expired', async () => {
    const renderer = { _advance: jest.fn() };
    const { handler, discordModalFlow } = loadHandler({ renderer });
    discordModalFlow.loadLoopScreenData.mockResolvedValueOnce(null);

    const interaction = {
      isButton: () => true,
      customId: 'discord_attendance_done:u1:attendance:169',
      user: { id: 'D0123' },
      deferUpdate: jest.fn().mockResolvedValue(undefined),
    };
    const handled = await handler.tryHandleAttendanceLoopButton(interaction);

    expect(handled).toBe(true);
    expect(interaction.deferUpdate).toHaveBeenCalledTimes(1);
    expect(renderer._advance).not.toHaveBeenCalled();
  });

  it('does not throw when no renderer is registered for attendance at all', async () => {
    const { handler } = loadHandler({ renderer: undefined });
    const interaction = {
      isButton: () => true,
      customId: 'discord_attendance_add:u1:attendance:169',
      user: { id: 'D0123' },
      deferUpdate: jest.fn().mockResolvedValue(undefined),
    };
    await expect(handler.tryHandleAttendanceLoopButton(interaction)).resolves.toBe(true);
    expect(interaction.deferUpdate).toHaveBeenCalledTimes(1);
  });

  it('does not throw when renderer.resumeLoopScreen itself throws', async () => {
    const renderer = { resumeLoopScreen: jest.fn().mockRejectedValue(new Error('boom')) };
    const { handler } = loadHandler({ renderer });
    const interaction = { isButton: () => true, customId: 'discord_attendance_add:u1:attendance:169', user: { id: 'D1' } };
    await expect(handler.tryHandleAttendanceLoopButton(interaction)).resolves.toBe(true);
  });

  it('"Add Another" tells the teacher the flow gave up when resumeLoopScreen times out', async () => {
    const renderer = { resumeLoopScreen: jest.fn().mockResolvedValue('timed_out') };
    const { handler, discordChannel } = loadHandler({ renderer });
    const interaction = { isButton: () => true, customId: 'discord_attendance_add:u1:attendance:169', user: { id: 'D0123' } };

    await handler.tryHandleAttendanceLoopButton(interaction);

    expect(discordChannel.sendMessage).toHaveBeenCalledWith('discord:D0123', expect.stringMatching(/took too long/i));
  });
});
