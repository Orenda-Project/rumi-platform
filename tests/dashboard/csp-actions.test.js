/**
 * dashboard/public/js/csp-actions.js binds data-on-<event> attributes in the
 * admin views to handlers, in place of inline event handler attributes.
 *
 * It must only run handlers a view registered with window.cspActions.register.
 * Looking the name up on window lets injected markup call any page global
 * (`<img src=x data-on-error="deleteUser" data-args='["42"]'>`), so these tests
 * load the real file into jsdom and check that an unregistered name is ignored,
 * even when a window function of that name exists.
 */

const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');

const DASHBOARD = path.join(__dirname, '../../dashboard');
const SOURCE = fs.readFileSync(path.join(DASHBOARD, 'public', 'js', 'csp-actions.js'), 'utf8');

const dashboardRequire = createRequire(path.join(DASHBOARD, 'package.json'));
let JSDOM = null;
try {
  ({ JSDOM } = dashboardRequire('jsdom'));
} catch (e) {
  JSDOM = null;
}
const RUN = Boolean(JSDOM) || Boolean(process.env.CI);
const maybe = RUN ? describe : describe.skip;

/**
 * A page with `body` as markup, csp-actions.js loaded, and `before` run as a
 * script ahead of it (to test registering before the file loads).
 */
function page(body, { before = '' } = {}) {
  const dom = new JSDOM(`<!DOCTYPE html><html><body>${body}</body></html>`, {
    runScripts: 'dangerously',
  });
  const { window } = dom;
  window.__warnings = [];
  window.__errors = [];
  window.console.warn = (...a) => window.__warnings.push(a.join(' '));
  window.console.error = (...a) => window.__errors.push(a.join(' '));
  if (before) window.eval(before);
  window.eval(SOURCE);
  return window;
}

function click(window, selector) {
  const el = window.document.querySelector(selector);
  const event = new window.MouseEvent('click', { bubbles: true, cancelable: true });
  el.dispatchEvent(event);
  return event;
}

maybe('csp-actions.js: only registered handlers run', () => {
  test('a registered handler runs with this = the element and the parsed data-args', () => {
    const window = page(`<button id="b" data-on-click="saveItem" data-args='["7","sample-item","$el","$value"]' value="v1">Save</button>`);
    const calls = [];
    window.cspActions.register('saveItem', function (...args) { calls.push({ self: this, args }); });
    click(window, '#b');
    const el = window.document.getElementById('b');
    expect(calls).toHaveLength(1);
    expect(calls[0].self).toBe(el);
    expect(calls[0].args).toEqual(['7', 'sample-item', el, 'v1']);
  });

  test('register({ name: fn, ... }) registers several handlers; "$event" passes the event', () => {
    const window = page('<button id="a" data-on-click="first" data-args=\'["$event"]\'></button><button id="b" data-on-click="second"></button>');
    const seen = [];
    window.cspActions.register({
      first(event) { seen.push(['first', event.type]); },
      second() { seen.push(['second']); },
    });
    click(window, '#a');
    click(window, '#b');
    expect(seen).toEqual([['first', 'click'], ['second']]);
  });

  test('an unregistered name does not fall back to a window function, and warns once per name', () => {
    const window = page('<button id="b" data-on-click="someGlobal" data-args=\'["42"]\'>x</button>');
    window.eval('window.__called = 0; function someGlobal() { window.__called += 1; }');
    expect(typeof window.someGlobal).toBe('function');
    click(window, '#b');
    click(window, '#b');
    expect(window.__called).toBe(0);
    expect(window.__warnings).toHaveLength(1);
    expect(window.__warnings[0]).toContain('someGlobal');
  });

  test('data-on-error on injected markup naming a page global does not run it', () => {
    const window = page('<div id="out"></div>');
    window.eval('window.__deleted = []; function deleteUser(id) { window.__deleted.push(id); }');
    const out = window.document.getElementById('out');
    out.innerHTML = '<img id="x" data-on-error="deleteUser" data-args=\'["42"]\'>';
    window.document.getElementById('x').dispatchEvent(new window.Event('error'));
    expect(window.__deleted).toEqual([]);
    expect(window.__warnings).toHaveLength(1);
  });

  test('names on Object.prototype are not handlers', () => {
    const window = page('<button id="b" data-on-click="constructor">x</button><button id="c" data-on-click="toString">y</button>');
    expect(() => { click(window, '#b'); click(window, '#c'); }).not.toThrow();
    expect(window.__warnings).toHaveLength(2);
  });

  test('built-ins work without registration: $hide, $stop, $reload, $print', () => {
    const window = page(`
      <img id="img" data-on-error="$hide">
      <div id="outer" data-on-click="outerClick"><span id="stop" data-on-click="$stop">s</span></div>
      <button id="reload" data-on-click="$reload"></button>
      <button id="print" data-on-click="$print"></button>`);
    const outer = jest.fn();
    window.cspActions.register('outerClick', outer);
    window.document.getElementById('img').dispatchEvent(new window.Event('error'));
    expect(window.document.getElementById('img').style.display).toBe('none');
    click(window, '#stop');
    expect(outer).not.toHaveBeenCalled();
    window.print = jest.fn();
    click(window, '#print');
    expect(window.print).toHaveBeenCalledTimes(1);
    // jsdom cannot reload; it reports "not implemented" through the virtual console.
    expect(() => click(window, '#reload')).not.toThrow();
    expect(window.__warnings).toEqual([]);
  });

  test('a built-in name cannot be replaced by registration', () => {
    const window = page('<div id="img" data-on-click="$hide"></div>');
    const fn = jest.fn();
    expect(() => window.cspActions.register('$hide', fn)).toThrow();
    click(window, '#img');
    expect(fn).not.toHaveBeenCalled();
  });

  test('return false from a handler prevents the default action', () => {
    const window = page('<a id="a" href="#x" data-on-click="cancel"></a><a id="b" href="#y" data-on-click="allow"></a>');
    window.cspActions.register({ cancel: () => false, allow: () => undefined });
    expect(click(window, '#a').defaultPrevented).toBe(true);
    expect(click(window, '#b').defaultPrevented).toBe(false);
  });

  test('handlers run innermost first; stopPropagation skips the outer ones', () => {
    const window = page(`
      <div id="outer" data-on-click="outer"><button id="inner" data-on-click="inner"></button></div>
      <div id="outer2" data-on-click="outer"><button id="halt" data-on-click="halt"></button></div>`);
    const order = [];
    window.cspActions.register({
      outer() { order.push('outer'); },
      inner() { order.push('inner'); },
      halt(event) { order.push('halt'); event.stopPropagation(); },
    });
    window.document.querySelector('#halt').setAttribute('data-args', '["$event"]');
    click(window, '#inner');
    click(window, '#halt');
    expect(order).toEqual(['inner', 'outer', 'halt']);
  });

  test('a handler registered before csp-actions.js loads (queued) is picked up', () => {
    const window = page('<button id="b" data-on-click="early"></button><button id="c" data-on-click="late"></button>', {
      before: `window.__early = 0;
        (window.cspActions = window.cspActions || []).push({ early: function () { window.__early += 1; } });`,
    });
    window.eval('window.__late = 0; window.cspActions.push({ late: function () { window.__late += 1; } });');
    click(window, '#b');
    click(window, '#c');
    expect(window.__early).toBe(1);
    expect(window.__late).toBe(1);
  });

  test('a clobbered window.cspActions (an element with that id) is not trusted as a queue', () => {
    const window = page('<form id="cspActions"></form><button id="b" data-on-click="ok"></button>');
    expect(typeof window.cspActions.register).toBe('function');
    const fn = jest.fn();
    window.cspActions.register('ok', fn);
    click(window, '#b');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('cspArgs still escapes arguments for a double-quoted data-args attribute', () => {
    const window = page('<div id="out"></div>');
    const got = [];
    window.cspActions.register('take', (...a) => { got.push(a); });
    const html = `<button id="b" data-on-click="take" data-args="${window.cspArgs('a"b', "<c>'&")}"></button>`;
    window.document.getElementById('out').innerHTML = html;
    click(window, '#b');
    expect(got).toEqual([['a"b', "<c>'&"]]);
  });
});
