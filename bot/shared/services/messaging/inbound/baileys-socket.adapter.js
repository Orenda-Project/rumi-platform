/**
 * Baileys inbound adapter — translates a Baileys `messages.upsert` event into
 * the same Meta-webhook-shaped payload bot/whatsapp-bot.js's
 * handleWebhookPost(req, res) already parses via
 * shared/utils/validators.js#validateWebhookMessage. This is the "give
 * Baileys a parallel entry path into the existing dispatch logic" piece from
 * docs/onboarding/sandbox-production-design.md §1 — a bounded extraction, not
 * a rewrite: nothing about handleWebhookPost's ~1000 lines of dispatch logic
 * changes; this file only ever calls it with a synthetic {req, res} pair.
 *
 * Coverage: text, image, audio/voice, and document messages map cleanly onto
 * Meta's shape and reach the real handlers (handleTextMessage,
 * handleVoiceMessage, handleImageMessage, handleDocumentMessage). Meta-only
 * interaction types (Flow submissions, interactive buttons/lists, carousel
 * button replies) have no Baileys equivalent and are never synthesized here —
 * those branches in handleWebhookPost simply never trigger under this
 * driver, the same way they wouldn't for any WhatsApp client that doesn't
 * support them.
 */

const { logToFile } = require('../../../utils/logger');
const connection = require('../baileys-connection');
const baileysChannel = require('../baileys-channel.service');
const pendingOptions = require('../pending-options');
const textFlow = require('../text-flow');

// A stable, non-test, non-zero entry id — passes validators.isTestWebhook().
const SYNTHETIC_ENTRY_ID = 'baileys-sandbox';

/**
 * Extracts the bare phone number from a WhatsApp JID.
 *
 * Strips BOTH the @server suffix and any `:device` suffix. The device part is
 * load-bearing, not theoretical: Baileys 7.x's lidMapping.getPNForLID() returns
 * a device-scoped JID like `923001234567:0@s.whatsapp.net`. Keeping the `:0`
 * corrupted everything downstream — it was stored as the user's phone_number,
 * and baileys-channel.service.js's toJid() (which strips non-digits) turned
 * `923001234567:0` into `9230012345670`, i.e. the real number with a trailing
 * zero: a nonexistent destination that Baileys still reports as "sent".
 */
function jidToPhoneNumber(jid) {
  return String(jid || '').split('@')[0].split(':')[0];
}

function isGroupOrStatusJid(jid) {
  return typeof jid === 'string' && (jid.endsWith('@g.us') || jid === 'status@broadcast');
}

function isLidJid(jid) {
  return typeof jid === 'string' && jid.endsWith('@lid');
}

// Process-local @lid -> phone-number cache, populated opportunistically from
// key.senderPn (which only some deliveries carry).
//
// Deliberately NOT persisted: Baileys 7.x owns LID<->phone mapping and writes
// its own lid-mapping-*.json files into the auth dir (a fresh pairing produced
// 700+), so resolveSenderPhoneNumberAsync() consults that authoritative store
// first. This map exists only to cover the gap before the native store has
// learned a mapping. An earlier hand-rolled lid-to-phone.json duplicated the
// library's own persistence and was removed once 7.x made it redundant.
const lidToPnCache = new Map();

/**
 * WhatsApp's phone-number-privacy rollout can address a 1:1 chat via an
 * opaque @lid JID instead of the sender's real phone-number JID. Treating the
 * LID's numeric id as a phone number breaks BOTH the DB user identity (a bogus
 * "phone number" is stored) and the reply itself — it goes to a JID that is
 * not a real device, so Baileys reports "sent" and nothing is ever delivered.
 *
 * Resolution order, best source first:
 *   1. Baileys' own LIDMappingStore (7.x) — the authoritative mapping, backed
 *      by the lid-mapping-*.json files the library persists itself. Async, so
 *      resolved via resolveSenderPhoneNumberAsync() on the dispatch path.
 *   2. key.senderPn, harvested opportunistically into lidToPnCache — present
 *      on only some deliveries, which is why it alone was never reliable.
 *   3. The raw LID digits, as a last resort so `from` is never empty.
 *
 * This sync variant covers 2 and 3; prefer the async one where possible.
 */
function resolveSenderPhoneNumber(waMessage) {
  const jid = waMessage.key?.remoteJid;
  if (!isLidJid(jid)) return jidToPhoneNumber(jid);

  rememberLidMapping(waMessage);
  return lidToPnCache.get(jid) || jidToPhoneNumber(jid);
}

/**
 * Preferred resolver: consults Baileys' native LIDMappingStore first.
 *
 * Baileys 7.x owns LID↔phone mapping properly (sock.signalRepository
 * .lidMapping, persisted as lid-mapping-*.json — a fresh pairing wrote 706 of
 * them). 6.7.23 had no such store, which is why this adapter originally had to
 * scrape key.senderPn and cache it by hand; that scraping is now only a
 * fallback for whatever the store hasn't learned yet.
 *
 * @param {object} waMessage
 * @param {object} [sock] the live socket; when absent, falls back to the sync path.
 */
async function resolveSenderPhoneNumberAsync(waMessage, sock) {
  const jid = waMessage.key?.remoteJid;
  if (!isLidJid(jid)) return jidToPhoneNumber(jid);

  rememberLidMapping(waMessage);

  const store = sock?.signalRepository?.lidMapping;
  if (store?.getPNForLID) {
    try {
      const pnJid = await store.getPNForLID(jid);
      const pn = jidToPhoneNumber(pnJid);
      if (pn && pn !== jidToPhoneNumber(jid)) {
        lidToPnCache.set(jid, pn);
        return pn;
      }
    } catch (error) {
      logToFile('⚠️ Baileys inbound: lidMapping.getPNForLID failed', { jid, error: error.message });
    }
  }

  return lidToPnCache.get(jid) || jidToPhoneNumber(jid);
}

/**
 * Records this delivery's @lid -> real-phone-number mapping if it carries one.
 *
 * Called for EVERY delivery — including ones we then skip (failed-decryption
 * stubs, our own echoes) — which is load-bearing, not defensive. A live test
 * caught the interaction: after a restart the cache is empty, and the
 * deliveries that DID carry sender_pn were exactly the ones that failed to
 * decrypt, so gating this behind hasDispatchableContent() starved the cache.
 * The successful retry then arrived with no senderPn, fell back to the LID,
 * and the reply went to a JID that is not a real device — Baileys reported
 * "sent" and the user received nothing.
 */
function rememberLidMapping(waMessage) {
  const jid = waMessage.key?.remoteJid;
  const senderPn = waMessage.key?.senderPn;
  if (!isLidJid(jid) || !senderPn) return;

  const pn = jidToPhoneNumber(senderPn);
  if (!pn || lidToPnCache.get(jid) === pn) return;

  lidToPnCache.set(jid, pn);
}

/** Test-only: clears the @lid -> phone-number cache between test runs. */
function _resetLidCacheForTests() {
  lidToPnCache.clear();
}

/**
 * Whether this message is one we'd actually dispatch — the SAME skip
 * conditions mapToMetaShape applies, but computed synchronously and with no
 * media download, so it can gate the dedup bookkeeping below. Kept as the one
 * shared source of truth (mapToMetaShape defers to it) so the two can't drift.
 * @param {import('baileys').WAMessage} waMessage
 */
function hasDispatchableContent(waMessage) {
  const jid = waMessage.key?.remoteJid;
  if (waMessage.key?.fromMe || isGroupOrStatusJid(jid) || !waMessage.message) return false;

  const content = waMessage.message;
  return Boolean(
    content.conversation
    || content.extendedTextMessage?.text
    || content.imageMessage
    || content.audioMessage
    || content.documentMessage
  );
}

// Live testing found Baileys occasionally redelivers the identical message
// (same key.id) via messages.upsert within under a second — observed twice,
// for both an image and a document, causing each to be fully processed (and
// replied to) twice. The pre-existing Redis-backed dedup in
// session.service.js has an inherent network round-trip race window (a SET
// from the first delivery may not yet be visible to the second delivery's
// GET); this catches the exact same redelivery synchronously and in-memory,
// before either delivery ever reaches that network round trip.
//
// Only ever called for messages that already passed
// hasDispatchableContent() — a second live run caught why that ordering is
// load-bearing: Baileys' first delivery attempt of a message can FAIL TO
// DECRYPT ("No matching sessions"), arriving with no usable content, and it
// then retries the same key.id once decryption succeeds. Recording the id on
// that contentless first attempt made the real, decrypted retry look like a
// duplicate, so the message was dropped and never processed at all.
const SEEN_MESSAGE_TTL_MS = 5 * 60 * 1000; // generous vs. the <1s redeliveries observed live
const seenMessageIds = new Map(); // messageId -> firstSeenAt

function isDuplicateDelivery(messageId) {
  if (!messageId) return false;
  const now = Date.now();
  for (const [id, seenAt] of seenMessageIds) {
    if (now - seenAt > SEEN_MESSAGE_TTL_MS) seenMessageIds.delete(id);
  }
  if (seenMessageIds.has(messageId)) return true;
  seenMessageIds.set(messageId, now);
  return false;
}

/** Test-only: clears the seen-message-id dedup cache between test runs. */
function _resetSeenMessagesForTests() {
  seenMessageIds.clear();
}

/**
 * Turns a numeric reply to a pending numbered menu into the interactive payload
 * Meta's native button/list picker would have sent, or null if this text isn't
 * a menu selection.
 *
 * The shapes below mirror exactly what whatsapp-bot.js reads —
 * `message.interactive.type` plus `.button_reply.id` / `.list_reply.id` (see
 * its branches at the `messageType === 'interactive'` checks) — so no dispatch
 * code has to change. The menu is cleared on a hit so the same "1" can't be
 * replayed against a menu that has already been answered.
 *
 * @param {string} from bare phone number
 * @param {string} text raw inbound text
 * @returns {Promise<object|null>} partial Meta message ({type, interactive}) or null
 */
async function toInteractiveSelection(from, text) {
  const menu = await pendingOptions.get(from);
  const selected = pendingOptions.resolveSelection(menu, text);
  if (!selected) return null;

  await pendingOptions.clear(from);
  logToFile('🔢 Baileys inbound: numeric reply resolved to an interactive selection', {
    from, replyType: menu.replyType, id: selected.id,
  });

  const reply = { id: selected.id, title: selected.title };
  return menu.replyType === 'button_reply'
    ? { type: 'interactive', interactive: { type: 'button_reply', button_reply: reply } }
    : { type: 'interactive', interactive: { type: 'list_reply', list_reply: reply } };
}

/**
 * Feeds text into the user's active text flow (the sandbox stand-in for a Meta
 * Flow form — see text-flow.js).
 *
 * MUST run before toInteractiveSelection(): a text flow records its menu in the
 * same pending-options store, so whichever runs first consumes the reply.
 *
 * @returns {Promise<null | {handled: true} | {metaMessage: object}>}
 *   null when there is no active flow (or the text didn't answer it), so the
 *   message continues to normal handling. {handled} when the flow consumed the
 *   reply and has already responded. {metaMessage} when the flow finished and
 *   produced a submission for the existing dispatch to route.
 */
/**
 * Whether this message is a command in its own right, and so must never be
 * consumed as an answer to a pending question.
 *
 * A "/" prefix is the easy case. The hard case is that several of this bot's
 * commands are plain phrases — "add class", "set up class", "attendance",
 * "حاضری" — and a FREE-TEXT step accepts literally any non-empty text. Live
 * result: typing "add class" while a class-setup flow was waiting for the roster
 * created a class whose only student was named "add class".
 *
 * The keyword lists are not duplicated here; the same detector the text handler
 * routes on is asked, so the two cannot drift.
 */
function isCommandLike(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('/')) return true;

  try {
    // eslint-disable-next-line global-require -- keeps this adapter's load light
    const detector = require('../../attendance-detector.service');
    if (detector.detectAddClassIntent(trimmed).detected) return true;
    if (detector.detectAttendanceIntent(trimmed).detected) return true;
  } catch (error) {
    logToFile('⚠️ Baileys inbound: command detection unavailable', { error: error.message });
  }
  return false;
}

async function advanceActiveTextFlow(from, text) {
  // A flow can outlive the process that started it (state is in Redis), so the
  // definitions must be present before advancing, not only before starting.
  // eslint-disable-next-line global-require -- lazy on purpose; see ensureRegistered()
  require('../text-flow-definitions').ensureRegistered();

  const result = await textFlow.advance(from, text);
  if (!result) return null;

  // A step handled here never reaches handleWebhookPost, so without this line a
  // mid-flow reply leaves no trace in the log at all — which makes a stuck flow
  // impossible to diagnose.
  logToFile('🧩 Baileys inbound: text-flow reply', {
    from, status: result.status, step: result.render?.kind || null,
  });

  if (result.status === 'cancelled') {
    await baileysChannel.sendMessage(from, 'Okay, cancelled. Type /menu to see what else I can do.');
    return { handled: true };
  }

  if (result.status === 'step') {
    await baileysChannel._sendTextFlowStep(from, result.render);
    return { handled: true };
  }

  // The flow ran out of options mid-way (the endpoint returned an error or no
  // rows). render.prompt.body carries the endpoint's own explanation.
  if (result.status === 'aborted') {
    await baileysChannel._sendTextFlowStep(from, result.render);
    return { handled: true };
  }

  if (result.status === 'complete') {
    const outcome = await result.definition.onComplete(from, result.answers, result.context);
    if (outcome?.text) await baileysChannel.sendMessage(from, outcome.text);
    // A navigate-style Flow's submission: hand the synthesised nfm_reply to the
    // normal dispatch so flow-response.handler.js runs exactly as it does on Meta.
    if (outcome?.metaMessage) return { metaMessage: outcome.metaMessage };
    return { handled: true };
  }

  // 'unmatched' — the reply didn't answer the question.
  //
  // First strike: re-ask. Mid-flow, an unrecognised reply is usually a failed
  // answer attempt, and quietly treating it as conversation leaves the user
  // unsure whether the flow is still waiting.
  //
  // Second consecutive strike: give up the flow and let the message through.
  // Not every command starts with "/" — "add class", "attendance" and
  // "register" are plain-text triggers that mid-flow look exactly like a wrong
  // answer, so an endlessly re-asking flow can trap the user in it. Two strikes
  // self-heals without this file needing to know the command vocabulary.
  if ((result.strikes || 0) >= 2) {
    await textFlow.clear(from);
    await pendingOptions.clear(from);
    logToFile('⏹️ Baileys inbound: text flow abandoned after repeated unmatched replies', { from });
    return null;
  }

  const state = await textFlow.getState(from);
  if (state) {
    const definition = textFlow.getDefinition(state.kind);
    const render = definition
      ? await textFlow.renderStep(from, definition, state.stepIndex, state.answers, state.context)
      : null;
    if (render) {
      await baileysChannel.sendMessage(
        from,
        "Sorry, I didn't catch that. Please pick one of these — or reply *cancel* to stop."
      );
      await baileysChannel._sendTextFlowStep(from, render);
      return { handled: true };
    }
  }
  return null;
}

/**
 * @param {import('baileys').WAMessage} waMessage
 * @param {(type: 'buffer', opts: object) => Promise<Buffer>} downloadMedia
 * @returns {Promise<{ metaMessage: object, mediaToCache: {id: string, buffer: Buffer, mimetype: string} | null } | null>}
 *   null when the message should be skipped entirely (no content, group/status chat, echo of our own send).
 */
async function mapToMetaShape(waMessage, downloadMediaMessage, sock) {
  if (!hasDispatchableContent(waMessage)) return null;

  const from = await resolveSenderPhoneNumberAsync(waMessage, sock);
  const id = waMessage.key.id;
  const timestamp = Number(waMessage.messageTimestamp) || Math.floor(Date.now() / 1000);
  const base = { from, id, timestamp };

  const content = waMessage.message;

  if (content.conversation || content.extendedTextMessage?.text) {
    const text = content.conversation || content.extendedTextMessage.text;

    // A command always wins over an in-progress text flow, so a user can never
    // get stuck: typing /menu (or "add class") mid-flow does what it says. The
    // abandoned flow is discarded rather than left pending, or the NEXT reply
    // (meant for whatever the command started) would be swallowed as its answer.
    if (isCommandLike(text)) {
      if (await textFlow.isActive(from)) {
        await textFlow.clear(from);
        await pendingOptions.clear(from);
        logToFile('⏹️ Baileys inbound: text flow abandoned for a slash command', { from, text: text.trim() });
      }
    } else {
      const flowed = await advanceActiveTextFlow(from, text);
      if (flowed?.metaMessage) {
        return { metaMessage: { ...base, ...flowed.metaMessage }, mediaToCache: null };
      }
      if (flowed?.handled) return null;
    }

    // A bare number answering a menu this driver just rendered is really an
    // interactive selection — synthesise the payload Meta's native button/list
    // picker would have produced, so whatsapp-bot.js's existing
    // `interactive.button_reply` / `list_reply` branches (33 ID families) handle
    // it unchanged. Without this the number falls through to general AI chat and
    // every numbered menu on this driver is unanswerable.
    const interactive = await toInteractiveSelection(from, text);
    if (interactive) return { metaMessage: { ...base, ...interactive }, mediaToCache: null };

    return { metaMessage: { ...base, type: 'text', text: { body: text } }, mediaToCache: null };
  }

  if (content.imageMessage) {
    const buffer = await downloadMediaMessage(waMessage, 'buffer', {});
    return {
      metaMessage: {
        ...base,
        type: 'image',
        image: { id, mime_type: content.imageMessage.mimetype, caption: content.imageMessage.caption || '' },
      },
      mediaToCache: { id, buffer, mimetype: content.imageMessage.mimetype },
    };
  }

  if (content.audioMessage) {
    const buffer = await downloadMediaMessage(waMessage, 'buffer', {});
    const isVoiceNote = !!content.audioMessage.ptt;
    return {
      metaMessage: { ...base, type: isVoiceNote ? 'voice' : 'audio', audio: { id, mime_type: content.audioMessage.mimetype } },
      mediaToCache: { id, buffer, mimetype: content.audioMessage.mimetype },
    };
  }

  if (content.documentMessage) {
    const buffer = await downloadMediaMessage(waMessage, 'buffer', {});
    return {
      metaMessage: {
        ...base,
        type: 'document',
        document: {
          id, mime_type: content.documentMessage.mimetype, filename: content.documentMessage.fileName || 'document',
        },
      },
      mediaToCache: { id, buffer, mimetype: content.documentMessage.mimetype },
    };
  }

  // Sticker, contact, location, reaction, poll, etc. — no Meta dispatch branch
  // handles these types today either; matches the "Unsupported message type"
  // catch-all handleWebhookPost already has.
  return null;
}

function buildSyntheticRequest(metaMessage) {
  return {
    body: {
      entry: [{
        id: SYNTHETIC_ENTRY_ID,
        changes: [{
          value: {
            messages: [metaMessage],
            metadata: {}, // no phone_number_id — validators.isOurPhoneNumber() auto-allows when absent
          },
        }],
      }],
    },
  };
}

function buildSyntheticResponse() {
  return {
    status(code) {
      return { send: (body) => logToFile('Baileys inbound: synthetic response', { code, body }) };
    },
  };
}

/**
 * @param {(req: object, res: object) => Promise<void>} dispatch  handleWebhookPost from whatsapp-bot.js
 */
async function attach(dispatch) {
  const { downloadMediaMessage } = await require('../baileys-lib').loadBaileys();
  const sock = await connection.getSocket();

  sock.ev.on('messages.upsert', async ({ messages }) => {
    for (const waMessage of messages) {
      try {
        // Harvest the @lid->phone mapping FIRST, from every delivery — the
        // ones carrying senderPn are often exactly the undecryptable stubs
        // skipped just below (see rememberLidMapping).
        rememberLidMapping(waMessage);

        // Order matters — see the seenMessageIds comment above. Skip
        // non-dispatchable deliveries (our own echoes, group chats, and
        // crucially the not-yet-decrypted first attempts Baileys retries)
        // WITHOUT recording the id, so a later decryptable retry of the same
        // key.id is still processed. Both the check and the mark are
        // synchronous with no await between them, so genuine concurrent
        // redeliveries can't both slip through.
        if (!hasDispatchableContent(waMessage)) continue;

        if (isDuplicateDelivery(waMessage.key?.id)) {
          logToFile('⚠️ Baileys inbound: duplicate delivery skipped', { messageId: waMessage.key?.id });
          continue;
        }

        const mapped = await mapToMetaShape(waMessage, downloadMediaMessage, sock);
        if (!mapped) continue;

        if (mapped.mediaToCache) {
          baileysChannel._cacheIncomingMedia(mapped.mediaToCache.id, mapped.mediaToCache.buffer, mapped.mediaToCache.mimetype);
        }

        const req = buildSyntheticRequest(mapped.metaMessage);
        const res = buildSyntheticResponse();
        await dispatch(req, res);
      } catch (error) {
        logToFile('❌ Baileys inbound: error processing message', { error: error.message, stack: error.stack });
      }
    }
  });

  logToFile('✅ Baileys inbound listener attached', {});
}

module.exports = {
  attach,
  mapToMetaShape,
  jidToPhoneNumber,
  resolveSenderPhoneNumber,
  resolveSenderPhoneNumberAsync,
  rememberLidMapping,
  hasDispatchableContent,
  isDuplicateDelivery,
  toInteractiveSelection,
  advanceActiveTextFlow,
  isCommandLike,
  _resetLidCacheForTests,
  _resetSeenMessagesForTests,
};
