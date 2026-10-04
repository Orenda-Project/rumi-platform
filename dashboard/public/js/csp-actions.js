/**
 * Event binding for the admin views without inline handlers.
 *
 * The admin CSP (dashboard/lib/admin-csp.js) blocks inline event handler
 * attributes (on-click and the like).
 * A view marks the element instead and names a global function from its own
 * nonce'd script:
 *
 *   <button data-on-click="deleteUser" data-args='["42","sample-user"]'>
 *
 * On a click the function runs with `this` = the element and the arguments from
 * data-args (a JSON array). Three argument placeholders: "$event" (the event),
 * "$el" (the element), "$value" (the element's value). Built-in actions that
 * need no function: "$reload", "$print", "$stop" (stop the event here), "$hide"
 * (hide the element). Supported events: see EVENTS.
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
    if (Object.prototype.hasOwnProperty.call(BUILT_IN, name)) {
      BUILT_IN[name].call(el, event);
      return;
    }
    var fn = window[name];
    if (typeof fn !== 'function') {
      console.error('csp-actions: no global function "' + name + '" for data-on-' + type);
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

  EVENTS.forEach(function (type) { document.addEventListener(type, dispatch); });
  CAPTURED.forEach(function (type) {
    document.addEventListener(type, function (event) {
      var el = event.target;
      if (el && el.nodeType === 1 && el.hasAttribute('data-on-' + type)) run(el, type, event);
    }, true);
  });
}());
