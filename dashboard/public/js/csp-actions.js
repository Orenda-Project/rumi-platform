/**
 * Event binding for the admin views without inline handlers.
 *
 * The admin CSP (dashboard/lib/admin-csp.js) blocks inline event handler
 * attributes (on-click and the like).
 * A view marks the element instead and names a handler that its own nonce'd
 * script registered:
 *
 *   <button data-on-click="deleteUser" data-args='["42","sample-user"]'>
 *
 *   window.cspActions.register({ deleteUser: deleteUser });
 *   window.cspActions.register('deleteUser', deleteUser);   // same thing
 *
 * Only registered handlers run. A name nobody registered is ignored (with one
 * console warning per name), even when a global function has that name:
 * looking names up on window would let injected markup call any page global.
 * A script that may run before this file can queue registrations with
 *   (window.cspActions = window.cspActions || []).push({ name: fn });
 *
 * On a click the handler runs with `this` = the element and the arguments from
 * data-args (a JSON array). Three argument placeholders: "$event" (the event),
 * "$el" (the element), "$value" (the element's value). Built-in actions that
 * need no registration: "$reload", "$print", "$stop" (stop the event here),
 * "$hide" (hide the element). Supported events: see EVENTS.
 *
 * HTML built in a script uses cspArgs(...) for the data-args value.
 *
 * Handlers run innermost first, as attribute handlers did, and an outer one is
 * skipped once a handler calls event.stopPropagation().
 */
(function () {
  'use strict';

  var EVENTS = ['click', 'change', 'input', 'submit', 'keydown'];
  // Events that do not bubble: listen in the capture phase.
  var CAPTURED = ['error'];

  var BUILT_IN = {
    $reload: function () { window.location.reload(); },
    $print: function () { window.print(); },
    $stop: function (event) { event.stopPropagation(); },
    $hide: function () { this.style.display = 'none'; },
  };

  var has = Object.prototype.hasOwnProperty;
  // Handlers registered by the view, and names already warned about.
  var registry = Object.create(null);
  var warned = Object.create(null);

  function register(name, fn) {
    if (name && typeof name === 'object') {
      Object.keys(name).forEach(function (key) { register(key, name[key]); });
      return;
    }
    if (typeof name !== 'string' || typeof fn !== 'function') {
      throw new TypeError('csp-actions: register(name, function) or register({ name: function })');
    }
    if (has.call(BUILT_IN, name)) throw new Error('csp-actions: "' + name + '" is a built-in action');
    registry[name] = fn;
  }

  function argsFor(el, event) {
    var raw = el.getAttribute('data-args');
    var args = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(args)) args = [args];
    return args.map(function (a) {
      if (a === '$event') return event;
      if (a === '$el') return el;
      if (a === '$value') return el.value;
      return a;
    });
  }

  function run(el, type, event) {
    var name = el.getAttribute('data-on-' + type);
    if (!name) return;
    if (has.call(BUILT_IN, name)) {
      BUILT_IN[name].call(el, event);
      return;
    }
    var fn = has.call(registry, name) ? registry[name] : null;
    if (!fn) {
      if (!has.call(warned, name)) {
        warned[name] = true;
        console.warn('csp-actions: no registered handler "' + name + '" for data-on-' + type);
      }
      return;
    }
    var result = fn.apply(el, argsFor(el, event));
    // `return false` from a handler cancelled the default action, as it did inline.
    if (result === false) event.preventDefault();
  }

  function dispatch(event) {
    var type = event.type;
    var node = event.target;
    if (node && node.nodeType !== 1) node = node.parentElement;
    while (node && node !== document) {
      if (node.hasAttribute && node.hasAttribute('data-on-' + type)) {
        run(node, type, event);
        if (event.cancelBubble) break;
      }
      node = node.parentElement;
    }
  }

  /**
   * For HTML built in a script: the data-args value for these arguments,
   * escaped for a double-quoted attribute.
   *   `<button data-on-click="loadChat" data-args="${cspArgs(userId)}">`
   */
  window.cspArgs = function cspArgs() {
    return JSON.stringify(Array.prototype.slice.call(arguments))
      .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
      .replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/'/g, '&#39;');
  };

  // Registrations queued before this file loaded. Only a real array counts:
  // markup with id="cspActions" also shows up as window.cspActions.
  var queued = Array.isArray(window.cspActions) ? window.cspActions : [];
  window.cspActions = {
    register: register,
    // So the queueing form keeps working after this file has loaded.
    push: function () { Array.prototype.forEach.call(arguments, function (entry) { register(entry); }); },
  };
  queued.forEach(function (entry) { register(entry); });

  EVENTS.forEach(function (type) { document.addEventListener(type, dispatch); });
  CAPTURED.forEach(function (type) {
    document.addEventListener(type, function (event) {
      var el = event.target;
      if (el && el.nodeType === 1 && el.hasAttribute('data-on-' + type)) run(el, type, event);
    }, true);
  });
}());
