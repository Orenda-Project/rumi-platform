/**
 * database -- make sure Rumi's tables exist.
 *
 * The built-in database (the default) needs nothing here: Start creates it.
 * Supabase: paste one thing, then watch seventy tables appear.
 *
 * @module steps/database
 */

import { get, post, stream } from '../api.js';
import { el, clear, verdict, slot, whereLink } from '../dom.js';
import { field, databaseAbilities, databaseRows } from './credentials.js';

/** The database Rumi runs itself (the same name jacks.js checks). */
const BUILT_IN_DRIVER = 'bundled';

/** What `inspectDatabase` can tell us, and what to show for each answer. */
const VIEWS = {
  stopped: builtInView,
  unreachable: unreachableView,
  'needs-helper': helperView,
  'needs-schema': schemaView,
  ready: readyView,
};

/** The bootstrap stream, so leaving the step stops watching it. */
let source = null;

/**
 * Stop listening. The run itself deliberately continues on the server -- a
 * half-applied schema is worse than an unwatched one -- this only drops the
 * commentary.
 */
export function stop() {
  if (!source) return;
  source.close();
  source = null;
}

export async function render(host, context) {
  clear(host);
  stop();

  if (!context.capabilities.database) {
    host.append(fallback());
    return;
  }

  host.append(verdict('busy', 'Checking your database…'));
  try {
    const info = await get('/api/db/state');
    clear(host);
    host.append(VIEWS[info.state](info, host, context));
    if (info.state === 'stopped' || info.state === 'ready') context.markDone('database');
  } catch (error) {
    clear(host);
    host.append(verdict('bad', error.message));
  }
}

/**
 * Memory: the database jack.
 *
 * The built-in database is the default and needs nothing typed. A link reveals
 * the catalogue's other database cards (Supabase, your own Postgres). Once one
 * of those is chosen, its fields stay visible and today's database step --
 * helper paste, tables, ready -- is shown under them.
 *
 * @param {HTMLElement} host
 * @param {(event?: object) => void} onChange any save, or the step reaching ready
 * @param {{capabilities: object, db: object|null}} options
 */
export async function renderMemory(host, onChange, { capabilities, db }) {
  clear(host);
  stop();
  const context = { capabilities, markDone: () => onChange({ db: true }) };

  if (!capabilities.database) {
    host.append(fallback());
    return;
  }
  if (!db) {
    host.append(verdict('bad', 'Could not check the database.'));
    return;
  }

  if (db.driver === BUILT_IN_DRIVER) {
    host.append(builtInView());
    const more = alternatives(onChange);
    if (more) host.append(more);
    return;
  }

  // Supabase or Postgres: its own fields first, then what the database needs next.
  for (const row of databaseRows()) host.append(field(row, { hideWhere: false, onChange }));
  const step = el('div', { class: 'memory__step' });
  host.append(step);
  await render(step, context);
}

/** "Use Supabase or another Postgres instead": the database cards, behind a link. */
function alternatives(onChange) {
  const cards = databaseAbilities();
  if (!cards.length) return null;
  const toggle = el('button', { class: 'linkbutton', type: 'button', text: 'Use Supabase or another Postgres instead' });
  toggle.setAttribute('aria-expanded', 'false');
  const body = el('div', { class: 'memory__alternatives' });
  body.hidden = true;
  for (const card of cards) {
    const where = whereLink(card.where);
    body.append(el('section', { class: 'memory__card' }, [
      el('h3', { class: 'memory__card-title', text: card.title }),
      el('p', { class: 'field__hint', text: card.why || '' }),
      ...card.rows.map((row) => field(row, { hideWhere: true, onChange })),
      where ? el('p', { class: 'field__hint' }, ['Get it at ', where]) : null,
    ]));
  }
  toggle.addEventListener('click', () => {
    body.hidden = !body.hidden;
    toggle.setAttribute('aria-expanded', String(!body.hidden));
  });
  return el('div', {}, [toggle, body]);
}

/**
 * The built-in database, before its first Start. There is nothing to do: the
 * database, its data folder and its tables are created when Rumi starts.
 */
function builtInView() {
  return el('div', { class: 'notice notice--ok' }, [
    el('b', { text: 'Rumi keeps its data on this computer.' }),
    el('p', { text: 'It runs its own database, so there is no account to create. The database and its tables are made the first time you press Start — nothing to do here.' }),
    el('p', { text: 'Everything teachers do is stored in the .rumi-db folder inside Rumi. Back it up like any other important folder.' }),
  ]);
}

function unreachableView(info) {
  return el('div', { class: 'notice notice--bad' }, [
    el('b', { text: 'Cannot reach the database yet.' }),
    el('p', { text: info.detail || 'Check the database values on the previous step.' }),
  ]);
}

/**
 * The only manual step in the whole setup. Supabase offers no API for running
 * arbitrary SQL, so the helper the schema is applied through has to be pasted
 * once, by hand. Everything here exists to make that one paste quick.
 */
function helperView(info, host, context) {
  const wrap = el('div', {});
  const copy = el('button', { class: 'btn btn--small', type: 'button', text: 'Copy the SQL' });
  const status = slot(el('div', { class: 'verdict', 'data-tone': 'idle' }));

  copy.addEventListener('click', async () => {
    await navigator.clipboard.writeText(info.helperSql);
    copy.textContent = 'Copied';
    setTimeout(() => { copy.textContent = 'Copy the SQL'; }, 1600);
  });

  const check = el('button', { class: 'btn btn--act', type: 'button', text: "I've run it — check" });
  check.addEventListener('click', async () => {
    check.disabled = true;
    status.set(verdict('busy', 'Looking for the helper…'));
    // PostgREST caches its schema, so the server polls for a few seconds rather
    // than asking once and calling a fresh paste a failure.
    const result = await post('/api/db/check', {});
    if (result.present) {
      render(host, context);
      return;
    }
    status.set(verdict('bad', result.detail || 'Still not there. Give it a moment and try again.'));
    check.disabled = false;
  });

  wrap.append(
    el('div', { class: 'notice' }, [
      el('b', { text: 'Paste this into the Supabase SQL editor, then press Run.' }),
      info.sqlEditorUrl
        ? el('p', {}, [el('a', { class: 'link', href: info.sqlEditorUrl, target: '_blank', rel: 'noreferrer', text: 'Open your SQL editor →' })])
        : el('p', { text: 'Open the SQL editor for your project.' }),
    ]),
    el('pre', { class: 'sql', text: info.helperSql }),
    el('div', { class: 'actions' }, [copy, check]),
    status.node,
  );
  return wrap;
}

function schemaView(info, host, context) {
  const wrap = el('div', {});
  const bar = el('div', { class: 'bar' }, [el('div', { class: 'bar__fill' })]);
  const label = slot(el('div', { class: 'verdict', 'data-tone': 'idle' }));
  const run = el('button', { class: 'btn btn--act', type: 'button', text: 'Create the tables' });

  run.addEventListener('click', () => {
    run.disabled = true;
    applySchema({ bar, label, host, context });
  });

  wrap.append(
    el('p', { class: 'field__hint', text: info.detail || 'The helper is in place. Rumi can create its tables now.' }),
    el('div', { class: 'actions' }, [run]),
    bar,
    label.node,
  );
  return wrap;
}

/** Streams per-statement progress; 159KB of schema is a long silence otherwise. */
function applySchema({ bar, label, host, context }) {
  const fill = bar.querySelector('.bar__fill');
  const swap = (node) => label.set(node);

  source = stream('/api/db/bootstrap', {
    started: ({ total }) => swap(verdict('busy', total ? `Applying ${total} statements…` : 'Applying the schema…')),
    progress: ({ done, total, file }) => {
      if (total) fill.style.width = `${Math.min(100, Math.round((done / total) * 100))}%`;
      swap(verdict('busy', `${file} — ${done}${total ? ` of ${total}` : ''} statements`));
    },
    done: () => {
      fill.style.width = '100%';
      swap(verdict('ok', 'Every table is in place.'));
      stop();
      context.markDone('database');
      setTimeout(() => render(host, context), 900);
    },
    failed: ({ error }) => {
      swap(verdict('bad', error || 'The schema did not apply.'));
      stop();
    },
  });
}

function readyView() {
  return el('div', { class: 'notice notice--ok' }, [
    el('b', { text: 'Your database is ready.' }),
    el('p', { text: 'Every table Rumi needs already exists. Nothing to do here.' }),
  ]);
}

function fallback() {
  return el('div', { class: 'notice notice--bad' }, [
    el('b', { text: 'Database setup is unavailable here.' }),
    el('p', { text: 'Run Terminal setup from the Pinokio sidebar — it creates the tables too.' }),
  ]);
}
