/**
 * summary.js — how a Rumi deployment's state is shown to a person.
 *
 * `rumi doctor` already answers "is everything reachable" for an operator
 * debugging a deployment; its output is a diagnostic, and reads like one. This
 * module answers a different question — "am I ready, and what do I do next" —
 * for someone who has just finished setting Rumi up and has never seen it run.
 * Both read the same `runDoctor()` result, so they cannot disagree about facts.
 *
 * Shared by the wizard's closing screen and `rumi status`, which is why the
 * "linked as +…" line and the on/off table live here rather than in either.
 *
 * @module summary
 */

const ui = require('./ui');

/** Doctor names features for precision ("Voice notes (speech-to-text, Soniox)"); a
 * closing screen wants the plain half. The vendor is still shown, via the env
 * var you would add to switch the feature on. */
const shortFeatureName = (name) => String(name).replace(/\s*\(.*\)\s*$/, '');

/**
 * The one-line-per-thing readiness table.
 *
 * Off is stated as an invitation, not a failure — everything in the optional
 * list is genuinely optional, and a first-time setup that reports five red
 * crosses for features the user chose to skip teaches them to ignore the
 * output.
 *
 * @param {object} doctor  a runDoctor() result
 * @param {{number?: string|null}} [opts]
 * @returns {string}
 */
function renderReadiness(doctor, opts = {}) {
  const rows = [];

  for (const probe of doctor.probeResults) {
    if (probe.status === 'skip') continue;
    const label = ({
      Supabase: 'Memory (database)',
      'OpenRouter (LLM)': 'Thinking (AI)',
      Redis: 'Short-term memory',
      'WhatsApp Cloud API': 'WhatsApp',
    })[probe.name] || probe.name;
    const extra = detailSuffix(probe.detail);
    rows.push([label, probe.status === 'pass'
      ? ui.paint('brand', 'ready') + (extra ? ui.dim(extra) : '')
      : ui.paint('danger', `not working — ${probe.detail}`)]);
  }

  if (doctor.channel === 'baileys') {
    // Keyed on `linked`, not on having a number: a pairing can succeed without
    // us learning the number (see link-whatsapp.js), and telling someone who
    // just scanned a code that they are "not linked yet" is the worst kind of
    // wrong — it contradicts the ✔ two lines above it.
    const linked = opts.linked === undefined ? Boolean(opts.number) : opts.linked;
    if (!linked) rows.push(['WhatsApp', ui.paint('accent', 'not linked yet — run `rumi pair`')]);
    else if (opts.number) rows.push(['WhatsApp', `${ui.paint('brand', 'linked')} ${ui.dim(`as +${opts.number}`)}`]);
    else rows.push(['WhatsApp', ui.paint('brand', 'linked')]);
  }

  const on = doctor.featureResults.filter((f) => f.status === 'on');
  const off = doctor.featureResults.filter((f) => f.status !== 'on');

  const lines = [ui.table(rows)];
  if (on.length) {
    lines.push('', ui.dim('  Also switched on'));
    lines.push(on.map((f) => ui.bullet(shortFeatureName(f.name))).join('\n'));
  }
  if (off.length) {
    lines.push('', ui.dim('  Available later — add the key and Rumi picks it up on restart'));
    // A table rather than a bulleted list: the keys line up into a column you
    // can read down, which is how someone decides what to add next.
    lines.push(ui.table(off.map((f) => {
      const key = (f.missingKeys && f.missingKeys[0]) || (f.requiredKeys && f.requiredKeys[0]) || '';
      return [shortFeatureName(f.name), ui.dim(key)];
    }), { indent: 4 }));
  }
  return lines.join('\n');
}

/** Keeps a useful probe detail (a credit balance) and drops the noise (HTTP 200). */
function detailSuffix(detail) {
  const text = String(detail || '');
  const credit = /\$[\d.]+ credit remaining/.exec(text);
  if (credit) return `  ${credit[0]}`;
  return '';
}

/**
 * What to actually do now. Written as the shortest path to seeing Rumi work,
 * because the moment after setup is the one where a person decides whether this
 * thing is real.
 *
 * @param {{channel: string, number?: string|null}} opts
 * @returns {string}
 */
function renderNextSteps(opts) {
  const lines = [];
  lines.push(ui.bold('  Start Rumi'));
  // `rumi start` rather than `cd bot && npm start`: the latter runs the bot from
  // bot/, where a relative .env and a relative session folder both resolved to
  // the wrong place — the bot aborted on "missing required vars", and when it did
  // boot it paired a second WhatsApp device and re-synced forever.
  lines.push(`    ${ui.paint('brandHi', 'rumi start')}`);
  lines.push('');

  if (opts.channel !== 'meta') {
    lines.push(ui.aside('On your own WhatsApp number, the tap-through forms, approved templates and picture menus are unavailable — Rumi asks the same things as a normal chat instead. `rumi graduate` gets you the full experience on an official number.'));
    lines.push('');
  }

  if (opts.channel === 'meta') {
    lines.push(ui.bold('  Then, in Meta\'s console'));
    lines.push(ui.aside('Point the webhook at your deployed address and subscribe it to "messages". Rumi cannot receive anything until that is done — see docs/onboarding/whatsapp.md.'));
    lines.push('');
    lines.push(ui.bold('  Once messages arrive, try sending'));
  } else {
    const target = opts.number ? `+${opts.number}` : 'your own WhatsApp number';
    lines.push(ui.bold(`  Then message ${target} from any phone and try`));
  }

  lines.push(ui.table([
    ['Hi', ui.dim('Rumi introduces itself and asks your name')],
    ['/menu', ui.dim('everything it can do')],
    ['/reading test', ui.dim('assess a student reading aloud')],
    ['a voice note', ui.dim('Rumi listens and replies')],
    ['a photo of a worksheet', ui.dim('Rumi marks it')],
  ], { labelRole: 'brandHi', indent: 4 }));
  lines.push('');
  lines.push(ui.bold('  Anytime'));

  const anytime = [
    ['rumi status', ui.dim('is Rumi running, and what is switched on')],
    ['rumi doctor', ui.dim('check every connection')],
  ];
  // `rumi pair` only means something on a channel that pairs by QR — offering it
  // on Meta would be advice that cannot be followed.
  if (opts.channel !== 'meta') {
    anytime.push(['rumi pair', ui.dim('re-link WhatsApp if the session drops')]);
    anytime.push(['rumi graduate', ui.dim('move to an official WhatsApp Business number')]);
  }
  lines.push(ui.table(anytime, { labelRole: 'brandHi', indent: 4 }));
  return lines.join('\n');
}

module.exports = { renderReadiness, renderNextSteps, shortFeatureName };
