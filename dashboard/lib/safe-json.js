'use strict';
/**
 * safeJson — serialise data for an inline <script> in an admin view.
 *
 *   <script nonce="…">const users = <%- safeJson(users) %>;</script>
 *
 * JSON.stringify alone is not enough there. The HTML parser ends a <script>
 * at the first `</script`, whatever the JavaScript around it, so a display
 * name of `</script><img src=x onerror=…>` closes the script and the rest of
 * the name becomes markup on the admin page. `<!--` changes how the parser
 * reads the script too, and U+2028/U+2029 are line breaks to older JavaScript
 * engines (a syntax error inside a string literal).
 *
 * So < > & and U+2028/U+2029 are written as \uXXXX escapes: the same string
 * to JavaScript and JSON.parse, and nothing the HTML parser acts on.
 * `undefined` (and anything else JSON.stringify drops) becomes `null`, so the
 * statement is always valid JavaScript.
 *
 * Every view gets it as a local (app.locals.safeJson in dashboard/index.js);
 * tests/dashboard/ejs-raw-output-allowlist.test.js only allows `<%-` around
 * safeJson(...), an include, or a listed server-owned constant.
 */

const ESCAPES = {
  '<': '\\u003c',
  '>': '\\u003e',
  '&': '\\u0026',
  '\u2028': '\\u2028',
  '\u2029': '\\u2029',
};

function safeJson(value) {
  const json = JSON.stringify(value);
  if (json === undefined) return 'null';
  return json.replace(/[<>&\u2028\u2029]/g, (ch) => ESCAPES[ch]);
}

module.exports = { safeJson };
