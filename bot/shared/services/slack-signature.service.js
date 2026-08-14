/**
 * Slack request-signature verification — the Slack analogue of
 * flow-encryption.service.js's role for Meta Flows, but VERIFYING a request
 * (Slack signs, never encrypts, its payload body) rather than
 * encrypting/decrypting one.
 *
 * Slack signs every request to your Events API / Interactivity URL with
 * HMAC-SHA256 over `v0:<timestamp>:<raw body>`, keyed by SLACK_SIGNING_SECRET,
 * sent as the `X-Slack-Signature` header alongside `X-Slack-Request-Timestamp`
 * (docs: https://api.slack.com/authentication/verifying-requests-from-slack).
 *
 * Verification needs the EXACT raw request bytes Slack signed — not the
 * body Express's json()/urlencoded() parsers would reconstruct via
 * JSON.stringify/qs.stringify, which can differ in whitespace/key order from
 * what was actually sent over the wire. Callers must capture `req.rawBody`
 * (a Buffer or string) BEFORE any body parser touches the request — see
 * the raw-body-capturing middleware in whatsapp-bot.js's Slack route mount.
 */

const crypto = require('crypto');

const SIGNATURE_VERSION = 'v0';
const MAX_TIMESTAMP_SKEW_SECONDS = 60 * 5; // Slack's own documented replay-protection window

function isConfigured() {
  return Boolean(process.env.SLACK_SIGNING_SECRET);
}

/**
 * @param {import('express').Request} req - must carry req.rawBody (Buffer|string),
 *   captured before any body-parsing middleware ran.
 * @returns {boolean}
 */
function verify(req) {
  if (!isConfigured()) return false;

  const timestamp = req.headers['x-slack-request-timestamp'];
  const signature = req.headers['x-slack-signature'];
  if (!timestamp || !signature) return false;

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - Number(timestamp)) > MAX_TIMESTAMP_SKEW_SECONDS) return false;

  const rawBody = req.rawBody != null ? req.rawBody.toString('utf8') : '';
  const base = `${SIGNATURE_VERSION}:${timestamp}:${rawBody}`;
  const expected = `${SIGNATURE_VERSION}=`
    + crypto.createHmac('sha256', process.env.SLACK_SIGNING_SECRET).update(base).digest('hex');

  const expectedBuf = Buffer.from(expected, 'utf8');
  const signatureBuf = Buffer.from(String(signature), 'utf8');
  if (expectedBuf.length !== signatureBuf.length) return false; // timingSafeEqual requires equal length
  return crypto.timingSafeEqual(expectedBuf, signatureBuf);
}

module.exports = { isConfigured, verify };
