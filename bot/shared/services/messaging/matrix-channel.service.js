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
 * Identity: `to` always arrives as the full "matrix:<user_id>" identifier the
 * messaging router (messaging/index.js) dispatches by -- e.g.
 * "matrix:@teacher:example.org". Matrix user ids themselves contain a colon,
 * but channel-registry.js#driverForIdentifier only ever splits on the FIRST
 * colon, so this is unambiguous (see channel-registry.test.js).
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
const pendingOptions = require('./pending-options');

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

/** Strips the "matrix:" prefix the router hands every method -- never received bare. Result is a full "@user:server" Matrix user id (itself containing a colon). */
function matrixUserId(to) {
  const raw = String(to);
  const withPrefix = `${MATRIX_PREFIX}:`;
  return raw.startsWith(withPrefix) ? raw.slice(withPrefix.length) : raw;
}

// Media ids carry the same "matrix:" prefix as user identities, wrapping the
// mxc:// URI itself (e.g. "matrix:mxc://example.org/abc123") -- minted by
// matrix-events.adapter.js so the messaging router can tell an inbound Matrix
// attachment id apart from a WhatsApp media id with no DB lookup. Stripped
// here, once, before ever touching the media cache.
const stripMatrixPrefix = matrixUserId;

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

async function resolveDmRoomId(userId) {
  const client = await getClient();

  // Prefer the room the user's message ACTUALLY arrived in over anything
  // derived/cached -- see matrix-events.adapter.js's
  // "Reply-to-the-room-you-were-messaged-in" section header for the exact
  // bug this exists to fix: client.dms.getOrCreateDm() (below) reads the
  // 'm.direct' account-data map, which is asynchronous/eventually-consistent
  // and can race a genuine inbound message, creating a SECOND room and
  // sending the reply where the teacher never sees it (reproduced live).
  // Checked ahead of dmRoomCache too, since that cache could itself hold a
  // stale/duplicate room from exactly that race. Skipped when there's no
  // recorded room (a bot-initiated first contact, e.g. the welcome DM -- the
  // user has never sent a room.message yet) or the bot is no longer joined
  // to the recorded room (kicked/left since) -- both fall through to the
  // existing resolution below unchanged.
  // eslint-disable-next-line global-require -- lazy: avoids a require cycle at module load (the adapter requires this file too)
  const adapter = require('./inbound/matrix-events.adapter');
  const lastInboundRoomId = adapter.getLastInboundRoom(userId);
  if (lastInboundRoomId) {
    // eslint-disable-next-line global-require -- lazy, see file header
    const connection = require('./matrix-connection');
    if (connection.isJoinedToRoom(client, lastInboundRoomId)) {
      dmRoomCache.set(userId, lastInboundRoomId);
      return lastInboundRoomId;
    }
  }

  if (dmRoomCache.has(userId)) return dmRoomCache.get(userId);

  const storageKey = `${DM_ROOM_STORAGE_PREFIX}${userId}`;

  // Best-effort warm start straight from the storage provider -- skips a
  // client.dms account-data round trip on a fresh process. Never fatal: a
  // provider that doesn't implement storeValue/readValue (or a read that
  // fails) just falls through to the authoritative client.dms lookup below.
  try {
    const stored = await client.storageProvider?.readValue?.(storageKey);
    if (stored) {
      dmRoomCache.set(userId, stored);
      return stored;
    }
  } catch (error) {
    logToFile('Matrix: DM room cache read failed (non-fatal)', { error: error.message });
  }

  const roomId = await client.dms.getOrCreateDm(userId, (targetUserId) => createDmRoom(client, targetUserId));
  dmRoomCache.set(userId, roomId);
  try {
    await client.storageProvider?.storeValue?.(storageKey, roomId);
  } catch (error) {
    logToFile('Matrix: DM room cache write failed (non-fatal)', { error: error.message });
  }
  return roomId;
}

/** The room a send targets, resolved from the "matrix:<user_id>" identifier. */
async function getRoomId(to) {
  return resolveDmRoomId(matrixUserId(to));
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
};

function guessMimeType(filename) {
  return EXT_MIME_TYPES[path.extname(String(filename || '')).toLowerCase()] || 'application/octet-stream';
}

// ── Real implementations ─────────────────────────────────────────────────────

function removeEmotionTags(text) {
  return text.replace(/\[[a-zA-Z\s]+\]\s*/g, '').trim();
}

// A conservative "does this look like markdown" sniff -- bold/italic, a link,
// or a heading/list marker at the start of a line. Plain conversational text
// (the overwhelming majority of what Rumi sends) skips formatted_body
// entirely, so an ordinary reply doesn't carry redundant HTML.
const MARKDOWN_RE = /(\*\*[^*]+\*\*|__[^_]+__|\[[^\]]+\]\([^)]+\)|^#{1,3}\s|^[-*]\s|^\d+\.\s)/m;

function isMarkdownish(text) {
  return MARKDOWN_RE.test(text);
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * A deliberately minimal Markdown->HTML renderer -- bold, italic, links, and
 * newlines only, which is all Rumi's own message templates ever use. Not a
 * general-purpose Markdown engine (no new dependency for four regexes).
 */
function renderMarkdownToHtml(text) {
  let html = escapeHtml(text);
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  html = html.replace(/\n/g, '<br/>');
  return html;
}

function buildTextContent(rawText) {
  const text = removeEmotionTags(rawText);
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

async function showTypingIndicator(to) {
  try {
    const roomId = await getRoomId(to);
    const client = await getClient();
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
function startContinuousTypingIndicator(to) {
  let stopped = false;
  const tick = () => {
    if (stopped) return;
    showTypingIndicator(to).catch(() => {});
  };
  tick();
  const interval = setInterval(tick, 8000);
  return {
    stop: () => {
      stopped = true;
      clearInterval(interval);
      getRoomId(to)
        .then((roomId) => getClient().then((client) => client.setTyping(roomId, false, 0)))
        .catch(() => {});
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

async function downloadMedia(mediaId) {
  const info = await getMediaInfo(mediaId);
  const client = await getClient();
  const { data } = await client.downloadContent(info.url);
  return data;
}

/** Uploads a buffer to the homeserver's media repo, then sends it as the given msgtype. Returns the event id. */
async function uploadAndSend(to, buffer, mimeType, filename, msgtype, caption) {
  const roomId = await getRoomId(to);
  const client = await getClient();
  const mxcUrl = await client.uploadContent(buffer, mimeType, filename);
  const content = {
    msgtype,
    body: caption || filename,
    url: mxcUrl,
    info: { mimetype: mimeType, size: buffer.length },
  };
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
    await uploadAndSend(to, audioBuffer, 'audio/mpeg', 'audio.mp3', 'm.audio');
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
    await uploadAndSend(to, buffer, 'audio/mpeg', 'audio.mp3', 'm.audio');
    return true;
  } catch (error) {
    logToFile('❌ Matrix: error sending audio from URL', { ...matrixErrorDetail(error), audioUrl });
    return false;
  }
}

async function sendAudioFromUrlReturningId(to, audioUrl) {
  try {
    const buffer = await resolveMediaBuffer(audioUrl);
    const eventId = await uploadAndSend(to, buffer, 'audio/mpeg', 'audio.mp3', 'm.audio');
    return eventId || null;
  } catch (error) {
    logToFile('❌ Matrix: error sending audio from URL (returning id)', { ...matrixErrorDetail(error), audioUrl });
    return null;
  }
}

async function sendImageFromUrl(to, imageUrl, caption = '') {
  try {
    const buffer = await resolveMediaBuffer(imageUrl);
    await uploadAndSend(to, buffer, 'image/png', 'image.png', 'm.image', caption);
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
    const mxcUrl = await client.uploadContent(buffer, mimeType, path.basename(mediaIdOrPath));
    const eventId = await client.sendEvent(roomId, 'm.sticker', {
      body: path.basename(mediaIdOrPath),
      url: mxcUrl,
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
    await uploadAndSend(to, buffer, 'image/png', 'image.png', 'm.image', caption);
    return true;
  } catch (error) {
    logToFile('❌ Matrix: error sending image with buttons (text fallback)', { ...matrixErrorDetail(error), imageUrl });
    return false;
  }
}

async function sendInteractiveMessage(to, listData) {
  try {
    const { header, body, footer, action } = listData;
    const { sections } = action || {};
    const options = (sections || []).flatMap((s) => s.rows || []);
    const text = renderOptionsAsText({
      header: header?.text || header,
      body: body?.text || body,
      footer: footer?.text || footer,
      options,
    });
    await rememberMenu(to, 'list_reply', options);
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
    footer: 'You can change this anytime by typing /language',
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

function notSupportedMessage(methodName) {
  return `Matrix channel driver: ${methodName}() has no equivalent yet -- it needs the channel-agnostic `
    + 'template registry from docs/onboarding/sandbox-production-design.md §1, which is not built. '
    + 'The template\'s static wording lives only in Meta\'s registered config, not in this call\'s arguments.';
}

async function sendFlow() {
  logToFile('Matrix channel driver: sendFlow() has no direct equivalent -- Flow-shaped forms have no '
    + 'modal-workaround renderer built for this channel (unlike Discord\'s discord-modal-flow.js).');
  return false;
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
  sendFlow,
};

// name -> whether the real (Meta) method is async, so the stub shape matches.
const STUBS = {
  sendTemplate: true,
  sendStyleCarousel: true,
  sendFeatureMenuCarousel: true,
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

for (const { name, isAsync } of MEMBERS) {
  if (Object.prototype.hasOwnProperty.call(IMPLEMENTATIONS, name)) {
    MatrixChannel[name] = IMPLEMENTATIONS[name];
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

module.exports = MatrixChannel;
