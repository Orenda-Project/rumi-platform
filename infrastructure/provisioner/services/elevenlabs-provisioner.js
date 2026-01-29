/**
 * ElevenLabs Provisioner Service
 * Creates API keys via Service Accounts for clone deployments
 *
 * bd-351: Programmatic ElevenLabs key provisioning
 *
 * Requirements:
 * - Scale, Business, or Enterprise ElevenLabs plan
 * - Workspace admin access
 * - Service account pre-created
 *
 * Docs: https://elevenlabs.io/docs/api-reference/service-accounts/api-keys/create
 */

const fetch = require('node-fetch');

class ElevenLabsProvisioner {
  constructor() {
    this.adminApiKey = process.env.ELEVENLABS_ADMIN_API_KEY;
    this.serviceAccountId = process.env.ELEVENLABS_SERVICE_ACCOUNT_ID;
    this.apiUrl = 'https://api.elevenlabs.io/v1';

    if (!this.adminApiKey) {
      throw new Error('ELEVENLABS_ADMIN_API_KEY is required');
    }
    if (!this.serviceAccountId) {
      throw new Error('ELEVENLABS_SERVICE_ACCOUNT_ID is required');
    }
  }

  /**
   * Create an API key for the service account
   * @param {string} deploymentName - Name for the deployment
   * @param {Object} options - Key options
   * @param {string[]} options.scopes - API scopes (default: ['text-to-speech'])
   * @param {number} options.creditLimit - Character credit limit (optional)
   * @returns {Promise<Object>} Created key details
   */
  async createKey(deploymentName, options = {}) {
    const {
      scopes = ['text-to-speech'],
      creditLimit = null
    } = options;

    const keyName = `rumi-${deploymentName}`;

    console.log(`Creating ElevenLabs key for: ${deploymentName}`);

    const body = {
      name: keyName
    };

    // Add scopes if specified
    if (scopes && scopes.length > 0) {
      body.scopes = scopes;
    }

    // Add credit limit if specified
    if (creditLimit) {
      body.credit_limit = creditLimit;
    }

    const response = await fetch(
      `${this.apiUrl}/service-accounts/${this.serviceAccountId}/api-keys`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': this.adminApiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      }
    );

    if (response.status === 429) {
      throw new Error('Rate limit exceeded');
    }

    if (response.status === 403) {
      throw new Error('Insufficient permissions - requires Scale/Business/Enterprise plan');
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(`Failed to create ElevenLabs key: ${error.detail?.message || error.detail || response.statusText}`);
    }

    const result = await response.json();

    return {
      api_key: result.api_key,
      api_key_id: result.api_key_id,
      name: keyName,
      scopes: scopes,
      credit_limit: creditLimit,
      created_at: new Date().toISOString()
    };
  }

  /**
   * Revoke an API key
   * @param {string} apiKeyId - The API key ID to revoke
   * @returns {Promise<boolean>} True if successful
   */
  async revokeKey(apiKeyId) {
    const response = await fetch(
      `${this.apiUrl}/service-accounts/${this.serviceAccountId}/api-keys/${apiKeyId}`,
      {
        method: 'DELETE',
        headers: {
          'xi-api-key': this.adminApiKey
        }
      }
    );

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(`Failed to revoke ElevenLabs key: ${error.detail || response.statusText}`);
    }

    return true;
  }

  /**
   * List all API keys for the service account
   * @returns {Promise<Array>} List of API keys
   */
  async listKeys() {
    const response = await fetch(
      `${this.apiUrl}/service-accounts/${this.serviceAccountId}/api-keys`,
      {
        method: 'GET',
        headers: {
          'xi-api-key': this.adminApiKey
        }
      }
    );

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(`Failed to list ElevenLabs keys: ${error.detail || response.statusText}`);
    }

    const result = await response.json();
    return result.api_keys || [];
  }

  /**
   * Validate that the admin key and service account are working
   * @returns {Promise<boolean>} True if valid
   */
  async validate() {
    try {
      await this.listKeys();
      return true;
    } catch (error) {
      console.error('ElevenLabs validation failed:', error.message);
      return false;
    }
  }
}

module.exports = ElevenLabsProvisioner;
