/**
 * first-run — the model behind the Activity page's first-run banner.
 *
 * The setup wizard opens /console/activity?first-run=1 after launch. The banner
 * watches the live feed for Rumi's first sent reply and turns green. The
 * pattern lives here so the server and console.js agree on one source string.
 *
 * @module console/first-run
 */

/** Feed `msg` values that mean "a reply went out" (regex source, no flags). */
const REPLY_SENT_SOURCE = '^✅ (?:WhatsApp|Baileys) message sent|^✅ (?:Template|Video) message sent';

/** How long the banner waits for any live feed record before turning amber. */
const NO_ARRIVAL_MS = 90000;

const REPLY_SENT = new RegExp(REPLY_SENT_SOURCE);

/** @param {{msg?: string|null}} record */
function isReplySent(record) {
  return Boolean(record && typeof record.msg === 'string' && REPLY_SENT.test(record.msg));
}

/**
 * @param {object} query Express req.query
 * @param {{groups: Array<{abilities: Array<{on: boolean, pendingRestart: boolean}>}>}} catalog
 * @returns {null | {abilitiesOn: number}} null unless ?first-run=1
 */
function firstRunModel(query, catalog) {
  if (!query || query['first-run'] !== '1') return null;
  const abilitiesOn = (catalog.groups || [])
    .flatMap((g) => g.abilities || [])
    .filter((a) => a.on && !a.pendingRestart).length;
  return { abilitiesOn };
}

module.exports = { REPLY_SENT_SOURCE, NO_ARRIVAL_MS, isReplySent, firstRunModel };
