/**
 * prompt.js — the input layer.
 *
 * Keystroke handling (raw mode, masking, arrow keys) needs a real terminal and
 * is verified by running the CLI; what is tested here is everything a terminal
 * cannot tell you: that a validator gets a chance to reject before an answer is
 * accepted, that pressing Enter means "keep what is there", and that an
 * existing secret is previewed without being disclosed.
 *
 * `readline` is mocked so the non-TTY paths can be driven from a queue instead
 * of hanging on stdin.
 */

let mockQueued = [];

jest.mock('readline', () => ({
  createInterface: () => ({
    question: (_prompt, callback) => callback(mockQueued.length ? mockQueued.shift() : ''),
    close: () => {},
    once: () => {},
  }),
}));

const { createIo, previewOf, readChoice, PromptAbortError } = require('../../bot/scripts/setup/prompt');

beforeEach(() => { mockQueued = []; jest.spyOn(console, 'log').mockImplementation(() => {}); });
afterEach(() => { jest.restoreAllMocks(); });

describe('previewOf', () => {
  it('shows a plain value as it is', () => {
    expect(previewOf('https://x.supabase.co', false)).toBe('https://x.supabase.co');
  });

  it('shows enough of a secret to recognise it, and not enough to reuse it', () => {
    // The point is answering "is the key already there, and is it the right
    // one" during a screen-share without disclosing the key.
    const preview = previewOf('sk-or-v1-0123456789abcdefghij', true);
    expect(preview).toBe('sk-o…ghij');
    expect(preview).not.toContain('0123456789');
  });

  it('fully masks a short secret, where ends would give away most of it', () => {
    expect(previewOf('abcdefgh', true)).toBe('••••••••');
  });

  it('shows nothing when there is nothing stored', () => {
    expect(previewOf('', true)).toBe('');
  });
});

describe('ask', () => {
  it('keeps the existing value when the user just presses Enter', async () => {
    mockQueued = [''];
    const io = createIo();
    expect(await io.ask('Project URL', { fallback: 'https://old.supabase.co' })).toBe('https://old.supabase.co');
  });

  it('re-asks until the validator is satisfied', async () => {
    mockQueued = ['not-a-url', 'https://abcdefgh.supabase.co'];
    const validators = require('../../bot/scripts/setup/validators');
    const io = createIo();

    expect(await io.ask('Project URL', { validate: validators.supabaseUrl }))
      .toBe('https://abcdefgh.supabase.co');
    expect(mockQueued).toHaveLength(0);
  });

  it('stores the validator\'s cleaned value, not the raw paste', async () => {
    // Trailing slashes and stray quotes are the user's tooling, not their
    // intent — cleaning beats asking someone to paste tidily.
    mockQueued = ['https://abcdefgh.supabase.co/'];
    const validators = require('../../bot/scripts/setup/validators');
    const io = createIo();

    expect(await io.ask('Project URL', { validate: validators.supabaseUrl }))
      .toBe('https://abcdefgh.supabase.co');
  });

  it('trims what was typed', async () => {
    mockQueued = ['  spaced-value  '];
    expect(await createIo().ask('Key')).toBe('spaced-value');
  });
});

describe('confirm', () => {
  it('takes the default on Enter, in both directions', async () => {
    const io = createIo();
    mockQueued = [''];
    expect(await io.confirm('Ready?', true)).toBe(true);
    mockQueued = [''];
    expect(await io.confirm('Ready?', false)).toBe(false);
  });

  it('reads yes and no', async () => {
    const io = createIo();
    mockQueued = ['y'];
    expect(await io.confirm('Ready?', false)).toBe(true);
    mockQueued = ['no'];
    expect(await io.confirm('Ready?', true)).toBe(false);
  });
});

describe('select without a terminal', () => {
  const OPTIONS = [
    { label: 'Just trying it out', value: 'baileys', hint: 'nothing to register' },
    { label: 'Real deployment', value: 'meta', hint: 'needs a Meta account' },
  ];

  it('falls back to a numbered list rather than refusing to ask', async () => {
    mockQueued = ['2'];
    expect(await readChoice('How are you using Rumi?', OPTIONS, 0)).toBe('meta');
  });

  it('takes the default on Enter', async () => {
    mockQueued = [''];
    expect(await readChoice('How are you using Rumi?', OPTIONS, 0)).toBe('baileys');
  });

  it('falls back to the default rather than crashing on a nonsense answer', async () => {
    mockQueued = ['9'];
    expect(await readChoice('How are you using Rumi?', OPTIONS, 0)).toBe('baileys');
  });

  it('shows each option\'s wording, so the numbered fallback is still explained', async () => {
    mockQueued = [''];
    await readChoice('How are you using Rumi?', OPTIONS, 0);
    const printed = console.log.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(printed).toContain('Just trying it out');
    expect(printed).toContain('Real deployment');
  });
});

describe('PromptAbortError', () => {
  it('is recognisable as a deliberate cancellation, not a crash', () => {
    const err = new PromptAbortError();
    expect(err.aborted).toBe(true);
    expect(err).toBeInstanceOf(Error);
  });
});
