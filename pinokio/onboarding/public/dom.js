/**
 * dom -- the handful of helpers the steps share.
 *
 * Building nodes rather than assigning innerHTML: every value here comes from a
 * .env file or an upstream catalogue, and one stray angle bracket in a hint
 * should not be able to write markup into the page.
 *
 * @module dom
 */

export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key.startsWith('data-') || key === 'href' || key === 'type' || key === 'placeholder') {
      node.setAttribute(key, value);
    } else node[key] = value;
  }
  for (const child of [].concat(children)) {
    if (child) node.append(child);
  }
  return node;
}

/**
 * Append children, skipping the empty ones.
 *
 * `Node.append()` accepts nodes *and strings*, so a null slips through as the
 * literal text "null" rather than being ignored -- which is exactly what a
 * conditional child like `row.hint ? el(...) : null` produces.
 */
export function mount(parent, ...children) {
  for (const child of children) {
    if (child) parent.append(child);
  }
  return parent;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

/** A status line with a tone the stylesheet understands. */
export function verdict(tone, text) {
  const node = el('div', { class: 'verdict', 'data-tone': tone });
  if (tone === 'busy') node.append(el('span', { class: 'spinner' }));
  node.append(el('span', { text }));
  return node;
}

/** Turn a bare domain or URL from the catalogue into a link; leave prose alone. */
export function whereLink(where) {
  if (!where) return null;
  const looksLikeHost = /^[a-z0-9.-]+\.[a-z]{2,}(\/\S*)?$/i.test(where);
  if (!looksLikeHost && !where.startsWith('http')) return el('span', { class: 'field__key', text: where });
  const href = where.startsWith('http') ? where : `https://${where}`;
  return el('a', { class: 'link', href, target: '_blank', rel: 'noreferrer', text: where });
}

/**
 * A replaceable position in the DOM.
 *
 * Status lines here are swapped several times in a row -- saving, then testing,
 * then the verdict -- and each swap replaces the element, so callers need a stable
 * handle rather than a reference that goes stale after the first swap.
 */
export function slot(initial) {
  let current = initial;
  return {
    get node() { return current; },
    set(next) { current.replaceWith(next); current = next; },
  };
}
