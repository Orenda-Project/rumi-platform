/**
 * Capture: a coach's recording becomes a leader_observation row on the normal
 * coaching pipeline, the slot is freed for the next recording, and the coach
 * gets an ack with a way out. Cancel is asked once and refused after delivery.
 */

const { createFakeSupabase } = require('./_helpers/fake-supabase');

const mockDb = createFakeSupabase({
  users: [
    { id: 'coach-1', role: 'coach', name: 'Robin Coach', phone_number: '15550100001', preferred_language: 'en' },
    { id: 't-1', name: 'Sam Taylor', phone_number: 'mtx:15550100002', school_id: 'sch-1' },
  ],
  observation_schedules: [
    { id: 'sched-1', leader_user_id: 'coach-1', school_ext_id: 'S-001', teacher_ext_id: 't-1', scheduled_for: '2026-10-01', status: 'upcoming' },
  ],
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
const mockQueue = { queueCoachingJob: jest.fn(async () => 'm1') };
jest.mock('../../bot/shared/services/queue', () => mockQueue);

const WhatsAppService = require('../../bot/shared/services/whatsapp.service');
const ObserveState = require('../../bot/shared/services/observe/observe-state.service');
const Capture = require('../../bot/shared/services/observe/observe-capture.service');

const COACH = { id: 'coach-1', role: 'coach', preferred_language: 'en' };

describe('observe capture', () => {
  beforeEach(() => { jest.clearAllMocks(); mockRedis.clear(); });

  test('a bare capture: coach owns the row as observer, transcription queued, slot freed, ack with OK/Cancel', async () => {
    await ObserveState.setState('coach-1', 'awaiting_audio');
    const session = await Capture.startFromAudio(COACH, '15550100001', 'media-1', 'chat-1', 1200);

    expect(session).toMatchObject({
      user_id: 'coach-1', observer_user_id: 'coach-1', observation_type: 'leader_observation',
      status: 'confirmed', debrief_status: 'pending', audio_id: 'media-1', audio_duration_seconds: 1200,
    });
    expect(mockQueue.queueCoachingJob).toHaveBeenCalledWith(session.id, 'transcription', { from: '15550100001', audioId: 'media-1' });
    expect(await ObserveState.getState('coach-1')).toBeNull();
    const ack = WhatsAppService.sendInteractiveButtons.mock.calls[0][1];
    expect(ack.buttons.map((b) => b.id)).toEqual([`observe_ok_${session.id}`, `observe_cancel_${session.id}`]);
    expect(ack.body).toMatch(/TEACH ratings/);
  });

  test('a capture bound by the visit picker is owned by the teacher and retires the upcoming visit', async () => {
    await ObserveState.setState('coach-1', 'awaiting_audio', {
      boundTeacher: { user_id: 't-1', teacher_ext_id: 't-1', school_ext_id: 'S-001', name: 'Sam Taylor' },
    });
    const session = await Capture.startFromAudio(COACH, '15550100001', 'media-2', 'chat-1', null);
    expect(session.user_id).toBe('t-1');
    expect(session.observer_user_id).toBe('coach-1');
    expect(mockDb.tables.observation_schedules[0]).toMatchObject({ status: 'done', session_id: session.id });
  });

  test('a bound capture asks which lesson plan it was taught from (fidelity on), after the ack', async () => {
    process.env.LP_FIDELITY_ENABLED = 'true';
    mockDb.tables.lesson_plans = [{ id: 'lp-1', user_id: 't-1', type: 'lesson_plan', topic: 'Fractions', grade: '4', created_at: '2026-09-30T08:00:00Z' }];
    await ObserveState.setState('coach-1', 'awaiting_audio', {
      boundTeacher: { user_id: 't-1', teacher_ext_id: 't-1', school_ext_id: 'S-001', name: 'Sam Taylor' },
    });
    const session = await Capture.startFromAudio(COACH, '15550100001', 'media-4', 'chat-1', null);
    delete process.env.LP_FIDELITY_ENABLED;
    const lists = WhatsAppService.sendInteractiveMessage.mock.calls.map((c) => c[1].action.sections[0].rows.map((r) => r.id));
    expect(lists).toEqual([[`observe_lp_${session.id}_0`, `observe_lp_${session.id}_none`]]);
    expect(WhatsAppService.sendInteractiveButtons).toHaveBeenCalled();
  });

  test('a failed plan question never costs the capture', async () => {
    process.env.LP_FIDELITY_ENABLED = 'true';
    WhatsAppService.sendInteractiveMessage.mockRejectedValueOnce(new Error('down'));
    await ObserveState.setState('coach-1', 'awaiting_audio', {
      boundTeacher: { user_id: 't-1', teacher_ext_id: 't-1', school_ext_id: 'S-001', name: 'Sam Taylor' },
    });
    const session = await Capture.startFromAudio(COACH, '15550100001', 'media-5', 'chat-1', null);
    delete process.env.LP_FIDELITY_ENABLED;
    expect(session).toMatchObject({ user_id: 't-1', status: 'confirmed' });
  });

  test('a failed insert says the save failed — not "no account"', async () => {
    const realFrom = mockDb.client.from;
    mockDb.client.from = (name) => {
      const b = realFrom(name);
      if (name === 'coaching_sessions') b.single = () => ({ then: (r) => r({ data: null, error: { message: 'column missing' } }) });
      return b;
    };
    const out = await Capture.startFromAudio(COACH, '15550100001', 'media-3', 'chat-1');
    mockDb.client.from = realFrom;
    expect(out).toBeNull();
    expect(WhatsAppService.sendMessage.mock.calls[0][1]).toMatch(/went wrong on my side/);
    expect(mockQueue.queueCoachingJob).not.toHaveBeenCalled();
  });

  test('cancel is confirmed first, then marks the row cancelled; refused once the report was sent', async () => {
    mockDb.tables.coaching_sessions.push(
      { id: 'obs-1', observer_user_id: 'coach-1', status: 'awaiting_observer_review', analysis_data: {} },
      { id: 'obs-2', observer_user_id: 'coach-1', status: 'observer_review_complete', analysis_data: { teacher_delivery: { status: 'sent' } } },
    );
    await Capture.askCancel(COACH, '15550100001', 'obs-1');
    expect(WhatsAppService.sendInteractiveButtons.mock.calls[0][1].buttons[0].id).toBe('observe_cancel_yes_obs-1');
    await Capture.cancelObservation(COACH, '15550100001', 'obs-1');
    expect(mockDb.tables.coaching_sessions.find((s) => s.id === 'obs-1').status).toBe('cancelled');
    await Capture.cancelObservation(COACH, '15550100001', 'obs-2');
    expect(mockDb.tables.coaching_sessions.find((s) => s.id === 'obs-2').status).toBe('observer_review_complete');
    expect(WhatsAppService.sendMessage.mock.calls.pop()[1]).toMatch(/already reached the teacher/);
  });

  test('someone else\'s observation cannot be cancelled', async () => {
    mockDb.tables.coaching_sessions.push({ id: 'obs-3', observer_user_id: 'coach-9', status: 'confirmed' });
    await Capture.cancelObservation(COACH, '15550100001', 'obs-3');
    expect(mockDb.tables.coaching_sessions.find((s) => s.id === 'obs-3').status).toBe('confirmed');
  });
});
