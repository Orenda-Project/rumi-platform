/**
 * The live feed's privacy boundary and its memory ceiling.
 *
 * The ring is fed from `logToFile` (180 call sites across the bot) and
 * `logEvent` (22). Those call sites pass whatever they like — the console
 * override does `Object.assign(data, arg)` — so the only workable rule is an
 * allowlist, and these tests exist to prove the allowlist actually holds
 * against the shapes the bot really logs.
 */

const ring = require('../../bot/shared/observability/event-ring');

beforeEach(() => ring.reset());

describe('nothing outside the allowlist reaches a browser', () => {
  it('drops a teacher phone number however it is spelled', () => {
    ring.push({
      kind: 'log',
      message: 'Reply sent',
      correlationId: 'c1',
      data: { from: '+923001234567', phone: '+923001234567', phoneNumber: '+923001234567' },
    });
    const blob = JSON.stringify(ring.query({}));
    expect(blob).not.toContain('923001234567');
  });

  it('drops message content, transcripts and student names', () => {
    ring.push({
      kind: 'log',
      message: 'Handled',
      correlationId: 'c1',
      data: {
        text: 'my student Ayesha cannot read page 4',
        transcript: 'a recording of a child reading',
        studentName: 'Ayesha',
      },
    });
    const blob = JSON.stringify(ring.query({}));
    expect(blob).not.toMatch(/Ayesha|cannot read|recording of a child/);
  });

  it('never forwards a stack trace', () => {
    ring.push({ kind: 'log', message: 'boom', data: { err: new Error('x'), stack: 'at secretPath' } });
    expect(JSON.stringify(ring.query({}))).not.toContain('secretPath');
  });

  it('counts what it dropped, so the page can say fields are hidden rather than imply completeness', () => {
    ring.push({ kind: 'log', message: 'x', data: { from: 'a', text: 'b', model: 'gpt-4o-mini' } });
    const [entry] = ring.query({});
    expect(entry.dropped).toBe(2);
    expect(entry.fields).toEqual({ model: 'gpt-4o-mini' });
  });

  it('keeps the operational fields that make the feed worth reading', () => {
    ring.push({
      kind: 'event', event: 'stt.transcribe.completed', correlationId: 'c1',
      data: { provider: 'soniox', language: 'ur', durationMs: 412, promptTokens: 12 },
    });
    const [entry] = ring.query({});
    expect(entry.fields).toEqual({ provider: 'soniox', language: 'ur', durationMs: 412, promptTokens: 12 });
  });
});

describe('credential-shaped text is dropped rather than masked', () => {
  // A masked-but-recognisable secret still reveals its shape and length, and a
  // false negative here puts a live key on a screen.
  //
  // The Slack and Google fixtures are assembled at runtime rather than written
  // as literals: a string shaped closely enough to fool the redactor is also
  // shaped closely enough to trip GitHub's push protection, which blocks the
  // push rather than the leak it is guarding against. Joining the parts keeps
  // the redactor under test against the real shape without putting a
  // token-shaped literal in the file.
  const slackShaped = ['xoxb', '1234567890', 'abcdefghijklmno'].join('-');
  const googleShaped = 'AIza' + 'SyA0123456789abcdefghijklmnopqrstu'.slice(3);

  it.each([
    ['OpenRouter', 'failed with key sk-or-v1-0123456789abcdefghij'],
    ['Slack', `token ${slackShaped}`],
    ['a JWT / Supabase service key', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9abcdef'],
    ['Google', googleShaped],
    ['a long opaque token', 'value ' + 'a1b2c3d4'.repeat(6)],
  ])('drops a message containing %s', (_label, message) => {
    ring.push({ kind: 'log', message });
    expect(ring.query({})[0].msg).toBe('[hidden: looked like a credential]');
  });

  it('leaves ordinary messages alone', () => {
    ring.push({ kind: 'log', message: 'Lesson plan generated for grade 4 maths' });
    expect(ring.query({})[0].msg).toBe('Lesson plan generated for grade 4 maths');
  });

  it('masks a phone number that appears inside free text', () => {
    ring.push({ kind: 'log', message: 'Delivered to +923001234567 successfully' });
    const msg = ring.query({})[0].msg;
    expect(msg).not.toContain('923001234567');
    expect(msg).toContain('•••');
  });
});

describe('memory is bounded', () => {
  it('holds only its capacity however much is pushed at it', () => {
    ring.configure({ size: 200 });
    for (let i = 0; i < 5000; i += 1) ring.push({ kind: 'log', message: `m${i}` });
    expect(ring.stats().records).toBe(200);
    expect(JSON.stringify(ring.query({ limit: 500 })).length).toBeLessThan(400_000);
  });

  it('evicts the oldest traces rather than growing without limit', () => {
    ring.configure({ size: 2000 });
    for (let i = 0; i < 1000; i += 1) ring.push({ kind: 'log', message: 'x', correlationId: `c${i}` });
    expect(ring.stats().traces).toBeLessThanOrEqual(300);
  });

  it('clamps a silly configured size instead of trusting it', () => {
    ring.configure({ size: 5 });
    expect(ring.stats().capacity).toBeGreaterThanOrEqual(200);
    ring.configure({ size: 10_000_000 });
    expect(ring.stats().capacity).toBeLessThanOrEqual(20_000);
  });
});

describe('traces', () => {
  it('assembles the stages of one request in order, with offsets', () => {
    ring.push({ kind: 'event', event: 'message.received.ok', correlationId: 'r1' });
    ring.push({ kind: 'event', event: 'stt.transcribe.completed', correlationId: 'r1', data: { provider: 'soniox' } });
    ring.push({ kind: 'event', event: 'tts.synthesize.failed', level: 'error', correlationId: 'r1', data: { statusCode: 401 } });

    const trace = ring.getTrace('r1');
    expect(trace.stages).toHaveLength(3);
    expect(trace.failed).toBe(true);
    expect(trace.feature).toBe('message');
    expect(trace.stages.map((s) => s.offsetMs)).toEqual(expect.arrayContaining([0]));
  });

  it('says so when the start of a trace has scrolled out of memory', () => {
    // Rendering a truncated waterfall as though it were the whole story is
    // worse than admitting the beginning is gone.
    ring.configure({ size: 200 });
    ring.push({ kind: 'log', message: 'start', correlationId: 'long' });
    for (let i = 0; i < 400; i += 1) ring.push({ kind: 'log', message: `filler${i}` });
    ring.push({ kind: 'log', message: 'end', correlationId: 'long' });
    expect(ring.getTrace('long').partial).toBe(true);
  });

  it('returns nothing for a request it has never seen', () => {
    expect(ring.getTrace('never-happened')).toBeNull();
  });
});

describe('it never throws into the thing it is describing', () => {
  it.each([[null], [undefined], ['a string'], [42], [{ data: 'not-an-object' }], [{ data: null }]])(
    'survives push(%p)',
    (input) => {
      expect(() => ring.push(input)).not.toThrow();
    },
  );

  it('survives a circular data object', () => {
    const circular = { model: 'gpt-4o' };
    circular.self = circular;
    expect(() => ring.push({ kind: 'log', message: 'x', data: circular })).not.toThrow();
  });

  it('drops a subscriber that throws instead of breaking the logger', () => {
    ring.subscribe(() => { throw new Error('bad subscriber'); });
    expect(() => ring.push({ kind: 'log', message: 'x' })).not.toThrow();
    expect(ring.stats().subscribers).toBe(0);
  });
});
