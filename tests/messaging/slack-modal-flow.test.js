/**
 * slack-modal-flow.js — the Block Kit modal renderer built on an endpoint's
 * own {init, exchange, back} functions, NOT on text-flow.js's step engine.
 * Exercised against a small fake endpoint so this test never touches a real
 * *-endpoint.js file or Redis.
 */

jest.mock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));

const { buildEndpointModal, encodeMetadata, decodeMetadata } = require('../../bot/shared/services/messaging/slack-modal-flow');

function fakeEndpoint() {
  return {
    init: jest.fn().mockResolvedValue({ screen: 'STEP_ONE', data: { options: [{ id: 'a', title: 'A' }] } }),
    exchange: jest.fn(),
    back: jest.fn().mockResolvedValue({ screen: 'STEP_ONE', data: { options: [{ id: 'a', title: 'A' }] } }),
  };
}

function fakeScreenToView(screen, data, ctx) {
  return { type: 'modal', callback_id: 'fake', private_metadata: ctx.metadata, blocks: [], screen };
}

function fakeViewToScreenData(screen, stateValues) {
  return stateValues;
}

describe('encodeMetadata / decodeMetadata', () => {
  it('round-trips kind, screen, and flowToken', () => {
    const encoded = encodeMetadata('registration', 'PERSONAL_INFO', 'u1:registration:169');
    expect(decodeMetadata(encoded)).toEqual({ kind: 'registration', screen: 'PERSONAL_INFO', flowToken: 'u1:registration:169' });
  });

  it('decodeMetadata returns {} for malformed/missing input, never throws', () => {
    expect(decodeMetadata(undefined)).toEqual({});
    expect(decodeMetadata('not json')).toEqual({});
  });
});

describe('buildEndpointModal', () => {
  it('throws synchronously if required config is missing', () => {
    expect(() => buildEndpointModal({})).toThrow(/needs/);
    expect(() => buildEndpointModal({ kind: 'x' })).toThrow(/needs/);
  });

  it('buildInitialView calls init() and returns the screen mapped through screenToView, carrying metadata', async () => {
    const endpoint = fakeEndpoint();
    const renderer = buildEndpointModal({
      kind: 'fake', ...endpoint, screenToView: fakeScreenToView, viewToScreenData: fakeViewToScreenData,
    });

    const view = await renderer.buildInitialView({ userId: 'u1', flowToken: 'u1:fake:169' });

    expect(endpoint.init).toHaveBeenCalledWith({ userId: 'u1', flowToken: 'u1:fake:169' });
    expect(view.screen).toBe('STEP_ONE');
    expect(decodeMetadata(view.private_metadata)).toEqual({ kind: 'fake', screen: 'STEP_ONE', flowToken: 'u1:fake:169' });
  });

  it('handleSubmission on a non-terminal screen returns response_action: push with the next screen view', async () => {
    const endpoint = fakeEndpoint();
    endpoint.exchange.mockResolvedValue({ screen: 'STEP_TWO', data: {} });
    const renderer = buildEndpointModal({
      kind: 'fake', ...endpoint, screenToView: fakeScreenToView, viewToScreenData: fakeViewToScreenData,
    });

    const result = await renderer.handleSubmission({ userId: 'u1', flowToken: 'u1:fake:169' }, 'STEP_ONE', { some: 'values' });

    expect(endpoint.exchange).toHaveBeenCalledWith({ userId: 'u1', flowToken: 'u1:fake:169' }, 'STEP_ONE', { some: 'values' });
    expect(result.response_action).toBe('push');
    expect(result.view.screen).toBe('STEP_TWO');
  });

  it('handleSubmission on the SUCCESS screen calls onFinish and returns response_action: clear', async () => {
    const endpoint = fakeEndpoint();
    endpoint.exchange.mockResolvedValue({ screen: 'SUCCESS', data: { welcome_message: 'hi' } });
    const onFinish = jest.fn().mockResolvedValue(undefined);
    const renderer = buildEndpointModal({
      kind: 'fake', ...endpoint, screenToView: fakeScreenToView, viewToScreenData: fakeViewToScreenData, onFinish,
    });

    const ctx = { userId: 'u1', flowToken: 'u1:fake:169', slackUserId: 'U0123ABC' };
    const result = await renderer.handleSubmission(ctx, 'STEP_ONE', {});

    expect(onFinish).toHaveBeenCalledWith({ screen: 'SUCCESS', data: { welcome_message: 'hi' } }, ctx);
    expect(result).toEqual({ response_action: 'clear' });
  });

  it('handleSubmission surfaces a validation error via response_action: errors, attached to the per-screen block id', async () => {
    const endpoint = fakeEndpoint();
    endpoint.exchange.mockResolvedValue({ data: { error: { message: 'Name is required' } } });
    const renderer = buildEndpointModal({
      kind: 'fake', ...endpoint, screenToView: fakeScreenToView, viewToScreenData: fakeViewToScreenData,
      firstInputBlockId: { STEP_ONE: 'name_block' },
    });

    const result = await renderer.handleSubmission({ userId: 'u1', flowToken: 'u1:fake:169' }, 'STEP_ONE', {});

    expect(result).toEqual({ response_action: 'errors', errors: { name_block: 'Name is required' } });
  });

  it('handleBack calls the endpoint\'s own back() (real server branching), not a client-side stack pop', async () => {
    const endpoint = fakeEndpoint();
    const renderer = buildEndpointModal({
      kind: 'fake', ...endpoint, screenToView: fakeScreenToView, viewToScreenData: fakeViewToScreenData,
    });

    const view = await renderer.handleBack({ userId: 'u1', flowToken: 'u1:fake:169' }, 'STEP_TWO');

    expect(endpoint.back).toHaveBeenCalledWith({ userId: 'u1', flowToken: 'u1:fake:169' }, 'STEP_TWO');
    expect(view.screen).toBe('STEP_ONE');
  });

  it('handleBack returns null when the endpoint has no back() (e.g. settings, a single-screen flow)', async () => {
    const endpoint = fakeEndpoint();
    delete endpoint.back;
    const renderer = buildEndpointModal({
      kind: 'fake', ...endpoint, screenToView: fakeScreenToView, viewToScreenData: fakeViewToScreenData,
    });

    const view = await renderer.handleBack({ userId: 'u1' }, 'STEP_ONE');
    expect(view).toBeNull();
  });
});
