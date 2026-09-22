#!/usr/bin/env node
/**
 * Matrix channel live smoke test -- NOT a Jest test. Proves the real roundtrip
 * against a real homeserver: logs in with the configured bot credentials,
 * sends a text message to MATRIX_SMOKE_TARGET_USER, waits for that user's
 * reply, and prints the exact Meta-shaped payload matrix-events.adapter.js
 * produced from it (the same shape whatsapp-bot.js's handleWebhookPost
 * dispatches on for every other channel).
 *
 * Usage:
 *   MATRIX_HOMESERVER_URL=http://localhost:8008 \
 *   MATRIX_ACCESS_TOKEN=syt_... \
 *   MATRIX_SMOKE_TARGET_USER=@kamal:localhost \
 *   node bot/scripts/matrix-smoke.js
 *
 * Exit code 0 on a confirmed roundtrip, 1 on timeout/failure.
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const TIMEOUT_MS = Number(process.env.MATRIX_SMOKE_TIMEOUT_MS || 60_000);

async function main() {
  const targetUser = process.env.MATRIX_SMOKE_TARGET_USER;
  if (!process.env.MATRIX_HOMESERVER_URL || !process.env.MATRIX_ACCESS_TOKEN) {
    console.error('❌ MATRIX_HOMESERVER_URL and MATRIX_ACCESS_TOKEN must be set.');
    process.exit(1);
  }
  if (!targetUser) {
    console.error('❌ MATRIX_SMOKE_TARGET_USER must be set (e.g. @kamal:localhost).');
    process.exit(1);
  }

  const connection = require('../shared/services/messaging/matrix-connection');
  const matrixChannel = require('../shared/services/messaging/matrix-channel.service');
  const matrixEventsAdapter = require('../shared/services/messaging/inbound/matrix-events.adapter');

  console.log(`Connecting to ${process.env.MATRIX_HOMESERVER_URL} ...`);
  await connection.getClient();
  console.log(`Connected. E2EE active: ${connection.isE2eeActive()}`);

  let resolveReply;
  const replyPromise = new Promise((resolve) => { resolveReply = resolve; });

  const dispatch = async (req) => {
    const metaMessage = req.body.entry[0].changes[0].value.messages[0];
    // Only resolve on a message from the target user -- ignore anything else
    // that lands on this same shared connection while the smoke script runs.
    if (metaMessage.from === matrixEventsAdapter.toPrefixedIdentity(targetUser)) {
      console.log('\n📩 Adapter produced this Meta-shaped payload from the reply:');
      console.log(JSON.stringify(metaMessage, null, 2));
      resolveReply(metaMessage);
    }
  };

  await matrixEventsAdapter.attach(dispatch);
  console.log('Inbound listener attached.');

  const to = `matrix:${targetUser}`;
  const sentText = `Rumi Matrix channel smoke test -- reply with anything to confirm the roundtrip (${new Date().toISOString()})`;
  console.log(`\nSending to ${targetUser}: "${sentText}"`);
  const eventId = await matrixChannel.sendTextReturningId(to, sentText);
  if (!eventId) {
    console.error('❌ sendTextReturningId returned null -- the outbound send itself failed.');
    process.exit(1);
  }
  console.log(`Sent. event_id=${eventId}`);
  console.log(`\nWaiting up to ${TIMEOUT_MS / 1000}s for a reply from ${targetUser} ...`);

  const timeout = new Promise((resolve) => setTimeout(() => resolve(null), TIMEOUT_MS));
  const result = await Promise.race([replyPromise, timeout]);

  await connection.close();

  if (!result) {
    console.error('\n❌ Timed out waiting for a reply. Roundtrip NOT confirmed.');
    process.exit(1);
  }

  console.log('\n✅ Roundtrip confirmed: sent -> received -> adapter mapped to Meta shape.');
  process.exit(0);
}

main().catch((error) => {
  console.error('❌ Smoke test crashed:', error);
  process.exit(1);
});
