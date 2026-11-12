/**
 * whatsapp -- the QR code, as a picture.
 *
 * Rumi's own pairing draws the code with `qrcode-terminal`, which needs a real
 * terminal. The payload behind it is just a string, so here it is an image that
 * refreshes itself as WhatsApp rotates the code.
 *
 * @module steps/whatsapp
 */

import { stream, post } from '../api.js';
import { el, clear, verdict, slot } from '../dom.js';

/** Closed when the step is left, so an abandoned attempt releases the session lock. */
let source = null;

/**
 * Render into the Voice jack.
 *
 * @param {HTMLElement} host
 * @param {{capabilities: object, markDone: Function}} context
 * @param {'locked'|'off'|'on'} [jack] Voice's state from jackStates
 */
export function render(host, context, jack = 'off') {
  clear(host);
  stop();

  if (!context.capabilities.whatsapp) {
    host.append(fallback());
    return;
  }

  if (jack === 'locked') {
    host.append(el('p', {
      class: 'field__hint',
      text: context.waitingFor === 'database'
        ? 'Unlocks once your database is ready: finish it under Optional abilities below.'
        : 'Unlocks once Brain is plugged in. You will need a second phone: Rumi answers as the number you link.',
    }));
    return;
  }

  if (jack === 'on') {
    host.append(verdict('ok', 'WhatsApp is linked.'));
    return;
  }

  const start = el('button', { class: 'btn btn--act', type: 'button', text: 'Show the code' });
  const body = el('div', {});
  start.addEventListener('click', () => {
    // Hidden rather than disabled: a greyed-out call to action sitting beside a
    // live code reads as something that failed.
    start.hidden = true;
    pair(body, context);
  });

  host.append(
    el('div', { class: 'notice' }, [
      el('b', { text: 'You need a second phone.' }),
      el('p', { text: 'Rumi answers as the number you link, so it cannot reply to messages from that same number.' }),
    ]),
    el('div', { class: 'actions' }, [start]),
    body,
  );
}

function pair(body, context) {
  clear(body);
  const image = el('img', { alt: 'WhatsApp pairing code' });
  const caption = el('p', { class: 'qr__caption', text: 'Waiting for a code…' });
  const status = slot(verdict('busy', 'Starting…'));
  const frame = el('div', { class: 'qr' }, [image, caption]);

  body.append(frame, status.node);

  source = stream('/api/whatsapp/pair', {
    qr: ({ image: dataUrl }) => {
      image.src = dataUrl;
      caption.textContent = 'WhatsApp → Settings → Linked devices → Link a device';
      status.set(verdict('busy', 'Waiting for you to scan…'));
    },
    linked: ({ number }) => {
      frame.remove();
      status.set(verdict('ok', number ? `Linked as +${number}` : 'WhatsApp is linked.'));
      context.markDone('whatsapp');
      stop();
    },
    failed: ({ error }) => {
      frame.remove();
      status.set(verdict('bad', error || 'Pairing failed.'));
      stop();
      const retry = el('button', { class: 'btn btn--act', type: 'button', text: 'Try again' });
      retry.addEventListener('click', () => pair(body, context));
      body.append(retry);
    },
  });
}

/** Leaving the step must not leave a child process holding the WhatsApp lock. */
export function stop() {
  if (!source) return;
  source.close();
  source = null;
  post('/api/whatsapp/cancel', {}).catch(() => { /* the server may already be done */ });
}

function fallback() {
  return el('div', { class: 'notice notice--bad' }, [
    el('b', { text: 'Pairing is unavailable here.' }),
    el('p', { text: 'Use Re-pair WhatsApp in the Pinokio sidebar — it shows the code in the terminal.' }),
  ]);
}
