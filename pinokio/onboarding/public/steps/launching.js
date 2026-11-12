/**
 * launching -- the third screen: start Rumi, wait for it, open the console.
 *
 * The server's start script stops this wizard's server as its first step, so
 * the page outlives the server that served it. The port from the first answer
 * is therefore kept for the whole page session, and a later POST that fails
 * at network level falls back to waiting on that port.
 *
 * @module launching
 */

import { post } from '../api.js';
import { el, clear } from '../dom.js';
import { waitForHealth, consoleUrl } from './launch-wait.js';

export { waitForHealth, consoleUrl };

const STEPS = [
  { title: 'Saving your keys', note: 'Writes everything you plugged in to .env' },
  { title: 'Closing the setup wizard', note: 'Its job is done; the console stays one click away' },
  { title: 'Starting Rumi', note: "The same Start as Pinokio's sidebar button" },
  { title: 'Waiting for Rumi to answer', note: "Checks Rumi's health every two seconds" },
];

let knownPort = null;
let runId = 0;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Abandon any wait in progress (the person left the screen). */
export function cancel() {
  runId += 1;
}

/** Ask the server to start Rumi; resolves { port, manual } or { port: null, manual: true }. */
async function requestLaunch() {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const res = await post('/api/launch');
      knownPort = res.port || knownPort;
      return { port: knownPort, manual: Boolean(res.manual) };
    } catch (error) {
      const body = error.body || {};
      if (error.status === 409 && body.reason === 'already-launching') {
        if (body.port) { knownPort = body.port; return { port: knownPort, manual: false }; }
        if (knownPort) return { port: knownPort, manual: false };
        if (attempt === 0) { await sleep(2000); continue; }
        return { port: null, manual: true };
      }
      // The server is gone (it closes itself once Rumi starts) or refused.
      return { port: knownPort, manual: !knownPort };
    }
  }
  return { port: knownPort, manual: !knownPort };
}

function buildSteps() {
  const items = STEPS.map((step) => el('li', { 'data-state': 'todo' }, [
    el('span', { class: 'ws-icon' }),
    el('span', {}, [el('b', { text: step.title }), el('small', { text: step.note })]),
  ]));
  return { list: el('ol', { class: 'wake-steps' }, items), items };
}

function setState(item, state) {
  item.setAttribute('data-state', state);
}

export async function run(host, { onBack } = {}) {
  runId += 1;
  const mine = runId;
  const live = () => mine === runId;

  const eyebrow = el('p', { class: 'eyebrow', text: 'Launching' });
  const title = el('h1', { text: 'Waking Rumi up…' });
  const lede = el('p', { class: 'lede', text: 'This takes about a minute. Keep this window open.' });
  const manualNote = el('p', { class: 'notice wake-manual', text: 'Press Start in the Pinokio sidebar' });
  manualNote.hidden = true;
  const { list, items } = buildSteps();
  const actions = el('div', { class: 'wake-actions' });
  clear(host);
  host.append(eyebrow, title, lede, manualNote, list, actions);

  const back = () => el('button', {
    class: 'btn', type: 'button', text: 'Back to the jacks', onclick: () => { cancel(); if (onBack) onBack(); },
  });

  setState(items[0], 'run');
  const { port, manual } = await requestLaunch();
  if (!live()) return;

  if (manual) {
    title.textContent = 'Press Start in the Pinokio sidebar';
    lede.textContent = 'Your keys are saved. Rumi starts when you press Start.';
    manualNote.hidden = true;
  }
  if (!port) {
    // Nothing to wait on: the person has to press Start themselves.
    setState(items[0], 'todo');
    actions.append(back());
    return;
  }
  // Manual: only the saving happened. Nothing has closed or started yet.
  (manual ? items.slice(0, 1) : items.slice(0, 3)).forEach((item) => setState(item, 'done'));
  setState(items[3], 'run');

  const result = await waitForHealth({
    port, fetchFn: (...args) => fetch(...args), sleep, now: Date.now, shouldStop: () => !live(),
  });
  if (!live() || result === 'stopped') return;

  if (result === 'up') {
    setState(items[3], 'done');
    eyebrow.textContent = 'Launched';
    title.textContent = 'Rumi is awake.';
    lede.textContent = 'Message 💬 Rumi from your second phone 📱 and try Hi 👋.';
    manualNote.hidden = true;
    actions.append(el('button', {
      class: 'btn btn--act btn--big btn--pill', type: 'button', text: 'Open the console',
      onclick: () => { location.href = consoleUrl(port); },
    }));
  } else {
    setState(items[3], 'fail');
    eyebrow.textContent = 'Launching';
    title.textContent = 'Rumi is stirring, not awake.';
    lede.textContent = "Rumi started but hasn't answered in two minutes. The terminal shows what it's stuck on, and tech support can read it too.";
    actions.append(back());
  }
}
