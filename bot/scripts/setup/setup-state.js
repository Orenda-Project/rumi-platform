/**
 * SetupState — manages .setup-state.json for tracking
 * flow registration, template registration, and encryption status.
 *
 * Uses only Node.js built-in modules: fs, path, os, crypto.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const REQUIRED_FLOWS = ['registration', 'feedback', 'lesson_plan'];

const DEFAULT_STATE = {
  version: '2.0.0',
  createdAt: null,
  updatedAt: null,
  encryption: { configured: false },
  flows: {},
  templates: {},
};

class SetupState {
  /**
   * @param {string} [statePath] - Path to the state file.
   *   Defaults to `.setup-state.json` in the project root
   *   (two levels above bot/scripts/setup/).
   */
  constructor(statePath) {
    if (statePath) {
      this.statePath = statePath;
    } else {
      // Default: project root = three levels up from this file's directory
      const projectRoot = path.resolve(__dirname, '..', '..', '..');
      this.statePath = path.join(projectRoot, '.setup-state.json');
    }
    this._state = null;
  }

  // -------------------------------------------------------------------
  // Persistence
  // -------------------------------------------------------------------

  /**
   * Load state from disk. Returns default state if file does not exist.
   * @returns {Promise<object>} The loaded (or default) state.
   */
  async load() {
    try {
      const raw = fs.readFileSync(this.statePath, 'utf-8');
      this._state = JSON.parse(raw);
    } catch (err) {
      if (err.code === 'ENOENT' || err instanceof SyntaxError) {
        this._state = JSON.parse(JSON.stringify(DEFAULT_STATE));
      } else {
        throw err;
      }
    }
    return this._state;
  }

  /**
   * Save state to disk atomically (write to temp file, then rename).
   * Sets `updatedAt` to the current ISO timestamp.
   * Sets `createdAt` if it has not been set yet.
   * @param {object} state - The state object to persist.
   */
  async save(state) {
    state.updatedAt = new Date().toISOString();
    if (!state.createdAt) {
      state.createdAt = state.updatedAt;
    }
    this._state = state;

    const dir = path.dirname(this.statePath);
    const tmpFile = path.join(dir, `.setup-state-${crypto.randomBytes(6).toString('hex')}.tmp`);

    fs.writeFileSync(tmpFile, JSON.stringify(state, null, 2), 'utf-8');
    fs.renameSync(tmpFile, this.statePath);
  }

  // -------------------------------------------------------------------
  // Flows
  // -------------------------------------------------------------------

  /**
   * Get flow data by name.
   * @param {string} flowName
   * @returns {object|null} Flow data, or null if not found.
   */
  getFlow(flowName) {
    if (!this._state || !this._state.flows || !this._state.flows[flowName]) {
      return null;
    }
    return this._state.flows[flowName];
  }

  /**
   * Set flow data. Auto-saves to disk.
   * @param {string} flowName
   * @param {object} data - { flowId, status, envVar, type, endpointPath, registeredAt }
   */
  async setFlow(flowName, data) {
    if (!this._state) {
      await this.load();
    }
    this._state.flows[flowName] = data;
    await this.save(this._state);
  }

  // -------------------------------------------------------------------
  // Templates
  // -------------------------------------------------------------------

  /**
   * Get template data by name.
   * @param {string} templateName
   * @returns {object|null} Template data, or null if not found.
   */
  getTemplate(templateName) {
    if (!this._state || !this._state.templates || !this._state.templates[templateName]) {
      return null;
    }
    return this._state.templates[templateName];
  }

  /**
   * Set template data. Auto-saves to disk.
   * @param {string} templateName
   * @param {object} data - { templateId, status, registeredAt }
   */
  async setTemplate(templateName, data) {
    if (!this._state) {
      await this.load();
    }
    this._state.templates[templateName] = data;
    await this.save(this._state);
  }

  // -------------------------------------------------------------------
  // Encryption
  // -------------------------------------------------------------------

  /**
   * Get the current encryption state.
   * @returns {object} Encryption state (at minimum `{ configured: false }`).
   */
  getEncryption() {
    if (!this._state || !this._state.encryption) {
      return { configured: false };
    }
    return this._state.encryption;
  }

  /**
   * Set encryption data. Auto-saves to disk.
   * @param {object} data - { configured: true, publicKeyHash, registeredAt }
   */
  async setEncryption(data) {
    if (!this._state) {
      await this.load();
    }
    this._state.encryption = data;
    await this.save(this._state);
  }

  // -------------------------------------------------------------------
  // Completion helpers
  // -------------------------------------------------------------------

  /**
   * Returns true if all 3 required flows AND encryption are configured.
   * Templates do NOT block completion (they need Meta approval).
   * @returns {boolean}
   */
  isComplete() {
    if (!this._state) return false;

    // Encryption must be configured
    if (!this._state.encryption || !this._state.encryption.configured) {
      return false;
    }

    // All 3 required flows must exist
    const flowNames = Object.keys(this._state.flows || {});
    for (const required of REQUIRED_FLOWS) {
      if (!flowNames.includes(required)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Returns the name of the next incomplete step, or null if all done.
   * Priority order: encryption -> flows -> templates -> null
   * @returns {string|null}
   */
  getNextIncompleteStep() {
    if (!this._state) return 'encryption';

    // 1. Encryption first
    if (!this._state.encryption || !this._state.encryption.configured) {
      return 'encryption';
    }

    // 2. All required flows
    const flowNames = Object.keys(this._state.flows || {});
    for (const required of REQUIRED_FLOWS) {
      if (!flowNames.includes(required)) {
        return 'flows';
      }
    }

    // 3. At least one template registered
    const templateNames = Object.keys(this._state.templates || {});
    if (templateNames.length === 0) {
      return 'templates';
    }

    return null;
  }
}

module.exports = { SetupState };
