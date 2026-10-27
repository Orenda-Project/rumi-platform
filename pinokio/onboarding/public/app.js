/**
 * app -- the step machine behind the wizard.
 *
 * Steps render lazily when you arrive at them, because each one asks the server a
 * real question (what is in .env, what state is the database in, is WhatsApp
 * linked) and the answers change as you work. Re-entering a step re-asks.
 *
 * @module app
 */

import { get } from './api.js';
import { el, clear } from './dom.js';

import * as credentials from './steps/credentials.js';
import * as database from './steps/database.js';
import * as whatsapp from './steps/whatsapp.js';
import * as done from './steps/done.js';

const ORDER = ['welcome', 'credentials', 'database', 'whatsapp', 'done'];

/** Cleanup to run when a step is left, for the steps that hold something open. */
const LEAVING = {
  whatsapp: () => whatsapp.stop(),
  database: () => database.stop(),
};

/** Which steps own a region of the page, and what to call to fill it. */
const RENDERERS = {
  credentials: { host: 'credential-groups', render: credentials.render },
  database: { host: 'database-body', render: database.render },
  whatsapp: { host: 'whatsapp-body', render: whatsapp.render },
  done: { host: 'done-body', render: done.render },
};

const completed = new Set();
let capabilities = {};
let current = null;

const context = {
  get capabilities() { return capabilities; },
  markDone: (step) => { completed.add(step); paintRail(); },
  refreshProgress: paintRail,
};

function panels() {
  return document.querySelectorAll('[data-panel]');
}

async function show(step) {
  if (!ORDER.includes(step)) return;

  // Leaving a step stops whatever it was watching: pairing holds a session lock
  // in a child process, and the schema run streams progress we no longer need.
  if (current && current !== step) LEAVING[current]?.();

  current = step;
  for (const panel of panels()) {
    panel.hidden = panel.dataset.panel !== step;
  }
  paintRail();
  document.getElementById('content').focus({ preventScroll: true });
  window.scrollTo({ top: 0, behavior: 'smooth' });

  const renderer = RENDERERS[step];
  if (!renderer) return;

  try {
    await renderer.render(document.getElementById(renderer.host), context);
  } catch (error) {
    const host = document.getElementById(renderer.host);
    clear(host);
    host.append(el('div', { class: 'notice notice--bad' }, [
      el('b', { text: 'Something went wrong on this step.' }),
      el('p', { text: error.message }),
    ]));
  }
}

function paintRail() {
  const counts = credentials.counts();
  if (counts && counts.requiredSet >= counts.requiredTotal) completed.add('credentials');

  for (const node of document.querySelectorAll('.step')) {
    const step = node.dataset.step;
    node.dataset.state = stateFor(step);
  }
}

function stateFor(step) {
  if (step === current) return 'active';
  if (completed.has(step)) return 'done';
  if (blocked(step)) return 'blocked';
  return 'todo';
}

/** A step whose module did not load cannot be completed here, and says so. */
function blocked(step) {
  if (step === 'credentials') return capabilities.credentials === false;
  if (step === 'database') return capabilities.database === false;
  if (step === 'whatsapp') return capabilities.whatsapp === false;
  return false;
}

function wireNavigation() {
  for (const button of document.querySelectorAll('[data-go]')) {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      show(button.dataset.go);
    });
  }

  for (const node of document.querySelectorAll('.step')) {
    node.addEventListener('click', () => show(node.dataset.step));
    node.style.cursor = 'pointer';
  }
}

/** Anything the bridge could not load is said once, plainly, on the first screen. */
function reportProblems(problems) {
  if (!problems || !problems.length) return;
  const notice = document.getElementById('welcome-problems');
  const list = document.getElementById('welcome-problems-list');
  for (const problem of problems) list.append(el('li', { text: problem }));
  notice.hidden = false;
}

async function main() {
  wireNavigation();
  try {
    const state = await get('/api/state');
    capabilities = state.capabilities || {};
    reportProblems(state.problems);
  } catch (error) {
    reportProblems([`The setup server is not answering: ${error.message}`]);
  }
  show('welcome');
}

main();
