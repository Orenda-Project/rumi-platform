/**
 * Matrix inbound adapter -- translates `room.message` sync events into the
 * same Meta-webhook-shaped payload bot/whatsapp-bot.js's handleWebhookPost(req, res)
 * already parses via shared/utils/validators.js#validateWebhookMessage.
 * Mirrors discord-events.adapter.js's/baileys-socket.adapter.js's role and
 * shape -- a parallel entry path into the existing ~1000-line dispatch logic,
 * not a rewrite of it.
 *
 * Matrix uses a persistent /sync loop (matrix-bot-sdk's own poll-and-emit
 * client, structurally like Baileys/Discord's Gateway) -- this adapter is a
 * long-lived event-emitter `attach(dispatch)` subscription, not an HTTP route
 * handler the way Slack's adapter is.
 *
 * `room.message` fires uniformly for BOTH plaintext and (once decrypted)
 * encrypted rooms -- matrix-bot-sdk's own MatrixClient re-emits it after a
 * successful decrypt (see its own MatrixClient.js processing loop), so this
 * file needs no separate encrypted-vs-plaintext branch. A message that FAILS
 * to decrypt fires `room.failed_decryption` instead, which this file only
 * logs (one line, no message body) -- there is nothing else to recover from a
 * lost Megolm session key on the bot's side.
 *
 * Identity: `from` is minted here, at the one place Matrix identities enter
 * the system, then carried unchanged through getOrCreateUserByChannel and
 * every downstream send. For a phone-number-shaped localpart (a teacher who
 * registered with "+" + their phone digits, e.g. "@+923360506129:example.org"
 * -- Synapse itself rejects a purely numeric localpart, but does accept a
 * leading "+"; a leading "t" is kept as a fallback form for accounts already
 * created that way) it is the short "mtx:<digits>" form (leading "+"/"t"
 * dropped, e.g. "mtx:923360506129"); for anything else it's the existing
 * prefixed "matrix:<user_id>" form, e.g. "matrix:@teacher:example.org". See
 * matrix-identity.js's header comment for why the short form exists (a
 * varchar(20) column several shared tables write this identity into), the
 * exact character budget behind the "mtx" prefix choice, and the "+" vs "t"
 * ambiguity this file resolves below by recording the REAL observed form the
 * moment an inbound message proves an account exists.
 *
 * Coverage: plain text messages, image/audio/video/document attachments
 * (mapped by msgtype), and a numbered-menu reply to a pending
 * sendInteractiveButtons/sendInteractiveMessage text-flow menu (see
 * pending-options.js) map onto Meta's shape and reach the real handlers
 * unchanged. There is no slash-command/button/select-interaction surface to
 * cover -- Matrix has none of Discord's Gateway interaction types; the
 * closest equivalent (a numbered-menu reply) is handled entirely through the
 * pending-options text-flow convention already used by Baileys.
 */

const { logToFile } = require('../../../utils/logger');
const { prefixFor } = require('../channel-registry');
const matrixIdentity = require('../matrix-identity');
const pendingOptions = require('../pending-options');

const MATRIX_PREFIX = prefixFor('matrix');
// A stable, non-test, non-zero entry id -- passes validators.isTestWebhook().
const SYNTHETIC_ENTRY_ID = 'matrix-sync';

/**
 * Mints the identity `from` carries for a Matrix sender. Delegates to
 * matrix-identity.js#encodeIdentity -- see that file's header comment for the
 * short ("mtx:<digits>") vs. long ("matrix:@user:server") form and why.
 *
 * For a phone-shaped account, this is also the ONE place the real "+"/"t"
 * localpart form is ever directly observed (this inbound message proves the
 * account exists), so it's recorded here via
 * matrix-channel.service.js#_rememberPhoneLocalpart -- fire-and-forget
 * (best-effort, matches every other account-data/cache write in this file);
 * this function stays synchronous, returning the identity string immediately,
 * same as before.
 */
function toPrefixedIdentity(userId) {
  const identity = matrixIdentity.encodeIdentity(userId, { logToFile });
  if (identity.startsWith(`${matrixIdentity.SHORT_PREFIX}:`)) {
    const parsed = matrixIdentity.splitUserId(userId);
    if (parsed) {
      // eslint-disable-next-line global-require -- lazy: avoids a require cycle at module load
      const matrixChannel = require('../matrix-channel.service');
      if (typeof matrixChannel._rememberPhoneLocalpart === 'function') {
        matrixChannel
          ._rememberPhoneLocalpart(matrixIdentity.phoneDigitsFromLocalpart(parsed.localpart), parsed.localpart)
          .catch((error) => logToFile('Matrix: failed to remember phone localpart (non-fatal)', { error: error.message }));
      }
    }
  }
  return identity;
}

// Media ids need the same "matrix:" prefix as user identities -- messaging/index.js's
// router (channel-registry.js#driverForIdentifier) dispatches getMediaInfo/downloadMedia
// calls by inspecting the id argument itself for a channel prefix. A bare mxc:// URI has
// no LEADING colon before its own "mxc:" scheme is considered -- driverForIdentifier
// splits on the first colon, so an unprefixed "mxc://..." would be misread as a
// (nonexistent) "mxc" driver rather than falling through cleanly, which is exactly why
// this prefix is required, not just consistent style.
function toPrefixedMediaId(mxcUrl) {
  return `${MATRIX_PREFIX}:${mxcUrl}`;
}

const IMAGE_MSGTYPE = 'm.image';
const AUDIO_MSGTYPE = 'm.audio';
const VIDEO_MSGTYPE = 'm.video';
const FILE_MSGTYPE = 'm.file';

/**
 * Maps an m.image/m.audio/m.video/m.file message's content into a Meta-shaped
 * media message -- mirrors discord-events.adapter.js#mapAttachmentToMetaShape
 * for the same four types. Only metadata (url/mimetype/size) is cached, not a
 * downloaded buffer -- matrix-channel.service.js#downloadMedia fetches the
 * mxc:// URI lazily, on demand, the same "cache the description, not the
 * bytes" reasoning as Discord's attachment cache.
 *
 * @param {string} from prefixed sender identity
 * @param {string} id the m.room.message event id
 * @param {number} timestamp unix seconds
 * @param {object} content the m.room.message event's `content`
 * @returns {object|null} Meta-shaped message, or null to skip
 */
function mapAttachmentToMetaShape(from, id, timestamp, content) {
  // In an E2EE room the attachment itself is encrypted too: the event carries
  // `content.file` (an EncryptedFile -- its own mxc url plus the AES key/iv/
  // hashes needed to decrypt it) and NO top-level `content.url`. Every
  // attachment Element/Element X sends into an encrypted DM is this shape, so
  // reading only `content.url` silently dropped every image and voice note a
  // teacher sent from the app. The EncryptedFile is cached alongside the url
  // so matrix-channel.service.js#downloadMedia can decrypt on demand.
  const encryptedFile = content.file && content.file.url ? content.file : null;
  const mxcUrl = content.url || encryptedFile?.url;
  if (!mxcUrl) return null; // a malformed media event has nothing to fetch

  // eslint-disable-next-line global-require -- lazy: avoids a require cycle at module load
  const matrixChannel = require('../matrix-channel.service');
  const mediaId = toPrefixedMediaId(mxcUrl);
  const mimeType = content.info?.mimetype || 'application/octet-stream';
  const fileSize = content.info?.size;

  matrixChannel._cacheIncomingMedia(mediaId, {
    url: mxcUrl,
    mime_type: mimeType,
    file_size: fileSize,
    ...(encryptedFile ? { file: encryptedFile } : {}),
  });

  const base = { from, id, timestamp };
  if (content.msgtype === AUDIO_MSGTYPE) {
    return { ...base, type: 'audio', audio: { id: mediaId, mime_type: mimeType } };
  }
  if (content.msgtype === IMAGE_MSGTYPE) {
    return { ...base, type: 'image', image: { id: mediaId, mime_type: mimeType, caption: captionOf(content) } };
  }
  if (content.msgtype === VIDEO_MSGTYPE) {
    return { ...base, type: 'video', video: { id: mediaId, mime_type: mimeType, caption: captionOf(content) } };
  }
  // FILE_MSGTYPE and anything else self-describing enough to carry a url --
  // matches Meta's default-to-document fallback, same as Discord's adapter.
  return {
    ...base, type: 'document',
    document: { id: mediaId, mime_type: mimeType, filename: content.filename || content.body || 'file' },
  };
}

// A bare filename with a media extension and no spaces ("IMG_2031.jpg").
const FILENAME_ONLY_RE = /^[^\s/\\]+\.(jpe?g|png|gif|webp|heic|heif|bmp|tiff?|mp4|mov|webm|3gp|mkv)$/i;

/**
 * The user's caption for an image/video, or '' when there is none.
 *
 * Matrix puts the FILENAME in `body` when a user sends a picture with no
 * caption (the spec's original meaning of `body`); a real caption only exists
 * when the newer `filename` field is present and differs from `body`
 * (MSC2530, what Element X sends). WhatsApp's `image.caption` is empty in that
 * case, and the image handler treats a caption as the teacher's instruction,
 * so passing "IMG_2031.jpg" through as a caption would steer the reply.
 */
function captionOf(content) {
  const body = content.body || '';
  if (content.filename) return body && body !== content.filename ? body : '';
  return FILENAME_ONLY_RE.test(body.trim()) ? '' : body;
}

/**
 * Resolves a numbered/named reply to a pending sendInteractiveButtons/
 * sendInteractiveMessage menu into the Meta interactive shape the existing
 * dispatch logic already reads -- the exact mechanism baileys-socket.adapter.js
 * uses (see its own toInteractiveSelection), reused here via the SAME
 * pending-options store (matrix-channel.service.js writes it under the
 * prefixed "matrix:<user_id>" identity, so the key matches on both sides).
 *
 * @param {string} from prefixed sender identity
 * @param {string} text raw inbound text
 * @returns {Promise<object|null>} partial Meta message ({type, interactive}), or null if this text isn't a menu selection
 */
async function toInteractiveSelection(from, text) {
  const menu = await pendingOptions.get(from);
  const selected = pendingOptions.resolveSelection(menu, text);
  if (!selected) return null;

  await pendingOptions.clear(from);
  logToFile('🔢 Matrix inbound: numeric/named reply resolved to an interactive selection', {
    from, replyType: menu.replyType, id: selected.id,
  });

  const reply = { id: selected.id, title: selected.title };
  return menu.replyType === 'button_reply'
    ? { type: 'interactive', interactive: { type: 'button_reply', button_reply: reply } }
    : { type: 'interactive', interactive: { type: 'list_reply', list_reply: reply } };
}

/**
 * Maps a matrix-bot-sdk `room.message` event into Meta's message shape, or
 * null to skip. Skips the bot's own messages (echoes -- matrix-bot-sdk's own
 * sync includes every event in a room the bot is in, including ones it just
 * sent) and anything older than the adapter's own attach() time (a
 * SimpleFsStorageProvider-persisted sync token can replay a backlog on
 * restart; those events already got their chance to be handled by whichever
 * process was running when they first arrived).
 *
 * @param {string} roomId
 * @param {object} event the raw m.room.message event
 * @param {string} ownUserId the bot's own Matrix user id (unprefixed)
 * @param {number} startedAt Date.now() at attach() time, in ms
 * @returns {Promise<object|null>}
 */
async function mapMessageToMetaShape(roomId, event, ownUserId, startedAt) {
  if (!event || !event.sender || !event.content) return null;
  if (ownUserId && event.sender === ownUserId) return null;
  if (typeof event.origin_server_ts === 'number' && event.origin_server_ts < startedAt) return null;

  // Ground truth for "which room does a reply to this user go to" -- see
  // this file's "Reply-to-the-room-you-were-messaged-in" section header for
  // the crash/misdelivery this fixes. Recorded for every real inbound event,
  // not just ones that end up dispatched, so it reflects the room as
  // accurately as possible.
  recordInboundRoom(event.sender, roomId);

  const from = toPrefixedIdentity(event.sender);
  const id = event.event_id;
  const timestamp = Math.floor((event.origin_server_ts || Date.now()) / 1000);
  const content = event.content;

  if ([IMAGE_MSGTYPE, AUDIO_MSGTYPE, VIDEO_MSGTYPE, FILE_MSGTYPE].includes(content.msgtype)) {
    return mapAttachmentToMetaShape(from, id, timestamp, content);
  }

  if (content.msgtype !== 'm.text' || !content.body) return null; // m.notice/m.emote/etc. are not user-authored chat turns

  // A numbered/named reply to a pending menu MUST be checked before falling
  // through to plain text -- same ordering rule as baileys-socket.adapter.js
  // (the menu lives in the same pending-options store either driver could
  // have written it to).
  const interactive = await toInteractiveSelection(from, content.body);
  if (interactive) return { from, id, timestamp, ...interactive };

  return { from, id, timestamp, type: 'text', text: { body: content.body } };
}

// Matrix's own sync can redeliver an event on a reconnect edge case -- the
// same redelivery class both other adapters guard against, same fix shape:
// an in-memory, TTL'd seen-id set checked synchronously before any async work.
const SEEN_ID_TTL_MS = 5 * 60 * 1000;
const seenIds = new Map(); // event id -> firstSeenAt

function isDuplicateDelivery(id) {
  if (!id) return false;
  const now = Date.now();
  for (const [seenId, seenAt] of seenIds) {
    if (now - seenAt > SEEN_ID_TTL_MS) seenIds.delete(seenId);
  }
  if (seenIds.has(id)) return true;
  seenIds.set(id, now);
  return false;
}

/** Test-only: clears the seen-id dedup cache between test runs. */
function _resetSeenIdsForTests() {
  seenIds.clear();
}

// ── Reply-to-the-room-you-were-messaged-in ───────────────────────────────────
// The outbound identity a reply is addressed to is only "matrix:<user_id>" --
// there's no room in it -- so matrix-channel.service.js has to RESOLVE a room
// for that user, and its existing resolution (client.dms.getOrCreateDm(),
// backed by the 'm.direct' account-data map) is asynchronous/eventually-
// consistent. That resolution can race a genuine inbound message: a user
// invites the bot into a fresh DM and asks a question in the SAME beat that
// account data is still catching up, getOrCreateDm() sees no cached room yet,
// and creates a SECOND, empty room -- the reply lands somewhere the user
// never sees (reproduced live: a teacher's question in
// "!ljKfozcoLYAVQKuxMM:..." got a reply in a brand-new
// "!zskAHVYNfwWVYrUSpl:..." nobody else had joined).
//
// Fix: remember, per sender, the room their MOST RECENT inbound message
// actually arrived in -- ground truth, no account-data round trip involved --
// and let matrix-channel.service.js#resolveDmRoomId prefer it over
// getOrCreateDm() whenever the bot is still joined to that room (see
// matrix-connection.js#isJoinedToRoom). Falls back to the existing
// getOrCreateDm() path when there's no recorded room at all -- the welcome-DM
// path (a bot-initiated first contact; the user has never sent a room.message
// yet) is exactly that case, and is therefore unaffected by this map.
//
// Bounded so a long-running process can't grow this without limit: entries
// older than LAST_INBOUND_ROOM_TTL_MS are pruned opportunistically on every
// write, and if the map is still over LAST_INBOUND_ROOM_MAX_ENTRIES afterward
// the least-recently-touched entries are evicted (Map iteration is insertion
// order, and recordInboundRoom() re-inserts on every touch, so the first keys
// in iteration order are always the stalest).
const LAST_INBOUND_ROOM_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours -- generous for a same-day conversation, not "forever"
const LAST_INBOUND_ROOM_MAX_ENTRIES = 5000;
const lastInboundRoomByUser = new Map(); // unprefixed matrix user id -> { roomId, ts }

function pruneLastInboundRoom() {
  const now = Date.now();
  for (const [userId, entry] of lastInboundRoomByUser) {
    if (now - entry.ts > LAST_INBOUND_ROOM_TTL_MS) lastInboundRoomByUser.delete(userId);
  }
  if (lastInboundRoomByUser.size > LAST_INBOUND_ROOM_MAX_ENTRIES) {
    let excess = lastInboundRoomByUser.size - LAST_INBOUND_ROOM_MAX_ENTRIES;
    for (const userId of lastInboundRoomByUser.keys()) {
      if (excess-- <= 0) break;
      lastInboundRoomByUser.delete(userId);
    }
  }
}

/**
 * Records that `userId`'s most recent inbound message arrived in `roomId` --
 * called from mapMessageToMetaShape() for every real (non-echo, non-backlog)
 * inbound event, regardless of msgtype, since even an unsupported message
 * type is still evidence of "this is where the user is talking to us".
 *
 * @param {string} userId unprefixed matrix user id (event.sender)
 * @param {string} roomId
 */
function recordInboundRoom(userId, roomId) {
  if (!userId || !roomId) return;
  // Delete-then-set (rather than a plain set on an existing key) so a
  // re-touched entry moves to the END of Map iteration order -- keeps
  // pruneLastInboundRoom()'s "first keys are stalest" assumption true even
  // for a user who messages the bot repeatedly.
  lastInboundRoomByUser.delete(userId);
  lastInboundRoomByUser.set(userId, { roomId, ts: Date.now() });
  pruneLastInboundRoom();
}

/**
 * @param {string} userId unprefixed matrix user id
 * @returns {string|null} the room `userId`'s most recent inbound message
 *   arrived in, or null if there's no (or an expired) recorded entry.
 */
function getLastInboundRoom(userId) {
  const entry = lastInboundRoomByUser.get(userId);
  if (!entry) return null;
  if (Date.now() - entry.ts > LAST_INBOUND_ROOM_TTL_MS) {
    lastInboundRoomByUser.delete(userId);
    return null;
  }
  return entry.roomId;
}

/** Test-only: clears the last-inbound-room map between test runs. */
function _resetLastInboundRoomForTests() {
  lastInboundRoomByUser.clear();
}

/** Test-only: the map's current size, to assert the bound actually holds. */
function _lastInboundRoomSizeForTests() {
  return lastInboundRoomByUser.size;
}

function buildSyntheticRequest(metaMessage) {
  return {
    body: {
      entry: [{
        id: SYNTHETIC_ENTRY_ID,
        changes: [{
          value: {
            messages: [metaMessage],
            metadata: {}, // no phone_number_id -- validators.isOurPhoneNumber() auto-allows when absent
          },
        }],
      }],
    },
  };
}

function buildSyntheticResponse() {
  return {
    status(code) {
      return { send: (body) => logToFile('Matrix inbound: synthetic response', { code, body }) };
    },
  };
}

// ── New-account welcome DM ───────────────────────────────────────────────────
// Element Web removed `welcome_user_id` (the client-side "auto-open a DM with
// the bot for a new account" feature), so this placement is now server-side:
// the homeserver's own `auto_join_rooms` config drops every new account into
// a shared announcements room (MATRIX_WELCOME_ROOM_ALIAS, defaulting to
// "#rumi-announcements:<the bot's own server name>"), and THIS adapter is
// what notices a fresh join there and opens a real 1:1 DM in response -- the
// server-side equivalent of the removed client feature.
//
// A user inviting the BOT into a DM (rather than the bot reaching out first)
// needs no equivalent: AutojoinRoomsMixin (see matrix-connection.js) already
// accepts that invite unconditionally, and no welcome message is sent because
// the user is the one who initiated contact.
const WELCOME_MESSAGE = "Hi, we're glad you're here. This is your space with Rumi. Ask us anything about "
  + "your class, your lessons, or your day. You're not teaching alone.";
const GREETED_STORAGE_PREFIX = 'rumi:matrix:welcomed:';

// Account data lives on the HOMESERVER, keyed to the bot's own account, not
// to any one process's local MATRIX_STORAGE_DIR -- this is what makes it the
// source of truth. The local storageProvider marker above is kept purely as
// a same-process fast path (skip a network round trip for a user this
// process has already checked); a FRESH process with a fresh/empty storage
// dir (a real deploy scenario: a redeploy, a new box, a wiped volume) has no
// local cache at all and MUST fall back to this account-data read before
// concluding "never greeted" -- storage-dir-only tracking re-greeted an
// already-greeted user in exactly that scenario (caught live).
const GREETED_ACCOUNT_DATA_TYPE = 'org.rumi.messenger.greeted';

/** "#rumi-announcements:<server>", derived from the bot's own user id -- no separate env var needed unless overridden. */
function defaultWelcomeRoomAlias(ownUserId) {
  const server = String(ownUserId || '').split(':')[1];
  return server ? `#rumi-announcements:${server}` : null;
}

/**
 * The full { userId: true, ... } greeted map from account data, or {} if
 * none has ever been written (a real M_NOT_FOUND, expected the very first
 * time) or the read otherwise failed (logged, non-fatal -- see caller).
 */
async function fetchGreetedMap(client) {
  try {
    const data = await client.getAccountData(GREETED_ACCOUNT_DATA_TYPE);
    return data && typeof data === 'object' ? data : {};
  } catch (error) {
    if (error?.body?.errcode !== 'M_NOT_FOUND' && error?.statusCode !== 404) {
      logToFile('Matrix: welcome-DM greeted account-data read failed (non-fatal, falls back to local cache only)', {
        error: error.message,
      });
    }
    return {};
  }
}

/**
 * Source of truth is the homeserver account data; the local storage
 * provider is only a same-process speed-up, checked first because it's a
 * disk read vs. a network round trip, never trusted on its own to say "no".
 */
async function hasBeenGreeted(client, userId) {
  try {
    const stored = await client.storageProvider?.readValue?.(`${GREETED_STORAGE_PREFIX}${userId}`);
    if (stored) return true;
  } catch (error) {
    logToFile('Matrix: welcome-DM local greeted-check failed (non-fatal, falling back to account data)', { error: error.message });
  }

  const map = await fetchGreetedMap(client);
  if (!map[userId]) return false;

  // Backfill the local cache so THIS process doesn't hit the network again
  // for the same user on a later join event.
  try {
    await client.storageProvider?.storeValue?.(`${GREETED_STORAGE_PREFIX}${userId}`, '1');
  } catch (error) {
    logToFile('Matrix: welcome-DM local cache backfill failed (non-fatal)', { error: error.message });
  }
  return true;
}

/** Write-through: local cache (speed) AND homeserver account data (source of truth, survives a fresh storage dir). */
async function markGreeted(client, userId) {
  try {
    await client.storageProvider?.storeValue?.(`${GREETED_STORAGE_PREFIX}${userId}`, '1');
  } catch (error) {
    logToFile('Matrix: welcome-DM local greeted-write failed (non-fatal)', { error: error.message });
  }

  try {
    const map = await fetchGreetedMap(client);
    map[userId] = true;
    await client.setAccountData(GREETED_ACCOUNT_DATA_TYPE, map);
  } catch (error) {
    logToFile('Matrix: welcome-DM greeted account-data write failed (non-fatal, may re-greet on a fresh process)', {
      error: error.message,
    });
  }
}

/**
 * Opens (or reuses) a real 1:1 DM with a newly-joined user and sends the one
 * warm welcome message, via the SAME driver method (and therefore the same
 * user->DM-room resolution/creation/cache logic) an ordinary outbound Rumi
 * reply uses -- not a hand-rolled room-creation path here.
 */
async function sendWelcomeDm(client, userId) {
  // eslint-disable-next-line global-require -- lazy: avoids a require cycle at module load
  const matrixChannel = require('../matrix-channel.service');
  const sent = await matrixChannel.sendMessage(toPrefixedIdentity(userId), WELCOME_MESSAGE);
  if (sent) {
    const roomId = await matrixChannel._resolveDmRoomId(userId);
    logToFile('Matrix: sent new-account welcome DM', { channel: 'matrix', event: 'welcome_dm', userId, roomId });
    await markGreeted(client, userId);
  }
  return sent;
}

/**
 * Reacts to an `m.room.member` join in the welcome room. Only ever fires the
 * welcome DM once per user (source of truth is homeserver account data, see
 * hasBeenGreeted/markGreeted above -- survives not just a restart but a
 * FRESH process with an empty MATRIX_STORAGE_DIR) and never for the bot's
 * own membership event.
 *
 * @param {object} client the matrix-bot-sdk MatrixClient
 * @param {string} welcomeRoomId the resolved (not alias) welcome room id
 * @param {string} roomId the room this event actually happened in
 * @param {object} event the raw room.event payload
 * @param {string} ownUserId the bot's own Matrix user id
 */
async function handleWelcomeRoomJoin(client, welcomeRoomId, roomId, event, ownUserId) {
  if (!welcomeRoomId || roomId !== welcomeRoomId) return;
  if (!event || event.type !== 'm.room.member' || event.content?.membership !== 'join') return;
  const userId = event.state_key;
  if (!userId || userId === ownUserId) return;
  if (await hasBeenGreeted(client, userId)) return;
  await sendWelcomeDm(client, userId);
}

/**
 * Attaches every sync listener this bot needs onto the shared client
 * matrix-connection.js owns. Mirrors discord-events.adapter.js's/
 * baileys-socket.adapter.js's attach() shape: a long-lived subscription, not
 * a per-request handler.
 *
 * @param {(req: object, res: object) => Promise<void>} dispatch  handleWebhookPost from whatsapp-bot.js
 */
async function attach(dispatch) {
  const connection = require('../matrix-connection');
  const client = await connection.getClient();

  const startedAt = Date.now();
  let ownUserId = connection.getCachedUserId();
  if (!ownUserId) {
    try {
      ownUserId = await client.getUserId();
    } catch (error) {
      logToFile('⚠️ Matrix inbound: could not resolve own user id -- echo-skipping will not work', { error: error.message });
    }
  }

  client.on('room.message', async (roomId, event) => {
    try {
      if (isDuplicateDelivery(event?.event_id)) {
        logToFile('⚠️ Matrix inbound: duplicate event delivery skipped', { eventId: event?.event_id });
        return;
      }
      const metaMessage = await mapMessageToMetaShape(roomId, event, ownUserId, startedAt);
      if (!metaMessage) return;

      await dispatch(buildSyntheticRequest(metaMessage), buildSyntheticResponse());
    } catch (error) {
      logToFile('❌ Matrix inbound: error processing message', { error: error.message, stack: error.stack });
    }
  });

  // Resolving the welcome-room alias is best-effort and non-fatal: a
  // deployment that hasn't set up the homeserver-side auto_join_rooms room
  // yet (or has the feature disabled entirely) must not lose ordinary
  // messaging over it -- it just runs with no welcome-DM behavior.
  const welcomeAlias = process.env.MATRIX_WELCOME_ROOM_ALIAS || defaultWelcomeRoomAlias(ownUserId);
  let welcomeRoomId = null;
  if (welcomeAlias) {
    try {
      try {
        await client.joinRoom(welcomeAlias); // no-op if already joined
      } catch (error) {
        logToFile('Matrix inbound: joinRoom on the welcome alias failed (may already be joined)', { alias: welcomeAlias, error: error.message });
      }
      welcomeRoomId = await client.resolveRoom(welcomeAlias);
    } catch (error) {
      logToFile('⚠️ Matrix inbound: could not resolve the welcome room alias -- new-account welcome DM disabled', {
        alias: welcomeAlias, error: error.message,
      });
    }
  }

  if (welcomeRoomId) {
    // `room.event` (not `room.join`, which only fires for the BOT's own
    // membership) is the only event matrix-bot-sdk emits for another user's
    // m.room.member state change -- see this file's header comment on
    // `room.message` for the same "read the SDK source, don't guess" rule.
    client.on('room.event', async (roomId, event) => {
      try {
        await handleWelcomeRoomJoin(client, welcomeRoomId, roomId, event, ownUserId);
      } catch (error) {
        logToFile('❌ Matrix inbound: error handling a welcome-room join', { error: error.message, stack: error.stack });
      }
    });
  }

  // No message body logged -- teacher privacy -- just enough to know decryption
  // is failing and for which room/event, so a stuck Megolm session is
  // diagnosable from the log alone.
  client.on('room.failed_decryption', (roomId, event, error) => {
    logToFile('⚠️ Matrix inbound: failed to decrypt an event -- skipping', {
      channel: 'matrix', direction: 'inbound', roomId, eventId: event?.event_id, error: error?.message,
    });
  });

  logToFile('✅ Matrix inbound listener attached', { welcomeRoomId });
}

module.exports = {
  attach,
  mapMessageToMetaShape,
  mapAttachmentToMetaShape,
  toInteractiveSelection,
  toPrefixedIdentity,
  toPrefixedMediaId,
  isDuplicateDelivery,
  handleWelcomeRoomJoin,
  defaultWelcomeRoomAlias,
  _resetSeenIdsForTests,
  // Consumed by matrix-channel.service.js#resolveDmRoomId -- see this file's
  // "Reply-to-the-room-you-were-messaged-in" section header.
  getLastInboundRoom,
  recordInboundRoom,
  _resetLastInboundRoomForTests,
  _lastInboundRoomSizeForTests,
};
