/**
 * slack-modal-interactions.handler.js — dispatches the three
 * modal-specific Slack interaction shapes: opening the first modal,
 * the Back button, and view_submission.
 */

jest.mock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
jest.mock('../../bot/shared/database/bot-helpers', () => ({
  getOrCreateUserByChannel: jest.fn(async () => ({ id: 'db-user-1' })),
}));

function loadHandler({ renderer } = {}) {
  jest.resetModules();
  const flowRegistry = {
    ensureRegistered: jest.fn(),
    get: jest.fn(() => renderer),
    buildFlowToken: jest.fn((userId, kind) => `${userId}:${kind}:169`),
  };
  jest.doMock('../../bot/shared/routes/slack-flow-registry', () => flowRegistry);

  const slackWebClient = {
    openView: jest.fn().mockResolvedValue(undefined),
    updateView: jest.fn().mockResolvedValue(undefined),
    postMessage: jest.fn().mockResolvedValue(undefined),
  };
  jest.doMock('../../bot/shared/services/messaging/slack-web-client', () => slackWebClient);

  const handler = require('../../bot/shared/routes/slack-modal-interactions.handler');
  const { getOrCreateUserByChannel } = require('../../bot/shared/database/bot-helpers');
  return { handler, flowRegistry, slackWebClient, getOrCreateUserByChannel };
}

describe('isOpenModalAction / isBackAction / isAttendanceFinishAction', () => {
  it('recognizes the open_modal: prefix and the _back suffix', () => {
    const { handler } = loadHandler();
    expect(handler.isOpenModalAction('open_modal:registration')).toBe(true);
    expect(handler.isOpenModalAction('menu_lesson_plan')).toBe(false);
    expect(handler.isBackAction('registration_back')).toBe(true);
    expect(handler.isBackAction('registration')).toBe(false);
  });

  it('recognizes exactly the attendance_finish action_id, nothing else', () => {
    const { handler } = loadHandler();
    expect(handler.isAttendanceFinishAction('attendance_finish')).toBe(true);
    expect(handler.isAttendanceFinishAction('open_modal:attendance')).toBe(false);
    expect(handler.isAttendanceFinishAction('attendance_finish_extra')).toBe(false);
  });
});

describe('parseOpenModalAction', () => {
  it('splits a plain "open_modal:<kind>" action_id with no embedded session id', () => {
    const { handler } = loadHandler();
    expect(handler.parseOpenModalAction('open_modal:registration')).toEqual({ kind: 'registration', sessionId: null });
    expect(handler.parseOpenModalAction('open_modal:attendance')).toEqual({ kind: 'attendance', sessionId: null });
  });

  it('splits "open_modal:exam_confirm:<sessionId>" on the FIRST colon after the prefix', () => {
    const { handler } = loadHandler();
    expect(handler.parseOpenModalAction('open_modal:exam_confirm:sess-123')).toEqual({
      kind: 'exam_confirm', sessionId: 'sess-123',
    });
  });

  it('keeps every colon after the first as part of the sessionId (a UUID-shaped id has none, but this must not truncate if one ever did)', () => {
    const { handler } = loadHandler();
    expect(handler.parseOpenModalAction('open_modal:exam_confirm:sess:with:colons')).toEqual({
      kind: 'exam_confirm', sessionId: 'sess:with:colons',
    });
  });
});

describe('handleOpenModal', () => {
  it('returns false for a payload whose action is not open_modal:', async () => {
    const { handler } = loadHandler();
    const handled = await handler.handleOpenModal({ actions: [{ action_id: 'menu_lesson_plan' }] });
    expect(handled).toBe(false);
  });

  it('resolves the DB user, mints a flow token, and opens the initial view via trigger_id', async () => {
    const renderer = { buildInitialView: jest.fn().mockResolvedValue({ type: 'modal' }) };
    const { handler, getOrCreateUserByChannel, slackWebClient, flowRegistry } = loadHandler({ renderer });

    const payload = {
      trigger_id: 'trigger-123',
      user: { id: 'U0123ABC' },
      actions: [{ action_id: 'open_modal:registration' }],
    };
    const handled = await handler.handleOpenModal(payload);

    expect(handled).toBe(true);
    expect(getOrCreateUserByChannel).toHaveBeenCalledWith('slack', 'U0123ABC');
    expect(flowRegistry.buildFlowToken).toHaveBeenCalledWith('db-user-1', 'registration');
    expect(renderer.buildInitialView).toHaveBeenCalledWith({
      userId: 'db-user-1', slackUserId: 'U0123ABC', flowToken: 'db-user-1:registration:169',
    });
    expect(slackWebClient.openView).toHaveBeenCalledWith('trigger-123', { type: 'modal' });
  });

  it('does not throw when no renderer is registered for the kind — logs and returns true (handled, nothing to open)', async () => {
    const { handler } = loadHandler({ renderer: undefined });
    const handled = await handler.handleOpenModal({
      trigger_id: 't', user: { id: 'U1' }, actions: [{ action_id: 'open_modal:unknown_kind' }],
    });
    expect(handled).toBe(true);
  });

  it('exam_confirm: uses the embedded sessionId directly as flowToken, never calling buildFlowToken or getOrCreateUserByChannel', async () => {
    const renderer = { buildInitialView: jest.fn().mockResolvedValue({ type: 'modal' }) };
    const { handler, getOrCreateUserByChannel, slackWebClient, flowRegistry } = loadHandler({ renderer });

    const payload = {
      trigger_id: 'trigger-456',
      user: { id: 'U0123ABC' },
      actions: [{ action_id: 'open_modal:exam_confirm:sess-789' }],
    };
    const handled = await handler.handleOpenModal(payload);

    expect(handled).toBe(true);
    expect(getOrCreateUserByChannel).not.toHaveBeenCalled();
    expect(flowRegistry.buildFlowToken).not.toHaveBeenCalled();
    expect(renderer.buildInitialView).toHaveBeenCalledWith({
      userId: null, slackUserId: 'U0123ABC', flowToken: 'sess-789',
    });
    expect(slackWebClient.openView).toHaveBeenCalledWith('trigger-456', { type: 'modal' });
  });

  it('every other kind (attendance) still mints a fresh DB-user-keyed flowToken — the sessionId fix is additive, not a regression', async () => {
    const renderer = { buildInitialView: jest.fn().mockResolvedValue({ type: 'modal' }) };
    const { handler, getOrCreateUserByChannel, flowRegistry } = loadHandler({ renderer });

    const payload = {
      trigger_id: 'trigger-789',
      user: { id: 'U0999XYZ' },
      actions: [{ action_id: 'open_modal:attendance' }],
    };
    await handler.handleOpenModal(payload);

    expect(getOrCreateUserByChannel).toHaveBeenCalledWith('slack', 'U0999XYZ');
    expect(flowRegistry.buildFlowToken).toHaveBeenCalledWith('db-user-1', 'attendance');
    expect(renderer.buildInitialView).toHaveBeenCalledWith({
      userId: 'db-user-1', slackUserId: 'U0999XYZ', flowToken: 'db-user-1:attendance:169',
    });
  });
});

describe('handleAttendanceFinish', () => {
  function mockAttendanceEndpoint(handleDoneAction) {
    jest.doMock('../../bot/shared/routes/attendance-setup-endpoint', () => ({ handleDoneAction }));
  }

  it('returns false for a payload whose action is not attendance_finish', async () => {
    const { handler } = loadHandler();
    const handled = await handler.handleAttendanceFinish({ actions: [{ action_id: 'menu_lesson_plan' }] });
    expect(handled).toBe(false);
  });

  it('recovers {list_id, class_display} from private_metadata\'s carry field and calls handleDoneAction directly', async () => {
    const handleDoneAction = jest.fn().mockResolvedValue({ screen: 'SUCCESS', data: { success_message: 'Class ready with 2 students.' } });
    mockAttendanceEndpoint(handleDoneAction);
    const { handler, slackWebClient } = loadHandler();

    const metadata = JSON.stringify({
      kind: 'attendance', screen: 'ADD_STUDENT', flowToken: 'db-user-1:attendance:169',
      carry: { list_id: 'list-1', class_display: 'Grade 3 - A' },
    });
    const payload = {
      user: { id: 'U0123ABC' },
      view: { id: 'V0123VIEW', private_metadata: metadata },
      actions: [{ action_id: 'attendance_finish' }],
    };
    const handled = await handler.handleAttendanceFinish(payload);

    expect(handled).toBe(true);
    expect(handleDoneAction).toHaveBeenCalledWith('list-1', 'Grade 3 - A');
    expect(slackWebClient.postMessage).toHaveBeenCalledWith('U0123ABC', 'Class ready with 2 students.');
  });

  it('reopens ADD_STUDENT with the error when handleDoneAction rejects (no students added yet)', async () => {
    const handleDoneAction = jest.fn().mockResolvedValue({
      screen: 'ADD_STUDENT',
      data: { list_id: 'list-1', class_display: 'Grade 3 - A', heading: 'Add Student #1', error: { message: 'Please add at least one student.' } },
    });
    mockAttendanceEndpoint(handleDoneAction);
    const { handler, slackWebClient } = loadHandler();

    const metadata = JSON.stringify({
      kind: 'attendance', screen: 'ADD_STUDENT', flowToken: 'db-user-1:attendance:169',
      carry: { list_id: 'list-1', class_display: 'Grade 3 - A' },
    });
    const payload = {
      user: { id: 'U0123ABC' },
      view: { id: 'V0123VIEW', private_metadata: metadata },
      actions: [{ action_id: 'attendance_finish' }],
    };
    const handled = await handler.handleAttendanceFinish(payload);

    expect(handled).toBe(true);
    expect(slackWebClient.postMessage).not.toHaveBeenCalled();
    expect(slackWebClient.updateView).toHaveBeenCalledWith('V0123VIEW', expect.objectContaining({ title: expect.objectContaining({ text: 'Add Student #1' }) }));
  });

  it('does not throw if handleDoneAction itself throws', async () => {
    mockAttendanceEndpoint(jest.fn().mockRejectedValue(new Error('boom')));
    const { handler } = loadHandler();

    const metadata = JSON.stringify({ kind: 'attendance', screen: 'ADD_STUDENT', flowToken: 't', carry: { list_id: 'list-1', class_display: 'X' } });
    const payload = {
      user: { id: 'U1' },
      view: { id: 'V1', private_metadata: metadata },
      actions: [{ action_id: 'attendance_finish' }],
    };
    await expect(handler.handleAttendanceFinish(payload)).resolves.toBe(true);
  });
});

describe('handleBackButton', () => {
  it('returns false for a payload whose action is not a *_back action', async () => {
    const { handler } = loadHandler();
    const handled = await handler.handleBackButton({ actions: [{ action_id: 'menu_lesson_plan' }] });
    expect(handled).toBe(false);
  });

  it('calls the renderer\'s handleBack and updates the current view via view.id', async () => {
    const renderer = { handleBack: jest.fn().mockResolvedValue({ type: 'modal', screen: 'PERSONAL_INFO' }) };
    const { handler, slackWebClient } = loadHandler({ renderer });

    const metadata = JSON.stringify({ kind: 'registration', screen: 'PROFESSIONAL_INFO', flowToken: 'db-user-1:registration:169' });
    const payload = {
      user: { id: 'U0123ABC' },
      view: { id: 'V0123VIEW', private_metadata: metadata },
      actions: [{ action_id: 'registration_back' }],
    };
    const handled = await handler.handleBackButton(payload);

    expect(handled).toBe(true);
    expect(renderer.handleBack).toHaveBeenCalledWith(
      { userId: 'db-user-1', slackUserId: 'U0123ABC', flowToken: 'db-user-1:registration:169' },
      'PROFESSIONAL_INFO'
    );
    expect(slackWebClient.updateView).toHaveBeenCalledWith('V0123VIEW', { type: 'modal', screen: 'PERSONAL_INFO' });
  });
});

describe('handleViewSubmission', () => {
  it('resolves kind/screen/flowToken from private_metadata and calls the renderer\'s handleSubmission', async () => {
    const renderer = { handleSubmission: jest.fn().mockResolvedValue({ response_action: 'push', view: {} }) };
    const { handler } = loadHandler({ renderer });

    const metadata = JSON.stringify({ kind: 'registration', screen: 'PERSONAL_INFO', flowToken: 'db-user-1:registration:169' });
    const payload = {
      user: { id: 'U0123ABC' },
      view: { private_metadata: metadata, state: { values: { some: 'values' } } },
    };
    const result = await handler.handleViewSubmission(payload);

    expect(renderer.handleSubmission).toHaveBeenCalledWith(
      { userId: 'db-user-1', slackUserId: 'U0123ABC', flowToken: 'db-user-1:registration:169' },
      'PERSONAL_INFO',
      { some: 'values' },
      undefined,
    );
    expect(result).toEqual({ response_action: 'push', view: {} });
  });

  it('returns null when no renderer is registered for the decoded kind', async () => {
    const { handler } = loadHandler({ renderer: undefined });
    const metadata = JSON.stringify({ kind: 'unknown', screen: 'X', flowToken: 't' });
    const result = await handler.handleViewSubmission({ user: { id: 'U1' }, view: { private_metadata: metadata } });
    expect(result).toBeNull();
  });

  it('returns a safe errors response_action if the renderer throws', async () => {
    const renderer = { handleSubmission: jest.fn().mockRejectedValue(new Error('boom')) };
    const { handler } = loadHandler({ renderer });
    const metadata = JSON.stringify({ kind: 'registration', screen: 'PERSONAL_INFO', flowToken: 't' });
    const result = await handler.handleViewSubmission({ user: { id: 'U1' }, view: { private_metadata: metadata, state: { values: {} } } });
    expect(result).toEqual({ response_action: 'errors', errors: {} });
  });
});
