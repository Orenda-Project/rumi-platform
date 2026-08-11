/**
 * prompt.js — the input side of the `rumi` CLI.
 *
 * Exposes one object (`createIo()`) with four question shapes: `ask`,
 * `secret`, `select`, `confirm`. Everything the wizard asks goes through it,
 * which is what makes two guarantees hold everywhere at once:
 *
 *   - **A pasted secret never lands in scrollback.** Keys are read character by
 *     character in raw mode and echoed as dots. A terminal history full of
 *     service-role keys is a real leak, and the person setting Rumi up for the
 *     first time is the least likely to notice it happened.
 *   - **Ctrl+C is an answer, not a crash.** Every reader rejects with an
 *     `aborted` error and restores the terminal (raw mode off, cursor back)
 *     before it does, so the caller can say goodbye properly instead of the
 *     shell being left in raw mode with no cursor.
 *
 * Tests pass their own object with the same four methods rather than
 * simulating keystrokes — see tests/setup/interactive-setup.test.js.
 *
 * @module prompt
 */

const readline = require('readline');
const ui = require('./ui');

const CURSOR_HIDE = '\u001b[?25l';
const CURSOR_SHOW = '\u001b[?25h';
const CLEAR_BELOW = '\u001b[0J';
const MASK_CHAR = '•';

/** Thrown by every reader when the user presses Ctrl+C. */
class PromptAbortError extends Error {
  constructor() {
    super('Cancelled by user');
    this.name = 'PromptAbortError';
    this.aborted = true;
  }
}

const isTty = () => Boolean(process.stdin.isTTY && process.stdout.isTTY);

// ── Raw-mode plumbing ────────────────────────────────────────────────────────

/**
 * Runs `handler` with stdin in raw mode, guaranteeing the terminal is handed
 * back exactly as it was found — including on a throw. Every raw reader below
 * goes through here so there is one place that can leave a shell broken, and
 * it is only a few lines long.
 *
 * @param {(emit: {resolve: Function, reject: Function}) => (chunk: string) => void} attach
 * @returns {Promise<any>}
 */
function withRawStdin(attach) {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    const wasRaw = stdin.isRaw;
    let settled = false;

    const restore = () => {
      stdin.removeListener('data', onData);
      if (stdin.setRawMode) stdin.setRawMode(wasRaw);
      stdin.pause();
    };
    const settle = (fn, value) => {
      if (settled) return;
      settled = true;
      restore();
      fn(value);
    };

    const onData = attach({
      resolve: (value) => settle(resolve, value),
      reject: (err) => settle(reject, err),
    });

    if (stdin.setRawMode) stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    stdin.on('data', onData);
  });
}

/** One line of ordinary, echoed input. */
function readLine(promptText) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: isTty(),
  });
  return new Promise((resolve, reject) => {
    rl.once('SIGINT', () => { rl.close(); reject(new PromptAbortError()); });
    rl.question(promptText, (answer) => { rl.close(); resolve(answer); });
  });
}

/**
 * One line of input echoed as dots. Falls back to plain `readLine` when there
 * is no TTY to control (piped input, CI) — masking is a courtesy to the
 * scrollback, never a reason to refuse to read.
 */
function readSecret(promptText) {
  if (!isTty()) return readLine(promptText);
  process.stdout.write(promptText);

  return withRawStdin(({ resolve, reject }) => {
    let value = '';
    const erase = (count) => process.stdout.write('\b \b'.repeat(count));

    return (chunk) => {
      for (const char of chunk) {
        if (char === '\r' || char === '\n' || char === '\u0004') {
          process.stdout.write('\n');
          resolve(value);
          return;
        }
        if (char === '\u0003') { // Ctrl+C
          process.stdout.write('\n');
          reject(new PromptAbortError());
          return;
        }
        if (char === '\u007f' || char === '\b') {
          if (value) { value = value.slice(0, -1); erase(1); }
        } else if (char === '\u0015') { // Ctrl+U — clear the line
          erase(value.length);
          value = '';
        } else if (char >= ' ') {
          value += char;
          process.stdout.write(MASK_CHAR);
        }
        // Anything else is a control byte (an escape sequence from an arrow
        // key, say) — dropped rather than pasted into a credential.
      }
    };
  });
}

// ── Selection menu ───────────────────────────────────────────────────────────

/**
 * An arrow-key menu. Options are `{ label, value, hint }`; the selected
 * option's hint is shown under the list, so the consequence of a choice is
 * visible before it's made rather than after.
 *
 * Without a TTY this degrades to a numbered list read from stdin — the same
 * question, still answerable by a script or a pipe.
 *
 * @param {string} question
 * @param {Array<{label: string, value: string, hint?: string}>} options
 * @param {number} defaultIndex
 * @returns {Promise<string>} the chosen option's `value`
 */
async function readChoice(question, options, defaultIndex) {
  console.log(`\n${ui.arrow(ui.bold(question))}`);

  if (!isTty()) {
    options.forEach((opt, i) => {
      const marker = i === defaultIndex ? ui.paint('brand', '●') : ui.dim('○');
      console.log(`  ${marker} ${i + 1}. ${opt.label}`);
    });
    const answer = (await readLine(`  ${ui.dim(`choose 1-${options.length}`)} [${defaultIndex + 1}]: `)).trim();
    if (!answer) return options[defaultIndex].value;
    const index = Number.parseInt(answer, 10) - 1;
    return options[index] ? options[index].value : options[defaultIndex].value;
  }

  let cursor = defaultIndex;
  // Lines drawn below the option list: one blank, the selected option's hint,
  // and the key legend. A redraw rewinds the cursor by exactly the number of
  // lines written, so this count and `render` must not drift apart — hence
  // `fit` below: a label that wrapped would occupy two lines, and every redraw
  // after it would start eating the line above.
  const TRAILING_LINES = 3;
  const room = ui.measure() - 6;
  const fit = (text) => (ui.visibleWidth(text) <= room ? text : `${text.slice(0, room - 1)}…`);

  const render = (first) => {
    if (!first) process.stdout.write(`\u001b[${options.length + TRAILING_LINES}A`);
    process.stdout.write(CLEAR_BELOW);
    options.forEach((opt, i) => {
      const label = fit(opt.label);
      const line = i === cursor
        ? `${ui.paint('brand', '❯')} ${ui.paint('brand', label, { bold: true })}`
        : `  ${ui.dim(label)}`;
      process.stdout.write(`  ${line}\n`);
    });
    process.stdout.write(`\n  ${ui.dim(fit(options[cursor].hint || ''))}\n`);
    process.stdout.write(`  ${ui.dim('↑↓ move · Enter to choose')}\n`);
  };

  process.stdout.write(CURSOR_HIDE);
  render(true);
  try {
    return await withRawStdin(({ resolve, reject }) => (chunk) => {
      for (let i = 0; i < chunk.length; i += 1) {
        const char = chunk[i];
        if (char === '\u0003') { reject(new PromptAbortError()); return; }
        if (char === '\r' || char === '\n') { resolve(options[cursor].value); return; }
        if (char === '\u001b' && chunk[i + 1] === '[') {
          const code = chunk[i + 2];
          if (code === 'A') cursor = (cursor - 1 + options.length) % options.length;
          if (code === 'B') cursor = (cursor + 1) % options.length;
          i += 2;
          render(false);
          continue;
        }
        if (char === 'k') { cursor = (cursor - 1 + options.length) % options.length; render(false); }
        if (char === 'j') { cursor = (cursor + 1) % options.length; render(false); }
        const digit = Number.parseInt(char, 10);
        if (Number.isInteger(digit) && options[digit - 1]) { cursor = digit - 1; render(false); }
      }
    });
  } finally {
    process.stdout.write(CURSOR_SHOW);
  }
}

// ── The io facade ────────────────────────────────────────────────────────────

/**
 * Renders the "[current value]" part of a prompt. Secrets show only their
 * first and last few characters: enough to recognise which key is already
 * there, not enough to reconstruct it from a screen-share.
 */
function previewOf(value, secret) {
  if (!value) return '';
  if (!secret) return value;
  return value.length <= 12 ? '•'.repeat(value.length) : `${value.slice(0, 4)}…${value.slice(-4)}`;
}

/**
 * @typedef {object} AskOptions
 * @property {string}   [hint]      one line of context printed above the field
 * @property {string}   [fallback]  value used when the user just presses Enter
 * @property {boolean}  [secret]    read masked, and preview the default masked
 * @property {(value: string) => ({ok: boolean, reason?: string, value?: string})} [validate]
 */

/**
 * Builds the object the wizard talks to. Holds no long-lived handle on stdin:
 * each question opens its own reader and closes it, which is what lets a
 * masked read and an ordinary line read sit next to each other without
 * fighting over the stream.
 */
function createIo() {
  return {
    /**
     * Ask for a value, re-asking until `validate` accepts it. A validator may
     * return a cleaned `value` (trimmed URL, stripped quotes) which is what
     * gets stored — the user is not asked to paste tidily.
     *
     * @param {string} label
     * @param {AskOptions} [opts]
     * @returns {Promise<string>}
     */
    async ask(label, opts = {}) {
      const { hint, fallback = '', secret = false, validate } = opts;
      if (hint) console.log(ui.aside(hint));

      for (;;) {
        const preview = previewOf(fallback, secret);
        const suffix = preview ? ui.dim(` [${preview}]`) : '';
        const promptText = `  ${ui.paint('accent', '›')} ${label}${suffix}: `;
        const raw = secret ? await readSecret(promptText) : await readLine(promptText);
        const answer = (raw || '').trim() || fallback;

        if (!validate) return answer;
        const verdict = validate(answer);
        if (verdict.ok) return verdict.value === undefined ? answer : verdict.value;
        console.log(ui.aside(ui.paint('danger', verdict.reason)));
      }
    },

    /** @returns {Promise<boolean>} */
    async confirm(question, defaultYes = true) {
      const hint = defaultYes ? 'Y/n' : 'y/N';
      const answer = (await readLine(`  ${ui.paint('accent', '›')} ${question} ${ui.dim(`[${hint}]`)} `)).trim().toLowerCase();
      if (!answer) return defaultYes;
      return answer.startsWith('y');
    },

    /**
     * @param {string} question
     * @param {Array<{label: string, value: string, hint?: string}>} options
     * @param {string} [defaultValue]
     * @returns {Promise<string>}
     */
    async select(question, options, defaultValue) {
      const defaultIndex = Math.max(0, options.findIndex((o) => o.value === defaultValue));
      return readChoice(question, options, defaultIndex);
    },

    /** Waits for Enter — used to hold the wizard while the user does something in a browser. */
    async pressEnter(text = 'Press Enter to continue') {
      await readLine(`  ${ui.dim(text)} `);
    },
  };
}

module.exports = { createIo, PromptAbortError, readLine, readSecret, readChoice, previewOf };
