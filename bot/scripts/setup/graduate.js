#!/usr/bin/env node
/**
 * graduate.js — `rumi graduate`, the move from a sandbox channel to a real one.
 *
 * The only real target today is `meta` (the sole production-tier driver), but
 * the target is still a `--to=<driver>` argument resolved through
 * channel-registry.js rather than hardcoded, so a future driver follows the
 * same shape without this file changing.
 *
 * Two design commitments, both about not breaking a working deployment:
 *
 *   - **Validate before touching anything.** The new credentials are checked
 *     against the live service first. A failed graduation leaves `.env` exactly
 *     as it was, so a wrong paste costs a retry rather than an outage on a
 *     channel that had been working.
 *   - **Retire, don't delete.** The outgoing session folder is renamed, not
 *     removed, so going back is possible if the new channel disappoints.
 *
 * No data migration is involved by design: users are keyed by phone number, not
 * by channel, so conversation history, registrations and coaching sessions
 * carry across on their own. The one thing that cannot carry across is the
 * number itself — which is why the closing checklist says so out loud.
 *
 * Usage:
 *   rumi graduate [--to=meta]
 *
 * @module graduate
 */

// A `rumi` command is a conversation with a person, so its output must stay
// human-readable. bot/shared/utils/structured-logger.js replaces console.* with
// JSON logging for the server, and any module that reaches it (the WhatsApp
// connection does) would take this command's output with it — a QR code and a
// wizard, rendered as log records. Set before the first require, since the
// override happens at import time.
process.env.RUMI_CLI = '1';

const fs = require('fs');
const path = require('path');

const ui = require('./ui');
const { createIo, PromptAbortError } = require('./prompt');
const { readEnvFile, writeEnvVars } = require('./env-file');
const fields = require('./fields');
const { DRIVERS, isKnownDriver, isProductionTier } = require('../../shared/services/messaging/channel-registry');
const { resolveChannelDriver, CHANNEL_REQUIRED_VARS } = require('../../shared/config/feature-availability');

const ROOT = path.resolve(__dirname, '../../..');
const ENV_PATH = path.join(ROOT, '.env');

function parseArgs(argv) {
  const args = {};
  for (const arg of argv.slice(2)) {
    const match = arg.match(/^--([^=]+)=(.*)$/);
    if (match) args[match[1]] = match[2];
  }
  return args;
}

/**
 * Asks for the target driver's credentials, using the same human labels,
 * guidance and shape checks as `rumi setup` — sharing fields.js is what keeps
 * the two commands from drifting into two different qualities of explanation.
 *
 * @param {object} io
 * @param {string} targetDriver
 * @param {string} [envPath]
 * @returns {Promise<Record<string,string>>}
 */
async function promptForTargetVars(io, targetDriver, envPath = ENV_PATH) {
  const definitions = fields.fieldsFor(targetDriver);
  // Any driver we have no copy for yet still gets asked — by env var name, which
  // is ugly but honest, and better than silently collecting nothing.
  const specs = definitions.length
    ? definitions
    : (CHANNEL_REQUIRED_VARS[targetDriver] || []).map((env) => ({ env, label: env }));

  const existingEnv = readEnvFile(envPath);
  const collected = {};
  for (const spec of specs) {
    const existing = existingEnv[spec.env];
    const prefill = existing && !/^CHANGEME/i.test(existing) ? existing : '';
    console.log('');
    // eslint-disable-next-line no-await-in-loop -- one question at a time, by design
    collected[spec.env] = await io.ask(spec.label, {
      hint: spec.hint,
      secret: Boolean(spec.secret),
      fallback: prefill || (spec.generate ? spec.generate() : ''),
      validate: spec.validate,
    });
  }
  return collected;
}

/**
 * Checks the target's credentials against the live service, using doctor's own
 * probe so "valid" means the same thing here as it does in `rumi doctor`.
 *
 * @returns {Promise<{ok: boolean, detail: string}>}
 */
async function validateTargetCredentials(targetDriver, mergedEnv) {
  if (targetDriver !== 'meta') {
    return { ok: true, detail: 'no live check exists for this channel yet — trusting the values as given' };
  }
  const { runDoctor } = require('./doctor');
  const result = await runDoctor({ env: mergedEnv });
  const probe = result.probeResults.find((p) => p.name.includes('WhatsApp'));
  if (!probe) return { ok: false, detail: 'no WhatsApp probe result' };
  return { ok: probe.status === 'pass', detail: probe.detail };
}

/**
 * Renames CHANNEL_STATE_DIR/<driver> to <driver>.retired. Because every driver
 * keeps its state under one shared root, this is the same line of code whichever
 * channel is being left behind.
 *
 * @returns {{from: string, to: string}|null} null when there was nothing to retire
 */
function retireOutgoingDriverState(outgoingDriver, env) {
  const stateDir = env.CHANNEL_STATE_DIR || '.channel-state';
  // Repo-anchored to match baileys-connection.js's authDir(): retiring a
  // different folder from the one the driver reads would leave the live session
  // in place and "retire" nothing.
  const outgoingPath = path.isAbsolute(stateDir)
    ? path.join(stateDir, outgoingDriver)
    : path.resolve(ROOT, stateDir, outgoingDriver);
  if (!fs.existsSync(outgoingPath)) return null;
  const retiredPath = `${outgoingPath}.retired`;
  fs.renameSync(outgoingPath, retiredPath);
  return { from: outgoingPath, to: retiredPath };
}

/** What genuinely cannot be done from inside this repo. */
function printManualChecklist(targetDriver) {
  console.log('');
  console.log(ui.rule());
  console.log(`  ${ui.paint('brand', `Rumi now runs on ${targetDriver}.`, { bold: true })}`);
  console.log('');
  if (targetDriver === 'meta') {
    console.log(ui.bold('  Still to do, in Meta\'s console'));
    console.log(ui.steps(fields.META_REMAINING_STEPS));
    console.log('');
    console.log(ui.bold('  And tell your testers'));
    console.log(ui.say('Your official number is a different number from the one you were testing on. Anyone who was messaging the old one has to start a new chat with the new one — there is no way to forward messages between them.'));
  }
  console.log('');
}

async function main() {
  try { require('dotenv').config({ path: ENV_PATH, quiet: true }); } catch { /* dotenv optional */ }

  const args = parseArgs(process.argv);
  const target = (args.to || 'meta').trim().toLowerCase();

  if (!isKnownDriver(target)) {
    console.log(ui.fail(`"${target}" is not a channel Rumi knows. Try: ${Object.keys(DRIVERS).join(', ')}.`));
    process.exitCode = 1;
    return;
  }

  const current = resolveChannelDriver(process.env);
  if (current === target) {
    console.log(ui.ok(`Already running on ${target} — nothing to do.`));
    return;
  }

  console.log(ui.logo(`Moving from ${current} to ${target}`));
  if (isProductionTier(target)) {
    console.log(ui.say('Teachers, conversations and past assessments all carry over on their own — Rumi identifies people by phone number, not by channel, so there is no data migration here.'));
    console.log('');
    console.log(ui.say('Nothing is changed until the new credentials have been checked against Meta. If they do not work, your current setup is left exactly as it is.'));
  }

  const io = createIo();
  let collected;
  try {
    collected = await promptForTargetVars(io, target);
  } catch (err) {
    if (!(err instanceof PromptAbortError || err.aborted)) throw err;
    console.log('');
    console.log(ui.say('Stopped. Nothing was changed — Rumi is still on your current channel.'));
    process.exitCode = 130;
    return;
  }
  const mergedEnv = { ...process.env, ...collected };

  console.log('');
  const spin = ui.spinner('Checking the new credentials before changing anything…');
  const probe = await validateTargetCredentials(target, mergedEnv);
  if (!probe.ok) {
    spin.fail(`Those credentials were rejected (${probe.detail})`);
    console.log(ui.aside('Nothing was changed — Rumi is still on your current channel. The usual cause is an access token that has expired; Meta\'s temporary ones last 24 hours. Fix the value and run `rumi graduate` again.'));
    process.exitCode = 1;
    return;
  }
  spin.succeed(`Credentials accepted ${ui.dim(probe.detail)}`);

  writeEnvVars(ENV_PATH, { ...collected, CHANNEL_DRIVER: target }, {
    fromTemplatePath: path.resolve(ROOT, '.env.template'),
  });
  console.log(ui.ok('Saved.'));

  const retired = retireOutgoingDriverState(current, mergedEnv);
  if (retired) {
    console.log(ui.ok(`Set aside the old ${current} session ${ui.dim(`(${path.basename(retired.to)}, kept in case you want to go back)`)}`));
  }

  printManualChecklist(target);
}

if (require.main === module) {
  main()
    .then(() => process.exit(process.exitCode || 0))
    .catch((err) => {
      console.log(ui.fail(`Could not finish: ${err.message}`));
      process.exit(1);
    });
}

module.exports = {
  main, parseArgs, promptForTargetVars, validateTargetCredentials, retireOutgoingDriverState,
  printManualChecklist,
};
