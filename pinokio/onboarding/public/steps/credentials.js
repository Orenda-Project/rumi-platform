/**
 * credentials -- the step that fills in `.env`.
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

export async function render(host, context) {
  clear(host);

  if (!context.capabilities.credentials) {
    host.append(fallbackNotice());
    return;
  }

  state = await get('/api/state');
  const groups = (state.catalog && state.catalog.groups) || [];

  for (const group of groups) {
    if (!group.rows.length && !group.abilities.length) continue;
    host.append(group.id === REQUIRED_GROUP ? requiredGroup(group) : optionalGroup(group));
  }

  context.refreshProgress();
}

function requiredGroup(group) {
  return el('section', { class: 'group' }, [
    el('h2', { class: 'group__title', text: group.title }),
    el('p', { class: 'group__blurb', text: group.blurb || '' }),
    ...group.rows.map(field),
  ]);
}

/**
 * Optional groups are collapsed. Someone setting Rumi up for the first time
 * needs four values; showing thirty with equal weight hides which four.
 *
 * Their settings arrive as `abilities` rather than loose rows -- a key here
 * switches a whole feature on, so it is introduced by what it does for a teacher
 * rather than by the name of the vendor it belongs to.
 */
function optionalGroup(group) {
  const summary = el('summary', { class: 'group__title' }, [
    el('span', { text: `${group.title} — optional` }),
  ]);
  return el('details', { class: 'group' }, [
    summary,
    el('p', { class: 'group__blurb', text: group.blurb || '' }),
    ...group.rows.map((row) => field(row)),
    ...group.abilities.map(ability),
  ]);
}

function ability(item) {
  const state = item.on ? 'on' : (item.partial ? 'partial' : 'off');
  return el('section', { class: 'ability', 'data-state': state }, [
    el('div', { class: 'ability__head' }, [
      el('h3', { class: 'ability__title', text: item.title }),
      el('span', { class: 'ability__state', text: item.on ? 'on' : (item.partial ? 'needs more' : 'off') }),
    ]),
    el('p', { class: 'field__hint', text: item.why || '' }),
    whereLink(item.where),
    ...item.rows.map((row) => field(row, { hideWhere: true })),
  ]);
}

function field(row, options = {}) {
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
    saveField({ row, input, card, status, save });
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

async function saveField({ row, input, card, status, save }) {
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
    await testConnection({ row, card, status });
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
    return;
  }

  status.set(verdict('busy', 'Testing the connection…'));
  const result = await post(`/api/probe/${probe}`, {});
  const detail = humanise(result.detail, result.ok) || (result.ok ? 'Connected' : 'Could not connect');
  card.setAttribute('data-state', result.ok ? 'ok' : 'bad');
  status.set(verdict(result.ok ? 'ok' : 'bad', detail));
}

function fallbackNotice() {
  return el('div', { class: 'notice notice--bad' }, [
    el('b', { text: 'Settings are unavailable here.' }),
    el('p', {
      text: 'Close this and run Terminal setup from the Pinokio sidebar instead — it does the same job.',
    }),
  ]);
}

/** How many required values are filled in, for the rail and the final screen. */
export function counts() {
  return (state && state.catalog && state.catalog.counts) || null;
}
