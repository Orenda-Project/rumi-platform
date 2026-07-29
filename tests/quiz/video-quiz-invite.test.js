'use strict';
/**
 * bd-2339 — a child passes the quiz to a friend, and hears how they did.
 *
 * This is the one place in the feature where two CHILDREN exchange information,
 * so the boundary is the thing under test. Operator decision (2026-07-28):
 * first name and score cross, nothing else. Not their class, not their phone,
 * not which questions they missed.
 *
 * The structural choice worth guarding: a child arriving through an invite is
 * recorded against the TEACHER's share code, not the invite. That is what keeps
 * her class report correct without the report knowing invites exist.
 */

jest.mock('../../bot/shared/config/supabase', () => ({ from: jest.fn() }));
jest.mock('../../bot/shared/services/cache/railway-redis.service', () => ({
  get: jest.fn(), set: jest.fn().mockResolvedValue(true), delete: jest.fn(),
}));
jest.mock('../../bot/shared/services/whatsapp.service', () => ({
  sendMessage: jest.fn().mockResolvedValue(true),
  sendInteractiveButtons: jest.fn().mockResolvedValue(true),
}));
jest.mock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
jest.mock('../../bot/shared/utils/structured-logger', () => ({ logEvent: jest.fn() }));

const WhatsAppService = require('../../bot/shared/services/whatsapp.service');
const invite = require('../../bot/shared/services/quiz/video-quiz-invite.service');

beforeEach(() => jest.clearAllMocks());

describe('bd-2339 — what crosses between two children', () => {
  const friend = {
    student_name: 'Bilal Ahmed', student_class: '3-B',
    correct_answers: 11, total_questions_answered: 15, mastery_percentage: 73,
    parent_phone: '923009998888',
  };
  const inviter = { student_name: 'Hooria Khan', correct_answers: 13,
                    total_questions_answered: 15, mastery_percentage: 87 };

  test('the friend is named by first name only', () => {
    const msg = invite.buildComparison({ inviter, friend, topic: 'A Balanced Diet' });
    expect(msg).toContain('Bilal');
    expect(msg).not.toContain('Ahmed');        // no family name
  });

  test('nothing beyond a name and a score crosses', () => {
    const msg = invite.buildComparison({ inviter, friend, topic: 'A Balanced Diet' });
    expect(msg).not.toContain('3-B');            // not their class
    expect(msg).not.toContain('923009998888');   // not their number
    expect(msg).not.toMatch(/question/i);        // not which ones they missed
  });

  test('both scores are shown so it reads as a comparison', () => {
    const msg = invite.buildComparison({ inviter, friend, topic: 'A Balanced Diet' });
    expect(msg).toMatch(/11/);      // friend's score
    expect(msg).toMatch(/13/);      // the inviter's own
  });

  test('a friend who did better is not framed as a defeat', () => {
    const msg = invite.buildComparison({
      inviter: { ...inviter, correct_answers: 8, mastery_percentage: 53 },
      friend, topic: 'A Balanced Diet',
    });
    // Children show these to each other. No "you lost", no "beat you".
    expect(msg).not.toMatch(/\b(lost|beat|worse|failed|loser)\b/i);
  });
});

describe('bd-2339 — an invite does not disturb the teacher', () => {
  test('a session from an invite is recorded against the teacher code', async () => {
    const captured = {};
    const supabase = require('../../bot/shared/config/supabase');
    supabase.from.mockImplementation(() => {
      const chain = {
        select: () => chain, eq: () => chain,
        maybeSingle: async () => ({
          data: {
            id: 'inv-1', code: 'F3K9M2', quiz_id: 'q1', video_id: 'v1',
            teacher_name: 'Miss Ayesha', topic: 'A Balanced Diet', language: 'en',
            active: true, expires_at: null,
            invited_by_student_id: 'stu-inviter',
            parent_share_code_id: 'sc-teacher',
          },
        }),
        insert: (p) => { Object.assign(captured, p); return chain; },
      };
      return chain;
    });

    const resolved = await invite.resolveInvite('F3K9M2');
    // The child counts toward the TEACHER's report...
    expect(resolved.shareCodeId).toBe('sc-teacher');
    // ...and separately, the friend who sent them is remembered.
    expect(resolved.invitedByStudentId).toBe('stu-inviter');
  });

  test('a teacher-minted code resolves to itself with no inviter', async () => {
    const supabase = require('../../bot/shared/config/supabase');
    supabase.from.mockImplementation(() => {
      const chain = {
        select: () => chain, eq: () => chain,
        maybeSingle: async () => ({
          data: {
            id: 'sc-teacher', code: 'K7RM2', quiz_id: 'q1', video_id: 'v1',
            active: true, expires_at: null,
            invited_by_student_id: null, parent_share_code_id: null,
          },
        }),
      };
      return chain;
    });
    const resolved = await invite.resolveInvite('K7RM2');
    expect(resolved.shareCodeId).toBe('sc-teacher');
    expect(resolved.invitedByStudentId).toBeNull();
  });
});

describe('bd-2339 — the offer', () => {
  test('a child who finished is offered it with two choices', async () => {
    await invite.offerInvite({
      phone: '923001234567', studentId: 'stu-1', shareCodeId: 'sc-1',
    });
    expect(WhatsAppService.sendInteractiveButtons).toHaveBeenCalled();
    const [, opts] = WhatsAppService.sendInteractiveButtons.mock.calls[0];
    expect(opts.buttons).toHaveLength(2);
    for (const b of opts.buttons) expect(b.title.length).toBeLessThanOrEqual(20);
  });

  test('a child we could not identify is not offered it', async () => {
    // Without a student id there is nobody to send the comparison back to, so
    // the offer would be a promise we cannot keep.
    await invite.offerInvite({ phone: '923001234567', studentId: null, shareCodeId: 'sc-1' });
    expect(WhatsAppService.sendInteractiveButtons).not.toHaveBeenCalled();
  });
});
