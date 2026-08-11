#!/usr/bin/env node
/**
 * baileys-pair.js — `rumi pair` (also `npm run pair:baileys`).
 *
 * Links, or re-links, the sandbox WhatsApp channel by QR. `rumi setup` runs the
 * same pairing as its final step; this is the standalone way back in when a
 * session drops — which it will, since WhatsApp expires linked devices.
 *
 * The pairing itself lives in link-whatsapp.js, shared with the wizard, so
 * there is only ever one code path writing the WhatsApp session. Two writers is
 * how a session gets invalidated, and the recovery for that is manual.
 *
 * @module baileys-pair
 */

// A `rumi` command is a conversation with a person, so its output must stay
// human-readable. bot/shared/utils/structured-logger.js replaces console.* with
// JSON logging for the server, and any module that reaches it (the WhatsApp
// connection does) would take this command's output with it — a QR code and a
// wizard, rendered as log records. Set before the first require, since the
// override happens at import time.
process.env.RUMI_CLI = '1';

const ui = require('./ui');

async function main() {
  try {
    const path = require('path');
    require('dotenv').config({ path: path.resolve(__dirname, '../../..', '.env'), quiet: true });
  } catch { /* dotenv optional */ }

  const connection = require('../../shared/services/messaging/baileys-connection');
  const { linkWhatsApp, releaseWhatsApp } = require('./link-whatsapp');

  console.log(ui.logo('Linking WhatsApp'));
  console.log(ui.say('On your phone: WhatsApp → Settings → Linked devices → Link a device, then point it at the code that appears below.'));
  console.log(ui.aside(`Session folder: ${connection.authDir()} — treat it like a password; it grants access to the account.`));
  console.log('');

  // Deliberately not a spinner: the connection module renders the QR straight to
  // stdout, and a spinner redrawing itself every 90ms would overwrite the last
  // row of the code — which is the row a phone camera needs most.
  console.log(ui.dim('  Connecting to WhatsApp…'));
  const result = await linkWhatsApp();
  await releaseWhatsApp();

  if (result.ok) {
    console.log('');
    console.log(ui.ok(`Linked${result.number ? ` as ${ui.bold(`+${result.number}`)}` : ''}`));
    console.log(ui.say('Start Rumi with `rumi start`, then message that number from any phone.'));
    process.exit(0);
  }

  console.log('');
  if (result.reason === 'busy') {
    console.log(ui.fail('Rumi is already running, and two processes cannot share one WhatsApp session.'));
    console.log(ui.aside('Stop the running one first, then try again. `rumi status` shows what is holding it.'));
  } else if (result.reason === 'logged-out') {
    console.log(ui.fail('WhatsApp rejected the session.'));
    console.log(ui.aside(`Delete ${connection.authDir()} and run this again to link from scratch.`));
  } else if (result.reason === 'timeout') {
    console.log(ui.fail('Nothing was scanned in time.'));
    console.log(ui.aside('The code expires every few seconds and refreshes on its own — have Linked devices open on your phone before running this, then try again.'));
  } else {
    console.log(ui.fail(`Could not link: ${result.detail || 'unknown error'}`));
  }
  process.exit(1);
}

if (require.main === module) main();

module.exports = { main };
