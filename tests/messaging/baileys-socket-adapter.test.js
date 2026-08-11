/**
 * baileys-socket.adapter.js — translates a Baileys WAMessage into the same
 * shape validators.js#validateWebhookMessage produces from a real Meta
 * webhook body, so handleWebhookPost's existing dispatch logic (untouched —
 * see the mechanical extraction in bot/whatsapp-bot.js) can process both.
 */

const path = require('path');

// The adapter now consults pending-options.js to turn a numeric reply into an
// interactive selection. pending-options lazy-requires the Redis service, so
// stub that ONE module file-wide: pending-options' real logic still runs (via
// its in-memory fallback), but no socket is opened — an open Redis handle stops
// Jest from exiting.
jest.mock('../../bot/shared/services/cache/railway-redis.service', () => ({
  set: jest.fn().mockRejectedValue(new Error('redis disabled in tests')),
  get: jest.fn().mockRejectedValue(new Error('redis disabled in tests')),
  delete: jest.fn().mockRejectedValue(new Error('redis disabled in tests')),
}));

function loadAdapter() {
  jest.resetModules();
  jest.doMock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
  jest.doMock('../../bot/shared/storage/r2', () => ({ downloadFromR2: jest.fn(), extractKeyFromUrl: jest.fn() }));
  jest.doMock('../../bot/shared/services/messaging/baileys-connection', () => ({
    getSocket: jest.fn(), isConnected: jest.fn(), authDir: jest.fn(),
  }));
  return require('../../bot/shared/services/messaging/inbound/baileys-socket.adapter');
}

afterEach(() => jest.resetModules());

describe('jidToPhoneNumber', () => {
  it('strips the @s.whatsapp.net suffix', () => {
    const { jidToPhoneNumber } = loadAdapter();
    expect(jidToPhoneNumber('923001234567@s.whatsapp.net')).toBe('923001234567');
  });

  it('strips a :device suffix — Baileys 7.x getPNForLID() returns device-scoped JIDs', () => {
    // Live bug: getPNForLID() returned `<number>:0@s.whatsapp.net`. Keeping the
    // ":0" meant it was stored as the user's phone_number, and toJid()'s
    // strip-non-digits turned `<number>:0` into `<number>0` — the real number
    // with a trailing zero, a nonexistent destination Baileys still calls "sent".
    const { jidToPhoneNumber } = loadAdapter();
    expect(jidToPhoneNumber('923001234567:0@s.whatsapp.net')).toBe('923001234567');
    expect(jidToPhoneNumber('923001234567:22@s.whatsapp.net')).toBe('923001234567');
    expect(jidToPhoneNumber('111222333444555:1@lid')).toBe('111222333444555');
  });
});

describe('resolveSenderPhoneNumber', () => {
  it('uses remoteJid directly for a normal @s.whatsapp.net chat', () => {
    const { resolveSenderPhoneNumber } = loadAdapter();
    const waMessage = { key: { remoteJid: '923001234567@s.whatsapp.net' } };
    expect(resolveSenderPhoneNumber(waMessage)).toBe('923001234567');
  });

  it('prefers key.senderPn over the opaque @lid id — the real-world bug a live inbound test caught', () => {
    // WhatsApp's phone-number-privacy rollout can address a chat via an
    // opaque @lid JID. Before this fix, `from` became the LID's numeric id
    // (not a real phone number) — DB user identity was wrong, and the reply
    // was sent to a nonexistent JID: Baileys reported success but nothing
    // was ever delivered to the real sender.
    const { resolveSenderPhoneNumber } = loadAdapter();
    const waMessage = {
      key: { remoteJid: '111222333444555@lid', senderPn: '923001234567@s.whatsapp.net' },
    };
    expect(resolveSenderPhoneNumber(waMessage)).toBe('923001234567');
  });

  it('falls back to the LID id when senderPn is absent and nothing is cached yet (best effort)', () => {
    const { resolveSenderPhoneNumber } = loadAdapter();
    const waMessage = { key: { remoteJid: '111222333444555@lid' } };
    expect(resolveSenderPhoneNumber(waMessage)).toBe('111222333444555');
  });

  it('reuses a cached mapping for a later message from the same @lid missing senderPn — the offline-catch-up bug a live test caught', () => {
    // Real-world discovery: a message delivered through Baileys' offline/
    // backlog catch-up path (exactly what happens right after this process
    // restarts) reaches messages.upsert WITHOUT key.senderPn, even though a
    // prior real-time message from the identical @lid resolved one. Without
    // this cache, EVERY offline-delivered message regresses to the
    // undeliverable-reply bug, not just the very first contact ever seen.
    const { resolveSenderPhoneNumber, _resetLidCacheForTests } = loadAdapter();
    _resetLidCacheForTests();

    const withSenderPn = { key: { remoteJid: '111222333444555@lid', senderPn: '923001234567@s.whatsapp.net' } };
    expect(resolveSenderPhoneNumber(withSenderPn)).toBe('923001234567');

    const withoutSenderPn = { key: { remoteJid: '111222333444555@lid' } };
    expect(resolveSenderPhoneNumber(withoutSenderPn)).toBe('923001234567');
  });

  it('does not leak a cached mapping across different @lid ids', () => {
    const { resolveSenderPhoneNumber, _resetLidCacheForTests } = loadAdapter();
    _resetLidCacheForTests();

    resolveSenderPhoneNumber({ key: { remoteJid: '111@lid', senderPn: '923000000001@s.whatsapp.net' } });
    const other = resolveSenderPhoneNumber({ key: { remoteJid: '222@lid' } });
    expect(other).toBe('222');
  });
});

describe('isCommandLike — a command must never be eaten by a pending question', () => {
  // Live failure this exists for: a class-setup flow was waiting for the roster
  // (a FREE-TEXT step, which accepts any non-empty text), the teacher typed
  // "add class", and it became a class whose only student was named "add class".
  it('recognises slash commands', () => {
    const { isCommandLike } = loadAdapter();
    expect(isCommandLike('/menu')).toBe(true);
    expect(isCommandLike('  /video  ')).toBe(true);
    expect(isCommandLike('/reading test')).toBe(true);
  });

  it('recognises the plain-phrase commands that have no slash', () => {
    const { isCommandLike } = loadAdapter();
    expect(isCommandLike('add class')).toBe(true);
    expect(isCommandLike('set up class')).toBe(true);
    expect(isCommandLike('attendance')).toBe(true);
  });

  it('does not mistake ordinary answers or prose for commands', () => {
    const { isCommandLike } = loadAdapter();
    expect(isCommandLike('Ahmed Khan')).toBe(false);
    expect(isCommandLike('2')).toBe(false);
    expect(isCommandLike('Grade 4')).toBe(false);
    expect(isCommandLike('Fluency + Comprehension')).toBe(false);
    expect(isCommandLike('')).toBe(false);
    expect(isCommandLike(null)).toBe(false);
  });
});

describe('isDuplicateDelivery', () => {
  it('returns false the first time a message id is seen, true on a repeat', () => {
    const { isDuplicateDelivery, _resetSeenMessagesForTests } = loadAdapter();
    _resetSeenMessagesForTests();

    expect(isDuplicateDelivery('m1')).toBe(false);
    expect(isDuplicateDelivery('m1')).toBe(true);
  });

  it('treats different message ids independently', () => {
    const { isDuplicateDelivery, _resetSeenMessagesForTests } = loadAdapter();
    _resetSeenMessagesForTests();

    expect(isDuplicateDelivery('m1')).toBe(false);
    expect(isDuplicateDelivery('m2')).toBe(false);
    expect(isDuplicateDelivery('m1')).toBe(true);
    expect(isDuplicateDelivery('m2')).toBe(true);
  });

  it('never flags a missing/falsy id as a duplicate', () => {
    const { isDuplicateDelivery, _resetSeenMessagesForTests } = loadAdapter();
    _resetSeenMessagesForTests();

    expect(isDuplicateDelivery(undefined)).toBe(false);
    expect(isDuplicateDelivery(undefined)).toBe(false);
  });
});

describe('mapToMetaShape', () => {
  const baseKey = { remoteJid: '923001234567@s.whatsapp.net', id: 'wa-msg-1', fromMe: false };

  it('maps a plain-text conversation message', async () => {
    const { mapToMetaShape } = loadAdapter();
    const waMessage = { key: baseKey, messageTimestamp: 1700000000, message: { conversation: 'Hello there' } };

    const result = await mapToMetaShape(waMessage, jest.fn());

    expect(result.mediaToCache).toBeNull();
    expect(result.metaMessage).toEqual({
      from: '923001234567', id: 'wa-msg-1', timestamp: 1700000000, type: 'text', text: { body: 'Hello there' },
    });
  });

  it('maps an extendedTextMessage (text with a link preview / quoted reply) the same as conversation', async () => {
    const { mapToMetaShape } = loadAdapter();
    const waMessage = {
      key: baseKey, messageTimestamp: 1700000001, message: { extendedTextMessage: { text: 'Check this out' } },
    };

    const result = await mapToMetaShape(waMessage, jest.fn());
    expect(result.metaMessage.type).toBe('text');
    expect(result.metaMessage.text.body).toBe('Check this out');
  });

  it('maps an image message and returns the downloaded buffer to cache', async () => {
    const { mapToMetaShape } = loadAdapter();
    const buffer = Buffer.from('PNGDATA');
    const downloadMediaMessage = jest.fn().mockResolvedValue(buffer);
    const waMessage = {
      key: baseKey,
      messageTimestamp: 1700000002,
      message: { imageMessage: { mimetype: 'image/jpeg', caption: 'a caption' } },
    };

    const result = await mapToMetaShape(waMessage, downloadMediaMessage);

    expect(downloadMediaMessage).toHaveBeenCalledWith(waMessage, 'buffer', {});
    expect(result.metaMessage).toMatchObject({
      type: 'image', image: { id: 'wa-msg-1', mime_type: 'image/jpeg', caption: 'a caption' },
    });
    expect(result.mediaToCache).toEqual({ id: 'wa-msg-1', buffer, mimetype: 'image/jpeg' });
  });

  it('maps a voice note (ptt:true audio) with type "voice"', async () => {
    const { mapToMetaShape } = loadAdapter();
    const buffer = Buffer.from('OGGDATA');
    const downloadMediaMessage = jest.fn().mockResolvedValue(buffer);
    const waMessage = {
      key: baseKey, messageTimestamp: 1700000003, message: { audioMessage: { mimetype: 'audio/ogg', ptt: true } },
    };

    const result = await mapToMetaShape(waMessage, downloadMediaMessage);
    expect(result.metaMessage.type).toBe('voice');
    expect(result.metaMessage.audio).toEqual({ id: 'wa-msg-1', mime_type: 'audio/ogg' });
  });

  it('maps a regular (non-ptt) audio message with type "audio"', async () => {
    const { mapToMetaShape } = loadAdapter();
    const downloadMediaMessage = jest.fn().mockResolvedValue(Buffer.from('MP3DATA'));
    const waMessage = {
      key: baseKey, messageTimestamp: 1700000004, message: { audioMessage: { mimetype: 'audio/mpeg', ptt: false } },
    };

    const result = await mapToMetaShape(waMessage, downloadMediaMessage);
    expect(result.metaMessage.type).toBe('audio');
  });

  it('maps a document message with its filename and mimetype', async () => {
    const { mapToMetaShape } = loadAdapter();
    const buffer = Buffer.from('PDFDATA');
    const downloadMediaMessage = jest.fn().mockResolvedValue(buffer);
    const waMessage = {
      key: baseKey,
      messageTimestamp: 1700000005,
      message: { documentMessage: { mimetype: 'application/pdf', fileName: 'lesson.pdf' } },
    };

    const result = await mapToMetaShape(waMessage, downloadMediaMessage);
    expect(result.metaMessage).toMatchObject({
      type: 'document', document: { id: 'wa-msg-1', mime_type: 'application/pdf', filename: 'lesson.pdf' },
    });
    expect(result.mediaToCache.buffer).toBe(buffer);
  });

  it('returns null for a message with no content (e.g. protocol/revoke message)', async () => {
    const { mapToMetaShape } = loadAdapter();
    const waMessage = { key: baseKey, messageTimestamp: 1700000006, message: null };
    expect(await mapToMetaShape(waMessage, jest.fn())).toBeNull();
  });

  it('returns null for our own outgoing message (fromMe:true) — avoids re-processing echoes', async () => {
    const { mapToMetaShape } = loadAdapter();
    const waMessage = {
      key: { ...baseKey, fromMe: true }, messageTimestamp: 1700000007, message: { conversation: 'hi' },
    };
    expect(await mapToMetaShape(waMessage, jest.fn())).toBeNull();
  });

  it('returns null for a group chat JID (@g.us) — Rumi is 1:1 only', async () => {
    const { mapToMetaShape } = loadAdapter();
    const waMessage = {
      key: { remoteJid: '123456-group@g.us', id: 'x', fromMe: false },
      messageTimestamp: 1700000008,
      message: { conversation: 'hi group' },
    };
    expect(await mapToMetaShape(waMessage, jest.fn())).toBeNull();
  });

  it('returns null for an unsupported content type (e.g. sticker) rather than throwing', async () => {
    const { mapToMetaShape } = loadAdapter();
    const waMessage = { key: baseKey, messageTimestamp: 1700000009, message: { stickerMessage: {} } };
    expect(await mapToMetaShape(waMessage, jest.fn())).toBeNull();
  });

  it('maps a @lid-addressed message using senderPn as `from`, not the LID id', async () => {
    const { mapToMetaShape } = loadAdapter();
    const waMessage = {
      key: { remoteJid: '111222333444555@lid', senderPn: '923001234567@s.whatsapp.net', id: 'wa-msg-lid', fromMe: false },
      messageTimestamp: 1700000010,
      message: { conversation: 'hi from a LID-addressed chat' },
    };

    const result = await mapToMetaShape(waMessage, jest.fn());
    expect(result.metaMessage.from).toBe('923001234567');
  });
});

describe('attach()', () => {
  function mockSock() {
    const handlers = {};
    return { ev: { on: jest.fn((event, fn) => { handlers[event] = fn; }) }, handlers };
  }

  it('registers a messages.upsert listener and dispatches each mapped message as a synthetic {req,res}', async () => {
    jest.resetModules();
    const sock = mockSock();
    jest.doMock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
    jest.doMock('../../bot/shared/storage/r2', () => ({ downloadFromR2: jest.fn(), extractKeyFromUrl: jest.fn() }));
    jest.doMock('../../bot/shared/services/messaging/baileys-connection', () => ({
      getSocket: jest.fn().mockResolvedValue(sock), isConnected: jest.fn(), authDir: jest.fn(),
    }));
    jest.doMock('../../bot/shared/services/messaging/baileys-channel.service', () => ({
      _cacheIncomingMedia: jest.fn(),
    }));
    jest.doMock('../../bot/shared/services/messaging/baileys-lib', () => ({ loadBaileys: jest.fn().mockResolvedValue({ downloadMediaMessage: jest.fn() }) }));

    const adapter = require('../../bot/shared/services/messaging/inbound/baileys-socket.adapter');
    const dispatch = jest.fn().mockResolvedValue(undefined);

    await adapter.attach(dispatch);
    expect(sock.ev.on).toHaveBeenCalledWith('messages.upsert', expect.any(Function));

    await sock.handlers['messages.upsert']({
      messages: [{
        key: { remoteJid: '923001234567@s.whatsapp.net', id: 'm1', fromMe: false },
        messageTimestamp: 1700000010,
        message: { conversation: 'hi bot' },
      }],
    });

    expect(dispatch).toHaveBeenCalledTimes(1);
    const [req, res] = dispatch.mock.calls[0];
    expect(req.body.entry[0].changes[0].value.messages[0]).toMatchObject({ from: '923001234567', type: 'text' });
    expect(typeof res.status).toBe('function');
  });

  it('skips messages that map to null (e.g. group chat) without calling dispatch', async () => {
    jest.resetModules();
    const sock = mockSock();
    jest.doMock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
    jest.doMock('../../bot/shared/storage/r2', () => ({ downloadFromR2: jest.fn(), extractKeyFromUrl: jest.fn() }));
    jest.doMock('../../bot/shared/services/messaging/baileys-connection', () => ({
      getSocket: jest.fn().mockResolvedValue(sock), isConnected: jest.fn(), authDir: jest.fn(),
    }));
    jest.doMock('../../bot/shared/services/messaging/baileys-channel.service', () => ({ _cacheIncomingMedia: jest.fn() }));
    jest.doMock('../../bot/shared/services/messaging/baileys-lib', () => ({ loadBaileys: jest.fn().mockResolvedValue({ downloadMediaMessage: jest.fn() }) }));

    const adapter = require('../../bot/shared/services/messaging/inbound/baileys-socket.adapter');
    const dispatch = jest.fn();
    await adapter.attach(dispatch);

    await sock.handlers['messages.upsert']({
      messages: [{ key: { remoteJid: 'g@g.us', id: 'm2', fromMe: false }, message: { conversation: 'x' } }],
    });

    expect(dispatch).not.toHaveBeenCalled();
  });

  it('a dispatch failure for one message is logged and does not stop processing the rest', async () => {
    jest.resetModules();
    const sock = mockSock();
    jest.doMock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
    jest.doMock('../../bot/shared/storage/r2', () => ({ downloadFromR2: jest.fn(), extractKeyFromUrl: jest.fn() }));
    jest.doMock('../../bot/shared/services/messaging/baileys-connection', () => ({
      getSocket: jest.fn().mockResolvedValue(sock), isConnected: jest.fn(), authDir: jest.fn(),
    }));
    jest.doMock('../../bot/shared/services/messaging/baileys-channel.service', () => ({ _cacheIncomingMedia: jest.fn() }));
    jest.doMock('../../bot/shared/services/messaging/baileys-lib', () => ({ loadBaileys: jest.fn().mockResolvedValue({ downloadMediaMessage: jest.fn() }) }));

    const adapter = require('../../bot/shared/services/messaging/inbound/baileys-socket.adapter');
    const dispatch = jest.fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(undefined);
    await adapter.attach(dispatch);

    await sock.handlers['messages.upsert']({
      messages: [
        { key: { remoteJid: '111@s.whatsapp.net', id: 'm3', fromMe: false }, messageTimestamp: 1, message: { conversation: 'a' } },
        { key: { remoteJid: '222@s.whatsapp.net', id: 'm4', fromMe: false }, messageTimestamp: 2, message: { conversation: 'b' } },
      ],
    });

    expect(dispatch).toHaveBeenCalledTimes(2);
  });

  it('dispatches a redelivered message only once — the exact duplicate-delivery bug a live test caught', async () => {
    // Real-world discovery: Baileys occasionally redelivers the identical
    // message (same key.id) via messages.upsert within under a second — seen
    // live for both an image and a document, each fully processed (and
    // replied to) twice. This in-memory guard catches it before either
    // delivery reaches the network-dependent Redis dedup in
    // session.service.js, which has its own race window.
    jest.resetModules();
    const sock = mockSock();
    jest.doMock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
    jest.doMock('../../bot/shared/storage/r2', () => ({ downloadFromR2: jest.fn(), extractKeyFromUrl: jest.fn() }));
    jest.doMock('../../bot/shared/services/messaging/baileys-connection', () => ({
      getSocket: jest.fn().mockResolvedValue(sock), isConnected: jest.fn(), authDir: jest.fn(),
    }));
    jest.doMock('../../bot/shared/services/messaging/baileys-channel.service', () => ({ _cacheIncomingMedia: jest.fn() }));
    jest.doMock('../../bot/shared/services/messaging/baileys-lib', () => ({ loadBaileys: jest.fn().mockResolvedValue({ downloadMediaMessage: jest.fn() }) }));

    const adapter = require('../../bot/shared/services/messaging/inbound/baileys-socket.adapter');
    adapter._resetSeenMessagesForTests();
    const dispatch = jest.fn().mockResolvedValue(undefined);
    await adapter.attach(dispatch);

    const redelivered = {
      key: { remoteJid: '923001234567@s.whatsapp.net', id: 'dup-msg-1', fromMe: false },
      messageTimestamp: 1700000011,
      message: { conversation: 'sent once, delivered twice by Baileys' },
    };

    await sock.handlers['messages.upsert']({ messages: [redelivered] });
    await sock.handlers['messages.upsert']({ messages: [redelivered] });

    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it('still dispatches a retry whose FIRST delivery arrived undecrypted — the regression the dedup guard originally caused', async () => {
    // Real-world discovery (second live run): Baileys' first delivery attempt
    // of a message can fail to decrypt ("No matching sessions") and arrive
    // with message:null, then be retried under the SAME key.id once
    // decryption succeeds. The dedup guard originally recorded the id on that
    // contentless first attempt, so the real decrypted retry was discarded as
    // a duplicate and the message was never processed at all — the user saw
    // no reply whatsoever.
    jest.resetModules();
    const sock = mockSock();
    jest.doMock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
    jest.doMock('../../bot/shared/storage/r2', () => ({ downloadFromR2: jest.fn(), extractKeyFromUrl: jest.fn() }));
    jest.doMock('../../bot/shared/services/messaging/baileys-connection', () => ({
      getSocket: jest.fn().mockResolvedValue(sock), isConnected: jest.fn(), authDir: jest.fn(),
    }));
    jest.doMock('../../bot/shared/services/messaging/baileys-channel.service', () => ({ _cacheIncomingMedia: jest.fn() }));
    jest.doMock('../../bot/shared/services/messaging/baileys-lib', () => ({ loadBaileys: jest.fn().mockResolvedValue({ downloadMediaMessage: jest.fn() }) }));

    const adapter = require('../../bot/shared/services/messaging/inbound/baileys-socket.adapter');
    adapter._resetSeenMessagesForTests();
    const dispatch = jest.fn().mockResolvedValue(undefined);
    await adapter.attach(dispatch);

    const key = { remoteJid: '923001234567@s.whatsapp.net', id: 'retry-msg-1', fromMe: false };

    // Attempt 1: failed decryption — no content at all.
    await sock.handlers['messages.upsert']({
      messages: [{ key, messageTimestamp: 1700000012, message: null }],
    });
    expect(dispatch).not.toHaveBeenCalled();

    // Attempt 2: same id, now decrypted — must be processed, not swallowed.
    await sock.handlers['messages.upsert']({
      messages: [{ key, messageTimestamp: 1700000012, message: { conversation: 'finally decrypted' } }],
    });

    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch.mock.calls[0][0].body.entry[0].changes[0].value.messages[0])
      .toMatchObject({ from: '923001234567', type: 'text', text: { body: 'finally decrypted' } });
  });
});

describe('rememberLidMapping — harvesting @lid->phone from skipped deliveries', () => {
  const LID = '111222333444555@lid';

  function loadWithTmpState() {
    const os = require('os');
    const fs = require('fs');
    const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lidmap-'));
    jest.resetModules();
    jest.doMock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
    jest.doMock('../../bot/shared/storage/r2', () => ({ downloadFromR2: jest.fn(), extractKeyFromUrl: jest.fn() }));
    jest.doMock('../../bot/shared/services/messaging/baileys-connection', () => ({
      getSocket: jest.fn(), isConnected: jest.fn(), authDir: () => stateDir,
    }));
    const adapter = require('../../bot/shared/services/messaging/inbound/baileys-socket.adapter');
    adapter._resetLidCacheForTests();
    return { adapter, stateDir };
  }

  it('harvests the mapping from an UNDECRYPTABLE delivery, so the later decrypted retry resolves correctly', async () => {
    // The exact live failure: after a restart the cache is empty. The
    // deliveries carrying sender_pn were the ones that FAILED to decrypt, and
    // gating the harvest behind hasDispatchableContent() starved the cache —
    // the successful retry then had no senderPn, fell back to the LID, and the
    // reply went to a non-device JID (reported "sent", never delivered).
    const { adapter } = loadWithTmpState();

    // Undecryptable stub — no content, but it DOES carry senderPn.
    adapter.rememberLidMapping({
      key: { remoteJid: LID, id: 'm1', fromMe: false, senderPn: '923001234567@s.whatsapp.net' },
      message: null,
    });

    // The decrypted retry carries NO senderPn — must still resolve to the real number.
    const resolved = adapter.resolveSenderPhoneNumber({
      key: { remoteJid: LID, id: 'm1', fromMe: false },
      message: { conversation: 'hi' },
    });
    expect(resolved).toBe('923001234567');
  });

  it('writes NO map file of its own — Baileys 7.x owns LID persistence', () => {
    // This cache is process-local on purpose. Baileys 7.x persists its own
    // lid-mapping-*.json files into the auth dir (700+ on a fresh pairing) and
    // serves them via lidMapping.getPNForLID(), so the hand-rolled
    // lid-to-phone.json this adapter used to write was duplicate machinery and
    // has been removed. This map only covers the gap before the native store
    // has learned a given mapping.
    const fs = require('fs');
    const { adapter, stateDir } = loadWithTmpState();

    adapter.rememberLidMapping({ key: { remoteJid: LID, senderPn: '923001234567@s.whatsapp.net' } });

    expect(fs.existsSync(path.join(stateDir, 'lid-to-phone.json'))).toBe(false);
    // Still usable in-process as the pre-native-store fallback.
    expect(adapter.resolveSenderPhoneNumber({ key: { remoteJid: LID } })).toBe('923001234567');
  });

  it('prefers Baileys 7.x own LIDMappingStore over the hand-rolled senderPn cache', async () => {
    // Baileys 7.x owns LID<->phone mapping properly (sock.signalRepository
    // .lidMapping, persisted as lid-mapping-*.json — a fresh pairing wrote 706
    // of them). 6.7.23 had no such store, which is the whole reason this
    // adapter had to scrape key.senderPn by hand. The store is authoritative.
    const { adapter } = loadWithTmpState();
    const sock = {
      signalRepository: {
        lidMapping: { getPNForLID: jest.fn().mockResolvedValue('923001234567@s.whatsapp.net') },
      },
    };

    const resolved = await adapter.resolveSenderPhoneNumberAsync(
      { key: { remoteJid: LID, id: 'm1', fromMe: false }, message: { conversation: 'hi' } },
      sock
    );

    expect(sock.signalRepository.lidMapping.getPNForLID).toHaveBeenCalledWith(LID);
    expect(resolved).toBe('923001234567');
  });

  it('falls back to the senderPn cache when the native store has no mapping yet', async () => {
    const { adapter } = loadWithTmpState();
    const sock = {
      signalRepository: { lidMapping: { getPNForLID: jest.fn().mockResolvedValue(null) } },
    };

    // Cache warmed from an earlier delivery that did carry senderPn.
    adapter.rememberLidMapping({ key: { remoteJid: LID, senderPn: '923001234567@s.whatsapp.net' } });

    const resolved = await adapter.resolveSenderPhoneNumberAsync({ key: { remoteJid: LID } }, sock);
    expect(resolved).toBe('923001234567');
  });

  it('a throwing native store does not break resolution', async () => {
    const { adapter } = loadWithTmpState();
    const sock = {
      signalRepository: { lidMapping: { getPNForLID: jest.fn().mockRejectedValue(new Error('store down')) } },
    };
    adapter.rememberLidMapping({ key: { remoteJid: LID, senderPn: '923001234567@s.whatsapp.net' } });

    await expect(adapter.resolveSenderPhoneNumberAsync({ key: { remoteJid: LID } }, sock))
      .resolves.toBe('923001234567');
  });

  it('ignores deliveries with no senderPn and non-LID chats', () => {
    const fs = require('fs');
    const { adapter, stateDir } = loadWithTmpState();

    adapter.rememberLidMapping({ key: { remoteJid: LID } }); // LID, no senderPn
    adapter.rememberLidMapping({ key: { remoteJid: '923001234567@s.whatsapp.net', senderPn: 'x@s.whatsapp.net' } });

    expect(fs.existsSync(path.join(stateDir, 'lid-to-phone.json'))).toBe(false);
  });

  it('does not expose or depend on any map-file loader', () => {
    // Guards the removal: reintroducing bespoke LID persistence here would
    // duplicate what Baileys 7.x already does.
    const { adapter } = loadWithTmpState();
    expect(adapter.loadLidCache).toBeUndefined();
  });
});

describe('numeric replies to rendered menus become interactive selections', () => {
  // The gap this closes: whatsapp-bot.js dispatches on
  // `interactive.button_reply.id` / `list_reply.id` (33 ID families). Baileys
  // has no native picker, so the driver renders numbered text — which meant the
  // user's "1" arrived as ordinary text, never matched those branches, and fell
  // through to general AI chat. Every numbered menu was unanswerable.
  function load() {
    jest.resetModules();
    jest.doMock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
    jest.doMock('../../bot/shared/storage/r2', () => ({ downloadFromR2: jest.fn(), extractKeyFromUrl: jest.fn() }));
    jest.doMock('../../bot/shared/services/messaging/baileys-connection', () => ({
      getSocket: jest.fn(), isConnected: jest.fn(), authDir: jest.fn(),
    }));
    const adapter = require('../../bot/shared/services/messaging/inbound/baileys-socket.adapter');
    const store = require('../../bot/shared/services/messaging/pending-options');
    store._resetForTests();
    return { adapter, store };
  }

  const key = { remoteJid: '923001234567@s.whatsapp.net', id: 'm1', fromMe: false };

  it('synthesises a list_reply with the SAME id Metas native picker would have sent', async () => {
    const { adapter, store } = load();
    await store.remember('923001234567', {
      replyType: 'list_reply',
      options: [{ id: 'lang_auto', title: 'Auto-detect' }, { id: 'lang_en', title: 'English' }],
    });

    const result = await adapter.mapToMetaShape(
      { key, messageTimestamp: 1700000000, message: { conversation: '2' } },
      jest.fn()
    );

    expect(result.metaMessage).toMatchObject({
      from: '923001234567',
      type: 'interactive',
      interactive: { type: 'list_reply', list_reply: { id: 'lang_en', title: 'English' } },
    });
  });

  it('synthesises a button_reply for button menus', async () => {
    const { adapter, store } = load();
    await store.remember('923001234567', {
      replyType: 'button_reply',
      options: [{ id: 'coaching_confirm_42', title: 'Yes' }, { id: 'coaching_cancel_42', title: 'No' }],
    });

    const result = await adapter.mapToMetaShape(
      { key, messageTimestamp: 1700000000, message: { conversation: '1' } },
      jest.fn()
    );

    expect(result.metaMessage.interactive).toEqual({
      type: 'button_reply',
      button_reply: { id: 'coaching_confirm_42', title: 'Yes' },
    });
  });

  it('consumes the menu, so the same number is ordinary text the second time', async () => {
    const { adapter, store } = load();
    await store.remember('923001234567', {
      replyType: 'list_reply', options: [{ id: 'lang_en', title: 'English' }],
    });

    const first = await adapter.mapToMetaShape({ key, messageTimestamp: 1, message: { conversation: '1' } }, jest.fn());
    expect(first.metaMessage.type).toBe('interactive');

    const second = await adapter.mapToMetaShape(
      { key: { ...key, id: 'm2' }, messageTimestamp: 2, message: { conversation: '1' } },
      jest.fn()
    );
    expect(second.metaMessage.type).toBe('text');
  });

  it('leaves ordinary text alone while a menu is pending', async () => {
    const { adapter, store } = load();
    await store.remember('923001234567', {
      replyType: 'list_reply', options: [{ id: 'lang_en', title: 'English' }],
    });

    const result = await adapter.mapToMetaShape(
      { key, messageTimestamp: 1, message: { conversation: 'actually, what can you do?' } },
      jest.fn()
    );

    expect(result.metaMessage.type).toBe('text');
    expect(result.metaMessage.text.body).toBe('actually, what can you do?');
  });

  it('a bare number with NO pending menu stays plain text', async () => {
    const { adapter } = load();
    const result = await adapter.mapToMetaShape(
      { key, messageTimestamp: 1, message: { conversation: '1' } },
      jest.fn()
    );
    expect(result.metaMessage.type).toBe('text');
    expect(result.metaMessage.text.body).toBe('1');
  });
});

describe('hasDispatchableContent', () => {
  function load() {
    jest.resetModules();
    jest.doMock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn() }));
    jest.doMock('../../bot/shared/storage/r2', () => ({ downloadFromR2: jest.fn(), extractKeyFromUrl: jest.fn() }));
    jest.doMock('../../bot/shared/services/messaging/baileys-connection', () => ({
      getSocket: jest.fn(), isConnected: jest.fn(), authDir: jest.fn(),
    }));
    return require('../../bot/shared/services/messaging/inbound/baileys-socket.adapter');
  }
  const key = { remoteJid: '923001234567@s.whatsapp.net', id: 'x', fromMe: false };

  it('is false for an undecrypted message (message:null) so its id is never recorded', () => {
    const { hasDispatchableContent } = load();
    expect(hasDispatchableContent({ key, message: null })).toBe(false);
  });

  it('is false for our own echo and for group chats', () => {
    const { hasDispatchableContent } = load();
    expect(hasDispatchableContent({ key: { ...key, fromMe: true }, message: { conversation: 'hi' } })).toBe(false);
    expect(hasDispatchableContent({ key: { remoteJid: 'g@g.us', id: 'x' }, message: { conversation: 'hi' } })).toBe(false);
  });

  it('is false for content types the adapter never maps (e.g. sticker)', () => {
    const { hasDispatchableContent } = load();
    expect(hasDispatchableContent({ key, message: { stickerMessage: {} } })).toBe(false);
  });

  it('is true for every type mapToMetaShape actually handles', () => {
    const { hasDispatchableContent } = load();
    expect(hasDispatchableContent({ key, message: { conversation: 'hi' } })).toBe(true);
    expect(hasDispatchableContent({ key, message: { extendedTextMessage: { text: 'hi' } } })).toBe(true);
    expect(hasDispatchableContent({ key, message: { imageMessage: {} } })).toBe(true);
    expect(hasDispatchableContent({ key, message: { audioMessage: {} } })).toBe(true);
    expect(hasDispatchableContent({ key, message: { documentMessage: {} } })).toBe(true);
  });
});
