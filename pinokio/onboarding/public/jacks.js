/**
 * jacks -- the one place that decides what is ON, OFF or LOCKED, and whether
 * Launch is ready. Pure: no imports, no DOM, so the tests can run it directly.
 *
 * Memory is the database, Brain is the OpenRouter key, Voice is the linked
 * WhatsApp number. Abilities are extras and never gate Launch.
 */

/** The database Rumi runs itself (DB_DRIVER=bundled in bot/shared/services/db/pg-adapter/drivers.js). */
const BUILT_IN_DRIVER = 'bundled';

/** The core credential that powers Brain. */
const BRAIN_KEY = 'OPENROUTER_API_KEY';

function memoryState(db) {
  if (!db) return 'off';
  if (db.state === 'ready') return 'on';
  // The built-in database is created by the first Start, so "stopped" is fine for it.
  if (db.state === 'stopped' && db.driver === BUILT_IN_DRIVER) return 'on';
  return 'off';
}

function brainState(catalog, probes) {
  const core = ((catalog && catalog.groups) || []).find((group) => group.id === 'core');
  const row = core && (core.rows || []).find((item) => item.key === BRAIN_KEY);
  if (!row || row.set !== true) return 'off';
  return (probes && probes.openrouter) === 'fail' ? 'off' : 'on';
}

function abilityCounts(catalog) {
  const counts = { on: 0, total: 0 };
  for (const group of (catalog && catalog.groups) || []) {
    if (group.id === 'core') continue;
    for (const item of group.abilities || []) {
      counts.total += 1;
      if (item.on) counts.on += 1;
    }
  }
  return counts;
}

/**
 * @param {{catalog: object, probes: object, db: object|null, whatsapp: {linked: boolean}|null}} input
 * @returns {{memory: string, brain: string, voice: string, launchReady: boolean, abilities: {on: number, total: number}}}
 */
export function jackStates({ catalog, probes, db, whatsapp } = {}) {
  const memory = memoryState(db);
  const brain = brainState(catalog, probes);
  let voice = 'locked';
  if (memory === 'on' && brain === 'on') voice = whatsapp && whatsapp.linked === true ? 'on' : 'off';
  return {
    memory,
    brain,
    voice,
    launchReady: memory === 'on' && brain === 'on' && voice === 'on',
    abilities: abilityCounts(catalog),
  };
}
