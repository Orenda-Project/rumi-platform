/* Rumi operator console — the small amount of behaviour the pages need.
 *
 * The page sets `style-src 'self'`, which blocks inline STYLE ATTRIBUTES as well
 * as <style> blocks — so `el.style.color = ...` and `style="..."` are silently
 * dropped here, with nothing but a console warning to show for it. Everything
 * visual therefore goes through a class. See the "Semantic text colours" block
 * in console.css.
 *
 * No framework and no build step. Every control is bound by a data-* attribute,
 * and every mutating control degrades to something the operator can still
 * understand if this file fails to load: the page is rendered server-side, so
 * without JS you still see the whole state of the deployment, just without the
 * inline saving.
 */
(function () {
  'use strict';

  var MOUNT = meta('console-mount') || '/console';
  var TOKEN = meta('console-token') || '';

  function meta(name) {
    var el = document.querySelector('meta[name="' + name + '"]');
    return el ? el.getAttribute('content') : null;
  }

  /** Every call carries the token from the page and a header a cross-site form cannot set. */
  function api(path, options) {
    var opts = options || {};
    return fetch(MOUNT + '/api' + path, {
      method: opts.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-Console-Token': TOKEN,
        'X-Console-Request': '1'
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (data) {
        if (!r.ok) throw Object.assign(new Error(data.error || ('HTTP ' + r.status)), { data: data });
        return data;
      });
    });
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  // ── Connection checks on the Overview page ────────────────────────────────
  // Each service gets a row rather than a tile: a failure needs room to say
  // what went wrong and which setting to go and fix, and that does not fit in
  // a number. A passing check collapses back to a latency figure.
  var probeBox = document.getElementById('probes');
  if (probeBox) {
    JSON.parse(probeBox.getAttribute('data-probes')).forEach(function (p) {
      var row = el('div', 'row compact');
      var dot = el('span', 'dot off');
      var name = el('span', 't-strong', p.label);
      var what = el('span', 'small muted'); what.textContent = p.what;
      var right = el('span', 'right flex');
      var result = el('span', 'small muted', 'checking…');
      var retry = el('button', 'btn sm hidden', 'Check again');
      right.appendChild(result); right.appendChild(retry);
      row.appendChild(dot); row.appendChild(name); row.appendChild(what); row.appendChild(right);
      probeBox.appendChild(row);

      var detail = el('div', 'row detail hidden');
      probeBox.appendChild(detail);

      function run() {
        var started = Date.now();
        dot.className = 'dot off';
        result.textContent = 'checking…';
        retry.classList.add('hidden');
        detail.classList.add('hidden');

        api('/probe/' + p.id, { method: 'POST' }).then(function (res) {
          var ms = Date.now() - started;
          dot.className = 'dot ' + (res.ok ? 'ok' : 'bad');
          result.textContent = res.ok ? (ms + 'ms') : 'not answering';
          result.className = 'small ' + (res.ok ? 't-ok' : 't-bad');
          retry.classList.remove('hidden');
          if (!res.ok) {
            detail.classList.remove('hidden');
            detail.innerHTML = '<div class="banner bad flush"><div class="grow">'
              + escapeHtml(res.detail || 'No answer.')
              + (p.keys.length ? '<div class="small gap-xs">Check '
                  + p.keys.map(function (k) { return '<code>' + escapeHtml(k) + '</code>'; }).join(' and ')
                  + ' in <a href="' + MOUNT + '/setup">Setup</a>.</div>' : '')
              + '</div></div>';
          }
        }).catch(function (err) {
          dot.className = 'dot bad';
          result.textContent = 'could not check';
          result.className = 'small t-bad';
          retry.classList.remove('hidden');
          detail.classList.remove('hidden');
          detail.innerHTML = '<div class="banner bad flush"><div class="grow">'
            + escapeHtml(err.message) + '</div></div>';
        });
      }
      retry.onclick = run;
      run();
    });
  }

  // ── Reveal a secret ───────────────────────────────────────────────────────
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-reveal]');
    if (!btn) return;
    var key = btn.getAttribute('data-reveal');
    var box = document.querySelector('[data-val="' + key + '"]');
    if (!box) return;

    if (box.dataset.shown === '1') {
      box.textContent = box.dataset.masked;
      box.classList.remove('revealed');
      box.dataset.shown = '0';
      btn.textContent = 'Reveal';
      return;
    }
    btn.disabled = true;
    api('/env/reveal', { method: 'POST', body: { key: key } }).then(function (res) {
      box.textContent = res.value;
      box.classList.add('revealed');
      box.dataset.shown = '1';
      btn.textContent = 'Hide';
    }).catch(function (err) {
      flash(box, err.message, true);
    }).then(function () { btn.disabled = false; });
  });

  // ── Set or replace a value ────────────────────────────────────────────────
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-edit]');
    if (!btn) return;
    var key = btn.getAttribute('data-edit');
    var line = btn.closest('.keyline');
    if (!line || line.dataset.editing === '1') return;
    line.dataset.editing = '1';

    var previous = line.innerHTML;
    line.innerHTML = '';
    var input = el('input');
    input.type = 'text';
    input.className = 'mono';
    input.placeholder = 'Paste ' + key + ' here';
    input.setAttribute('aria-label', key);
    var save = el('button', 'btn primary sm', 'Save');
    var cancel = el('button', 'btn quiet sm', 'Cancel');
    var msg = el('span', 'small');
    line.appendChild(input); line.appendChild(save); line.appendChild(cancel); line.appendChild(msg);
    input.focus();

    cancel.onclick = function () { line.innerHTML = previous; line.dataset.editing = '0'; };
    input.onkeydown = function (ev) {
      if (ev.key === 'Enter') save.click();
      if (ev.key === 'Escape') cancel.click();
    };
    save.onclick = function () {
      var updates = {};
      updates[key] = input.value;
      save.disabled = true;
      msg.className = 'small t-muted';
      msg.textContent = 'Checking…';
      api('/env', { method: 'POST', body: { updates: updates } }).then(function () {
        msg.className = 'small t-ok';
        msg.textContent = 'Saved. Restart to apply.';
        setTimeout(function () { location.reload(); }, 700);
      }).catch(function (err) {
        var reason = (err.data && err.data.errors && err.data.errors[key]) || err.message;
        msg.className = 'small t-bad';
        msg.textContent = reason;
        save.disabled = false;
      });
    };
  });

  // ── Test one connection ───────────────────────────────────────────────────
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-test]');
    if (!btn) return;
    var name = btn.getAttribute('data-test');
    var out = btn.parentNode.querySelector('[data-test-result]') || el('span', 'small');
    out.setAttribute('data-test-result', '1');
    if (!out.parentNode) btn.parentNode.appendChild(out);

    btn.disabled = true;
    out.innerHTML = '<span class="spin"></span>';
    api('/probe/' + name, { method: 'POST' }).then(function (res) {
      out.textContent = res.ok ? ('✓ ' + (res.detail || 'working')) : ('✗ ' + (res.detail || 'no answer'));
      out.className = 'small ' + (res.ok ? 't-ok' : 't-bad');
    }).catch(function (err) {
      out.textContent = '✗ ' + err.message;
      out.className = 'small t-bad';
    }).then(function () { btn.disabled = false; });
  });

  // ── Feature switches ──────────────────────────────────────────────────────
  document.addEventListener('change', function (e) {
    var input = e.target.closest('[data-feature]');
    if (!input) return;
    var id = input.getAttribute('data-feature');
    var enabled = input.checked;
    input.disabled = true;
    api('/features/' + id, { method: 'POST', body: { enabled: enabled } }).then(function () {
      location.reload();
    }).catch(function (err) {
      input.checked = !enabled;
      input.disabled = false;
      alert(err.message);
    });
  });

  // ── The live feed ─────────────────────────────────────────────────────────
  var feed = document.getElementById('feed');
  if (feed && window.EventSource) {
    var paused = false;
    var pauseBtn = document.getElementById('feed-pause');
    if (pauseBtn) {
      pauseBtn.onclick = function () {
        paused = !paused;
        pauseBtn.textContent = paused ? 'Resume' : 'Pause';
        pauseBtn.className = paused ? 'btn accent sm' : 'btn sm';
      };
    }

    var source = new EventSource(MOUNT + '/api/activity/stream');
    source.onmessage = function (ev) {
      if (paused) return;
      var entry;
      try { entry = JSON.parse(ev.data); } catch (err) { return; }
      addRow(entry);
    };

    api('/activity?limit=60').then(function (res) {
      res.records.slice().reverse().forEach(addRow);
    }).catch(function () { /* an empty feed is a fine starting state */ });

    function addRow(entry) {
      var placeholder = feed.querySelector('.empty-state');
      if (placeholder) placeholder.remove();

      var row = el('div', 'feed-row' + (entry.level === 'error' ? ' err' : ''));
      row.appendChild(el('span', 't', clockTime(entry.ts)));
      // The feature name is the useful label; "log" as a category is not, so an
      // uncategorised line leaves the column empty rather than filling it with noise.
      row.appendChild(el('span', 'f', entry.feature || ''));
      row.appendChild(el('span', 'm', entry.event || entry.msg || ''));
      var d = entry.fields && (entry.fields.durationMs || entry.fields.ms);
      row.appendChild(el('span', 'd', d ? d + 'ms' : ''));
      if (entry.correlationId) {
        row.title = 'Request ' + entry.correlationId;
        row.onclick = function () { showTrace(entry.correlationId); };
      }
      feed.insertBefore(row, feed.firstChild);
      while (feed.children.length > 300) feed.removeChild(feed.lastChild);
    }
  }

  function showTrace(correlationId) {
    var panel = document.getElementById('trace');
    if (!panel) return;
    panel.innerHTML = '<div class="panel-body"><span class="spin"></span> loading…</div>';
    api('/activity/trace/' + encodeURIComponent(correlationId)).then(function (t) {
      var rows = t.stages.map(function (s) {
        var bits = [];
        if (s.fields.provider) bits.push(s.fields.provider);
        if (s.fields.model) bits.push(s.fields.model);
        if (s.fields.language) bits.push(s.fields.language);
        if (s.fields.statusCode) bits.push('HTTP ' + s.fields.statusCode);
        return '<tr><td class="mono">+' + s.offsetMs + 'ms</td>'
          + '<td class="mono">' + escapeHtml(s.event || s.msg || '') + '</td>'
          + '<td class="mono">' + escapeHtml(bits.join(' · ')) + '</td>'
          + '<td>' + (s.level === 'error' ? '<span class="pill bad">failed</span>' : '<span class="pill ok">ok</span>') + '</td></tr>';
      }).join('');
      panel.innerHTML = '<div class="panel-head"><h3>Request ' + escapeHtml(correlationId) + '</h3>'
        + '<span class="sub">' + t.durationMs + 'ms · ' + t.stages.length + ' stages'
        + (t.partial ? ' · earlier stages have scrolled out of memory' : '') + '</span></div>'
        + '<div class="wrap-x"><table class="grid"><thead><tr><th>At</th><th>Stage</th><th>Detail</th><th>Result</th></tr></thead>'
        + '<tbody>' + rows + '</tbody></table></div>';
      panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }).catch(function (err) {
      panel.innerHTML = '<div class="panel-body muted">' + escapeHtml(err.message) + '</div>';
    });
  }

  /** 24-hour clock: "8:02:14 AM" wraps the column, "08:02:14" does not. */
  function clockTime(ts) {
    return new Date(ts).toLocaleTimeString('en-GB', { hour12: false });
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function flash(node, text, bad) {
    var old = node.textContent;
    var cls = node.className;
    node.textContent = text;
    node.className = cls + (bad ? ' t-bad' : ' t-ok');
    setTimeout(function () { node.textContent = old; node.className = cls; }, 2600);
  }
}());
