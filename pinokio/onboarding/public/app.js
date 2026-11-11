/**
 * app -- three screens: Rumi is asleep, plug in three things, launching.
 *
 * The plug-in screen holds three jacks (Memory, Brain, Voice) and the optional
 * abilities. What is ON, OFF or LOCKED is decided in one place, jacks.js; this
 * module keeps the inputs it needs (the catalogue, the database's state, whether
 * WhatsApp is linked, the last result of each connection test) and repaints
 * after anything that could change them.
 *
 * @module app
 */

import { get } from './api.js';
import { el, clear, infoToggle } from './dom.js';
import { jackStates } from './jacks.js';

import * as credentials from './steps/credentials.js';
import * as database from './steps/database.js';
import * as whatsapp from './steps/whatsapp.js';
import * as done from './steps/done.js';
import * as launching from './steps/launching.js';

const SCREENS = ['asleep', 'plug', 'launching'];
const LABEL = { on: 'ON', off: 'OFF', locked: 'LOCKED' };

let capabilities = {};
let current = null;

/** The inputs jackStates reads. `probes` is the last result per connection test. */
const inputs = { catalog: null, probes: {}, db: null, whatsapp: { linked: false } };

/** What each jack body was last rendered for, so a repaint never wipes work in progress. */
const rendered = { memory: null, voice: null };
let plugBuilt = false;
let abilities = null;

function byId(id) {
  return document.getElementById(id);
}

async function show(screen) {
  if (!SCREENS.includes(screen)) return;
  // Leaving the plug-in screen drops the pairing stream and the schema commentary.
  if (current === 'launching' && screen !== 'launching') launching.cancel();
  if (current === 'plug' && screen !== 'plug') {
    whatsapp.stop();
    database.stop();
    rendered.voice = null;
    rendered.memory = null;
  }
  current = screen;
  for (const panel of document.querySelectorAll('[data-panel]')) {
    panel.hidden = panel.dataset.panel !== screen;
  }
  byId('content').focus({ preventScroll: true });
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (screen === 'plug') await enterPlug();
  if (screen === 'launching') launching.run(byId('launching-body'), { onBack: () => show('plug') });
}

async function enterPlug() {
  try {
    await refresh();
    if (!plugBuilt) {
      credentials.renderBrain(byId('brain-body'), onChange, { capabilities });
      abilities = credentials.renderAbilities(byId('abilities-body'), onChange, { capabilities });
      plugBuilt = true;
    }
    await paint();
    await checkBrainOnEntry();
  } catch (error) {
    const host = byId('abilities-body');
    clear(host);
    host.append(el('div', { class: 'notice notice--bad' }, [
      el('b', { text: 'Something went wrong on this screen.' }),
      el('p', { text: error.message }),
    ]));
  }
}

/**
 * A key saved in an earlier session has never been tested in this one. Brain
 * is ON only when the probe passes, so test it now (pending reads as OFF).
 */
async function checkBrainOnEntry() {
  if (!capabilities.probes || inputs.probes.openrouter !== undefined) return;
  if (!credentials.brainKeySet()) return;
  inputs.probes.openrouter = 'pending';
  await paint();
  const result = await credentials.checkBrain();
  // A save made meanwhile has its own, newer answer.
  if (inputs.probes.openrouter === 'pending') inputs.probes.openrouter = result.ok ? 'pass' : 'fail';
  await paint();
}

/** Re-ask the server everything jackStates needs. Each answer is optional. */
async function refresh() {
  const [state, db, wa] = await Promise.all([
    credentials.load(),
    capabilities.database ? get('/api/db/state').catch(() => null) : null,
    get('/api/whatsapp/state').catch(() => ({ linked: false })),
  ]);
  inputs.catalog = state.catalog;
  inputs.db = db;
  // Once linked in this session it stays linked: the state route may read the
  // session file before the pairing worker has flushed it.
  inputs.whatsapp = { linked: inputs.whatsapp.linked || Boolean(wa && wa.linked) };
}

/** After any save, probe, database or pairing event: re-read, then repaint. */
async function onChange(event = {}) {
  if (event.probe) inputs.probes[event.probe] = event.pending ? 'pending' : (event.ok ? 'pass' : 'fail');
  try {
    await refresh();
  } catch { /* keep the last answers; the field already shows what went wrong */ }
  await paint();
}

async function paint() {
  const jacks = jackStates(inputs);
  for (const name of ['memory', 'brain', 'voice']) paintJack(name, jacks[name]);

  const memoryKey = `${jacks.memory}|${inputs.db ? `${inputs.db.driver}|${inputs.db.state}` : 'none'}`;
  if (rendered.memory !== memoryKey) {
    rendered.memory = memoryKey;
    await database.renderMemory(byId('memory-body'), onChange, { capabilities, db: inputs.db });
  }

  if (rendered.voice !== jacks.voice) {
    rendered.voice = jacks.voice;
    whatsapp.render(byId('voice-body'), {
      capabilities,
      markDone: () => { inputs.whatsapp = { linked: true }; onChange(); },
    }, jacks.voice);
  }

  if (abilities) {
    const counts = abilities.update({ catalog: inputs.catalog });
    byId('extras-count').textContent = `${counts.on} of ${counts.total} on`;
  }

  byId('launch').disabled = !jacks.launchReady;
}

function paintJack(name, state) {
  byId(`jack-${name}`).setAttribute('data-state', state);
  const status = byId(`status-${name}`);
  status.textContent = LABEL[state];
  status.setAttribute('data-state', state);
  const icon = byId(`icon-${name}`);
  icon.classList.toggle('jack-icon--on', state === 'on');
  icon.classList.toggle('jack-icon--locked', state === 'locked');
}

/** Rumi's own doctor report, kept one click away under the Launch bar. */
function wireCheck() {
  const toggle = byId('check-toggle');
  const body = byId('check-body');
  toggle.addEventListener('click', () => {
    const opening = body.hidden;
    body.hidden = !opening;
    toggle.setAttribute('aria-expanded', String(opening));
    if (opening) done.render(body, { capabilities, markDone: () => {} });
  });
}

/** Each jack's (i) shows a short note on what that part is for. */
function wireInfo() {
  for (const button of document.querySelectorAll('[data-info]')) {
    infoToggle(button, byId(button.dataset.info));
  }
}

function wireNavigation() {
  byId('launch').addEventListener('click', () => show('launching'));
  for (const button of document.querySelectorAll('[data-go]')) {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      show(button.dataset.go);
    });
  }
}

/** Anything the bridge could not load is said once, plainly, on the first screen. */
function reportProblems(problems) {
  if (!problems || !problems.length) return;
  const notice = byId('welcome-problems');
  const list = byId('welcome-problems-list');
  for (const problem of problems) list.append(el('li', { text: problem }));
  notice.hidden = false;
}

async function main() {
  wireNavigation();
  wireInfo();
  wireCheck();
  try {
    const state = await get('/api/state');
    capabilities = state.capabilities || {};
    reportProblems(state.problems);
  } catch (error) {
    reportProblems([`The setup server is not answering: ${error.message}`]);
  }
  show('asleep');
}

main();
