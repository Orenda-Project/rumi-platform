#!/usr/bin/env node
/**
 * Register Attendance WhatsApp Flows
 * Programmatically creates flows in Meta Business Manager
 *
 * Usage:
 *   node scripts/register-attendance-flows.js [--production]
 *
 * Created: January 24, 2026
 * Bead: bd-056
 *
 * API Reference:
 * - Create Flow: POST https://graph.facebook.com/{VERSION}/{WABA_ID}/flows
 * - Upload Flow JSON: POST https://graph.facebook.com/{VERSION}/{FLOW_ID}/assets
 * - Publish Flow: POST https://graph.facebook.com/{VERSION}/{FLOW_ID}/publish
 */

const fs = require('fs');
const path = require('path');

// Load environment variables
require('dotenv').config();

const API_VERSION = 'v18.0';
const BASE_URL = `https://graph.facebook.com/${API_VERSION}`;

// Determine environment
const isProduction = process.argv.includes('--production');

// WABA Credentials from environment
const STAGING_WABA_ID = process.env.WABA_ID;
const STAGING_TOKEN = process.env.WHATSAPP_TOKEN;

// Get credentials based on environment
const WABA_ID = isProduction ? process.env.WABA_ID : STAGING_WABA_ID;
const ACCESS_TOKEN = isProduction ? process.env.WHATSAPP_TOKEN : STAGING_TOKEN;

// Base URL for flow endpoints (bd-215)
// Railway domains follow pattern: {service-name}-production.up.railway.app
const ENDPOINT_BASE_URL = process.env.APP_URL || (isProduction
  ? 'https://your-app-production.up.railway.app'
  : 'https://your-app-staging.up.railway.app');

if (!WABA_ID || !ACCESS_TOKEN) {
  console.error('ERROR: Missing WABA_ID or WHATSAPP_TOKEN in environment variables');
  process.exit(1);
}

console.log(`\n=== WhatsApp Flow Registration ===`);
console.log(`Environment: ${isProduction ? 'PRODUCTION' : 'STAGING'}`);
console.log(`WABA ID: ${WABA_ID}`);
console.log(`Endpoint Base: ${ENDPOINT_BASE_URL}`);
console.log(`API Version: ${API_VERSION}\n`);

/**
 * List all flows for the WABA
 */
async function listFlows() {
  const url = `${BASE_URL}/${WABA_ID}/flows`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${ACCESS_TOKEN}`
    }
  });

  const data = await response.json();
  return data.data || [];
}

/**
 * Find existing flow by name
 */
async function findFlowByName(name) {
  const flows = await listFlows();
  return flows.find(f => f.name === name);
}

/**
 * Create a new flow (draft) or return existing flow ID
 */
async function createFlow(name, categories) {
  // Check if flow already exists
  const existingFlow = await findFlowByName(name);
  if (existingFlow) {
    console.log(`Flow already exists: ${name} (ID: ${existingFlow.id})`);
    return { flowId: existingFlow.id, isNew: false };
  }

  const url = `${BASE_URL}/${WABA_ID}/flows`;

  console.log(`Creating flow: ${name}...`);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${ACCESS_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: name,
      categories: categories
    })
  });

  const data = await response.json();

  if (!response.ok) {
    console.error(`ERROR creating flow:`, data);
    throw new Error(data.error?.message || 'Failed to create flow');
  }

  console.log(`  Flow created with ID: ${data.id}`);
  return { flowId: data.id, isNew: true };
}

/**
 * Upload flow JSON to an existing flow
 */
async function uploadFlowJson(flowId, flowJson) {
  const url = `${BASE_URL}/${flowId}/assets`;

  console.log(`Uploading flow JSON to flow ${flowId}...`);

  // Remove comments and metadata from flow JSON (Meta doesn't accept them)
  const cleanJson = { ...flowJson };
  delete cleanJson._comment;
  delete cleanJson._instructions;
  delete cleanJson._changelog;
  delete cleanJson._bead;
  delete cleanJson._notes;

  // Use native FormData with Blob for Node.js 18+
  const formData = new FormData();
  formData.append('name', 'flow.json');
  formData.append('asset_type', 'FLOW_JSON');

  // Create a Blob from the JSON string
  const jsonBlob = new Blob([JSON.stringify(cleanJson)], { type: 'application/json' });
  formData.append('file', jsonBlob, 'flow.json');

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${ACCESS_TOKEN}`
    },
    body: formData
  });

  const data = await response.json();

  if (!response.ok) {
    console.error(`ERROR uploading flow JSON:`, data);
    if (data.error?.error_user_msg) {
      console.error(`  User message: ${data.error.error_user_msg}`);
    }
    if (data.validation_errors) {
      console.error(`  Validation errors:`, JSON.stringify(data.validation_errors, null, 2));
    }
    throw new Error(data.error?.message || 'Failed to upload flow JSON');
  }

  if (data.validation_errors && data.validation_errors.length > 0) {
    console.warn(`  Validation warnings:`, data.validation_errors);
  }

  console.log(`  Flow JSON uploaded successfully`);
  return data;
}

/**
 * Publish a flow (make it live)
 */
async function publishFlow(flowId) {
  const url = `${BASE_URL}/${flowId}/publish`;

  console.log(`Publishing flow ${flowId}...`);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${ACCESS_TOKEN}`
    }
  });

  const data = await response.json();

  if (!response.ok) {
    console.error(`ERROR publishing flow:`, data);
    throw new Error(data.error?.message || 'Failed to publish flow');
  }

  console.log(`  Flow published successfully`);
  return data;
}

/**
 * Get flow details
 */
async function getFlowDetails(flowId) {
  const url = `${BASE_URL}/${flowId}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${ACCESS_TOKEN}`
    }
  });

  return await response.json();
}

/**
 * Set endpoint URI for a flow (required for data_api_version 3.0+)
 * API Reference: POST /{FLOW_ID} with endpoint_uri parameter
 */
async function setFlowEndpoint(flowId, endpointUri) {
  const url = `${BASE_URL}/${flowId}`;

  console.log(`Setting endpoint URI for flow ${flowId}...`);
  console.log(`  Endpoint: ${endpointUri}`);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${ACCESS_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      endpoint_uri: endpointUri
    })
  });

  const data = await response.json();

  if (!response.ok) {
    console.error(`ERROR setting endpoint URI:`, data);
    throw new Error(data.error?.message || 'Failed to set endpoint URI');
  }

  console.log(`  Endpoint URI set successfully`);
  return data;
}

/**
 * Main registration function
 */
async function main() {
  const flowsDir = path.join(__dirname, '../docs/flows');

  // Define flows to register
  // endpointPath is required for flows using data_api_version 3.0+
  const flows = [
    {
      name: 'Attendance Class Setup',
      file: 'attendance-setup-flow.json',
      categories: ['OTHER'],
      envVar: 'ATTENDANCE_SETUP_FLOW_ID',
      endpointPath: '/api/flows/attendance-setup'  // bd-215
    },
    {
      name: 'Attendance Marking',
      file: 'attendance-marking-flow.json',
      categories: ['OTHER'],
      envVar: 'ATTENDANCE_MARKING_FLOW_ID',
      endpointPath: '/api/flows/attendance-marking'
    }
  ];

  const results = [];

  for (const flow of flows) {
    console.log(`\n--- Processing: ${flow.name} ---`);

    try {
      // Read flow JSON
      const flowPath = path.join(flowsDir, flow.file);
      if (!fs.existsSync(flowPath)) {
        console.error(`ERROR: Flow file not found: ${flowPath}`);
        continue;
      }

      const flowJson = JSON.parse(fs.readFileSync(flowPath, 'utf8'));

      // Create the flow (or get existing)
      const { flowId, isNew } = await createFlow(flow.name, flow.categories);

      // Upload the flow JSON (updates existing flow if not new)
      await uploadFlowJson(flowId, flowJson);

      // Set endpoint URI for data_api_version 3.0+ flows
      if (flow.endpointPath) {
        const endpointUri = `${ENDPOINT_BASE_URL}${flow.endpointPath}`;
        await setFlowEndpoint(flowId, endpointUri);
      }

      // Publish the flow to make changes live
      await publishFlow(flowId);

      results.push({
        name: flow.name,
        flowId: flowId,
        envVar: flow.envVar,
        endpointPath: flow.endpointPath,
        status: 'PUBLISHED'
      });

      console.log(`  SUCCESS: ${flow.envVar}=${flowId}`);

    } catch (error) {
      console.error(`  FAILED: ${error.message}`);
      results.push({
        name: flow.name,
        error: error.message
      });
    }
  }

  // Summary
  console.log(`\n=== SUMMARY ===`);
  console.log(`Environment: ${isProduction ? 'PRODUCTION' : 'STAGING'}\n`);

  console.log(`Add these to your .env file:\n`);
  for (const result of results) {
    if (result.flowId) {
      console.log(`${result.envVar}=${result.flowId}`);
    }
  }

  console.log(`\n--- Results ---`);
  for (const result of results) {
    if (result.error) {
      console.log(`FAILED: ${result.name} - ${result.error}`);
    } else {
      console.log(`OK: ${result.name} (${result.status}) - ID: ${result.flowId}`);
      if (result.endpointPath) {
        console.log(`   Endpoint: ${ENDPOINT_BASE_URL}${result.endpointPath}`);
      }
    }
  }

  console.log(`\nNOTE: Flows are created as DRAFTS. To publish:`);
  console.log(`1. Review in Meta Business Manager > WhatsApp Manager > Flows`);
  console.log(`2. Or uncomment publishFlow() in this script and re-run`);
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
