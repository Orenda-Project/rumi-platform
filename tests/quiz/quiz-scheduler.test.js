/**
 * quiz-scheduler.service — school-hours window + next-school-hour selection.
 * supabase / whatsapp / logger are mocked (loaded at module top level).
 */

let QuizSchedulerService;

beforeEach(() => {
  jest.resetModules();
  jest.doMock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
  jest.doMock('../../bot/shared/config/supabase', () => ({ from: jest.fn() }));
  jest.doMock('../../bot/shared/services/whatsapp.service', () => ({ sendMessage: jest.fn() }));
  QuizSchedulerService = require('../../bot/shared/services/quiz/quiz-scheduler.service');
});
afterEach(() => jest.resetModules());

// Helper: build a Date at a given PKT (UTC+5) hour on a given weekday.
// We construct in UTC then the service converts via (UTCHours + 5) % 24.
function dateAtUtc(year, monthIdx, day, utcHour) {
  return new Date(Date.UTC(year, monthIdx, day, utcHour, 0, 0));
}

describe('isSchoolHours', () => {
  it('is true on a weekday inside 8am-4pm PKT', () => {
    // Mon 2026-05-25, 10am PKT = 5:00 UTC
    expect(QuizSchedulerService.isSchoolHours(dateAtUtc(2026, 4, 25, 5))).toBe(true);
  });

  it('is false before 8am PKT', () => {
    // Mon, 7am PKT = 2:00 UTC
    expect(QuizSchedulerService.isSchoolHours(dateAtUtc(2026, 4, 25, 2))).toBe(false);
  });

  it('is false at/after 4pm PKT', () => {
    // Mon, 4pm PKT = 11:00 UTC
    expect(QuizSchedulerService.isSchoolHours(dateAtUtc(2026, 4, 25, 11))).toBe(false);
  });

  it('is always false on Sunday', () => {
    // 2026-05-24 is a Sunday; 10am PKT = 5:00 UTC
    expect(QuizSchedulerService.isSchoolHours(dateAtUtc(2026, 4, 24, 5))).toBe(false);
  });

  it('closes early on Friday (only until 12pm PKT)', () => {
    // 2026-05-22 is a Friday. 9am PKT = 4:00 UTC → open; 1pm PKT = 8:00 UTC → closed.
    expect(QuizSchedulerService.isSchoolHours(dateAtUtc(2026, 4, 22, 4))).toBe(true);
    expect(QuizSchedulerService.isSchoolHours(dateAtUtc(2026, 4, 22, 8))).toBe(false);
  });
});

describe('nextSchoolHour', () => {
  it('returns 9am PKT (4:00 UTC) later the same day when called before 9am', () => {
    // Mon 6am PKT = 1:00 UTC; next school hour is today 4:00 UTC
    const from = dateAtUtc(2026, 4, 25, 1);
    const next = QuizSchedulerService.nextSchoolHour(from);
    expect(next.getUTCHours()).toBe(4);
    expect(next.getUTCDate()).toBe(25);
    expect(next > from).toBe(true);
  });

  it('rolls to the next day when 9am has already passed', () => {
    // Mon 2pm PKT = 9:00 UTC; 9am today already gone → tomorrow
    const from = dateAtUtc(2026, 4, 25, 9);
    const next = QuizSchedulerService.nextSchoolHour(from);
    expect(next.getUTCDate()).toBe(26);
    expect(next.getUTCHours()).toBe(4);
  });

  it('skips Sunday', () => {
    // Sat 2026-05-23 2pm PKT = 9:00 UTC → would roll to Sunday, must skip to Monday
    const from = dateAtUtc(2026, 4, 23, 9);
    const next = QuizSchedulerService.nextSchoolHour(from);
    expect(next.getDay()).not.toBe(0);
  });
});
