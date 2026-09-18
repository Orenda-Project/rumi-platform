/**
 * Writing feedback — parsing the parent's reply.
 *
 * `applyParentEdits` is the human-in-the-loop gate in code form. Two failure
 * modes matter more than anything else here:
 *
 *   1. Reading a malformed reply as a CONFIRM. That would push feedback to a
 *      child the parent never approved — the exact thing this feature exists
 *      to prevent. So every unparseable reply must come back as `unknown`,
 *      never as `confirm`.
 *   2. Silently no-opping. A parent who types "drop 4" when there are 3 points
 *      must be told, not ignored (pre-merge-checklist Class A, in spirit).
 *
 * Pure function — no DB, no LLM, no mocks needed beyond the service's own
 * module-level requires.
 */

jest.mock('../../bot/shared/config/supabase', () => ({ from: () => ({}) }));
jest.mock('../../bot/shared/services/cache/railway-redis.service', () => ({
  get: async () => null,
  setex: async () => {},
  delete: async () => {},
}));

const { applyParentEdits, parseAge } = require('../../bot/shared/services/writing-feedback.service');

const draft = () => ({
  praise: 'You used "delicious" — a strong, specific word.',
  edits: [
    { what: 'My ami give me', why: 'It already happened.', better: 'My ami gave me' },
    { what: 'We go to my nana house', why: 'The house belongs to nana.', better: "We went to my nana's house" },
    { what: 'It was the best day', why: 'Tell us why it was the best.', better: 'It was the best day because…' },
  ],
});

describe('Writing feedback — parent edit commands', () => {
  describe('confirm', () => {
    it.each(['send', 'Send', ' SEND ', 'send it', 'ok send', 'confirm', 'looks good', 'go ahead'])(
      'treats %p as a confirm',
      (reply) => {
        const result = applyParentEdits(draft(), reply);
        expect(result.action).toBe('confirm');
        expect(result.draft.edits).toHaveLength(3);
        expect(result.editsApplied).toBe(0);
      }
    );
  });

  describe('drop', () => {
    it('drops one point by number', () => {
      const result = applyParentEdits(draft(), 'drop 2');
      expect(result.action).toBe('edit');
      expect(result.editsApplied).toBe(1);
      expect(result.draft.edits.map((e) => e.what)).toEqual(['My ami give me', 'It was the best day']);
    });

    it('drops several at once without index drift', () => {
      const result = applyParentEdits(draft(), 'drop 1 and 3');
      expect(result.draft.edits.map((e) => e.what)).toEqual(['We go to my nana house']);
      expect(result.editsApplied).toBe(2);
    });

    it('accepts remove / delete as the same instruction', () => {
      expect(applyParentEdits(draft(), 'remove 1').draft.edits).toHaveLength(2);
      expect(applyParentEdits(draft(), 'delete 3').draft.edits).toHaveLength(2);
    });

    it('ignores a repeated number rather than over-splicing', () => {
      const result = applyParentEdits(draft(), 'drop 2, 2');
      expect(result.draft.edits).toHaveLength(2);
      expect(result.editsApplied).toBe(1);
    });

    it('never mutates the draft it was handed', () => {
      const original = draft();
      applyParentEdits(original, 'drop 1');
      expect(original.edits).toHaveLength(3);
    });
  });

  describe('change', () => {
    it('replaces a point with the parent\'s own wording (colon form)', () => {
      const result = applyParentEdits(draft(), 'change 1: say "gave" instead, we talked about this yesterday');
      expect(result.action).toBe('edit');
      expect(result.draft.edits[0].better).toBe('say "gave" instead, we talked about this yesterday');
      expect(result.draft.edits[0].source).toBe('parent');
      // The quote and reason she kept are left alone.
      expect(result.draft.edits[0].what).toBe('My ami give me');
    });

    it('accepts the "change N to ..." form', () => {
      const result = applyParentEdits(draft(), 'change 2 to just talk about the apostrophe');
      expect(result.draft.edits[1].better).toBe('just talk about the apostrophe');
    });
  });

  describe('add', () => {
    it('appends a parent-authored point', () => {
      const result = applyParentEdits(draft(), 'add: tell him the ending made me smile');
      expect(result.action).toBe('edit');
      expect(result.draft.edits).toHaveLength(4);
      expect(result.draft.edits[3]).toMatchObject({
        better: 'tell him the ending made me smile',
        source: 'parent',
      });
    });

    it('accepts "add" without the colon', () => {
      const result = applyParentEdits(draft(), 'add one more about handwriting');
      expect(result.draft.edits.slice(-1)[0].better).toBe('one more about handwriting');
    });
  });

  describe('malformed input never becomes a confirm', () => {
    it.each([
      '',
      '   ',
      'hmm',
      'drop',
      'drop the second one please',
      'drop 0',
      'drop 9',
      'change',
      'change 4: something',
      'change 1',
      'add:',
      'sendd',
      'no',
      '???',
      'delete everything and start over',
    ])('returns unknown for %p', (reply) => {
      const result = applyParentEdits(draft(), reply);
      expect(result.action).toBe('unknown');
      expect(result.editsApplied).toBe(0);
      expect(result.draft.edits).toHaveLength(3);
      // Always says something — a silent no-op would leave her waiting.
      expect(typeof result.message).toBe('string');
      expect(result.message.length).toBeGreaterThan(0);
    });

    it('tells her the real count when the number is out of range', () => {
      expect(applyParentEdits(draft(), 'drop 9').message).toMatch(/only 3 points/);
    });

    it('survives a null or shapeless draft without throwing', () => {
      expect(applyParentEdits(null, 'send').action).toBe('confirm');
      expect(applyParentEdits({}, 'drop 1').action).toBe('unknown');
      expect(applyParentEdits(undefined, 'nonsense').action).toBe('unknown');
    });

    it('handles a non-string reply', () => {
      expect(applyParentEdits(draft(), undefined).action).toBe('unknown');
      expect(applyParentEdits(draft(), 42).action).toBe('unknown');
    });
  });

  describe('parseAge', () => {
    it.each([['9', 9], ['he is 11', 11], ['age 13 now', 13], ['8 years old', 8]])(
      'reads %p as %p',
      (input, expected) => {
        expect(parseAge(input)).toBe(expected);
      }
    );

    it.each(['', 'not sure', 'she is little', '2', '40', 'nine'])('returns null for %p', (input) => {
      expect(parseAge(input)).toBeNull();
    });
  });
});
