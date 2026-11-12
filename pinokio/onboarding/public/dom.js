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
 * The service a catalogue `where` points at, as a short host ("soniox.com"),
 * or null when `where` is prose rather than a domain.
 */
export function serviceOf(where) {
  if (!where) return null;
  const host = String(where).replace(/^https?:\/\//, '').split(/[\s/]/)[0];
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(host)) return null;
  return host.replace(/^(console|portal|platform|api|app|www)\./i, '');
}

const SVG = 'http://www.w3.org/2000/svg';

/** A round (i) button. Pair it with a tip through `infoToggle`. */
export function infoButton(label) {
  const button = el('button', { class: 'info', type: 'button', title: label });
  button.setAttribute('aria-label', label);
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  for (const d of ['M12 11v6', 'M12 7.5v.01']) {
    const path = document.createElementNS(SVG, 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  button.append(svg);
  return button;
}

/** Show or hide `tip` from `button`, keeping aria-expanded honest. */
export function infoToggle(button, tip) {
  tip.hidden = true;
  button.setAttribute('aria-expanded', 'false');
  if (tip.id) button.setAttribute('aria-controls', tip.id);
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    const open = tip.hidden;
    tip.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
  });
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
