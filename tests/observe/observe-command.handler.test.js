/**
 * /observe command + the observe tap dispatcher.
 *
 * Gates → one onboarding (persisted FIRST so a crash can't replay it) →
 * capture prompt with the awaiting_audio state armed. Taps are routed by id
 * family to the step that owns them; an id that isn't ours is never consumed.
 */

const { createFakeSupabase } = require('./_helpers/fake-supabase');

const mockDb = createFakeSupabase({
  users: [{ id: 'coach-1', role: 'coach', preferred_language: 'en', preferences: {} }],
  coaching_sessions: [{ id: 'obs-1', observer_user_id: 'coach-1', user_id: 'coach-1', status: 'analyzing', analysis_data: {} }],
});
jest.mock('../../bot/shared/config/supabase', () => mockDb.client);
jest.mock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
const mockRedis = new Map();
jest.mock('../../bot/shared/services/cache/railway-redis.service', () => ({
  setexWithCeiling: jest.fn(async (k, ttl, v) => { mockRedis.set(k, v); return true; }),
  get: jest.fn(async (k) => (mockRedis.has(k) ? JSON.parse(mockRedis.get(k)) : null)),
  delete: jest.fn(async (k) => mockRedis.delete(k)),
}));
jest.mock('../../bot/shared/services/whatsapp.service', () => ({
  sendMessage: jest.fn(async () => true),
  sendInteractiveButtons: jest.fn(async () => true),
  sendInteractiveMessage: jest.fn(async () => true),
}));

const WhatsAppService = require('../../bot/shared/services/whatsapp.service');
const ObserveState = require('../../bot/shared/services/observe/observe-state.service');
const { handleObserveCommand, handleObserveText } = require('../../bot/shared/handlers/observe-command.handler');
const { handleObserveInteractive } = require('../../bot/shared/handlers/observe-interactive.handler');

const coach = () => mockDb.tables.users[0];
const sent = () => WhatsAppService.sendMessage.mock.calls.map((c) => c[1]);

describe('/observe command', () => {
  beforeEach(() => { jest.clearAllMocks(); mockRedis.clear(); process.env.OBSERVE_ENABLED = 'true'; });

  test('feature off: not handled, so the message falls through untouched', async () => {
    delete process.env.OBSERVE_ENABLED;
    expect(await handleObserveCommand(coach(), '15550100001', '/observe')).toBe(false);
    expect(WhatsAppService.sendMessage).not.toHaveBeenCalled();
  });

  test('a teacher is told what /observe is for', async () => {
    expect(await handleObserveCommand({ id: 't', role: null }, '15550100002', '/observe')).toBe(true);
    expect(sent()[0]).toMatch(/people who visit classrooms/);
  });

  test('first use: onboarding is persisted, then sent, then the capture prompt with the state armed', async () => {
    expect(await handleObserveCommand(coach(), '15550100001', '/observe')).toBe(true);
    expect(mockDb.tables.users[0].preferences.observe_onboarded).toBe(true);
    expect(sent()[0]).toMatch(/Welcome to coaching/);
    expect(sent()[0]).toMatch(/TEACH ratings/);
    expect(sent()[1]).toMatch(/record the lesson on your phone/);
    expect((await ObserveState.getState('coach-1')).state).toBe('awaiting_audio');
  });

  test('later uses go straight to the capture prompt', async () => {
    mockDb.tables.users[0].preferences = { observe_onboarded: true };
    await handleObserveCommand(coach(), '15550100001', '/observe');
    expect(sent()).toHaveLength(1);
    expect(sent()[0]).toMatch(/record the lesson on your phone/);
  });

  test('handleObserveText routes /observe and leaves other text alone', async () => {
    mockDb.tables.users[0].preferences = { observe_onboarded: true };
    expect(await handleObserveText(coach(), '15550100001', '/observe')).toBe(true);
    expect(await handleObserveText(coach(), '15550100001', 'hello there')).toBe(false);
  });
});

describe('observe tap dispatcher', () => {
  beforeEach(() => { jest.clearAllMocks(); mockRedis.clear(); process.env.OBSERVE_ENABLED = 'true'; });

  test('ids that are not ours are never consumed', async () => {
    expect(await handleObserveInteractive(coach(), '15550100001', 'coaching_confirm_x')).toBe(false);
    expect(await handleObserveInteractive(null, '15550100001', 'observe_ok_obs-1')).toBe(false);
  });

  test('observe_ok_ is acknowledged silently; observe_cancel_ asks; observe_cancel_yes_ cancels', async () => {
    expect(await handleObserveInteractive(coach(), '15550100001', 'observe_ok_obs-1')).toBe(true);
    expect(WhatsAppService.sendMessage).not.toHaveBeenCalled();
    expect(await handleObserveInteractive(coach(), '15550100001', 'observe_cancel_obs-1')).toBe(true);
    expect(WhatsAppService.sendInteractiveButtons.mock.calls[0][1].buttons[0].id).toBe('observe_cancel_yes_obs-1');
    expect(await handleObserveInteractive(coach(), '15550100001', 'observe_cancel_yes_obs-1')).toBe(true);
    expect(mockDb.tables.coaching_sessions[0].status).toBe('cancelled');
  });

  test('observe_lp_ rows go to the plan service', async () => {
    const Plan = require('../../bot/shared/services/observe/observe-plan.service');
    const spy = jest.spyOn(Plan, 'handlePlanPick');
    expect(await handleObserveInteractive(coach(), '15550100001', 'observe_lp_obs-1_none')).toBe(true);
    expect(spy).toHaveBeenCalledWith(coach(), '15550100001', 'observe_lp_obs-1_none');
    spy.mockRestore();
  });

  test('observe_who_ rows go to the who service', async () => {
    expect(await handleObserveInteractive(coach(), '15550100001', 'observe_who_obs-1_other')).toBe(true);
    expect(sent()[0]).toMatch(/type the name/);
  });
});
