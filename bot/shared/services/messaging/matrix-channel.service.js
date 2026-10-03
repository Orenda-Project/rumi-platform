/**
 * Matrix channel driver -- additive, self-hosted-homeserver channel: no app
 * review, no business verification, so (like Slack/Discord) there is no
 * sandbox/production tier split for it (see channel-registry.js's
 * PRODUCTION_TIER_DRIVERS).
 *
 * Method names/async-ness are parsed statically off meta-channel.service.js's
 * SOURCE (the same mechanism slack-channel.service.js/discord-channel.service.js
 * use) rather than by `require()`-ing that module -- meta-channel.service.js
 * pulls in axios/form-data, neither of which this driver needs. If
 * meta-channel.service.js ever grows a new method this file doesn't know
 * about, requiring this file throws immediately (see the assertion loop at
 * the bottom) rather than silently shipping a missing/wrong-shaped member.
 *
 * Identity: `to` arrives as EITHER the long "matrix:<user_id>" identifier
 * (e.g. "matrix:@teacher:example.org") or, for a teacher who registered with
 * a phone number as their Matrix username, the short "mtx:<digits>" form
 * (e.g. "mtx:15550101234") -- see matrix-identity.js's header comment for
 * why the short form exists (a varchar(20) column several shared tables
 * write this identity into) and matrixUserId() below for how both are
 * resolved back to a real Matrix user id. Matrix user ids themselves contain
 * a colon, but channel-registry.js#driverForIdentifier only ever splits on
 * the FIRST colon, so the long form is unambiguous (see
 * channel-registry.test.js); the short form has no embedded colon at all.
 *
 * Interactive surfaces (buttons/lists): unlike Discord, this driver does NOT
 * render native components -- Matrix has no equivalent widely-supported by
 * ordinary clients (Element, etc. render no reply-keyboard concept), so these
 * degrade to the SAME numbered plain-text convention Baileys uses (see
 * text-flow.js/pending-options.js's own header comments) -- a numbered list
 * the user answers by number OR name, resolved back to the Meta-shaped
 * interactive reply by matrix-events.adapter.js via pending-options.js.
 *
 * DM room resolution: matrix-bot-sdk's own `client.dms` manager
 * (getOrCreateDm) already tracks user->room mapping via `m.direct` account
 * data (durable on the homeserver, survives this bot's own storage being
 * wiped) -- this driver layers a small in-memory Map AND a
 * storageProvider.storeValue/readValue entry in front of it purely as a
 * warm-start optimization (skips an account-data round trip on every send
 * once resolved once), not as the source of truth.
 */

const fs = require('fs');
const path = require('path');
const { logToFile } = require('../../utils/logger');
const { downloadFromR2, extractKeyFromUrl } = require('../../storage/r2');
const { prefixFor } = require('./channel-registry');
const matrixIdentity = require('./matrix-identity');
const pendingOptions = require('./pending-options');
const { channelCommandCopy } = require('./command-words');

const META_SOURCE_PATH = path.join(__dirname, 'meta-channel.service.js');
const MATRIX_PREFIX = prefixFor('matrix'); // 'matrix' -- kept indirect so a rename to CHANNEL_PREFIXES stays a one-line fix

function parseMembers(src) {
  const members = [];
  const methodRe = /^\s*static\s+(async\s+)?(\w+)\s*\(/gm;
  let m;
  while ((m = methodRe.exec(src))) members.push({ name: m[2], isAsync: !!m[1] });
  return members;
}

const MEMBERS = parseMembers(fs.readFileSync(META_SOURCE_PATH, 'utf-8'));

/**
 * The bot's own full Matrix user id, used to reconstruct the server name for
 * a short "mtx:<digits>" identity (always an account on the bot's own
 * server -- see matrix-identity.js's header comment). MATRIX_USER_ID (the env
 * var) is the primary source, exactly as the product spec calls for; matrix-connection.js's
 * cached whoami result is a fallback for a deployment that leaves
 * MATRIX_USER_ID blank and lets it resolve automatically on connect.
 */
function ownUserIdHint() {
  if (process.env.MATRIX_USER_ID) return process.env.MATRIX_USER_ID;
  try {
    // eslint-disable-next-line global-require -- lazy: avoids a require cycle at module load
    const connection = require('./matrix-connection');
    return connection.getCachedUserId();
  } catch (error) {
    return null;
  }
}

/**
 * Resolves the "to" identifier the router hands every method -- either the
 * long "matrix:<user_id>" form or a short "mtx:<digits>"/"mtx:t<digits>" form
 * -- back into the full "@user:server" Matrix user id (itself containing a
 * colon) it was minted from. Lossless: each identity names exactly one
 * account (see matrix-identity.js's header comment). Async only because its
 * callers already await it.
 */
async function matrixUserId(to) {
  return matrixIdentity.decodeIdentity(String(to), ownUserIdHint());
}

// Media ids carry the same "matrix:" prefix as user identities, wrapping the
// mxc:// URI itself (e.g. "matrix:mxc://example.org/abc123") -- minted by
// matrix-events.adapter.js so the messaging router can tell an inbound Matrix
// attachment id apart from a WhatsApp media id with no DB lookup. Media ids
// are always long-form (never phone-shaped), so this is a plain prefix strip.
async function stripMatrixPrefix(to) {
  return matrixUserId(to);
}

// ── Matrix client (shared, NOT constructed here) ─────────────────────────────
async function getClient() {
  const connection = require('./matrix-connection');
  return connection.getClient();
}

// ── DM room resolution (cached) ───────────────────────────────────────────────
const dmRoomCache = new Map(); // matrixUserId -> roomId
const DM_ROOM_STORAGE_PREFIX = 'rumi:matrix:dm-room:';

/**
 * Creates a fresh DM room for a user -- the createFn matrix-bot-sdk's
 * client.dms.getOrCreateDm() calls only on a genuine cache miss (no existing
 * m.direct room for this user). Encryption is enabled at room-creation time
 * (initial_state) only when the live connection actually has a working
 * crypto provider -- see matrix-connection.js#isE2eeActive.
 */
async function createDmRoom(client, targetUserId) {
  const connection = require('./matrix-connection');
  const initialState = connection.isE2eeActive()
    ? [{ type: 'm.room.encryption', state_key: '', content: { algorithm: 'm.megolm.v1.aes-sha2' } }]
    : [];
  return client.createRoom({
    invite: [targetUserId],
    is_direct: true,
    preset: 'trusted_private_chat',
    initial_state: initialState,
  });
}

/** Caches `roomId` as `userId`'s DM room and persists it (best-effort). Only ever called with a 1:1 room. */
async function rememberDmRoom(client, userId, roomId) {
  if (dmRoomCache.get(userId) === roomId) return;
  dmRoomCache.set(userId, roomId);
  try {
    await client.storageProvider?.storeValue?.(`${DM_ROOM_STORAGE_PREFIX}${userId}`, roomId);
  } catch (error) {
    logToFile('Matrix: DM room cache write failed (non-fatal)', { error: error.message });
  }
}

/**
 * The room a send to `userId` goes to. In order:
 *  1. the reply to the message being handled goes to the room that message
 *     came from, DM or group (matrix-events.adapter.js#getReplyRoom);
 *  2. otherwise the confirmed 1:1 room they last wrote from, while the bot is
 *     still joined to it (getLastInboundRoom);
 *  3. otherwise their DM room as cached in this process, or stored by an
 *     earlier one -- a stored room is checked to be a 1:1 with them first;
 *  4. otherwise matrix-bot-sdk's own m.direct lookup (creating the DM if none).
 * Only (2)-(4) are cached and persisted, and only 1:1 rooms ever reach them,
 * so a group room never becomes anyone's DM room. See matrix-events.adapter.js's
 * "Reply-to-the-room-you-were-messaged-in" section header.
 */
async function resolveDmRoomId(userId) {
  const client = await getClient();
  // eslint-disable-next-line global-require -- lazy: avoids a require cycle at module load (the adapter requires this file too)
  const adapter = require('./inbound/matrix-events.adapter');
  // eslint-disable-next-line global-require -- lazy, see file header
  const connection = require('./matrix-connection');

  // (2) is checked ahead of everything derived/cached: client.dms.getOrCreateDm()
  // reads the 'm.direct' account-data map, which is asynchronous/eventually-
  // consistent and can race a genuine inbound message, creating a SECOND room
  // and sending the reply where the teacher never sees it (reproduced live),
  // and dmRoomCache could itself hold a duplicate room from exactly that race.
  // Skipped when there's no recorded room (a bot-initiated first contact,
  // e.g. the welcome DM) or the bot is no longer joined to it (kicked/left).
  const lastDmRoomId = adapter.getLastInboundRoom(userId);
  const lastDmUsable = Boolean(lastDmRoomId) && connection.isJoinedToRoom(client, lastDmRoomId);

  const replyRoomId = adapter.getReplyRoom(userId);
  if (replyRoomId) {
    // Persisted when it is their DM, so a proactive send after a restart (a
    // reminder, a delivered report) goes where the teacher last wrote.
    if (lastDmUsable && replyRoomId === lastDmRoomId) await rememberDmRoom(client, userId, replyRoomId);
    return replyRoomId;
  }

  if (lastDmUsable) {
    await rememberDmRoom(client, userId, lastDmRoomId);
    return lastDmRoomId;
  }

  if (dmRoomCache.has(userId)) return dmRoomCache.get(userId);

  const storageKey = `${DM_ROOM_STORAGE_PREFIX}${userId}`;

  // Best-effort warm start straight from the storage provider -- skips a
  // client.dms account-data round trip on a fresh process. Never fatal: a
  // provider that doesn't implement storeValue/readValue (or a read that
  // fails) just falls through to the authoritative client.dms lookup below.
  // The stored room is checked to still be a 1:1 with this user once per
  // process (a pass lands it in dmRoomCache; a fail is overwritten below):
  // an earlier version stored whatever room the teacher last wrote in,
  // a staff group included.
  try {
    const stored = await client.storageProvider?.readValue?.(storageKey);
    if (stored) {
      if (await adapter.isOneToOneRoom(client, stored, userId)) {
        dmRoomCache.set(userId, stored);
        return stored;
      }
      logToFile('⚠️ Matrix: stored DM room is not a 1:1 with this user -- discarded', {
        channel: 'matrix', userId, roomId: stored,
      });
    }
  } catch (error) {
    logToFile('Matrix: DM room cache read failed (non-fatal)', { error: error.message });
  }

  const roomId = await client.dms.getOrCreateDm(userId, (targetUserId) => createDmRoom(client, targetUserId));
  await rememberDmRoom(client, userId, roomId);
  return roomId;
}

/** The room a send targets, resolved from the "matrix:<user_id>"/"mtx:<digits>" identifier. */
async function getRoomId(to) {
  return resolveDmRoomId(await matrixUserId(to));
}

// ── Media sources (mirrors discord/slack's resolveMediaBuffer) ──────────────

function isAbsoluteHttpUrl(url) {
  return /^https?:\/\//i.test(String(url || ''));
}

function isR2Configured() {
  return Boolean(
    process.env.R2_ENDPOINT && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY
  );
}

/**
 * Resolves a media reference into a Buffer suitable for client.uploadContent().
 * Identical logic to Discord's/Slack's resolveMediaBuffer -- copied verbatim
 * rather than shared, matching this codebase's existing convention of each
 * driver owning its own copy of this helper.
 */
async function resolveMediaBuffer(url) {
  if (typeof url === 'string' && url.startsWith('file://')) {
    const localPath = url.slice('file://'.length);
    if (!fs.existsSync(localPath)) {
      throw new Error(`Cannot send media: local file is gone (${localPath})`);
    }
    return fs.readFileSync(localPath);
  }

  if (isR2Configured()) {
    try {
      return await downloadFromR2(extractKeyFromUrl(url));
    } catch (error) {
      if (!isAbsoluteHttpUrl(url)) throw error;
      logToFile('⚠️ Matrix: R2 download failed -- fetching the URL directly instead', {
        url, error: error.message,
      });
    }
  }

  if (!isAbsoluteHttpUrl(url)) {
    throw new Error(
      `Cannot send media from "${url}": it is not an absolute URL, and R2 is not configured `
      + '(set R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY to read private objects).'
    );
  }

  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch media URL: HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

const EXT_MIME_TYPES = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.mp4': 'video/mp4',
  '.pdf': 'application/pdf', '.txt': 'text/plain',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '.csv': 'text/csv',
};

function guessMimeType(filename) {
  return EXT_MIME_TYPES[path.extname(String(filename || '')).toLowerCase()] || 'application/octet-stream';
}

/**
 * The image's real type from its URL's extension (query string ignored),
 * defaulting to PNG. Generated worksheets and lesson-plan pages are often
 * JPEG/WebP; labelling them image/png makes some clients refuse to render them.
 */
function imageTypeFromUrl(url) {
  let pathname = String(url || '');
  try { pathname = new URL(pathname).pathname; } catch (error) { pathname = pathname.split('?')[0]; }
  const ext = path.extname(pathname).toLowerCase();
  const mimeType = EXT_MIME_TYPES[ext];
  if (mimeType && mimeType.startsWith('image/')) return { mimeType, filename: `image${ext}` };
  return { mimeType: 'image/png', filename: 'image.png' };
}

// ── Real implementations ─────────────────────────────────────────────────────

function removeEmotionTags(text) {
  return text.replace(/\[[a-zA-Z\s]+\]\s*/g, '').trim();
}

// ── Formatting: WhatsApp markers -> Matrix HTML ──────────────────────────────
// Rumi's replies are written for WhatsApp, whose markers are *bold*, _italic_,
// ~strikethrough~, ```monospace``` and `inline code` -- note a SINGLE asterisk
// is bold there, not italic as in Markdown. Matrix clients render none of that
// from `body`, so without formatted_body a teacher saw literal asterisks
// (reported from the Android app). Markdown's **bold**/__bold__ and [links](..)
// are also accepted, since some templates use them.
//
// A marker only counts the way WhatsApp counts it: the opening marker follows
// the start of a line or a space/punctuation, the closing one is followed by
// the end or a space/punctuation, and neither touches a space on the inside --
// so "2 * 3 * 4", "snake_case_name" and "~ 5 minutes" stay plain text.
// Matched against HTML-ESCAPED text, so a quote/angle bracket arrives as an
// entity: ";" (end of &quot;/&gt;) opens, "&" (start of an entity) closes.
const OPEN_BOUNDARY = '(^|[\\s(\\[{\';])';
const CLOSE_BOUNDARY = '(?=$|[\\s.,!?;:)\\]}\'&])';

function markerRe(marker) {
  const m = marker.replace(/[*~]/g, '\\$&');
  return new RegExp(`${OPEN_BOUNDARY}${m}(?=\\S)([^\\n]*?\\S)${m}${CLOSE_BOUNDARY}`, 'gm');
}

const BOLD_DOUBLE_RE = /\*\*(?=\S)([^\n]*?\S)\*\*/g;
const BOLD_UNDERSCORE_DOUBLE_RE = /__(?=\S)([^\n]*?\S)__/g;
const BOLD_RE = markerRe('*');
const ITALIC_RE = markerRe('_');
const STRIKE_RE = markerRe('~');
const CODE_BLOCK_RE = /```([\s\S]+?)```/g;
const INLINE_CODE_RE = /`([^`\n]+)`/g;
const LINK_RE = /\[([^\]]+)\]\(([^)\s]+)\)/g;

// Plain conversational text (the overwhelming majority of what Rumi sends)
// skips formatted_body entirely, so an ordinary reply carries no redundant HTML.
function isMarkdownish(text) {
  const t = String(text);
  return [BOLD_DOUBLE_RE, BOLD_UNDERSCORE_DOUBLE_RE, BOLD_RE, ITALIC_RE, STRIKE_RE, CODE_BLOCK_RE, INLINE_CODE_RE, LINK_RE]
    .some((re) => { re.lastIndex = 0; const hit = re.test(t); re.lastIndex = 0; return hit; });
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * WhatsApp/Markdown-ish text -> the small HTML subset Matrix clients render
 * (org.matrix.custom.html): <strong>, <em>, <del>, <code>, <pre>, <a>, <br/>.
 * Code is cut out first so nothing inside it is reformatted. Not a general
 * Markdown engine -- no new dependency for a handful of regexes.
 */
function renderMarkdownToHtml(text) {
  const slots = [];
  const hold = (html) => `\u0000${slots.push(html) - 1}\u0000`;

  let html = escapeHtml(text);
  html = html.replace(CODE_BLOCK_RE, (_, code) => hold(`<pre><code>${code.replace(/^\n/, '')}</code></pre>`));
  html = html.replace(INLINE_CODE_RE, (_, code) => hold(`<code>${code}</code>`));
  html = html.replace(LINK_RE, (_, label, href) => (/^(https?:|mailto:)/i.test(href) ? `<a href="${href}">${label}</a>` : _));
  html = html.replace(BOLD_DOUBLE_RE, '<strong>$1</strong>');
  html = html.replace(BOLD_UNDERSCORE_DOUBLE_RE, '<strong>$1</strong>');
  html = html.replace(BOLD_RE, '$1<strong>$2</strong>');
  html = html.replace(ITALIC_RE, '$1<em>$2</em>');
  html = html.replace(STRIKE_RE, '$1<del>$2</del>');
  html = html.replace(/\n/g, '<br/>');
  // eslint-disable-next-line no-control-regex -- the NUL-delimited placeholders set by hold() above
  return html.replace(/\u0000(\d+)\u0000/g, (_, i) => slots[Number(i)]);
}

// Element takes any message starting with "/" as one of its own client
// commands, so "type /quiz" is advice a Matrix user cannot follow. Every
// command also works as the bare word, and every text this driver sends --
// ux strings, LLM replies, menus rendered as text, captions -- names that form
// instead (command-words.js#channelCommandCopy; URLs and paths are left alone).
const commandCopy = (text) => channelCommandCopy(text, `${prefixFor('matrix')}:`);

function buildTextContent(rawText) {
  const text = commandCopy(removeEmotionTags(rawText));
  const content = { msgtype: 'm.text', body: text };
  if (isMarkdownish(text)) {
    content.format = 'org.matrix.custom.html';
    content.formatted_body = renderMarkdownToHtml(text);
  }
  return content;
}

function matrixErrorDetail(error) {
  return { message: error?.message, body: error?.body };
}

/** One structured line per outbound send -- no message bodies (teacher privacy). */
function logOutbound(roomId, eventId, type) {
  logToFile('✅ Matrix message sent', { channel: 'matrix', direction: 'outbound', roomId, eventId, type });
  // So a teacher's reply to this message in a group room counts as addressed
  // to Rumi -- see matrix-events.adapter.js's "Group rooms" section.
  try {
    // eslint-disable-next-line global-require -- lazy: avoids a require cycle at module load
    require('./inbound/matrix-events.adapter').recordOwnEvent(eventId);
  } catch (error) {
    // best-effort
  }
}

/**
 * Records the room a numbered menu / text-flow question to `to` went to, so a
 * "2" typed in a GROUP room is treated as an answer only when the menu was
 * posted in that room (matrix-events.adapter.js#gateGroupMessage). Best-effort.
 */
async function notePromptRoom(to) {
  try {
    const userId = await matrixUserId(to);
    const roomId = await resolveDmRoomId(userId);
    // eslint-disable-next-line global-require -- lazy: avoids a require cycle at module load
    require('./inbound/matrix-events.adapter').recordPromptRoom(userId, roomId);
  } catch (error) {
    logToFile('Matrix: could not record the menu prompt room (non-fatal)', { error: error.message });
  }
}

async function sendMessage(to, message) {
  try {
    const roomId = await getRoomId(to);
    const client = await getClient();
    const eventId = await client.sendMessage(roomId, buildTextContent(message));
    logOutbound(roomId, eventId, 'text');
    return true;
  } catch (error) {
    logToFile('❌ Matrix: error sending message', { ...matrixErrorDetail(error) });
    return false;
  }
}

async function sendTextReturningId(to, message, opts = {}) {
  try {
    const roomId = await getRoomId(to);
    const client = await getClient();
    const content = buildTextContent(message);
    // Matrix's quote-equivalent is a real rich reply relation, not an
    // approximated thread the way Slack's thread_ts is.
    if (opts.contextMessageId) {
      content['m.relates_to'] = { 'm.in_reply_to': { event_id: opts.contextMessageId } };
    }
    const eventId = await client.sendMessage(roomId, content);
    logOutbound(roomId, eventId, 'text');
    return eventId || null;
  } catch (error) {
    logToFile('❌ Matrix: error sending message (returning id)', { ...matrixErrorDetail(error) });
    return null;
  }
}

async function sendReaction(to, messageId, emoji = '❤️') {
  try {
    const roomId = await getRoomId(to);
    const client = await getClient();
    const eventId = await client.sendEvent(roomId, 'm.reaction', {
      'm.relates_to': { rel_type: 'm.annotation', event_id: messageId, key: emoji },
    });
    logOutbound(roomId, eventId, 'reaction');
    return true;
  } catch (error) {
    logToFile('❌ Matrix: error sending reaction', { ...matrixErrorDetail(error) });
    return false;
  }
}

// Matrix's typing indicator, like Discord's, is a real API -- a genuine
// implementation, not an honest no-op stub the way Slack's is.
const TYPING_TIMEOUT_MS = 10000;

/**
 * Shows "Rumi is typing" and, when the inbound event id is passed (whatsapp-bot.js
 * calls showTypingIndicator(from, message.id) on every accepted message), also
 * sends a read receipt for it -- Meta's version of this call does both in one
 * request (status: 'read' + typing_indicator), so a WhatsApp teacher sees blue
 * ticks; without this a Matrix teacher's message stayed "delivered, unread".
 * The receipt is best-effort: a failure never blocks the typing indicator.
 */
async function showTypingIndicator(to, messageId) {
  try {
    const roomId = await getRoomId(to);
    const client = await getClient();
    if (typeof messageId === 'string' && messageId.startsWith('$') && typeof client.sendReadReceipt === 'function') {
      client.sendReadReceipt(roomId, messageId).catch((error) => {
        logToFile('Matrix: read receipt failed (non-fatal)', { ...matrixErrorDetail(error) });
      });
    }
    await client.setTyping(roomId, true, TYPING_TIMEOUT_MS);
    return true;
  } catch (error) {
    logToFile('❌ Matrix: error sending typing indicator', { ...matrixErrorDetail(error) });
    return false;
  }
}

// Matrix's typing indicator auto-expires after TYPING_TIMEOUT_MS with no
// separate "stop typing" event needed for the happy path -- this repeats just
// under that window (mirrors Discord's own ~8s-under-~10s pattern) and sends
// one explicit typing:false on stop() so the indicator doesn't linger for the
// full timeout after the bot has actually replied.
async function stopTypingIndicator(to) {
  const roomId = await getRoomId(to);
  const client = await getClient();
  await client.setTyping(roomId, false, 0);
  return true;
}

// Looked up through MatrixChannel (not called directly) so that in a relay-mode
// process (the worker -- see matrix-outbound-relay.js) each tick and the final
// stop go over the relay instead of opening a local connection.
function startContinuousTypingIndicator(to) {
  let stopped = false;
  const tick = () => {
    if (stopped) return;
    Promise.resolve(MatrixChannel.showTypingIndicator(to)).catch(() => {});
  };
  tick();
  const interval = setInterval(tick, 8000);
  return {
    stop: () => {
      stopped = true;
      clearInterval(interval);
      Promise.resolve(MatrixChannel._stopTypingIndicator(to)).catch(() => {});
    },
  };
}

// Populated by matrix-events.adapter.js at receive time, keyed by the same
// prefixed "matrix:<mxc-uri>" id it mints -- mirrors discord-channel.service.js's
// mediaCache exactly, and for the same reason: mime/size live on the
// m.room.message content at receive time, not retrievable from the mxc URI
// alone without a second round trip.
const mediaCache = new Map();

function cacheIncomingMedia(prefixedMediaId, info) {
  mediaCache.set(prefixedMediaId, info);
}

async function getMediaInfo(mediaId) {
  const cached = mediaCache.get(String(mediaId));
  if (!cached) {
    throw new Error(`Matrix: no cached media info for id "${mediaId}" -- media must be consumed shortly after it is received (see matrix-events.adapter.js)`);
  }
  return cached;
}

/**
 * The attachment's plaintext bytes. An attachment sent into an E2EE room is
 * itself AES-encrypted (see matrix-events.adapter.js#mapAttachmentToMetaShape,
 * which caches the EncryptedFile as `info.file`); matrix-bot-sdk's own
 * CryptoClient#decryptMedia downloads and decrypts it, verifying the hash.
 */
async function downloadMedia(mediaId) {
  const info = await getMediaInfo(mediaId);
  const client = await getClient();
  if (info.file) {
    if (!client.crypto) {
      throw new Error('Matrix: this attachment is end-to-end encrypted but the connection has no crypto provider -- cannot decrypt it');
    }
    return client.crypto.decryptMedia(info.file);
  }
  const { data } = await client.downloadContent(info.url);
  return data;
}

/**
 * Whether an attachment for this room must itself be encrypted. matrix-bot-sdk
 * encrypts the EVENT automatically in an E2EE room, but not the uploaded bytes:
 * an attachment uploaded as-is sits in the homeserver's media store in the
 * clear, readable by anyone who learns its mxc url, and Element marks it as not
 * encrypted. The SDK's own isRoomEncrypted() does NOT throw when its room
 * lookup fails -- it answers "not encrypted" -- so this asks
 * matrix-connection.js#roomIsEncrypted, which rejects instead; the upload then
 * never happens and the send fails loudly rather than quietly downgrading a
 * private room to plaintext media.
 */
async function roomNeedsEncryptedMedia(client, roomId) {
  if (!client.crypto) return false;
  // eslint-disable-next-line global-require -- lazy, matches getClient() above
  return require('./matrix-connection').roomIsEncrypted(client, roomId);
}

/**
 * Uploads `buffer` to the homeserver's media repo and returns the content
 * fragment that points at it: `{ url }` in a plaintext room, `{ file }` (an
 * EncryptedFile carrying the mxc url and the AES key) in an E2EE room -- the
 * shape the Matrix spec requires there and the one Element/Element X decrypt.
 */
async function uploadForRoom(client, roomId, buffer, mimeType, filename) {
  if (await roomNeedsEncryptedMedia(client, roomId)) {
    const encrypted = await client.crypto.encryptMedia(buffer);
    const mxcUrl = await client.uploadContent(encrypted.buffer, 'application/octet-stream', filename);
    return { file: { ...encrypted.file, url: mxcUrl } };
  }
  return { url: await client.uploadContent(buffer, mimeType, filename) };
}

// ── Voice messages ───────────────────────────────────────────────────────────
// Element and the Rumi Android app show a voice-message bubble (play button,
// length) only for an m.audio carrying the MSC3245 voice flag plus an MSC1767
// audio block; without them Rumi's spoken replies were an "audio.mp3" file to
// download. The length comes from the MP3 itself (the Xing/Info frame count,
// or bit rate and size for a plain constant-bit-rate stream), with no ffprobe
// round trip. Unparseable audio just goes without a length.
const MP3_BITRATES_V1_L3 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
const MP3_BITRATES_V2_L3 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
const MP3_SAMPLE_RATES_V1 = [44100, 48000, 32000];

function mp3DurationMs(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 10) return null;
  let offset = 0;
  if (buffer.toString('latin1', 0, 3) === 'ID3') {
    // Syncsafe tag size (7 bits per byte) plus the 10-byte header.
    offset = 10 + (((buffer[6] & 0x7f) << 21) | ((buffer[7] & 0x7f) << 14) | ((buffer[8] & 0x7f) << 7) | (buffer[9] & 0x7f));
  }
  for (let i = offset; i < Math.min(buffer.length - 4, offset + 4096); i += 1) {
    if (buffer[i] !== 0xff || (buffer[i + 1] & 0xe0) !== 0xe0) continue;
    const version = (buffer[i + 1] >> 3) & 0x03; // 3 = MPEG-1, 2 = MPEG-2, 0 = MPEG-2.5
    const layer = (buffer[i + 1] >> 1) & 0x03; // 1 = Layer III
    const index = buffer[i + 2] >> 4;
    const rateIndex = (buffer[i + 2] >> 2) & 0x03;
    if (layer !== 1 || version === 1 || index === 0 || index === 15 || rateIndex === 3) continue;
    const sampleRate = MP3_SAMPLE_RATES_V1[rateIndex] / (version === 3 ? 1 : version === 2 ? 2 : 4);
    // A Xing/Info frame (written by most encoders) counts the frames exactly;
    // its own bit rate is not the stream's.
    const head = buffer.toString('latin1', i + 4, Math.min(buffer.length, i + 64));
    const tag = Math.max(head.indexOf('Xing'), head.indexOf('Info'));
    if (tag !== -1 && i + 4 + tag + 12 <= buffer.length && (buffer.readUInt32BE(i + 4 + tag + 4) & 1)) {
      const frames = buffer.readUInt32BE(i + 4 + tag + 8);
      return Math.round((frames * (version === 3 ? 1152 : 576) * 1000) / sampleRate);
    }
    const kbps = (version === 3 ? MP3_BITRATES_V1_L3 : MP3_BITRATES_V2_L3)[index];
    return Math.round(((buffer.length - i) * 8) / kbps);
  }
  return null;
}

function voiceMessageFields(buffer) {
  const duration = mp3DurationMs(buffer);
  return {
    info: duration ? { duration } : {},
    extra: { 'org.matrix.msc3245.voice': {}, 'org.matrix.msc1767.audio': duration ? { duration } : {} },
  };
}

/** Uploads a buffer to the homeserver's media repo, then sends it as the given msgtype. Returns the event id. */
async function uploadAndSend(to, buffer, mimeType, filename, msgtype, rawCaption, { voice = false } = {}) {
  const caption = commandCopy(rawCaption);
  const roomId = await getRoomId(to);
  const client = await getClient();
  const media = await uploadForRoom(client, roomId, buffer, mimeType, filename);
  const voiceFields = voice ? voiceMessageFields(buffer) : null;
  const content = {
    msgtype,
    body: caption || filename,
    ...media,
    info: { mimetype: mimeType, size: buffer.length, ...(voiceFields ? voiceFields.info : {}) },
    ...(voiceFields ? voiceFields.extra : {}),
  };
  // MSC2530: with a caption, `body` is the caption and `filename` names the
  // file -- without it Element shows the caption as the file's name.
  if (caption && caption !== filename) content.filename = filename;
  // A caption gets the same WhatsApp-markup-to-HTML rendering as a message.
  if (caption && isMarkdownish(caption)) {
    content.format = 'org.matrix.custom.html';
    content.formatted_body = renderMarkdownToHtml(caption);
  }
  const eventId = await client.sendMessage(roomId, content);
  logOutbound(roomId, eventId, msgtype);
  return eventId;
}

async function sendDocument(to, filePath, filename, caption) {
  try {
    const buffer = fs.readFileSync(filePath);
    await uploadAndSend(to, buffer, guessMimeType(filename), filename, 'm.file', caption);
    return true;
  } catch (error) {
    logToFile('❌ Matrix: error sending document', { ...matrixErrorDetail(error) });
    return false;
  }
}

async function sendAudio(to, audioBuffer) {
  try {
    await uploadAndSend(to, audioBuffer, 'audio/mpeg', 'audio.mp3', 'm.audio', undefined, { voice: true });
    return true;
  } catch (error) {
    logToFile('❌ Matrix: error sending audio', { ...matrixErrorDetail(error) });
    return false;
  }
}

async function sendDocumentFromUrl(to, documentUrl, filename, caption) {
  try {
    const buffer = await resolveMediaBuffer(documentUrl);
    await uploadAndSend(to, buffer, guessMimeType(filename), filename, 'm.file', caption);
    return true;
  } catch (error) {
    logToFile('❌ Matrix: error sending document from URL', { ...matrixErrorDetail(error), documentUrl });
    return false;
  }
}

async function sendAudioFromUrl(to, audioUrl) {
  try {
    const buffer = await resolveMediaBuffer(audioUrl);
    await uploadAndSend(to, buffer, 'audio/mpeg', 'audio.mp3', 'm.audio', undefined, { voice: true });
    return true;
  } catch (error) {
    logToFile('❌ Matrix: error sending audio from URL', { ...matrixErrorDetail(error), audioUrl });
    return false;
  }
}

async function sendAudioFromUrlReturningId(to, audioUrl) {
  try {
    const buffer = await resolveMediaBuffer(audioUrl);
    const eventId = await uploadAndSend(to, buffer, 'audio/mpeg', 'audio.mp3', 'm.audio', undefined, { voice: true });
    return eventId || null;
  } catch (error) {
    logToFile('❌ Matrix: error sending audio from URL (returning id)', { ...matrixErrorDetail(error), audioUrl });
    return null;
  }
}

async function sendImageFromUrl(to, imageUrl, caption = '') {
  try {
    const buffer = await resolveMediaBuffer(imageUrl);
    const { mimeType, filename } = imageTypeFromUrl(imageUrl);
    await uploadAndSend(to, buffer, mimeType, filename, 'm.image', caption);
    return true;
  } catch (error) {
    logToFile('❌ Matrix: error sending image from URL', { ...matrixErrorDetail(error), imageUrl });
    return false;
  }
}

async function sendVideo(to, videoBuffer, tempDir, caption = '') {
  try {
    await uploadAndSend(to, videoBuffer, 'video/mp4', 'video.mp4', 'm.video', caption);
    return true;
  } catch (error) {
    logToFile('❌ Matrix: error sending video', { ...matrixErrorDetail(error) });
    return false;
  }
}

async function sendVideoFromUrl(to, videoUrl, caption = '') {
  try {
    const buffer = await resolveMediaBuffer(videoUrl);
    await uploadAndSend(to, buffer, 'video/mp4', 'video.mp4', 'm.video', caption);
    return true;
  } catch (error) {
    logToFile('❌ Matrix: error sending video from URL', { ...matrixErrorDetail(error), videoUrl });
    return false;
  }
}

async function sendImage(to, mediaIdOrPath, caption = '') {
  // fs.existsSync(), not a "contains a slash" heuristic -- a bare filename
  // with no directory component (e.g. a file in the process's own cwd) is a
  // perfectly real, existing local file, and a slash-based check would have
  // wrongly rejected it as "a Meta media ID" instead. existsSync() answers
  // the actual question ("is this a real file I can read") directly.
  if (!fs.existsSync(mediaIdOrPath)) {
    logToFile(
      '❌ Matrix: sendImage was given a Meta media ID (or a path that does not exist), not a real local file -- '
      + 'Matrix has no reusable media-ID upload step, so cached-ID reuse is not supported on this channel',
      { mediaIdOrPath }
    );
    return false;
  }
  try {
    const buffer = fs.readFileSync(mediaIdOrPath);
    await uploadAndSend(to, buffer, guessMimeType(mediaIdOrPath), path.basename(mediaIdOrPath), 'm.image', caption);
    return true;
  } catch (error) {
    logToFile('❌ Matrix: error sending image', { ...matrixErrorDetail(error) });
    return false;
  }
}

async function sendSticker(to, mediaIdOrPath) {
  // Same fs.existsSync() reasoning as sendImage above -- this single check
  // also replaces sendSticker's old separate "file not found" follow-up
  // check, which is now redundant.
  if (!fs.existsSync(mediaIdOrPath)) {
    logToFile(
      '❌ Matrix: sendSticker was given a Meta media ID (or a path that does not exist), not a real local file -- '
      + 'not supported on this channel',
      { mediaIdOrPath }
    );
    return false;
  }
  try {
    const buffer = fs.readFileSync(mediaIdOrPath);
    const roomId = await getRoomId(to);
    const client = await getClient();
    const mimeType = guessMimeType(mediaIdOrPath);
    const media = await uploadForRoom(client, roomId, buffer, mimeType, path.basename(mediaIdOrPath));
    const eventId = await client.sendEvent(roomId, 'm.sticker', {
      body: path.basename(mediaIdOrPath),
      ...media,
      info: { mimetype: mimeType, size: buffer.length },
    });
    logOutbound(roomId, eventId, 'sticker');
    return true;
  } catch (error) {
    logToFile('❌ Matrix: error sending sticker', { ...matrixErrorDetail(error) });
    return false;
  }
}

// ── Interactive surfaces -- text-flow degradation (same convention as Baileys) ─
// Matrix has no widely-supported native reply-keyboard/button concept, so
// these render as a numbered plain-text list (see this file's header comment)
// rather than a real component the way Discord's driver does.

function isRedundantDescription(title, description) {
  if (!description) return true;
  const t = String(title).trim().toLowerCase();
  const d = String(description).trim().toLowerCase();
  return d === t || d === `${t} language` || d.startsWith(t);
}

function exampleName(options) {
  const names = (options || [])
    .map((o) => String(o?.title || '').split('·').pop().trim())
    .filter((name) => name.length >= 1);
  if (!names.length) return 'English';
  return names.reduce((shortest, name) => (name.length < shortest.length ? name : shortest));
}

function renderOptionsAsText({ header, body, footer, options }) {
  const lines = [];
  if (header) lines.push(`**${header}**`);
  if (body) lines.push(body);
  lines.push('');
  options.forEach((opt, i) => {
    const gloss = isRedundantDescription(opt.title, opt.description) ? '' : ` -- ${opt.description}`;
    lines.push(`${i + 1}. ${opt.title}${gloss}`);
  });
  if (footer) { lines.push(''); lines.push(`_${footer}_`); }
  lines.push('');
  lines.push(`Reply with a number or the name -- e.g. "1" or "${exampleName(options)}".`);
  return lines.join('\n');
}

/**
 * Records the menu just rendered so the user's numeric/name reply can be
 * turned back into the interactive reply whatsapp-bot.js's router dispatches
 * on -- see pending-options.js. Best-effort: never let bookkeeping failure
 * block the send.
 */
async function rememberMenu(to, replyType, options) {
  const withIds = (options || []).filter((o) => o && o.id);
  if (!withIds.length) return;
  await pendingOptions.remember(String(to), {
    replyType,
    options: withIds.map((o) => ({ id: o.id, title: o.title })),
  });
  await notePromptRoom(to);
}

async function sendInteractiveButtons(to, options) {
  try {
    const { body, buttons } = options;
    const text = renderOptionsAsText({ body, options: buttons.map((b) => ({ title: b.title })) });
    await rememberMenu(to, 'button_reply', buttons);
    return await sendMessage(to, text);
  } catch (error) {
    logToFile('❌ Matrix: error sending interactive buttons (text fallback)', { ...matrixErrorDetail(error) });
    return false;
  }
}

async function sendImageWithButtons(to, imageUrl, bodyText, buttons) {
  try {
    const buffer = await resolveMediaBuffer(imageUrl);
    const caption = renderOptionsAsText({ body: bodyText, options: buttons.map((b) => ({ title: b.title })) });
    await rememberMenu(to, 'button_reply', buttons);
    const { mimeType, filename } = imageTypeFromUrl(imageUrl);
    await uploadAndSend(to, buffer, mimeType, filename, 'm.image', caption);
    return true;
  } catch (error) {
    logToFile('❌ Matrix: error sending image with buttons (text fallback)', { ...matrixErrorDetail(error), imageUrl });
    return false;
  }
}

async function sendInteractiveMessage(to, listData) {
  try {
    const { header, body, footer, action } = listData;
    const { sections, buttons } = action || {};
    // A Meta interactive is either a list (sections of rows) or reply buttons
    // ({type:'reply', reply:{id,title}}); both arrive here, and a reply to
    // buttons must come back as button_reply, as it would from Meta.
    const isButtons = !sections && Array.isArray(buttons);
    const options = isButtons
      ? buttons.map((b) => (b.reply ? { id: b.reply.id, title: b.reply.title } : b))
      : (sections || []).flatMap((s) => s.rows || []);
    const text = renderOptionsAsText({
      header: header?.text || header,
      body: body?.text || body,
      footer: footer?.text || footer,
      options,
    });
    await rememberMenu(to, isButtons ? 'button_reply' : 'list_reply', options);
    return await sendMessage(to, text);
  } catch (error) {
    logToFile('❌ Matrix: error sending interactive list (text fallback)', { ...matrixErrorDetail(error) });
    return false;
  }
}

const DEFAULT_PICKER_CODES = ['en', 'ur', 'pa-PK', 'sd-PK', 'ps-PK', 'bal-PK', 'ta-LK', 'ar', 'es'];

async function sendLanguageSelectionList(to, currentLanguage = 'en', region = null) {
  // eslint-disable-next-line global-require -- lazy, matching this file's other lazy convention
  const { LANGUAGES, SUPPORTED_LANGUAGES } = require('../../config/supported-languages');

  let codes = DEFAULT_PICKER_CODES;
  try {
    // eslint-disable-next-line global-require -- lazy: avoids a DB-backed service on module load
    const RegionFeaturesService = require('../region-features.service');
    const feats = await RegionFeaturesService.getRegionFeatures(region);
    const fromRegion = Array.isArray(feats.supported_languages)
      ? feats.supported_languages.filter((c) => SUPPORTED_LANGUAGES.includes(c))
      : [];
    if (fromRegion.length > 1) codes = fromRegion;
  } catch (error) {
    logToFile('Matrix language picker: region lookup failed, using default set', { error: error.message });
  }

  const rows = [
    { id: 'lang_auto', title: 'Auto-detect' },
    ...codes.map((code) => ({ id: `lang_${code}`, title: LANGUAGES[code]?.native || code })),
  ];

  return sendInteractiveMessage(to, {
    header: 'Select Language',
    body: 'Choose your preferred language. I will respond in this language for all conversations.',
    // Not "typing /language": Element eats the slash, and the bare-word
    // rewrite of that would read "by typing language".
    footer: 'Send "language" anytime to change this',
    action: { button: 'Languages', sections: [{ title: 'Available Languages', rows }] },
  });
}

const STYLE_OPTIONS = [
  { id: 'style_photorealistic', title: 'Photorealistic' },
  { id: 'style_infographic', title: 'Infographic' },
  { id: 'style_cartoon', title: 'Cartoon' },
  { id: 'style_sketch', title: 'Sketch' },
];

async function sendStyleListFallback(to) {
  return sendInteractiveMessage(to, {
    header: '🎨 Choose Video Style',
    action: { button: 'View Styles', sections: [{ title: 'Video Styles', rows: STYLE_OPTIONS }] },
  });
}

const FEATURE_MENU_OPTIONS = [
  { id: 'menu_lesson_plan', title: 'Lesson Plans' },
  { id: 'menu_coaching', title: 'Classroom Coaching' },
  { id: 'menu_reading', title: 'Reading Assessment' },
  { id: 'menu_video', title: 'AI Video Generation' },
  { id: 'menu_other', title: 'Ask Anything' },
];

async function sendFeatureMenuListFallback(to) {
  return sendInteractiveMessage(to, {
    header: "Here's what I can do!",
    action: { button: 'View Features', sections: [{ title: 'My Features', rows: FEATURE_MENU_OPTIONS }] },
  });
}

// Meta's own sendStyleCarousel/sendFeatureMenuCarousel fall back to exactly
// these list menus whenever the carousel template can't be sent (not approved,
// rate limited, any exception). A carousel template can never be sent on
// Matrix, so it goes straight to the same fallback. Returning false here (the
// old stub) left video-orchestrator.service.js's /video flow with no style
// menu at all -- it has no fallback of its own after sendStyleCarousel().
async function sendStyleCarousel(to) {
  return sendStyleListFallback(to);
}

async function sendFeatureMenuCarousel(to) {
  return sendFeatureMenuListFallback(to);
}

function notSupportedMessage(methodName) {
  return `Matrix channel driver: ${methodName}() has no equivalent yet -- it needs the channel-agnostic `
    + 'template registry from docs/onboarding/sandbox-production-design.md §1, which is not built. '
    + 'The template\'s static wording lives only in Meta\'s registered config, not in this call\'s arguments.';
}

// ── WhatsApp Flows, degraded to a conversation (same as Baileys) ─────────────
// Matrix has no form surface, so a Flow (reading assessment, class setup,
// attendance, settings, student videos) runs as the SAME registered text flow
// Baileys uses -- text-flow.js/text-flow-definitions.js, one question per
// message, answered by number or name. matrix-events.adapter.js feeds each
// reply back through textFlow.advance() and renders the next step via
// _sendTextFlowStep. Before this, sendFlow() returned false and e.g. /reading
// test surfaced to the teacher as "Sorry, something went wrong".

/** The Flow's kind from its token (`${userId}:${kind}:${timestamp}` by convention -- see baileys-channel.service.js). */
function kindFromToken(flowToken) {
  const parts = String(flowToken || '').split(':');
  return parts.length >= 2 ? parts[1] : null;
}

/** Sends one rendered text-flow step (menu -> numbered list; text/empty -> plain message). */
async function sendTextFlowStep(to, render) {
  await notePromptRoom(to);
  const { header, body, footer } = render.prompt || {};
  if (render.kind === 'menu') {
    return sendMessage(to, renderOptionsAsText({ header, body, footer, options: render.options }));
  }
  const lines = [];
  if (header) lines.push(`**${header}**`);
  if (body) lines.push(body);
  if (footer) lines.push(`_${footer}_`);
  return sendMessage(to, lines.join('\n\n') || 'Please reply to continue.');
}

/**
 * True whenever the teacher was given something actionable; false only when
 * no text flow is registered for this Flow, so the caller runs its own
 * fallback -- the exact contract baileys-channel.service.js#sendFlow documents.
 */
async function sendFlow(to, options = {}) {
  // eslint-disable-next-line global-require -- lazy: definitions pull in DB-backed services
  require('./text-flow-definitions').ensureRegistered();
  // eslint-disable-next-line global-require -- lazy, matching this file's other lazy requires
  const textFlow = require('./text-flow');

  const kind = options.flowKind || kindFromToken(options.flowToken);
  const definition = kind ? textFlow.getDefinition(kind) : null;
  if (!definition) {
    logToFile('Matrix channel driver: no text flow registered for this Flow -- falling back to the caller', {
      driver: 'matrix', flowKind: options.flowKind || null, derivedKind: kind,
    });
    return false;
  }

  const flowToken = options.flowToken || '';
  const context = { _ctx: { userId: flowToken.split(':')[0] || null, flowToken, phone: String(to) } };
  const render = await textFlow.start(String(to), kind, {}, context);
  if (!render) return false;

  await sendTextFlowStep(to, render);
  logToFile('▶️ Matrix: Flow degraded to a text flow', { channel: 'matrix', kind, step: render.kind });
  return true;
}

// ── Explicit method table ────────────────────────────────────────────────────
// Every parsed member (see MEMBERS above) must appear in exactly one of these
// two tables, checked by the assertion loop below.

const IMPLEMENTATIONS = {
  _removeEmotionTags: removeEmotionTags,
  sendMessage,
  sendReaction,
  showTypingIndicator,
  startContinuousTypingIndicator,
  getMediaInfo,
  downloadMedia,
  sendDocument,
  sendAudio,
  sendDocumentFromUrl,
  sendAudioFromUrl,
  sendTextReturningId,
  sendAudioFromUrlReturningId,
  sendImageFromUrl,
  sendVideo,
  sendVideoFromUrl,
  sendImage,
  sendSticker,
  sendInteractiveButtons,
  sendImageWithButtons,
  sendInteractiveMessage,
  sendLanguageSelectionList,
  sendStyleListFallback,
  sendFeatureMenuListFallback,
  sendStyleCarousel,
  sendFeatureMenuCarousel,
  sendFlow,
};

// name -> whether the real (Meta) method is async, so the stub shape matches.
const STUBS = {
  sendTemplate: true,
  buildStyleCarouselPayload: false,
  buildFeatureMenuCarouselPayload: false,
};

function asyncFalseStub(methodName) {
  return async function matrixStub(...args) {
    logToFile(notSupportedMessage(methodName), { methodName, driver: 'matrix' });
    return false;
  };
}

function syncNullStub(methodName) {
  return function matrixSyncStub(...args) {
    logToFile(notSupportedMessage(methodName), { methodName, driver: 'matrix' });
    return null;
  };
}

const MatrixChannel = {};

// ── Relay mode (worker processes) ────────────────────────────────────────────
// Methods that stay local even in relay mode: pure helpers, and the typing
// controller, which is synchronous and composes relayed calls itself.
const NEVER_RELAYED = new Set(['_removeEmotionTags', 'startContinuousTypingIndicator']);

/**
 * In a process that called matrix-outbound-relay.js#useRelayForThisProcess()
 * (the worker), a driver call is shipped to the bot process that owns the sync
 * connection instead of opening a second one here -- see that file's header.
 * Everywhere else this is the plain local implementation.
 */
function relayable(name, impl) {
  if (NEVER_RELAYED.has(name)) return impl;
  return function matrixMaybeRelayed(...args) {
    // eslint-disable-next-line global-require -- lazy: relay mode is decided at runtime, per process
    const relay = require('./matrix-outbound-relay');
    return relay.isRelayMode() ? relay.call(name, args) : impl(...args);
  };
}

// The real, local implementations the relay owner executes (the relay must
// never call back into the relay-wrapped versions).
const LOCAL_IMPLEMENTATIONS = { ...IMPLEMENTATIONS, _stopTypingIndicator: stopTypingIndicator };

for (const { name, isAsync } of MEMBERS) {
  if (Object.prototype.hasOwnProperty.call(IMPLEMENTATIONS, name)) {
    MatrixChannel[name] = relayable(name, IMPLEMENTATIONS[name]);
  } else if (Object.prototype.hasOwnProperty.call(STUBS, name)) {
    const stubIsAsync = STUBS[name];
    if (stubIsAsync !== isAsync) {
      throw new Error(
        `matrix-channel.service.js: "${name}" is registered as ${stubIsAsync ? 'async' : 'sync'} in STUBS but `
        + `meta-channel.service.js now declares it ${isAsync ? 'async' : 'sync'} -- update STUBS to match.`
      );
    }
    MatrixChannel[name] = stubIsAsync ? asyncFalseStub(name) : syncNullStub(name);
  } else {
    throw new Error(
      `matrix-channel.service.js: meta-channel.service.js declares "${name}" with no matching entry in `
      + 'IMPLEMENTATIONS or STUBS. Add one so this driver never silently lacks a method the rest of the bot calls.'
    );
  }
}

MatrixChannel._matrixUserId = matrixUserId;
MatrixChannel._cacheIncomingMedia = cacheIncomingMedia;
MatrixChannel._resolveDmRoomId = resolveDmRoomId;
// Consumed by matrix-events.adapter.js to render every text-flow step after the first.
MatrixChannel._sendTextFlowStep = sendTextFlowStep;
MatrixChannel._stopTypingIndicator = relayable('_stopTypingIndicator', stopTypingIndicator);
// Handed to matrix-outbound-relay.js#startOwner by matrix-events.adapter.js#attach.
MatrixChannel._localImplementations = LOCAL_IMPLEMENTATIONS;

module.exports = MatrixChannel;
