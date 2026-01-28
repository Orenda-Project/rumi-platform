/**
 * Register All WhatsApp Flows
 *
 * Registers all 3 WhatsApp Flows with Meta's Graph API:
 *   1. Reading Assessment  (navigate type, no endpoint)
 *   2. Attendance Setup    (endpoint type, encrypted)
 *   3. Attendance Marking  (endpoint type, encrypted)
 *
 * Uses MetaAPI for Graph API calls and SetupState for tracking
 * registration progress. Designed for idempotency — skips flows
 * that already exist in Meta.
 *
 * @module register-all-flows
 */

const fs = require('fs');
const path = require('path');
const { MetaAPI } = require('./meta-api');
const { SetupState } = require('./setup-state');

// ---------------------------------------------------------------------------
// Flow configurations
// ---------------------------------------------------------------------------

/**
 * All 3 flows to register. Each entry contains everything needed to
 * find, create, upload, configure, and publish the flow.
 */
const FLOW_CONFIGS = [
  {
    name: 'Reading Assessment',
    jsonPath: path.resolve(__dirname, '../../shared/flows/reading-assessment-flow.json'),
    type: 'navigate',
    envVar: 'READING_ASSESSMENT_FLOW_ID',
    categories: ['OTHER'],
  },
  {
    name: 'Attendance Setup',
    jsonPath: path.resolve(__dirname, '../../shared/flows/attendance-setup-flow.json'),
    type: 'endpoint',
    endpointPath: '/flow/attendance-setup',
    envVar: 'ATTENDANCE_SETUP_FLOW_ID',
    categories: ['OTHER'],
  },
  {
    name: 'Attendance Marking',
    jsonPath: path.resolve(__dirname, '../../shared/flows/attendance-marking-flow.json'),
    type: 'endpoint',
    endpointPath: '/flow/attendance-marking',
    envVar: 'ATTENDANCE_MARKING_FLOW_ID',
    categories: ['OTHER'],
  },
];

// ---------------------------------------------------------------------------
// Single flow registration
// ---------------------------------------------------------------------------

/**
 * Register a single flow with Meta's Graph API.
 *
 * Pipeline:
 *   1. Check if flow already exists via findFlowByName()
 *   2. If exists → skip (record in state as EXISTS)
 *   3. If not → create → upload JSON → set endpoint (if applicable) → publish
 *   4. Record flow ID in state via state.setFlow()
 *
 * @param {MetaAPI}    api        Initialized MetaAPI instance
 * @param {SetupState} state      Initialized SetupState instance
 * @param {object}     flowConfig Entry from FLOW_CONFIGS
 * @param {object}     options    { endpointBase }
 * @returns {Promise<object>}     { name, flowId, envVar, status } or { name, status: 'error', error }
 */
async function registerFlow(api, state, flowConfig, options) {
  const { name, jsonPath, type, endpointPath, envVar, categories } = flowConfig;

  try {
    // Step 1: Check if flow already exists
    const findResult = await api.findFlowByName(name);

    if (!findResult.success) {
      return {
        name,
        envVar,
        status: 'error',
        error: `Failed to check existing flows: ${findResult.error.message}`,
      };
    }

    // Step 2: If exists, skip creation
    if (findResult.data) {
      const existingId = findResult.data.id;

      await state.setFlow(name, {
        flowId: existingId,
        status: 'EXISTS',
        envVar,
        type,
        registeredAt: new Date().toISOString(),
      });

      return {
        name,
        flowId: existingId,
        envVar,
        status: 'skipped',
        reason: 'Flow already exists in Meta',
      };
    }

    // Step 3: Create the flow
    const createResult = await api.createFlow(name, categories);
    if (!createResult.success) {
      return {
        name,
        envVar,
        status: 'error',
        error: `Failed to create flow: ${createResult.error.message}`,
      };
    }

    const flowId = createResult.data.id;

    // Step 4: Upload flow JSON
    const flowJson = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
    const uploadResult = await api.uploadFlowJson(flowId, flowJson);
    if (!uploadResult.success) {
      return {
        name,
        flowId,
        envVar,
        status: 'error',
        error: `Failed to upload flow JSON: ${uploadResult.error.message}`,
      };
    }

    // Step 5: Set endpoint (only for endpoint-type flows)
    if (type === 'endpoint' && endpointPath && options.endpointBase) {
      const endpointUri = `${options.endpointBase}${endpointPath}`;
      const endpointResult = await api.setFlowEndpoint(flowId, endpointUri);
      if (!endpointResult.success) {
        return {
          name,
          flowId,
          envVar,
          status: 'error',
          error: `Failed to set endpoint: ${endpointResult.error.message}`,
        };
      }
    }

    // Step 6: Publish the flow
    const publishResult = await api.publishFlow(flowId);
    if (!publishResult.success) {
      return {
        name,
        flowId,
        envVar,
        status: 'error',
        error: `Failed to publish flow: ${publishResult.error.message}`,
      };
    }

    // Step 7: Record in state
    await state.setFlow(name, {
      flowId,
      status: 'PUBLISHED',
      envVar,
      type,
      endpointPath: endpointPath || undefined,
      registeredAt: new Date().toISOString(),
    });

    return {
      name,
      flowId,
      envVar,
      status: 'registered',
    };
  } catch (err) {
    return {
      name,
      envVar,
      status: 'error',
      error: err.message,
    };
  }
}

// ---------------------------------------------------------------------------
// Register all flows
// ---------------------------------------------------------------------------

/**
 * Register all 3 WhatsApp Flows with Meta's Graph API.
 *
 * @param {object}  options
 * @param {string}  options.wabaId          WhatsApp Business Account ID
 * @param {string}  options.accessToken     System-user or short-lived token
 * @param {string}  options.phoneNumberId   Phone-number ID
 * @param {string} [options.endpointBase]   Base URL for flow endpoints (required for attendance flows)
 * @param {string} [options.statePath]      Path to .setup-state.json (uses default if omitted)
 * @returns {Promise<{ registered: Array, skipped: Array, errors: Array }>}
 */
async function registerAllFlows({ wabaId, accessToken, phoneNumberId, endpointBase, statePath }) {
  const api = new MetaAPI({ wabaId, accessToken, phoneNumberId });
  const state = new SetupState(statePath);
  await state.load();

  const registered = [];
  const skipped = [];
  const errors = [];

  for (const flowConfig of FLOW_CONFIGS) {
    // Skip endpoint-type flows if endpointBase is not provided
    if (flowConfig.type === 'endpoint' && !endpointBase) {
      skipped.push({
        name: flowConfig.name,
        flowId: null,
        envVar: flowConfig.envVar,
        status: 'skipped',
        reason: 'No endpointBase provided — required for endpoint-type flows',
      });
      continue;
    }

    const result = await registerFlow(api, state, flowConfig, { endpointBase });

    if (result.status === 'registered') {
      registered.push(result);
    } else if (result.status === 'skipped') {
      skipped.push(result);
    } else if (result.status === 'error') {
      errors.push(result);
    }
  }

  return { registered, skipped, errors };
}

module.exports = { registerAllFlows, registerFlow, FLOW_CONFIGS };
