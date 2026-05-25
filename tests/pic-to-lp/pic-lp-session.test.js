/**
 * pic-lp-session service — TTL helper + status-set shapes.
 */

let PicLpSession;

beforeEach(() => {
  jest.resetModules();
  jest.doMock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
  jest.doMock('../../bot/shared/config/supabase', () => ({ from: jest.fn() }));
  PicLpSession = require('../../bot/shared/services/pic-to-lp/pic-lp-session.service');
});
afterEach(() => jest.resetModules());

describe('ttlExpiryIsoForStatus', () => {
  it('returns null for terminal statuses', () => {
    for (const s of PicLpSession.TERMINAL_STATUSES) {
      expect(PicLpSession.ttlExpiryIsoForStatus(s)).toBeNull();
    }
  });

  it('returns a future ISO timestamp for active statuses', () => {
    for (const s of PicLpSession.ACTIVE_STATUSES) {
      const iso = PicLpSession.ttlExpiryIsoForStatus(s);
      expect(typeof iso).toBe('string');
      expect(new Date(iso).getTime()).toBeGreaterThan(Date.now());
    }
  });

  it('returns null for an unknown status', () => {
    expect(PicLpSession.ttlExpiryIsoForStatus('not_a_status')).toBeNull();
  });
});

describe('status sets', () => {
  it('ACTIVE_STATUSES are the four non-terminal states', () => {
    expect(PicLpSession.ACTIVE_STATUSES).toEqual([
      'awaiting_intent', 'collecting_pages', 'awaiting_form_submit', 'generating',
    ]);
  });

  it('TERMINAL_STATUSES include cancelled/timed_out/failed/handed_off', () => {
    expect(PicLpSession.TERMINAL_STATUSES).toEqual(
      expect.arrayContaining(['cancelled', 'timed_out', 'failed', 'handed_off'])
    );
  });

  it('active and terminal sets are disjoint', () => {
    const overlap = PicLpSession.ACTIVE_STATUSES.filter((s) => PicLpSession.TERMINAL_STATUSES.includes(s));
    expect(overlap).toHaveLength(0);
  });
});
