/**
 * Discord connection manager — the ONE place that owns the persistent
 * Discord Gateway (WebSocket) connection. Mirrors baileys-connection.js's
 * role (a single shared connection, exposed via getClient()) but is much
 * simpler: Discord has no auth-folder/QR/multi-file-session-state concept at
 * all — it's just "token in, Client out". discord-channel.service.js (the
 * outbound driver) and discord-events.adapter.js (the inbound listener) both
 * share this ONE client instance; a second `new Client()` for the same bot
 * token would open a second Gateway connection, which is undefined/broken
 * behaviour, not just wasteful (unlike Slack's stateless WebClient, which is
 * safe to construct fresh per-process since Slack has no persistent
 * connection to share).
 *
 * `discord.js` is loaded LAZILY, inside connect(), matching this repo's
 * existing lazy-client convention (see baileys-connection.js's own header
 * comment, and shared/storage/r2.js's lazyClient) — requiring this file
 * never touches the real `discord.js` package or opens a socket; only
 * connect()/getClient() do.
 *
 * `events` is the one place to observe connection lifecycle, mirroring
 * baileys-connection.js's own `events` emitter.
 */

const EventEmitter = require('events');
const { logToFile } = require('../../utils/logger');

let client = null;
let clientPromise = null;
const events = new EventEmitter();
const connectionState = { connected: false };

// Set by close() so a Gateway close/error firing during intentional shutdown
// is not mistaken for a real problem worth logging loudly — mirrors
// baileys-connection.js's own `shuttingDown` flag.
let shuttingDown = false;

/**
 * Builds a fresh, not-yet-logged-in Client with the intents this bot needs:
 * Guilds (required for the client to function at all), GuildMessages (guild
 * text channels, not used today but harmless/cheap to keep), DirectMessages
 * (the bot's actual primary surface — teachers DM the bot), and MessageContent
 * (a PRIVILEGED intent — see the file-level operational note below).
 *
 * `partials: [Channel, Message]` is required for DM `messageCreate` events to
 * fire reliably: a DM channel discord.js hasn't already cached arrives as a
 * "partial" structure unless these are declared, and Gateway events for
 * partial structures are silently dropped without them.
 */
function buildClient() {
  // eslint-disable-next-line global-require -- lazy on purpose, see file header
  const { Client, GatewayIntentBits, Partials } = require('discord.js');
  return new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.DirectMessages,
      GatewayIntentBits.MessageContent,
    ],
    partials: [Partials.Channel, Partials.Message],
  });
}

/**
 * @returns {Promise<import('discord.js').Client>} resolves once the Gateway
 *   connection is actually up (the 'clientReady' event — NOT 'ready', which
 *   discord.js renamed; verified against the installed discord.js@14.27.0).
 */
async function connect() {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) {
    throw new Error('Discord connection: DISCORD_BOT_TOKEN is not set');
  }

  // eslint-disable-next-line global-require -- lazy, see file header
  const { Events } = require('discord.js');

  const freshClient = buildClient();

  freshClient.on(Events.Error, (error) => {
    logToFile('⚠️ Discord: client error', { error: error.message });
  });

  // Discord's analogue of a Baileys "connection closed" — a shard's Gateway
  // websocket dropped. discord.js's own internal reconnect logic runs for
  // recoverable closes; this listener is purely observational (mirrors
  // baileys-connection.js's `events.emit('close', ...)`), not something that
  // manually re-drives a reconnect the way Baileys' own `connection.update`
  // handler does — discord.js owns that internally.
  freshClient.on(Events.ShardDisconnect, (event, shardId) => {
    connectionState.connected = false;
    logToFile('⚠️ Discord: shard disconnected', { code: event?.code, shardId, shuttingDown });
    events.emit('close', { code: event?.code, shuttingDown });
  });

  freshClient.on(Events.ShardReconnecting, (shardId) => {
    logToFile('🔄 Discord: shard reconnecting', { shardId });
  });

  freshClient.on(Events.ShardResume, (shardId) => {
    connectionState.connected = true;
    logToFile('✅ Discord: shard resumed', { shardId });
    events.emit('open');
  });

  return new Promise((resolve, reject) => {
    freshClient.once(Events.ClientReady, () => {
      client = freshClient;
      connectionState.connected = true;
      logToFile('✅ Discord: connected', { tag: freshClient.user?.tag });
      events.emit('open');
      resolve(freshClient);
    });

    // A bad/revoked token surfaces HERE, as a login rejection — there is no
    // Baileys-style mid-session "you have been logged out" event for a bot
    // token; see this module's close()/PERSISTENT_CONNECTION_DRIVERS notes.
    freshClient.login(token).catch((error) => {
      logToFile('❌ Discord: login failed — check DISCORD_BOT_TOKEN', { error: error.message });
      reject(error);
    });
  });
}

/**
 * Lazily connects on first call; subsequent calls reuse the same connection.
 * Resolves once the Gateway is actually ready — mirrors baileys-connection.js's
 * getSocket() resolution semantics exactly (never resolve before real work
 * can happen on the returned client).
 *
 * @returns {Promise<import('discord.js').Client>}
 */
function getClient() {
  if (!clientPromise) clientPromise = connect();
  return clientPromise;
}

function isConnected() {
  return connectionState.connected;
}

/**
 * Closes the Gateway connection cleanly. Unlike Baileys' close() (which
 * disconnects WITHOUT logging out, preserving the pairing), there is no
 * "logout" concept for a bot token at all — client.destroy() is simply a
 * clean disconnect; nothing about it invalidates DISCORD_BOT_TOKEN.
 */
async function close() {
  shuttingDown = true;
  if (client) {
    try {
      await client.destroy();
    } catch (error) {
      logToFile('Discord: destroy error (ignored)', { error: error.message });
    }
  }
  client = null;
  clientPromise = null;
  connectionState.connected = false;
}

/** Test-only: forces the next getClient() call to reconnect from scratch. */
function _resetForTests() {
  client = null;
  clientPromise = null;
  connectionState.connected = false;
  shuttingDown = false;
  events.removeAllListeners();
}

module.exports = {
  getClient,
  isConnected,
  close,
  events,
  _resetForTests,
};
