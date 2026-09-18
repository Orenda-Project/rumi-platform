/**
 * Writing feedback — the 2–3 edit cap and the no-rewrite rule.
 *
 * The cap is the whole differentiator. Cograder / Pregrade / AutoMark grade the
 * essay; this drafts a couple of specific things for a parent to say. If the
 * model returns eight points, or a "rewrite" field with the whole paragraph
 * improved, and we pass either through, the feature has quietly become one
 * more unvalidated grader.
 *
 * So the limit is enforced at the BOUNDARY (validateDraft), not just asked for
 * in the prompt — a prompt is a request, a validator is a guarantee. Both are
 * tested: the prompt must state the limit, and the validator must hold it even
 * when the model ignores it.
 */

jest.mock('../../bot/shared/config/supabase', () => ({ from: () => ({}) }));
jest.mock('../../bot/shared/services/cache/railway-redis.service', () => ({
  get: async () => null,
  setex: async () => {},
  delete: async () => {},
}));

const mockCalls = [];
let mockResponse = null;
// Overridable per test. The service destructures getClient() at require time,
// so the swap has to happen inside the factory's own closure — spying on the
// llm-client module afterwards would not reach the captured reference.
let mockCreate = null;

jest.mock('../../bot/shared/services/llm-client', () => ({
  getDefaultModel: () => 'test-model',
  getClient: () => ({
    chat: {
      completions: {
        create: async (params) => {
          mockCalls.push(params);
          if (mockCreate) return mockCreate(params);
          return { choices: [{ message: { content: JSON.stringify(mockResponse) } }] };
        },
      },
    },
  }),
}));

const service = require('../../bot/shared/services/writing-feedback.service');
const {
  draftFeedback,
  validateDraft,
  formatDraftMessage,
  deliveryScript,
  fallbackScript,
  MAX_EDITS,
  MAX_WHAT_WORDS,
  MAX_SCRIPT_WORDS,
  EDIT_KEYS,
} = service;

const edit = (n) => ({
  what: `quote ${n}`,
  why: `reason ${n}`,
  better: `better ${n}`,
});

const CHILD_TEXT = 'On Eid I woke up early. My ami give me new clothes. We go to my nana house and eat delicious sheer khurma.';

describe('Writing feedback — draft limits', () => {
  beforeEach(() => {
    mockCalls.length = 0;
    mockResponse = null;
    mockCreate = null;
  });

  it(`caps the edits at ${MAX_EDITS} even when the model returns more`, async () => {
    mockResponse = {
      praise: 'You wrote a real beginning and a real ending.',
      edits: [1, 2, 3, 4, 5, 6, 7, 8].map(edit),
    };

    const draft = await draftFeedback({ text: CHILD_TEXT, age: 9 });

    expect(draft.edits).toHaveLength(MAX_EDITS);
    expect(MAX_EDITS).toBe(3);
  });

  it('never surfaces a rewrite of the whole paragraph, whatever the model calls it', async () => {
    mockResponse = {
      praise: 'Lovely detail about the sheer khurma.',
      rewrite: 'On Eid I woke up early. My ami gave me new clothes...',
      rewritten_paragraph: 'On Eid I woke up early...',
      full_text: 'On Eid I woke up early...',
      corrected: 'the whole thing, fixed',
      edits: [
        {
          ...edit(1),
          rewrite: 'the entire paragraph rewritten',
          full_text: CHILD_TEXT,
        },
      ],
    };

    const draft = await draftFeedback({ text: CHILD_TEXT, age: 9 });

    // Top level carries nothing but praise + edits.
    expect(Object.keys(draft).sort()).toEqual(['edits', 'praise']);
    // And each edit carries nothing but the three allowed fields.
    draft.edits.forEach((e) => {
      expect(Object.keys(e).sort()).toEqual([...EDIT_KEYS].sort());
    });

    const serialized = JSON.stringify(draft);
    expect(serialized).not.toMatch(/rewrite/i);
    expect(serialized).not.toMatch(/full_text/i);
    expect(serialized).not.toContain(CHILD_TEXT);
  });

  it(`trims an over-long quote to ${MAX_WHAT_WORDS} words instead of dropping the point`, () => {
    const draft = validateDraft({
      praise: 'Good specific words.',
      edits: [{
        what: 'one two three four five six seven eight nine ten eleven',
        why: 'because',
        better: 'one two three',
      }],
    });

    expect(draft.edits[0].what.split(/\s+/)).toHaveLength(MAX_WHAT_WORDS);
  });

  it('rejects a draft with no praise line — the opening praise is not optional', () => {
    expect(() => validateDraft({ edits: [edit(1)] })).toThrow(/praise/i);
    expect(() => validateDraft({ praise: '   ', edits: [edit(1)] })).toThrow(/praise/i);
  });

  it('rejects a draft with no usable edits rather than sending an empty one', () => {
    expect(() => validateDraft({ praise: 'Nice.', edits: [] })).toThrow(/no usable edits/i);
    expect(() => validateDraft({ praise: 'Nice.', edits: [{ what: 'x' }] })).toThrow(/no usable edits/i);
    expect(() => validateDraft(null)).toThrow();
  });

  it('rejects a non-JSON model response rather than half-reading it', async () => {
    mockCreate = async () => ({ choices: [{ message: { content: 'Sure! Here are some notes:' } }] });
    await expect(draftFeedback({ text: CHILD_TEXT, age: 9 })).rejects.toThrow(/not valid JSON/i);
  });

  it('rejects an empty model response', async () => {
    mockCreate = async () => ({ choices: [{ message: { content: '' } }] });
    await expect(draftFeedback({ text: CHILD_TEXT, age: 9 })).rejects.toThrow(/empty draft/i);
  });

  it('refuses to draft with nothing to work from', async () => {
    await expect(draftFeedback({ text: '', age: 9 })).rejects.toThrow(/no text/i);
  });

  describe('the prompt itself states the limits', () => {
    it('asks for 2–3 edits and forbids a rewrite', async () => {
      mockResponse = { praise: 'Good.', edits: [edit(1), edit(2)] };
      await draftFeedback({ text: CHILD_TEXT, age: 9 });

      const systemPrompt = mockCalls[0].messages[0].content;
      expect(systemPrompt).toMatch(/between 2 and 3 edits/i);
      expect(systemPrompt).toMatch(/never rewrite the paragraph/i);
      expect(systemPrompt).toMatch(/at most 8 words/i);
      // Praise the try, name something specific — the Sparks register.
      expect(systemPrompt).toMatch(/specific/i);
      expect(systemPrompt).toMatch(/praise the try/i);
      // No grades, no scores: this is not a grader.
      expect(systemPrompt).toMatch(/no grades, no scores/i);
    });

    it('passes the child\'s age through so the "why" is pitched right', async () => {
      mockResponse = { praise: 'Good.', edits: [edit(1), edit(2)] };
      await draftFeedback({ text: CHILD_TEXT, age: 12 });

      expect(mockCalls[0].messages[1].content).toContain('12 years old');
      expect(mockCalls[0].messages[1].content).toContain(CHILD_TEXT);
    });

    it('requests JSON so the response is validatable', async () => {
      mockResponse = { praise: 'Good.', edits: [edit(1), edit(2)] };
      await draftFeedback({ text: CHILD_TEXT, age: 9 });
      expect(mockCalls[0].response_format).toEqual({ type: 'json_object' });
    });
  });

  describe('parent-facing draft message', () => {
    it('shows the praise, every point, and the reply menu — and no forward button', () => {
      const message = formatDraftMessage({
        praise: 'You used "delicious" — a strong, specific word.',
        edits: [edit(1), edit(2)],
      });

      expect(message).toContain('delicious');
      expect(message).toContain('quote 1');
      expect(message).toContain('quote 2');
      expect(message).toMatch(/\*send\*/);
      expect(message).toMatch(/\*drop 2\*/);
      expect(message).toMatch(/change 1/);
      expect(message).toMatch(/add:/);
      // She reads it before the child does — stated, not implied.
      expect(message).toMatch(/before they do/i);
    });
  });

  describe('delivery script', () => {
    it(`is capped at ${MAX_SCRIPT_WORDS} words`, async () => {
      const longScript = Array.from({ length: 400 }, (_, i) => `word${i}`).join(' ');
      mockCreate = async () => ({ choices: [{ message: { content: longScript } }] });

      const script = await deliveryScript({ praise: 'Good.', edits: [edit(1)] }, 9);
      expect(script.split(/\s+/).length).toBeLessThanOrEqual(MAX_SCRIPT_WORDS);
    });

    it('asks the model for the script in the right register', async () => {
      mockCreate = async () => ({ choices: [{ message: { content: 'A short script.' } }] });
      await deliveryScript({ praise: 'Good.', edits: [edit(1)] }, 10);

      const systemPrompt = mockCalls.slice(-1)[0].messages[0].content;
      expect(systemPrompt).toMatch(/at most 120 words/i);
      expect(systemPrompt).toMatch(/does not shut down/i);
      expect(systemPrompt).toMatch(/noticing together, not correcting/i);
      expect(mockCalls.slice(-1)[0].messages[1].content).toContain('10 years old');
    });

    it('falls back to a usable script rather than failing at the last step', async () => {
      mockCreate = async () => { throw new Error('provider down'); };

      const script = await deliveryScript({ praise: 'You wrote a real ending.', edits: [edit(1)] }, 9);
      expect(script).toContain('You wrote a real ending.');
      expect(script.split(/\s+/).length).toBeLessThanOrEqual(MAX_SCRIPT_WORDS);
    });

    it('the fallback opens on the praise and asks the child what they think', () => {
      const script = fallbackScript({ praise: 'Great detail.', edits: [edit(1)] });
      expect(script).toContain('Great detail.');
      expect(script).toMatch(/what do you think/i);
    });
  });
});
