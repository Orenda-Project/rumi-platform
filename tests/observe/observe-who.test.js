/**
 * "Who did you observe?" — asked after a bare capture, never blocking it. The
 * coach's tap records the visit (an observation_schedules row, status done)
 * AND re-owns the session to that teacher, so the report, the trend and the
 * pending list all know whose lesson it was.
 */

const { createFakeSupabase } = require('./_helpers/fake-supabase');

const mockDb = createFakeSupabase({
  users: [
    { id: 'coach-1', role: 'coach', name: 'Robin Coach', phone_number: '15550100001' },
    { id: 't-1', name: 'Sam Taylor', phone_number: 'mtx:15550100002', school_id: 'sch-1' },
    { id: 't-2', name: 'Alex Kim', phone_number: '15550100003', school_id: 'sch-1' },
  ],
  leader_schools: [{ id: 'ls-1', leader_user_id: 'coach-1', school_id: 'sch-1', school_ext_id: 'S-001', school_name: 'Hillside Primary' }],
  coaching_sessions: [{ id: 'obs-1', user_id: 'coach-1', observer_user_id: 'coach-1', observation_type: 'leader_observation', status: 'analyzing' }],
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
  sendInteractiveMessage: jest.fn(async () => true),
}));

const WhatsAppService = require('../../bot/shared/services/whatsapp.service');
const Who = require('../../bot/shared/services/observe/observe-who.service');

const COACH = { id: 'coach-1', role: 'coach', preferred_language: 'en' };

describe('observe-who', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  test('parseWhoId reads observe_who_<session>_<index|other>', () => {
    expect(Who.parseWhoId('observe_who_obs-1_2')).toEqual({ sessionId: 'obs-1', index: 2, other: false });
    expect(Who.parseWhoId('observe_who_obs-1_other')).toEqual({ sessionId: 'obs-1', index: null, other: true });
    expect(Who.parseWhoId('observe_ok_obs-1')).toBeNull();
  });

  test('asks with one row per roster teacher plus "someone else"', async () => {
    expect(await Who.maybeAskObservedTeacher(COACH, '15550100001', 'obs-1')).toBe(true);
    const payload = WhatsAppService.sendInteractiveMessage.mock.calls[0][1];
    const rows = payload.action.sections[0].rows;
    expect(rows.map((r) => r.title)).toEqual(['Alex Kim', 'Sam Taylor', 'Someone else']);
    expect(rows[0]).toMatchObject({ id: 'observe_who_obs-1_0', description: 'Hillside Primary' });
  });

  test('a coach with no roster is not asked (nothing to offer)', async () => {
    expect(await Who.maybeAskObservedTeacher({ id: 'nobody' }, '15550100009', 'obs-1')).toBe(false);
    expect(WhatsAppService.sendInteractiveMessage).not.toHaveBeenCalled();
  });

  test('a tap records the visit and re-owns the bare session to the teacher', async () => {
    await Who.maybeAskObservedTeacher(COACH, '15550100001', 'obs-1');
    expect(await Who.handleObservedTeacherPick(COACH, '15550100001', 'observe_who_obs-1_1')).toBe(true);
    expect(mockDb.tables.observation_schedules).toHaveLength(1);
    expect(mockDb.tables.observation_schedules[0]).toMatchObject({
      leader_user_id: 'coach-1', session_id: 'obs-1', teacher_ext_id: 't-1', teacher_name: 'Sam Taylor', school_ext_id: 'S-001', status: 'done',
    });
    expect(mockDb.tables.coaching_sessions[0].user_id).toBe('t-1');
    expect(WhatsAppService.sendMessage.mock.calls.pop()[1]).toBe('Thanks — noted Sam Taylor.');
    // Re-tapping the same teacher replaces the record rather than piling up a second one.
    await Who.handleObservedTeacherPick(COACH, '15550100001', 'observe_who_obs-1_1');
    expect(mockDb.tables.observation_schedules).toHaveLength(1);
    expect(mockDb.tables.coaching_sessions[0].user_id).toBe('t-1');
    expect(WhatsAppService.sendMessage.mock.calls.pop()[1]).toBe('Thanks — noted Sam Taylor.');
  });

  test('once the teacher is named, the coach is asked which of their plans the lesson used (fidelity on)', async () => {
    process.env.LP_FIDELITY_ENABLED = 'true';
    mockDb.tables.lesson_plans = [{ id: 'lp-1', user_id: 't-1', type: 'lesson_plan', topic: 'Fractions', grade: '4', created_at: '2026-09-30T08:00:00Z' }];
    await Who.maybeAskObservedTeacher(COACH, '15550100001', 'obs-1');
    await Who.handleObservedTeacherPick(COACH, '15550100001', 'observe_who_obs-1_1');
    delete process.env.LP_FIDELITY_ENABLED;
    const last = WhatsAppService.sendInteractiveMessage.mock.calls.pop()[1];
    expect(last.action.sections[0].rows.map((r) => r.id)).toEqual(['observe_lp_obs-1_0', 'observe_lp_obs-1_none']);
    expect(WhatsAppService.sendMessage.mock.calls.pop()[1]).toBe('Thanks — noted Sam Taylor.');
  });

  test('a re-tap never moves an observation already bound to another teacher', async () => {
    // Bound to Sam Taylor (t-1) by the tap above; the list is still live for 2 h.
    const schedulesBefore = JSON.stringify(mockDb.tables.observation_schedules);
    expect(await Who.handleObservedTeacherPick(COACH, '15550100001', 'observe_who_obs-1_0')).toBe(true);
    expect(mockDb.tables.coaching_sessions[0].user_id).toBe('t-1');
    expect(JSON.stringify(mockDb.tables.observation_schedules)).toBe(schedulesBefore);   // the visit record too
    expect(WhatsAppService.sendMessage.mock.calls.pop()[1]).toBe('This observation is already recorded for a teacher, so it was left as it is.');
  });

  test('once the report went to the teacher, even the same teacher\'s re-tap changes nothing', async () => {
    const s = mockDb.tables.coaching_sessions[0];
    s.analysis_data = { teacher_delivery: { status: 'sent', teacher_user_id: 't-1' } };
    const before = JSON.stringify(s);
    const schedulesBefore = JSON.stringify(mockDb.tables.observation_schedules);
    await Who.handleObservedTeacherPick(COACH, '15550100001', 'observe_who_obs-1_1');
    expect(JSON.stringify(mockDb.tables.coaching_sessions[0])).toBe(before);
    expect(JSON.stringify(mockDb.tables.observation_schedules)).toBe(schedulesBefore);
    expect(WhatsAppService.sendMessage.mock.calls.pop()[1]).toMatch(/already recorded/);
  });

  test('a stale list says so instead of guessing', async () => {
    mockRedis.clear();
    await Who.handleObservedTeacherPick(COACH, '15550100001', 'observe_who_obs-1_0');
    expect(WhatsAppService.sendMessage.mock.calls.pop()[1]).toMatch(/expired/);
  });
});
