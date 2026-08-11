#!/usr/bin/env node
/**
 * status.js — `rumi status`, the "what is going on right now" view.
 *
 * Distinct from `rumi doctor` on purpose. Doctor answers *is each service
 * reachable* — a checklist you read when something is broken. Status answers
 * the two questions someone actually has after setup: **is Rumi running**, and
 * **which WhatsApp account is it answering as**. Neither is visible in a
 * credentials checklist, and both are what you want before sending a test
 * message.
 *
 * Everything here is read from disk plus doctor's own probes; nothing is
 * started, stopped or changed.
 *
 * @module status
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
const summary = require('./summary');
const { readEnvFile } = require('./env-file');

const ROOT = path.resolve(__dirname, '../../..');
const ENV_PATH = path.join(ROOT, '.env');

/** True when a process with this pid exists and we are allowed to signal it. */
function pidIsAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0); // signal 0 = existence check only
    return true;
  } catch (err) {
    return err.code === 'EPERM'; // exists, owned by someone else
  }
}

/**
 * Is a Rumi process holding the WhatsApp session?
 *
 * The lock file is written by the connection module for a completely different
 * reason — stopping two processes from sharing (and thereby destroying) one
 * WhatsApp session — but it happens to be the only honest local answer to "is
 * the bot up", so status reads it rather than inventing a second pid file that
 * could disagree.
 *
 * @param {object} env
 * @returns {{running: boolean, pid?: number, since?: string, stale?: boolean}}
 */
function processState(env) {
  const stateDir = env.CHANNEL_STATE_DIR || '.channel-state';
  const lockFile = path.resolve(ROOT, stateDir, 'baileys', '.instance.lock');
  let holder;
  try {
    holder = JSON.parse(fs.readFileSync(lockFile, 'utf-8'));
  } catch {
    return { running: false };
  }
  if (!pidIsAlive(holder.pid)) return { running: false, stale: true, pid: holder.pid };
  return { running: true, pid: holder.pid, since: holder.since };
}

/**
 * Which WhatsApp account the stored sandbox session belongs to, read straight
 * out of the saved credentials — so it answers even when Rumi is not running.
 *
 * @param {object} env
 * @returns {{paired: boolean, number?: string|null, name?: string}}
 */
function sandboxIdentity(env) {
  const stateDir = env.CHANNEL_STATE_DIR || '.channel-state';
  const credsFile = path.resolve(ROOT, stateDir, 'baileys', 'creds.json');
  try {
    const creds = JSON.parse(fs.readFileSync(credsFile, 'utf-8'));
    const id = creds && creds.me && creds.me.id;
    const number = typeof id === 'string' ? id.split(':')[0].split('@')[0].replace(/\D/g, '') : null;
    return { paired: Boolean(number), number, name: creds && creds.me && creds.me.name };
  } catch {
    return { paired: false };
  }
}

/**
 * @param {object} state       from processState()
 * @param {boolean} [localOnly] false for a channel whose bot normally runs elsewhere
 */
function renderProcessLine(state, localOnly = true) {
  if (state.running) {
    const since = state.since ? ui.dim(` since ${new Date(state.since).toLocaleString()}`) : '';
    return `${ui.paint('brand', 'running')} ${ui.dim(`pid ${state.pid}`)}${since}`;
  }
  if (state.stale) return `${ui.dim('not running')} ${ui.dim(`(pid ${state.pid} is gone — a stale lock, harmless)`)}`;
  // On Meta the bot runs on a host somewhere, not here. Saying "not running"
  // would be a confident claim about a machine this command cannot see.
  if (!localOnly) return ui.dim('nothing running on this machine — check your host\'s logs for the deployed one');
  return ui.dim('not running — start it with `rumi start`');
}

async function main() {
  try { require('dotenv').config({ path: ENV_PATH, quiet: true }); } catch { /* dotenv optional */ }
  const env = { ...process.env, ...readEnvFile(ENV_PATH) };

  const { runDoctor } = require('./doctor');
  const { isProductionTier } = require('../../shared/services/messaging/channel-registry');

  console.log(ui.logo());
  const spin = ui.spinner('Checking…');
  const doctor = await runDoctor({ env });
  spin.stop();

  const tier = isProductionTier(doctor.channel) ? 'official WhatsApp Business number' : 'linked to your own WhatsApp';
  console.log(`  ${ui.bold(`Rumi · ${doctor.channel}`)} ${ui.dim(`— ${tier}`)}`);
  console.log('');

  const isLocalChannel = doctor.channel === 'baileys';
  const identity = isLocalChannel ? sandboxIdentity(env) : { paired: false };
  console.log(ui.table([['Process', renderProcessLine(processState(env), isLocalChannel)]]));
  console.log('');
  console.log(summary.renderReadiness(doctor, { number: identity.number }));
  console.log('');
  console.log(doctor.ok
    ? ui.ok('Everything Rumi needs is working.')
    : ui.warn('Something is not working — `rumi doctor` has the detail.'));
  console.log('');

  process.exitCode = doctor.ok ? 0 : 1;
}

if (require.main === module) {
  main().catch((err) => {
    console.log(ui.fail(`Could not read the status: ${err.message}`));
    process.exitCode = 1;
  });
}

module.exports = {
  main, processState, sandboxIdentity, pidIsAlive, renderProcessLine,
};
