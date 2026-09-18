/**
 * view — render an EJS page without touching the host app's settings.
 *
 * The console is mounted onto an Express app it does not own. Calling
 * `app.set('view engine', 'ejs')` would be a global change to that app, and
 * `res.render` would then resolve every other route's views against our
 * directory. Rendering explicitly keeps the console's presence invisible to
 * everything else on the app — which matters when the same app is serving
 * Meta's production webhook.
 *
 * @module console/view
 */

const ejs = require('ejs');
const path = require('path');

const VIEWS = path.join(__dirname, 'views');

/**
 * @param {import('express').Response} res
 * @param {string} name  view file, without the .ejs
 * @param {object} data
 */
async function render(res, name, data = {}) {
  const file = path.join(VIEWS, `${name}.ejs`);
  // `renderFile` sets `filename` for us, which is what makes EJS's own
  // include() resolve relative to the views directory.
  //
  // Rendered synchronously on purpose: in async mode EJS returns a promise from
  // include(), so every `<%- include(...) %>` would need an `await` and one
  // forgotten await renders the string "[object Promise]" into the page. No
  // view here does any I/O, so there is nothing for async mode to buy.
  const body = await ejs.renderFile(file, { ...res.locals, ...data }, { async: false });
  res.type('html').send(body);
}

/** Escape for safe interpolation into an HTML attribute or text node. */
function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

module.exports = { render, esc, VIEWS };
