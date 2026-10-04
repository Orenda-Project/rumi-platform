/**
 * safeJson (dashboard/lib/safe-json.js) — data handed from a route to an
 * inline <script> in an admin view.
 *
 * JSON.stringify alone is not safe there: the HTML parser ends a <script> at
 * the first `</script`, whatever the JavaScript around it, so a display name
 * of `</script><img src=x onerror=…>` closes the script and the rest becomes
 * markup. safeJson writes < > & and U+2028/U+2029 as \uXXXX escapes, which
 * are the same string to JavaScript and invisible to the HTML parser.
 */

const vm = require('vm');

function loadSafeJson() {
  try {
    return require('../../dashboard/lib/safe-json').safeJson;
  } catch (err) {
    return () => { throw err; };
  }
}

const HOSTILE = [
  '</script><img src=x onerror=alert(1)>',
  '"><img src=x onerror=alert(1)>',
  "'><b>x</b>",
  'line\u2028break\u2029para',
  '<!-- <script> & &amp;',
];

describe('safeJson', () => {
  const safeJson = loadSafeJson();

  test.each(HOSTILE)('%j: no < > & or raw U+2028/9 in the output', (value) => {
    const out = safeJson({ name: value, list: [value] });
    expect(out).not.toMatch(/[<>&\u2028\u2029]/);
    if (value.includes('<')) expect(out).toContain('\\u003c');
  });

  test.each(HOSTILE)('%j: JSON.parse and a JavaScript literal give the original back', (value) => {
    const input = { name: value, nested: { list: [value, 1, true, null] } };
    const out = safeJson(input);
    expect(JSON.parse(out)).toEqual(input);
    expect(vm.runInNewContext(`(${out})`)).toEqual(input);
  });

  test('undefined (and anything JSON.stringify drops) becomes null', () => {
    expect(safeJson(undefined)).toBe('null');
    expect(safeJson(() => 1)).toBe('null');
    expect(safeJson(null)).toBe('null');
  });

  test('plain data is unchanged from JSON.stringify', () => {
    const data = { a: 1, b: 'two', c: [3, { d: 'four' }], e: 'élan' };
    expect(safeJson(data)).toBe(JSON.stringify(data));
  });
});
