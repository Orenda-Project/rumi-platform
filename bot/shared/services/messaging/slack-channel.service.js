/**
 * Slack channel driver — usable in BOTH sandbox and production (unlike
 * Baileys, which is sandbox-only, and Meta, which is production-only). A
 * Slack app has no formal business-verification process the way WhatsApp
 * Business does, so there is no tier split here — see channel-registry.js's
 * PRODUCTION_TIER_DRIVERS.
 *
 * Unlike Baileys, Slack CAN render real interactive components (buttons,
 * select menus) natively — so sendInteractiveButtons/sendInteractiveMessage
 * are REAL Block Kit implementations here, not a text degradation. A
 * button's Slack `value` carries the exact same `id` Meta's button_reply
 * would have used, so the inbound adapter (slack-events.adapter.js) can
 * synthesize the identical internal shape whatsapp-bot.js already dispatches
 * on, with no numeric-reply resolution step needed (that machinery —
 * pending-options.js — exists only because Baileys' native components are
 * unreliable and must degrade to numbered text; Slack has no such problem).
 *
 * Method names/async-ness are parsed statically off meta-channel.service.js's
 * SOURCE (same mechanism baileys-channel.service.js and
 * tests/messaging/channel-driver-parity.test.js use) rather than by
 * `require()`-ing that module — meta-channel.service.js pulls in axios/
 * form-data, neither of which this driver needs. If meta-channel.service.js
 * ever grows a new method this file doesn't know about, requiring this file
 * throws immediately (see the assertion loop at the bottom) rather than
 * silently shipping a missing/wrong-shaped member.
 *
 * Identity: `to` always arrives as the full "slack:<slack-user-id>"
 * identifier the messaging router (messaging/index.js) dispatches by — this
 * driver strips the prefix once, internally, and never receives a bare
 * Slack user id directly (see channel-registry.js's CHANNEL_PREFIXES).
 *
 * Templates/Flow/carousels have no Slack equivalent without the
 * channel-agnostic template registry from
 * docs/onboarding/sandbox-production-design.md §1 (not built) — those stay
 * honest stubs, same contract as Baileys' stubs for the same methods. The
 * real Flow-equivalent (Slack Block Kit MODALS for registration/settings) is
 * a separate renderer layered on top of this driver, not part of it — see
 * slack-modal-flow.js.
 */

const fs = require('fs');
const path = require('path');
const { logToFile } = require('../../utils/logger');
const { downloadFromR2, extractKeyFromUrl } = require('../../storage/r2');
const { prefixFor } = require('./channel-registry');

const META_SOURCE_PATH = path.join(__dirname, 'meta-channel.service.js');
const SLACK_PREFIX = prefixFor('slack'); // 'slack' — kept indirect so a rename to CHANNEL_PREFIXES stays a one-line fix

function parseMembers(src) {
  const members = [];
  const methodRe = /^\s*static\s+(async\s+)?(\w+)\s*\(/gm;
  let m;
  while ((m = methodRe.exec(src))) members.push({ name: m[2], isAsync: !!m[1] });
  return members;
}

const MEMBERS = parseMembers(fs.readFileSync(META_SOURCE_PATH, 'utf-8'));

/** Strips the "slack:" prefix the router hands every method — never received bare. */
function slackUserId(to) {
  const raw = String(to);
  const withPrefix = `${SLACK_PREFIX}:`;
  return raw.startsWith(withPrefix) ? raw.slice(withPrefix.length) : raw;
}

// ── Slack Web API client (lazy) ──────────────────────────────────────────────
// Mirrors baileys-connection.js's lazy-require convention: nothing touches
// @slack/web-api until a send actually happens, and tests can jest.doMock
// this module cleanly without a real network client ever being constructed.
let cachedClient = null;
function getClient() {
  if (cachedClient) return cachedClient;
  // eslint-disable-next-line global-require -- lazy on purpose; see file header
  const { WebClient } = require('@slack/web-api');
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) {
    throw new Error('Slack channel driver: SLACK_BOT_TOKEN is not set');
  }
  cachedClient = new WebClient(token);
  return cachedClient;
}

// ── DM channel resolution (cached) ───────────────────────────────────────────
// Slack addresses a person by a CHANNEL id, not their user id directly — a DM
// requires opening (or reusing) a conversation first. Cached per-process so
// repeated sends to the same person don't re-open the DM every time.
const dmChannelCache = new Map(); // slackUserId -> channelId

async function getDmChannelId(userId) {
  if (dmChannelCache.has(userId)) return dmChannelCache.get(userId);
  const client = getClient();
  const result = await client.conversations.open({ users: userId });
  const channelId = result?.channel?.id;
  if (!channelId) throw new Error(`Slack: could not open a DM with user ${userId}`);
  dmChannelCache.set(userId, channelId);
  return channelId;
}

// ── Media sources (mirrors baileys-channel.service.js's resolveMediaSource) ──

function isAbsoluteHttpUrl(url) {
  return /^https?:\/\//i.test(String(url || ''));
}

function isR2Configured() {
  return Boolean(
    process.env.R2_ENDPOINT && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY
  );
}

/**
 * Resolves a media reference into a Buffer Slack's files.uploadV2 can send.
 * Slack (unlike WhatsApp) has no "hand me a URL and I'll fetch it" upload
 * mode for a private bucket, so unlike Baileys' resolveMediaSource this
 * always returns a Buffer, never `{ url }`.
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
      logToFile('⚠️ Slack: R2 download failed — fetching the URL directly instead', {
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

// ── Real implementations ─────────────────────────────────────────────────────

function removeEmotionTags(text) {
  return text.replace(/\[[a-zA-Z\s]+\]\s*/g, '').trim();
}

async function sendMessage(to, message) {
  try {
    const client = getClient();
    const channel = await getDmChannelId(slackUserId(to));
    await client.chat.postMessage({ channel, text: removeEmotionTags(message) });
    logToFile('✅ Slack message sent', { to });
    return true;
  } catch (error) {
    logToFile('❌ Slack: error sending message', { error: error.message });
    return false;
  }
}

async function sendTextReturningId(to, message, opts = {}) {
  try {
    const client = getClient();
    const channel = await getDmChannelId(slackUserId(to));
    const payload = { channel, text: removeEmotionTags(message) };
    // Slack's quote-equivalent is a threaded reply, not an inline quote.
    if (opts.contextMessageId) payload.thread_ts = opts.contextMessageId;
    const result = await client.chat.postMessage(payload);
    return result?.ts || null;
  } catch (error) {
    logToFile('❌ Slack: error sending message (returning id)', { error: error.message });
    return null;
  }
}

async function sendReaction(to, messageId, emoji = 'heart') {
  try {
    const client = getClient();
    const channel = await getDmChannelId(slackUserId(to));
    // Slack reaction names are bare emoji shortcodes (no colons); a caller
    // passing a literal unicode glyph (Meta's convention) is mapped to a
    // close Slack equivalent for the common cases, falling back to a plain
    // name if it's already shortcode-shaped.
    const name = EMOJI_TO_SLACK_NAME[emoji] || String(emoji).replace(/:/g, '');
    await client.reactions.add({ channel, timestamp: messageId, name });
    return true;
  } catch (error) {
    logToFile('❌ Slack: error sending reaction', { error: error.message });
    return false;
  }
}

const EMOJI_TO_SLACK_NAME = {
  '❤️': 'heart',
  '👍': '+1',
  '👎': '-1',
  '😊': 'blush',
};

// Slack has no bot typing-indicator API (unlike WhatsApp's presence update) —
// honest no-op, logged once per call so it's visible in diagnostics without
// spamming on every message.
async function showTypingIndicator() {
  logToFile('ℹ️ Slack channel driver: no typing-indicator API for bots — no-op');
  return true;
}

function startContinuousTypingIndicator() {
  return { stop: () => {} };
}

async function getMediaInfo(mediaId) {
  const client = getClient();
  const result = await client.files.info({ file: mediaId });
  const file = result?.file;
  if (!file) throw new Error(`Slack: no file info for id "${mediaId}"`);
  return { url: file.url_private, mime_type: file.mimetype, file_size: file.size };
}

async function downloadMedia(mediaId) {
  const info = await getMediaInfo(mediaId);
  const response = await fetch(info.url, {
    headers: { Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}` },
  });
  if (!response.ok) throw new Error(`Slack: file download failed, HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

async function uploadFile(to, buffer, filename, caption) {
  const client = getClient();
  const channel = await getDmChannelId(slackUserId(to));
  await client.files.uploadV2({
    channel_id: channel,
    file: buffer,
    filename,
    initial_comment: caption || undefined,
  });
  return true;
}

async function sendDocument(to, filePath, filename, caption) {
  try {
    const buffer = fs.readFileSync(filePath);
    return await uploadFile(to, buffer, filename, caption);
  } catch (error) {
    logToFile('❌ Slack: error sending document', { error: error.message });
    return false;
  }
}

async function sendAudio(to, audioBuffer) {
  try {
    return await uploadFile(to, audioBuffer, 'audio.mp3');
  } catch (error) {
    logToFile('❌ Slack: error sending audio', { error: error.message });
    return false;
  }
}

async function sendDocumentFromUrl(to, documentUrl, filename, caption) {
  try {
    const buffer = await resolveMediaBuffer(documentUrl);
    return await uploadFile(to, buffer, filename, caption);
  } catch (error) {
    logToFile('❌ Slack: error sending document from URL', { error: error.message, documentUrl });
    return false;
  }
}

async function sendAudioFromUrl(to, audioUrl) {
  try {
    const buffer = await resolveMediaBuffer(audioUrl);
    return await uploadFile(to, buffer, 'audio.mp3');
  } catch (error) {
    logToFile('❌ Slack: error sending audio from URL', { error: error.message, audioUrl });
    return false;
  }
}

async function sendAudioFromUrlReturningId(to, audioUrl) {
  try {
    const client = getClient();
    const channel = await getDmChannelId(slackUserId(to));
    const buffer = await resolveMediaBuffer(audioUrl);
    const result = await client.files.uploadV2({ channel_id: channel, file: buffer, filename: 'audio.mp3' });
    // files.uploadV2 returns per-file metadata, not a chat message ts — the
    // closest analogue Slack has to "the sent item's id" for a file share.
    return result?.files?.[0]?.id || null;
  } catch (error) {
    logToFile('❌ Slack: error sending audio from URL (returning id)', { error: error.message, audioUrl });
    return null;
  }
}

async function sendImageFromUrl(to, imageUrl, caption = '') {
  try {
    const buffer = await resolveMediaBuffer(imageUrl);
    return await uploadFile(to, buffer, 'image.png', caption);
  } catch (error) {
    logToFile('❌ Slack: error sending image from URL', { error: error.message, imageUrl });
    return false;
  }
}

async function sendVideo(to, videoBuffer, tempDir, caption = '') {
  try {
    return await uploadFile(to, videoBuffer, 'video.mp4', caption);
  } catch (error) {
    logToFile('❌ Slack: error sending video', { error: error.message });
    return false;
  }
}

async function sendVideoFromUrl(to, videoUrl, caption = '') {
  try {
    const buffer = await resolveMediaBuffer(videoUrl);
    return await uploadFile(to, buffer, 'video.mp4', caption);
  } catch (error) {
    logToFile('❌ Slack: error sending video from URL', { error: error.message, videoUrl });
    return false;
  }
}

async function sendImage(to, mediaIdOrPath, caption = '') {
  const isFilePath = mediaIdOrPath.includes('/') || mediaIdOrPath.includes('\\');
  if (!isFilePath) {
    logToFile(
      '❌ Slack: sendImage was given a Meta media ID, not a file path/URL — Slack has no reusable '
      + 'media-ID upload step, so cached-ID reuse is not supported on this channel',
      { mediaIdOrPath }
    );
    return false;
  }
  try {
    const buffer = fs.readFileSync(mediaIdOrPath);
    return await uploadFile(to, buffer, path.basename(mediaIdOrPath), caption);
  } catch (error) {
    logToFile('❌ Slack: error sending image', { error: error.message });
    return false;
  }
}

async function sendSticker(to, mediaIdOrPath) {
  const isFilePath = mediaIdOrPath.includes('/') || mediaIdOrPath.includes('\\');
  if (!isFilePath) {
    logToFile('❌ Slack: sendSticker was given a Meta media ID, not a file path — not supported on this channel', { mediaIdOrPath });
    return false;
  }
  if (!fs.existsSync(mediaIdOrPath)) {
    logToFile('Sticker file not found — skipping sticker send (cosmetic)', { path: mediaIdOrPath });
    return false;
  }
  try {
    const buffer = fs.readFileSync(mediaIdOrPath);
    return await uploadFile(to, buffer, path.basename(mediaIdOrPath));
  } catch (error) {
    logToFile('❌ Slack: error sending sticker', { error: error.message });
    return false;
  }
}

// ── Real interactive components (Block Kit) ─────────────────────────────────
// Unlike Baileys, these are genuine native components, not a text
// degradation — a button's `value` carries the exact `id` Meta's
// button_reply would have used, and slack-events.adapter.js reads it
// straight off the block_actions payload with no menu-bookkeeping needed.

async function sendInteractiveButtons(to, options) {
  try {
    const client = getClient();
    const channel = await getDmChannelId(slackUserId(to));
    const { body, buttons } = options;

    const blocks = [
      { type: 'section', text: { type: 'mrkdwn', text: body } },
      {
        type: 'actions',
        elements: buttons.map((btn) => ({
          type: 'button',
          text: { type: 'plain_text', text: btn.title.substring(0, 75) },
          value: btn.id,
          action_id: btn.id,
        })),
      },
    ];
    await client.chat.postMessage({ channel, text: body, blocks });
    return true;
  } catch (error) {
    logToFile('❌ Slack: error sending interactive buttons', { error: error.message });
    return false;
  }
}

async function sendImageWithButtons(to, imageUrl, bodyText, buttons) {
  try {
    const client = getClient();
    const channel = await getDmChannelId(slackUserId(to));
    const buffer = await resolveMediaBuffer(imageUrl);
    // Slack files can't carry inline block actions directly, so the image is
    // uploaded first and the button prompt follows as its own message — the
    // closest native equivalent to Meta's single image+buttons bubble.
    await uploadFile(to, buffer, 'image.png');
    const blocks = [
      { type: 'section', text: { type: 'mrkdwn', text: bodyText } },
      {
        type: 'actions',
        elements: buttons.map((btn) => ({
          type: 'button',
          text: { type: 'plain_text', text: btn.title.substring(0, 75) },
          value: btn.id,
          action_id: btn.id,
        })),
      },
    ];
    await client.chat.postMessage({ channel, text: bodyText, blocks });
    return true;
  } catch (error) {
    logToFile('❌ Slack: error sending image with buttons', { error: error.message, imageUrl });
    return false;
  }
}

async function sendInteractiveMessage(to, listData) {
  try {
    const client = getClient();
    const channel = await getDmChannelId(slackUserId(to));
    const { header, body, footer, action } = listData;
    const { sections } = action || {};
    const options = (sections || []).flatMap((s) => s.rows || []);

    if (!options.length) {
      logToFile('⚠️ Slack: no options provided for interactive list', { listData });
      return false;
    }

    const headerText = header?.text || header;
    const bodyText = body?.text || body;
    const footerText = footer?.text || footer;

    const blocks = [];
    if (headerText) blocks.push({ type: 'header', text: { type: 'plain_text', text: String(headerText).slice(0, 150) } });
    if (bodyText) blocks.push({ type: 'section', text: { type: 'mrkdwn', text: bodyText } });
    blocks.push({
      type: 'actions',
      elements: [{
        type: 'static_select',
        action_id: 'list_select',
        placeholder: { type: 'plain_text', text: action?.button || 'Choose an option' },
        options: options.slice(0, 100).map((opt) => ({
          text: { type: 'plain_text', text: String(opt.title).slice(0, 75) },
          value: opt.id,
        })),
      }],
    });
    if (footerText) blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: footerText }] });

    await client.chat.postMessage({ channel, text: bodyText || headerText || 'Please choose an option', blocks });
    return true;
  } catch (error) {
    logToFile('❌ Slack: error sending interactive list', { error: error.message });
    return false;
  }
}

async function sendLanguageSelectionList(to, currentLanguage = 'en', region = null) {
  // eslint-disable-next-line global-require -- lazy, matching baileys-channel.service.js's convention
  const { LANGUAGES, SUPPORTED_LANGUAGES } = require('../../config/supported-languages');

  const DEFAULT_PICKER_CODES = ['en', 'ur', 'pa-PK', 'sd-PK', 'ps-PK', 'bal-PK', 'ta-LK', 'ar', 'es'];
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
    logToFile('Slack language picker: region lookup failed, using default set', { error: error.message });
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
  return `Slack channel driver: ${methodName}() has no equivalent yet — it needs the channel-agnostic `
    + 'template registry from docs/onboarding/sandbox-production-design.md §1, which is not built. '
    + 'The template\'s static wording lives only in Meta\'s registered config, not in this call\'s arguments.';
}

/**
 * The Flow-equivalent (Block Kit modals) lives in slack-modal-flow.js as a
 * SEPARATE renderer, not inside this driver — matching the plan's decision
 * that a modal round-trips through Slack's Interactivity Request URL, not
 * through a sendFlow() call. sendFlow() itself stays an honest stub here so
 * any caller still branching on its Meta-shaped return value degrades
 * safely rather than throwing.
 */
async function sendFlow() {
  logToFile('Slack channel driver: sendFlow() has no direct equivalent — Flow-shaped forms render as a '
    + 'Block Kit modal via slack-modal-flow.js, triggered by a button click, not by this call.');
  return false;
}

// ── Explicit method table ────────────────────────────────────────────────────
// Every parsed member (see MEMBERS below) must appear in exactly one of these
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
  return async function slackStub(...args) {
    logToFile(notSupportedMessage(methodName), { methodName, driver: 'slack' });
    return false;
  };
}

function syncNullStub(methodName) {
  return function slackSyncStub(...args) {
    logToFile(notSupportedMessage(methodName), { methodName, driver: 'slack' });
    return null;
  };
}

const SlackChannel = {};

for (const { name, isAsync } of MEMBERS) {
  if (Object.prototype.hasOwnProperty.call(IMPLEMENTATIONS, name)) {
    SlackChannel[name] = IMPLEMENTATIONS[name];
  } else if (Object.prototype.hasOwnProperty.call(STUBS, name)) {
    const stubIsAsync = STUBS[name];
    if (stubIsAsync !== isAsync) {
      throw new Error(
        `slack-channel.service.js: "${name}" is registered as ${stubIsAsync ? 'async' : 'sync'} in STUBS but `
        + `meta-channel.service.js now declares it ${isAsync ? 'async' : 'sync'} — update STUBS to match.`
      );
    }
    SlackChannel[name] = stubIsAsync ? asyncFalseStub(name) : syncNullStub(name);
  } else {
    throw new Error(
      `slack-channel.service.js: meta-channel.service.js declares "${name}" with no matching entry in `
      + 'IMPLEMENTATIONS or STUBS. Add one so this driver never silently lacks a method the rest of the bot calls.'
    );
  }
}

SlackChannel._slackUserId = slackUserId;
SlackChannel._getDmChannelId = getDmChannelId;

module.exports = SlackChannel;
