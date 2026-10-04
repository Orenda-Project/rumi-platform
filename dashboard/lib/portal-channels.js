/**
 * Which chat the landing page and the teacher portal point people to.
 *
 * A deployment may run no WhatsApp at all (CHANNEL_DRIVER=none: teachers reach
 * Rumi on Slack, Discord, Matrix or Rumi Messenger), so the portal must not
 * promise "through WhatsApp" or link to a WhatsApp chat unless the bot really
 * answers there. GET /api/portal/channels serves this to the portal.
 *
 * The rule is the bot's (bot/shared/config/feature-availability.js,
 * resolveChannelDriver): an explicit CHANNEL_DRIVER naming a known driver
 * wins; an unknown one falls back to the default driver; unset is the default
 * driver. The WhatsApp drivers are meta and baileys, and baileys is the
 * default. The dashboard deploys without bot/, so the rule is restated here;
 * tests/dashboard/portal-channels.test.js checks the two agree.
 */

const KNOWN_DRIVERS = ['meta', 'baileys', 'slack', 'discord', 'matrix', 'none'];
const WHATSAPP_DRIVERS = ['meta', 'baileys'];
const DEFAULT_DRIVER = 'baileys';

/** Does the bot answer on WhatsApp in this env? */
function hasWhatsApp(env = process.env) {
  const explicit = typeof env.CHANNEL_DRIVER === 'string' ? env.CHANNEL_DRIVER.trim().toLowerCase() : '';
  const driver = KNOWN_DRIVERS.includes(explicit) ? explicit : DEFAULT_DRIVER;
  return WHATSAPP_DRIVERS.includes(driver);
}

/**
 * PORTAL_CHAT_URL, when it is a web link: where "chat with Rumi" goes. Anything
 * else is ignored, so a typo can never become a javascript: link on the page.
 */
function chatUrl(env = process.env) {
  const raw = typeof env.PORTAL_CHAT_URL === 'string' ? env.PORTAL_CHAT_URL.trim() : '';
  return /^https?:\/\/\S+$/i.test(raw) ? raw : null;
}

/** The body of GET /api/portal/channels. */
function portalChannels(env = process.env) {
  return { whatsapp: hasWhatsApp(env), chatUrl: chatUrl(env) };
}

module.exports = { hasWhatsApp, portalChannels };
