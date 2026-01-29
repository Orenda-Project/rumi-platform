/**
 * Soniox Provisioner Service
 * Creates temporary API keys for clone deployments
 *
 * bd-350: Programmatic Soniox temp key provisioning
 *
 * Default limits:
 * - 24-hour expiration (auto-refresh recommended)
 * - WebSocket transcription access
 *
 * Docs: https://soniox.com/docs/stt/api-reference/auth/create_temporary_api_key
 */

const fetch = require('node-fetch');

class SonioxProvisioner {
  constructor() {
    this.masterApiKey = process.env.SONIOX_MASTER_API_KEY;
    this.apiUrl = 'https://api.soniox.com/v1/auth/temporary-api-key';

    if (!this.masterApiKey) {
      throw new Error('SONIOX_MASTER_API_KEY is required');
    }
  }

  /**
   * Create a temporary API key for WebSocket transcription
   * @param {string} deploymentName - Name for the deployment (for logging)
   * @param {Object} options - Key options
   * @param {string} options.usageType - Usage type: 'transcribe_websocket' (default)
   * @param {number} options.expiresInSeconds - Seconds until key expires (default: 86400 = 24 hours)
   * @returns {Promise<Object>} Created key details
   */
  async createTempKey(deploymentName, options = {}) {
    const {
      usageType = 'transcribe_websocket',
      expiresInSeconds = 86400 // 24 hours
    } = options;

    console.log(`Creating Soniox temp key for: ${deploymentName}`);

    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.masterApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        usage_type: usageType,
        expires_in_seconds: expiresInSeconds
      })
    });

    if (response.status === 429) {
      throw new Error('Rate limit exceeded');
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(`Failed to create Soniox temp key: ${error.message || response.statusText}`);
    }

    const result = await response.json();

    // Calculate expiration time for reference
    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + expiresInSeconds);

    return {
      api_key: result.api_key,
      usage_type: usageType,
      expires_in_seconds: expiresInSeconds,
      expires_at: expiresAt.toISOString(),
      deployment_name: deploymentName
    };
  }

  /**
   * Validate that the master API key is working
   * @returns {Promise<boolean>} True if valid
   */
  async validateMasterKey() {
    try {
      // Create a short-lived key to test
      await this.createTempKey('validation-test', { expiresInSeconds: 60 });
      return true;
    } catch (error) {
      console.error('Soniox master key validation failed:', error.message);
      return false;
    }
  }
}

module.exports = SonioxProvisioner;
