/**
 * Supabase Provisioner Service
 * Handles Supabase project creation via Management API
 *
 * bd-340: Create project, wait for healthy, get keys
 * bd-341: Apply schema (TODO)
 */

const fetch = require('node-fetch');
const crypto = require('crypto');

class SupabaseProvisioner {
  constructor() {
    this.orgId = process.env.SUPABASE_ORG_ID;
    this.accessToken = process.env.SUPABASE_ACCESS_TOKEN;
    this.baseUrl = 'https://api.supabase.com/v1';

    if (!this.orgId || !this.accessToken) {
      throw new Error('SUPABASE_ORG_ID and SUPABASE_ACCESS_TOKEN are required');
    }
  }

  /**
   * Generate a secure random password for the database
   */
  generatePassword() {
    return crypto.randomBytes(24).toString('base64').replace(/[+/=]/g, 'x');
  }

  /**
   * Create a new Supabase project
   * @param {string} name - Deployment name
   * @param {string} region - AWS region (e.g., 'ap-south-1')
   * @returns {Promise<Object>} Created project details
   */
  async createProject(name, region) {
    const dbPassword = this.generatePassword();
    const projectName = `rumi-${name}`;

    const response = await fetch(`${this.baseUrl}/projects`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        organization_id: this.orgId,
        name: projectName,
        region: region,
        plan: 'free',
        db_pass: dbPassword
      })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(`Failed to create Supabase project: ${error.message || response.statusText}`);
    }

    const project = await response.json();
    return {
      ...project,
      db_password: dbPassword
    };
  }

  /**
   * Poll until project status is ACTIVE_HEALTHY
   * @param {string} projectId - Supabase project ID
   * @param {Object} options - Polling options
   * @returns {Promise<Object>} Project status
   */
  async waitForHealthy(projectId, options = {}) {
    const { pollInterval = 5000, maxAttempts = 60 } = options;
    let attempts = 0;

    while (attempts < maxAttempts) {
      const response = await fetch(`${this.baseUrl}/projects/${projectId}`, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to check project status: ${response.statusText}`);
      }

      const project = await response.json();

      if (project.status === 'ACTIVE_HEALTHY') {
        return project;
      }

      attempts++;
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    throw new Error('Project did not become healthy within timeout');
  }

  /**
   * Get API keys for a project
   * @param {string} projectId - Supabase project ID
   * @returns {Promise<Object>} API keys { anon_key, service_key }
   */
  async getApiKeys(projectId) {
    const response = await fetch(`${this.baseUrl}/projects/${projectId}/api-keys`, {
      headers: {
        'Authorization': `Bearer ${this.accessToken}`
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to get API keys: ${response.statusText}`);
    }

    const keys = await response.json();

    const anonKey = keys.find(k => k.name === 'anon');
    const serviceKey = keys.find(k => k.name === 'service_role');

    if (!anonKey || !serviceKey) {
      throw new Error('API keys not found');
    }

    return {
      anon_key: anonKey.api_key,
      service_key: serviceKey.api_key
    };
  }

  /**
   * Apply schema to a project via migrations API
   * @param {string} projectId - Supabase project ID
   * @param {string} sql - SQL schema to apply
   * @returns {Promise<Object>} Migration result
   */
  async applySchema(projectId, sql) {
    const response = await fetch(`${this.baseUrl}/projects/${projectId}/database/migrations`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: 'initial_schema',
        query: sql
      })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(`Failed to apply schema: ${error.message || response.statusText}`);
    }

    return response.json();
  }
}

module.exports = SupabaseProvisioner;
