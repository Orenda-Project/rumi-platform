/**
 * ui.js — the presentation layer for the `rumi` CLI.
 *
 * Every user-facing line printed by `rumi setup`, `rumi graduate`, `rumi pair`
 * and `rumi status` goes through here, so the whole CLI looks like one product
 * instead of four scripts. Nothing in this file knows anything about Rumi's
 * domain — it is purely "how do we say things in a terminal".
 *
 * Two rules the rest of the CLI relies on:
 *
 *   1. **Colour is off unless a human is watching.** Piped output, CI logs and
 *      Jest's captured console all get plain text, so tests can assert on the
 *      words without stripping escape codes, and a redirected log stays
 *      readable.
 *   2. **Nothing is wider than the terminal.** Paragraphs wrap and boxes size
 *      themselves to the narrower of the terminal and a comfortable reading
 *      measure, because a wrapped box border is worse than no box.
 *
 * @module ui
 */

// ── Colour ───────────────────────────────────────────────────────────────────

/**
 * Semantic roles, not colour names — call sites say what a line *is*
 * (`accent` = "your turn to act") so the palette can change in one place.
 * Each role carries a truecolor triple and a 16-colour fallback for terminals
 * that don't advertise 24-bit support.
 */
const PALETTE = {
  brandHi: { rgb: [125, 232, 205], basic: 96 },
  brand: { rgb: [37, 211, 102], basic: 32 },
  brandLo: { rgb: [21, 128, 61], basic: 32 },
  accent: { rgb: [245, 176, 66], basic: 33 },
  danger: { rgb: [239, 83, 80], basic: 31 },
  muted: { rgb: [140, 152, 168], basic: 90 },
  link: { rgb: [125, 211, 252], basic: 36 },
};

let colorOverride = null;

/** Test hook: force colour on/off, or `null` to go back to auto-detection. */
function setColorEnabled(value) {
  colorOverride = value;
}

function colorEnabled() {
  if (colorOverride !== null) return colorOverride;
  if (process.env.NO_COLOR) return false;
  if (process.env.FORCE_COLOR) return process.env.FORCE_COLOR !== '0';
  return Boolean(process.stdout.isTTY);
}

function trueColorEnabled() {
  const colorterm = (process.env.COLORTERM || '').toLowerCase();
  return colorterm.includes('truecolor') || colorterm.includes('24bit');
}

/**
 * @param {keyof PALETTE|null} role
 * @param {string} text
 * @param {{bold?: boolean, dim?: boolean}} [opts]
 */
function paint(role, text, opts = {}) {
  if (!colorEnabled()) return text;
  const codes = [];
  if (opts.bold) codes.push('1');
  if (opts.dim) codes.push('2');
  const entry = role ? PALETTE[role] : null;
  if (entry) {
    codes.push(trueColorEnabled() ? `38;2;${entry.rgb.join(';')}` : String(entry.basic));
  }
  if (!codes.length) return text;
  return `\u001b[${codes.join(';')}m${text}\u001b[0m`;
}

const bold = (t) => paint(null, t, { bold: true });
const dim = (t) => paint('muted', t);
const link = (t) => paint('link', t);

// ── Measuring ────────────────────────────────────────────────────────────────

const ANSI_PATTERN = /\u001b\[[0-9;]*m/g;

const stripAnsi = (text) => String(text).replace(ANSI_PATTERN, '');

/**
 * Printed width of a string in terminal cells: escape codes are free, CJK and
 * emoji take two cells, and combining marks take none. Box borders are drawn
 * from this, so getting it wrong shows up immediately as a ragged edge.
 *
 * @param {string} text
 * @returns {number}
 */
function visibleWidth(text) {
  let width = 0;
  for (const char of stripAnsi(text)) {
    const cp = char.codePointAt(0);
    // Zero-width: variation selectors, ZWJ, skin-tone modifiers, combining marks.
    if (cp === 0xfe0f || cp === 0xfe0e || cp === 0x200d
      || (cp >= 0x1f3fb && cp <= 0x1f3ff) || (cp >= 0x0300 && cp <= 0x036f)) continue;
    const isWide = (cp >= 0x1100 && cp <= 0x115f)
      || (cp >= 0x2e80 && cp <= 0xa4cf)
      || (cp >= 0xac00 && cp <= 0xd7a3)
      || (cp >= 0xf900 && cp <= 0xfaff)
      || (cp >= 0xfe30 && cp <= 0xfe6f)
      || (cp >= 0xff00 && cp <= 0xff60)
      || (cp >= 0x1f300 && cp <= 0x1f64f)
      || (cp >= 0x1f680 && cp <= 0x1f6ff)
      || (cp >= 0x1f900 && cp <= 0x1f9ff)
      || cp === 0x2705 || cp === 0x274c || cp === 0x2728;
    width += isWide ? 2 : 1;
  }
  return width;
}

/** Comfortable reading measure, never wider than the window. */
const MAX_MEASURE = 74;
function measure() {
  const columns = process.stdout.columns || 80;
  return Math.max(40, Math.min(MAX_MEASURE, columns - 2));
}

/**
 * Word-wrap to `width` cells, preserving explicit newlines as paragraph breaks.
 * Words longer than the width (a pasted URL) are left intact rather than
 * broken — a split URL can't be clicked or copied.
 *
 * @param {string} text
 * @param {number} [width]
 * @returns {string[]}
 */
function wrap(text, width = measure()) {
  const out = [];
  for (const paragraph of String(text).split('\n')) {
    let line = '';
    for (const word of paragraph.split(/ +/)) {
      if (!line) { line = word; continue; }
      if (visibleWidth(`${line} ${word}`) <= width) line += ` ${word}`;
      else { out.push(line); line = word; }
    }
    out.push(line);
  }
  return out;
}

// ── Blocks ───────────────────────────────────────────────────────────────────

const LOGO_LINES = [
  ['██████╗ ██╗   ██╗███╗   ███╗██╗', 'brandHi'],
  ['██╔══██╗██║   ██║████╗ ████║██║', 'brandHi'],
  ['██████╔╝██║   ██║██╔████╔██║██║', 'brand'],
  ['██╔══██╗██║   ██║██║╚██╔╝██║██║', 'brand'],
  ['██║  ██║╚██████╔╝██║ ╚═╝ ██║██║', 'brandLo'],
  ['╚═╝  ╚═╝ ╚═════╝ ╚═╝     ╚═╝╚═╝', 'brandLo'],
];

/**
 * The wordmark, plus an optional tagline underneath. Falls back to a plain
 * one-liner on a narrow terminal (phones over SSH, split panes) where the
 * block letters would wrap into noise.
 *
 * @param {string} [tagline]
 * @returns {string}
 */
function logo(tagline = '') {
  const columns = process.stdout.columns || 80;
  const lines = columns < 34
    ? [paint('brand', 'RUMI', { bold: true })]
    : LOGO_LINES.map(([text, role]) => paint(role, text));
  if (tagline) lines.push('', dim(tagline));
  return `\n${lines.join('\n')}\n`;
}

const BOX = { tl: '╭', tr: '╮', bl: '╰', br: '╯', h: '─', v: '│' };

/**
 * A rounded box around already-wrapped lines.
 *
 * Deliberately does no wrapping of its own: the caller decides what a line is,
 * because the two things that go in boxes — SQL to copy and short checklists —
 * both break badly under automatic wrapping.
 *
 * @param {string[]} lines
 * @param {{title?: string, role?: keyof PALETTE}} [opts]
 * @returns {string}
 */
function box(lines, opts = {}) {
  const role = opts.role || 'muted';
  // The frame matches the widest line rather than being clipped to the window:
  // the only things boxed here are meant to be copied (SQL, a checklist), and a
  // truncated line that looks complete is worse than one the terminal wraps.
  // Callers keep lines inside `measure() - 4`; this stays self-consistent if
  // one does not.
  const width = Math.max(
    visibleWidth(opts.title || '') + 2,
    ...lines.map((l) => visibleWidth(l)),
  );
  const edge = (left, right, label = '') => {
    const labelPart = label ? ` ${label} ` : '';
    const fill = BOX.h.repeat(Math.max(0, width + 2 - visibleWidth(labelPart)));
    return paint(role, `${left}${labelPart}${fill}${right}`);
  };
  const body = lines.map((line) => {
    const pad = ' '.repeat(Math.max(0, width - visibleWidth(line)));
    return `${paint(role, BOX.v)} ${line}${pad} ${paint(role, BOX.v)}`;
  });
  return [edge(BOX.tl, BOX.tr, opts.title), ...body, edge(BOX.bl, BOX.br)].join('\n');
}

/**
 * A numbered step header with a progress bar — the answer to "how much
 * further?", which is the question an unattended wizard most often leaves
 * unanswered.
 *
 * @param {number} index  1-based
 * @param {number} total
 * @param {string} title
 * @returns {string}
 */
function progressBar(index, total) {
  // Filled proportional to the step being *entered*, so the very first header
  // shows movement rather than an apparently broken empty bar.
  const filled = Math.round((index / total) * 12);
  const bar = `${'━'.repeat(filled)}${'┄'.repeat(12 - filled)}`;
  return `${paint('brand', bar)}  ${dim(`step ${index} of ${total}`)}`;
}

function step(index, total, title) {
  return ['', progressBar(index, total), bold(title)].join('\n');
}

/**
 * Starts a step at the top of the screen.
 *
 * Without this, every prompt lands on the last line of the terminal with its
 * explanation scrolled above it — the thing you have to read and the thing you
 * have to type end up at opposite ends of the window, and by step five you are
 * typing into the bottom edge. Clearing per step keeps each question in the top
 * third, where it can be read and answered in one place.
 *
 * The scrollback buffer is cleared too (\u001b[3J): leaving it means the wizard
 * appears to have "jumped" when the user scrolls up mid-step. Progress is not
 * lost from view — the caller reprints a tick for each completed step.
 */
function clearScreen() {
  if (!process.stdout.isTTY) return;
  process.stdout.write('\u001b[2J\u001b[3J\u001b[H');
}

/** A full-width rule — closes a section without shouting. */
const rule = () => dim('─'.repeat(measure()));

// ── Lines ────────────────────────────────────────────────────────────────────

const ok = (text) => `${paint('brand', '✔')} ${text}`;
const fail = (text) => `${paint('danger', '✘')} ${text}`;
const warn = (text) => `${paint('accent', '!')} ${text}`;
const arrow = (text) => `${paint('accent', '›')} ${text}`;

/**
 * A bulleted line that wraps with a hanging indent, so a long point stays a
 * single visual item instead of its tail drifting back to the margin.
 *
 * @param {string} text
 * @param {{dim?: boolean}} [opts]  secondary bullets (caveats, "you can skip this")
 */
function bullet(text, opts = {}) {
  const style = opts.dim ? dim : (t) => t;
  const [first, ...rest] = wrap(text, measure() - 4);
  return [`  ${dim('•')} ${style(first)}`, ...rest.map((l) => `    ${style(l)}`)].join('\n');
}

/** An indented explanatory paragraph — the "why am I being asked this" copy. */
function say(text) {
  return wrap(text, measure() - 2).map((l) => `  ${l}`).join('\n');
}

/** Same, but visibly secondary (hints, caveats, "you can skip this"). */
function aside(text) {
  return wrap(text, measure() - 2).map((l) => `  ${dim(l)}`).join('\n');
}

/**
 * A "do this in your browser" list. Numbered, indented, with any URL coloured
 * so it stands out as the thing to click.
 *
 * @param {string[]} items
 * @returns {string}
 */
function steps(items) {
  return items.map((item, i) => {
    // Trailing punctuation is sentence, not URL — without excluding it, a link
    // followed by a comma gets the comma coloured as part of itself, which
    // reads as though the comma belongs in the address.
    const highlighted = item.replace(/https?:\/\/[^\s)]*[^\s).,;:]/g, (m) => link(m));
    const [first, ...rest] = wrap(highlighted, measure() - 6);
    return [`  ${paint('accent', `${i + 1}.`)} ${first}`, ...rest.map((l) => `     ${l}`)].join('\n');
  }).join('\n');
}

/**
 * Aligned `label   value` rows.
 *
 * The label is dim by default, because most tables here are readouts where the
 * *value* is the news ("Database  ready"). Pass a `labelRole` for the inverted
 * case — a command list, where the label is the thing you came to find.
 *
 * @param {Array<[string, string]>} rows
 * @param {{labelRole?: keyof PALETTE, indent?: number}} [opts]
 * @returns {string}
 */
function table(rows, opts = {}) {
  const pad = ' '.repeat(opts.indent === undefined ? 2 : opts.indent);
  const paintLabel = opts.labelRole ? (t) => paint(opts.labelRole, t) : dim;
  const labelWidth = Math.max(...rows.map(([label]) => visibleWidth(label)));
  return rows.map(([label, value]) => {
    const gap = ' '.repeat(labelWidth - visibleWidth(label));
    return `${pad}${paintLabel(label)}${gap}   ${value}`;
  }).join('\n');
}

// ── Progress ─────────────────────────────────────────────────────────────────

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

/**
 * An in-place "checking…" indicator that resolves to a single ✔/✘ line.
 *
 * Non-TTY output gets the label once and the result once, with no cursor
 * tricks — the same information, still readable in a log file. Always stop it
 * in a `finally`: a spinner left running holds the event loop open and the
 * command never exits.
 *
 * @param {string} label
 */
function spinner(label) {
  const live = colorEnabled() && process.stdout.isTTY;
  let timer = null;
  let frame = 0;

  if (live) {
    const render = () => {
      process.stdout.write(`\r${paint('accent', SPINNER_FRAMES[frame % SPINNER_FRAMES.length])} ${label}   `);
      frame += 1;
    };
    render();
    timer = setInterval(render, 90);
    if (typeof timer.unref === 'function') timer.unref();
  } else {
    console.log(`  ${label}`);
  }

  const finish = (line) => {
    if (timer) clearInterval(timer);
    if (live) process.stdout.write(`\r\u001b[2K`);
    console.log(line);
  };

  return {
    succeed: (text) => finish(ok(text || label)),
    fail: (text) => finish(fail(text || label)),
    warn: (text) => finish(warn(text || label)),
    stop: () => {
      if (timer) clearInterval(timer);
      if (live) process.stdout.write(`\r\u001b[2K`);
    },
  };
}

module.exports = {
  paint, bold, dim, link, setColorEnabled, colorEnabled,
  stripAnsi, visibleWidth, wrap, measure,
  logo, box, step, progressBar, rule, clearScreen,
  ok, fail, warn, arrow, bullet, say, aside, steps, table,
  spinner,
};
