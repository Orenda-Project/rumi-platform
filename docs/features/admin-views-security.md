# 🛡️ Writing admin views safely

> For anyone who edits the admin pages (`/observability/*`, the EJS views in `dashboard/views/`). Every value
> that can come from the public is shown as text, never as markup. Three rules on the server, two helpers in
> the browser, and guard tests that fail when a view breaks them.

## Why

The admin pages show what other people wrote: display names, chat messages, transcripts, model replies. On a
public deployment anyone can sign up and choose that text. If a view writes it into the page as HTML, a display
name like `<img src=x onerror=...>` runs in an admin's browser, with the admin's session.

The Content-Security-Policy blocks most injected scripts, but not injected markup: a fake form, a link, a
hidden image. So the views must not inject anything in the first place. Since v2.11.3 they don't, and the tests
below keep it that way.

## On the server: four rules

| You are writing | Use | Example |
|---|---|---|
| A value into the HTML (text or an attribute) | `<%= %>` | `<td><%= user.name %></td>` |
| Data into an inline `<script>` (strings, numbers, booleans, objects) | `<%- safeJson(x) %>`, no quotes around it | `const users = <%- safeJson(users) %>;` |
| JSON into an attribute | `<%= JSON.stringify(x) %>` | `<div data-users="<%= JSON.stringify(users) %>">` |
| A partial | `<%- include(...) %>` | `<%- include('partials/nav') %>` |

- `<%= %>` escapes the value. Use it for everything that is not one of the other two.
- `safeJson(x)` (`dashboard/lib/safe-json.js`, available in every view as `app.locals.safeJson`) writes JSON
  that cannot end the script. `JSON.stringify` alone is not enough: a string containing `</script>` closes the
  script block, and the rest of the string becomes markup. `safeJson` writes `<`, `>`, `&` and U+2028/U+2029 as
  `\uXXXX` escapes, and `undefined` as `null`.
- `safeJson` is for a script body only, between `<script ...>` and `</script>`. It does not escape `"`, so in
  an attribute a value like `x" onfocus=...` would end the attribute. In an attribute, `<%= JSON.stringify(x) %>`
  escapes the quotes, and `JSON.parse(el.dataset.users)` reads it back.
- Inside a script, never write `<%= %>`, not even in quotes (`const id = '<%= id %>';`). It escapes for HTML,
  not for JavaScript: a value ending in `\` continues the string. Write `const id = <%- safeJson(id) %>;`;
  numbers and booleans too.
- `<%- %>` (raw output) is only for an include, a layout's `body`, or `safeJson(...)` inside a script. A partial
  is scanned by the same test, so it has to follow the same rules.

## In the browser: escapeHtml and safeUrl

Many views build HTML in their scripts (`innerHTML = ...`, `insertAdjacentHTML`). Every value that goes into
that HTML passes through one of the two helpers in `dashboard/public/js/escape-html.js`:

```html
<script src="/js/escape-html.js"></script>
<script nonce="<%= cspNonce %>">
  row.innerHTML = `<td title="${escapeHtml(name)}">${escapeHtml(name)}</td>
                   <td><a href="${safeUrl(reportUrl)}">Report</a></td>`;
</script>
```

- `escapeHtml(value)`: the value as text, for element content and quoted attributes. `null` and `undefined`
  become an empty string.
- `safeUrl(value)`: for `href` and `src`. The URL, escaped, when it is `http(s)` or relative. An empty string for
  any other scheme (`javascript:`, `data:`, ...).

Load `escape-html.js` before the view's own script. Where you only need text, `element.textContent = value` is
simpler still and needs no helper.

## Event handlers: data-on-* and cspActions.register

The CSP blocks inline handlers (`onclick="..."`) and `javascript:` links. Mark the element instead, load
`/js/csp-actions.js`, and register the handler from the view's nonce'd script:

```html
<button data-on-click="deleteUser" data-args='["42"]'>Delete</button>

<script src="/js/csp-actions.js"></script>
<script nonce="<%= cspNonce %>">
  function deleteUser(id) { /* ... */ }
  window.cspActions.register({ deleteUser: deleteUser });
</script>
```

Only registered names run. A name nobody registered does nothing (one console warning), even when a global
function has that name. This matters because injected markup could otherwise call any function on the page.
In HTML built in a script, write the arguments with `cspArgs(...)`, not by hand. `csp-actions.js` lists the
supported events, the placeholders (`"$event"`, `"$el"`, `"$value"`) and the built-in actions (`$reload`,
`$print`, `$stop`, `$hide`) that need no registration.

## The guard tests

| Test | What it checks |
|---|---|
| `tests/dashboard/ejs-raw-output-allowlist.test.js` | Every `<%- %>` in the admin and console views is an include, `body`, `safeJson(...)` inside a script body, or a listed server-owned constant; no `<%= %>` inside a script body. A script body is the inside of a `<script>` with no `type` or a JavaScript/JSON type; a `<script>` in an HTML or EJS comment or a `type="text/template"` block is not one. |
| `tests/dashboard/admin-view-escaping/html-sinks.test.js` | In the views' inline scripts, every value interpolated into built HTML is a literal, a number or date, a call to `escapeHtml` / `safeUrl` / `cspArgs`, or a reviewed exception. A variable declared once and never assigned again is checked by what it is set to, so `const title = c.title` fails like `c.title`. Names are resolved with Babel's scope analysis, so a parameter, loop variable or destructured name that shadows an escaped one is reported, not followed to it. |
| `tests/dashboard/csp-actions-views.test.js` | Each view registers exactly the `data-on-*` handler names it uses, after `csp-actions.js` loads. |
| `tests/dashboard/admin-csp.test.js` | No script without the nonce, no inline handlers, no `javascript:` URLs, no Tailwind CDN. |

The other tests in `tests/dashboard/admin-view-escaping/` render a view in jsdom with hostile names and messages
and check that they come out as text.

Run them with:

```bash
node tests/run.js tests/dashboard
```

### Adding a reviewed exception

First try to escape the value. Add an exception only when the value cannot carry text from a user, a teacher,
a chat or a model, and write down why:

- **Raw EJS output:** add an entry to `CONSTANTS` in `ejs-raw-output-allowlist.test.js` with the file, the exact
  expression and the reason. Only a value the server owns outright qualifies (no user, database or request
  text).
- **HTML built in a script:** add `'view.ejs: expression': 'reason'` to `REVIEWED` in `html-sinks.test.js`, or a
  pattern to `REVIEWED_PATTERNS`. A bare variable name can be listed only when the scan cannot follow it to one
  value (it is reassigned, built up with `+=`, a parameter, a loop or catch variable, or destructured); otherwise escape its value where
  it is set. Good reasons: "count computed by the route", "one of three constant labels".
  "Comes from our database" is not a reason: the database holds what the public typed.

Exceptions are reviewed in the pull request like code.

## The Content-Security-Policy

`dashboard/lib/admin-csp.js` sets the policy on every rendered admin view. Details are in
[dashboard/README.md](../../dashboard/README.md#content-security-policy).

- **`script-src`:** this server, inline `<script>` blocks that carry the per-request nonce
  (`<script nonce="<%= cspNonce %>">`), and pinned files with Subresource Integrity. No `'unsafe-inline'`, no
  wildcard, no CDN origin.
- **`style-src`:** still allows `'unsafe-inline'`. The views use many `style=` attributes and `<style>` blocks,
  and Mermaid on the schema page injects styles without a nonce. Removing it is a planned follow-up. Until then,
  the escaping rules above are what stop injected markup; do not rely on the CSP for that.

## Related

- [Running Rumi in public](../running-in-public.md): the operator checklist.
- [dashboard/README.md](../../dashboard/README.md): the dashboard's stack and CSP rules.
