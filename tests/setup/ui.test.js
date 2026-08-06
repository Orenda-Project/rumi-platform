/**
 * ui.js — the CLI's presentation layer.
 *
 * Two things here are load-bearing rather than cosmetic. Colour must switch
 * itself off when nothing human is reading, or every captured log and every
 * assertion in this repo fills with escape codes. And box widths must be
 * computed from *printed* width, not string length, or any line containing
 * colour or an emoji pushes the border out and the whole frame goes ragged.
 */

const ui = require('../../bot/scripts/setup/ui');

afterEach(() => {
  ui.setColorEnabled(null);
  delete process.env.NO_COLOR;
});

describe('colour', () => {
  it('is off when output is not a terminal — logs and tests stay plain', () => {
    // Jest captures stdout, so isTTY is false here: exactly the case this
    // guarantee exists for.
    expect(ui.ok('done')).toBe('✔ done');
    expect(ui.paint('brand', 'hi')).toBe('hi');
  });

  it('is off when NO_COLOR is set, even on a terminal', () => {
    process.env.NO_COLOR = '1';
    expect(ui.colorEnabled()).toBe(false);
  });

  it('wraps text in escape codes once enabled', () => {
    ui.setColorEnabled(true);
    const painted = ui.paint('brand', 'hi');
    expect(painted).toMatch(/^\[/);
    expect(painted).toMatch(/\[0m$/);
    expect(ui.stripAnsi(painted)).toBe('hi');
  });
});

describe('visibleWidth', () => {
  it('ignores escape codes', () => {
    ui.setColorEnabled(true);
    expect(ui.visibleWidth(ui.paint('brand', 'hello'))).toBe(5);
  });

  it('counts emoji as the two cells they occupy', () => {
    expect(ui.visibleWidth('✅')).toBe(2);
    expect(ui.visibleWidth('📱ok')).toBe(4);
  });

  it('counts a variation selector as nothing', () => {
    // "⚠️" is a base character plus U+FE0F; treating the selector as a cell
    // would over-pad every line containing one.
    expect(ui.visibleWidth('⚠️')).toBe(1);
  });

  it('counts the box-drawing and block characters the logo uses as single cells', () => {
    expect(ui.visibleWidth('╭─╮')).toBe(3);
    expect(ui.visibleWidth('██████╗')).toBe(7);
  });
});

describe('wrap', () => {
  it('never exceeds the requested width', () => {
    const text = 'Rumi remembers every teacher, lesson plan and reading score in a database that belongs to you.';
    for (const line of ui.wrap(text, 40)) expect(ui.visibleWidth(line)).toBeLessThanOrEqual(40);
  });

  it('leaves a long URL intact rather than splitting it', () => {
    // A split URL cannot be clicked or copied, which defeats the point of
    // printing it.
    const url = 'https://supabase.com/dashboard/project/abcdefghijklmnop/sql/new';
    expect(ui.wrap(`Open ${url} now`, 30)).toContain(url);
  });

  it('keeps explicit line breaks', () => {
    expect(ui.wrap('one\ntwo', 40)).toEqual(['one', 'two']);
  });
});

describe('box', () => {
  it('draws every line to the same printed width, colour or not', () => {
    ui.setColorEnabled(true);
    const lines = ui.box(['short', ui.paint('accent', 'a coloured line that is longer')], { title: 'copy this' })
      .split('\n');
    const widths = new Set(lines.map((l) => ui.visibleWidth(l)));
    expect(widths.size).toBe(1);
  });

  it('grows to fit its title, so a long title never overruns the frame', () => {
    const lines = ui.box(['x'], { title: 'a title longer than the content' }).split('\n');
    const widths = new Set(lines.map((l) => ui.visibleWidth(l)));
    expect(widths.size).toBe(1);
  });

  it('fits inside the terminal for content that fits', () => {
    const lines = ui.box(['create or replace function exec_sql(query text)']).split('\n');
    for (const line of lines) expect(ui.visibleWidth(line)).toBeLessThanOrEqual(ui.measure());
  });

  it('keeps the frame consistent even around a line too wide for the window', () => {
    // Content is never clipped — a box here holds SQL meant to be copied, and a
    // truncated line that looks complete is worse than one the terminal wraps.
    const lines = ui.box(['y'.repeat(200)]).split('\n');
    expect(new Set(lines.map((l) => ui.visibleWidth(l))).size).toBe(1);
  });
});

describe('logo', () => {
  it('prints the wordmark at a normal width', () => {
    expect(ui.logo()).toContain('██████╗');
  });

  it('degrades to plain text on a terminal too narrow for block letters', () => {
    const original = process.stdout.columns;
    Object.defineProperty(process.stdout, 'columns', { value: 24, configurable: true });
    try {
      const rendered = ui.logo();
      expect(rendered).not.toContain('██');
      expect(rendered).toContain('RUMI');
    } finally {
      Object.defineProperty(process.stdout, 'columns', { value: original, configurable: true });
    }
  });
});

describe('step', () => {
  it('says where you are, and fills the bar as you go', () => {
    expect(ui.step(1, 5, 'Where Rumi keeps its memory')).toContain('step 1 of 5');
    const first = ui.step(1, 5, 'a');
    const last = ui.step(5, 5, 'b');
    const filled = (text) => (text.match(/━/g) || []).length;
    expect(filled(last)).toBeGreaterThan(filled(first));
  });
});

describe('steps', () => {
  it('colours a URL but not the punctuation after it', () => {
    ui.setColorEnabled(true);
    const rendered = ui.steps(['Sign up at https://upstash.com, then copy the URL']);
    // The comma ends the sentence, not the address — colouring it in suggests
    // otherwise to anyone about to retype the link.
    expect(rendered).toContain(`${ui.link('https://upstash.com')},`);
  });

  it('numbers each item and hangs its wrapped continuation under the text', () => {
    ui.setColorEnabled(false);
    const long = 'Give the project any name, choose the region closest to your teachers, and let it start up.';
    const lines = ui.steps([long]).split('\n');

    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/^ {2}1\. /);
    // Indented past the "1. " so the number stays the only thing in that column.
    expect(lines[1]).toMatch(/^ {5}\S/);
  });
});

describe('table', () => {
  it('aligns values into one column regardless of label length', () => {
    const rendered = ui.table([['a', 'x'], ['a much longer label', 'y']]).split('\n');
    expect(rendered[0].indexOf('x')).toBe(rendered[1].indexOf('y'));
  });
});

describe('spinner', () => {
  it('prints exactly one result line and stops cleanly without a terminal', () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const spin = ui.spinner('Checking…');
    spin.succeed('Connected');
    const printed = logSpy.mock.calls.map((c) => c.join(' '));
    logSpy.mockRestore();

    expect(printed).toContain('✔ Connected');
    expect(printed.filter((l) => l.includes('Connected'))).toHaveLength(1);
  });
});
