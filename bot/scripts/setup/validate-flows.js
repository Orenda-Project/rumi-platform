/**
 * validate-flows — Pre-flight check that verifies all flows and templates
 * exist and are in the correct state before the bot starts accepting
 * flow-based interactions.
 *
 * Uses SetupState to read the local state file and MetaAPI to optionally
 * verify each flow's PUBLISHED status against the Graph API.
 *
 * @module validate-flows
 */

const { SetupState } = require('./setup-state');
const { MetaAPI } = require('./meta-api');

/**
 * The 3 required flow names that must be registered and PUBLISHED.
 * Mirrors the REQUIRED_FLOWS constant in setup-state.js.
 */
const REQUIRED_FLOWS = ['registration', 'feedback', 'lesson_plan'];

/**
 * Validate that the setup state is complete and all flows are PUBLISHED.
 *
 * @param {object} options
 * @param {string} options.wabaId          WhatsApp Business Account ID
 * @param {string} options.accessToken     System-user or short-lived token
 * @param {string} options.phoneNumberId   Phone-number ID
 * @param {string} options.statePath       Path to the .setup-state.json file
 * @returns {Promise<{ valid: boolean, issues: string[], warnings: string[] }>}
 */
async function validateSetup({ wabaId, accessToken, phoneNumberId, statePath }) {
  const issues = [];
  const warnings = [];

  // -----------------------------------------------------------------------
  // 1. Load setup state
  // -----------------------------------------------------------------------
  const setupState = new SetupState(statePath);
  const state = await setupState.load();

  // -----------------------------------------------------------------------
  // 2. Check encryption
  // -----------------------------------------------------------------------
  const encryption = setupState.getEncryption();
  if (!encryption || !encryption.configured) {
    issues.push('Encryption is not configured. Flow responses cannot be decrypted.');
  }

  // -----------------------------------------------------------------------
  // 3. Check each required flow in state
  // -----------------------------------------------------------------------
  const api = new MetaAPI({ wabaId, accessToken, phoneNumberId });

  for (const flowName of REQUIRED_FLOWS) {
    const flowData = setupState.getFlow(flowName);

    if (!flowData) {
      issues.push(`Flow '${flowName}' not registered in setup state.`);
      continue;
    }

    // Verify with API that the flow is PUBLISHED
    const result = await api.getFlowDetails(flowData.flowId);

    if (!result.success) {
      const errMsg = result.error?.message || 'Unknown error';
      issues.push(
        `Flow '${flowName}' (${flowData.flowId}) could not be verified via API: ${errMsg}`,
      );
      continue;
    }

    if (result.data.status !== 'PUBLISHED') {
      issues.push(
        `Flow '${flowName}' (${flowData.flowId}) is not PUBLISHED. Current status: ${result.data.status}`,
      );
    }
  }

  // -----------------------------------------------------------------------
  // 4. Check template statuses
  // -----------------------------------------------------------------------
  const templates = state.templates || {};

  for (const [templateName, templateData] of Object.entries(templates)) {
    const status = templateData.status;

    if (status === 'REJECTED') {
      issues.push(`Template '${templateName}' status: REJECTED. It must be re-submitted.`);
    } else if (status === 'PENDING') {
      warnings.push(
        `Template '${templateName}' status: PENDING. Awaiting Meta approval.`,
      );
    }
    // APPROVED is fine — no warning or issue needed
  }

  // -----------------------------------------------------------------------
  // 5. Return structured result
  // -----------------------------------------------------------------------
  return {
    valid: issues.length === 0,
    issues,
    warnings,
  };
}

module.exports = { validateSetup };
