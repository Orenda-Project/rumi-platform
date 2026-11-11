/**
 * credentials -- the fields that fill in `.env`: Brain's key and the optional
 * abilities, plus the field/save engine the Memory jack reuses.
 *
 * Everything shown here is read from the checkout's own catalogue, so the labels,
 * hints and "where to get it" links are the ones the terminal wizard uses. When
 * Rumi rewords a hint, this rewords with it.
 *
 * @module steps/credentials
 */

import { get, post } from '../api.js';
import { el, clear, mount, verdict, whereLink, slot } from '../dom.js';

/** Which connection test belongs to which variable. */
const PROBE_FOR = {
  SUPABASE_URL: 'supabase',
  SUPABASE_SERVICE_ROLE_KEY: 'supabase',
  DATABASE_URL: 'database',
  OPENROUTER_API_KEY: 'openrouter',
  REDIS_URL: 'redis',
};

/** The group that has to be right before anything works. */
const REQUIRED_GROUP = 'core';

/**
 * Probe failures that arrive as network-speak.
 *
 * Everything else upstream reports is already written for a person -- these are
 * the ones that come straight from fetch, and "fetch failed" tells someone
 * setting Rumi up for the first time nothing at all.
 */
const OPAQUE = [
  [/^fetch failed$/i, 'Could not reach that address. Check it for typos, and check your internet connection.'],
  [/ENOTFOUND|EAI_AGAIN|getaddrinfo/i, 'That address does not resolve. Check it for typos.'],
  [/ECONNREFUSED/i, 'Nothing is listening at that address.'],
  [/ETIMEDOUT|timeout/i, 'That address did not answer in time.'],
];

/** Keep upstream's wording wherever it is already meaningful. */
function humanise(detail, ok) {
  if (ok || !detail) return detail;
  const match = OPAQUE.find(([pattern]) => pattern.test(detail));
  return match ? match[1] : detail;
}

let state = null;

/** Abilities that pick a database. They are offered under Memory, not in the list. */
const DATABASE_KEYS = new Set(['DATABASE_URL', 'SUPABASE_URL']);

/** The one core field Brain asks for. */
const BRAIN_KEY = 'OPENROUTER_API_KEY';

/** Re-read `/api/state`; every renderer here works from the latest answer. */
export async function load() {
  state = await get('/api/state');
  return state;
}

function groupsOf(source) {
  return ((source && source.catalog && source.catalog.groups) || []);
}

/** Is this ability one of the database cards? */
export function isDatabaseAbility(item) {
  return (item.keys || []).some((key) => DATABASE_KEYS.has(key));
}

/** Every database card the catalogue offers, wherever it grouped them. */
export function databaseAbilities(source = state) {
  return groupsOf(source).flatMap((group) => (group.abilities || []).filter(isDatabaseAbility));
}

/** The core rows that belong to the database (whatever DB_DRIVER selects). */
export function databaseRows(source = state) {
  const core = groupsOf(source).find((group) => group.id === REQUIRED_GROUP);
  return core ? core.rows.filter((row) => row.key !== BRAIN_KEY && row.key !== 'REDIS_URL') : [];
}

/** Where Brain's entry-time connection test reports, under its field. */
let brainCheck = null;

/**
 * Brain: the OpenRouter key, with its connection test.
 *
 * @param {HTMLElement} host
 * @param {(event: {key: string, probe: string|null, ok: boolean}) => void} onChange
 */
export function renderBrain(host, onChange, context) {
  clear(host);
  brainCheck = null;
  if (context && context.capabilities && !context.capabilities.credentials) {
    host.append(fallbackNotice());
    return;
  }
  const row = brainRow();
  if (!row) {
    host.append(el('p', { class: 'field__hint', text: 'The AI key is already handled.' }));
    return;
  }
  // A fresh save reports in the field itself, so the entry check steps aside.
  const saved = (event) => {
    if (brainCheck) clear(brainCheck.node);
    onChange(event);
  };
  const node = el('div', { class: 'brain__check' });
  const card = field(row, { onChange: saved });
  brainCheck = { node, card, onChange };
  host.append(card, node);
}

function brainRow(source = state) {
  const core = groupsOf(source).find((group) => group.id === REQUIRED_GROUP);
  return core ? core.rows.find((item) => item.key === BRAIN_KEY) : null;
}

/** Is the OpenRouter key in `.env` already (so it can be tested without a paste)? */
export function brainKeySet(source = state) {
  const row = brainRow(source);
  return Boolean(row && row.set === true);
}

/**
 * Test the saved OpenRouter key without asking for it again -- the same probe a
 * save runs. A failure shows its message under the field with "Test again".
 *
 * @returns {Promise<{probe: string, ok: boolean}>}
 */
export async function checkBrain() {
  const probe = PROBE_FOR[BRAIN_KEY];
  const target = brainCheck;
  if (target) {
    clear(target.node);
    target.node.append(verdict('busy', 'Testing the saved key…'));
  }
  let ok = false;
  let detail = '';
  try {
    const result = await post(`/api/probe/${probe}`, {});
    ok = Boolean(result.ok);
    detail = humanise(result.detail, result.ok) || (ok ? 'Connected' : 'Could not connect');
  } catch (error) {
    detail = error.message;
  }
  if (target && target === brainCheck) {
    clear(target.node);
    target.card.setAttribute('data-state', ok ? 'ok' : 'bad');
    if (ok) {
      target.node.append(verdict('ok', detail));
    } else {
      const again = el('button', { class: 'btn btn--small', type: 'button', text: 'Test again' });
      again.addEventListener('click', async () => {
        again.disabled = true;
        target.onChange({ key: BRAIN_KEY, probe, pending: true });
        const retry = await checkBrain();
        target.onChange({ key: BRAIN_KEY, ...retry });
      });
      target.node.append(verdict('bad', detail), el('div', { class: 'actions brain__again' }, [again]));
    }
  }
  return { probe, ok };
}

/** The pill text for one ability. */
function pillFor(item) {
  if (item.guide) return 'IN CONSOLE';
  if (item.on) return 'ON';
  if (item.partial) return 'NEEDS MORE';
  return 'ADD KEY';
}

function stateFor(item) {
  if (item.guide) return 'console';
  if (item.on) return 'on';
  if (item.partial) return 'partial';
  return 'off';
}

const idOf = (item) => (item.keys || []).join('+');

/**
 * Optional abilities, inline: one button per ability, one open at a time.
 *
 * Built once; `update(source)` repaints pills and the counter from a fresh
 * `/api/state` without closing the open item or wiping its verdicts.
 *
 * @param {HTMLElement} host
 * @param {(event: object) => void} onChange called after any save in an item
 * @returns {{update: (source: object) => {on: number, total: number}, counts: () => {on: number, total: number}}}
 */
export function renderAbilities(host, onChange, context) {
  clear(host);
  const items = new Map();
  if (context && context.capabilities && !context.capabilities.credentials) {
    host.append(fallbackNotice());
    return { update: () => ({ on: 0, total: 0 }), counts: () => ({ on: 0, total: 0 }) };
  }

  const closeOthers = (keep) => {
    for (const entry of items.values()) {
      if (entry !== keep) setOpen(entry, false);
    }
  };

  for (const group of groupsOf(state)) {
    if (group.id === REQUIRED_GROUP) continue;
    const abilities = (group.abilities || []).filter((item) => !isDatabaseAbility(item));
    if (!abilities.length) continue;

    const list = el('div', { class: 'abilities' });
    for (const item of abilities) {
      const entry = abilityItem(item, onChange);
      entry.button.addEventListener('click', () => {
        const opening = entry.body.hidden;
        closeOthers(entry);
        setOpen(entry, opening);
      });
      items.set(idOf(item), entry);
      list.append(entry.node);
    }
    host.append(el('div', { class: 'abilities-group' }, [
      el('h3', { class: 'abilities-group__title', text: group.title }),
      list,
    ]));
  }

  const counts = (source = state) => {
    const result = { on: 0, total: 0 };
    for (const group of groupsOf(source)) {
      if (group.id === REQUIRED_GROUP) continue;
      for (const item of group.abilities || []) {
        if (isDatabaseAbility(item)) continue;
        result.total += 1;
        if (item.on) result.on += 1;
      }
    }
    return result;
  };

  return {
    counts,
    update(source) {
      for (const group of groupsOf(source)) {
        for (const item of group.abilities || []) {
          const entry = items.get(idOf(item));
          if (entry) paintItem(entry, item);
        }
      }
      return counts(source);
    },
  };
}

function setOpen(entry, open) {
  entry.body.hidden = !open;
  entry.node.classList.toggle('ability--open', open);
  entry.button.setAttribute('aria-expanded', String(open));
}

function paintItem(entry, item) {
  entry.node.setAttribute('data-state', stateFor(item));
  entry.pill.textContent = pillFor(item);
}

function abilityItem(item, onChange) {
  const pill = el('span', { class: 'pill' });
  const button = el('button', { class: 'ability-item', type: 'button' }, [
    el('span', { class: 'ability-item__title', text: item.title }),
    pill,
  ]);
  button.setAttribute('aria-expanded', 'false');

  const body = el('div', { class: 'ability__body' });
  body.hidden = true;
  body.append(el('p', { class: 'field__hint', text: item.why || '' }));

  if (item.guide) {
    body.append(el('p', { class: 'ability__note', text: "Set up from the console's Setup page after launch." }));
  } else {
    for (const row of item.rows) body.append(field(row, { hideWhere: true, onChange }));
  }
  const where = whereLink(item.where);
  if (where) body.append(el('p', { class: 'field__hint ability__where' }, ['Get it at ', where]));

  const node = el('div', { class: 'ability' }, [button, body]);
  const entry = { node, button, body, pill };
  paintItem(entry, item);
  return entry;
}

export function field(row, options = {}) {
  // A real form per field: browsers and password managers expect a credential
  // input to live in one, and it gives Enter-to-submit without a key handler.
  // autocomplete off: these are service API keys, not sign-in credentials, and a
  // browser offering to remember one is noise at best.
  const card = el('form', { class: 'field', autocomplete: 'off', 'data-state': row.set ? 'ok' : 'empty' });
  const secret = row.classification === 'secret';
  const input = el('input', {
    type: secret ? 'password' : 'text',
    // "new-password" on the secrets stops browsers offering a saved login for a
    // field that wants a service API key; "off" does the same for the rest.
    autocomplete: secret ? 'new-password' : 'off',
    placeholder: row.set ? row.display : 'Not set',
    id: `f-${row.key}`,
  });

  const status = slot(el('div', { class: 'verdict', 'data-tone': 'idle' }));

  const save = el('button', { class: 'btn btn--small', type: 'submit', text: 'Save' });
  card.addEventListener('submit', (event) => {
    event.preventDefault();
    saveField({ row, input, card, status, save, onChange: options.onChange });
  });

  // The catalogue falls back to the variable name when a row has no friendly
  // label. Printing that beside the key chip says the same thing twice, so the
  // chip alone carries it.
  const named = row.label && row.label !== row.key;

  mount(
    card,
    el('div', { class: 'field__head' }, [
      named ? el('span', { class: 'field__label', text: row.label }) : null,
      el('span', { class: 'field__key', text: row.key }),
    ]),
    row.hint ? el('p', { class: 'field__hint', text: row.hint }) : null,
    el('div', { class: 'field__row' }, [input, save]),
    options.hideWhere ? null : whereLink(row.where),
    status.node,
  );
  return card;
}

export async function saveField({ row, input, card, status, save, onChange }) {
  const value = input.value.trim();
  if (!value) return;

  save.disabled = true;
  status.set(verdict('busy', 'Saving…'));

  try {
    const result = await post('/api/env', { updates: { [row.key]: value } });
    const problem = result.errors && result.errors[row.key];
    if (problem) {
      card.setAttribute('data-state', 'bad');
      status.set(verdict('bad', problem));
      return;
    }
    input.value = '';
    input.placeholder = 'Saved';
    const tested = await testConnection({ row, card, status });
    if (onChange) onChange({ key: row.key, ...tested });
  } catch (error) {
    card.setAttribute('data-state', 'bad');
    status.set(verdict('bad', error.message));
  } finally {
    save.disabled = false;
  }
}

/** Save then check: a value that is well-formed but wrong is the common case. */
async function testConnection({ row, card, status }) {
  // Required keys use Rumi's own checks; optional ones the launcher's, which
  // the server lists in /api/state.
  const probe = PROBE_FOR[row.key] || (state && state.probeFor && state.probeFor[row.key]);
  if (!probe) {
    card.setAttribute('data-state', 'ok');
    status.set(verdict('ok', 'Saved'));
    return { probe: null, ok: true };
  }

  status.set(verdict('busy', 'Testing the connection…'));
  const result = await post(`/api/probe/${probe}`, {});
  const detail = humanise(result.detail, result.ok) || (result.ok ? 'Connected' : 'Could not connect');
  card.setAttribute('data-state', result.ok ? 'ok' : 'bad');
  status.set(verdict(result.ok ? 'ok' : 'bad', detail));
  return { probe, ok: Boolean(result.ok) };
}

function fallbackNotice() {
  return el('div', { class: 'notice notice--bad' }, [
    el('b', { text: 'Settings are unavailable here.' }),
    el('p', {
      text: 'Close this and run Terminal setup from the Pinokio sidebar instead — it does the same job.',
    }),
  ]);
}
