/**
 * Discord channel driver — usable in BOTH sandbox and production, same
 * reasoning as Slack: a Discord bot has no formal review gate for the
 * permission scopes this bot needs, so there is no tier split here (see
 * channel-registry.js's PRODUCTION_TIER_DRIVERS).
 *
 * Unlike Baileys, Discord CAN render real interactive components (buttons,
 * select menus) natively — so sendInteractiveButtons/sendInteractiveMessage
 * are REAL discord.js component implementations here, not a text degradation.
 * A button's Discord `customId` carries the exact same `id` Meta's
 * button_reply would have used, so the inbound adapter
 * (discord-events.adapter.js) can synthesize the identical internal shape
 * whatsapp-bot.js already dispatches on, with no numeric-reply resolution
 * step needed (mirrors Slack's own reasoning, not Baileys').
 *
 * Method names/async-ness are parsed statically off meta-channel.service.js's
 * SOURCE (the same mechanism slack-channel.service.js and
 * baileys-channel.service.js use) rather than by `require()`-ing that
 * module — meta-channel.service.js pulls in axios/form-data, neither of
 * which this driver needs. If meta-channel.service.js ever grows a new
 * method this file doesn't know about, requiring this file throws
 * immediately (see the assertion loop at the bottom) rather than silently
 * shipping a missing/wrong-shaped member.
 *
 * Identity: `to` always arrives as the full "discord:<snowflake>" identifier
 * the messaging router (messaging/index.js) dispatches by — this driver
 * strips the prefix once, internally, and never receives a bare Discord user
 * id directly (see channel-registry.js's CHANNEL_PREFIXES).
 *
 * Real divergences from Slack's driver, all deliberate:
 *   - showTypingIndicator/startContinuousTypingIndicator are REAL here
 *     (Discord has channel.sendTyping()) — Slack has no typing API at all
 *     and stubs both.
 *   - getMediaInfo/downloadMedia read from an in-process cache the inbound
 *     adapter populates at receive time (discord-events.adapter.js caches
 *     {url, mime_type, file_size} keyed by the same prefixed media id it
 *     mints), NOT a live API lookup — Discord attachments are
 *     self-describing at receive time (attachment.url/.contentType/.size),
 *     unlike Slack's files.info, which needs a real API call because Slack
 *     file ids are not self-describing on their own. downloadMedia needs NO
 *     Bearer auth header either — Discord CDN attachment URLs are
 *     pre-signed/public for their lifetime, unlike Slack's private,
 *     auth-gated file URLs.
 *   - sendReaction accepts a literal unicode emoji directly — no
 *     shortcode-translation table needed (Slack needs EMOJI_TO_SLACK_NAME
 *     because Slack reaction names are bare shortcodes, not unicode).
 *   - sendVideo is a REAL, size-gated implementation (not a stub or a
 *     straight upload) — see its own doc comment.
 *
 * Templates/Flow/carousels have no Discord equivalent without the
 * channel-agnostic template registry from
 * docs/onboarding/sandbox-production-design.md §1 (not built) — those stay
 * honest stubs, same contract as Slack's/Baileys' stubs for the same
 * methods. The real Flow-equivalent (Discord modal-workaround flows for
 * registration/settings/attendance/exam-confirm) is a separate renderer
 * layered on top of this driver, not part of it — see discord-modal-flow.js.
 */

const fs = require('fs');
const path = require('path');
const { logToFile } = require('../../utils/logger');
const { downloadFromR2, extractKeyFromUrl } = require('../../storage/r2');
const { prefixFor } = require('./channel-registry');

const META_SOURCE_PATH = path.join(__dirname, 'meta-channel.service.js');
const DISCORD_PREFIX = prefixFor('discord'); // 'discord' — kept indirect so a rename to CHANNEL_PREFIXES stays a one-line fix

function parseMembers(src) {
  const members = [];
  const methodRe = /^\s*static\s+(async\s+)?(\w+)\s*\(/gm;
  let m;
  while ((m = methodRe.exec(src))) members.push({ name: m[2], isAsync: !!m[1] });
  return members;
}

const MEMBERS = parseMembers(fs.readFileSync(META_SOURCE_PATH, 'utf-8'));

/** Strips the "discord:" prefix the router hands every method — never received bare. */
function discordUserId(to) {
  const raw = String(to);
  const withPrefix = `${DISCORD_PREFIX}:`;
  return raw.startsWith(withPrefix) ? raw.slice(withPrefix.length) : raw;
}

// Media ids carry the same "discord:" prefix as user identities (minted by
// discord-events.adapter.js#toPrefixedMediaId) so the messaging router can
// tell a Discord attachment id apart from a WhatsApp media id with no DB
// lookup. Stripped here, once, before ever touching the media cache.
const stripDiscordPrefix = discordUserId;

// ── Discord Gateway client (shared, NOT constructed here) ───────────────────
// Unlike Slack's getClient() (a fresh, stateless WebClient per-process —
// Slack has no persistent connection to share), this driver must reuse the
// SINGLE already-connected client discord-connection.js owns. A second
// `new Client()` for the same bot token would open a second Gateway
// connection for that token — undefined/broken behaviour, not just
// wasteful. See discord-connection.js's own header comment.
async function getClient() {
  const connection = require('./discord-connection');
  return connection.getClient();
}

// ── User resolution (cached) ─────────────────────────────────────────────────
// Discord.js caches fetched User objects on its own (client.users.cache), so
// this is a thin convenience wrapper, not a from-scratch cache the way
// Slack's dmChannelCache is (Slack addresses a person by a resolved DM
// CHANNEL id, which has no equivalent caching inside @slack/web-api itself).
async function getDiscordUser(userId) {
  const client = await getClient();
  const user = await client.users.fetch(userId);
  if (!user) throw new Error(`Discord: could not resolve user ${userId}`);
  return user;
}

// ── Media sources (mirrors slack-channel.service.js's resolveMediaBuffer) ───

function isAbsoluteHttpUrl(url) {
  return /^https?:\/\//i.test(String(url || ''));
}

function isR2Configured() {
  return Boolean(
    process.env.R2_ENDPOINT && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY
  );
}

/**
 * Resolves a media reference into a Buffer discord.js's `files` send option
 * can attach. Identical logic to Slack's resolveMediaBuffer — it has zero
 * Slack-specific code, so it is copied verbatim here rather than shared
 * (matches this codebase's existing convention of each driver owning its own
 * copy of this helper, not importing it cross-driver).
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
      logToFile('⚠️ Discord: R2 download failed — fetching the URL directly instead', {
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

/** Surfaces discord.js's DiscordAPIError detail so a permission/intent problem is diagnosable from the log line alone. */
function discordErrorDetail(error) {
  if (error?.code) return { code: error.code, message: error.message };
  return { message: error?.message };
}

async function sendMessage(to, message) {
  try {
    const user = await getDiscordUser(discordUserId(to));
    await user.send({ content: removeEmotionTags(message) });
    logToFile('✅ Discord message sent', { to });
    return true;
  } catch (error) {
    logToFile('❌ Discord: error sending message', { ...discordErrorDetail(error) });
    return false;
  }
}

async function sendTextReturningId(to, message, opts = {}) {
  try {
    const user = await getDiscordUser(discordUserId(to));
    const payload = { content: removeEmotionTags(message) };
    // Discord's quote-equivalent is a real message reply, not an
    // approximated thread the way Slack's thread_ts is.
    if (opts.contextMessageId) payload.reply = { messageReference: opts.contextMessageId };
    const sent = await user.send(payload);
    return sent?.id || null;
  } catch (error) {
    logToFile('❌ Discord: error sending message (returning id)', { ...discordErrorDetail(error) });
    return null;
  }
}

async function sendReaction(to, messageId, emoji = '❤️') {
  // Slash-command interactions have no real Discord message to react to —
  // the inbound adapter mints a synthetic "slash-<timestamp>-<userId>" id
  // for them (discord-events.adapter.js), which Discord's API rejects with
  // a "not snowflake" Invalid Form Body error on every single slash command.
  // Confirmed live, not a guess: harmless (caught, returns false either way)
  // but a wasted round-trip and a scary-looking error log on every command.
  if (!/^\d+$/.test(String(messageId))) return false;

  try {
    const user = await getDiscordUser(discordUserId(to));
    const dmChannel = user.dmChannel || await user.createDM();
    const message = await dmChannel.messages.fetch(messageId);
    // Discord accepts a literal unicode emoji directly — no shortcode
    // translation table needed, unlike Slack's EMOJI_TO_SLACK_NAME.
    await message.react(emoji);
    return true;
  } catch (error) {
    logToFile('❌ Discord: error sending reaction', { ...discordErrorDetail(error) });
    return false;
  }
}

// Discord DOES have a real typing-indicator API, unlike Slack — these are
// genuine implementations, not honest no-op stubs.
async function showTypingIndicator(to) {
  try {
    const user = await getDiscordUser(discordUserId(to));
    const dmChannel = user.dmChannel || await user.createDM();
    await dmChannel.sendTyping();
    return true;
  } catch (error) {
    logToFile('❌ Discord: error sending typing indicator', { ...discordErrorDetail(error) });
    return false;
  }
}

// Discord's typing indicator auto-expires after ~10s with no explicit "stop
// typing" call — this repeats just under that window, mirroring Baileys'
// own continuous-typing timer (Slack has nothing to mirror here at all).
function startContinuousTypingIndicator(to) {
  let stopped = false;
  const tick = () => {
    if (stopped) return;
    showTypingIndicator(to).catch(() => {});
  };
  tick();
  const interval = setInterval(tick, 8000);
  return { stop: () => { stopped = true; clearInterval(interval); } };
}

// Populated by discord-events.adapter.js at receive time — Discord
// attachments are self-describing (attachment.url/.contentType/.size) with
// no separate "files.info"-style lookup call needed or available, unlike
// Slack. Exported so the inbound adapter can write into it without a
// require cycle back through this file's own module-load path.
const mediaCache = new Map(); // "discord:<attachmentId>" -> {url, mime_type, file_size}

function cacheIncomingMedia(prefixedMediaId, info) {
  mediaCache.set(prefixedMediaId, info);
}

async function getMediaInfo(mediaId) {
  const cached = mediaCache.get(String(mediaId));
  if (!cached) {
    throw new Error(`Discord: no cached media info for id "${mediaId}" — media must be consumed shortly after it is received (see discord-events.adapter.js)`);
  }
  return cached;
}

async function downloadMedia(mediaId) {
  const info = await getMediaInfo(mediaId);
  // No Bearer auth header — Discord CDN attachment URLs are pre-signed/
  // public for their lifetime, unlike Slack's private, auth-gated URLs.
  const response = await fetch(info.url);
  if (!response.ok) throw new Error(`Discord: file download failed, HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

async function sendFile(to, buffer, filename, caption) {
  const user = await getDiscordUser(discordUserId(to));
  await user.send({ content: caption || undefined, files: [{ attachment: buffer, name: filename }] });
  return true;
}

async function sendDocument(to, filePath, filename, caption) {
  try {
    const buffer = fs.readFileSync(filePath);
    return await sendFile(to, buffer, filename, caption);
  } catch (error) {
    logToFile('❌ Discord: error sending document', { ...discordErrorDetail(error) });
    return false;
  }
}

async function sendAudio(to, audioBuffer) {
  try {
    return await sendFile(to, audioBuffer, 'audio.mp3');
  } catch (error) {
    logToFile('❌ Discord: error sending audio', { ...discordErrorDetail(error) });
    return false;
  }
}

async function sendDocumentFromUrl(to, documentUrl, filename, caption) {
  try {
    const buffer = await resolveMediaBuffer(documentUrl);
    return await sendFile(to, buffer, filename, caption);
  } catch (error) {
    logToFile('❌ Discord: error sending document from URL', { ...discordErrorDetail(error), documentUrl });
    return false;
  }
}

async function sendAudioFromUrl(to, audioUrl) {
  try {
    const buffer = await resolveMediaBuffer(audioUrl);
    return await sendFile(to, buffer, 'audio.mp3');
  } catch (error) {
    logToFile('❌ Discord: error sending audio from URL', { ...discordErrorDetail(error), audioUrl });
    return false;
  }
}

async function sendAudioFromUrlReturningId(to, audioUrl) {
  try {
    const user = await getDiscordUser(discordUserId(to));
    const buffer = await resolveMediaBuffer(audioUrl);
    const sent = await user.send({ files: [{ attachment: buffer, name: 'audio.mp3' }] });
    return sent?.id || null;
  } catch (error) {
    logToFile('❌ Discord: error sending audio from URL (returning id)', { ...discordErrorDetail(error), audioUrl });
    return null;
  }
}

async function sendImageFromUrl(to, imageUrl, caption = '') {
  try {
    const buffer = await resolveMediaBuffer(imageUrl);
    return await sendFile(to, buffer, 'image.png', caption);
  } catch (error) {
    logToFile('❌ Discord: error sending image from URL', { ...discordErrorDetail(error), imageUrl });
    return false;
  }
}

// Conservative: Discord DM channels are not guild-boosted, so do not assume
// a guild's higher boost-tier upload limits apply to a bot's DM uploads.
const SAFE_UPLOAD_LIMIT_BYTES = 8 * 1024 * 1024;

/**
 * Size-gated real implementation, NOT a stub and NOT an unconditional
 * upload. A freshly-generated AI video can plausibly exceed Discord's safe
 * DM upload ceiling — rather than attempt an upload that will likely fail,
 * this logs and returns false so callers with a durable URL fall back to
 * sendVideoFromUrl (the real, primary delivery path — see
 * video-assembly.service.js's own fix preferring that path whenever a
 * durable R2 URL is available).
 */
async function sendVideo(to, videoBuffer, tempDir, caption = '') {
  if (videoBuffer.length > SAFE_UPLOAD_LIMIT_BYTES) {
    logToFile('ℹ️ Discord: video exceeds the safe DM upload size — use sendVideoFromUrl instead', {
      to, sizeBytes: videoBuffer.length, limitBytes: SAFE_UPLOAD_LIMIT_BYTES,
    });
    return false;
  }
  try {
    return await sendFile(to, videoBuffer, 'video.mp4', caption);
  } catch (error) {
    logToFile('❌ Discord: error sending video', { ...discordErrorDetail(error) });
    return false;
  }
}

/**
 * REAL, PRIMARY video-delivery path — never uploads raw bytes, sidestepping
 * Discord's upload-size ceiling entirely. An embed reads better in Discord's
 * client than a bare URL; the bare URL is also included in `content` as a
 * fallback for situations where the embed doesn't unfurl.
 */
async function sendVideoFromUrl(to, videoUrl, caption = '') {
  try {
    // eslint-disable-next-line global-require -- lazy, matching this file's other lazy discord.js requires
    const { EmbedBuilder } = require('discord.js');
    const user = await getDiscordUser(discordUserId(to));
    const embed = new EmbedBuilder().setTitle('Your video is ready').setURL(videoUrl);
    if (caption) embed.setDescription(caption);
    await user.send({ content: videoUrl, embeds: [embed] });
    return true;
  } catch (error) {
    logToFile('❌ Discord: error sending video from URL', { ...discordErrorDetail(error), videoUrl });
    return false;
  }
}

async function sendImage(to, mediaIdOrPath, caption = '') {
  const isFilePath = mediaIdOrPath.includes('/') || mediaIdOrPath.includes('\\');
  if (!isFilePath) {
    logToFile(
      '❌ Discord: sendImage was given a Meta media ID, not a file path/URL — Discord has no reusable '
      + 'media-ID upload step, so cached-ID reuse is not supported on this channel',
      { mediaIdOrPath }
    );
    return false;
  }
  try {
    const buffer = fs.readFileSync(mediaIdOrPath);
    return await sendFile(to, buffer, path.basename(mediaIdOrPath), caption);
  } catch (error) {
    logToFile('❌ Discord: error sending image', { ...discordErrorDetail(error) });
    return false;
  }
}

async function sendSticker(to, mediaIdOrPath) {
  const isFilePath = mediaIdOrPath.includes('/') || mediaIdOrPath.includes('\\');
  if (!isFilePath) {
    logToFile('❌ Discord: sendSticker was given a Meta media ID, not a file path — not supported on this channel', { mediaIdOrPath });
    return false;
  }
  if (!fs.existsSync(mediaIdOrPath)) {
    logToFile('Sticker file not found — skipping sticker send (cosmetic)', { path: mediaIdOrPath });
    return false;
  }
  try {
    const buffer = fs.readFileSync(mediaIdOrPath);
    return await sendFile(to, buffer, path.basename(mediaIdOrPath));
  } catch (error) {
    logToFile('❌ Discord: error sending sticker', { ...discordErrorDetail(error) });
    return false;
  }
}

// ── Real interactive components ──────────────────────────────────────────────
// Unlike Baileys, these are genuine native components, not a text
// degradation — a button's `customId` carries the exact `id` Meta's
// button_reply would have used, and discord-events.adapter.js reads it
// straight off the interaction with no menu-bookkeeping needed.

async function sendInteractiveButtons(to, options) {
  try {
    // eslint-disable-next-line global-require -- lazy, matching this file's other lazy discord.js requires
    const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
    const user = await getDiscordUser(discordUserId(to));
    const { body, buttons } = options;

    const row = new ActionRowBuilder().addComponents(
      buttons.slice(0, 5).map((btn) => new ButtonBuilder()
        .setCustomId(btn.id)
        .setLabel(btn.title.substring(0, 80))
        .setStyle(ButtonStyle.Primary))
    );
    await user.send({ content: body, components: [row] });
    return true;
  } catch (error) {
    logToFile('❌ Discord: error sending interactive buttons', { ...discordErrorDetail(error) });
    return false;
  }
}

async function sendImageWithButtons(to, imageUrl, bodyText, buttons) {
  try {
    // eslint-disable-next-line global-require -- lazy, matching this file's other lazy discord.js requires
    const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
    const user = await getDiscordUser(discordUserId(to));
    const buffer = await resolveMediaBuffer(imageUrl);

    const row = new ActionRowBuilder().addComponents(
      buttons.slice(0, 5).map((btn) => new ButtonBuilder()
        .setCustomId(btn.id)
        .setLabel(btn.title.substring(0, 80))
        .setStyle(ButtonStyle.Primary))
    );
    // Unlike Slack (files can't carry inline block actions, forcing a
    // two-message split), Discord CAN attach components to a message that
    // also has file attachments — a real simplification over Slack's design.
    await user.send({ content: bodyText, files: [{ attachment: buffer, name: 'image.png' }], components: [row] });
    return true;
  } catch (error) {
    logToFile('❌ Discord: error sending image with buttons', { ...discordErrorDetail(error), imageUrl });
    return false;
  }
}

async function sendInteractiveMessage(to, listData) {
  try {
    // eslint-disable-next-line global-require -- lazy, matching this file's other lazy discord.js requires
    const { ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
    const user = await getDiscordUser(discordUserId(to));
    const { header, body, footer, action } = listData;
    const { sections } = action || {};
    const options = (sections || []).flatMap((s) => s.rows || []);

    if (!options.length) {
      logToFile('⚠️ Discord: no options provided for interactive list', { listData });
      return false;
    }

    const headerText = header?.text || header;
    const bodyText = body?.text || body;
    const footerText = footer?.text || footer;

    // Discord's StringSelectMenu caps at 25 options (Slack's static_select
    // caps at 100) — every existing call site here (feature menu = 5, style
    // picker = 4, language picker <= 10) already fits under 25 with zero
    // chunking needed. Larger option sets (the 164-country picker) use the
    // dedicated 2-step chunked flow in discord-modal-flow.js instead of this
    // generic method.
    const menu = new StringSelectMenuBuilder()
      .setCustomId('list_select')
      .setPlaceholder((action?.button || 'Choose an option').slice(0, 150))
      .addOptions(options.slice(0, 25).map((opt) => ({
        label: String(opt.title).slice(0, 100),
        value: String(opt.id),
      })));
    const row = new ActionRowBuilder().addComponents(menu);

    const content = [headerText, bodyText, footerText].filter(Boolean).join('\n\n')
      || 'Please choose an option';
    await user.send({ content, components: [row] });
    return true;
  } catch (error) {
    logToFile('❌ Discord: error sending interactive list', { ...discordErrorDetail(error) });
    return false;
  }
}

async function sendLanguageSelectionList(to, currentLanguage = 'en', region = null) {
  // eslint-disable-next-line global-require -- lazy, matching slack-channel.service.js's convention
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
    logToFile('Discord language picker: region lookup failed, using default set', { error: error.message });
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
  return `Discord channel driver: ${methodName}() has no equivalent yet — it needs the channel-agnostic `
    + 'template registry from docs/onboarding/sandbox-production-design.md §1, which is not built. '
    + 'The template\'s static wording lives only in Meta\'s registered config, not in this call\'s arguments.';
}

/**
 * The Flow-equivalent (modal-workaround flows) lives in discord-modal-flow.js
 * as a SEPARATE renderer, not inside this driver — matching Slack's own
 * design decision. sendFlow() itself stays an honest stub here so any caller
 * still branching on its Meta-shaped return value degrades safely rather
 * than throwing.
 */
async function sendFlow() {
  logToFile('Discord channel driver: sendFlow() has no direct equivalent — Flow-shaped forms render as a '
    + 'modal-workaround flow via discord-modal-flow.js, triggered by a button click, not by this call.');
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
  return async function discordStub(...args) {
    logToFile(notSupportedMessage(methodName), { methodName, driver: 'discord' });
    return false;
  };
}

function syncNullStub(methodName) {
  return function discordSyncStub(...args) {
    logToFile(notSupportedMessage(methodName), { methodName, driver: 'discord' });
    return null;
  };
}

const DiscordChannel = {};

for (const { name, isAsync } of MEMBERS) {
  if (Object.prototype.hasOwnProperty.call(IMPLEMENTATIONS, name)) {
    DiscordChannel[name] = IMPLEMENTATIONS[name];
  } else if (Object.prototype.hasOwnProperty.call(STUBS, name)) {
    const stubIsAsync = STUBS[name];
    if (stubIsAsync !== isAsync) {
      throw new Error(
        `discord-channel.service.js: "${name}" is registered as ${stubIsAsync ? 'async' : 'sync'} in STUBS but `
        + `meta-channel.service.js now declares it ${isAsync ? 'async' : 'sync'} — update STUBS to match.`
      );
    }
    DiscordChannel[name] = stubIsAsync ? asyncFalseStub(name) : syncNullStub(name);
  } else {
    throw new Error(
      `discord-channel.service.js: meta-channel.service.js declares "${name}" with no matching entry in `
      + 'IMPLEMENTATIONS or STUBS. Add one so this driver never silently lacks a method the rest of the bot calls.'
    );
  }
}

DiscordChannel._discordUserId = discordUserId;
DiscordChannel._getDiscordUser = getDiscordUser;
DiscordChannel._cacheIncomingMedia = cacheIncomingMedia;

module.exports = DiscordChannel;
