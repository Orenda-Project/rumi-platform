/**
 * Canonical Inbound Message Envelope
 *
 * Normalizes vendor-specific webhook payloads (WhatsApp Meta, Slack, Baileys, etc.)
 * into a single channel-agnostic data structure.
 */

/**
 * Standard event/message types supported across channels.
 */
const ENVELOPE_TYPES = {
  TEXT: 'text',
  INTERACTIVE_BUTTON: 'interactive_button',
  INTERACTIVE_LIST: 'interactive_list',
  INTERACTIVE_FLOW: 'interactive_flow',
  AUDIO: 'audio',
  VOICE: 'voice',
  IMAGE: 'image',
  DOCUMENT: 'document',
  STATUS_UPDATE: 'status_update',
  SYSTEM: 'system',
  UNKNOWN: 'unknown'
};

/**
 * Factory to create a standardized InboundMessageEnvelope.
 *
 * @param {Object} options
 * @param {string} options.id - Unique message or event identifier
 * @param {string} options.channel - Ingress channel name ('whatsapp', 'slack', etc.)
 * @param {string} options.from - Normalized sender identifier
 * @param {number} [options.timestamp] - Unix epoch timestamp (seconds)
 * @param {string} options.type - One of ENVELOPE_TYPES
 * @param {Object} [options.payload] - Channel-agnostic message payload
 * @param {Object} [options.metadata] - Routing and telemetry metadata
 * @param {any} [options.rawBody] - Original wire payload for legacy compatibility
 * @returns {Object} Normalized InboundMessageEnvelope
 */
function createInboundEnvelope({
  id,
  channel,
  from,
  timestamp = Math.floor(Date.now() / 1000),
  type = ENVELOPE_TYPES.UNKNOWN,
  payload = {},
  metadata = {},
  rawBody = null
}) {
  const safeMetadata = metadata && typeof metadata === 'object' ? metadata : {};
  return {
    id: String(id || `evt_${Date.now()}`),
    channel: String(channel || 'unknown'),
    from: String(from || ''),
    timestamp: typeof timestamp === 'number' ? timestamp : Math.floor(Date.now() / 1000),
    type,
    payload: payload && typeof payload === 'object' ? { ...payload } : {},
    metadata: {
      correlationId: safeMetadata.correlationId || null,
      phoneNumberId: safeMetadata.phoneNumberId || null,
      ...safeMetadata
    },
    rawBody
  };
}

module.exports = {
  ENVELOPE_TYPES,
  createInboundEnvelope
};
