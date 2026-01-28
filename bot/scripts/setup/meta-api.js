/**
 * Meta Graph API Client
 *
 * Wraps all WhatsApp Business API calls needed for flow and template
 * registration. Uses Node.js native fetch (Node 18+). No external deps.
 *
 * Every public method returns a normalized envelope:
 *   { success: true,  data: <response body or subset> }
 *   { success: false, error: { status, code, message, userMessage, validationErrors, type? } }
 *
 * @module meta-api
 */

// Keys that are stripped from flow JSON before uploading to the Graph API.
const METADATA_KEYS = ['_comment', '_instructions', '_changelog', '_bead', '_notes'];

class MetaAPI {
  /**
   * @param {object}  opts
   * @param {string}  opts.wabaId          WhatsApp Business Account ID
   * @param {string}  opts.accessToken     System-user or short-lived token
   * @param {string}  opts.phoneNumberId   Phone-number ID (used for encryption endpoint)
   * @param {string} [opts.apiVersion]     Graph API version (default: 'v21.0')
   */
  constructor({ wabaId, accessToken, phoneNumberId, apiVersion = 'v21.0' }) {
    this.wabaId = wabaId;
    this.accessToken = accessToken;
    this.phoneNumberId = phoneNumberId;
    this.apiVersion = apiVersion;
    this.baseUrl = `https://graph.facebook.com/${this.apiVersion}`;
  }

  // -----------------------------------------------------------------------
  // Internal helpers
  // -----------------------------------------------------------------------

  /**
   * Build standard headers (always includes Authorization).
   * @param {boolean} json  If true, adds Content-Type: application/json
   */
  _headers(json = false) {
    const h = { Authorization: `Bearer ${this.accessToken}` };
    if (json) h['Content-Type'] = 'application/json';
    return h;
  }

  /**
   * Perform a fetch and return the normalized envelope.
   * Catches network-level errors and non-OK HTTP statuses.
   */
  async _request(url, options) {
    try {
      const res = await fetch(url, options);

      const body = await res.json();

      if (!res.ok) {
        const err = body.error || {};
        return {
          success: false,
          error: {
            status: res.status,
            code: err.code,
            message: err.message,
            userMessage: err.error_user_msg || undefined,
            validationErrors: err.error_data?.validation_errors || undefined,
          },
        };
      }

      return { success: true, data: body };
    } catch (err) {
      return {
        success: false,
        error: {
          type: 'NETWORK_ERROR',
          message: err.message,
        },
      };
    }
  }

  // -----------------------------------------------------------------------
  // Flows
  // -----------------------------------------------------------------------

  /** GET /{wabaId}/flows */
  async listFlows() {
    const result = await this._request(`${this.baseUrl}/${this.wabaId}/flows`, {
      method: 'GET',
      headers: this._headers(),
    });

    // Unwrap the Graph API { data: [...] } envelope
    if (result.success && result.data?.data) {
      result.data = result.data.data;
    }

    return result;
  }

  /** Find a single flow by its name. Returns the flow object or null. */
  async findFlowByName(name) {
    const result = await this.listFlows();
    if (!result.success) return result;

    const flow = result.data.find((f) => f.name === name) || null;
    return { success: true, data: flow };
  }

  /** POST /{wabaId}/flows — create a new flow. */
  async createFlow(name, categories) {
    return this._request(`${this.baseUrl}/${this.wabaId}/flows`, {
      method: 'POST',
      headers: this._headers(true),
      body: JSON.stringify({ name, categories }),
    });
  }

  /**
   * POST /{flowId}/assets — upload flow JSON.
   * Strips metadata keys (_comment, _instructions, etc.) before upload.
   */
  async uploadFlowJson(flowId, jsonObj) {
    // Deep-clone and strip metadata keys
    const cleaned = { ...jsonObj };
    for (const key of METADATA_KEYS) {
      delete cleaned[key];
    }

    const jsonString = JSON.stringify(cleaned);
    const blob = new Blob([jsonString], { type: 'application/json' });

    const form = new FormData();
    form.append('file', blob, 'flow.json');
    form.append('name', 'flow.json');
    form.append('asset_type', 'FLOW_JSON');

    return this._request(`${this.baseUrl}/${flowId}/assets`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.accessToken}` },
      body: form,
    });
  }

  /** POST /{flowId} — set the endpoint URI for a flow. */
  async setFlowEndpoint(flowId, endpointUri) {
    return this._request(`${this.baseUrl}/${flowId}`, {
      method: 'POST',
      headers: this._headers(true),
      body: JSON.stringify({ endpoint_uri: endpointUri }),
    });
  }

  /** POST /{flowId}/publish — publish a draft flow. */
  async publishFlow(flowId) {
    return this._request(`${this.baseUrl}/${flowId}/publish`, {
      method: 'POST',
      headers: this._headers(),
    });
  }

  /** GET /{flowId} — retrieve full flow details. */
  async getFlowDetails(flowId) {
    return this._request(`${this.baseUrl}/${flowId}`, {
      method: 'GET',
      headers: this._headers(),
    });
  }

  // -----------------------------------------------------------------------
  // Encryption
  // -----------------------------------------------------------------------

  /**
   * POST /{phoneNumberId}/whatsapp_business_encryption
   * NOTE: Uses phoneNumberId, NOT wabaId.
   */
  async registerPublicKey(publicKey) {
    return this._request(
      `${this.baseUrl}/${this.phoneNumberId}/whatsapp_business_encryption`,
      {
        method: 'POST',
        headers: this._headers(true),
        body: JSON.stringify({ business_public_key: publicKey }),
      },
    );
  }

  // -----------------------------------------------------------------------
  // Templates
  // -----------------------------------------------------------------------

  /** GET /{wabaId}/message_templates */
  async listTemplates() {
    const result = await this._request(
      `${this.baseUrl}/${this.wabaId}/message_templates`,
      {
        method: 'GET',
        headers: this._headers(),
      },
    );

    // Unwrap the Graph API { data: [...] } envelope
    if (result.success && result.data?.data) {
      result.data = result.data.data;
    }

    return result;
  }

  /** Find a single template by name. Returns the template object or null. */
  async findTemplateByName(name) {
    const result = await this.listTemplates();
    if (!result.success) return result;

    const template = result.data.find((t) => t.name === name) || null;
    return { success: true, data: template };
  }

  /** POST /{wabaId}/message_templates — create a new template. */
  async createTemplate(payload) {
    return this._request(`${this.baseUrl}/${this.wabaId}/message_templates`, {
      method: 'POST',
      headers: this._headers(true),
      body: JSON.stringify(payload),
    });
  }
}

module.exports = { MetaAPI };
