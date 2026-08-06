/**
 * Baileys channel driver — sandbox-tier, zero Meta setup required.
 *
 * Real sending/receiving over a WhatsApp Web connection (via
 * baileys-connection.js), for every method that has a genuine Baileys
 * equivalent. A handful of methods are Meta-template-specific concepts with
 * NO Baileys equivalent — WhatsApp template approval, carousels — because
 * their real content (the template's static wording) lives only in Meta's
 * registered template config, not in the `components`/payload arguments this
 * driver receives; porting them needs the channel-agnostic template registry
 * from docs/onboarding/sandbox-production-design.md §1, which isn't built
 * yet. Those stay honest stubs (documented per-method below), never a crash.
 *
 * Method names/async-ness are parsed statically off meta-channel.service.js's
 * SOURCE (regex, same mechanism as tests/setup/no-undefined-whatsapp-methods
 * .test.js and tests/messaging/channel-driver-parity.test.js) rather than by
 * `require()`-ing that module — meta-channel.service.js pulls in axios/
 * form-data, neither of which this driver needs. If meta-channel.service.js
 * ever grows a new method this file doesn't know about, requiring this file
 * throws immediately with a clear message (see the assertion loop at the
 * bottom) rather than silently shipping a missing/wrong-shaped member.
 *
 * Media handling: Baileys has no Meta-style "upload once, fetch by ID later"
 * API — incoming media only exists as bytes attached to the message object
 * at the moment it's received. baileys-socket.adapter.js (the inbound
 * listener, not yet wired into whatsapp-bot.js) downloads it immediately and
 * calls cacheIncomingMedia() so getMediaInfo()/downloadMedia() — called later
 * by the same handler pipeline Meta uses — can still look it up by the
 * synthetic ID the adapter assigned. Until that adapter exists, nothing
 * populates this cache and both methods correctly report "not found."
 */

const fs = require('fs');
const path = require('path');
const { logToFile } = require('../../utils/logger');
const { downloadFromR2, extractKeyFromUrl } = require('../../storage/r2');
const connection = require('./baileys-connection');
const pendingOptions = require('./pending-options');
const textFlow = require('./text-flow');

const META_SOURCE_PATH = path.join(__dirname, 'meta-channel.service.js');

function parseMembers(src) {
  const members = [];
  const methodRe = /^\s*static\s+(async\s+)?(\w+)\s*\(/gm;
  let m;
  while ((m = methodRe.exec(src))) members.push({ name: m[2], isAsync: !!m[1] });
  return members;
}

const MEMBERS = parseMembers(fs.readFileSync(META_SOURCE_PATH, 'utf-8'));

/**
 * Builds a chat JID from a phone number.
 *
 * Drops any `@server` and `:device` suffix BEFORE stripping non-digits. Order
 * matters — a live bug: Baileys 7.x can hand back device-scoped JIDs like
 * `<number>:0@s.whatsapp.net`, and stripping non-digits first turned that into
 * `<number>0`, silently sending to the real number plus a trailing zero (a
 * nonexistent destination Baileys still reports as "sent"). Guarded here as
 * well as at the inbound edge, since this is the last gate before a send.
 */
function toJid(phoneNumber) {
  const bare = String(phoneNumber).split('@')[0].split(':')[0];
  const digits = bare.replace(/\D/g, '');
  return `${digits}@s.whatsapp.net`;
}

async function getSock() {
  return connection.getSocket();
}

// ── Inbound media bridge (see file header) ──────────────────────────────────
const MEDIA_CACHE_TTL_MS = 10 * 60 * 1000; // generous for a multi-step handler pipeline
const mediaCache = new Map(); // mediaId -> { buffer, mimetype, cachedAt }

function cacheIncomingMedia(mediaId, buffer, mimetype) {
  mediaCache.set(mediaId, { buffer, mimetype, cachedAt: Date.now() });
}

function getCachedMedia(mediaId) {
  const entry = mediaCache.get(mediaId);
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > MEDIA_CACHE_TTL_MS) {
    mediaCache.delete(mediaId);
    return null;
  }
  return entry;
}

function mediaNotFoundError(mediaId) {
  return new Error(
    `Baileys channel driver: no cached media for id "${mediaId}" — Baileys has no fetch-by-id API, `
    + 'media must be consumed shortly after it is received (see baileys-socket.adapter.js)'
  );
}

// ── Plain-text rendering for Meta's interactive-UI methods ──────────────────
// Baileys' native button/list messages are unreliable across current
// WhatsApp clients (widely reported across the ecosystem) — a numbered plain
// text list is the honest, actually-reliable choice: it always renders, at
// the cost of the user typing a reply instead of tapping one. Matching that
// typed reply back to a choice is an inbound-adapter concern, not this file's.
/**
 * True when the description just restates the title ("English" → "English
 * language") and so adds nothing but noise. Kept when it DOES add information —
 * notably a Latin gloss for a non-Latin title ("اردو" → "Urdu language"), which
 * is what makes that option typeable by name.
 */
function isRedundantDescription(title, description) {
  if (!description) return true;
  const t = String(title).trim().toLowerCase();
  const d = String(description).trim().toLowerCase();
  return d === t || d === `${t} language` || d.startsWith(t);
}

/**
 * A name from this very menu to use in the "or the name" hint.
 *
 * The SHORTEST option's identifying half (the part after "·" in a composite
 * "Group · Item" label), so the hint stays short while remaining something the
 * user can type back verbatim and have it actually match — an elided example
 * would not. A fixed '"English"' was actively confusing on a list of grades.
 */
function exampleName(options) {
  const names = (options || [])
    .map((o) => String(o?.title || '').split('·').pop().trim())
    // Single characters count: a quiz question's options are literally "A", "B",
    // "C", and excluding them fell through to the hardcoded '"English"' example
    // on a multiple-choice question.
    .filter((name) => name.length >= 1);
  if (!names.length) return 'English';
  return names.reduce((shortest, name) => (name.length < shortest.length ? name : shortest));
}

function renderOptionsAsText({ header, body, footer, options }) {
  const lines = [];
  if (header) lines.push(`*${header}*`);
  if (body) lines.push(body);
  lines.push('');
  options.forEach((opt, i) => {
    const gloss = isRedundantDescription(opt.title, opt.description) ? '' : ` — ${opt.description}`;
    lines.push(`${i + 1}. ${opt.title}${gloss}`);
  });
  if (footer) { lines.push(''); lines.push(`_${footer}_`); }
  lines.push('');
  // Both forms are accepted (see pending-options.js#resolveSelection) — demanding
  // a number is unrealistic when people naturally type the name instead. The
  // example is drawn from THIS menu: a fixed '"2" or "English"' was actively
  // confusing on a list of school grades.
  lines.push(`Reply with a number or the name — e.g. "1" or "${exampleName(options)}".`);
  return lines.join('\n');
}

/**
 * Records the menu just rendered so the user's numeric reply can be turned back
 * into the interactive reply whatsapp-bot.js's router dispatches on.
 *
 * Without this the numbered list is display-only: "1" arrives as ordinary text,
 * never matches the `interactive.button_reply`/`list_reply` branches, and falls
 * through to general AI chat. See pending-options.js for the full rationale.
 *
 * Options are stored in RENDER ORDER, so option N is what the user typing N
 * means — the same array must be passed here and to renderOptionsAsText().
 * Best-effort: never let bookkeeping failure block the send.
 *
 * @param {string} to
 * @param {'button_reply'|'list_reply'} replyType
 * @param {Array<{id?: string, title: string}>} options
 */
async function rememberMenu(to, replyType, options) {
  const withIds = (options || []).filter((o) => o && o.id);
  if (!withIds.length) return; // nothing routable to map a number back to
  await pendingOptions.remember(String(to), {
    replyType,
    options: withIds.map((o) => ({ id: o.id, title: o.title })),
  });
}

// ── Media sources ────────────────────────────────────────────────────────────

function isAbsoluteHttpUrl(url) {
  return /^https?:\/\//i.test(String(url || ''));
}

/** The credentials downloadFromR2() needs; it throws when any is missing. */
function isR2Configured() {
  return Boolean(
    process.env.R2_ENDPOINT && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY
  );
}

/**
 * Resolves a media URL into something Baileys can send: either a Buffer pulled
 * through the authenticated R2 client, or `{ url }` for Baileys to stream itself.
 *
 * Both are needed, and which one is right depends on the URL, not on the code
 * path. Live testing found this the hard way: every *FromUrl sender routed
 * unconditionally through downloadFromR2(), so /video died with "S3Client cannot
 * be constructed — missing env: R2_ENDPOINT…" on a video whose URL was a
 * PUBLIC bucket URL that needs no credentials whatsoever. A sandbox is exactly
 * the deployment that has no R2 keys, and the imported content library is
 * exactly the content served from public URLs.
 *
 * Handing Baileys `{ url }` is also strictly better where it applies: it streams
 * the media instead of buffering the whole file in this process's memory.
 *
 * @param {string} url
 * @returns {Promise<Buffer|{url: string}>}
 */
async function resolveMediaSource(url) {
  // A file:// URL is media this deployment generated locally because it has no
  // bucket to put it in (a reading-assessment report PDF, say — see
  // reading/analysis.service.js). Read it straight off disk.
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
      // A configured R2 doesn't mean every URL lives in it (a public CDN URL
      // from another bucket, say) — so fall through when we can fetch directly.
      if (!isAbsoluteHttpUrl(url)) throw error;
      logToFile('⚠️ Baileys: R2 download failed — fetching the URL directly instead', {
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

  return { url };
}

// ── WhatsApp Flows, degraded to a conversation ───────────────────────────────

/**
 * A Flow's kind, derived from the flow token when the caller didn't name it.
 *
 * Callers already build tokens as `${userId}:${kind}:${timestamp}` (the
 * convention student-videos, settings and attendance all follow), so the middle
 * segment identifies the Flow without every call site having to be touched.
 * `flowKind` is preferred where it is passed — explicit beats inferred, and Meta
 * ignores the extra option.
 */
function kindFromToken(flowToken) {
  const parts = String(flowToken || '').split(':');
  return parts.length >= 2 ? parts[1] : null;
}

/**
 * Sends one rendered text-flow step. Exported for the inbound adapter, which
 * renders every step after the first.
 *
 * text-flow.js#renderStep has already recorded the menu in pending-options, so
 * the reply — a number OR the option's name — resolves without extra
 * bookkeeping here.
 */
async function sendTextFlowStep(to, render) {
  const { header, body, footer } = render.prompt || {};

  if (render.kind === 'menu') {
    return sendMessage(to, renderOptionsAsText({ header, body, footer, options: render.options }));
  }

  // 'text' (a free-text question) and 'empty' (the endpoint had nothing to
  // offer, and body carries its own explanation) are both plain messages.
  const lines = [];
  if (header) lines.push(`*${header}*`);
  if (body) lines.push(body);
  if (footer) lines.push(`_${footer}_`);
  return sendMessage(to, lines.join('\n\n') || 'Please reply to continue.');
}

/**
 * The sandbox stand-in for a Meta Flow: starts the registered text flow of the
 * same kind and asks its first question.
 *
 * Returning true/false matters — callers branch on it (text-message.handler.js's
 * /reading test throws "Failed to send WhatsApp Flow" on false, which surfaces
 * to the user as "Sorry, something went wrong"). So: true whenever the user was
 * given something actionable, false only when this driver genuinely has no text
 * equivalent for the Flow, letting the caller run its own fallback.
 */
async function sendFlow(to, options = {}) {
  // eslint-disable-next-line global-require -- lazy on purpose; see ensureRegistered()
  require('./text-flow-definitions').ensureRegistered();

  const kind = options.flowKind || kindFromToken(options.flowToken);
  const definition = kind ? textFlow.getDefinition(kind) : null;

  if (!definition) {
    logToFile('Baileys channel driver: no text flow registered for this Flow — falling back to the caller', {
      driver: 'baileys', flowKind: options.flowKind || null, derivedKind: kind,
    });
    return false;
  }

  const flowToken = options.flowToken || '';
  const context = {
    _ctx: { userId: flowToken.split(':')[0] || null, flowToken, phone: String(to) },
  };

  const render = await textFlow.start(String(to), kind, {}, context);
  if (!render) return false;

  await sendTextFlowStep(to, render);
  logToFile('▶️ Baileys: Flow degraded to a text flow', { to, kind, step: render.kind });
  return true;
}

// ── Real implementations ─────────────────────────────────────────────────────

async function sendMessage(to, message) {
  try {
    const cleanMessage = IMPLEMENTATIONS._removeEmotionTags(message);
    const sock = await getSock();
    await sock.sendMessage(toJid(to), { text: cleanMessage });
    logToFile('✅ Baileys message sent', { to });
    return true;
  } catch (error) {
    logToFile('❌ Baileys: error sending message', { error: error.message });
    return false;
  }
}

async function sendReaction(to, messageId, emoji = '❤️') {
  try {
    const sock = await getSock();
    // fromMe: false — sendReaction is always called to react to the OTHER
    // party's incoming message (see whatsapp-bot.js's WhatsAppService.sendReaction(from, message.id, emoji) call).
    await sock.sendMessage(toJid(to), {
      react: { text: emoji, key: { remoteJid: toJid(to), id: messageId, fromMe: false } },
    });
    return true;
  } catch (error) {
    logToFile('❌ Baileys: error sending reaction', { error: error.message });
    return false;
  }
}

async function showTypingIndicator(to) {
  try {
    const sock = await getSock();
    await sock.sendPresenceUpdate('composing', toJid(to));
    return true;
  } catch (error) {
    logToFile('❌ Baileys: error showing typing indicator', { error: error.message });
    return false;
  }
}

function startContinuousTypingIndicator(to) {
  showTypingIndicator(to).catch(() => {});
  const intervalId = setInterval(() => { showTypingIndicator(to).catch(() => {}); }, 20000);
  return { stop: () => clearInterval(intervalId) };
}

async function getMediaInfo(mediaId) {
  const entry = getCachedMedia(mediaId);
  if (!entry) throw mediaNotFoundError(mediaId);
  return { url: null, mime_type: entry.mimetype, file_size: entry.buffer.length };
}

async function downloadMedia(mediaId) {
  const entry = getCachedMedia(mediaId);
  if (!entry) throw mediaNotFoundError(mediaId);
  return entry.buffer;
}

const DOCUMENT_MIME_TYPES = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

async function sendDocumentBuffer(to, buffer, filename, caption) {
  const ext = filename.toLowerCase().split('.').pop();
  const mimetype = DOCUMENT_MIME_TYPES[ext] || 'application/octet-stream';
  const sock = await getSock();
  await sock.sendMessage(toJid(to), {
    document: buffer, mimetype, fileName: filename, caption,
  });
  return true;
}

async function sendDocument(to, filePath, filename, caption) {
  try {
    const buffer = fs.readFileSync(filePath);
    return await sendDocumentBuffer(to, buffer, filename, caption);
  } catch (error) {
    logToFile('❌ Baileys: error sending document', { error: error.message });
    return false;
  }
}

async function sendAudio(to, audioBuffer) {
  try {
    const sock = await getSock();
    await sock.sendMessage(toJid(to), { audio: audioBuffer, mimetype: 'audio/mpeg', ptt: false });
    return true;
  } catch (error) {
    logToFile('❌ Baileys: error sending audio', { error: error.message });
    return false;
  }
}

async function sendDocumentFromUrl(to, documentUrl, filename, caption) {
  try {
    const media = await resolveMediaSource(documentUrl);
    return await sendDocumentBuffer(to, media, filename, caption);
  } catch (error) {
    logToFile('❌ Baileys: error sending document from URL', { error: error.message, documentUrl });
    return false;
  }
}

async function sendAudioFromUrl(to, audioUrl) {
  try {
    const media = await resolveMediaSource(audioUrl);
    return await sendAudio(to, media);
  } catch (error) {
    logToFile('❌ Baileys: error sending audio from URL', { error: error.message, audioUrl });
    return false;
  }
}

// ── *ReturningId variants ───────────────────────────────────────────────────
// These return the sent message's ID (or null) instead of a boolean, because
// callers thread that ID back in as a reply/quote target. Meta returns it as
// data.messages[0].id; Baileys returns it as the sent message's key.id.

async function sendTextReturningId(to, message, opts = {}) {
  try {
    const cleanMessage = IMPLEMENTATIONS._removeEmotionTags(message);
    const sock = await getSock();

    // Meta quotes by bare message ID. Baileys wants a message object, so build
    // the minimal stub its contextInfo builder needs. Best-effort: if it can't
    // resolve the target the message still sends, just unquoted.
    const sendOpts = {};
    if (opts.contextMessageId) {
      sendOpts.quoted = {
        key: { remoteJid: toJid(to), id: opts.contextMessageId, fromMe: false },
        message: {},
      };
    }

    const sent = await sock.sendMessage(toJid(to), { text: cleanMessage }, sendOpts);
    const id = sent?.key?.id || null;
    logToFile('✅ Baileys message sent (returning id)', { to, id });
    return id;
  } catch (error) {
    logToFile('❌ Baileys: error sending message (returning id)', { error: error.message });
    return null;
  }
}

async function sendAudioFromUrlReturningId(to, audioUrl) {
  try {
    const media = await resolveMediaSource(audioUrl);
    const sock = await getSock();
    const sent = await sock.sendMessage(toJid(to), {
      audio: media, mimetype: 'audio/mp4', ptt: true,
    });
    const id = sent?.key?.id || null;
    logToFile('✅ Baileys audio sent (returning id)', { to, id });
    return id;
  } catch (error) {
    logToFile('❌ Baileys: error sending audio from URL (returning id)', { error: error.message, audioUrl });
    return null;
  }
}

async function sendImageBuffer(to, buffer, caption) {
  const sock = await getSock();
  await sock.sendMessage(toJid(to), { image: buffer, caption });
  return true;
}

async function sendImageFromUrl(to, imageUrl, caption = '') {
  try {
    const media = await resolveMediaSource(imageUrl);
    return await sendImageBuffer(to, media, caption);
  } catch (error) {
    logToFile('❌ Baileys: error sending image from URL', { error: error.message, imageUrl });
    return false;
  }
}

async function sendVideo(to, videoBuffer, tempDir, caption = '') {
  try {
    const sock = await getSock();
    await sock.sendMessage(toJid(to), { video: videoBuffer, caption: caption || undefined });
    return true;
  } catch (error) {
    logToFile('❌ Baileys: error sending video', { error: error.message });
    return false;
  }
}

async function sendVideoFromUrl(to, videoUrl, caption = '') {
  try {
    const media = await resolveMediaSource(videoUrl);
    return await sendVideo(to, media, null, caption);
  } catch (error) {
    logToFile('❌ Baileys: error sending video from URL', { error: error.message, videoUrl });
    return false;
  }
}

async function sendImage(to, mediaIdOrPath, caption = '') {
  const isFilePath = mediaIdOrPath.includes('/') || mediaIdOrPath.includes('\\');
  if (!isFilePath) {
    logToFile(
      '❌ Baileys: sendImage was given a Meta media ID, not a file path/URL — Baileys has no '
      + 'reusable media-ID upload step, so cached-ID reuse is not supported on this channel',
      { mediaIdOrPath }
    );
    return false;
  }
  try {
    const buffer = fs.readFileSync(mediaIdOrPath);
    return await sendImageBuffer(to, buffer, caption);
  } catch (error) {
    logToFile('❌ Baileys: error sending image', { error: error.message });
    return false;
  }
}

async function sendSticker(to, mediaIdOrPath) {
  const isFilePath = mediaIdOrPath.includes('/') || mediaIdOrPath.includes('\\');
  if (!isFilePath) {
    logToFile('❌ Baileys: sendSticker was given a Meta media ID, not a file path — not supported on this channel', { mediaIdOrPath });
    return false;
  }
  if (!fs.existsSync(mediaIdOrPath)) {
    logToFile('Sticker file not found — skipping sticker send (cosmetic)', { path: mediaIdOrPath });
    return false;
  }
  try {
    const buffer = fs.readFileSync(mediaIdOrPath);
    const sock = await getSock();
    await sock.sendMessage(toJid(to), { sticker: buffer });
    return true;
  } catch (error) {
    logToFile('❌ Baileys: error sending sticker', { error: error.message });
    return false;
  }
}

async function sendInteractiveButtons(to, options) {
  try {
    const { body, buttons } = options;
    const text = renderOptionsAsText({ body, options: buttons.map((b) => ({ title: b.title })) });
    await rememberMenu(to, 'button_reply', buttons);
    return await sendMessage(to, text);
  } catch (error) {
    logToFile('❌ Baileys: error sending interactive buttons (text fallback)', { error: error.message });
    return false;
  }
}

async function sendImageWithButtons(to, imageUrl, bodyText, buttons) {
  try {
    const media = await resolveMediaSource(imageUrl);
    const caption = renderOptionsAsText({ body: bodyText, options: buttons.map((b) => ({ title: b.title })) });
    await rememberMenu(to, 'button_reply', buttons);
    return await sendImageBuffer(to, media, caption);
  } catch (error) {
    logToFile('❌ Baileys: error sending image with buttons (text fallback)', { error: error.message, imageUrl });
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
    logToFile('❌ Baileys: error sending interactive list (text fallback)', { error: error.message });
    return false;
  }
}

// `id` values MUST match meta-channel.service.js's rows exactly — they are what
// whatsapp-bot.js's `listId.startsWith('lang_')` branch dispatches on, and
// rememberMenu() below stores them so a numeric reply resolves to the same id
// Meta's native list picker would have sent.
const DEFAULT_PICKER_CODES = ['en', 'ur', 'pa-PK', 'sd-PK', 'ps-PK', 'bal-PK', 'ta-LK', 'ar', 'es'];

/**
 * Resolves which language codes to offer, from `config/supported-languages.js`
 * and the region's config (fail-open) — the SAME source of truth Meta's driver
 * uses, deliberately NOT a hardcoded list.
 *
 * This mattered: the first version of this driver hardcoded 10 languages copied
 * from whatsapp.service.js as it looked before `feat(languages): add
 * Indian-language support` landed on main. That silently dropped hi/bn/mr/te/
 * ta-IN/kn for anyone in the India region. Reading the shared config means new
 * languages appear here automatically.
 *
 * Unlike Meta, there is NO 10-row cap to respect — this renders as plain text,
 * so every language the region supports can be listed.
 */
async function resolveLanguageOptions(region = null) {
  // eslint-disable-next-line global-require -- lazy, matching this file's convention
  const { LANGUAGES, SUPPORTED_LANGUAGES } = require('../../config/supported-languages');

  let codes = DEFAULT_PICKER_CODES;
  try {
    // eslint-disable-next-line global-require -- lazy: avoids a DB-backed service on module load
    const RegionFeaturesService = require('../region-features.service');
    const feats = await RegionFeaturesService.getRegionFeatures(region);
    const fromRegion = Array.isArray(feats.supported_languages)
      ? feats.supported_languages.filter((c) => SUPPORTED_LANGUAGES.includes(c))
      : [];
    // Only trust the region list when it is more specific than the trivial
    // ['en'] fail-open default.
    if (fromRegion.length > 1) codes = fromRegion;
  } catch (error) {
    logToFile('Baileys language picker: region lookup failed, using default set', { error: error.message });
  }

  return [
    { id: 'lang_auto', title: 'Auto-detect', description: 'Let me detect your language automatically' },
    ...codes.map((code) => ({
      id: `lang_${code}`,
      title: LANGUAGES[code]?.native || code,
      description: `${LANGUAGES[code]?.english || code} language`,
    })),
  ];
}

async function sendLanguageSelectionList(to, currentLanguage = 'en', region = null) {
  try {
    const options = await resolveLanguageOptions(region);
    const text = renderOptionsAsText({
      header: 'Select Language / زبان منتخب کریں',
      body: 'Choose your preferred language. I will respond in this language for all conversations.',
      footer: 'You can change this anytime by typing /language',
      options,
    });
    await rememberMenu(to, 'list_reply', options);
    return await sendMessage(to, text);
  } catch (error) {
    logToFile('❌ Baileys: error sending language selection list', { error: error.message });
    return false;
  }
}

const STYLE_OPTIONS = [
  { id: 'style_photorealistic', title: 'Photorealistic', description: 'Camera-quality, HDR, 8K realistic images' },
  { id: 'style_infographic', title: 'Infographic', description: 'TED-Ed/Kurzgesagt flat vector style' },
  { id: 'style_cartoon', title: 'Cartoon', description: 'Pixar-inspired animated characters' },
  { id: 'style_sketch', title: 'Sketch', description: 'Whiteboard hand-drawn style' },
];

async function sendStyleListFallback(to) {
  try {
    const text = renderOptionsAsText({ header: '🎨 Choose Video Style', options: STYLE_OPTIONS });
    await rememberMenu(to, 'list_reply', STYLE_OPTIONS);
    return await sendMessage(to, text);
  } catch (error) {
    logToFile('❌ Baileys: error sending style list fallback', { error: error.message });
    return false;
  }
}

const FEATURE_MENU_OPTIONS = [
  { id: 'menu_lesson_plan', title: 'Lesson Plans', description: 'Create detailed PDF lesson plans' },
  { id: 'menu_coaching', title: 'Classroom Coaching', description: 'Get teaching feedback from recordings' },
  { id: 'menu_reading', title: 'Reading Assessment', description: 'Test student reading fluency' },
  { id: 'menu_video', title: 'AI Video Generation', description: 'Create educational videos' },
  { id: 'menu_other', title: 'Ask Anything', description: 'General teaching questions' },
];

async function sendFeatureMenuListFallback(to) {
  try {
    const text = renderOptionsAsText({ header: "Here's what I can do!", options: FEATURE_MENU_OPTIONS });
    await rememberMenu(to, 'list_reply', FEATURE_MENU_OPTIONS);
    return await sendMessage(to, text);
  } catch (error) {
    logToFile('❌ Baileys: error sending feature menu list fallback', { error: error.message });
    return false;
  }
}

function notSupportedMessage(methodName) {
  return `Baileys channel driver: ${methodName}() has no equivalent yet — it needs the channel-agnostic `
    + 'template registry from docs/onboarding/sandbox-production-design.md §1, which is not built. '
    + 'The template\'s static wording lives only in Meta\'s registered config, not in this call\'s arguments.';
}

// ── Explicit method table ────────────────────────────────────────────────────
// Every parsed member (see MEMBERS below) must appear in exactly one of these
// two tables, checked by the assertion loop below.

const IMPLEMENTATIONS = {
  _removeEmotionTags(text) {
    return text.replace(/\[[a-zA-Z\s]+\]\s*/g, '').trim();
  },
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
  return async function baileysStub(...args) {
    logToFile(notSupportedMessage(methodName), { methodName, driver: 'baileys' });
    return false;
  };
}

function syncNullStub(methodName) {
  return function baileysSyncStub(...args) {
    logToFile(notSupportedMessage(methodName), { methodName, driver: 'baileys' });
    return null;
  };
}

const BaileysChannel = {};

for (const { name, isAsync } of MEMBERS) {
  if (Object.prototype.hasOwnProperty.call(IMPLEMENTATIONS, name)) {
    BaileysChannel[name] = IMPLEMENTATIONS[name];
  } else if (Object.prototype.hasOwnProperty.call(STUBS, name)) {
    const stubIsAsync = STUBS[name];
    if (stubIsAsync !== isAsync) {
      throw new Error(
        `baileys-channel.service.js: "${name}" is registered as ${stubIsAsync ? 'async' : 'sync'} in STUBS but `
        + `meta-channel.service.js now declares it ${isAsync ? 'async' : 'sync'} — update STUBS to match.`
      );
    }
    BaileysChannel[name] = stubIsAsync ? asyncFalseStub(name) : syncNullStub(name);
  } else {
    throw new Error(
      `baileys-channel.service.js: meta-channel.service.js declares "${name}" with no matching entry in `
      + 'IMPLEMENTATIONS or STUBS. Add one so this driver never silently lacks a method the rest of the bot calls.'
    );
  }
}

BaileysChannel._cacheIncomingMedia = cacheIncomingMedia;
BaileysChannel._toJid = toJid;
BaileysChannel._sendTextFlowStep = sendTextFlowStep;
BaileysChannel._kindFromToken = kindFromToken;

module.exports = BaileysChannel;
