/**
 * OpenRouter Provisioner Service
 * Creates limited API keys for clone deployments
 *
 * bd-349: Programmatic OpenRouter key provisioning
 *
 * Default limits:
 * - $10/month budget
 * - 180-day expiration
 * - Monthly reset
 */

const fetch = require('node-fetch');

class OpenRouterProvisioner {
  constructor() {
    this.provisioningKey = process.env.OPENROUTER_PROVISIONING_KEY;
    this.apiUrl = 'https://openrouter.ai/api/v1/keys';

    if (!this.provisioningKey) {
      throw new Error('OPENROUTER_PROVISIONING_KEY is required');
    }
  }

  /**
   * Create a new API key with spending limits
   * @param {string} deploymentName - Name for the deployment
   * @param {Object} options - Key options
   * @param {number} options.limit - Monthly spending limit in USD (default: 10)
   * @param {string} options.limitReset - Reset frequency: 'daily', 'weekly', 'monthly' (default: 'monthly')
   * @param {number} options.expiresInDays - Days until key expires (default: 180)
   * @returns {Promise<Object>} Created key details
   */
  async createKey(deploymentName, options = {}) {
    const {
      limit = 10,
      limitReset = 'monthly',
      expiresInDays = 180
    } = options;

    // Calculate expiration date
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiresInDays);

    const keyName = `rumi-${deploymentName}`;

    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.provisioningKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: keyName,
        limit: limit,
        limit_reset: limitReset,
        expires_at: expiresAt.toISOString(),
        include_byok_in_limit: false
      })
    });

    if (response.status === 429) {
      throw new Error('Rate limit exceeded');
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(`Failed to create OpenRouter key: ${error.error?.message || response.statusText}`);
    }

    const result = await response.json();

    return {
      key: result.key,
      hash: result.data.hash,
      name: result.data.name,
      limit: result.data.limit,
      limit_remaining: result.data.limit_remaining,
      limit_reset: result.data.limit_reset,
      expires_at: result.data.expires_at,
      created_at: result.data.created_at
    };
  }

  /**
   * Disable an API key
   * @param {string} keyHash - The key hash to disable
   * @returns {Promise<Object>} Updated key details
   */
  async disableKey(keyHash) {
    const response = await fetch(`${this.apiUrl}/${keyHash}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${this.provisioningKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ disabled: true })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(`Failed to disable OpenRouter key: ${error.error?.message || response.statusText}`);
    }

    const result = await response.json();
    return result.data;
  }

  /**
   * Get information about an API key
   * @param {string} keyHash - The key hash to look up
   * @returns {Promise<Object>} Key details including usage
   */
  async getKeyInfo(keyHash) {
    const response = await fetch(`${this.apiUrl}/${keyHash}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${this.provisioningKey}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(`Failed to get OpenRouter key info: ${error.error?.message || response.statusText}`);
    }

    const result = await response.json();
    return result.data;
  }
}

module.exports = OpenRouterProvisioner;
