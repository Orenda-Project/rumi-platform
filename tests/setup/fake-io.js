/**
 * A stand-in for prompt.js's `createIo()`, so wizard steps can be tested as
 * behaviour instead of as scripted keystrokes.
 *
 * Answers are queued per method, which matters: a step's questions are not
 * interchangeable, and a single flat queue made every test break whenever a
 * step gained a confirmation. Each method also records what it was asked, so a
 * test can assert on the *wording* — that is where the "never ask for
 * SUPABASE_URL by name" guarantee actually lives.
 *
 * Not a `*.test.js` file, so Jest treats it as a helper rather than a suite.
 */

/**
 * @param {{ask?: string[], confirm?: boolean[], select?: string[]}} answers
 *   `ask` entries of `undefined`/'' mean "the user pressed Enter", which the
 *   real io resolves to the field's fallback — mirrored here.
 */
function fakeIo(answers = {}) {
  const queues = {
    ask: [...(answers.ask || [])],
    confirm: [...(answers.confirm || [])],
    select: [...(answers.select || [])],
  };
  const asked = { ask: [], confirm: [], select: [], pressEnter: 0 };
  const validationFailures = [];

  return {
    asked,
    validationFailures,

    async ask(label, opts = {}) {
      asked.ask.push({ label, ...opts });
      const raw = queues.ask.length ? queues.ask.shift() : '';
      const answer = (raw === undefined || raw === '') ? (opts.fallback || '') : raw;
      if (opts.validate) {
        const verdict = opts.validate(answer);
        if (!verdict.ok) {
          // The real io re-asks; a test that queued a bad value wants to see
          // that it was rejected, not spin forever.
          validationFailures.push({ label, answer, reason: verdict.reason });
          return answer;
        }
        return verdict.value === undefined ? answer : verdict.value;
      }
      return answer;
    },

    async confirm(question, defaultYes = true) {
      asked.confirm.push(question);
      return queues.confirm.length ? queues.confirm.shift() : defaultYes;
    },

    async select(question, options, defaultValue) {
      asked.select.push({ question, options, defaultValue });
      return queues.select.length ? queues.select.shift() : defaultValue;
    },

    async pressEnter() {
      asked.pressEnter += 1;
    },
  };
}

/** Everything the io printed, as one string — for asserting on wording. */
function captureLog() {
  const lines = [];
  const spy = jest.spyOn(console, 'log').mockImplementation((...args) => {
    lines.push(args.join(' '));
  });
  return {
    get text() { return lines.join('\n'); },
    restore: () => spy.mockRestore(),
  };
}

module.exports = { fakeIo, captureLog };
